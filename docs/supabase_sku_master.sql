-- ====================================================================
-- SCRIPT: Creación de tabla sku_master y funciones RPC en Supabase
-- Sistema de Gestión de Promociones Retail
-- ====================================================================

-- 1. Eliminar tabla previa obsoleta si existe (para recrear con la nueva estructura de columnas)
DROP TABLE IF EXISTS public.sku_master CASCADE;

-- 2. Crear tabla sku_master con las columnas solicitadas
CREATE TABLE public.sku_master (
  sku VARCHAR(50) PRIMARY KEY,
  num_parte VARCHAR(100),            -- VPN / Número de parte (Columna O / 15)
  descripcion TEXT NOT NULL,         -- ITEM_DESC (Columna D / 4)
  dep_id VARCHAR(50),                -- DEPT / Departamento (Columna E / 5)
  unidad_medida VARCHAR(20),         -- STANDARD_UOM (Columna H / 8)
  proveedor TEXT,                    -- SUP_NAME (Columna K / 11)
  precio_regular NUMERIC(12, 2),     -- UNIT_RETAIL (Columna M / 13)
  activo BOOLEAN DEFAULT true,
  actualizado_el TIMESTAMPTZ DEFAULT NOW()
);

-- Comentarios de documentación
COMMENT ON TABLE public.sku_master IS 'Maestro de productos y SKU importado desde el catálogo ERP.';
COMMENT ON COLUMN public.sku_master.sku IS 'Código SKU principal del artículo (Columna A - ITEM).';
COMMENT ON COLUMN public.sku_master.num_parte IS 'Número de parte o VPN del fabricante (Columna O - VPN).';
COMMENT ON COLUMN public.sku_master.descripcion IS 'Descripción comercial del artículo (Columna D - ITEM_DESC).';
COMMENT ON COLUMN public.sku_master.dep_id IS 'Código del departamento o división (Columna E - DEPT).';
COMMENT ON COLUMN public.sku_master.unidad_medida IS 'Unidad de medida estándar (Columna H - STANDARD_UOM).';
COMMENT ON COLUMN public.sku_master.proveedor IS 'Nombre del proveedor (Columna K - SUP_NAME).';
COMMENT ON COLUMN public.sku_master.precio_regular IS 'Precio de venta regular / lista con IVA (Columna M - UNIT_RETAIL).';

-- 3. Índices para búsqueda de alta velocidad
CREATE INDEX idx_sku_master_sku ON public.sku_master (sku);
CREATE INDEX idx_sku_master_num_parte ON public.sku_master (num_parte);
CREATE INDEX idx_sku_master_dep_id ON public.sku_master (dep_id);

-- 4. Habilitar Row Level Security (RLS)
ALTER TABLE public.sku_master ENABLE ROW LEVEL SECURITY;

-- Política de lectura: cualquier usuario autenticado en la app puede consultar el catálogo
CREATE POLICY "Lectura sku_master para usuarios autenticados"
ON public.sku_master
FOR SELECT
TO authenticated
USING (true);

-- Política de escritura directa (restringida a administradores)
-- Valida auth_user_id o id contra auth.uid() para total compatibilidad
CREATE POLICY "Escritura sku_master para administradores"
ON public.sku_master
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.usuarios_app
    WHERE (public.usuarios_app.auth_user_id = auth.uid() OR public.usuarios_app.id = auth.uid())
      AND UPPER(public.usuarios_app.rol) = 'ADMIN'
      AND public.usuarios_app.activo = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.usuarios_app
    WHERE (public.usuarios_app.auth_user_id = auth.uid() OR public.usuarios_app.id = auth.uid())
      AND UPPER(public.usuarios_app.rol) = 'ADMIN'
      AND public.usuarios_app.activo = true
  )
);

-- ====================================================================
-- 5. RPC: clear_sku_master
-- Vacía por completo la tabla sku_master para recargar desde cero.
-- ====================================================================
CREATE OR REPLACE FUNCTION public.clear_sku_master()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count_before INTEGER;
BEGIN
  -- Contar registros actuales antes de limpiar
  SELECT COUNT(*) INTO v_count_before FROM public.sku_master;

  -- Borrar todos los registros
  DELETE FROM public.sku_master;

  RETURN jsonb_build_object(
    'ok', true,
    'deleted_count', v_count_before,
    'message', 'Tabla sku_master vaciada correctamente para recarga desde cero.',
    'cleared_at', NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_sku_master() TO authenticated;

-- ====================================================================
-- 6. RPC: insert_sku_master_batch
-- Inserta un lote de filas de forma optimizada.
-- ====================================================================
CREATE OR REPLACE FUNCTION public.insert_sku_master_batch(p_rows JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INTEGER := 0;
BEGIN
  IF p_rows IS NULL OR jsonb_array_length(p_rows) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'inserted', 0);
  END IF;

  INSERT INTO public.sku_master (
    sku,
    num_parte,
    descripcion,
    dep_id,
    unidad_medida,
    proveedor,
    precio_regular,
    activo,
    actualizado_el
  )
  SELECT DISTINCT ON (TRIM(elem->>'sku'))
    TRIM(elem->>'sku'),
    COALESCE(NULLIF(TRIM(elem->>'num_parte'), ''), NULLIF(TRIM(elem->>'vpn'), '')),
    COALESCE(NULLIF(TRIM(elem->>'descripcion'), ''), 'Sin descripción'),
    NULLIF(TRIM(elem->>'dep_id'), ''),
    NULLIF(TRIM(elem->>'unidad_medida'), ''),
    NULLIF(TRIM(elem->>'proveedor'), ''),
    CASE 
      WHEN (elem->>'precio_regular') IS NOT NULL AND (elem->>'precio_regular') <> '' 
      THEN (elem->>'precio_regular')::NUMERIC 
      WHEN (elem->>'precio') IS NOT NULL AND (elem->>'precio') <> '' 
      THEN (elem->>'precio')::NUMERIC 
      ELSE NULL 
    END,
    COALESCE((elem->>'activo')::BOOLEAN, true),
    NOW()
  FROM jsonb_array_elements(p_rows) AS elem
  WHERE TRIM(elem->>'sku') IS NOT NULL AND TRIM(elem->>'sku') <> ''
  ORDER BY TRIM(elem->>'sku')
  ON CONFLICT (sku) DO UPDATE SET
    num_parte = EXCLUDED.num_parte,
    descripcion = EXCLUDED.descripcion,
    dep_id = EXCLUDED.dep_id,
    unidad_medida = EXCLUDED.unidad_medida,
    proveedor = EXCLUDED.proveedor,
    precio_regular = EXCLUDED.precio_regular,
    activo = EXCLUDED.activo,
    actualizado_el = NOW();

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'inserted', v_inserted,
    'timestamp', NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_sku_master_batch(JSONB) TO authenticated;

-- ====================================================================
-- 7. RPC: get_sku_master_summary
-- Devuelve total de SKU registrados y fecha del último registro.
-- ====================================================================
CREATE OR REPLACE FUNCTION public.get_sku_master_summary()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INTEGER;
  v_last_updated TIMESTAMPTZ;
BEGIN
  SELECT COUNT(*), MAX(actualizado_el)
  INTO v_total, v_last_updated
  FROM public.sku_master;

  RETURN jsonb_build_object(
    'ok', true,
    'total', COALESCE(v_total, 0),
    'last_updated', v_last_updated
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_sku_master_summary() TO authenticated;
