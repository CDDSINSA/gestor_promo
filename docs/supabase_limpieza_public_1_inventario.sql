-- =====================================================================
-- supabase_limpieza_public_1_inventario.sql
-- PASO 1 de 2 — SOLO LECTURA. No cambia nada.
--
-- Lista lo que hay en el esquema public y si algo de afuera lo usa, para
-- decidir qué mover a cuarentena (paso 2). Correrlo completo en el SQL Editor
-- y revisar la columna «riesgo»:
--   OK        → nadie de afuera lo usa (según lo que Postgres puede ver).
--   REVISAR   → hay referencias desde otro esquema, desde cron, desde un
--               trigger de auth/storage, o el nombre aparece en el código de
--               funciones de otros esquemas. Moverlo puede romper algo.
--   EXTENSION → pertenece a una extensión instalada en public. El paso 2
--               nunca lo mueve.
--
-- Lo que Postgres NO puede ver (revisarlo a mano):
--   * Front y Edge Functions que llamen tablas/RPC sin esquema
--     (supabase.from('x'), .rpc('y')): por defecto van a public.
--   * Otras apps del mismo proyecto (p. ej. mesa_serv_compras) que usen public.
--   * Settings > API > Exposed schemas.
-- =====================================================================

with objetos as (
  -- Tablas, vistas, vistas materializadas, tablas foráneas y particionadas
  select c.oid, 'pg_class'::regclass as catalogo,
    case c.relkind when 'r' then 'tabla' when 'p' then 'tabla particionada' when 'v' then 'vista'
      when 'm' then 'vista materializada' when 'f' then 'tabla foránea' end as tipo,
    c.relname::text as nombre,
    format('%I.%I', n.nspname, c.relname) as objeto,
    case when c.relkind in ('r', 'p', 'm') then
      case when c.reltuples >= 0 then c.reltuples::bigint
           else (select st.n_live_tup from pg_stat_user_tables st where st.relid = c.oid) end
    end as filas_aprox,
    case when c.relkind in ('r', 'p', 'm') then pg_size_pretty(pg_total_relation_size(c.oid)) end as tamano
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
    and not c.relispartition
  union all
  -- Secuencias sueltas (las de una columna serial/identity se mueven con su tabla)
  select c.oid, 'pg_class'::regclass, 'secuencia', c.relname::text, format('%I.%I', n.nspname, c.relname), null, null
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'S'
    and not exists (select 1 from pg_depend d where d.objid = c.oid and d.classid = 'pg_class'::regclass
                    and d.refclassid = 'pg_class'::regclass and d.deptype in ('a', 'i'))
  union all
  -- Funciones y procedimientos
  select p.oid, 'pg_proc'::regclass,
    case p.prokind when 'p' then 'procedimiento' when 'a' then 'agregado' else 'función' end,
    p.proname::text, format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid)), null, null
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    -- Las funciones que Postgres crea solas para un tipo rango viajan con el tipo
    and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid
                    and d.refclassid = 'pg_type'::regclass and d.deptype = 'i')
  union all
  -- Tipos propios (enum, dominio, compuesto suelto, rango)
  select t.oid, 'pg_type'::regclass,
    case t.typtype when 'e' then 'tipo enum' when 'd' then 'dominio' when 'r' then 'tipo rango' else 'tipo compuesto' end,
    t.typname::text, format('%I.%I', n.nspname, t.typname), null, null
  from pg_type t join pg_namespace n on n.oid = t.typnamespace
  left join pg_class c on c.oid = t.typrelid
  where n.nspname = 'public'
    and (t.typtype in ('e', 'd', 'r') or (t.typtype = 'c' and c.relkind = 'c'))
),
marcas as (
  select o.*,
    -- ¿Es de una extensión?
    exists (select 1 from pg_depend d where d.classid = o.catalogo and d.objid = o.oid and d.deptype = 'e') as de_extension,
    -- Objetos de OTROS esquemas que dependen de este (vistas, FK, triggers, defaults, políticas, columnas con el tipo)
    (select string_agg(distinct coalesce(
        (select format('%s (%s)', dc.relname, dn.nspname) from pg_class dc join pg_namespace dn on dn.oid = dc.relnamespace
          where dc.oid = coalesce(r.ev_class, tg.tgrelid, con.conrelid, ad.adrelid, pol.polrelid, d.objid)
            and dn.nspname <> 'public'),
        (select format('%s() (%s)', pp.proname, pn.nspname) from pg_proc pp join pg_namespace pn on pn.oid = pp.pronamespace
          where d.classid = 'pg_proc'::regclass and pp.oid = d.objid and pn.nspname <> 'public')), ', ')
     from pg_depend d
     left join pg_rewrite r on d.classid = 'pg_rewrite'::regclass and r.oid = d.objid
     left join pg_trigger tg on d.classid = 'pg_trigger'::regclass and tg.oid = d.objid
     left join pg_constraint con on d.classid = 'pg_constraint'::regclass and con.oid = d.objid
     left join pg_attrdef ad on d.classid = 'pg_attrdef'::regclass and ad.oid = d.objid
     left join pg_policy pol on d.classid = 'pg_policy'::regclass and pol.oid = d.objid
     where d.refclassid = o.catalogo and d.refobjid = o.oid and d.deptype = 'n') as usado_por_otros_esquemas,
    -- El nombre aparece en el código de funciones de otros esquemas (menos las de sistema)
    (select string_agg(distinct format('%s.%s', pn.nspname, pp.proname), ', ')
     from pg_proc pp join pg_namespace pn on pn.oid = pp.pronamespace
     where pn.nspname not in ('public', 'pg_catalog', 'information_schema', 'pg_toast', 'extensions',
                              'graphql', 'graphql_public', 'pgsodium', 'pgsodium_masks', 'vault', 'realtime',
                              'supabase_functions', 'supabase_migrations', 'net', 'pgbouncer', 'cron')
       and pn.nspname not like 'pg_temp%'
       and not exists (select 1 from pg_depend d2 where d2.classid = 'pg_proc'::regclass and d2.objid = pp.oid and d2.deptype = 'e')
       and pp.prosrc ~* ('(^|[^a-z0-9_])' || o.nombre || '([^a-z0-9_]|$)')
       and (pp.prosrc ~* ('public\.' || o.nombre)
            or array_to_string(coalesce(pp.proconfig, '{}'), ',') ~* 'search_path=[^,]*public')) as mencionado_en_funciones
    -- Tareas pg_cron que mencionan el nombre (solo si pg_cron está instalado)
    ,case when to_regclass('cron.job') is not null then
      nullif((xpath('/row/x/text()', query_to_xml(format(
        'select count(*) as x from cron.job where command ~* %L',
        '(^|[^a-z0-9_])' || o.nombre || '([^a-z0-9_]|$)'), false, true, '')))[1]::text, '0')::int
    end as tareas_cron
  from objetos o
)
select * from (
select
  m.tipo,
  m.objeto,
  m.filas_aprox,
  m.tamano,
  case
    when m.de_extension then 'EXTENSION'
    when m.tipo = 'tipo rango' then 'REVISAR'
    when m.usado_por_otros_esquemas is not null or m.mencionado_en_funciones is not null
      or m.tareas_cron is not null then 'REVISAR'
    else 'OK'
  end as riesgo,
  nullif(concat_ws(' | ',
    case when m.tipo = 'tipo rango' then 'El paso 2 no mueve tipos rango (sus funciones constructoras se quedarían en public); moverlo a mano' end,
    case when m.usado_por_otros_esquemas is not null then 'Depende de él: ' || m.usado_por_otros_esquemas end,
    case when m.mencionado_en_funciones is not null then 'Aparece en: ' || m.mencionado_en_funciones end,
    case when m.tareas_cron is not null then format('Aparece en %s tarea(s) de pg_cron', m.tareas_cron) end), '') as detalle
from marcas m
where not m.de_extension
union all
-- Una fila por extensión instalada en public (sus funciones/tipos no se listan uno por uno)
select 'extensión', e.extname || ' ' || e.extversion, null, null, 'EXTENSION',
  'Instalada en public. El paso 2 no la toca. Para sacarla: alter extension ' || e.extname || ' set schema extensions; (probar antes)'
from pg_extension e join pg_namespace n on n.oid = e.extnamespace
where n.nspname = 'public'
) inventario
order by
  case riesgo when 'REVISAR' then 1 when 'OK' then 2 else 3 end, tipo, objeto;

-- ---------------------------------------------------------------------
-- Consultas extra (correr una por una si hacen falta):
--
-- a) Tareas pg_cron que tocan public:
--   select jobid, jobname, schedule, command from cron.job
--   where command ~* 'public\.' order by jobid;
--
-- b) Triggers en auth / storage que llaman funciones de public
--    (p. ej. public.handle_new_user al crear usuarios):
--   select tg.tgrelid::regclass as tabla, tg.tgname, tg.tgfoid::regprocedure as funcion
--   from pg_trigger tg join pg_proc p on p.oid = tg.tgfoid join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and not tg.tgisinternal;
--
-- c) Tablas de public en la publicación de Realtime:
--   select * from pg_publication_tables where schemaname = 'public';
--
-- d) Extensiones instaladas en public (no se mueven con este script):
--   select e.extname, e.extversion from pg_extension e join pg_namespace n on n.oid = e.extnamespace
--   where n.nspname = 'public';
-- ---------------------------------------------------------------------
