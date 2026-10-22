-- =============================================================================
-- Paso 32. Destinatarios configurables (roles, grupos y comprador dueño) y avisos
-- de Solicitudes especiales y Fidelización.
-- =============================================================================
-- Requiere: supabase_notificaciones_v2.sql (paso 29: notify_users, role_user_ids,
-- buyer_user_ids). Opcional: supabase_notificaciones_correo.sql (paso 31); si ya
-- está instalado, los nuevos tipos quedan activos para correo.
-- Repetible: sí. Destructivo: no. No cambia los destinatarios de los avisos existentes
-- (Diseño, promociones, catálogos): solo se aplica a los tipos de este script.
--
-- Por qué grupos: los destinatarios se configuran en Ajustes > Notificaciones con
-- roles, grupos de usuarios de la app y el "comprador dueño" de la solicitud. No se
-- escriben correos en el código; el correo sale del perfil de cada usuario.
--
-- Eventos nuevos (los genera la base de datos, sin cambios en el navegador):
--   SOLICITUD_NUEVA / FIDELIZACION_NUEVA     al crear una solicitud especial / de Fidelización.
--   SOLICITUD_ESTADO / FIDELIZACION_ESTADO   al cambiar su estado (Nuevo, Aprobado, En trabajo,
--                                            Finalizado, Archivado) en el tablero de estados.
-- Configuración inicial:
--   *_NUEVA  -> rol Ejecutor (OPER) + grupo "Supervisión de solicitudes"
--   *_ESTADO -> comprador dueño + grupo "Supervisión de solicitudes"
-- El grupo se crea vacío: agregar sus miembros en Ajustes > Notificaciones.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Catálogo de eventos configurables, grupos y suscripciones.
-- -----------------------------------------------------------------------------
create table if not exists public.notificaciones_eventos (
  tipo_evento text primary key,
  etiqueta text not null,
  descripcion text not null default '',
  admite_dueno boolean not null default true,
  orden smallint not null default 0
);

create table if not exists public.notificaciones_grupos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (length(btrim(nombre)) > 0),
  descripcion text not null default '',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notificaciones_grupo_miembros (
  grupo_id uuid not null references public.notificaciones_grupos(id) on delete cascade,
  usuario_id uuid not null references public.usuarios_app(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (grupo_id, usuario_id)
);

-- destino_tipo: ROL (destino_rol), GRUPO (grupo_id) o DUENO (comprador dueño de la solicitud).
create table if not exists public.notificaciones_suscripciones (
  id uuid primary key default gen_random_uuid(),
  tipo_evento text not null references public.notificaciones_eventos(tipo_evento) on delete cascade,
  destino_tipo text not null check (destino_tipo in ('ROL', 'GRUPO', 'DUENO')),
  destino_rol text,
  grupo_id uuid references public.notificaciones_grupos(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint notificaciones_suscripciones_destino check (
    (destino_tipo = 'ROL' and destino_rol is not null and grupo_id is null)
    or (destino_tipo = 'GRUPO' and grupo_id is not null and destino_rol is null)
    or (destino_tipo = 'DUENO' and destino_rol is null and grupo_id is null)
  )
);

create unique index if not exists idx_notificaciones_suscripciones_unica
  on public.notificaciones_suscripciones (tipo_evento, destino_tipo, coalesce(destino_rol, ''), coalesce(grupo_id::text, ''));

-- Solo se administran mediante las RPC de la sección 4 (ADMIN).
alter table public.notificaciones_eventos enable row level security;
alter table public.notificaciones_grupos enable row level security;
alter table public.notificaciones_grupo_miembros enable row level security;
alter table public.notificaciones_suscripciones enable row level security;
revoke all on public.notificaciones_eventos, public.notificaciones_grupos,
  public.notificaciones_grupo_miembros, public.notificaciones_suscripciones
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Datos iniciales (no sobrescribe cambios hechos desde Ajustes).
-- -----------------------------------------------------------------------------
insert into public.notificaciones_eventos (tipo_evento, etiqueta, descripcion, admite_dueno, orden) values
  ('SOLICITUD_NUEVA',     'Nueva solicitud especial',            'Un comprador crea una solicitud especial.', true, 10),
  ('SOLICITUD_ESTADO',    'Cambio de estado: solicitud especial', 'Se mueve una solicitud especial en el tablero de estados.', true, 20),
  ('FIDELIZACION_NUEVA',  'Nueva solicitud de Fidelización',     'Un comprador crea una solicitud de cambio de Fidelización.', true, 30),
  ('FIDELIZACION_ESTADO', 'Cambio de estado: Fidelización',      'Se mueve una solicitud de Fidelización en el tablero de estados.', true, 40)
on conflict (tipo_evento) do update set
  etiqueta = excluded.etiqueta, descripcion = excluded.descripcion,
  admite_dueno = excluded.admite_dueno, orden = excluded.orden;

insert into public.notificaciones_grupos (nombre, descripcion)
values ('Supervisión de solicitudes', 'Recibe avisos de solicitudes especiales y de Fidelización.')
on conflict (nombre) do nothing;

-- Suscripciones iniciales solo si el evento aún no tiene ninguna configurada.
insert into public.notificaciones_suscripciones (tipo_evento, destino_tipo, destino_rol, grupo_id)
select e.tipo_evento, d.destino_tipo, d.destino_rol,
  case when d.destino_tipo = 'GRUPO' then g.id end
from public.notificaciones_eventos e
cross join lateral (values
  ('ROL', 'OPER', e.tipo_evento like '%_NUEVA'),
  ('DUENO', null, e.tipo_evento like '%_ESTADO'),
  ('GRUPO', null, true)
) as d(destino_tipo, destino_rol, aplica)
join public.notificaciones_grupos g on g.nombre = 'Supervisión de solicitudes'
where e.tipo_evento in ('SOLICITUD_NUEVA', 'SOLICITUD_ESTADO', 'FIDELIZACION_NUEVA', 'FIDELIZACION_ESTADO')
  and d.aplica
  and not exists (select 1 from public.notificaciones_suscripciones s where s.tipo_evento = e.tipo_evento);

-- -----------------------------------------------------------------------------
-- 3. Resolución de destinatarios y trigger de solicitudes.
-- -----------------------------------------------------------------------------
create or replace function public.subscription_user_ids(p_tipo_evento text, p_owner_ids uuid[] default null)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct u.id), array[]::uuid[])
  from public.usuarios_app u
  where u.activo = true
    and exists (
      select 1 from public.notificaciones_suscripciones s
      left join public.notificaciones_grupos g on g.id = s.grupo_id
      where s.tipo_evento = p_tipo_evento
        and (
          (s.destino_tipo = 'ROL' and upper(u.rol) = upper(s.destino_rol))
          or (s.destino_tipo = 'GRUPO' and g.activo = true and exists (
                select 1 from public.notificaciones_grupo_miembros m
                where m.grupo_id = s.grupo_id and m.usuario_id = u.id))
          or (s.destino_tipo = 'DUENO' and u.id = any(coalesce(p_owner_ids, array[]::uuid[])))
        )
    );
$$;
revoke all on function public.subscription_user_ids(text, uuid[]) from public, anon, authenticated;

create or replace function public.notify_special_request_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fid boolean := coalesce(new.legacy_actividad_id, '') like 'FID-%';
  v_nombre text := coalesce(nullif(btrim(new.nombre_actividad), ''), new.legacy_actividad_id);
  v_comprador text := coalesce(nullif(btrim(new.comprador), ''), 'Un comprador');
  v_estado_anterior text;
  v_estado text := replace(coalesce(new.estado, ''), 'Aprovado', 'Aprobado');
  v_owner uuid[];
  v_tipo text;
  v_titulo text;
  v_mensaje text;
begin
  if new.tipo_actividad <> 'ESPECIAL' then
    return new;
  end if;

  v_owner := public.buyer_user_ids(array_remove(array[new.solicitante_buyer_id], null));

  if tg_op = 'INSERT' then
    v_tipo := case when v_fid then 'FIDELIZACION_NUEVA' else 'SOLICITUD_NUEVA' end;
    v_titulo := case when v_fid then 'Nueva solicitud de Fidelización' else 'Nueva solicitud especial' end;
    v_mensaje := format('%s creó la solicitud «%s» (%s).', v_comprador, v_nombre, new.legacy_actividad_id);
  else
    v_estado_anterior := replace(coalesce(old.estado, ''), 'Aprovado', 'Aprobado');
    if v_estado_anterior = v_estado then
      return new;
    end if;
    v_tipo := case when v_fid then 'FIDELIZACION_ESTADO' else 'SOLICITUD_ESTADO' end;
    v_titulo := format('Solicitud %s: %s', case when v_fid then 'de Fidelización' else 'especial' end, v_estado);
    v_mensaje := format('La solicitud «%s» (%s) pasó de %s a %s.', v_nombre, new.legacy_actividad_id,
      coalesce(nullif(v_estado_anterior, ''), '—'), v_estado);
  end if;

  perform public.notify_users(
    public.subscription_user_ids(v_tipo, v_owner),
    v_tipo, v_titulo, v_mensaje, new.id,
    case when v_fid then 'fidelizacion' else 'solicitudes' end,
    jsonb_build_object('actividadId', new.legacy_actividad_id, 'estado', v_estado, 'estadoAnterior', v_estado_anterior),
    null, null,
    false -- las solicitudes no dependen del interruptor de avisos de catálogo
  );
  return new;
exception when others then
  -- Un fallo del aviso nunca debe revertir la creación o el cambio de estado.
  raise warning 'notify_special_request_change: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists notify_special_request_insert on public.campanas;
create trigger notify_special_request_insert
  after insert on public.campanas
  for each row
  when (new.tipo_actividad = 'ESPECIAL')
  execute function public.notify_special_request_change();

drop trigger if exists notify_special_request_state on public.campanas;
create trigger notify_special_request_state
  after update of estado on public.campanas
  for each row
  when (new.tipo_actividad = 'ESPECIAL' and old.estado is distinct from new.estado)
  execute function public.notify_special_request_change();

-- -----------------------------------------------------------------------------
-- 4. RPC de administración (solo ADMIN) usadas por Ajustes > Notificaciones.
-- -----------------------------------------------------------------------------
create or replace function public.assert_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.current_user_role() is distinct from 'ADMIN' then
    raise exception 'Solo Administrador puede configurar notificaciones.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.assert_admin() from public, anon, authenticated;

create or replace function public.get_notification_routing()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_correo jsonb := '{}'::jsonb;
begin
  perform public.assert_admin();
  if to_regclass('public.notificaciones_correo_tipos') is not null then
    execute 'select coalesce(jsonb_object_agg(tipo_evento, activo), ''{}''::jsonb) from public.notificaciones_correo_tipos'
      into v_correo;
  end if;
  return jsonb_build_object(
    'eventos', (select coalesce(jsonb_agg(to_jsonb(e) order by e.orden, e.etiqueta), '[]'::jsonb) from public.notificaciones_eventos e),
    'grupos', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', g.id, 'nombre', g.nombre, 'descripcion', g.descripcion, 'activo', g.activo,
        'miembros', (select coalesce(jsonb_agg(m.usuario_id), '[]'::jsonb) from public.notificaciones_grupo_miembros m where m.grupo_id = g.id)
      ) order by g.nombre), '[]'::jsonb) from public.notificaciones_grupos g),
    'suscripciones', (select coalesce(jsonb_agg(jsonb_build_object(
        'tipo_evento', s.tipo_evento, 'destino_tipo', s.destino_tipo, 'destino_rol', s.destino_rol, 'grupo_id', s.grupo_id
      )), '[]'::jsonb) from public.notificaciones_suscripciones s),
    'usuarios', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', u.id, 'nombre', u.nombre, 'email', u.email, 'rol', u.rol, 'activo', u.activo
      ) order by u.nombre), '[]'::jsonb) from public.usuarios_app u),
    'correo', v_correo
  );
end;
$$;

create or replace function public.save_notification_group(
  p_id uuid, p_nombre text, p_descripcion text, p_activo boolean, p_miembros uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := p_id;
begin
  perform public.assert_admin();
  if nullif(btrim(coalesce(p_nombre, '')), '') is null then
    raise exception 'El grupo necesita un nombre.';
  end if;
  if v_id is null then
    insert into public.notificaciones_grupos (nombre, descripcion, activo)
    values (btrim(p_nombre), coalesce(p_descripcion, ''), coalesce(p_activo, true))
    returning id into v_id;
  else
    update public.notificaciones_grupos
    set nombre = btrim(p_nombre), descripcion = coalesce(p_descripcion, ''),
        activo = coalesce(p_activo, true), updated_at = now()
    where id = v_id;
    if not found then raise exception 'Grupo no encontrado.'; end if;
  end if;
  delete from public.notificaciones_grupo_miembros
  where grupo_id = v_id and usuario_id <> all(coalesce(p_miembros, array[]::uuid[]));
  insert into public.notificaciones_grupo_miembros (grupo_id, usuario_id)
  select v_id, u.id from public.usuarios_app u
  where u.id = any(coalesce(p_miembros, array[]::uuid[]))
  on conflict do nothing;
  return v_id;
exception when unique_violation then
  raise exception 'Ya existe un grupo con ese nombre.';
end;
$$;

create or replace function public.delete_notification_group(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();
  delete from public.notificaciones_grupos where id = p_id;
end;
$$;

-- Reemplaza todos los destinatarios de un evento y, si existe la cola de correo,
-- activa o desactiva su envío por correo.
create or replace function public.set_notification_subscriptions(
  p_tipo_evento text, p_roles text[], p_grupos uuid[], p_dueno boolean, p_correo boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();
  if not exists (select 1 from public.notificaciones_eventos where tipo_evento = p_tipo_evento) then
    raise exception 'Evento no configurable: %', p_tipo_evento;
  end if;
  delete from public.notificaciones_suscripciones where tipo_evento = p_tipo_evento;
  insert into public.notificaciones_suscripciones (tipo_evento, destino_tipo, destino_rol)
  select distinct p_tipo_evento, 'ROL', upper(btrim(r))
  from unnest(coalesce(p_roles, array[]::text[])) as r
  where upper(btrim(r)) in ('ADMIN', 'BUYER', 'MARK', 'OPER', 'AUD', 'DISENADOR');
  insert into public.notificaciones_suscripciones (tipo_evento, destino_tipo, grupo_id)
  select distinct p_tipo_evento, 'GRUPO', g.id
  from public.notificaciones_grupos g where g.id = any(coalesce(p_grupos, array[]::uuid[]));
  if coalesce(p_dueno, false) then
    insert into public.notificaciones_suscripciones (tipo_evento, destino_tipo) values (p_tipo_evento, 'DUENO');
  end if;
  if p_correo is not null and to_regclass('public.notificaciones_correo_tipos') is not null then
    execute 'insert into public.notificaciones_correo_tipos (tipo_evento, activo, descripcion)
             select $1, $2, etiqueta from public.notificaciones_eventos where tipo_evento = $1
             on conflict (tipo_evento) do update set activo = excluded.activo'
      using p_tipo_evento, p_correo;
  end if;
end;
$$;

revoke all on function public.get_notification_routing() from public, anon;
revoke all on function public.save_notification_group(uuid, text, text, boolean, uuid[]) from public, anon;
revoke all on function public.delete_notification_group(uuid) from public, anon;
revoke all on function public.set_notification_subscriptions(text, text[], uuid[], boolean, boolean) from public, anon;
grant execute on function public.get_notification_routing() to authenticated;
grant execute on function public.save_notification_group(uuid, text, text, boolean, uuid[]) to authenticated;
grant execute on function public.delete_notification_group(uuid) to authenticated;
grant execute on function public.set_notification_subscriptions(text, text[], uuid[], boolean, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Correo: si el paso 31 está instalado, los nuevos tipos se envían por correo.
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.notificaciones_correo_tipos') is not null then
    insert into public.notificaciones_correo_tipos (tipo_evento, activo, descripcion)
    select tipo_evento, true, etiqueta from public.notificaciones_eventos
    on conflict (tipo_evento) do nothing;
  end if;
end
$$;

commit;

-- Verificación: con sesión de ADMIN
--   select public.get_notification_routing();
-- Destinatarios calculados para un evento (sin dueño):
--   select u.nombre, u.email from public.usuarios_app u
--   where u.id = any(public.subscription_user_ids('SOLICITUD_NUEVA'));
