-- =============================================================================
-- Paso 41 · AIRES (combo de aire acondicionado)
-- =============================================================================
-- Un aire se factura en varias piezas (condensador, evaporador…) con SKU distintos.
-- La compradora da UN precio c/IVA por aire y la app lo reparte entre las piezas
-- según el peso del costo (AV_COST) de cada una:
--   peso = costo × cantidad / Σ(costo × cantidad)
--
-- Este script:
--   1. Agrega 'AIRES' a la regla de promociones complejas (exige grupo_oferta y tipo_sku).
--   2. Crea la RPC calcular_pesos_aires(p_combos jsonb): devuelve SOLO los pesos de
--      cada pieza, nunca el costo. sku_costos sigue sin acceso REST.
--      Si a alguna pieza de un aire le falta costo (o es 0), ese aire vuelve con
--      fuente 'SIN_COSTO' y el frontend reparte por precio regular del maestro.
--
-- Requiere: pasos 1–3 (schema, current_user_role) y 33 (sku_costos, margen_sku_key).
-- Repetible: sí. Destructivo: no (no toca datos).
--
-- Entrada:  [{"combo":"1","items":[{"sku":"157638037","cantidad":1},{"sku":"157638070","cantidad":1}]}]
-- Salida:   [{"combo":"1","fuente":"COSTO","pesos":[{"sku":"157638037","peso":0.6},{"sku":"157638070","peso":0.4}]}]
-- =============================================================================

begin;

-- 0. Verificación: este script debe correr en el proyecto de Supabase de la app.
do $$
begin
  if to_regclass('public.promociones') is null then
    raise exception 'No existe public.promociones en esta base. Abra el SQL Editor en el proyecto de Supabase de la app (el de VITE_SUPABASE_URL en .env.local) y vuelva a ejecutar.';
  end if;
  if to_regprocedure('public.current_user_role()') is null then
    raise exception 'Falta public.current_user_role(): ejecute primero los pasos 1-3 (supabase_schema.sql).';
  end if;
  if to_regclass('public.sku_costos') is null or to_regprocedure('public.margen_sku_key(text)') is null then
    raise notice 'Aún no existe sku_costos / margen_sku_key (paso 33). La RPC se instala igual, pero hasta ejecutar el paso 33 la app repartirá por precio regular.';
  end if;
end;
$$;

-- 1. Regla de promociones complejas: se agrega AIRES (mismas columnas exigidas).
alter table public.promociones drop constraint if exists promociones_complejas_required;
alter table public.promociones add constraint promociones_complejas_required check (
  tipo_promo not in ('Combo', 'Umbral', 'Compra X lleva X', 'Compra X Lleva X V2', 'AIRES')
  or (length(trim(grupo_oferta)) > 0 and length(trim(tipo_sku)) > 0)
);

-- 2. Pesos de reparto por costo.
create or replace function public.calcular_pesos_aires(p_combos jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text := public.current_user_role();
  v_result jsonb;
begin
  if v_role is null or v_role not in ('ADMIN', 'BUYER') then
    raise exception 'Sin permiso para calcular el reparto de aires.' using errcode = '42501';
  end if;
  if p_combos is null or jsonb_typeof(p_combos) <> 'array' then
    return '[]'::jsonb;
  end if;
  if jsonb_array_length(p_combos) > 2000 then
    raise exception 'Demasiados aires en una sola consulta (máximo 2000).' using errcode = '22023';
  end if;

  with items as (
    select
      c.ord as combo_ord,
      coalesce(c.value ->> 'combo', '') as combo,
      i.ord as item_ord,
      btrim(coalesce(i.value ->> 'sku', '')) as sku,
      case
        when btrim(coalesce(i.value ->> 'cantidad', '')) ~ '^[0-9]+$'
          then greatest(btrim(i.value ->> 'cantidad')::numeric, 1)
        else 1
      end as cantidad
    from jsonb_array_elements(p_combos) with ordinality as c(value, ord)
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(c.value -> 'items') = 'array' then c.value -> 'items' else '[]'::jsonb end
    ) with ordinality as i(value, ord)
  ),
  costed as (
    select
      it.*,
      (
        select s.unit_cost
          from public.sku_costos s
         where s.sku_key = public.margen_sku_key(it.sku)
         order by (s.sku = it.sku) desc
         limit 1
      ) as unit_cost
    from items it
  ),
  weighted as (
    select
      co.*,
      bool_and(co.unit_cost is not null and co.unit_cost > 0) over (partition by co.combo_ord) as complete,
      count(*) over (partition by co.combo_ord) as piezas,
      sum(co.unit_cost * co.cantidad) over (partition by co.combo_ord) as total_cost
    from costed co
  ),
  combos as (
    select
      combo_ord,
      combo,
      bool_and(complete and piezas >= 2 and total_cost > 0) as con_costo,
      jsonb_agg(
        jsonb_build_object(
          'sku', sku,
          'peso', case when complete and total_cost > 0 then round(unit_cost * cantidad / total_cost, 8) end
        )
        order by item_ord
      ) as pesos
    from weighted
    group by combo_ord, combo
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'combo', combo,
      'fuente', case when con_costo then 'COSTO' else 'SIN_COSTO' end,
      'pesos', case when con_costo then pesos else null end
    )
    order by combo_ord
  ), '[]'::jsonb)
    into v_result
    from combos;

  return v_result;
end;
$$;

comment on function public.calcular_pesos_aires(jsonb) is
  'AIRES: peso de cada pieza por costo (AV_COST) para repartir el precio del aire. No devuelve costos. ADMIN y BUYER.';

revoke all on function public.calcular_pesos_aires(jsonb) from public, anon;
grant execute on function public.calcular_pesos_aires(jsonb) to authenticated;

commit;

-- Verificación rápida (con sesión de comprador o ADMIN en la app):
--   select public.calcular_pesos_aires('[{"combo":"1","items":[{"sku":"157638037"},{"sku":"157638070"}]}]');
-- Rollback (no borra promociones):
--   drop function if exists public.calcular_pesos_aires(jsonb);
