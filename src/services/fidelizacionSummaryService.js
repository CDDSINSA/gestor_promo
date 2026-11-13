import { normalizeRole, ROLES } from "../constants/permissions";
import { hasSupabaseConnection } from "./supabase";
import { selectAll } from "./supabase/http";

export async function loadFidelizacionSummary(connection, channel, signal) {
  if (![ROLES.ADMIN, ROLES.OPER].includes(normalizeRole(connection?.appUser?.rol || connection?.appUser?.role))) {
    throw new Error("El resumen está disponible para Administrador y Ejecutor.");
  }
  if (!hasSupabaseConnection(connection)) throw new Error("Conecte Supabase para consultar el resumen.");
  if (!["comasa", "retail"].includes(channel)) throw new Error("Canal no válido.");
  const [canasto, requests, segments] = await Promise.all([
    selectAll(connection, "canasto_fidelizacion", {
      select: "id,canal,sku,segmento_id,descuento,estatus,promo_id_orce,oferta_id_orce,estado_conciliacion_orce",
      canal: `eq.${channel}`, estatus: "eq.Activo", descuento: "gt.0", order: "id.asc",
    }, { signal }),
    selectAll(connection, "campanas", {
      select: "id,legacy_actividad_id,tipo_actividad,canal,estado,fecha_inicio,fecha_fin,promo_ids,oferta_ids",
      canal: `ilike.${channel}`, tipo_actividad: "eq.ESPECIAL", order: "id.asc",
    }, { signal }),
    selectAll(connection, "segmentos_clientes", {
      select: "id,legacy_segmento_id,nombre_segmento,canal,activo", canal: `ilike.${channel}`, order: "id.asc",
    }, { signal }),
  ]);
  if (![canasto, requests, segments].every(Array.isArray)) throw new Error("La consulta devolvió datos incompletos. Actualice el resumen.");
  return { canasto, requests, segments };
}
