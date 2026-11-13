-- =============================================================================
-- Paso 33. Monitoreo de márgenes: costos del maestro, costo guardado por promoción
-- y consulta de márgenes para catálogos y solicitudes especiales.
-- =============================================================================
-- Requiere: supabase_schema.sql, supabase_delta_operativo_2026_06_22.sql
-- (jerarquia_categorias), supabase_roles_permissions_mvp.sql (current_*, is_role,
-- is_any_role, current_buyer_scope_ids) y supabase_sku_master.sql (paso 12).
-- Repetible: sí. Destructivo: no borra promociones. Ver "Corrección AV_COST" abajo.
--
-- IMPORTANTE: si se vuelve a ejecutar supabase_sku_master.sql (paso 12), ejecutar
-- de nuevo este script: el paso 12 reinstala las RPC del maestro sin costos.
--
-- Qué hace:
--   1. sku_costos: costo por SKU = AV_COST (costo promedio) del reporte del maestro.
--      AV_COST viene SIEMPRE en córdobas: no hay conversión de moneda ni tasa. Se
--      llena en la MISMA carga del maestro (insert_sku_master_batch, campo 'av_cost')
--      y se vacía con clear_sku_master. Al final de la carga la app llama
--      completar_costos_promociones (por tramos) para llenar el costo de promociones
--      que estaban sin costo.
--   2. promociones_costo: costo guardado de cada línea de promoción, en C$. Lo llena
--      un trigger al crear la promoción o cambiar su SKU. El margen se calcula SIEMPRE
--      con este costo guardado.
--   3. Parámetro en configuracion: MARGEN_SEMAFORO (verde >= 30, naranja >= 20,
--      amarillo >= 10, rojo < 10). Editable por ADMIN.
--   4. RPC consultar_margenes_promociones: solo ADMIN, OPER y BUYER (el comprador
--      solo ve las promociones de su alcance, igual que en Promociones).
--   5. Las RPC del maestro quedan restringidas a ADMIN (antes cualquier usuario
--      autenticado podía vaciar o cargar el maestro).
--
-- Seguridad: sku_costos y promociones_costo tienen RLS activo SIN políticas y sin
-- privilegios para anon/authenticated: no se pueden leer por REST. Solo se accede
-- con las RPC de este script. No se tocan las vistas consolidado / export_* ni el
-- Excel de respaldo.
--
-- Después de ejecutar: recargar el maestro desde Ajustes con el reporte que trae
-- AV_COST. Esa carga completa el costo de las promociones existentes (fuente
-- COMPLETADO).
--
-- Corrección AV_COST (15-10-2026): la primera versión tomaba UNIT_COST y convertía
-- a C$ con una tasa si ORIGIN_COUNTRY_ID <> 'NI'. Era incorrecto. Este script:
--   - quita las columnas de moneda/origen/tasa y el parámetro TASA_CAMBIO_USD;
--   - UNA SOLA VEZ (marca MARGEN_COSTO_AV_COST en configuracion) vacía sku_costos y
--     deja todas las promociones en SIN_COSTO, porque esos costos venían de la
--     columna equivocada. La siguiente carga del maestro las completa con AV_COST.
--   - En ejecuciones posteriores no vuelve a borrar costos.
-- Si también se ejecutó el paso 34 (supabase_fix_sku_master_timeout.sql), no hace
-- falta repetirlo: este script ya instala las mismas funciones con timeout de 60 s.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Helpers.
-- -----------------------------------------------------------------------------
-- Clave de SKU sin ceros a la izquierda (el maestro y las promos pueden diferir).
create or replace function public.margen_sku_key(p_sku text)
returns text
language sql
immutable
as $$
  select case
    when btrim(coalesce(p_sku, '')) ~ '^[0-9]+$'
      then coalesce(nullif(ltrim(btrim(p_sku), '0'), ''), '0')
    else btrim(coalesce(p_sku, ''))
  end;
$$;

create or replace function public.margen_config_numero(p_valor jsonb, p_default numeric)
returns numeric
language plpgsql
immutable
as $$
begin
  if p_valor is null then return p_default; end if;
  if jsonb_typeof(p_valor) = 'number' then return (p_valor #>> '{}')::numeric; end if;
  if jsonb_typeof(p_valor) = 'string' then return replace(p_valor #>> '{}', ',', '.')::numeric; end if;
  if jsonb_typeof(p_valor) = 'object' and p_valor ? 'valor' then
    return replace(p_valor ->> 'valor', ',', '.')::numeric;
  end if;
  return p_default;
exception when others then
  return p_default;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Parámetros (no sobrescribe valores ya configurados).
-- -----------------------------------------------------------------------------
insert into public.configuracion (clave, valor, categoria, descripcion)
values
  ('MARGEN_SEMAFORO', '{"verde": 30, "naranja": 20, "amarillo": 10}'::jsonb, 'MARGENES',
   'Cortes del semáforo de margen (%): verde >= verde, naranja >= naranja, amarillo >= amarillo, rojo menor.')
on conflict (clave) do nothing;

-- Ya no hay tasa de cambio: AV_COST viene en C$.
delete from public.configuracion where clave = 'TASA_CAMBIO_USD';

-- -----------------------------------------------------------------------------
-- 3. Tablas.
-- -----------------------------------------------------------------------------
create table if not exists public.sku_costos (
  sku varchar(50) primary key,
  unit_cost numeric(16, 4) not null check (unit_cost >= 0),
  actualizado_el timestamptz not null default now()
);

-- Clave normalizada guardada (columna generada + índice btree): las búsquedas y la
-- conciliación con promociones usan igualdad simple, sin calcular funciones por fila.
alter table public.sku_costos
  add column if not exists sku_key text generated always as (public.margen_sku_key(sku)) stored;
drop index if exists public.idx_sku_costos_key;
create index if not exists idx_sku_costos_sku_key on public.sku_costos (sku_key);
-- Búsqueda del maestro por clave normalizada (se pierde si se re-ejecuta el paso 12).
create index if not exists idx_sku_master_margen_key on public.sku_master (public.margen_sku_key(sku));

comment on table public.sku_costos is 'Costo unitario por SKU cargado junto con el maestro. Acceso solo por RPC.';
comment on column public.sku_costos.unit_cost is 'AV_COST (costo promedio) del reporte del maestro, siempre en C$. Sin conversión.';

create table if not exists public.promociones_costo (
  promocion_id uuid primary key references public.promociones(id) on delete cascade,
  sku text not null default '',
  costo_nio numeric(16, 4),
  fuente text not null default 'SIN_COSTO' check (fuente in ('CAPTURA', 'COMPLETADO', 'SIN_COSTO')),
  capturado_el timestamptz not null default now()
);

alter table public.promociones_costo
  add column if not exists sku_key text generated always as (public.margen_sku_key(sku)) stored;
drop index if exists public.idx_promociones_costo_sin_costo;
create index if not exists idx_promociones_costo_pendiente
  on public.promociones_costo (sku_key)
  where fuente = 'SIN_COSTO';

comment on column public.promociones_costo.costo_nio is 'AV_COST del SKU (C$) al momento de guardar el costo.';
comment on table public.promociones_costo is 'Costo guardado de cada línea de promoción. CAPTURA: al crear; COMPLETADO: llenado después en una carga del maestro; SIN_COSTO: aún sin costo.';

alter table public.sku_costos enable row level security;
alter table public.promociones_costo enable row level security;
revoke all on public.sku_costos from anon, authenticated;
revoke all on public.promociones_costo from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3b. Corrección AV_COST: una sola vez, borra los costos tomados de UNIT_COST
--     (columna equivocada y convertida con tasa). Antes de quitar las columnas.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from public.configuracion where clave = 'MARGEN_COSTO_AV_COST') then
    truncate table public.sku_costos;
    update public.promociones_costo
       set costo_nio = null,
           fuente = 'SIN_COSTO',
           capturado_el = now()
     where fuente <> 'SIN_COSTO' or costo_nio is not null;
    insert into public.configuracion (clave, valor, categoria, descripcion)
    values ('MARGEN_COSTO_AV_COST', to_jsonb(now()::text), 'MARGENES',
            'Marca: costos reiniciados para usar AV_COST (C$) en lugar de UNIT_COST. No borrar.');
  end if;
end;
$$;

alter table public.sku_costos
  drop column if exists origin_country_id,
  drop column if exists moneda;
alter table public.promociones_costo
  drop column if exists unit_cost_original,
  drop column if exists origin_country_id,
  drop column if exists moneda,
  drop column if exists tasa_cambio;

-- -----------------------------------------------------------------------------
-- 4. Captura del costo al crear la promoción o cambiar su SKU.
-- -----------------------------------------------------------------------------
create or replace function public.margen_guardar_costo_promocion(p_promocion_id uuid, p_sku text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_costo record;
begin
  -- unit_cost = AV_COST en C$: se guarda tal cual, sin conversión.
  select sc.sku, sc.unit_cost
    into v_costo
    from public.sku_costos sc
   where sc.sku_key = public.margen_sku_key(p_sku)
   order by (sc.sku = btrim(p_sku)) desc
   limit 1;

  insert into public.promociones_costo as pc (
    promocion_id, sku, costo_nio, fuente, capturado_el
  )
  values (
    p_promocion_id,
    btrim(coalesce(p_sku, '')),
    v_costo.unit_cost,
    case when v_costo.unit_cost is null then 'SIN_COSTO' else 'CAPTURA' end,
    now()
  )
  on conflict (promocion_id) do update set
    sku = excluded.sku,
    costo_nio = excluded.costo_nio,
    fuente = excluded.fuente,
    capturado_el = excluded.capturado_el;
end;
$$;

revoke all on function public.margen_guardar_costo_promocion(uuid, text) from public, anon, authenticated;

create or replace function public.promociones_capturar_costo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- El guardado hace upsert y reescribe sku aunque no cambie: solo se recaptura si
  -- la línea es nueva, si cambió el SKU o si aún no tiene registro de costo.
  if tg_op = 'INSERT'
     or public.margen_sku_key(new.sku) is distinct from public.margen_sku_key(old.sku)
     or not exists (select 1 from public.promociones_costo pc where pc.promocion_id = new.id) then
    perform public.margen_guardar_costo_promocion(new.id, new.sku);
  end if;
  return new;
end;
$$;

drop trigger if exists promociones_capturar_costo on public.promociones;
create trigger promociones_capturar_costo
after insert or update of sku on public.promociones
for each row execute function public.promociones_capturar_costo();

-- Completa líneas SIN_COSTO con el costo de sku_costos, por tramos (p_limit filas por
-- llamada) para no exceder el statement_timeout de Supabase. Devuelve filas completadas.
drop function if exists public.margen_completar_costos(text[]);
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

-- Registro inicial para las promociones existentes (quedan SIN_COSTO hasta la
-- próxima carga del maestro con costos, que las completa).
insert into public.promociones_costo (promocion_id, sku, fuente)
select p.id, btrim(p.sku), 'SIN_COSTO'
  from public.promociones p
 where not exists (select 1 from public.promociones_costo pc where pc.promocion_id = p.id);

do $$
begin
  while public.margen_completar_costos(2000) > 0 loop
  end loop;
end;
$$;

-- RPC que llama la app al terminar la carga del maestro (solo ADMIN), en tramos.
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

-- -----------------------------------------------------------------------------
-- 5. RPC del maestro: mismas firmas, ahora con costos y solo para ADMIN.
-- -----------------------------------------------------------------------------
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
  -- El costo de promociones pendientes se completa al final de la carga con
  -- completar_costos_promociones (por tramos), no en cada lote.

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

create or replace function public.get_sku_master_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_last_updated timestamptz;
  v_costs integer;
begin
  select count(*), max(actualizado_el) into v_total, v_last_updated from public.sku_master;
  select count(*) into v_costs from public.sku_costos;
  return jsonb_build_object(
    'ok', true,
    'total', coalesce(v_total, 0),
    'total_costos', coalesce(v_costs, 0),
    'last_updated', v_last_updated
  );
end;
$$;

grant execute on function public.get_sku_master_summary() to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Consulta de márgenes (ADMIN, OPER y BUYER de su alcance).
--    Devuelve líneas; el cálculo por tipo de promoción y grupo de oferta se hace
--    en el módulo (src/features/margins/marginEngine.js).
-- -----------------------------------------------------------------------------
drop function if exists public.consultar_margenes_promociones(uuid, text, text, text, text, text);
drop function if exists public.consultar_margenes_promociones(text, text, text, text, text, text);
create or replace function public.consultar_margenes_promociones(
  p_comprador text default null,
  p_division text default null,
  p_tipo_actividad text default null,
  p_actividad text default null,
  p_tipo_promo text default null,
  p_sku text default null
)
returns table (
  promocion_id uuid,
  row_id text,
  actividad_id text,
  nombre_actividad text,
  tipo_actividad text,
  fecha_inicio date,
  fecha_fin date,
  buyer_id uuid,
  comprador text,
  division text,
  dep_id text,
  oferta_id text,
  tipo_promo text,
  grupo_oferta text,
  tipo_sku text,
  variante text,
  sku text,
  descripcion text,
  tipo_cantidad text,
  cantidad_minima numeric,
  precio_antes numeric,
  precio_ahora numeric,
  descuento text,
  precio_regular numeric,
  estado_registro text,
  costo_nio numeric,
  fuente_costo text,
  costo_capturado_el timestamptz,
  costo_vigente_nio numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_is_buyer boolean := public.is_role('BUYER');
  v_scope uuid[] := case when public.is_role('BUYER') then public.current_buyer_scope_ids() else null end;
  v_comprador text := nullif(lower(btrim(coalesce(p_comprador, ''))), '');
  v_division text := nullif(lower(btrim(coalesce(p_division, ''))), '');
  v_tipo_actividad text := nullif(upper(btrim(coalesce(p_tipo_actividad, ''))), '');
  v_actividad text := nullif(lower(btrim(coalesce(p_actividad, ''))), '');
  v_tipo_promo text := nullif(btrim(coalesce(p_tipo_promo, '')), '');
  v_sku text := nullif(lower(btrim(coalesce(p_sku, ''))), '');
begin
  if not public.is_any_role(array['ADMIN', 'OPER', 'BUYER']) then
    raise exception 'No autorizado para consultar márgenes.' using errcode = '42501';
  end if;

  return query
  select
    p.id::uuid,
    p.legacy_row_id::text,
    c.legacy_actividad_id::text,
    c.nombre_actividad::text,
    c.tipo_actividad::text,
    c.fecha_inicio::date,
    c.fecha_fin::date,
    p.buyer_id::uuid,
    coalesce(b.comprador, '')::text,
    coalesce(nullif(jc.division, ''), nullif(b.division, ''), '')::text,
    coalesce(nullif(p.dep_id, ''), sm.dep_id::text, '')::text,
    p.oferta_id::text,
    p.tipo_promo::text,
    p.grupo_oferta::text,
    p.tipo_sku::text,
    p.variante::text,
    p.sku::text,
    coalesce(nullif(p.descripcion, ''), sm.descripcion::text, '')::text,
    p.tipo_cantidad::text,
    p.cantidad_minima::numeric,
    p.precio_antes::numeric,
    p.precio_ahora::numeric,
    p.descuento::text,
    sm.precio_regular::numeric,
    p.estado_registro::text,
    pc.costo_nio::numeric,
    coalesce(pc.fuente, 'SIN_COSTO')::text,
    pc.capturado_el::timestamptz,
    sc.unit_cost::numeric
  from public.promociones p
  join public.campanas c on c.id = p.campana_id
  left join public.compradores b on b.id = p.buyer_id
  left join public.promociones_costo pc on pc.promocion_id = p.id
  left join lateral (
    select m.dep_id, m.descripcion, m.precio_regular
      from public.sku_master m
     where public.margen_sku_key(m.sku) = public.margen_sku_key(p.sku)
     order by (m.sku = btrim(p.sku)) desc
     limit 1
  ) sm on true
  left join public.jerarquia_categorias jc
    on jc.dep_id = coalesce(nullif(p.dep_id, ''), sm.dep_id::text)
  left join lateral (
    select s.unit_cost
      from public.sku_costos s
     where s.sku_key = public.margen_sku_key(p.sku)
     order by (s.sku = btrim(p.sku)) desc
     limit 1
  ) sc on true
  where p.estado_registro <> 'ANULADO'
    and (not v_is_buyer or p.buyer_id = any(coalesce(v_scope, array[]::uuid[])))
    and (v_comprador is null or lower(btrim(coalesce(b.comprador, ''))) = v_comprador)
    and (v_tipo_actividad is null or c.tipo_actividad = v_tipo_actividad)
    and (v_tipo_promo is null or p.tipo_promo = v_tipo_promo)
    and (v_actividad is null
      or lower(c.legacy_actividad_id) = v_actividad
      or lower(c.nombre_actividad) like '%' || v_actividad || '%')
    and (v_sku is null
      or lower(p.sku) like '%' || v_sku || '%'
      or lower(p.descripcion) like '%' || v_sku || '%')
    and (v_division is null
      or lower(coalesce(nullif(jc.division, ''), nullif(b.division, ''), '')) = v_division)
  order by c.legacy_actividad_id, p.oferta_id, p.tipo_sku, p.legacy_row_id;
end;
$$;

revoke all on function public.consultar_margenes_promociones(text, text, text, text, text, text) from public, anon;
grant execute on function public.consultar_margenes_promociones(text, text, text, text, text, text) to authenticated;

-- Ya nadie la usa (AV_COST viene en C$).
drop function if exists public.margen_tasa_cambio();

commit;

-- Verificación rápida (opcional):
--   select fuente, count(*) from public.promociones_costo group by fuente;
--   select * from public.consultar_margenes_promociones() limit 20;  -- con sesión ADMIN
