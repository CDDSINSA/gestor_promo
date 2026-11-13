-- Hotfix: alinear save_catalog_transactional con los estados operativos de promociones.
--
-- Sintoma:
--   Oferta agrupada invalida despues del delta (...): ... estado invalido t ...
--
-- Causa:
--   La restriccion operativa ya permite REGISTRADO/ANULADO, pero la validacion
--   interna del RPC transaccional conservaba la lista anterior de estados.
--
-- Ejecutar una vez en Supabase SQL Editor.

alter table public.promociones
  drop constraint if exists promociones_estado_registro_check;

alter table public.promociones
  drop constraint if exists promociones_estado_registro_operativo_check;

alter table public.promociones
  add constraint promociones_estado_registro_operativo_check
  check (estado_registro in (
    'BORRADOR', 'REGISTRADO', 'EN_REVISION', 'APROBADO', 'RECHAZADO', 'CERRADO', 'ANULADO'
  ));

do $$
declare
  v_definition text;
  v_old_fragment text := 'estado_registro not in (''BORRADOR'', ''EN_REVISION'', ''APROBADO'', ''RECHAZADO'', ''CERRADO'')';
  v_new_fragment text := 'estado_registro not in (''BORRADOR'', ''REGISTRADO'', ''EN_REVISION'', ''APROBADO'', ''RECHAZADO'', ''CERRADO'', ''ANULADO'')';
begin
  select pg_get_functiondef('public.save_catalog_transactional(jsonb)'::regprocedure)
  into v_definition;

  if v_definition is null then
    raise exception 'No existe public.save_catalog_transactional(jsonb). Ejecute docs/supabase_transactional_save_rpc.sql.';
  end if;

  if position(v_old_fragment in v_definition) = 0 and position(v_new_fragment in v_definition) > 0 then
    raise notice 'save_catalog_transactional ya contiene la lista corregida de estados.';
    return;
  end if;

  if position(v_old_fragment in v_definition) = 0 then
    raise exception 'No se encontro el fragmento esperado de estado_registro en save_catalog_transactional. Revise la funcion manualmente.';
  end if;

  execute replace(v_definition, v_old_fragment, v_new_fragment);
end;
$$;
