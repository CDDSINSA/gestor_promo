-- Correcciones de Fidelizacion. Ejecutar DESPUES de supabase_permissions_hardening.sql.
-- Transaccional y repetible. No cambia hojas Excel ni columnas existentes.
begin;

create or replace function public.guard_fidelizacion_campana()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op <> 'INSERT' and old.legacy_actividad_id like 'FID-%' then
    if not public.fidelizacion_buyer_allowed(old.solicitante_buyer_id) then
      raise exception 'Sin permiso sobre esta solicitud de Fidelizacion.' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and (new.legacy_actividad_id <> old.legacy_actividad_id or new.tipo_actividad <> 'ESPECIAL') then
      raise exception 'No se puede reclasificar una solicitud de Fidelizacion.' using errcode = '42501';
    end if;
  end if;
  if tg_op <> 'DELETE' and new.legacy_actividad_id like 'FID-%' then
    if new.tipo_actividad <> 'ESPECIAL' or not public.fidelizacion_buyer_allowed(new.solicitante_buyer_id) then
      raise exception 'Solo Comprador y Ejecutor pueden operar Fidelizacion en su alcance.' using errcode = '42501';
    end if;
  end if;
  if public.current_user_role() = 'BUYER' and tg_op <> 'DELETE' and new.legacy_actividad_id like 'FID-%' then
    if (tg_op = 'INSERT' and new.estado <> 'Nuevo') or
       (tg_op = 'UPDATE' and new.estado is distinct from old.estado) then
      raise exception 'Solo Ejecutor puede cambiar el estado de Fidelizacion.' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;

create or replace function public.guard_fidelizacion_rows()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if public.current_user_role() = 'BUYER' then
    if tg_table_name = 'canasto_fidelizacion' then
      if tg_op <> 'UPDATE' then
        raise exception 'Solo Ejecutor puede aplicar descuentos al canasto.' using errcode = '42501';
      end if;
      if (new.canal, new.sku, new.segmento_id, new.descuento, new.comprador, new.division)
          is distinct from (old.canal, old.sku, old.segmento_id, old.descuento, old.comprador, old.division)
          or new.estatus <> 'En proceso' then
        raise exception 'Solo Ejecutor puede aplicar descuentos al canasto.' using errcode = '42501';
      end if;
    elsif tg_op <> 'INSERT' then
      raise exception 'El detalle enviado no puede modificarse; cree otra solicitud.' using errcode = '42501';
    elsif new.estado <> 'PENDIENTE' then
      raise exception 'Solo Ejecutor puede aplicar una solicitud.' using errcode = '42501';
    end if;
  end if;
  if tg_op <> 'INSERT' then
    if not public.fidelizacion_owner_allowed(old.comprador) then
      raise exception 'Registro de Fidelizacion fuera de su alcance.' using errcode = '42501';
    end if;
    if tg_table_name = 'fidelizacion_solicitudes_detalle' then
      if not public.fidelizacion_request_allowed(old.actividad_id) then
        raise exception 'Solicitud fuera de su alcance.' using errcode = '42501';
      end if;
    end if;
  end if;
  if tg_op <> 'DELETE' then
    if not public.fidelizacion_owner_allowed(new.comprador) or not public.fidelizacion_sku_allowed(new.sku) then
      raise exception 'Registro de Fidelizacion fuera de su alcance.' using errcode = '42501';
    end if;
    if tg_table_name = 'fidelizacion_solicitudes_detalle' then
      if not public.fidelizacion_request_allowed(new.actividad_id) then
        raise exception 'Solicitud fuera de su alcance.' using errcode = '42501';
      end if;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;

create index if not exists idx_canasto_fid_sku on public.canasto_fidelizacion(sku);
create index if not exists idx_fid_detalle_pendiente on public.fidelizacion_solicitudes_detalle(canal, sku, segmento_id) where estado = 'PENDIENTE';

create or replace function public.crear_solicitud_fidelizacion(
  p_actividad jsonb,
  p_detalles jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actividad_id text;
  v_canal text;
  v_nombre text;
  v_motivo text;
  v_comprador text;
  v_solicitante text;
  v_buyer_id uuid;
  v_count integer := 0;
begin
  perform set_config('statement_timeout', '60s', true);

  if coalesce(public.current_user_role(), '') not in ('BUYER', 'OPER') then
    raise exception 'Solo Comprador y Ejecutor pueden operar Fidelizacion.' using errcode = '42501';
  end if;
  v_actividad_id := coalesce(nullif(p_actividad ->> 'legacy_actividad_id', ''), nullif(p_actividad ->> 'actividad_id', ''));
  if v_actividad_id is null or v_actividad_id = '' then
    return jsonb_build_object('success', false, 'error', 'Identificador de actividad invalido.');
  end if;

  if v_actividad_id not like 'FID-%' then
    raise exception 'Fidelizacion requiere un identificador FID-.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('fidelizacion:canasto', 0));
  -- Serializa solicitudes del mismo identificador, incluida su primera creacion.
  perform pg_advisory_xact_lock(hashtextextended(v_actividad_id, 0));
  if exists (select 1 from public.campanas where legacy_actividad_id = v_actividad_id) then
    if not public.fidelizacion_request_allowed(v_actividad_id) then
      raise exception 'Solicitud fuera de su alcance.' using errcode = '42501';
    end if;
    raise exception 'El identificador de solicitud ya existe. Cree una nueva solicitud.' using errcode = '23505';
  end if;
  v_canal := coalesce(nullif(p_actividad ->> 'canal', ''), 'Comasa');
  v_nombre := coalesce(nullif(p_actividad ->> 'nombre_actividad', ''), 'Fidelizacion ' || upper(v_canal));
  v_motivo := coalesce(p_actividad ->> 'motivo_solicitud', '');
  v_comprador := coalesce(nullif(p_actividad ->> 'comprador', ''), nullif(p_actividad ->> 'solicitante', ''), '');
  v_solicitante := coalesce(nullif(p_actividad ->> 'solicitante', ''), v_comprador);

  -- 1. Obtener buyer_id del comprador si existe
  if p_actividad ->> 'solicitante_buyer_id' is not null and (p_actividad ->> 'solicitante_buyer_id') ~ '^[0-9a-fA-F-]{36}$' then
    v_buyer_id := (p_actividad ->> 'solicitante_buyer_id')::uuid;
  else
    select id into v_buyer_id
    from public.compradores
    where lower(trim(comprador)) = lower(trim(v_comprador))
       or lower(trim(comprador)) = lower(trim(v_solicitante))
       or lower(trim(correo)) = lower(trim(v_comprador))
       or lower(trim(correo)) = lower(trim(v_solicitante))
    limit 1;

    if v_buyer_id is null then
      select id into v_buyer_id
      from public.compradores
      where replace(translate(lower(trim(comprador)), 'áéíóúàèìòùz', 'aeiouaeious'), ' ', '') =
            replace(translate(lower(trim(v_comprador)), 'áéíóúàèìòùz', 'aeiouaeious'), ' ', '')
         or replace(translate(lower(trim(comprador)), 'áéíóúàèìòùz', 'aeiouaeious'), ' ', '') =
            replace(translate(lower(trim(v_solicitante)), 'áéíóúàèìòùz', 'aeiouaeious'), ' ', '')
         or (length(v_comprador) > 3 and correo ilike '%' || split_part(lower(trim(v_comprador)), ' ', 1) || '%')
      limit 1;
    end if;

    if v_buyer_id is null then
      select buyer_id into v_buyer_id
      from public.usuarios_app
      where auth_user_id = auth.uid()
      limit 1;
    end if;
  end if;

  if v_buyer_id is not null then
    select comprador into v_comprador from public.compradores where id = v_buyer_id limit 1;
  end if;

  if not public.fidelizacion_buyer_allowed(v_buyer_id) then
    raise exception 'Comprador fuera de su alcance autorizado.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_detalles) is distinct from 'array' or jsonb_array_length(p_detalles) = 0 then
    raise exception 'La solicitud debe contener cambios.';
  end if;

  -- 2. Validacion de formato numerico en el payload JSON antes de parsear
  if exists (
    select 1 from jsonb_array_elements(p_detalles) d
    where (d->>'descuento_solicitado') is null
       or trim(d->>'descuento_solicitado') = ''
       or (d->>'descuento_solicitado') !~ '^-?[0-9]+(\.[0-9]+)?$'
  ) then
    raise exception 'Descuento solicitado invalido.';
  end if;

  -- 3. Cargar detalles en tabla temporal de sesion para validaciones masivas (set-based)
  drop table if exists _tmp_fid_detalles;
  create temporary table _tmp_fid_detalles on commit drop as
  select
    trim(coalesce(d->>'sku', '')) as sku,
    trim(coalesce(d->>'segmento_id', '')) as segmento_id,
    lower(coalesce(nullif(d->>'canal', ''), lower(v_canal))) as canal,
    coalesce(d->>'division', '') as division,
    coalesce(nullif(d->>'solicitante', ''), v_solicitante) as solicitante,
    coalesce((d->>'descuento_anterior')::numeric, 0) as descuento_anterior_in,
    (d->>'descuento_solicitado')::numeric as descuento_solicitado
  from jsonb_array_elements(p_detalles) d;

  -- Validar duplicados SKU / segmento en el lote
  if exists (
    select 1 from _tmp_fid_detalles group by sku, segmento_id having count(*) > 1
  ) then
    raise exception 'Hay combinaciones SKU/segmento duplicadas.';
  end if;

  -- Validar campos obligatorios
  if exists (
    select 1 from _tmp_fid_detalles where sku = '' or segmento_id = ''
  ) then
    raise exception 'SKU y segmento son obligatorios.';
  end if;

  -- Validar canal coincidente
  if exists (
    select 1 from _tmp_fid_detalles where canal <> lower(v_canal)
  ) then
    raise exception 'El canal del detalle no coincide con la solicitud.';
  end if;

  -- Validar rango de descuentos solicitados [0, 100]
  if exists (
    select 1 from _tmp_fid_detalles
    where descuento_solicitado is null or descuento_solicitado < 0 or descuento_solicitado > 100
  ) then
    raise exception 'Descuento solicitado invalido.';
  end if;

  -- Validar alcance de SKU en masa (para BUYER: no tomar SKUs asignados a otro comprador)
  if public.current_user_role() = 'BUYER' then
    if exists (
      select 1
      from _tmp_fid_detalles t
      join public.canasto_fidelizacion f on f.sku = t.sku
      where not public.fidelizacion_owner_allowed(f.comprador)
    ) then
      raise exception 'SKU fuera de su alcance de Fidelizacion.' using errcode = '42501';
    end if;
  end if;

  -- Validar existencia y vigencia activa de segmentos en masa
  if exists (
    select 1
    from _tmp_fid_detalles t
    where not exists (
      select 1
      from public.segmentos_clientes s
      where s.legacy_segmento_id = t.segmento_id
        and lower(s.canal) = lower(v_canal)
        and s.activo
    )
  ) then
    raise exception 'Segmento inexistente o inactivo para el canal.';
  end if;

  -- Bloquear en masa las filas relevantes de canasto_fidelizacion para control de concurrencia
  perform 1
  from public.canasto_fidelizacion f
  where f.canal = lower(v_canal)
    and exists (
      select 1 from _tmp_fid_detalles t
      where t.sku = f.sku and t.segmento_id = f.segmento_id
    )
  for update;

  -- Validar en masa que el canasto no haya cambiado frente a descuento_anterior reportado
  if exists (
    select 1
    from _tmp_fid_detalles t
    left join public.canasto_fidelizacion f
      on f.canal = lower(v_canal) and f.sku = t.sku and f.segmento_id = t.segmento_id
    where coalesce(f.descuento, 0) is distinct from t.descuento_anterior_in
  ) then
    raise exception 'El canasto cambio. Actualice los datos y prepare nuevamente la solicitud.' using errcode = '40001';
  end if;

  -- Descartar filas sin cambio real (solicitado == anterior)
  delete from _tmp_fid_detalles
  where descuento_solicitado = descuento_anterior_in;

  if not exists (select 1 from _tmp_fid_detalles) then
    raise exception 'La solicitud no contiene cambios.';
  end if;

  -- Validar en masa que no existan solicitudes pendientes superpuestas
  if exists (
    select 1
    from _tmp_fid_detalles t
    join public.fidelizacion_solicitudes_detalle d
      on d.canal = lower(v_canal)
     and d.sku = t.sku
     and d.segmento_id = t.segmento_id
     and d.estado = 'PENDIENTE'
     and d.tipo_cambio <> 'SIN_CAMBIO'
  ) then
    raise exception 'Ya existe una solicitud pendiente para este SKU y segmento.';
  end if;

  -- 4. Insertar o actualizar la cabecera en public.campanas
  insert into public.campanas (
    legacy_actividad_id,
    tipo_actividad,
    nombre_actividad,
    canal,
    solicitante_buyer_id,
    estado,
    motivo_solicitud,
    comprador,
    recursos_ocupados,
    fecha_nuevo,
    fecha_estado,
    updated_at
  )
  values (
    v_actividad_id,
    'ESPECIAL',
    v_nombre,
    v_canal,
    v_buyer_id,
    'Nuevo',
    v_motivo,
    v_comprador,
    'Pricing (ORCE)',
    now(),
    now(),
    now()
  );

  -- 5. Insercion masiva en fidelizacion_solicitudes_detalle
  insert into public.fidelizacion_solicitudes_detalle (
    actividad_id,
    canal,
    sku,
    division,
    segmento_id,
    descuento_anterior,
    descuento_solicitado,
    tipo_cambio,
    estado,
    solicitante,
    comprador,
    created_at
  )
  select
    v_actividad_id,
    t.canal,
    t.sku,
    t.division,
    t.segmento_id,
    t.descuento_anterior_in,
    t.descuento_solicitado,
    case
      when f.sku is null then 'NUEVO'
      when t.descuento_solicitado = 0 then 'ELIMINA'
      when t.descuento_solicitado > t.descuento_anterior_in then 'SUBE'
      else 'BAJA'
    end,
    'PENDIENTE',
    t.solicitante,
    v_comprador,
    now()
  from _tmp_fid_detalles t
  left join public.canasto_fidelizacion f
    on f.canal = lower(v_canal) and f.sku = t.sku and f.segmento_id = t.segmento_id;

  get diagnostics v_count = row_count;

  -- 6. Actualizacion masiva del estatus en canasto_fidelizacion
  update public.canasto_fidelizacion f
  set estatus = 'En proceso',
      ultima_solicitud_id = v_actividad_id
  from _tmp_fid_detalles t
  where f.canal = lower(v_canal)
    and f.sku = t.sku
    and f.segmento_id = t.segmento_id;

  return jsonb_build_object(
    'success', true,
    'actividad_id', v_actividad_id,
    'rows_inserted', v_count
  );
end;
$$;

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
  perform set_config('statement_timeout', '60s', true);

  if public.current_user_role() is distinct from 'OPER' then
    raise exception 'Solo Ejecutor puede finalizar Fidelizacion.' using errcode = '42501';
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
  if public.current_user_role() is distinct from 'OPER' then
    raise exception 'Solo Ejecutor puede usar esta operacion.' using errcode = '42501';
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
