-- =============================================================================
-- Modulo de Fidelizacion: Descuentos Permanentes por Segmento (Comasa / Retail)
-- =============================================================================

-- 1. Tabla Maestra de Canasto de Fidelizacion
create table if not exists public.canasto_fidelizacion (
  id uuid primary key default gen_random_uuid(),
  canal text not null check (canal in ('comasa', 'retail')),
  sku text not null,
  division text not null default '',
  segmento_id text not null,
  descuento numeric(5, 2) not null check (descuento >= 0 and descuento <= 100),
  fecha_vigencia date,
  estatus text not null default 'Activo' check (estatus in ('Activo', 'Inactivo', 'En proceso')),
  comprador text not null default '',
  ultima_solicitud_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint canasto_fidelizacion_unique unique (canal, sku, segmento_id)
);

-- 2. Tabla de Detalle / Staging de Solicitudes de Actualizacion de Canasto
create table if not exists public.fidelizacion_solicitudes_detalle (
  id uuid primary key default gen_random_uuid(),
  actividad_id text not null,
  canal text not null check (canal in ('comasa', 'retail')),
  sku text not null,
  division text not null default '',
  segmento_id text not null,
  descuento_anterior numeric(5, 2) default 0,
  descuento_solicitado numeric(5, 2) not null check (descuento_solicitado >= 0 and descuento_solicitado <= 100),
  tipo_cambio text not null check (tipo_cambio in ('NUEVO', 'SUBE', 'BAJA', 'ELIMINA', 'SIN_CAMBIO')),
  estado text not null default 'PENDIENTE' check (estado in ('PENDIENTE', 'APLICADO', 'RECHAZADO')),
  solicitante text not null default '',
  comprador text not null default '',
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

-- 3. Indices de optimizacion (Crucial para soportar 12k+ SKUs x segmentos)
create index if not exists idx_canasto_fid_canal_sku on public.canasto_fidelizacion(canal, sku);
create index if not exists idx_canasto_fid_canal_div on public.canasto_fidelizacion(canal, division);
create index if not exists idx_canasto_fid_segmento on public.canasto_fidelizacion(segmento_id);
create index if not exists idx_canasto_fid_estatus on public.canasto_fidelizacion(estatus);

create index if not exists idx_fid_detalle_actividad on public.fidelizacion_solicitudes_detalle(actividad_id);
create index if not exists idx_fid_detalle_sku on public.fidelizacion_solicitudes_detalle(sku);
create index if not exists idx_fid_detalle_estado on public.fidelizacion_solicitudes_detalle(estado);

-- 4. Trigger para actualizar updated_at
create or replace trigger trg_canasto_fidelizacion_updated_at
before update on public.canasto_fidelizacion
for each row execute function public.set_updated_at();

-- 5. RPC Transaccional: Creacion atomica de Solicitud de Fidelizacion
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
  v_item jsonb;
  v_count integer := 0;
begin
  v_actividad_id := coalesce(nullif(p_actividad ->> 'legacy_actividad_id', ''), nullif(p_actividad ->> 'actividad_id', ''));
  if v_actividad_id is null or v_actividad_id = '' then
    return jsonb_build_object('success', false, 'error', 'Identificador de actividad invalido.');
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

  -- 2. Insertar o actualizar la cabecera en public.campanas
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
  )
  on conflict (legacy_actividad_id) do update set
    nombre_actividad = excluded.nombre_actividad,
    canal = excluded.canal,
    solicitante_buyer_id = coalesce(excluded.solicitante_buyer_id, campanas.solicitante_buyer_id),
    estado = excluded.estado,
    motivo_solicitud = excluded.motivo_solicitud,
    comprador = excluded.comprador,
    recursos_ocupados = excluded.recursos_ocupados,
    fecha_estado = now(),
    updated_at = now();

  -- 3. Limpiar registros previos de staging para esta actividad si existen
  delete from public.fidelizacion_solicitudes_detalle
  where actividad_id = v_actividad_id and estado = 'PENDIENTE';

  -- 4. Insertar cada fila de detalle
  for v_item in select value from jsonb_array_elements(p_detalles) loop
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
    values (
      v_actividad_id,
      lower(coalesce(nullif(v_item ->> 'canal', ''), lower(v_canal))),
      trim(coalesce(v_item ->> 'sku', '')),
      coalesce(v_item ->> 'division', ''),
      trim(coalesce(v_item ->> 'segmento_id', '')),
      coalesce((v_item ->> 'descuento_anterior')::numeric, 0),
      coalesce((v_item ->> 'descuento_solicitado')::numeric, 0),
      coalesce(v_item ->> 'tipo_cambio', 'NUEVO'),
      'PENDIENTE',
      coalesce(nullif(v_item ->> 'solicitante', ''), v_solicitante),
      coalesce(nullif(v_item ->> 'comprador', ''), v_comprador),
      now()
    );
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'success', true,
    'actividad_id', v_actividad_id,
    'rows_inserted', v_count
  );
end;
$$;

-- 6. RPC Transaccional: Promocion de datos al Finalizar la Solicitud
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
begin
  -- Verificar que existan registros pendientes para la solicitud
  select count(*) into v_count
  from public.fidelizacion_solicitudes_detalle
  where actividad_id = p_actividad_id and estado = 'PENDIENTE';

  if v_count = 0 then
    -- Si no hay pendientes, aun asi verificar si la actividad debe marcarse como Finalizada
    update public.campanas
    set estado = 'Finalizado',
        fecha_finalizado = coalesce(fecha_finalizado, now()),
        fecha_estado = now(),
        updated_at = now()
    where legacy_actividad_id = p_actividad_id;

    return jsonb_build_object(
      'success', true,
      'message', 'No habia registros pendientes en la solicitud o ya habian sido aplicados.',
      'rows_affected', 0
    );
  end if;

  -- Iterar sobre los registros pendientes y aplicar cambios a canasto_fidelizacion
  for v_rec in
    select *
    from public.fidelizacion_solicitudes_detalle
    where actividad_id = p_actividad_id and estado = 'PENDIENTE'
  loop
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

-- 7. Grants y Permisos
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.canasto_fidelizacion to anon, authenticated;
grant select, insert, update, delete on public.fidelizacion_solicitudes_detalle to anon, authenticated;
grant execute on function public.crear_solicitud_fidelizacion(jsonb, jsonb) to anon, authenticated;
grant execute on function public.finalizar_solicitud_fidelizacion(text) to anon, authenticated;

-- 8. Politicas de Seguridad RLS (Row Level Security)
alter table public.canasto_fidelizacion enable row level security;
alter table public.fidelizacion_solicitudes_detalle enable row level security;

-- Lectura para usuarios autenticados y anonimos
drop policy if exists "canasto_fidelizacion_select_policy" on public.canasto_fidelizacion;
create policy "canasto_fidelizacion_select_policy"
  on public.canasto_fidelizacion
  for select
  to authenticated, anon
  using (true);

drop policy if exists "fidelizacion_solicitudes_detalle_select_policy" on public.fidelizacion_solicitudes_detalle;
create policy "fidelizacion_solicitudes_detalle_select_policy"
  on public.fidelizacion_solicitudes_detalle
  for select
  to authenticated, anon
  using (true);

-- Escritura para roles operativos en public.usuarios_app
drop policy if exists "canasto_fidelizacion_write_policy" on public.canasto_fidelizacion;
create policy "canasto_fidelizacion_write_policy"
  on public.canasto_fidelizacion
  for all
  to authenticated
  using (
    exists (
      select 1 from public.usuarios_app u
      where u.auth_user_id = auth.uid()
        and u.activo = true
        and u.rol in ('ADMIN', 'BUYER', 'COMPRADOR', 'OPER', 'PRICING', 'MERCADEO', 'MARK')
    )
  )
  with check (
    exists (
      select 1 from public.usuarios_app u
      where u.auth_user_id = auth.uid()
        and u.activo = true
        and u.rol in ('ADMIN', 'BUYER', 'COMPRADOR', 'OPER', 'PRICING', 'MERCADEO', 'MARK')
    )
  );

drop policy if exists "fidelizacion_solicitudes_detalle_write_policy" on public.fidelizacion_solicitudes_detalle;
create policy "fidelizacion_solicitudes_detalle_write_policy"
  on public.fidelizacion_solicitudes_detalle
  for all
  to authenticated
  using (
    exists (
      select 1 from public.usuarios_app u
      where u.auth_user_id = auth.uid()
        and u.activo = true
        and u.rol in ('ADMIN', 'BUYER', 'COMPRADOR', 'OPER', 'PRICING', 'MERCADEO', 'MARK')
    )
  )
  with check (
    exists (
      select 1 from public.usuarios_app u
      where u.auth_user_id = auth.uid()
        and u.activo = true
        and u.rol in ('ADMIN', 'BUYER', 'COMPRADOR', 'OPER', 'PRICING', 'MERCADEO', 'MARK')
    )
  );

-- Politica permisiva anon para pruebas de integracion
drop policy if exists "canasto_fidelizacion_anon_policy" on public.canasto_fidelizacion;
create policy "canasto_fidelizacion_anon_policy"
  on public.canasto_fidelizacion
  for all
  to anon
  using (true)
  with check (true);

drop policy if exists "fidelizacion_solicitudes_detalle_anon_policy" on public.fidelizacion_solicitudes_detalle;
create policy "fidelizacion_solicitudes_detalle_anon_policy"
  on public.fidelizacion_solicitudes_detalle
  for all
  to anon
  using (true)
  with check (true);


