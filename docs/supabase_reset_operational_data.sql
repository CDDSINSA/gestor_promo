-- =============================================================================
-- Limpieza de datos operativos del Gestor de Promociones
-- =============================================================================
--
-- Uso recomendado:
-- 1. Ejecutar primero en una base de pruebas.
-- 2. Hacer backup antes de usarlo en produccion.
-- 3. Ejecutarlo desde Supabase SQL Editor con un usuario propietario/admin.
--
-- Este script borra REGISTROS, no elimina tablas, vistas, funciones, indices,
-- triggers ni politicas RLS.
--
-- Notas importantes:
-- - public.export_pricing y public.export_mercadeo son vistas, no tablas.
--   No se limpian directamente; quedan vacias segun las tablas fuente.
-- - El nombre real es public.fidelizacion_solicitudes_detalle.
-- - El nombre real es public.catalogo_pagina_comentarios.
-- - public.logs tiene trigger append-only y NO se limpia en este script.
--   Para poder borrar promociones/campanas, se desactivan temporalmente
--   los triggers protectores de logs; las FK actualizan campana_id/promocion_id
--   a null y luego los triggers se reactivan.
-- - Al borrar public.catalogo_proyecto_diseno tambien se elimina la informacion
--   dependiente de diseno, incluyendo catalogo_consolidado_final si existe.
--
-- NO borra catalogos base como:
-- - usuarios_app
-- - compradores
-- - configuracion
-- - segmentos_clientes
-- - jerarquia_categorias
-- - sku_master
-- - canasto_fidelizacion
-- - logs

begin;

do $$
declare
  v_table text;
  v_tables text[] := array[
    -- Control/idempotencia de guardados
    'save_operations',

    -- Diseno de catalogos: dependientes primero
    'catalogo_pagina_comentarios',
    'catalogo_paginas_diseno',
    'catalogo_consolidado_final',
    'catalogo_proyecto_diseno',

    -- Fidelizacion: solicitudes/staging, no canasto maestro
    'fidelizacion_solicitudes_detalle',

    -- Promociones y actividad operativa: dependientes primero
    'promociones_detalle',
    'comentarios',
    'notificaciones',
    'avances_catalogo',
    'promociones',
    'campanas',

    -- Catalogo operativo auxiliar solicitado
    'responsables_solicitudes'
  ];
begin
  if to_regclass('public.logs') is not null then
    alter table public.logs disable trigger logs_prevent_update;
    alter table public.logs disable trigger logs_prevent_delete;
    raise notice 'Triggers protectores de public.logs desactivados temporalmente.';
  end if;

  foreach v_table in array v_tables loop
    if to_regclass(format('public.%I', v_table)) is not null then
      execute format('delete from public.%I', v_table);
      raise notice 'Registros borrados de public.%', v_table;
    else
      raise notice 'Tabla public.% no existe; se omite.', v_table;
    end if;
  end loop;

end $$;

commit;

-- Verificacion rapida posterior.
-- Las vistas export_pricing y export_mercadeo deben reflejar 0 filas si no hay promociones.
create temp table if not exists pg_temp.reset_operational_counts (
  objeto text,
  registros bigint
);

truncate table pg_temp.reset_operational_counts;

do $$
declare
  v_object text;
  v_objects text[] := array[
    'save_operations',
    'responsables_solicitudes',
    'promociones_detalle',
    'promociones',
    'notificaciones',
    'fidelizacion_solicitudes_detalle',
    'comentarios',
    'catalogo_proyecto_diseno',
    'catalogo_paginas_diseno',
    'catalogo_pagina_comentarios',
    'catalogo_consolidado_final',
    'campanas',
    'avances_catalogo',
    'export_pricing',
    'export_mercadeo'
  ];
  v_count bigint;
begin
  foreach v_object in array v_objects loop
    if to_regclass(format('public.%I', v_object)) is not null then
      execute format('select count(*) from public.%I', v_object) into v_count;
      insert into pg_temp.reset_operational_counts (objeto, registros)
      values (v_object, v_count);
    else
      insert into pg_temp.reset_operational_counts (objeto, registros)
      values (v_object || ' (no existe)', null);
    end if;
  end loop;

  if to_regclass('public.logs') is not null then
    alter table public.logs enable trigger logs_prevent_update;
    alter table public.logs enable trigger logs_prevent_delete;
    raise notice 'Triggers protectores de public.logs reactivados.';
  end if;
end $$;

select *
from pg_temp.reset_operational_counts
order by objeto;
