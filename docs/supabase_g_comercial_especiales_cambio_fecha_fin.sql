-- =====================================================================
-- supabase_g_comercial_especiales_cambio_fecha_fin.sql
-- Solicitudes especiales: el comprador cambia la fecha fin.
--
-- Antes:
--   * El guardado del comprador manda la solicitud completa tal como la tiene
--     en pantalla (estado, responsable, fechas y horas de cada estado, IDs de
--     promo/oferta). Si el Ejecutor la había movido mientras tanto, el
--     guardado la devolvía a «Nuevo», borraba el responsable y reiniciaba el
--     contador de horas (fecha_estado = ahora).
--   * Cambiar la fecha fin de una especial no avisaba a nadie.
--
-- Qué hace:
--   1) Trigger BEFORE UPDATE special_request_buyer_guard (solo ESPECIAL y
--      solo cuando el que guarda es BUYER): conserva lo que maneja el tablero
--      (estado, responsable, recursos_ocupados, promo_ids, oferta_ids,
--      fecha_estado, fecha_<estado> y tiempo_<estado>_horas). El comprador
--      sigue pudiendo cambiar nombre, canal, fechas de vigencia y motivo.
--   2) Si un BUYER cambia la fecha fin de una especial (no FID-) que estaba
--      Aprobada o Finalizada, la solicitud pasa a «En trabajo» con el mismo
--      responsable. Las horas no se reinician: igual que
--      cambiar_estado_solicitud, se suman las horas del estado anterior y se
--      abre el tramo de «En trabajo» desde ahora. Nuevo y En trabajo se quedan
--      en su estado.
--   3) Evento nuevo SOLICITUD_VIGENCIA («Cambio de fecha fin: solicitud
--      especial»), configurable en Ajustes > Notificaciones. De inicio: rol
--      OPER + responsable asignado, con correo encendido (solo la primera
--      vez; al repetir el script no se pisa lo configurado). Trigger AFTER
--      UPDATE notify_special_request_end_date: avisa en cualquier cambio de
--      fecha fin de una especial (no FID-). El autor no recibe su propio aviso.
--
-- Esquema: g_comercial.
-- Requiere: supabase_g_comercial_consolidado.sql,
--           supabase_g_comercial_notificaciones_responsable.sql
--           (subscription_user_ids de 3 argumentos y destino RESPONSABLE).
-- Repetible: sí. Destructivo: no (agrega un evento, dos funciones y dos
-- triggers; no borra datos). Reversa al final del archivo.
-- =====================================================================
begin;

-- 1) Evento configurable. Suscripciones y correo iniciales solo la primera vez.
do $$
declare
  v_nuevo boolean := not exists (
    select 1 from g_comercial.notificaciones_eventos where tipo_evento = 'SOLICITUD_VIGENCIA');
begin
  insert into g_comercial.notificaciones_eventos (tipo_evento, etiqueta, descripcion, admite_dueno, orden)
  values ('SOLICITUD_VIGENCIA', 'Cambio de fecha fin: solicitud especial',
          'Se cambia la fecha fin de una solicitud especial. Si estaba Aprobada o Finalizada y la cambió el comprador, vuelve a En trabajo.',
          true, 25)
  on conflict (tipo_evento) do update set
    etiqueta = excluded.etiqueta, descripcion = excluded.descripcion, orden = excluded.orden;

  update g_comercial.notificaciones_eventos
  set admite_responsable = true
  where tipo_evento = 'SOLICITUD_VIGENCIA';

  if v_nuevo then
    insert into g_comercial.notificaciones_suscripciones (tipo_evento, destino_tipo, destino_rol)
    values ('SOLICITUD_VIGENCIA', 'ROL', 'OPER');
    insert into g_comercial.notificaciones_suscripciones (tipo_evento, destino_tipo)
    values ('SOLICITUD_VIGENCIA', 'RESPONSABLE');
  end if;

  if to_regclass('g_comercial.notificaciones_correo_tipos') is not null then
    execute 'insert into g_comercial.notificaciones_correo_tipos (tipo_evento, activo, descripcion)
             select tipo_evento, true, etiqueta from g_comercial.notificaciones_eventos
             where tipo_evento = ''SOLICITUD_VIGENCIA''
             on conflict (tipo_evento) do nothing';
  end if;
end
$$;

-- 2) Guardia del comprador + paso a En trabajo.
create or replace function g_comercial.special_request_buyer_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_hours numeric;
  v_estado text;
begin
  if old.tipo_actividad <> 'ESPECIAL'
    or coalesce(upper(g_comercial.current_user_role()), '') <> 'BUYER' then
    return new;
  end if;

  -- El tablero lo maneja el Ejecutor/Admin: el comprador no lo pisa.
  new.estado := old.estado;
  new.responsable := old.responsable;
  new.recursos_ocupados := old.recursos_ocupados;
  new.promo_ids := old.promo_ids;
  new.oferta_ids := old.oferta_ids;
  new.fecha_estado := old.fecha_estado;
  new.fecha_nuevo := old.fecha_nuevo;
  new.fecha_aprovado := old.fecha_aprovado;
  new.fecha_entrabajo := old.fecha_entrabajo;
  new.fecha_finalizado := old.fecha_finalizado;
  new.fecha_asignado := old.fecha_asignado;
  new.fecha_trabajando := old.fecha_trabajando;
  new.fecha_resuelto := old.fecha_resuelto;
  new.tiempo_nuevo_horas := old.tiempo_nuevo_horas;
  new.tiempo_aprovado_horas := old.tiempo_aprovado_horas;
  new.tiempo_entrabajo_horas := old.tiempo_entrabajo_horas;
  new.tiempo_finalizado_horas := old.tiempo_finalizado_horas;
  new.tiempo_asignado_horas := old.tiempo_asignado_horas;
  new.tiempo_trabajando_horas := old.tiempo_trabajando_horas;
  new.tiempo_resuelto_horas := old.tiempo_resuelto_horas;
  new.tiempo_total_horas := old.tiempo_total_horas;

  v_estado := replace(coalesce(old.estado, ''), 'Aprovado', 'Aprobado');
  if coalesce(old.legacy_actividad_id, '') not like 'FID-%'
    and old.fecha_fin is distinct from new.fecha_fin
    and v_estado in ('Aprobado', 'Finalizado') then
    -- Mismo cálculo que cambiar_estado_solicitud: se cierra el tramo actual.
    v_hours := greatest(0, extract(epoch from (v_now - coalesce(old.fecha_estado, old.updated_at, v_now))) / 3600);
    new.estado := 'En trabajo';
    new.fecha_estado := v_now;
    new.fecha_entrabajo := coalesce(old.fecha_entrabajo, v_now);
    new.tiempo_aprovado_horas := coalesce(old.tiempo_aprovado_horas, 0)
      + case when v_estado = 'Aprobado' then v_hours else 0 end;
    new.tiempo_finalizado_horas := coalesce(old.tiempo_finalizado_horas, 0)
      + case when v_estado = 'Finalizado' then v_hours else 0 end;
    new.tiempo_total_horas := coalesce(old.tiempo_total_horas, 0) + v_hours;
  end if;

  return new;
end;
$$;
revoke all on function g_comercial.special_request_buyer_guard() from public, anon, authenticated;

drop trigger if exists special_request_buyer_guard on g_comercial.campanas;
create trigger special_request_buyer_guard before update on g_comercial.campanas
  for each row
  when (old.tipo_actividad = 'ESPECIAL')
  execute function g_comercial.special_request_buyer_guard();

-- 3) Aviso de cambio de fecha fin.
create or replace function g_comercial.notify_special_request_end_date()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text := coalesce(nullif(btrim(new.nombre_actividad), ''), new.legacy_actividad_id);
  v_actor text;
  v_responsable text := nullif(btrim(coalesce(new.responsable, '')), '');
  v_estado_anterior text := replace(coalesce(old.estado, ''), 'Aprovado', 'Aprobado');
  v_estado text := replace(coalesce(new.estado, ''), 'Aprovado', 'Aprobado');
  v_owner uuid[];
  v_destinatarios uuid[];
begin
  select nombre into v_actor from g_comercial.usuarios_app
  where auth_user_id = auth.uid() and activo = true limit 1;

  v_owner := g_comercial.buyer_user_ids(array_remove(array[new.solicitante_buyer_id], null));
  v_destinatarios := g_comercial.subscription_user_ids('SOLICITUD_VIGENCIA', v_owner,
    g_comercial.special_request_responsable_ids(v_responsable));

  perform g_comercial.notify_users(
    v_destinatarios,
    'SOLICITUD_VIGENCIA',
    'Solicitud especial: cambió la fecha fin',
    format('%s cambió la fecha fin de «%s» (%s) del %s al %s.%s%s',
      coalesce(nullif(btrim(v_actor), ''), coalesce(nullif(btrim(new.comprador), ''), 'Un usuario')),
      v_nombre, new.legacy_actividad_id,
      coalesce(to_char(old.fecha_fin, 'DD/MM/YYYY'), 'sin fecha'),
      coalesce(to_char(new.fecha_fin, 'DD/MM/YYYY'), 'sin fecha'),
      case when v_estado_anterior <> v_estado
        then format(' Pasó de %s a %s: actualice la carga.', v_estado_anterior, v_estado)
        else format(' Estado: %s.', coalesce(nullif(v_estado, ''), '—')) end,
      case when v_responsable is not null then format(' Responsable: %s.', v_responsable) else '' end),
    new.id, 'solicitudes',
    jsonb_build_object('actividadId', new.legacy_actividad_id,
      'fechaFinAnterior', old.fecha_fin, 'fechaFin', new.fecha_fin,
      'estadoAnterior', v_estado_anterior, 'estado', v_estado,
      'responsable', coalesce(v_responsable, '')),
    null, null,
    false -- las solicitudes no dependen del interruptor de avisos de catálogo
  );
  return new;
exception when others then
  -- Un fallo del aviso nunca debe revertir el guardado.
  raise warning 'notify_special_request_end_date: %', sqlerrm;
  return new;
end;
$$;
revoke all on function g_comercial.notify_special_request_end_date() from public, anon, authenticated;

drop trigger if exists notify_special_request_end_date on g_comercial.campanas;
create trigger notify_special_request_end_date after update of fecha_fin on g_comercial.campanas
  for each row
  when (new.tipo_actividad = 'ESPECIAL'
    and coalesce(new.legacy_actividad_id, '') not like 'FID-%'
    and old.fecha_fin is distinct from new.fecha_fin)
  execute function g_comercial.notify_special_request_end_date();

commit;

-- Verificación (sesión ADMIN):
--   select tipo_evento, etiqueta, admite_responsable from g_comercial.notificaciones_eventos where tipo_evento = 'SOLICITUD_VIGENCIA';
--   select tipo_evento, destino_tipo, destino_rol from g_comercial.notificaciones_suscripciones where tipo_evento = 'SOLICITUD_VIGENCIA';
--   select created_at, titulo, mensaje from g_comercial.notificaciones_envivo
--   where tipo_evento = 'SOLICITUD_VIGENCIA' order by created_at desc limit 10;
--
-- Reversa (vuelve al comportamiento anterior; conserva los avisos ya enviados):
--   begin;
--   drop trigger if exists special_request_buyer_guard on g_comercial.campanas;
--   drop trigger if exists notify_special_request_end_date on g_comercial.campanas;
--   drop function if exists g_comercial.special_request_buyer_guard();
--   drop function if exists g_comercial.notify_special_request_end_date();
--   delete from g_comercial.notificaciones_suscripciones where tipo_evento = 'SOLICITUD_VIGENCIA';
--   commit;
