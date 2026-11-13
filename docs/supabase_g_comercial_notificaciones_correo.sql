-- =============================================================================
-- Notificaciones por correo (Microsoft 365 / Graph) en esquema g_comercial
-- =============================================================================
-- Requiere: Esquema g_comercial desplegado (partes 1 y 2).
-- Repetible: sí. Destructivo: no.
--
-- Cómo funciona:
--  1. Cada aviso en g_comercial.notificaciones_envivo cuyo tipo esté activo en
--     g_comercial.notificaciones_correo_tipos se encola en g_comercial.notificaciones_correo.
--  2. La Edge Function "enviar-correos" toma lotes con g_comercial.claim_email_batch(),
--     envía con Microsoft Graph y registra el resultado con g_comercial.mark_email_result().
--  3. pg_cron llama a la Edge Function cada 2 minutos mediante pg_net.
--
-- Antes del paso 5 (pg_cron), registrar en Supabase > Vault:
--   correo_funcion_url   = https://<proyecto-id>.supabase.co/functions/v1/enviar-correos
--   correo_funcion_token = el mismo valor que CRON_TOKEN configurado en la Edge Function
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Tipos de aviso que también se envían por correo
-- -----------------------------------------------------------------------------
create table if not exists g_comercial.notificaciones_correo_tipos (
  tipo_evento text primary key,
  activo boolean not null default false,
  descripcion text not null default ''
);

alter table g_comercial.notificaciones_correo_tipos enable row level security;
revoke all on g_comercial.notificaciones_correo_tipos from public, anon;
grant select on g_comercial.notificaciones_correo_tipos to authenticated, service_role;

drop policy if exists notificaciones_correo_tipos_select on g_comercial.notificaciones_correo_tipos;
create policy notificaciones_correo_tipos_select
on g_comercial.notificaciones_correo_tipos for select
to authenticated
using (g_comercial.current_user_role() is not null);

insert into g_comercial.notificaciones_correo_tipos (tipo_evento, activo, descripcion) values
  ('DISENO_REVIEW',       true,  'Página aprobada o enviada a ajustes'),
  ('DISENO_STATE',        true,  'Cambio de estado de una página'),
  ('DISENO_IMAGE',        true,  'Nueva versión del arte para revisar'),
  ('DISENO_ASIGNACION',   true,  'Asignación de comprador o diseñador a una página'),
  ('DISENO_RESPUESTA',    true,  'Respuesta a una observación'),
  ('AVISO_CORTE',         true,  'Día de corte del catálogo'),
  ('CATALOGO_ESTADO',     true,  'Cambio de estado del catálogo'),
  ('ADMIN_DIFUSION',      true,  'Difusión del administrador'),
  ('DISENO_COMMENT',      false, 'Nueva observación en Diseño'),
  ('DISENO_RESOLVED',     false, 'Observación resuelta'),
  ('DISENO_REOPENED',     false, 'Observación reabierta'),
  ('CATALOGO_VIGENCIA',   false, 'Cambio de vigencia del catálogo'),
  ('COMENTARIO_COMPRAS',  false, 'Comentario de Compras en Consolidado')
on conflict (tipo_evento) do nothing;

-- -----------------------------------------------------------------------------
-- 2. Cola de correos pendientes y enviados
-- -----------------------------------------------------------------------------
create table if not exists g_comercial.notificaciones_correo (
  id uuid primary key default gen_random_uuid(),
  notificacion_id uuid unique,
  destinatario_usuario_id uuid not null references g_comercial.usuarios_app(id) on delete cascade,
  destinatario_email text not null,
  destinatario_nombre text not null default '',
  tipo_evento text not null,
  titulo text not null,
  mensaje text not null default '',
  actor_nombre text not null default '',
  url_modulo text not null default '',
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'enviando', 'enviado', 'error')),
  intentos smallint not null default 0,
  ultimo_error text not null default '',
  disponible_desde timestamptz not null default now(),
  created_at timestamptz not null default now(),
  enviado_at timestamptz
);

create index if not exists idx_notificaciones_correo_pendientes
  on g_comercial.notificaciones_correo (estado, disponible_desde);

alter table g_comercial.notificaciones_correo enable row level security;
revoke all on g_comercial.notificaciones_correo from public, anon;
grant select on g_comercial.notificaciones_correo to authenticated;
grant all on g_comercial.notificaciones_correo to service_role;

drop policy if exists notificaciones_correo_admin_select on g_comercial.notificaciones_correo;
create policy notificaciones_correo_admin_select
on g_comercial.notificaciones_correo for select
to authenticated
using (g_comercial.current_user_role() = 'ADMIN');

-- -----------------------------------------------------------------------------
-- 3. Trigger: aviso en vivo -> cola de correo
-- -----------------------------------------------------------------------------
create or replace function g_comercial.enqueue_email_notification()
returns trigger
language plpgsql
security definer
set search_path = g_comercial, public
as $$
begin
  begin
    insert into g_comercial.notificaciones_correo (
      notificacion_id, destinatario_usuario_id, destinatario_email, destinatario_nombre,
      tipo_evento, titulo, mensaje, actor_nombre, url_modulo
    )
    select new.id, u.id, lower(btrim(u.email)), coalesce(u.nombre, ''),
      new.tipo_evento, new.titulo, new.mensaje, new.actor_nombre, new.url_modulo
    from g_comercial.usuarios_app u
    join g_comercial.notificaciones_correo_tipos t
      on t.tipo_evento = new.tipo_evento and t.activo = true
    where u.id = new.destinatario_usuario_id
      and u.activo = true
      and position('@' in coalesce(u.email, '')) > 1
    on conflict (notificacion_id) do nothing;
  exception when others then
    raise warning 'No se pudo encolar el correo del aviso %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists enqueue_email_notification on g_comercial.notificaciones_envivo;
create trigger enqueue_email_notification
after insert on g_comercial.notificaciones_envivo
for each row execute function g_comercial.enqueue_email_notification();

-- -----------------------------------------------------------------------------
-- 4. Funciones RPC para la Edge Function (service_role)
-- -----------------------------------------------------------------------------
create or replace function g_comercial.claim_email_batch(p_limit integer default 25)
returns setof g_comercial.notificaciones_correo
language plpgsql
security definer
set search_path = g_comercial, public
as $$
begin
  return query
  update g_comercial.notificaciones_correo c
  set estado = 'enviando',
      intentos = c.intentos + 1,
      disponible_desde = now() + interval '10 minutes'
  where c.id in (
    select id from g_comercial.notificaciones_correo
    where (estado = 'pendiente' and disponible_desde <= now())
       or (estado = 'enviando' and disponible_desde <= now())
    order by created_at
    limit greatest(1, least(coalesce(p_limit, 25), 100))
    for update skip locked
  )
  returning c.*;
end;
$$;

create or replace function g_comercial.mark_email_result(
  p_id uuid,
  p_ok boolean,
  p_error text default '',
  p_retry boolean default true
)
returns void
language plpgsql
security definer
set search_path = g_comercial, public
as $$
begin
  update g_comercial.notificaciones_correo c
  set estado = case
        when p_ok then 'enviado'
        when p_retry and c.intentos < 5 then 'pendiente'
        else 'error'
      end,
      enviado_at = case when p_ok then now() else c.enviado_at end,
      ultimo_error = case when p_ok then '' else left(coalesce(p_error, ''), 1000) end,
      disponible_desde = case
        when p_ok then c.disponible_desde
        else now() + make_interval(mins => power(2, greatest(c.intentos, 1))::int)
      end
  where c.id = p_id;
end;
$$;

revoke all on function g_comercial.claim_email_batch(integer) from public, anon, authenticated;
revoke all on function g_comercial.mark_email_result(uuid, boolean, text, boolean) from public, anon, authenticated;
grant execute on function g_comercial.claim_email_batch(integer) to service_role;
grant execute on function g_comercial.mark_email_result(uuid, boolean, text, boolean) to service_role;

create or replace function g_comercial.cleanup_email_notifications()
returns integer
language sql
security definer
set search_path = g_comercial, public
as $$
  with borrados as (
    delete from g_comercial.notificaciones_correo
    where estado = 'enviado' and enviado_at < now() - interval '90 days'
    returning 1
  )
  select count(*)::integer from borrados;
$$;
revoke all on function g_comercial.cleanup_email_notifications() from public, anon, authenticated;

commit;

-- -----------------------------------------------------------------------------
-- 5. Programación pg_cron + pg_net + Vault
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'Habilite pg_cron y pg_net (Database > Extensions) y vuelva a ejecutar este script para programar el envío.';
    return;
  end if;
  if (select count(*) from vault.decrypted_secrets
      where name in ('correo_funcion_url', 'correo_funcion_token')) < 2 then
    raise notice 'Cree en Vault los secretos correo_funcion_url y correo_funcion_token y vuelva a ejecutar este script.';
    return;
  end if;

  perform cron.unschedule(jobid) from cron.job
  where jobname in ('notificaciones-correo-envio', 'notificaciones-correo-limpieza');

  perform cron.schedule(
    'notificaciones-correo-envio',
    '*/2 * * * *',
    $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'correo_funcion_url'),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'correo_funcion_token')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 55000
      )
      where exists (
        select 1 from g_comercial.notificaciones_correo
        where estado in ('pendiente', 'enviando') and disponible_desde <= now()
      );
    $job$
  );

  perform cron.schedule('notificaciones-correo-limpieza', '40 8 * * *', 'select g_comercial.cleanup_email_notifications()');
end
$$;
