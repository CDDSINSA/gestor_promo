-- =============================================================================
-- supabase_g_comercial_borrar_campanas.sql
-- Borra TODA la informacion de base de datos de campanas puntuales (por
-- legacy_actividad_id) en el esquema g_comercial.
-- =============================================================================
-- Campanas: editar la lista v_ids en el PASO 1 y en el PASO 2 (misma lista).
--
-- Que borra (solo filas ligadas a esas campanas):
--   campanas, promociones, promociones_detalle, comentarios, promociones_costo,
--   notificaciones, notificaciones_envivo, catalogo_eventos_programados,
--   avances_catalogo, catalogo_proyecto_diseno, catalogo_paginas_diseno,
--   catalogo_pagina_versiones, catalogo_pagina_comentarios,
--   catalogo_pagina_respuestas, catalogo_consolidado_final,
--   fidelizacion_solicitudes_detalle y los logs de todo lo anterior.
--   Ademas barre cualquier otra tabla de g_comercial con columna de texto
--   catalogo_id / actividad_id que apunte a esos IDs.
--
-- Que NO borra: maestros (SKU, compradores, usuarios, canasto), la cola
--   notificaciones_correo (no guarda campana) ni los ARCHIVOS del bucket
--   sns_app_promo. El PASO 1 lista las rutas para borrarlas a mano en Storage
--   (Supabase no permite borrar storage.objects por SQL).
--
-- Como ejecutar (Supabase SQL Editor, rol postgres):
--   1. Ejecutar el PASO 1 (solo lectura) y revisar conteos y archivos.
--   2. Ejecutar el PASO 2 completo, de BEGIN a COMMIT.
--      Si algo falla, todo se revierte. Ejecutar ROLLBACK antes de reintentar.
-- DESTRUCTIVO: no se puede deshacer despues del COMMIT. Respaldar antes.
-- Los triggers de guardia se suspenden solo dentro de la transaccion y se
-- restauran a su estado original antes del COMMIT.
-- =============================================================================


-- =============================================================================
-- PASO 1 — VISTA PREVIA (solo lectura)
-- =============================================================================

-- 1a. Conteo de filas que se borraran por tabla
with ids(legacy) as (
  values ('ESP-20261030-001'),
         ('cat-1793039153098-46528'),
         ('cat-1793977826851-1bb0408c3f5ac')
),
c  as (select id from g_comercial.campanas where legacy_actividad_id in (select legacy from ids)),
p  as (select id from g_comercial.promociones where campana_id in (select id from c)),
pr as (select id from g_comercial.catalogo_proyecto_diseno where catalogo_id in (select legacy from ids)),
pg as (select id from g_comercial.catalogo_paginas_diseno where proyecto_id in (select id from pr)),
pc as (select id from g_comercial.catalogo_pagina_comentarios where pagina_id in (select id from pg))
select 'campanas' as tabla, count(*) as filas from c
union all select 'promociones', count(*) from p
union all select 'promociones_detalle', count(*) from g_comercial.promociones_detalle where promocion_id in (select id from p)
union all select 'comentarios', count(*) from g_comercial.comentarios where promocion_id in (select id from p)
union all select 'promociones_costo', count(*) from g_comercial.promociones_costo where promocion_id in (select id from p)
union all select 'notificaciones', count(*) from g_comercial.notificaciones where campana_id in (select id from c)
union all select 'notificaciones_envivo', count(*) from g_comercial.notificaciones_envivo where campana_id in (select id from c) or promocion_id in (select id from p)
union all select 'catalogo_eventos_programados', count(*) from g_comercial.catalogo_eventos_programados where campana_id in (select id from c)
union all select 'avances_catalogo', count(*) from g_comercial.avances_catalogo where campana_id in (select id from c) or catalogo_id in (select legacy from ids)
union all select 'catalogo_proyecto_diseno', count(*) from pr
union all select 'catalogo_paginas_diseno', count(*) from pg
union all select 'catalogo_pagina_versiones', count(*) from g_comercial.catalogo_pagina_versiones where pagina_id in (select id from pg)
union all select 'catalogo_pagina_comentarios', count(*) from pc
union all select 'catalogo_pagina_respuestas', count(*) from g_comercial.catalogo_pagina_respuestas where comentario_id in (select id from pc)
union all select 'catalogo_consolidado_final', count(*) from g_comercial.catalogo_consolidado_final where proyecto_id in (select id from pr)
union all select 'fidelizacion_solicitudes_detalle', count(*) from g_comercial.fidelizacion_solicitudes_detalle where actividad_id in (select legacy from ids)
union all select 'logs (aprox.)', count(*) from g_comercial.logs
  where campana_id in (select id from c) or promocion_id in (select id from p)
     or registro in (select legacy from ids)
     or entidad_id in (select id from c union all select id from p union all select id from pr union all select id from pg union all select id from pc)
union all select 'IDs que NO existen en campanas: ' || coalesce(string_agg(i.legacy, ', '), '(ninguno)'), 0
  from ids i where not exists (select 1 from g_comercial.campanas x where x.legacy_actividad_id = i.legacy);

-- 1b. Archivos en Storage (bucket sns_app_promo) para borrar a mano despues
with ids(legacy) as (
  values ('ESP-20261030-001'),
         ('cat-1793039153098-46528'),
         ('cat-1793977826851-1bb0408c3f5ac')
),
pr as (select id, catalogo_id from g_comercial.catalogo_proyecto_diseno where catalogo_id in (select legacy from ids)),
pg as (select d.id, pr.catalogo_id, d.numero_pagina, d.archivo_path
       from g_comercial.catalogo_paginas_diseno d join pr on pr.id = d.proyecto_id)
select catalogo_id, 'pagina ' || numero_pagina as origen, archivo_path as ruta
from pg where nullif(archivo_path, '') is not null
union
select pg.catalogo_id, 'version pagina ' || pg.numero_pagina, v.archivo_path
from g_comercial.catalogo_pagina_versiones v join pg on pg.id = v.pagina_id
where nullif(v.archivo_path, '') is not null
union
select pr.catalogo_id, 'consolidado PDF', f.pdf_path
from g_comercial.catalogo_consolidado_final f join pr on pr.id = f.proyecto_id
where nullif(f.pdf_path, '') is not null
order by 1, 2;


-- =============================================================================
-- PASO 2 — BORRADO (ejecutar completo, de BEGIN a COMMIT)
-- =============================================================================

begin;

do $$
declare
  v_ids text[] := array[
    'ESP-20261030-001',
    'cat-1793039153098-46528',
    'cat-1793977826851-1bb0408c3f5ac'
  ];
  v_camp uuid[];
  v_prom uuid[];
  v_proy uuid[];
  v_pag  uuid[];
  v_ent  uuid[];
  v_triggers jsonb;
  v_t record;
  v_col record;
  v_n bigint;
begin
  -- ---------------------------------------------------------------------------
  -- 0. Recolectar IDs
  -- ---------------------------------------------------------------------------
  select coalesce(array_agg(id), '{}') into v_camp
    from g_comercial.campanas where legacy_actividad_id = any(v_ids);
  select coalesce(array_agg(id), '{}') into v_prom
    from g_comercial.promociones where campana_id = any(v_camp);
  select coalesce(array_agg(id), '{}') into v_proy
    from g_comercial.catalogo_proyecto_diseno where catalogo_id = any(v_ids);
  select coalesce(array_agg(id), '{}') into v_pag
    from g_comercial.catalogo_paginas_diseno where proyecto_id = any(v_proy);

  -- Todas las entidades cuyo log tambien se elimina (logs.entidad_id).
  select coalesce(array_agg(x), '{}') into v_ent from (
    select unnest(v_camp) union all select unnest(v_prom)
    union all select unnest(v_proy) union all select unnest(v_pag)
    union all select id from g_comercial.promociones_detalle where promocion_id = any(v_prom)
    union all select id from g_comercial.comentarios where promocion_id = any(v_prom)
    union all select id from g_comercial.avances_catalogo where campana_id = any(v_camp) or catalogo_id = any(v_ids)
    union all select id from g_comercial.catalogo_pagina_comentarios where pagina_id = any(v_pag)
    union all select id from g_comercial.catalogo_pagina_versiones where pagina_id = any(v_pag)
    union all select id from g_comercial.catalogo_consolidado_final where proyecto_id = any(v_proy)
  ) s(x);

  raise notice 'Campanas: %, promociones: %, proyectos diseno: %, paginas: %',
    cardinality(v_camp), cardinality(v_prom), cardinality(v_proy), cardinality(v_pag);

  -- ---------------------------------------------------------------------------
  -- 1. Suspender triggers de guardia (se guarda su estado para restaurarlo).
  --    En el SQL Editor no hay usuario de la app: estas guardias rechazarian
  --    los borrados/SET NULL en cascada.
  -- ---------------------------------------------------------------------------
  select coalesce(jsonb_agg(jsonb_build_object(
           'tabla', c.relname, 'nombre', t.tgname, 'estado', t.tgenabled)), '[]'::jsonb)
    into v_triggers
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'g_comercial' and not t.tgisinternal
    and (
      c.relname = 'logs'   -- logs_prevent_update / logs_prevent_delete
      or (c.relname, t.tgname) in (
        ('campanas', 'guard_fidelizacion_campana'),
        ('fidelizacion_solicitudes_detalle', 'guard_fidelizacion_rows'),
        ('catalogo_paginas_diseno', 'catalogo_paginas_diseno_restricted_update'),
        ('catalogo_pagina_comentarios', 'catalogo_pagina_comentarios_status_update'),
        ('comentarios', 'comentarios_enforce_update_rules')
      )
    );

  for v_t in select * from jsonb_to_recordset(v_triggers) as x(tabla text, nombre text, estado text) loop
    if v_t.estado <> 'D' then
      execute format('alter table g_comercial.%I disable trigger %I', v_t.tabla, v_t.nombre);
    end if;
  end loop;

  -- ---------------------------------------------------------------------------
  -- 2. Logs primero (si no, el ON DELETE SET NULL de campanas/promociones
  --    intentaria actualizarlos).
  -- ---------------------------------------------------------------------------
  delete from g_comercial.logs
  where campana_id = any(v_camp) or promocion_id = any(v_prom)
     or entidad_id = any(v_ent) or registro = any(v_ids);
  get diagnostics v_n = row_count;
  raise notice 'logs: % filas', v_n;

  -- ---------------------------------------------------------------------------
  -- 3. Tablas ligadas por texto (no tienen FK a campanas)
  -- ---------------------------------------------------------------------------
  -- Proyecto de diseno: cascada a paginas, versiones, comentarios,
  -- respuestas y consolidado final.
  delete from g_comercial.catalogo_proyecto_diseno where id = any(v_proy);
  get diagnostics v_n = row_count;
  raise notice 'catalogo_proyecto_diseno (+ cascada diseno): % filas', v_n;

  delete from g_comercial.avances_catalogo
  where campana_id = any(v_camp) or catalogo_id = any(v_ids);
  get diagnostics v_n = row_count;
  raise notice 'avances_catalogo: % filas', v_n;

  delete from g_comercial.fidelizacion_solicitudes_detalle where actividad_id = any(v_ids);
  get diagnostics v_n = row_count;
  raise notice 'fidelizacion_solicitudes_detalle: % filas', v_n;

  -- Barrido de seguridad: cualquier otra tabla de g_comercial con columna de
  -- texto catalogo_id / actividad_id / legacy_actividad_id (ej. tablas nuevas).
  for v_col in
    select c.table_name, c.column_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'g_comercial'
      and t.table_type = 'BASE TABLE'
      and c.column_name in ('catalogo_id', 'actividad_id', 'legacy_actividad_id')
      and c.data_type = 'text'
      and c.table_name <> 'campanas'
  loop
    execute format('delete from g_comercial.%I where %I = any($1)', v_col.table_name, v_col.column_name)
      using v_ids;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      raise notice 'barrido %.%: % filas', v_col.table_name, v_col.column_name, v_n;
    end if;
  end loop;

  -- ---------------------------------------------------------------------------
  -- 4. Campanas: cascada a promociones, promociones_detalle, comentarios,
  --    promociones_costo, notificaciones, notificaciones_envivo,
  --    catalogo_eventos_programados.
  -- ---------------------------------------------------------------------------
  delete from g_comercial.campanas where id = any(v_camp);
  get diagnostics v_n = row_count;
  raise notice 'campanas (+ cascada): % filas', v_n;

  -- Logs que algun trigger haya generado durante los borrados.
  delete from g_comercial.logs
  where campana_id = any(v_camp) or promocion_id = any(v_prom)
     or entidad_id = any(v_ent) or registro = any(v_ids);

  -- ---------------------------------------------------------------------------
  -- 5. Restaurar triggers a su estado original
  -- ---------------------------------------------------------------------------
  for v_t in select * from jsonb_to_recordset(v_triggers) as x(tabla text, nombre text, estado text) loop
    case v_t.estado
      when 'O' then execute format('alter table g_comercial.%I enable trigger %I', v_t.tabla, v_t.nombre);
      when 'R' then execute format('alter table g_comercial.%I enable replica trigger %I', v_t.tabla, v_t.nombre);
      when 'A' then execute format('alter table g_comercial.%I enable always trigger %I', v_t.tabla, v_t.nombre);
      when 'D' then null;
      else raise exception 'Estado de trigger inesperado: %', v_t.estado;
    end case;
  end loop;

  -- ---------------------------------------------------------------------------
  -- 6. Verificar ANTES del COMMIT: cualquier remanente revierte todo.
  -- ---------------------------------------------------------------------------
  select
      (select count(*) from g_comercial.campanas where legacy_actividad_id = any(v_ids))
    + (select count(*) from g_comercial.promociones where id = any(v_prom))
    + (select count(*) from g_comercial.catalogo_proyecto_diseno where catalogo_id = any(v_ids))
    + (select count(*) from g_comercial.catalogo_paginas_diseno where id = any(v_pag))
    + (select count(*) from g_comercial.avances_catalogo where catalogo_id = any(v_ids))
    + (select count(*) from g_comercial.fidelizacion_solicitudes_detalle where actividad_id = any(v_ids))
    + (select count(*) from g_comercial.notificaciones_envivo where campana_id = any(v_camp))
    + (select count(*) from g_comercial.logs where campana_id = any(v_camp) or entidad_id = any(v_ent))
  into v_n;

  if v_n <> 0 then
    raise exception 'Borrado incompleto: quedan % filas ligadas a las campanas.', v_n;
  end if;

  raise notice 'OK: campanas % borradas por completo.', array_to_string(v_ids, ', ');
end $$;

-- Debe devolver 0 filas.
select legacy_actividad_id from g_comercial.campanas
where legacy_actividad_id in (
  'ESP-20261030-001', 'cat-1793039153098-46528', 'cat-1793977826851-1bb0408c3f5ac'
);

commit;
