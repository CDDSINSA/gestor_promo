-- =====================================================================
-- supabase_g_comercial_notificaciones_estados_solicitud.sql
-- Solicitudes especiales y Fidelización: elegir en qué estados se avisa.
--
-- Antes: cada cambio de estado del tablero (Nuevo, Aprobado, En trabajo,
-- Finalizado, Archivado) generaba aviso en la campana y correo.
--
-- Qué agrega:
--   * notificaciones_eventos.admite_estados (true en SOLICITUD_ESTADO y
--     FIDELIZACION_ESTADO) y notificaciones_eventos.estados_aviso (text[]):
--     estados a los que, al llegar, se avisa. null = todos (comportamiento
--     anterior); arreglo vacío = ningún cambio de estado avisa.
--   * Primera instalación: deja Aprobado y Finalizado en los dos eventos. Al
--     repetir el script no se pisa lo configurado en Ajustes.
--   * notify_special_request_change: el aviso de cambio de estado solo sale si
--     el estado nuevo está en la lista. Si en el mismo cambio se asignó un
--     responsable nuevo y el estado no avisa, el responsable igual recibe
--     «Solicitud … asignada» (para que no se pierda la asignación).
--   * RPC set_notification_event_states(tipo, estados) para Ajustes >
--     Notificaciones (solo ADMIN).
--
-- Qué NO cambia: «Nueva solicitud» (SOLICITUD_NUEVA / FIDELIZACION_NUEVA),
-- la reasignación de responsable sin cambio de estado, los destinatarios y el
-- interruptor de correo de cada evento.
-- El otro pedido (que cargar promociones a una solicitud no avise) está en
-- supabase_g_comercial_notificaciones_especiales.sql: ejecutarlo de nuevo.
--
-- Esquema: g_comercial.
-- Requiere: supabase_g_comercial_consolidado.sql y
--           supabase_g_comercial_notificaciones_responsable.sql (en ese orden).
-- Repetible: sí. Destructivo: no (agrega dos columnas, reemplaza una función
-- de trigger y crea una RPC; no borra datos ni avisos).
-- Si se vuelve a ejecutar el consolidado o el script del responsable, ejecutar
-- este script otra vez (ambos reemplazan notify_special_request_change).
-- =====================================================================
begin;

-- 1) Columnas. La lista inicial (Aprobado, Finalizado) se pone solo la primera vez.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'g_comercial' and table_name = 'notificaciones_eventos' and column_name = 'estados_aviso'
  ) then
    alter table g_comercial.notificaciones_eventos add column estados_aviso text[];
    update g_comercial.notificaciones_eventos
    set estados_aviso = array['Aprobado', 'Finalizado']
    where tipo_evento in ('SOLICITUD_ESTADO', 'FIDELIZACION_ESTADO');
  end if;
end
$$;

alter table g_comercial.notificaciones_eventos
  add column if not exists admite_estados boolean not null default false;

update g_comercial.notificaciones_eventos
set admite_estados = (tipo_evento in ('SOLICITUD_ESTADO', 'FIDELIZACION_ESTADO'));

-- 2) ¿Llegar a este estado genera aviso? (sin mayúsculas ni espacios extra)
create or replace function g_comercial.special_request_state_notifies(p_tipo_evento text, p_estado text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select not e.admite_estados
      or e.estados_aviso is null
      or exists (select 1 from unnest(e.estados_aviso) as s(estado)
                 where lower(btrim(s.estado)) = lower(btrim(coalesce(p_estado, ''))))
    from g_comercial.notificaciones_eventos e
    where e.tipo_evento = p_tipo_evento
  ), true);
$$;
revoke all on function g_comercial.special_request_state_notifies(text, text) from public, anon, authenticated;

-- 3) Trigger de solicitudes (misma versión que el script del responsable + filtro de estados).
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
    if v_estado_anterior <> v_estado
      and g_comercial.special_request_state_notifies(v_tipo, v_estado) then
      v_titulo := format('Solicitud %s: %s', case when v_fid then 'de Fidelización' else 'especial' end, v_estado);
      v_mensaje := format('La solicitud «%s» (%s) pasó de %s a %s.%s', v_nombre, new.legacy_actividad_id,
        coalesce(nullif(v_estado_anterior, ''), '—'), v_estado,
        case when v_responsable is not null then format(' Responsable: %s.', v_responsable) else '' end);
      v_destinatarios := g_comercial.subscription_user_ids(v_tipo, v_owner, v_responsables);
    elsif v_responsable is not null
      and lower(v_responsable) is distinct from lower(nullif(btrim(coalesce(old.responsable, '')), ''))
      and exists (select 1 from g_comercial.notificaciones_suscripciones s
                  where s.tipo_evento = v_tipo and s.destino_tipo = 'RESPONSABLE') then
      -- Reasignación (sin cambio de estado, o con un cambio a un estado que no
      -- avisa): solo al nuevo responsable.
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

-- 4) Guardado desde Ajustes > Notificaciones.
create or replace function g_comercial.set_notification_event_states(p_tipo_evento text, p_estados text[])
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estados text[];
begin
  perform g_comercial.assert_admin();
  if not exists (select 1 from g_comercial.notificaciones_eventos
                 where tipo_evento = p_tipo_evento and admite_estados) then
    raise exception 'El evento % no permite elegir estados.', p_tipo_evento;
  end if;

  -- Solo estados conocidos, con su escritura oficial y en el orden del tablero.
  select coalesce(array_agg(k.estado order by k.orden), array[]::text[]) into v_estados
  from (values ('Nuevo', 1), ('Aprobado', 2), ('En trabajo', 3), ('Finalizado', 4), ('Archivado', 5)) as k(estado, orden)
  where exists (select 1 from unnest(coalesce(p_estados, array[]::text[])) as s(estado)
                where lower(btrim(s.estado)) = lower(k.estado));

  update g_comercial.notificaciones_eventos set estados_aviso = v_estados where tipo_evento = p_tipo_evento;
  return v_estados;
end;
$$;
revoke all on function g_comercial.set_notification_event_states(text, text[]) from public, anon;
grant execute on function g_comercial.set_notification_event_states(text, text[]) to authenticated;

commit;

-- Verificación (sesión ADMIN):
--   select tipo_evento, admite_estados, estados_aviso from g_comercial.notificaciones_eventos order by orden;
--   select g_comercial.special_request_state_notifies('SOLICITUD_ESTADO', 'En trabajo'); -- false
--   select g_comercial.special_request_state_notifies('SOLICITUD_ESTADO', 'Aprobado');   -- true
-- Volver a avisar en todos los estados (comportamiento anterior):
--   update g_comercial.notificaciones_eventos set estados_aviso = null
--   where tipo_evento in ('SOLICITUD_ESTADO', 'FIDELIZACION_ESTADO');
