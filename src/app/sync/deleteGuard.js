// Protección contra borrados masivos de promociones.
//
// El guardado borra en Supabase toda promoción que está en la copia sincronizada
// y ya no está en la grilla. Si una carga o un refresco deja la grilla incompleta,
// el siguiente guardado borraría líneas que nadie pidió borrar. Estas reglas
// detectan ese caso antes de enviar y exigen una confirmación explícita.
//
// La misma regla existe en Supabase (docs/supabase_guardia_borrado_promociones.sql).
// Si se cambia aquí, cambiarla también allá.
export const BULK_DELETE_RULE = Object.freeze({
  minRows: 20,
  ratio: 0.1,
});

export const BULK_DELETE_HEADER = "x-promo-allow-bulk-delete";

function text(value) {
  return String(value ?? "").trim();
}

function getSnapshotActivityId(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return "";
  return text(snapshot.actividad_id || snapshot.actividadId);
}

export function isBulkDeleteGroup(group, rule = BULK_DELETE_RULE) {
  const deleted = Number(group?.eliminadas) || 0;
  const total = Number(group?.total) || 0;
  return deleted > rule.minRows && deleted > rule.ratio * total;
}

/**
 * Agrupa por actividad las promociones que el guardado va a eliminar.
 * `total` es cuántas promociones de esa actividad había en la copia sincronizada.
 */
export function analyzePromotionDeletes(deletedRowIds = [], syncedState = new Map(), rule = BULK_DELETE_RULE) {
  const totals = new Map();
  syncedState.forEach((snapshot) => {
    const activityId = getSnapshotActivityId(snapshot);
    totals.set(activityId, (totals.get(activityId) || 0) + 1);
  });

  const groupsById = new Map();
  Array.from(new Set((deletedRowIds || []).map(text).filter(Boolean))).forEach((rowId) => {
    const activityId = getSnapshotActivityId(syncedState.get(rowId));
    if (!groupsById.has(activityId)) {
      groupsById.set(activityId, { actividadId: activityId, eliminadas: 0, total: totals.get(activityId) || 0, rowIds: [] });
    }
    const group = groupsById.get(activityId);
    group.eliminadas += 1;
    group.rowIds.push(rowId);
  });

  const groups = Array.from(groupsById.values()).sort((a, b) => b.eliminadas - a.eliminadas);
  const bulkGroups = groups.filter((group) => isBulkDeleteGroup(group, rule));
  return {
    total: groups.reduce((sum, group) => sum + group.eliminadas, 0),
    groups,
    bulkGroups,
    isBulk: bulkGroups.length > 0,
  };
}

/** Clave estable del conjunto de borrados aprobado por el usuario. */
export function getDeleteApprovalKey(deletedRowIds = []) {
  return Array.from(new Set((deletedRowIds || []).map(text).filter(Boolean))).sort().join("|");
}

export function describeBulkDeleteGroups(groups = []) {
  return groups
    .map((group) => `${group.actividadId || "Sin actividad"}: ${group.eliminadas} de ${group.total} promociones`)
    .join("; ");
}

/**
 * Tras refrescar actividades desde Supabase, quita de la copia sincronizada las
 * promociones de esas actividades que ya no llegaron. Así una línea que falta en el
 * refresco no queda "pendiente de borrar" en el siguiente guardado.
 * Devuelve los IDs quitados.
 */
export function pruneSyncedPromotionsForActivities(syncedState, activityIds, keepRowIds) {
  const activities = new Set(Array.from(activityIds || []).map(text).filter(Boolean));
  const keep = new Set(Array.from(keepRowIds || []).map(text).filter(Boolean));
  const removed = [];
  if (!syncedState || !activities.size) return removed;
  Array.from(syncedState.entries()).forEach(([rowId, snapshot]) => {
    if (!activities.has(getSnapshotActivityId(snapshot))) return;
    if (keep.has(text(rowId))) return;
    syncedState.delete(rowId);
    removed.push(rowId);
  });
  return removed;
}

/** Igual que la anterior, para comentarios: la copia de comentarios no guarda la actividad. */
export function pruneSyncedIds(syncedState, candidateIds, keepIds) {
  const keep = new Set(Array.from(keepIds || []).map(text).filter(Boolean));
  const removed = [];
  if (!syncedState) return removed;
  Array.from(new Set(Array.from(candidateIds || []).map(text).filter(Boolean))).forEach((id) => {
    if (keep.has(id) || !syncedState.has(id)) return;
    syncedState.delete(id);
    removed.push(id);
  });
  return removed;
}
