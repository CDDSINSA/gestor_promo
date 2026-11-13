-- =============================================================================
-- Paso 31. Notificaciones por correo (Microsoft 365 / Graph) a partir de los
-- avisos en vivo.
-- =============================================================================
-- Requiere: supabase_live_notifications.sql y supabase_notificaciones_v2.sql (paso 29).
-- Repetible: sí. Destructivo: no (solo crea tablas, funciones, un trigger y una tarea).
-- No cambia los avisos en vivo existentes ni sus destinatarios.
--
-- Cómo funciona:
--  1. Cada aviso nuevo en notificaciones_envivo cuyo tipo esté activo en
--     notificaciones_correo_tipos se copia a la cola notificaciones_correo
--     (un correo por destinatario). Un fallo aquí nunca revierte el aviso.
--  2. La Edge Function "enviar-correos" toma lotes de la cola con
--     claim_email_batch(), envía con Microsoft Graph y registra el resultado
--     con mark_email_result(). Reintenta hasta 5 veces con espera creciente.
--  3. pg_cron llama a la función cada 2 minutos mediante pg_net (sección 5).
--
-- Antes de la sección 5 crear en Supabase > Vault (Integrations o Project Settings) dos secretos:
--   correo_funcion_url   = https://<proyecto>.supabase.co/functions/v1/enviar-correos
--   correo_funcion_token = el mismo valor que CRON_TOKEN de la Edge Function
-- Guía completa: docs/notificaciones_correo.md
-- Si faltan pg_cron, pg_net o los secretos, el script instala lo demás y avisa con NOTICE.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Tipos de aviso que también se envían por correo.
-- -----------------------------------------------------------------------------
create table if not exists public.notificaciones_correo_tipos (
  tipo_evento text primary key,
  activo boolean not null default false,
  descripcion text not null default ''
);

alter table public.notificaciones_correo_tipos enable row level security;
revoke all on public.notificaciones_correo_tipos from public, anon, authenticated;
grant select on public.notificaciones_correo_tipos to authenticated;

drop policy if exists notificaciones_correo_tipos_select on public.notificaciones_correo_tipos;
create policy notificaciones_correo_tipos_select
on public.notificaciones_correo_tipos for select
to authenticated
using (public.current_user_role() is not null);

-- Por defecto solo avisos que piden una acción. No sobrescribe cambios manuales.
insert into public.notificaciones_correo_tipos (tipo_evento, activo, descripcion) values
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
  ('COMENTARIO_COMPRAS',  false, 'Comentario de Compras en Consolidado'),
  ('COMENTARIO_MERCADEO', false, 'Comentario de Mercadeo en Consolidado'),
  ('PROMOCION_AGREGADA',  false, 'Promociones agregadas'),
  ('PROMOCION_ACTUALIZADA', false, 'Promociones modificadas'),
  ('PROMOCION_ANULADA',   false, 'Promociones anuladas'),
  ('PROMOCION_ELIMINADA', false, 'Promociones eliminadas')
on conflict (tipo_evento) do nothing;

-- -----------------------------------------------------------------------------
-- 2. Cola de correos. Guarda una copia del aviso: la limpieza de avisos en vivo
--    (30/90 días) no afecta el historial de envíos.
-- -----------------------------------------------------------------------------
create table if not exists public.notificaciones_correo (
  id uuid primary key default gen_random_uuid(),
  notificacion_id uuid unique,
  destinatario_usuario_id uuid references public.usuarios_app(id) on delete set null,
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
  on public.notificaciones_correo (estado, disponible_desde);

alter table public.notificaciones_correo enable row level security;
revoke all on public.notificaciones_correo from public, anon, authenticated;
-- Solo ADMIN puede consultar la cola (monitoreo). Nadie la modifica desde el navegador.
grant select on public.notificaciones_correo to authenticated;
drop policy if exists notificaciones_correo_admin_select on public.notificaciones_correo;
create policy notificaciones_correo_admin_select
on public.notificaciones_correo for select
to authenticated
using (public.current_user_role() = 'ADMIN');

-- -----------------------------------------------------------------------------
-- 3. Trigger: aviso en vivo -> cola de correo.
-- -----------------------------------------------------------------------------
create or replace function public.enqueue_email_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into public.notificaciones_correo (
      notificacion_id, destinatario_usuario_id, destinatario_email, destinatario_nombre,
      tipo_evento, titulo, mensaje, actor_nombre, url_modulo
    )
    select new.id, u.id, lower(btrim(u.email)), coalesce(u.nombre, ''),
      new.tipo_evento, new.titulo, new.mensaje, new.actor_nombre, new.url_modulo
    from public.usuarios_app u
    join public.notificaciones_correo_tipos t
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

drop trigger if exists enqueue_email_notification on public.notificaciones_envivo;
create trigger enqueue_email_notification
after insert on public.notificaciones_envivo
for each row execute function public.enqueue_email_notification();

-- -----------------------------------------------------------------------------
-- 4. Funciones para la Edge Function (solo service_role).
-- -----------------------------------------------------------------------------
-- Toma un lote de pendientes. Recupera los que quedaron "enviando" más de 10 min
-- (por ejemplo, si la función se cortó a mitad de un envío).
create or replace function public.claim_email_batch(p_limit integer default 25)
returns setof public.notificaciones_correo
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.notificaciones_correo c
  set estado = 'enviando',
      intentos = c.intentos + 1,
      disponible_desde = now() + interval '10 minutes'
  where c.id in (
    select id from public.notificaciones_correo
    where (estado = 'pendiente' and disponible_desde <= now())
       or (estado = 'enviando' and disponible_desde <= now())
    order by created_at
    limit greatest(1, least(coalesce(p_limit, 25), 100))
    for update skip locked
  )
  returning c.*;
end;
$$;

-- Registra el resultado. Los errores temporales se reintentan hasta 5 veces
-- (esperas de 2, 4, 8 y 16 minutos); los definitivos quedan en 'error'.
create or replace function public.mark_email_result(
  p_id uuid,
  p_ok boolean,
  p_error text default '',
  p_retry boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notificaciones_correo c
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

revoke all on function public.claim_email_batch(integer) from public, anon, authenticated;
revoke all on function public.mark_email_result(uuid, boolean, text, boolean) from public, anon, authenticated;
grant execute on function public.claim_email_batch(integer) to service_role;
grant execute on function public.mark_email_result(uuid, boolean, text, boolean) to service_role;
grant select, update on public.notificaciones_correo to service_role;

-- Limpieza: borra correos enviados con más de 90 días.
create or replace function public.cleanup_email_notifications()
returns integer
language sql
security definer
set search_path = public
as $$
  with borrados as (
    delete from public.notificaciones_correo
    where estado = 'enviado' and enviado_at < now() - interval '90 days'
    returning 1
  )
  select count(*)::integer from borrados;
$$;
revoke all on function public.cleanup_email_notifications() from public, anon, authenticated;

commit;

-- -----------------------------------------------------------------------------
-- 5. Tareas programadas (pg_cron + pg_net + Vault). Fuera de la transacción para
--    que un faltante no impida instalar lo anterior.
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
        select 1 from public.notificaciones_correo
        where estado in ('pendiente', 'enviando') and disponible_desde <= now()
      );
    $job$
  );

  perform cron.schedule('notificaciones-correo-limpieza', '40 8 * * *', 'select public.cleanup_email_notifications()');
end
$$;

-- -----------------------------------------------------------------------------
-- Consultas útiles
-- -----------------------------------------------------------------------------
-- Activar o desactivar un tipo:
--   update public.notificaciones_correo_tipos set activo = false where tipo_evento = 'DISENO_STATE';
-- Estado de la cola:
--   select estado, count(*) from public.notificaciones_correo group by estado;
-- Últimos errores:
--   select created_at, destinatario_email, tipo_evento, intentos, ultimo_error
--   from public.notificaciones_correo where estado = 'error' order by created_at desc limit 20;
-- Reintentar los que fallaron:
--   update public.notificaciones_correo set estado = 'pendiente', intentos = 0, disponible_desde = now()
--   where estado = 'error';
-- Pausar el envío:      select cron.unschedule('notificaciones-correo-envio');
