-- =====================================================================
-- supabase_g_comercial_segmentos_por_sku.sql
-- Segmentos de clientes por SKU en solicitudes especiales.
--
-- Esquema: g_comercial.
-- Requiere: supabase_g_comercial_consolidado.sql (pasos 1–41).
-- Repetible: sí. Destructivo: no (solo reemplaza un CHECK; no toca datos).
-- Si se vuelve a ejecutar supabase_g_comercial_consolidado.sql o parte1,
-- ejecutar de nuevo este script: reinstalarían la regla anterior.
--
-- Qué cambia:
--   Antes, una fila con alcance_tipo = 'SEGMENTO' debía tener exactamente el
--   segmento de la solicitud (segmento_cliente = alcance_valor). Eso impedía
--   que cada SKU tuviera sus propios segmentos.
--   Ahora basta con que la fila esté segmentada (aplica_segmento = 'SI') y
--   tenga al menos un segmento.
--
--   Las solicitudes NUEVAS ya no usan alcance 'SEGMENTO' (se guardan como CANAL
--   con segmentos por SKU), así que este paso solo hace falta para EDITAR los
--   segmentos de solicitudes viejas creadas con alcance "Segmento de clientes".
-- =====================================================================
begin;

do $$
begin
  if to_regclass('g_comercial.promociones') is null then
    raise exception 'No existe g_comercial.promociones: ejecute este script en la base de la app (Gestor Comercial).';
  end if;
end $$;

alter table g_comercial.promociones drop constraint if exists promociones_alcance_segmento;
alter table g_comercial.promociones add constraint promociones_alcance_segmento check (
  alcance_tipo <> 'SEGMENTO'
  or (aplica_segmento = 'SI' and length(trim(segmento_cliente)) > 0)
);

commit;

-- Verificación (ejecutar aparte): debe mostrar la regla nueva, sin "segmento_cliente = alcance_valor".
-- select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--  where conrelid = 'g_comercial.promociones'::regclass and conname = 'promociones_alcance_segmento';
