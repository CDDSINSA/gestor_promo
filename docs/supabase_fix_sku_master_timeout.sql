-- =============================================================================
-- Paso 34. Corrección de timeout en recarga de maestro de artículos y costos
-- =============================================================================
-- Requiere: supabase_margenes_promociones.sql (paso 33) o supabase_sku_master.sql (paso 12).
-- Actualizado 15-10-2026: el costo es AV_COST (campo 'av_cost'), siempre en C$, sin
-- tasa ni moneda. Requiere el paso 33 actualizado (quita las columnas de moneda).
-- Repetible: sí. Destructivo: no (no altera datos por sí mismo).
--
-- Motivo:
--   Al recargar el catálogo maestro desde Ajustes > Maestro de SKU, la RPC
--   clear_sku_master realizaba un DELETE sobre sku_master y sku_costos. En tablas
--   con decenas de miles de registros e índices, el DELETE excedía el statement_timeout
--   por defecto de PostgREST en Supabase (8 segundos), abortando la operación con
--   error 57014 (canceling statement due to statement timeout).
--
-- Qué corrige:
--   1. clear_sku_master: usa TRUNCATE TABLE (operación instantánea en milisegundos)
--      en lugar de DELETE fila por fila, y fija statement_timeout = '60s'.
--   2. insert_sku_master_batch: fija statement_timeout = '60s' para asegurar que
--      lotes con costos y validaciones se completen sin interrupción.
--   3. margen_completar_costos y completar_costos_promociones: fijan statement_timeout = '60s'
--      y ajustan el lote por defecto a 1.000 para procesamiento rápido y fluido.
-- =============================================================================

begin;

-- 1. clear_sku_master: TRUNCATE instantáneo + timeout extendido para ADMIN
create or replace function public.clear_sku_master()
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '60s'
as $$
declare
  v_count_before integer;
begin
  if not public.is_role('ADMIN') then
    raise exception 'Solo un administrador puede recargar el maestro de artículos.' using errcode = '42501';
  end if;

  select count(*) into v_count_before from public.sku_master;
  
  -- TRUNCATE libera las páginas en milisegundos sin recorrer tupla por tupla ni generar WAL masivo
  truncate table public.sku_master, public.sku_costos;

  return jsonb_build_object(
    'ok', true,
    'deleted_count', coalesce(v_count_before, 0),
    'message', 'Tabla sku_master y sku_costos vaciadas correctamente para recarga desde cero.',
    'cleared_at', now()
  );
end;
$$;

revoke all on function public.clear_sku_master() from public, anon;
grant execute on function public.clear_sku_master() to authenticated;

-- 2. insert_sku_master_batch: timeout extendido a 60s
create or replace function public.insert_sku_master_batch(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '60s'
as $$
declare
  v_inserted integer := 0;
  v_costs integer := 0;
begin
  if not public.is_role('ADMIN') then
    raise exception 'Solo un administrador puede recargar el maestro de artículos.' using errcode = '42501';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    return jsonb_build_object('ok', true, 'inserted', 0, 'costs', 0);
  end if;

  insert into public.sku_master (
    sku, num_parte, descripcion, dep_id, unidad_medida, proveedor, precio_regular, activo, actualizado_el
  )
  select distinct on (trim(elem->>'sku'))
    trim(elem->>'sku'),
    coalesce(nullif(trim(elem->>'num_parte'), ''), nullif(trim(elem->>'vpn'), '')),
    coalesce(nullif(trim(elem->>'descripcion'), ''), 'Sin descripción'),
    nullif(trim(elem->>'dep_id'), ''),
    nullif(trim(elem->>'unidad_medida'), ''),
    nullif(trim(elem->>'proveedor'), ''),
    case
      when coalesce(elem->>'precio_regular', '') <> '' then (elem->>'precio_regular')::numeric
      when coalesce(elem->>'precio', '') <> '' then (elem->>'precio')::numeric
      else null
    end,
    coalesce((elem->>'activo')::boolean, true),
    now()
  from jsonb_array_elements(p_rows) as elem
  where coalesce(trim(elem->>'sku'), '') <> ''
  order by trim(elem->>'sku')
  on conflict (sku) do update set
    num_parte = excluded.num_parte,
    descripcion = excluded.descripcion,
    dep_id = excluded.dep_id,
    unidad_medida = excluded.unidad_medida,
    proveedor = excluded.proveedor,
    precio_regular = excluded.precio_regular,
    activo = excluded.activo,
    actualizado_el = now();

  get diagnostics v_inserted = row_count;

  -- 'av_cost' = AV_COST (costo promedio), siempre en C$. Se guarda sin conversión.
  insert into public.sku_costos (sku, unit_cost, actualizado_el)
  select distinct on (trim(elem->>'sku'))
    trim(elem->>'sku'),
    (elem->>'av_cost')::numeric,
    now()
  from jsonb_array_elements(p_rows) as elem
  where coalesce(trim(elem->>'sku'), '') <> ''
    and coalesce(trim(elem->>'av_cost'), '') <> ''
    and (elem->>'av_cost')::numeric >= 0
  order by trim(elem->>'sku')
  on conflict (sku) do update set
    unit_cost = excluded.unit_cost,
    actualizado_el = now();

  get diagnostics v_costs = row_count;

  return jsonb_build_object(
    'ok', true,
    'inserted', v_inserted,
    'costs', v_costs,
    'timestamp', now()
  );
end;
$$;

revoke all on function public.insert_sku_master_batch(jsonb) from public, anon;
grant execute on function public.insert_sku_master_batch(jsonb) to authenticated;

-- 3. margen_completar_costos y completar_costos_promociones: timeout 60s y lotes óptimos
create or replace function public.margen_completar_costos(p_limit integer default 1000)
returns integer
language plpgsql
security definer
set search_path = public
set statement_timeout = '60s'
as $$
declare
  v_count integer := 0;
begin
  with pendientes as (
    select pc.promocion_id, sc.unit_cost
      from public.promociones_costo pc
      join lateral (
        select s.unit_cost
          from public.sku_costos s
         where s.sku_key = pc.sku_key
         order by (s.sku = pc.sku) desc
         limit 1
      ) sc on true
     where pc.fuente = 'SIN_COSTO'
     limit greatest(coalesce(p_limit, 1000), 1)
  )
  update public.promociones_costo pc
     set costo_nio = p.unit_cost,
         fuente = 'COMPLETADO',
         capturado_el = now()
    from pendientes p
   where pc.promocion_id = p.promocion_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.margen_completar_costos(integer) from public, anon, authenticated;

create or replace function public.completar_costos_promociones(p_limit integer default 1000)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '60s'
as $$
declare
  v_completed integer;
begin
  if not public.is_role('ADMIN') then
    raise exception 'Solo un administrador puede completar costos de promociones.' using errcode = '42501';
  end if;
  v_completed := public.margen_completar_costos(least(greatest(coalesce(p_limit, 1000), 1), 10000));
  return jsonb_build_object('ok', true, 'completed', v_completed);
end;
$$;

revoke all on function public.completar_costos_promociones(integer) from public, anon;
grant execute on function public.completar_costos_promociones(integer) to authenticated;

commit;
