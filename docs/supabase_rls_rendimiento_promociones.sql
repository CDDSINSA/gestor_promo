-- =====================================================================
-- supabase_rls_rendimiento_promociones.sql
-- Rendimiento de lectura de public.promociones (carga inicial de la app).
--
-- Problema: la politica SELECT llama a is_any_role(), is_role() y
-- current_buyer_scope_ids() FILA POR FILA. Cada llamada consulta
-- usuarios_app (y, para BUYER, compradores con regexp). Con ~1.700
-- promociones la lectura tarda ~2,5 s.
--
-- Solucion: envolver cada llamada en (SELECT ...). Postgres la evalua una
-- sola vez por consulta (initPlan) y reutiliza el resultado. Es la
-- recomendacion de Supabase para RLS. Mismo resultado de permisos.
--
-- Depende de: supabase_schema.sql (funciones is_role, is_any_role,
--             current_buyer_scope_ids) y de la politica existente.
-- Repetible: si. Destructivo: no (solo reemplaza la politica SELECT).
-- =====================================================================

-- 0) Revision previa (opcional): la politica actual debe coincidir con la
--    que se reemplaza abajo. Si difiere, NO ejecutar el paso 1 y avisar.
SELECT policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'promociones'
  AND cmd = 'SELECT';

-- 1) Reemplazo de la politica SELECT
BEGIN;

DROP POLICY IF EXISTS promociones_select_roles ON public.promociones;
CREATE POLICY promociones_select_roles
ON public.promociones FOR SELECT
TO authenticated
USING (
  (SELECT public.is_any_role(ARRAY['ADMIN', 'MARK', 'OPER', 'DISENADOR', 'AUD']))
  OR (
    (SELECT public.is_role('BUYER'))
    -- El cast ::uuid[] es necesario: sin el, ANY((SELECT ...)) se interpreta
    -- como subconsulta de filas y falla con "uuid = uuid[]" (42883).
    AND buyer_id = ANY((SELECT public.current_buyer_scope_ids())::uuid[])
  )
);

COMMIT;

-- 2) Verificacion: debe mostrar las llamadas envueltas en SELECT.
SELECT policyname, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'promociones'
  AND policyname = 'promociones_select_roles';
