-- =====================================================================
-- supabase_carga_por_campana.sql   (paso 40)
-- Resumenes para la carga por campaña (bandera VITE_CARGA_POR_CAMPANA).
--
-- Con la carga por campaña la app ya no descarga todas las promociones al
-- iniciar sesion. Seguimiento e Inicio necesitan totales de las campañas que
-- no estan cargadas; estas vistas los calculan en el servidor.
--
--   v_seguimiento_resumen            -> pantalla Seguimiento (Gantt)
--   v_comentarios_actividad_abiertos -> alerta de comentarios del comprador en Inicio
--
-- Ambas usan security_invoker: respetan las mismas politicas RLS que la app.
-- La app funciona aunque este script no se haya ejecutado (usa sus datos locales),
-- pero Seguimiento e Inicio mostrarian menos informacion con la bandera activa.
--
-- Depende de: supabase_lazy_loading_promotions.sql (v_catalogos_operativos).
-- Repetible: si. Destructivo: no (solo crea vistas e indice).
-- Rollback: supabase_carga_por_campana_rollback.sql
-- =====================================================================

-- Indice para leer las promociones de una campaña en orden estable (paginado por id).
create index if not exists idx_promociones_campana_id_id
on public.promociones(campana_id, id);

-- Seguimiento: mismos calculos que src/features/seguimiento/ganttModel.js
--   compradores: nombre del comprador de cada promocion
--   tiendas:     alcance_valor cuando alcance_tipo es TIENDA
--   segmentos:   segmento_cliente si aplica_segmento = 'SI', o si no es "Todos"
--   ofertas:     oferta_id o, si esta vacio, grupo_oferta
create or replace view public.v_seguimiento_resumen
with (security_invoker = true) as
select
  c.id as campana_id,
  c.legacy_actividad_id as actividad_id,
  coalesce(array_agg(distinct nullif(btrim(b.comprador), '')) filter (where nullif(btrim(b.comprador), '') is not null), '{}') as compradores,
  coalesce(array_agg(distinct nullif(btrim(p.tipo_promo), '')) filter (where nullif(btrim(p.tipo_promo), '') is not null), '{}') as tipos_promo,
  coalesce(array_agg(distinct nullif(btrim(p.alcance_valor), '')) filter (
    where upper(btrim(coalesce(p.alcance_tipo, ''))) in ('TIENDA', 'TIENDAS', 'SUCURSAL')
      and nullif(btrim(p.alcance_valor), '') is not null
  ), '{}') as tiendas,
  coalesce(array_agg(distinct nullif(btrim(p.segmento_cliente), '')) filter (
    where nullif(btrim(p.segmento_cliente), '') is not null
      and (upper(btrim(coalesce(p.aplica_segmento, ''))) = 'SI' or lower(btrim(p.segmento_cliente)) <> 'todos')
  ), '{}') as segmentos,
  count(distinct nullif(btrim(p.sku), ''))::integer as skus_count,
  count(distinct coalesce(nullif(btrim(p.oferta_id), ''), nullif(btrim(p.grupo_oferta), '')))::integer as ofertas_count,
  count(p.id)::integer as promociones_count
from public.v_catalogos_operativos c
left join public.promociones p on p.campana_id = c.id
left join public.compradores b on b.id = p.buyer_id
group by c.id, c.legacy_actividad_id;

-- Comentarios de actividad abiertos por campaña (los de linea ya estan en v_catalogo_resumen).
create or replace view public.v_comentarios_actividad_abiertos
with (security_invoker = true) as
select
  c.id as campana_id,
  c.legacy_actividad_id as actividad_id,
  count(cm.id)::integer as abiertos
from public.v_catalogos_operativos c
join public.comentarios cm
  on cm.campana_id = c.id
 and cm.alcance_comentario = 'ACTIVIDAD'
 and upper(coalesce(cm.estado, '')) = 'ABIERTO'
group by c.id, c.legacy_actividad_id;

grant select on
  public.v_seguimiento_resumen,
  public.v_comentarios_actividad_abiertos
to authenticated;

-- Verificacion: debe devolver 2 filas.
select table_name
from information_schema.views
where table_schema = 'public'
  and table_name in ('v_seguimiento_resumen', 'v_comentarios_actividad_abiertos');
