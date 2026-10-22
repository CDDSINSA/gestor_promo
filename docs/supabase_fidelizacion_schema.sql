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

-- Solo Comprador y Ejecutor pueden operar Fidelizacion.
create or replace function public.fidelizacion_buyer_allowed(p_buyer uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.current_user_role() = 'OPER' or
  (public.current_user_role() = 'BUYER' and p_buyer = any(public.current_buyer_scope_ids())), false); $$;

create or replace function public.fidelizacion_owner_allowed(p_comprador text)
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.current_user_role() = 'OPER' or
  (public.current_user_role() = 'BUYER' and exists (
    select 1 from public.compradores c where c.id = any(public.current_buyer_scope_ids())
      and lower(trim(c.comprador)) = lower(trim(p_comprador)) and nullif(trim(c.comprador), '') is not null
  )), false); $$;

create or replace function public.fidelizacion_request_allowed(p_actividad text)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.campanas c
  where c.legacy_actividad_id = p_actividad and c.legacy_actividad_id like 'FID-%'
    and c.tipo_actividad = 'ESPECIAL' and public.fidelizacion_buyer_allowed(c.solicitante_buyer_id)); $$;

-- No permite apropiarse de SKU ya asignados a otro comprador del canasto.
create or replace function public.fidelizacion_sku_allowed(p_sku text)
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.current_user_role() = 'OPER' or
  (public.current_user_role() = 'BUYER' and not exists (
    select 1 from public.canasto_fidelizacion f where f.sku = p_sku
      and not public.fidelizacion_owner_allowed(f.comprador)
  )), false); $$;

-- Protege cabeceras incluso cuando otras RPC SECURITY DEFINER escriben campanas.
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
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;
drop trigger if exists guard_fidelizacion_campana on public.campanas;
create trigger guard_fidelizacion_campana before insert or update or delete on public.campanas
for each row execute function public.guard_fidelizacion_campana();


-- Las RPC con privilegios del propietario tampoco pueden eludir el alcance.
create or replace function public.guard_fidelizacion_rows()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
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
revoke all on function public.guard_fidelizacion_rows() from public, anon;
drop trigger if exists guard_fidelizacion_rows on public.canasto_fidelizacion;
create trigger guard_fidelizacion_rows before insert or update or delete on public.canasto_fidelizacion
for each row execute function public.guard_fidelizacion_rows();
drop trigger if exists guard_fidelizacion_rows on public.fidelizacion_solicitudes_detalle;
create trigger guard_fidelizacion_rows before insert or update or delete on public.fidelizacion_solicitudes_detalle
for each row execute function public.guard_fidelizacion_rows();

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
  -- Serializa solicitudes del mismo identificador, incluida su primera creacion.
  perform pg_advisory_xact_lock(hashtextextended(v_actividad_id, 0));
  if exists (select 1 from public.campanas where legacy_actividad_id = v_actividad_id) then
    if not public.fidelizacion_request_allowed(v_actividad_id) then
      raise exception 'Solicitud fuera de su alcance.' using errcode = '42501';
    end if;
    if exists (select 1 from public.campanas where legacy_actividad_id = v_actividad_id and estado in ('Finalizado', 'Archivado')) then
      raise exception 'No se puede reemplazar una solicitud finalizada.';
    end if;
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
    if not public.fidelizacion_sku_allowed(trim(v_item ->> 'sku')) then
      raise exception 'SKU fuera de su alcance de Fidelizacion.' using errcode = '42501';
    end if;
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
      v_comprador,
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

-- 7. Eliminar permisos abiertos anteriores (las politicas permisivas se suman).
revoke all on public.canasto_fidelizacion, public.fidelizacion_solicitudes_detalle from public, anon;
grant select, insert, update, delete on public.canasto_fidelizacion, public.fidelizacion_solicitudes_detalle to authenticated;
revoke all on function public.crear_solicitud_fidelizacion(jsonb, jsonb) from public, anon;
revoke all on function public.finalizar_solicitud_fidelizacion(text) from public, anon;
grant execute on function public.crear_solicitud_fidelizacion(jsonb, jsonb), public.finalizar_solicitud_fidelizacion(text) to authenticated;

alter table public.canasto_fidelizacion enable row level security;
alter table public.fidelizacion_solicitudes_detalle enable row level security;
do $$ declare p record; begin
  for p in select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in ('canasto_fidelizacion', 'fidelizacion_solicitudes_detalle')
  loop execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename); end loop;
end; $$;
create policy fidelizacion_canasto_scoped on public.canasto_fidelizacion for all to authenticated
using (public.fidelizacion_owner_allowed(comprador))
with check (public.fidelizacion_owner_allowed(comprador) and public.fidelizacion_sku_allowed(sku));
create policy fidelizacion_detalle_scoped on public.fidelizacion_solicitudes_detalle for all to authenticated
using (public.fidelizacion_request_allowed(actividad_id) and public.fidelizacion_owner_allowed(comprador))
with check (public.fidelizacion_request_allowed(actividad_id) and public.fidelizacion_owner_allowed(comprador)
  and public.fidelizacion_sku_allowed(sku));

-- Cabeceras de Fidelizacion tampoco se exponen por lectura general de campanas.
drop policy if exists fidelizacion_campanas_scope on public.campanas;
create policy fidelizacion_campanas_scope on public.campanas as restrictive for all to authenticated
using (legacy_actividad_id not like 'FID-%' or public.fidelizacion_buyer_allowed(solicitante_buyer_id))
with check (legacy_actividad_id not like 'FID-%' or public.fidelizacion_buyer_allowed(solicitante_buyer_id));

revoke all on function public.fidelizacion_buyer_allowed(uuid), public.fidelizacion_owner_allowed(text),
  public.fidelizacion_request_allowed(text), public.fidelizacion_sku_allowed(text), public.guard_fidelizacion_campana() from public, anon;
grant execute on function public.fidelizacion_buyer_allowed(uuid), public.fidelizacion_owner_allowed(text),
  public.fidelizacion_request_allowed(text), public.fidelizacion_sku_allowed(text) to authenticated;
