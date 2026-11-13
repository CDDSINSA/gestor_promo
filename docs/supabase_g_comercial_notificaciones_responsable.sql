-- =====================================================================
-- supabase_g_comercial_notificaciones_responsable.sql
-- Avisos (campana y correo) al responsable asignado de una solicitud especial.
--
-- Antes: Ajustes > Notificaciones solo permitía elegir roles, grupos y el
-- comprador dueño. El responsable (Ejecutor/Admin asignado en el tablero) no
-- recibía los cambios de estado de sus solicitudes salvo que se avisara a todo
-- su rol.
--
-- Qué agrega:
--   * Destino nuevo "RESPONSABLE" en notificaciones_suscripciones y columna
--     notificaciones_eventos.admite_responsable (true en SOLICITUD_ESTADO y
--     FIDELIZACION_ESTADO).
--   * El responsable se identifica por nombre: campanas.responsable debe
--     coincidir (sin mayúsculas ni espacios extra) con usuarios_app.nombre de un
--     usuario activo ADMIN u OPER. La lista de Responsable de la app ya sale de
--     esos usuarios (supabase_g_comercial_responsables_especiales.sql).
--   * notify_special_request_change:
--       - cambio de estado: el responsable recibe el aviso si el evento lo tiene
--         marcado (igual que el comprador dueño);
--       - cambio de responsable sin cambio de estado (reasignación): aviso
--         «Solicitud asignada» solo al nuevo responsable, con el mismo tipo de
--         evento, así que usa la misma casilla y el mismo interruptor de correo.
--     El autor del cambio nunca recibe su propio aviso (notify_users).
--   * set_notification_subscriptions acepta p_responsable. Si llega null
--     (frontend anterior), conserva lo que ya estaba configurado.
--   * Primera instalación: marca "Responsable asignado" en los dos eventos de
--     cambio de estado. Al repetir el script no se vuelve a marcar.
--
-- Esquema: g_comercial.
-- Requiere: supabase_g_comercial_consolidado.sql (pasos 1–41; incluye
-- supabase_notificaciones_grupos.sql). Opcional: correo (paso 31).
-- Repetible: sí. Destructivo: no (no borra datos; reemplaza funciones y el trigger
-- de estado de solicitudes). Si se vuelve a ejecutar el consolidado, ejecutar
-- este script otra vez.
-- =====================================================================
begin;

-- 1) Destino RESPONSABLE en suscripciones.
do $$
declare
  v_con record;
begin
  for v_con in
    select conname from pg_constraint
    where conrelid = 'g_comercial.notificaciones_suscripciones'::regclass and contype = 'c'
  loop
    execute format('alter table g_comercial.notificaciones_suscripciones drop constraint %I', v_con.conname);
  end loop;
end
$$;

alter table g_comercial.notificaciones_suscripciones
  add constraint notificaciones_suscripciones_destino_tipo_check
    check (destino_tipo in ('ROL', 'GRUPO', 'DUENO', 'RESPONSABLE')),
  add constraint notificaciones_suscripciones_destino check (
    (destino_tipo = 'ROL' and destino_rol is not null and grupo_id is null)
    or (destino_tipo = 'GRUPO' and grupo_id is not null and destino_rol is null)
    or (destino_tipo in ('DUENO', 'RESPONSABLE') and destino_rol is null and grupo_id is null)
  );

-- 2) Qué eventos admiten responsable. La suscripción inicial se crea solo la
--    primera vez (cuando se agrega la columna), para no deshacer cambios de Ajustes.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'g_comercial' and table_name = 'notificaciones_eventos' and column_name = 'admite_responsable'
  ) then
    alter table g_comercial.notificaciones_eventos add column admite_responsable boolean not null default false;
    insert into g_comercial.notificaciones_suscripciones (tipo_evento, destino_tipo)
    select e.tipo_evento, 'RESPONSABLE' from g_comercial.notificaciones_eventos e
    where e.tipo_evento in ('SOLICITUD_ESTADO', 'FIDELIZACION_ESTADO')
      and not exists (select 1 from g_comercial.notificaciones_suscripciones s
                      where s.tipo_evento = e.tipo_evento and s.destino_tipo = 'RESPONSABLE');
  end if;
end
$$;

update g_comercial.notificaciones_eventos
set admite_responsable = (tipo_evento in ('SOLICITUD_ESTADO', 'FIDELIZACION_ESTADO'));

-- 3) Usuarios responsables de una solicitud (por nombre, solo ADMIN/OPER activos).
create or replace function g_comercial.special_request_responsable_ids(p_responsable text)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(u.id), array[]::uuid[])
  from g_comercial.usuarios_app u
  where nullif(btrim(coalesce(p_responsable, '')), '') is not null
    and u.activo = true
    and u.rol in ('ADMIN', 'OPER')
    and lower(btrim(u.nombre)) = lower(btrim(p_responsable));
$$;
revoke all on function g_comercial.special_request_responsable_ids(text) from public, anon, authenticated;

-- 4) Resolución de destinatarios con responsable. Se reemplaza la versión de dos
--    parámetros para evitar llamadas ambiguas.
drop function if exists g_comercial.subscription_user_ids(text, uuid[]);
create or replace function g_comercial.subscription_user_ids(
  p_tipo_evento text, p_owner_ids uuid[] default null, p_responsable_ids uuid[] default null
)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct u.id), array[]::uuid[])
  from g_comercial.usuarios_app u
  where u.activo = true
    and exists (
      select 1 from g_comercial.notificaciones_suscripciones s
      left join g_comercial.notificaciones_grupos g on g.id = s.grupo_id
      where s.tipo_evento = p_tipo_evento
        and (
          (s.destino_tipo = 'ROL' and upper(u.rol) = upper(s.destino_rol))
          or (s.destino_tipo = 'GRUPO' and g.activo = true and exists (
                select 1 from g_comercial.notificaciones_grupo_miembros m
                where m.grupo_id = s.grupo_id and m.usuario_id = u.id))
          or (s.destino_tipo = 'DUENO' and u.id = any(coalesce(p_owner_ids, array[]::uuid[])))
          or (s.destino_tipo = 'RESPONSABLE' and u.id = any(coalesce(p_responsable_ids, array[]::uuid[])))
        )
    );
$$;
revoke all on function g_comercial.subscription_user_ids(text, uuid[], uuid[]) from public, anon, authenticated;

-- 5) Trigger de solicitudes: estado + reasignación de responsable.
create or replace function g_comercial.notify_special_request_change()
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
  v_responsable text := nullif(btrim(coalesce(new.responsable, '')), '');
  v_owner uuid[];
  v_responsables uuid[];
  v_destinatarios uuid[];
  v_tipo text;
  v_titulo text;
  v_mensaje text;
begin
  if new.tipo_actividad <> 'ESPECIAL' then
    return new;
  end if;

  v_owner := g_comercial.buyer_user_ids(array_remove(array[new.solicitante_buyer_id], null));
  v_responsables := g_comercial.special_request_responsable_ids(v_responsable);

  if tg_op = 'INSERT' then
    v_tipo := case when v_fid then 'FIDELIZACION_NUEVA' else 'SOLICITUD_NUEVA' end;
    v_titulo := case when v_fid then 'Nueva solicitud de Fidelización' else 'Nueva solicitud especial' end;
    v_mensaje := format('%s creó la solicitud «%s» (%s).', v_comprador, v_nombre, new.legacy_actividad_id);
    v_destinatarios := g_comercial.subscription_user_ids(v_tipo, v_owner, v_responsables);
  else
    v_tipo := case when v_fid then 'FIDELIZACION_ESTADO' else 'SOLICITUD_ESTADO' end;
    v_estado_anterior := replace(coalesce(old.estado, ''), 'Aprovado', 'Aprobado');
    if v_estado_anterior <> v_estado then
      v_titulo := format('Solicitud %s: %s', case when v_fid then 'de Fidelización' else 'especial' end, v_estado);
      v_mensaje := format('La solicitud «%s» (%s) pasó de %s a %s.%s', v_nombre, new.legacy_actividad_id,
        coalesce(nullif(v_estado_anterior, ''), '—'), v_estado,
        case when v_responsable is not null then format(' Responsable: %s.', v_responsable) else '' end);
      v_destinatarios := g_comercial.subscription_user_ids(v_tipo, v_owner, v_responsables);
    elsif v_responsable is not null
      and lower(v_responsable) is distinct from lower(nullif(btrim(coalesce(old.responsable, '')), ''))
      and exists (select 1 from g_comercial.notificaciones_suscripciones s
                  where s.tipo_evento = v_tipo and s.destino_tipo = 'RESPONSABLE') then
      -- Reasignación sin cambio de estado: solo al nuevo responsable.
      v_titulo := format('Solicitud %s asignada', case when v_fid then 'de Fidelización' else 'especial' end);
      v_mensaje := format('Se le asignó la solicitud «%s» (%s) de %s. Estado: %s.',
        v_nombre, new.legacy_actividad_id, v_comprador, coalesce(nullif(v_estado, ''), '—'));
      v_destinatarios := v_responsables;
    else
      return new;
    end if;
  end if;

  perform g_comercial.notify_users(
    v_destinatarios,
    v_tipo, v_titulo, v_mensaje, new.id,
    case when v_fid then 'fidelizacion' else 'solicitudes' end,
    jsonb_build_object('actividadId', new.legacy_actividad_id, 'estado', v_estado,
      'estadoAnterior', v_estado_anterior, 'responsable', coalesce(v_responsable, '')),
    null, null,
    false -- las solicitudes no dependen del interruptor de avisos de catálogo
  );
  return new;
exception when others then
  -- Un fallo del aviso nunca debe revertir la creación, el cambio de estado ni la asignación.
  raise warning 'notify_special_request_change: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists notify_special_request_state on g_comercial.campanas;
create trigger notify_special_request_state after update of estado, responsable on g_comercial.campanas
  for each row
  when (new.tipo_actividad = 'ESPECIAL'
    and (old.estado is distinct from new.estado or old.responsable is distinct from new.responsable))
  execute function g_comercial.notify_special_request_change();

-- 6) Guardado desde Ajustes > Notificaciones con la casilla "Responsable asignado".
drop function if exists g_comercial.set_notification_subscriptions(text, text[], uuid[], boolean, boolean);
create or replace function g_comercial.set_notification_subscriptions(
  p_tipo_evento text, p_roles text[], p_grupos uuid[], p_dueno boolean,
  p_correo boolean default null, p_responsable boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_responsable boolean;
begin
  perform g_comercial.assert_admin();
  if not exists (select 1 from g_comercial.notificaciones_eventos where tipo_evento = p_tipo_evento) then
    raise exception 'Evento no configurable: %', p_tipo_evento;
  end if;
  -- null = frontend anterior: se conserva la configuración actual.
  v_responsable := coalesce(p_responsable, exists (
    select 1 from g_comercial.notificaciones_suscripciones
    where tipo_evento = p_tipo_evento and destino_tipo = 'RESPONSABLE'));

  delete from g_comercial.notificaciones_suscripciones where tipo_evento = p_tipo_evento;
  insert into g_comercial.notificaciones_suscripciones (tipo_evento, destino_tipo, destino_rol)
  select distinct p_tipo_evento, 'ROL', upper(btrim(r))
  from unnest(coalesce(p_roles, array[]::text[])) as r
  where upper(btrim(r)) in ('ADMIN', 'BUYER', 'MARK', 'OPER', 'AUD', 'DISENADOR');
  insert into g_comercial.notificaciones_suscripciones (tipo_evento, destino_tipo, grupo_id)
  select distinct p_tipo_evento, 'GRUPO', g.id
  from g_comercial.notificaciones_grupos g where g.id = any(coalesce(p_grupos, array[]::uuid[]));
  if coalesce(p_dueno, false) then
    insert into g_comercial.notificaciones_suscripciones (tipo_evento, destino_tipo) values (p_tipo_evento, 'DUENO');
  end if;
  if v_responsable and exists (select 1 from g_comercial.notificaciones_eventos
                               where tipo_evento = p_tipo_evento and admite_responsable) then
    insert into g_comercial.notificaciones_suscripciones (tipo_evento, destino_tipo) values (p_tipo_evento, 'RESPONSABLE');
  end if;
  if p_correo is not null and to_regclass('g_comercial.notificaciones_correo_tipos') is not null then
    execute 'insert into g_comercial.notificaciones_correo_tipos (tipo_evento, activo, descripcion)
             select $1, $2, etiqueta from g_comercial.notificaciones_eventos where tipo_evento = $1
             on conflict (tipo_evento) do update set activo = excluded.activo'
      using p_tipo_evento, p_correo;
  end if;
end;
$$;
revoke all on function g_comercial.set_notification_subscriptions(text, text[], uuid[], boolean, boolean, boolean) from public, anon;
grant execute on function g_comercial.set_notification_subscriptions(text, text[], uuid[], boolean, boolean, boolean) to authenticated;

commit;

-- Verificación (sesión ADMIN):
--   select tipo_evento, admite_responsable from g_comercial.notificaciones_eventos order by orden;
--   select tipo_evento, destino_tipo from g_comercial.notificaciones_suscripciones order by 1, 2;
-- Destinatarios de un cambio de estado para un responsable concreto:
--   select u.nombre, u.email from g_comercial.usuarios_app u
--   where u.id = any(g_comercial.subscription_user_ids('SOLICITUD_ESTADO', null,
--     g_comercial.special_request_responsable_ids('Nombre del Ejecutor')));
-- Últimos avisos generados:
--   select created_at, tipo_evento, titulo, mensaje from g_comercial.notificaciones_envivo
--   where tipo_evento in ('SOLICITUD_ESTADO', 'FIDELIZACION_ESTADO') order by created_at desc limit 10;
