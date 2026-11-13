-- =============================================================================
-- Migración Supabase: Agregar columna "numero_pagina" a public.promociones
-- =============================================================================
-- Propósito:
-- Permite al equipo de Compras comunicar a Mercadeo en qué página de catálogo
-- solicitan o sugieren que aparezcan los SKUs cargados.
-- Es un campo opcional (puede ser NULL o vacío).
-- =============================================================================

-- 1. Asegurar columnas requeridas en usuarios_app y promociones si la base ya existía
ALTER TABLE public.usuarios_app
  ADD COLUMN IF NOT EXISTS buyer_id uuid REFERENCES public.compradores(id);

ALTER TABLE public.promociones
  ADD COLUMN IF NOT EXISTS buyer_id uuid REFERENCES public.compradores(id);

ALTER TABLE public.promociones
  ADD COLUMN IF NOT EXISTS numero_pagina INTEGER DEFAULT NULL;

COMMENT ON COLUMN public.promociones.numero_pagina IS 'Número de página de catálogo sugerido u ordenado por el comprador para Mercadeo/Diseño.';

-- 2. Eliminar vistas previas con CASCADE para evitar el error 42P16 (cannot drop columns from view)
DROP VIEW IF EXISTS public.export_planimetria CASCADE;
DROP VIEW IF EXISTS public.export_mercadeo CASCADE;
DROP VIEW IF EXISTS public.export_pricing CASCADE;
DROP VIEW IF EXISTS public.consolidado CASCADE;

-- 3. Recrear las vistas incluyendo numero_pagina y comentarios de actividad
CREATE OR REPLACE VIEW public.consolidado
WITH (security_invoker = true) AS
WITH comentarios_actividad AS (
  SELECT
    campana_id,
    string_agg(estado || ': ' || comentario, ' | ' ORDER BY fecha) AS comentarios_actividad,
    count(*) FILTER (WHERE estado = 'ABIERTO') AS comentarios_actividad_abiertos
  FROM public.comentarios
  WHERE alcance_comentario = 'ACTIVIDAD'
  GROUP BY campana_id
)
SELECT
  c.legacy_actividad_id AS actividad_id,
  p.oferta_id,
  c.tipo_actividad,
  c.canal,
  p.alcance_tipo,
  p.alcance_valor,
  b.comprador,
  b.division,
  p.tipo_promo,
  p.grupo_oferta,
  p.tipo_sku,
  p.variante,
  p.sku,
  p.numero_pagina,
  p.num_parte,
  p.descripcion,
  p.tipo_cantidad,
  p.cantidad_minima,
  p.precio_antes,
  p.precio_ahora,
  p.descuento,
  p.comentario_comprador,
  p.aplica_segmento,
  p.segmento_cliente,
  CASE WHEN p.aplica_segmento = 'SI' THEN p.segmento_cliente ELSE 'Todos' END AS segmento,
  p.estado_registro,
  count(cm.id) FILTER (WHERE cm.estado = 'ABIERTO') AS comentarios_abiertos,
  count(cm.id) AS total_comentarios,
  coalesce(ca.comentarios_actividad, '') AS comentarios_actividad,
  coalesce(ca.comentarios_actividad_abiertos, 0) AS comentarios_actividad_abiertos,
  p.usuario_crea,
  p.usuario_edita,
  p.updated_at AS fecha_modificacion,
  p.ultima_modificacion_por
FROM public.promociones p
JOIN public.campanas c ON c.id = p.campana_id
JOIN public.compradores b ON b.id = p.buyer_id
LEFT JOIN public.comentarios cm
  ON cm.promocion_id = p.id
  AND cm.alcance_comentario = 'LINEA'
LEFT JOIN comentarios_actividad ca ON ca.campana_id = p.campana_id
GROUP BY c.legacy_actividad_id, p.oferta_id, c.tipo_actividad, c.canal, p.alcance_tipo,
  p.alcance_valor, b.comprador, b.division, p.tipo_promo, p.grupo_oferta, p.tipo_sku,
  p.variante, p.sku, p.numero_pagina, p.num_parte, p.descripcion, p.tipo_cantidad, p.cantidad_minima,
  p.precio_antes, p.precio_ahora, p.descuento, p.comentario_comprador, p.aplica_segmento,
  p.segmento_cliente, p.estado_registro, ca.comentarios_actividad,
  ca.comentarios_actividad_abiertos, p.usuario_crea, p.usuario_edita, p.updated_at, p.ultima_modificacion_por;

CREATE OR REPLACE VIEW public.export_pricing
WITH (security_invoker = true) AS
WITH comentarios_actividad AS (
  SELECT
    campana_id,
    string_agg(estado || ': ' || comentario, ' | ' ORDER BY fecha) AS comentarios_actividad
  FROM public.comentarios
  WHERE alcance_comentario = 'ACTIVIDAD'
  GROUP BY campana_id
)
SELECT
  c.legacy_actividad_id AS actividad_id,
  p.oferta_id,
  c.tipo_actividad,
  c.canal,
  p.alcance_tipo,
  p.alcance_valor,
  b.comprador,
  p.tipo_promo,
  p.grupo_oferta,
  p.tipo_sku,
  p.variante,
  p.sku,
  p.tipo_cantidad,
  p.cantidad_minima,
  p.precio_antes,
  p.precio_ahora,
  p.descuento,
  p.aplica_segmento,
  p.segmento_cliente,
  CASE WHEN p.aplica_segmento = 'SI' THEN p.segmento_cliente ELSE 'Todos' END AS segmento,
  p.estado_registro,
  coalesce(ca.comentarios_actividad, '') AS comentarios_actividad
FROM public.promociones p
JOIN public.campanas c ON c.id = p.campana_id
JOIN public.compradores b ON b.id = p.buyer_id
LEFT JOIN comentarios_actividad ca ON ca.campana_id = p.campana_id;

CREATE OR REPLACE VIEW public.export_mercadeo
WITH (security_invoker = true) AS
WITH comentarios_actividad AS (
  SELECT
    campana_id,
    string_agg(estado || ': ' || comentario, ' | ' ORDER BY fecha) AS comentarios_actividad
  FROM public.comentarios
  WHERE alcance_comentario = 'ACTIVIDAD'
  GROUP BY campana_id
)
SELECT
  c.legacy_actividad_id AS actividad_id,
  p.oferta_id,
  c.tipo_actividad,
  c.canal,
  p.alcance_tipo,
  p.alcance_valor,
  b.comprador,
  p.tipo_promo,
  p.grupo_oferta,
  p.variante,
  p.sku,
  p.numero_pagina,
  p.num_parte,
  p.descripcion,
  p.precio_antes,
  p.precio_ahora,
  p.descuento,
  p.comentario_comprador,
  p.aplica_segmento,
  p.segmento_cliente,
  CASE WHEN p.aplica_segmento = 'SI' THEN p.segmento_cliente ELSE 'Todos' END AS segmento,
  coalesce(ca.comentarios_actividad, '') AS comentarios_actividad,
  string_agg(cm.comentario, ' | ' ORDER BY cm.fecha) FILTER (WHERE cm.estado = 'ABIERTO') AS comentarios_abiertos_mercadeo
FROM public.promociones p
JOIN public.campanas c ON c.id = p.campana_id
JOIN public.compradores b ON b.id = p.buyer_id
LEFT JOIN public.comentarios cm
  ON cm.promocion_id = p.id
  AND cm.alcance_comentario = 'LINEA'
LEFT JOIN comentarios_actividad ca ON ca.campana_id = p.campana_id
GROUP BY c.legacy_actividad_id, p.oferta_id, c.tipo_actividad, c.canal, p.alcance_tipo,
  p.alcance_valor, b.comprador, p.tipo_promo, p.grupo_oferta, p.variante, p.sku,
  p.numero_pagina, p.num_parte, p.descripcion, p.precio_antes, p.precio_ahora, p.descuento,
  p.comentario_comprador, p.aplica_segmento, p.segmento_cliente, ca.comentarios_actividad;

CREATE OR REPLACE VIEW public.export_planimetria
WITH (security_invoker = true) AS
WITH comentarios_actividad AS (
  SELECT
    campana_id,
    string_agg(estado || ': ' || comentario, ' | ' ORDER BY fecha) AS comentarios_actividad
  FROM public.comentarios
  WHERE alcance_comentario = 'ACTIVIDAD'
  GROUP BY campana_id
)
SELECT
  c.legacy_actividad_id AS actividad_id,
  p.oferta_id,
  c.tipo_actividad,
  c.canal,
  p.alcance_tipo,
  p.alcance_valor,
  b.comprador,
  b.division,
  p.tipo_promo,
  p.grupo_oferta,
  p.variante,
  p.sku,
  p.descripcion,
  p.precio_antes,
  p.precio_ahora,
  p.descuento,
  p.aplica_segmento,
  p.segmento_cliente,
  CASE WHEN p.aplica_segmento = 'SI' THEN p.segmento_cliente ELSE 'Todos' END AS segmento,
  p.estado_registro,
  coalesce(ca.comentarios_actividad, '') AS comentarios_actividad
FROM public.promociones p
JOIN public.campanas c ON c.id = p.campana_id
JOIN public.compradores b ON b.id = p.buyer_id
LEFT JOIN comentarios_actividad ca ON ca.campana_id = p.campana_id;

-- 4. Grants de permisos sobre las vistas actualizadas
GRANT SELECT ON
  public.consolidado,
  public.export_pricing,
  public.export_mercadeo,
  public.export_planimetria
TO authenticated;

-- 5. Verificación
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'promociones'
      AND column_name = 'numero_pagina'
  ) THEN
    RAISE NOTICE 'Migración completada exitosamente: columna numero_pagina y vistas actualizadas.';
  END IF;
END $$;
