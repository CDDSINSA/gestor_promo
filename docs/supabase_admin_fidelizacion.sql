-- Aplicar DESPUES de permissions_hardening, fidelizacion_integrity y fidelizacion_orce.
-- Habilita consulta y cambios de estado para ADMIN. No habilita crear solicitudes ni conciliar ORCE.
begin;

create or replace function public.fidelizacion_buyer_allowed(p_buyer uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.current_user_role() in ('ADMIN', 'OPER') or
  (public.current_user_role() = 'BUYER' and p_buyer = any(public.current_buyer_scope_ids())), false); $$;

create or replace function public.fidelizacion_owner_allowed(p_comprador text)
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.current_user_role() in ('ADMIN', 'OPER') or
  (public.current_user_role() = 'BUYER' and exists (
    select 1 from public.compradores c where c.id = any(public.current_buyer_scope_ids())
      and lower(trim(c.comprador)) = lower(trim(p_comprador)) and nullif(trim(c.comprador), '') is not null
  )), false); $$;

create or replace function public.fidelizacion_sku_allowed(p_sku text)
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.current_user_role() in ('ADMIN', 'OPER') or
  (public.current_user_role() = 'BUYER' and not exists (
    select 1 from public.canasto_fidelizacion f where f.sku = p_sku
      and not public.fidelizacion_owner_allowed(f.comprador)
  )), false); $$;

create or replace function public.finalizar_solicitud_fidelizacion(p_actividad_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_rec record;
  v_nuevo_estatus text;
  v_anterior numeric;
  v_estado text;
  v_referencia text;
begin
  if coalesce(public.current_user_role(), '') not in ('ADMIN', 'OPER') then
    raise exception 'Solo Administrador o Ejecutor puede finalizar Fidelizacion.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('fidelizacion:canasto', 0));
  perform pg_advisory_xact_lock(hashtextextended(p_actividad_id, 0));
  perform 1 from public.campanas where legacy_actividad_id = p_actividad_id for update;
  if not public.fidelizacion_request_allowed(p_actividad_id) then
    raise exception 'Sin permiso para finalizar esta solicitud de Fidelizacion.' using errcode = '42501';
  end if;
  if exists (select 1 from public.fidelizacion_solicitudes_detalle d
    where d.actividad_id = p_actividad_id and
      (not public.fidelizacion_owner_allowed(d.comprador) or not public.fidelizacion_sku_allowed(d.sku))) then
    raise exception 'Detalle fuera de su alcance autorizado.' using errcode = '42501';
  end if;
  select estado, promo_ids into v_estado, v_referencia from public.campanas where legacy_actividad_id = p_actividad_id;
  if v_estado in ('Finalizado', 'Archivado') then
    return jsonb_build_object('success', true, 'rows_affected', 0);
  end if;
  if nullif(trim(v_referencia), '') is null or upper(trim(v_referencia)) = 'ORCE-CARGADO' then
    raise exception 'Registre la referencia de carga ORCE antes de finalizar.';
  end if;
  select count(*) into v_count from public.fidelizacion_solicitudes_detalle
    where actividad_id = p_actividad_id and estado = 'PENDIENTE' and tipo_cambio <> 'SIN_CAMBIO';
  if v_count = 0 then raise exception 'La solicitud no tiene cambios pendientes.'; end if;

  -- Iterar sobre los registros pendientes y aplicar cambios a canasto_fidelizacion
  for v_rec in
    select *
    from public.fidelizacion_solicitudes_detalle
    where actividad_id = p_actividad_id and estado = 'PENDIENTE' and tipo_cambio <> 'SIN_CAMBIO'
    order by canal, sku, segmento_id
  loop
    select descuento into v_anterior from public.canasto_fidelizacion
      where canal = v_rec.canal and sku = v_rec.sku and segmento_id = v_rec.segmento_id for update;
    if coalesce(v_anterior, 0) is distinct from v_rec.descuento_anterior then
      raise exception 'El canasto cambio para SKU %, segmento %. Revise la solicitud antes de cargar ORCE.', v_rec.sku, v_rec.segmento_id using errcode = '40001';
    end if;
    -- Si el descuento solicitado es 0, pasa a 'Inactivo', de lo contrario 'Activo'
    if v_rec.descuento_solicitado = 0 then
      v_nuevo_estatus := 'Inactivo';
    else
      v_nuevo_estatus := 'Activo';
    end if;

    insert into public.canasto_fidelizacion (
      canal,
      sku,
      division,
      segmento_id,
      descuento,
      estatus,
      comprador,
      ultima_solicitud_id,
      updated_at
    )
    values (
      v_rec.canal,
      v_rec.sku,
      v_rec.division,
      v_rec.segmento_id,
      v_rec.descuento_solicitado,
      v_nuevo_estatus,
      coalesce(nullif(v_rec.comprador, ''), v_rec.solicitante),
      p_actividad_id,
      now()
    )
    on conflict (canal, sku, segmento_id)
    do update set
      descuento = excluded.descuento,
      estatus = excluded.estatus,
      comprador = coalesce(nullif(excluded.comprador, ''), canasto_fidelizacion.comprador),
      ultima_solicitud_id = excluded.ultima_solicitud_id,
      updated_at = now();

  end loop;

  -- Las solicitudes antiguas pueden incluir SIN_CAMBIO: nunca reaplicar su valor.
  update public.fidelizacion_solicitudes_detalle set estado = 'RECHAZADO'
    where actividad_id = p_actividad_id and estado = 'PENDIENTE' and tipo_cambio = 'SIN_CAMBIO';
  -- Marcar los registros de detalle como APLICADO
  update public.fidelizacion_solicitudes_detalle
  set estado = 'APLICADO',
      applied_at = now()
  where actividad_id = p_actividad_id and estado = 'PENDIENTE';

  -- Actualizar estado de la actividad en campanas a Finalizado
  update public.campanas
  set estado = 'Finalizado',
      fecha_finalizado = coalesce(fecha_finalizado, now()),
      fecha_estado = now(),
      updated_at = now()
  where legacy_actividad_id = p_actividad_id;

  return jsonb_build_object(
    'success', true,
    'message', 'Descuentos actualizados correctamente en canasto maestro.',
    'rows_affected', v_count
  );
end;
$$;

create or replace function public.cambiar_estado_solicitud(
  p_actividad_id text, p_estado text, p_estado_anterior text,
  p_promo_ids text default '', p_oferta_ids text default ''
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_row public.campanas%rowtype;
  v_now timestamptz := clock_timestamp();
  v_hours numeric;
  v_fid boolean;
begin
  if coalesce(public.current_user_role(), '') not in ('ADMIN', 'OPER') then
    raise exception 'Solo Administrador o Ejecutor puede usar esta operacion.' using errcode = '42501';
  end if;
  if p_estado is null or p_estado not in ('Nuevo', 'Aprobado', 'En trabajo', 'Finalizado', 'Archivado') then
    raise exception 'Estado no valido.';
  end if;
  if p_actividad_id like 'FID-%' then
    perform pg_advisory_xact_lock(hashtextextended('fidelizacion:canasto', 0));
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actividad_id, 0));
  select * into v_row from public.campanas where legacy_actividad_id = p_actividad_id for update;
  if not found or v_row.tipo_actividad <> 'ESPECIAL' then
    raise exception 'Solicitud especial no encontrada.';
  end if;
  if replace(v_row.estado, 'Aprovado', 'Aprobado') is distinct from p_estado_anterior then
    raise exception 'El estado cambio. Actualice la consulta antes de continuar.' using errcode = '40001';
  end if;
  if v_row.estado = p_estado then return to_jsonb(v_row); end if;
  if p_estado = 'Archivado' and v_row.estado <> 'Finalizado' then
    raise exception 'Solo se pueden archivar solicitudes finalizadas.';
  end if;
  v_fid := v_row.legacy_actividad_id like 'FID-%';
  if v_fid and v_row.estado in ('Finalizado', 'Archivado') and p_estado <> 'Archivado' then
    raise exception 'La Fidelizacion aplicada no puede reabrirse.';
  end if;
  if p_estado = 'Finalizado' then
    if v_fid then
      if nullif(trim(p_promo_ids), '') is null or upper(trim(p_promo_ids)) = 'ORCE-CARGADO' then
        raise exception 'Registre la referencia de carga ORCE antes de finalizar.';
      end if;
      update public.campanas set promo_ids = trim(p_promo_ids) where id = v_row.id;
      perform public.finalizar_solicitud_fidelizacion(p_actividad_id);
    elsif nullif(trim(p_promo_ids), '') is null or nullif(trim(p_oferta_ids), '') is null then
      raise exception 'Para finalizar debe ingresar ID de promo e ID de oferta.';
    end if;
  end if;
  v_hours := greatest(0, extract(epoch from (v_now - coalesce(v_row.fecha_estado, v_row.updated_at, v_now))) / 3600);
  update public.campanas set
    estado = p_estado, fecha_estado = v_now, updated_at = v_now,
    fecha_nuevo = case when p_estado = 'Nuevo' then coalesce(fecha_nuevo, v_now) else fecha_nuevo end,
    fecha_aprovado = case when p_estado = 'Aprobado' then coalesce(fecha_aprovado, v_now) else fecha_aprovado end,
    fecha_entrabajo = case when p_estado = 'En trabajo' then coalesce(fecha_entrabajo, v_now) else fecha_entrabajo end,
    fecha_finalizado = case when p_estado = 'Finalizado' then coalesce(fecha_finalizado, v_now) else fecha_finalizado end,
    tiempo_nuevo_horas = tiempo_nuevo_horas + case when v_row.estado = 'Nuevo' then v_hours else 0 end,
    tiempo_aprovado_horas = tiempo_aprovado_horas + case when v_row.estado in ('Aprobado', 'Aprovado') then v_hours else 0 end,
    tiempo_entrabajo_horas = tiempo_entrabajo_horas + case when v_row.estado = 'En trabajo' then v_hours else 0 end,
    tiempo_finalizado_horas = tiempo_finalizado_horas + case when v_row.estado = 'Finalizado' then v_hours else 0 end,
    tiempo_total_horas = tiempo_total_horas + v_hours,
    promo_ids = case when p_estado = 'Finalizado' then coalesce(nullif(trim(p_promo_ids), ''), 'ORCE-CARGADO') else promo_ids end,
    oferta_ids = case when p_estado = 'Finalizado' then coalesce(nullif(trim(p_oferta_ids), ''), 'ORCE-CARGADO') else oferta_ids end
  where id = v_row.id returning * into v_row;
  return to_jsonb(v_row);
end; $$;

commit;
