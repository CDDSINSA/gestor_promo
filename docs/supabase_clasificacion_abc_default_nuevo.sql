-- =============================================================================
-- Paso 36. Clasificación ABC: los SKU sin clasificación son 8 (Nuevo), no 3.
-- =============================================================================
-- Requiere: supabase_clasificacion_abc.sql (paso 35).
-- Repetible: sí. Destructivo: no (no borra ni modifica filas; solo reinstala la
-- vista y la función de resumen).
--
-- Motivo: corrección de negocio. El valor por defecto para un SKU del maestro que no
-- viene en el reporte UDA (UDA_ID = 4) es 8 - Nuevo. Antes se reportaba 3 -
-- Descontinuado.
--
-- Qué cambia:
--   1. Vista sku_master_abc: coalesce(clasificacion, 8).
--   2. get_clasificacion_abc_resumen: nuevo campo maestro_sin_clasificacion; se
--      conserva maestro_descontinuado_por_defecto (mismo valor) para la app anterior.
-- Las RPC de carga no cambian: los SKU sin fila en sku_clasificacion_abc se
-- interpretan como 8 al leer.
-- =============================================================================

begin;

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

commit;

-- Verificación:
--   select clasificacion_abc, clasificacion_abc_nombre, count(*)
--     from public.sku_master_abc group by 1, 2 order by 1;
