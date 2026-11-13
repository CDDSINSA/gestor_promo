-- =============================================================================
-- Paso 35. Clasificación ABC del maestro de artículos (actualización parcial)
-- =============================================================================
-- Requiere: supabase_sku_master.sql (paso 12), supabase_roles_permissions_mvp.sql
-- (is_role) y supabase_margenes_promociones.sql (paso 33: margen_sku_key).
-- Repetible: sí. Destructivo: no (no toca sku_master, sku_costos ni promociones).
--
-- Qué hace:
--   1. clasificacion_abc_catalogo: equivalencias código ↔ nombre (1 AA ... 11 Quebrada).
--   2. sku_clasificacion_abc: clasificación vigente por SKU. Tabla aparte del maestro
--      para que SOBREVIVA a la recarga completa (clear_sku_master hace TRUNCATE de
--      sku_master y sku_costos, no de esta tabla).
--   3. Vista sku_master_abc: el maestro con su clasificación. Todo SKU del maestro sin
--      clasificación cargada se reporta como 8 (Nuevo). (Corregido en paso 36; antes 3.)
--   4. RPC (solo ADMIN):
--        cargar_clasificacion_abc_lote(p_carga_id, p_rows)  -> upsert por lotes
--        aplicar_clasificacion_abc(p_carga_id)              -> borra lo que no vino
--      La app genera un p_carga_id por archivo, sube los lotes y al final aplica.
--      Si un lote falla, no se aplica y la clasificación anterior de los SKU que no
--      alcanzaron a subir se conserva (no queda todo en 3 por un error a medias).
--   5. get_clasificacion_abc_resumen(): conteos para Ajustes > Maestro de SKU.
--
-- Origen: reporte UDA del ERP (UDA_ID, UDA_DESC, UDA_ITEM, UDA_VALUE). Solo se toman
-- las filas con UDA_ID = 4 (SINSA Product Classification). El filtrado y la
-- conversión de nombres a código los hace la app (skuMasterParser.js).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Catálogo de clasificaciones.
-- -----------------------------------------------------------------------------
create table if not exists public.clasificacion_abc_catalogo (
  codigo smallint primary key check (codigo between 1 and 11),
  nombre text not null
);

insert into public.clasificacion_abc_catalogo (codigo, nombre) values
  (1, 'AA'),
  (2, 'C'),
  (3, 'Descontinuado'),
  (4, 'B'),
  (5, 'A'),
  (6, 'Lento Movimiento'),
  (7, 'Temporada'),
  (8, 'Nuevo'),
  (9, 'Inventario Duro'),
  (10, 'Servicio'),
  (11, 'Quebrada')
on conflict (codigo) do update set nombre = excluded.nombre;

comment on table public.clasificacion_abc_catalogo is 'Equivalencias de la clasificación ABC (UDA 4 del ERP).';

-- -----------------------------------------------------------------------------
-- 2. Clasificación por SKU.
-- -----------------------------------------------------------------------------
create table if not exists public.sku_clasificacion_abc (
  sku varchar(50) primary key,
  clasificacion smallint not null references public.clasificacion_abc_catalogo(codigo),
  carga_id uuid not null,
  actualizado_el timestamptz not null default now()
);

alter table public.sku_clasificacion_abc
  add column if not exists sku_key text generated always as (public.margen_sku_key(sku)) stored;
create index if not exists idx_sku_clasificacion_abc_sku_key on public.sku_clasificacion_abc (sku_key);
create index if not exists idx_sku_clasificacion_abc_carga on public.sku_clasificacion_abc (carga_id);
-- Mismo índice que crea el paso 33 (se pierde si se re-ejecuta el paso 12).
create index if not exists idx_sku_master_margen_key on public.sku_master (public.margen_sku_key(sku));

comment on table public.sku_clasificacion_abc is 'Clasificación ABC vigente por SKU. Se reemplaza con cada archivo UDA; no se borra al recargar el maestro.';
comment on column public.sku_clasificacion_abc.clasificacion is 'Código de clasificacion_abc_catalogo. SKU sin fila = 8 (Nuevo).';

-- Lectura para usuarios autenticados (dato no sensible); escritura solo por RPC.
alter table public.clasificacion_abc_catalogo enable row level security;
alter table public.sku_clasificacion_abc enable row level security;

drop policy if exists "Lectura clasificacion_abc_catalogo" on public.clasificacion_abc_catalogo;
create policy "Lectura clasificacion_abc_catalogo" on public.clasificacion_abc_catalogo
  for select to authenticated using (true);

drop policy if exists "Lectura sku_clasificacion_abc" on public.sku_clasificacion_abc;
create policy "Lectura sku_clasificacion_abc" on public.sku_clasificacion_abc
  for select to authenticated using (true);

revoke all on public.clasificacion_abc_catalogo, public.sku_clasificacion_abc from anon, authenticated;
grant select on public.clasificacion_abc_catalogo, public.sku_clasificacion_abc to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Vista: maestro con clasificación (por defecto 8 = Nuevo).
--    security_invoker: respeta el RLS de sku_master y de las tablas de arriba.
-- -----------------------------------------------------------------------------
create or replace view public.sku_master_abc
with (security_invoker = true) as
select
  m.sku,
  m.num_parte,
  m.descripcion,
  m.dep_id,
  m.unidad_medida,
  m.proveedor,
  m.precio_regular,
  m.activo,
  m.actualizado_el,
  coalesce(c.clasificacion, 8)::smallint as clasificacion_abc,
  cat.nombre as clasificacion_abc_nombre,
  (c.clasificacion is not null) as clasificacion_abc_cargada
from public.sku_master m
left join lateral (
  select x.clasificacion
    from public.sku_clasificacion_abc x
   where x.sku_key = public.margen_sku_key(m.sku)
   order by (x.sku = m.sku) desc
   limit 1
) c on true
left join public.clasificacion_abc_catalogo cat on cat.codigo = coalesce(c.clasificacion, 8);

comment on view public.sku_master_abc is 'Maestro de artículos con clasificación ABC. Sin clasificación cargada = 8 (Nuevo).';

revoke all on public.sku_master_abc from anon, authenticated;
grant select on public.sku_master_abc to authenticated;

-- -----------------------------------------------------------------------------
-- 4. RPC de carga (solo ADMIN).
-- -----------------------------------------------------------------------------
create or replace function public.cargar_clasificacion_abc_lote(p_carga_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '60s'
as $$
declare
  v_upserted integer := 0;
begin
  if not coalesce(public.is_role('ADMIN'), false) then
    raise exception 'Solo un administrador puede actualizar la clasificación ABC.' using errcode = '42501';
  end if;
  if p_carga_id is null then
    raise exception 'Falta el identificador de la carga.' using errcode = '22023';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    return jsonb_build_object('ok', true, 'upserted', 0);
  end if;

  insert into public.sku_clasificacion_abc (sku, clasificacion, carga_id, actualizado_el)
  select distinct on (trim(elem->>'sku'))
    trim(elem->>'sku'),
    trim(elem->>'clasificacion_abc')::smallint,
    p_carga_id,
    now()
  from jsonb_array_elements(p_rows) as elem
  where coalesce(trim(elem->>'sku'), '') <> ''
    and coalesce(trim(elem->>'clasificacion_abc'), '') ~ '^([1-9]|1[01])$'
  order by trim(elem->>'sku')
  on conflict (sku) do update set
    clasificacion = excluded.clasificacion,
    carga_id = excluded.carga_id,
    actualizado_el = now();

  get diagnostics v_upserted = row_count;
  return jsonb_build_object('ok', true, 'upserted', v_upserted);
end;
$$;

revoke all on function public.cargar_clasificacion_abc_lote(uuid, jsonb) from public, anon;
grant execute on function public.cargar_clasificacion_abc_lote(uuid, jsonb) to authenticated;

create or replace function public.get_clasificacion_abc_resumen()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set statement_timeout = '60s'
as $$
declare
  v_clasificados integer;
  v_last timestamptz;
  v_maestro integer;
  v_maestro_cargados integer;
  v_por_codigo jsonb;
begin
  select count(*), max(actualizado_el) into v_clasificados, v_last from public.sku_clasificacion_abc;
  select count(*) into v_maestro from public.sku_master;
  select count(*) into v_maestro_cargados
    from public.sku_master m
   where exists (select 1 from public.sku_clasificacion_abc c where c.sku_key = public.margen_sku_key(m.sku));
  select coalesce(jsonb_object_agg(clasificacion, total), '{}'::jsonb) into v_por_codigo
    from (select clasificacion, count(*) as total from public.sku_clasificacion_abc group by clasificacion) t;

  return jsonb_build_object(
    'ok', true,
    'total_clasificados', coalesce(v_clasificados, 0),
    'last_updated', v_last,
    'maestro_total', coalesce(v_maestro, 0),
    'maestro_con_clasificacion', coalesce(v_maestro_cargados, 0),
    'maestro_sin_clasificacion', greatest(coalesce(v_maestro, 0) - coalesce(v_maestro_cargados, 0), 0),
    -- Alias anterior (compatibilidad con la app publicada antes del paso 36).
    'maestro_descontinuado_por_defecto', greatest(coalesce(v_maestro, 0) - coalesce(v_maestro_cargados, 0), 0),
    'por_codigo', v_por_codigo
  );
end;
$$;

revoke all on function public.get_clasificacion_abc_resumen() from public, anon;
grant execute on function public.get_clasificacion_abc_resumen() to authenticated;

create or replace function public.aplicar_clasificacion_abc(p_carga_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '60s'
as $$
declare
  v_eliminados integer := 0;
begin
  if not coalesce(public.is_role('ADMIN'), false) then
    raise exception 'Solo un administrador puede actualizar la clasificación ABC.' using errcode = '42501';
  end if;
  -- Protección: nunca vaciar la tabla si la carga no subió ninguna fila.
  if p_carga_id is null or not exists (select 1 from public.sku_clasificacion_abc where carga_id = p_carga_id) then
    raise exception 'La carga de clasificación ABC no tiene registros; no se aplicó ningún cambio.' using errcode = '22023';
  end if;

  -- SKU que no vinieron en este archivo: se quitan y pasan a 8 (Nuevo).
  delete from public.sku_clasificacion_abc where carga_id <> p_carga_id;
  get diagnostics v_eliminados = row_count;

  return public.get_clasificacion_abc_resumen() || jsonb_build_object('eliminados', v_eliminados);
end;
$$;

revoke all on function public.aplicar_clasificacion_abc(uuid) from public, anon;
grant execute on function public.aplicar_clasificacion_abc(uuid) to authenticated;

commit;
