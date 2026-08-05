-- Carga bajo demanda de promociones.
-- Ejecutar en Supabase SQL Editor despues de los scripts base del proyecto.
--
-- Objetivo:
-- 1. Evitar que el inicio de sesion descargue promociones historicas o no usadas.
-- 2. Mantener catalogos/actividades operativas disponibles para navegar.
-- 3. Dar conteos livianos para Inicio y Avances sin traer detalle de promociones.

create index if not exists idx_campanas_bootstrap_estado_tipo
on public.campanas(tipo_actividad, estado, created_at);

create index if not exists idx_promociones_scope
on public.promociones(campana_id, buyer_id, tipo_promo, created_at);

create index if not exists idx_promociones_scope_sku
on public.promociones(campana_id, buyer_id, tipo_promo, sku);

create index if not exists idx_comentarios_promocion_fecha
on public.comentarios(promocion_id, fecha);

create index if not exists idx_comentarios_campana_alcance_fecha
on public.comentarios(campana_id, alcance_comentario, fecha);

create index if not exists idx_avances_catalogo_scope
on public.avances_catalogo(campana_id, buyer_id, estado);

create or replace view public.v_catalogos_operativos
with (security_invoker = true) as
select c.*
from public.campanas c
where coalesce(c.estado, '') not in (
  'Archivado', 'Archivada', 'ARCHIVADO', 'ARCHIVADA',
  'Cancelado', 'Cancelada', 'CANCELADO', 'CANCELADA',
  'Cerrado', 'Cerrada', 'CERRADO', 'CERRADA',
  'Finalizado', 'Finalizada', 'FINALIZADO', 'FINALIZADA',
  'Resuelto', 'Resuelta', 'RESUELTO', 'RESUELTA'
);

create or replace view public.v_catalogo_resumen
with (security_invoker = true) as
select
  c.id as campana_id,
  c.legacy_actividad_id as actividad_id,
  c.tipo_actividad,
  c.estado,
  p.buyer_id,
  b.comprador_id,
  coalesce(b.comprador, '') as comprador,
  coalesce(j.division, b.division, '') as division,
  count(p.id)::integer as promociones_count,
  count(distinct p.oferta_id)::integer as ofertas_count,
  count(distinct p.sku)::integer as skus_count,
  count(cm.id) filter (where cm.estado = 'ABIERTO')::integer as comentarios_abiertos_count
from public.v_catalogos_operativos c
left join public.promociones p on p.campana_id = c.id
left join public.compradores b on b.id = p.buyer_id
left join public.jerarquia_categorias j on j.dep_id = p.dep_id
left join public.comentarios cm
  on cm.promocion_id = p.id
  and cm.alcance_comentario = 'LINEA'
group by
  c.id,
  c.legacy_actividad_id,
  c.tipo_actividad,
  c.estado,
  p.buyer_id,
  b.comprador_id,
  b.comprador,
  coalesce(j.division, b.division, '');

grant select on
  public.v_catalogos_operativos,
  public.v_catalogo_resumen
to authenticated;
