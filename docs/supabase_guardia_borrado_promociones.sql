-- =====================================================================
-- supabase_guardia_borrado_promociones.sql
-- Guardia contra borrados masivos de promociones desde la app.
--
-- Contexto: el guardado de la app borra toda promocion que esta en su copia
-- sincronizada y ya no esta en pantalla. Si una carga o un refresco deja la
-- pantalla incompleta, el siguiente guardado borraria lineas que nadie pidio
-- borrar. Este trigger es la ultima barrera: si una sola sentencia DELETE
-- elimina mas de 20 promociones Y mas del 10 % de una actividad, la rechaza
-- (y con ella todo el guardado, que es transaccional).
--
-- Como se autoriza un borrado masivo intencional: la app lo confirma con el
-- usuario y envia el encabezado HTTP  x-promo-allow-bulk-delete: true
-- (PostgREST lo expone en request.headers).
--
-- No aplica a:
--   * SQL Editor, service_role y tareas internas (solo actua con rol authenticated);
--   * borrados en cascada al eliminar la campaña completa.
--
-- La misma regla esta en el frontend: src/app/sync/deleteGuard.js (BULK_DELETE_RULE).
-- Si se cambia aqui, cambiarla tambien alla.
--
-- Depende de: tablas public.promociones y public.campanas (supabase_schema.sql).
-- Repetible: si. Destructivo: no (solo crea funcion y trigger).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.guard_promociones_bulk_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_min_rows CONSTANT integer := 20;
  c_ratio CONSTANT numeric := 0.10;
  v_claims jsonb;
  v_headers jsonb;
  v_offender record;
BEGIN
  v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  IF coalesce(v_claims ->> 'role', '') <> 'authenticated' THEN
    RETURN NULL;
  END IF;

  v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  IF lower(coalesce(v_headers ->> 'x-promo-allow-bulk-delete', '')) IN ('true', '1') THEN
    RETURN NULL;
  END IF;

  SELECT
    d.campana_id,
    coalesce(c.legacy_actividad_id, d.campana_id::text) AS actividad_id,
    count(*) AS eliminadas,
    count(*) + (SELECT count(*) FROM public.promociones p WHERE p.campana_id = d.campana_id) AS total
  INTO v_offender
  FROM deleted_rows d
  JOIN public.campanas c ON c.id = d.campana_id   -- sin campaña = borrado en cascada: se permite
  GROUP BY d.campana_id, c.legacy_actividad_id
  HAVING count(*) > c_min_rows
     AND count(*) > c_ratio * (count(*) + (SELECT count(*) FROM public.promociones p WHERE p.campana_id = d.campana_id))
  ORDER BY count(*) DESC
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'PROMO_BULK_DELETE_BLOCKED'
      USING
        ERRCODE = 'P0001',
        DETAIL = jsonb_build_object(
          'type', 'PROMO_BULK_DELETE_BLOCKED',
          'actividad_id', v_offender.actividad_id,
          'eliminadas', v_offender.eliminadas,
          'total', v_offender.total
        )::text,
        HINT = 'Borrado masivo de promociones sin confirmacion explicita. Recargue los datos o confirme el borrado en la app.';
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS promociones_guard_bulk_delete ON public.promociones;
CREATE TRIGGER promociones_guard_bulk_delete
AFTER DELETE ON public.promociones
REFERENCING OLD TABLE AS deleted_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.guard_promociones_bulk_delete();

-- Verificacion: debe devolver 1 fila.
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgrelid = 'public.promociones'::regclass
  AND tgname = 'promociones_guard_bulk_delete';
