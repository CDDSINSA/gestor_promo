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
-- - Los triggers guard_fidelizacion_* validan el rol del usuario de la app.
--   Desde el SQL Editor no hay auth.uid(), por lo que bloquearian el borrado
--   de solicitudes FID-. Se desactivan temporalmente y se reactivan al final.
-- - Todo ocurre en UNA sola transaccion: si algo falla, no se borra nada y
--   los triggers quedan como estaban.
-- - Al borrar public.catalogo_proyecto_diseno tambien se elimina la informacion
--   dependiente de diseno, incluyendo catalogo_consolidado_final si existe.
-- - public.promociones_costo (foto del costo por promocion) no se lista aqui,
--   pero se vacia sola por ON DELETE CASCADE al borrar public.promociones.
-- - Los archivos en Storage (buckets sns_app_promo y catalogo_final) NO se
--   borran con este script; limpiarlos aparte si se desea.
--
-- NO borra catalogos base / maestros / configuracion como:
-- - usuarios_app
-- - compradores
-- - configuracion
-- - segmentos_clientes
-- - jerarquia_categorias
-- - sku_master
-- - sku_costos (tabla de costos)
-- - sku_clasificacion_abc, clasificacion_abc_catalogo
-- - canasto_fidelizacion
-- - fidelizacion_orce_historial, fidelizacion_orce_importaciones
--   (auditoria/conciliacion ORCE del canasto maestro)
-- - notificaciones_eventos, notificaciones_grupos,
--   notificaciones_grupo_miembros, notificaciones_suscripciones,
--   notificaciones_correo_tipos (configuracion de avisos)
-- - logs

begin;

do $$
declare
  v_table text;
  v_tables text[] := array[
    -- Control/idempotencia de guardados
    'save_operations',
    'catalogo_diseno_operaciones',

    -- Avisos en vivo y cola de correos (historial operativo)
    'notificaciones_correo',
    'notificaciones_envivo',

    -- Diseno de catalogos: dependientes primero
    'catalogo_pagina_respuestas',
    'catalogo_pagina_comentarios',
    'catalogo_pagina_versiones',
    'catalogo_paginas_diseno',
    'catalogo_consolidado_final',
    'catalogo_proyecto_diseno',

    -- Calendario de eventos automaticos por campana
    'catalogo_eventos_programados',

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
  -- Desactivar triggers protectores
  if to_regclass('public.logs') is not null then
    alter table public.logs disable trigger logs_prevent_update;
    alter table public.logs disable trigger logs_prevent_delete;
    raise notice 'Triggers protectores de public.logs desactivados temporalmente.';
  end if;

  if exists (select 1 from pg_trigger
             where tgrelid = 'public.campanas'::regclass
               and tgname = 'guard_fidelizacion_campana') then
    alter table public.campanas disable trigger guard_fidelizacion_campana;
  end if;

  if to_regclass('public.fidelizacion_solicitudes_detalle') is not null
     and exists (select 1 from pg_trigger
                 where tgrelid = 'public.fidelizacion_solicitudes_detalle'::regclass
                   and tgname = 'guard_fidelizacion_rows') then
    alter table public.fidelizacion_solicitudes_detalle disable trigger guard_fidelizacion_rows;
  end if;

  -- Borrado
  foreach v_table in array v_tables loop
    if to_regclass(format('public.%I', v_table)) is not null then
      execute format('delete from public.%I', v_table);
      raise notice 'Registros borrados de public.%', v_table;
    else
      raise notice 'Tabla public.% no existe; se omite.', v_table;
    end if;
  end loop;

  -- Reactivar triggers protectores (misma transaccion)
  if to_regclass('public.logs') is not null then
    alter table public.logs enable trigger logs_prevent_update;
    alter table public.logs enable trigger logs_prevent_delete;
    raise notice 'Triggers protectores de public.logs reactivados.';
  end if;

  if exists (select 1 from pg_trigger
             where tgrelid = 'public.campanas'::regclass
               and tgname = 'guard_fidelizacion_campana') then
    alter table public.campanas enable trigger guard_fidelizacion_campana;
  end if;

  if to_regclass('public.fidelizacion_solicitudes_detalle') is not null
     and exists (select 1 from pg_trigger
                 where tgrelid = 'public.fidelizacion_solicitudes_detalle'::regclass
                   and tgname = 'guard_fidelizacion_rows') then
    alter table public.fidelizacion_solicitudes_detalle enable trigger guard_fidelizacion_rows;
  end if;
  raise notice 'Triggers guard_fidelizacion_* reactivados.';
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
    'catalogo_diseno_operaciones',
    'notificaciones_correo',
    'notificaciones_envivo',
    'responsables_solicitudes',
    'promociones_detalle',
    'promociones',
    'promociones_costo',
    'notificaciones',
    'fidelizacion_solicitudes_detalle',
    'comentarios',
    'catalogo_proyecto_diseno',
    'catalogo_paginas_diseno',
    'catalogo_pagina_versiones',
    'catalogo_pagina_comentarios',
    'catalogo_pagina_respuestas',
    'catalogo_consolidado_final',
    'catalogo_eventos_programados',
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
end $$;

-- Triggers protectores: todos deben quedar habilitados (tgenabled = 'O').
select c.relname as tabla, t.tgname as trigger_protector, t.tgenabled as estado
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and t.tgname in ('logs_prevent_update', 'logs_prevent_delete',
                   'guard_fidelizacion_campana', 'guard_fidelizacion_rows')
order by 1, 2;

select *
from pg_temp.reset_operational_counts
order by objeto;
