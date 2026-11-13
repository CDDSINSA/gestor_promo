-- =============================================================================
-- Restauración Inmediata de Permisos RLS y Roles para el MVP de Promociones
-- =============================================================================
-- Ejecutar en Supabase SQL Editor para restablecer la visibilidad y permisos
-- de Compradores (BUYER), Mercadeo (MARK), Ejecutores (OPER) y Diseñadores (DISENADOR).
-- =============================================================================

BEGIN;

-- 1. Normalización de Roles en public.usuarios_app
ALTER TABLE public.usuarios_app
  DROP CONSTRAINT IF EXISTS usuarios_app_rol_check;

ALTER TABLE public.usuarios_app
  DROP CONSTRAINT IF EXISTS usuarios_app_buyer_required;

UPDATE public.usuarios_app
SET rol = CASE UPPER(TRIM(rol))
  WHEN 'ADMINISTRADOR' THEN 'ADMIN'
  WHEN 'COMPRADOR' THEN 'BUYER'
  WHEN 'COMP' THEN 'BUYER'
  WHEN 'MERCADEO' THEN 'MARK'
  WHEN 'MARKETING' THEN 'MARK'
  WHEN 'PRICING' THEN 'OPER'
  WHEN 'PRICE' THEN 'OPER'
  WHEN 'PLANIMETRIA' THEN 'OPER'
  WHEN 'EJECUTOR' THEN 'OPER'
  WHEN 'AUDITOR' THEN 'AUD'
  WHEN 'AUT' THEN 'AUD'
  WHEN 'CDD' THEN 'DISENADOR'
  WHEN 'DISEÑADOR' THEN 'DISENADOR'
  WHEN 'DISEÃ‘ADOR' THEN 'DISENADOR'
  WHEN 'DESIGNER' THEN 'DISENADOR'
  ELSE UPPER(TRIM(rol))
END;

ALTER TABLE public.usuarios_app
  ADD CONSTRAINT usuarios_app_rol_check
  CHECK (rol IN ('ADMIN', 'BUYER', 'MARK', 'OPER', 'AUD', 'DISENADOR'));

ALTER TABLE public.usuarios_app
  ADD CONSTRAINT usuarios_app_buyer_required
  CHECK (rol <> 'BUYER' OR buyer_id IS NOT NULL) NOT VALID;

-- 2. Funciones auxiliares de seguridad y compatibilidad de roles

CREATE OR REPLACE FUNCTION public.normalize_role(p_role text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE UPPER(TRIM(COALESCE(p_role, '')))
    WHEN 'ADMINISTRADOR' THEN 'ADMIN'
    WHEN 'COMPRADOR' THEN 'BUYER'
    WHEN 'COMP' THEN 'BUYER'
    WHEN 'MERCADEO' THEN 'MARK'
    WHEN 'MARKETING' THEN 'MARK'
    WHEN 'PRICING' THEN 'OPER'
    WHEN 'PRICE' THEN 'OPER'
    WHEN 'PLANIMETRIA' THEN 'OPER'
    WHEN 'EJECUTOR' THEN 'OPER'
    WHEN 'AUDITOR' THEN 'AUD'
    WHEN 'AUT' THEN 'AUD'
    WHEN 'CDD' THEN 'DISENADOR'
    WHEN 'DISEÑADOR' THEN 'DISENADOR'
    WHEN 'DISEÃ‘ADOR' THEN 'DISENADOR'
    WHEN 'DESIGNER' THEN 'DISENADOR'
    ELSE UPPER(TRIM(COALESCE(p_role, '')))
  END;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.normalize_role(rol)
  FROM public.usuarios_app
  WHERE auth_user_id = auth.uid()
    AND activo = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_buyer_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT buyer_id
  FROM public.usuarios_app
  WHERE auth_user_id = auth.uid()
    AND activo = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.usuarios_app
  WHERE auth_user_id = auth.uid()
    AND activo = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_label()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(nombre, ''), NULLIF(email, ''), '')
  FROM public.usuarios_app
  WHERE auth_user_id = auth.uid()
    AND activo = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_role(required_role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.normalize_role(public.current_user_role()) = public.normalize_role(required_role);
$$;

CREATE OR REPLACE FUNCTION public.is_any_role(required_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM unnest(required_roles) AS r
    WHERE public.normalize_role(r) = public.normalize_role(public.current_user_role())
  );
$$;

CREATE OR REPLACE FUNCTION public.current_buyer_scope_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH current_buyer AS (
    SELECT c.*
    FROM public.compradores c
    WHERE c.id = public.current_buyer_id()
      AND c.activo = true
    LIMIT 1
  ),
  buyer_scope AS (
    SELECT c.id
    FROM public.compradores c
    CROSS JOIN current_buyer cb
    WHERE c.activo = true
      AND (
        c.id = cb.id
        OR EXISTS (
          SELECT 1
          FROM regexp_split_to_table(COALESCE(c.senior_id, ''), '[;,|]+') AS ref(value)
          WHERE btrim(ref.value) IN (cb.id::text, cb.comprador_id, cb.comprador, cb.correo)
        )
        OR EXISTS (
          SELECT 1
          FROM regexp_split_to_table(COALESCE(cb.senior_id, ''), '[;,|]+') AS ref(value)
          WHERE btrim(ref.value) IN (c.id::text, c.comprador_id, c.comprador, c.correo)
        )
      )
  )
  SELECT COALESCE(array_agg(DISTINCT id), ARRAY[]::uuid[])
  FROM buyer_scope;
$$;

CREATE OR REPLACE FUNCTION public.can_write_comment_scope(
  p_promocion_id uuid,
  p_campana_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH current_user_data AS (
    SELECT
      id,
      buyer_id,
      public.normalize_role(rol) AS rol,
      lower(trim(COALESCE(nombre, ''))) AS nombre,
      lower(trim(COALESCE(email, ''))) AS email
    FROM public.usuarios_app
    WHERE auth_user_id = auth.uid()
      AND activo = true
    LIMIT 1
  ),
  target AS (
    SELECT
      p.id AS promocion_id,
      p.buyer_id AS promocion_buyer_id,
      COALESCE(cp.id, ca.id) AS campana_id,
      COALESCE(cp.solicitante_buyer_id, ca.solicitante_buyer_id) AS solicitante_buyer_id,
      COALESCE(cp.tipo_actividad, ca.tipo_actividad, '') AS tipo_actividad,
      lower(trim(COALESCE(cp.responsable, ca.responsable, ''))) AS responsable
    FROM (SELECT 1) seed
    LEFT JOIN public.promociones p ON p.id = p_promocion_id
    LEFT JOIN public.campanas cp ON cp.id = p.campana_id
    LEFT JOIN public.campanas ca ON ca.id = p_campana_id
  )
  SELECT COALESCE((
    SELECT
      u.rol = 'ADMIN'
      OR (
        u.rol = 'BUYER'
        AND (
          t.promocion_buyer_id = ANY(public.current_buyer_scope_ids())
          OR t.solicitante_buyer_id = ANY(public.current_buyer_scope_ids())
        )
      )
      OR (
        u.rol = 'MARK'
        AND t.campana_id IS NOT NULL
        AND (
          t.tipo_actividad = 'CATALOGO'
          OR NULLIF(t.responsable, '') IS NULL
          OR t.responsable IN (u.nombre, u.email)
        )
      )
    FROM current_user_data u
    CROSS JOIN target t
  ), false);
$$;

-- 3. Grants para el API de Supabase
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.compradores,
  public.usuarios_app,
  public.configuracion,
  public.campanas,
  public.segmentos_clientes,
  public.sku_master,
  public.promociones,
  public.promociones_detalle,
  public.comentarios,
  public.notificaciones
TO authenticated;

GRANT SELECT ON public.logs TO authenticated;

-- 4. Re-habilitar RLS
ALTER TABLE public.compradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios_app ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campanas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.segmentos_clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sku_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promociones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promociones_detalle ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comentarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;

-- 5. Políticas RLS actualizadas con los roles correctos (ADMIN, BUYER, MARK, OPER, DISENADOR, AUD)

-- COMPRADORES
DROP POLICY IF EXISTS compradores_select_authenticated ON public.compradores;
CREATE POLICY compradores_select_authenticated
ON public.compradores FOR SELECT
TO authenticated
USING (public.current_user_role() IS NOT NULL);

DROP POLICY IF EXISTS compradores_admin_all ON public.compradores;
CREATE POLICY compradores_admin_all
ON public.compradores FOR ALL
TO authenticated
USING (public.is_role('ADMIN'))
WITH CHECK (public.is_role('ADMIN'));

-- USUARIOS_APP
DROP POLICY IF EXISTS usuarios_select_self_or_admin ON public.usuarios_app;
DROP POLICY IF EXISTS usuarios_select_self_admin_mark ON public.usuarios_app;
CREATE POLICY usuarios_select_self_admin_mark
ON public.usuarios_app FOR SELECT
TO authenticated
USING (public.current_user_role() IS NOT NULL);

DROP POLICY IF EXISTS usuarios_admin_all ON public.usuarios_app;
CREATE POLICY usuarios_admin_all
ON public.usuarios_app FOR ALL
TO authenticated
USING (public.is_role('ADMIN'))
WITH CHECK (public.is_role('ADMIN'));

-- CONFIGURACION
DROP POLICY IF EXISTS configuracion_read_authenticated ON public.configuracion;
CREATE POLICY configuracion_read_authenticated
ON public.configuracion FOR SELECT
TO authenticated
USING (public.current_user_role() IS NOT NULL);

DROP POLICY IF EXISTS configuracion_admin_all ON public.configuracion;
CREATE POLICY configuracion_admin_all
ON public.configuracion FOR ALL
TO authenticated
USING (public.is_role('ADMIN'))
WITH CHECK (public.is_role('ADMIN'));

-- CAMPANAS / ACTIVIDADES
DROP POLICY IF EXISTS campanas_select_roles ON public.campanas;
CREATE POLICY campanas_select_roles
ON public.campanas FOR SELECT
TO authenticated
USING (public.is_any_role(ARRAY['ADMIN', 'BUYER', 'MARK', 'OPER', 'DISENADOR', 'AUD']));

DROP POLICY IF EXISTS campanas_write_admin_buyer ON public.campanas;
DROP POLICY IF EXISTS campanas_write_admin_mercadeo_comprador ON public.campanas;
CREATE POLICY campanas_write_admin_buyer
ON public.campanas FOR INSERT
TO authenticated
WITH CHECK (
  public.is_any_role(ARRAY['ADMIN', 'MARK'])
  OR (public.is_role('BUYER') AND solicitante_buyer_id = ANY(public.current_buyer_scope_ids()))
);

DROP POLICY IF EXISTS campanas_update_admin_buyer ON public.campanas;
DROP POLICY IF EXISTS campanas_update_admin_mercadeo_comprador ON public.campanas;
CREATE POLICY campanas_update_admin_buyer
ON public.campanas FOR UPDATE
TO authenticated
USING (
  public.is_any_role(ARRAY['ADMIN', 'MARK'])
  OR (public.is_role('BUYER') AND solicitante_buyer_id = ANY(public.current_buyer_scope_ids()))
)
WITH CHECK (
  public.is_any_role(ARRAY['ADMIN', 'MARK'])
  OR (public.is_role('BUYER') AND solicitante_buyer_id = ANY(public.current_buyer_scope_ids()))
);

-- SEGMENTOS_CLIENTES
DROP POLICY IF EXISTS segmentos_read_authenticated ON public.segmentos_clientes;
CREATE POLICY segmentos_read_authenticated
ON public.segmentos_clientes FOR SELECT
TO authenticated
USING (public.current_user_role() IS NOT NULL);

DROP POLICY IF EXISTS segmentos_admin_all ON public.segmentos_clientes;
CREATE POLICY segmentos_admin_all
ON public.segmentos_clientes FOR ALL
TO authenticated
USING (public.is_role('ADMIN'))
WITH CHECK (public.is_role('ADMIN'));

-- SKU_MASTER
DROP POLICY IF EXISTS sku_master_select_roles ON public.sku_master;
CREATE POLICY sku_master_select_roles
ON public.sku_master FOR SELECT
TO authenticated
USING (
  public.is_any_role(ARRAY['ADMIN', 'MARK', 'OPER', 'DISENADOR'])
  OR (public.is_role('BUYER') AND buyer_id = ANY(public.current_buyer_scope_ids()))
);

DROP POLICY IF EXISTS sku_master_write_owner_or_admin ON public.sku_master;
CREATE POLICY sku_master_write_owner_or_admin
ON public.sku_master FOR ALL
TO authenticated
USING (
  public.is_role('ADMIN')
  OR (public.is_role('BUYER') AND buyer_id = ANY(public.current_buyer_scope_ids()))
)
WITH CHECK (
  public.is_role('ADMIN')
  OR (public.is_role('BUYER') AND buyer_id = ANY(public.current_buyer_scope_ids()))
);

-- PROMOCIONES
DROP POLICY IF EXISTS promociones_select_roles ON public.promociones;
CREATE POLICY promociones_select_roles
ON public.promociones FOR SELECT
TO authenticated
USING (
  public.is_any_role(ARRAY['ADMIN', 'MARK', 'OPER', 'DISENADOR', 'AUD'])
  OR (public.is_role('BUYER') AND buyer_id = ANY(public.current_buyer_scope_ids()))
);

DROP POLICY IF EXISTS promociones_insert_buyer_admin ON public.promociones;
CREATE POLICY promociones_insert_buyer_admin
ON public.promociones FOR INSERT
TO authenticated
WITH CHECK (
  public.is_role('ADMIN')
  OR (public.is_role('BUYER') AND buyer_id = ANY(public.current_buyer_scope_ids()))
);

DROP POLICY IF EXISTS promociones_update_buyer_admin ON public.promociones;
DROP POLICY IF EXISTS promociones_update_buyer_admin_mercadeo ON public.promociones;
CREATE POLICY promociones_update_buyer_admin
ON public.promociones FOR UPDATE
TO authenticated
USING (
  public.is_role('ADMIN')
  OR (public.is_role('BUYER') AND buyer_id = ANY(public.current_buyer_scope_ids()))
)
WITH CHECK (
  public.is_role('ADMIN')
  OR (public.is_role('BUYER') AND buyer_id = ANY(public.current_buyer_scope_ids()))
);

DROP POLICY IF EXISTS promociones_delete_admin_owner ON public.promociones;
CREATE POLICY promociones_delete_admin_owner
ON public.promociones FOR DELETE
TO authenticated
USING (
  public.is_role('ADMIN')
  OR (public.is_role('BUYER') AND buyer_id = ANY(public.current_buyer_scope_ids()) AND estado_registro = 'BORRADOR')
);

-- PROMOCIONES_DETALLE
DROP POLICY IF EXISTS promociones_detalle_select_roles ON public.promociones_detalle;
CREATE POLICY promociones_detalle_select_roles
ON public.promociones_detalle FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.promociones p
    WHERE p.id = promocion_id
      AND (
        public.is_any_role(ARRAY['ADMIN', 'MARK', 'OPER', 'DISENADOR', 'AUD'])
        OR (public.is_role('BUYER') AND p.buyer_id = ANY(public.current_buyer_scope_ids()))
      )
  )
);

DROP POLICY IF EXISTS promociones_detalle_write_owner_admin ON public.promociones_detalle;
CREATE POLICY promociones_detalle_write_owner_admin
ON public.promociones_detalle FOR ALL
TO authenticated
USING (
  public.is_role('ADMIN')
  OR EXISTS (
    SELECT 1
    FROM public.promociones p
    WHERE p.id = promocion_id
      AND public.is_role('BUYER')
      AND p.buyer_id = ANY(public.current_buyer_scope_ids())
  )
)
WITH CHECK (
  public.is_role('ADMIN')
  OR EXISTS (
    SELECT 1
    FROM public.promociones p
    WHERE p.id = promocion_id
      AND public.is_role('BUYER')
      AND p.buyer_id = ANY(public.current_buyer_scope_ids())
  )
);

-- COMENTARIOS
DROP POLICY IF EXISTS comentarios_select_roles ON public.comentarios;
CREATE POLICY comentarios_select_roles
ON public.comentarios FOR SELECT
TO authenticated
USING (
  public.is_any_role(ARRAY['ADMIN', 'MARK', 'OPER', 'DISENADOR', 'AUD'])
  OR EXISTS (
    SELECT 1 FROM public.promociones p
    WHERE p.id = promocion_id
      AND public.is_role('BUYER')
      AND p.buyer_id = ANY(public.current_buyer_scope_ids())
  )
  OR EXISTS (
    SELECT 1 FROM public.campanas c
    WHERE c.id = campana_id
      AND public.is_role('BUYER')
      AND c.solicitante_buyer_id = ANY(public.current_buyer_scope_ids())
  )
);

DROP POLICY IF EXISTS comentarios_insert_mercadeo_admin ON public.comentarios;
DROP POLICY IF EXISTS comentarios_insert_mark_buyer_admin ON public.comentarios;
CREATE POLICY comentarios_insert_mark_buyer_admin
ON public.comentarios FOR INSERT
TO authenticated
WITH CHECK (
  public.can_write_comment_scope(promocion_id, campana_id)
  AND usuario_id = public.current_app_user_id()
);

DROP POLICY IF EXISTS comentarios_update_mercadeo_admin ON public.comentarios;
DROP POLICY IF EXISTS comentarios_update_mark_buyer_admin ON public.comentarios;
CREATE POLICY comentarios_update_mark_buyer_admin
ON public.comentarios FOR UPDATE
TO authenticated
USING (public.can_write_comment_scope(promocion_id, campana_id))
WITH CHECK (public.can_write_comment_scope(promocion_id, campana_id));

-- LOGS
DROP POLICY IF EXISTS logs_select_roles ON public.logs;
CREATE POLICY logs_select_roles
ON public.logs FOR SELECT
TO authenticated
USING (public.is_any_role(ARRAY['ADMIN', 'AUD']));

-- NOTIFICACIONES
DROP POLICY IF EXISTS notificaciones_select_roles ON public.notificaciones;
CREATE POLICY notificaciones_select_roles
ON public.notificaciones FOR SELECT
TO authenticated
USING (public.is_role('ADMIN'));

DROP POLICY IF EXISTS notificaciones_admin_all ON public.notificaciones;
CREATE POLICY notificaciones_admin_all
ON public.notificaciones FOR ALL
TO authenticated
USING (public.is_role('ADMIN'))
WITH CHECK (public.is_role('ADMIN'));

COMMIT;
