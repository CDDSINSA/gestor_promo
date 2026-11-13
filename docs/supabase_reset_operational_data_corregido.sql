-- =============================================================================
-- Limpieza de datos operativos, incluyendo logs (correccion SQL Editor)
-- =============================================================================
-- Dependencias: esquema operativo instalado y usuario propietario de las tablas.
-- Ejecutar desde Supabase SQL Editor, con la app y procesos escritores detenidos.
-- Repetible: si; cada ejecucion vuelve a borrar los datos operativos indicados.
-- DESTRUCTIVO: borra datos y auditoria. Respaldar y probar en una base de pruebas.
-- Sustituye el bloque de limpieza compartido; NO requiere ejecutar antes
-- supabase_reset_operational_data.sql (esa variante conserva logs).
-- No cambia permisos/RLS, funciones, maestros, canasto ni archivos de Storage.
-- Solo suspende los triggers indicados dentro de esta transaccion y restaura
-- su estado original. Si falla, ejecutar ROLLBACK antes de reintentar en la misma
-- sesion; ningun borrado ni cambio de triggers de la transaccion se confirma.
-- Las tablas opcionales ausentes se omiten. No usar TRUNCATE ... CASCADE.
-- La verificacion no usa tablas temporales; los conteos salen como NOTICE.
-- Ejecutar el archivo completo, desde BEGIN hasta COMMIT.

begin;

do $$
declare
  v_table text;
  v_trigger record;
  v_count bigint;
  v_triggers jsonb;
  v_tables text[] := array[
    'save_operations',
    'catalogo_pagina_comentarios',
    'catalogo_paginas_diseno',
    'catalogo_consolidado_final',
    'catalogo_proyecto_diseno',
    'fidelizacion_solicitudes_detalle',
    'promociones_detalle',
    'comentarios',
    'notificaciones',
    'avances_catalogo',
    'promociones',
    'campanas',
    'responsables_solicitudes'
  ];
begin
  -- No hay identidad de usuario de la app en una sesion normal del SQL Editor.
  -- logs_prevent_update bloquea los ON DELETE SET NULL de campanas/promociones,
  -- incluso si logs se vacio al inicio: los DELETE generan nueva auditoria.
  select coalesce(jsonb_agg(jsonb_build_object(
    'tabla', c.relname, 'nombre', t.tgname, 'estado', t.tgenabled
  ) order by c.relname, t.tgname), '[]'::jsonb)
  into v_triggers
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal
    and (c.relname, t.tgname) in (
      ('logs', 'logs_prevent_update'),
      ('campanas', 'guard_fidelizacion_campana'),
      ('fidelizacion_solicitudes_detalle', 'guard_fidelizacion_rows')
    );

  for v_trigger in
    select * from jsonb_to_recordset(v_triggers)
      as x(tabla text, nombre text, estado text)
  loop
    if v_trigger.estado <> 'D' then
      execute format('alter table public.%I disable trigger %I',
                     v_trigger.tabla, v_trigger.nombre);
    end if;
  end loop;

  foreach v_table in array v_tables loop
    if to_regclass(format('public.%I', v_table)) is not null then
      execute format('delete from public.%I', v_table);
      raise notice 'Registros borrados de public.%', v_table;
    else
      raise notice 'Tabla public.% no existe; se omite.', v_table;
    end if;
  end loop;

  -- Al FINAL: elimina tambien la auditoria generada por los DELETE anteriores.
  -- TRUNCATE no dispara el trigger de fila logs_prevent_delete.
  if to_regclass('public.logs') is not null then
    execute 'truncate table public.logs';
  end if;

  for v_trigger in
    select * from jsonb_to_recordset(v_triggers)
      as x(tabla text, nombre text, estado text)
  loop
    case v_trigger.estado
      when 'O' then
        execute format('alter table public.%I enable trigger %I',
                       v_trigger.tabla, v_trigger.nombre);
      when 'R' then
        execute format('alter table public.%I enable replica trigger %I',
                       v_trigger.tabla, v_trigger.nombre);
      when 'A' then
        execute format('alter table public.%I enable always trigger %I',
                       v_trigger.tabla, v_trigger.nombre);
      when 'D' then null; -- Ya estaba deshabilitado antes de la limpieza.
      else raise exception 'Estado de trigger inesperado: %', v_trigger.estado;
    end case;
  end loop;

  -- Verificar ANTES de confirmar: cualquier remanente revierte la limpieza.
  foreach v_table in array v_tables || array[
    'logs', 'export_pricing', 'export_mercadeo'
  ] loop
    if to_regclass(format('public.%I', v_table)) is not null then
      execute format('select count(*) from public.%I', v_table) into v_count;
      if v_count <> 0 then
        raise exception 'Limpieza incompleta: public.% conserva % registros.',
                        v_table, v_count;
      end if;
      raise notice 'Verificacion: public.% = % registros.', v_table, v_count;
    else
      raise notice 'Verificacion: public.% no existe; se omite.', v_table;
    end if;
  end loop;
end $$;

-- Estados: O = normal, R = replica, A = siempre, D = deshabilitado previamente.
select c.relname as tabla, t.tgname as trigger_protector, t.tgenabled as estado
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and (c.relname, t.tgname) in (
    ('logs', 'logs_prevent_update'),
    ('logs', 'logs_prevent_delete'),
    ('campanas', 'guard_fidelizacion_campana'),
    ('fidelizacion_solicitudes_detalle', 'guard_fidelizacion_rows')
  )
order by 1, 2;

commit;
