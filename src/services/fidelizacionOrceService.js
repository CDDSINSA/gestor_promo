import { normalizeRole, ROLES } from "../constants/permissions";
import { hasSupabaseConnection } from "./supabase";
import { callRpc } from "./supabase/http";
import { extractRowsFromExcel, loadCanastoFidelizacion } from "./fidelizacionService";
import { parseOrceReportRows, buildOrcePreview } from "../features/fidelizacion/orceReconciliation";

function assertImporter(connection) {
  if (![ROLES.ADMIN, ROLES.OPER].includes(normalizeRole(connection?.appUser?.rol || connection?.appUser?.role))) throw new Error("Solo Ejecutor o Administrador puede conciliar IDs de ORCE.");
  if (!hasSupabaseConnection(connection)) throw new Error("La conciliación requiere conexión a Supabase.");
}

export async function previewOrceImport(connection, file, segments) {
  assertImporter(connection);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Managua", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const report = parseOrceReportRows(await extractRowsFromExcel(file), segments, today);
  if (!report.sourceRows) throw new Error("El reporte no contiene datos.");
  const channels = [...new Set(report.rows.filter((r) => r.status === "LISTO").map((r) => r.canal))];
  const data = await Promise.all(channels.map((canal) => loadCanastoFidelizacion(connection, { canal })));
  return buildOrcePreview(report, data.flat());
}

export async function saveOrceImport(connection, filename, preview, operationId, onProgress = () => {}) {
  assertImporter(connection);
  const rows = preview.rows.filter((r) => r.status === "LISTO");
  if (!rows.length) throw new Error("No hay combinaciones listas para actualizar.");
  if (rows.some((r) => r.revision_esperada == null)) throw new Error("Falta aplicar la migración de conciliación ORCE en Supabase.");
  // Conflictos ya se evaluaron sobre el archivo completo. Lotes pequeños evitan
  // peticiones largas; sus IDs estables permiten reintentar tras una interrupción.
  const result = { updated: 0, rows: [] };
  for (let offset = 0; offset < rows.length; offset += 500) {
    const batchId = `${operationId.slice(0, 24)}${(offset / 500).toString(16).padStart(12, "0")}`;
    const saved = await callRpc(connection, "conciliar_fidelizacion_orce", {
      p_lote: batchId, p_archivo: filename,
      p_filas: rows.slice(offset, offset + 500).map(({ canal, sku, segmento_id, descuento, promo_id_orce, oferta_id_orce, revision_esperada }) =>
        ({ canal, sku, segmento_id, descuento, promo_id_orce, oferta_id_orce, revision_esperada })),
    });
    result.updated += saved.updated;
    result.rows.push(...saved.rows);
    onProgress({ processed: Math.min(offset + 500, rows.length), total: rows.length });
  }
  return result;
}
