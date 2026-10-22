-- =====================================================================
-- supabase_carga_por_campana_rollback.sql
-- Deshace el paso 40 (supabase_carga_por_campana.sql).
-- Ejecutar solo despues de apagar la bandera VITE_CARGA_POR_CAMPANA en la app:
-- con la bandera apagada la app no usa estas vistas.
-- No toca datos: solo elimina vistas e indice.
-- =====================================================================

drop view if exists public.v_seguimiento_resumen;
drop view if exists public.v_comentarios_actividad_abiertos;
drop index if exists public.idx_promociones_campana_id_id;
