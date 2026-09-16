import {
  expandPromotionContextIds,
  filterRowsByIds,
  getActivitySyncId,
  getAvanceSyncId,
  getBuyerSyncId,
  getCatalogSyncId,
  getChangedIds,
  getCommentSyncId,
  getDeletedIds,
  getJerarquiaSyncId,
  getNotificacionSyncId,
  getPromotionDetailSyncId,
  getPromotionSyncId,
  getResponsableSyncId,
  getSegmentoSyncId,
  getTouchedPromotionContextKeys,
} from "./syncOptions";

export function getFullSyncPayload(payload = {}) {
  return payload.__full_sync_payload || payload;
}

export function normalizePromotionConflict(raw = {}) {
  const conflicts = Array.isArray(raw.conflicts) ? raw.conflicts : [];
  const first = conflicts[0] || raw;
  if (!first) return null;
  return {
    row_id: first.row_id || first.id || "",
    expected_version: first.expected_version ?? "",
    current_version: first.current_version ?? "",
    fields: Array.isArray(first.fields) ? first.fields : [],
    current_row: first.current_row || null,
  };
}

export const compactSupabasePayload = (payload = {}) => {
  const syncOptions = payload.sync_options || {};
  const changedPromos = getChangedIds(syncOptions.promociones, "changed_row_ids", "changedRowIds");
  const deletedPromos = getDeletedIds(syncOptions.promociones, "deleted_row_ids", "deletedRowIds");
  const touchedPromotionContextKeys = getTouchedPromotionContextKeys(syncOptions.promociones);
  const promotionContextIds = expandPromotionContextIds(payload.promociones, changedPromos, touchedPromotionContextKeys);
  const changedActivities = getChangedIds(syncOptions.actividades);
  const changedCatalogos = changedActivities;

  return {
    ...payload,
    catalogos: filterRowsByIds(payload.catalogos, changedCatalogos, getCatalogSyncId),
    actividades: filterRowsByIds(payload.actividades, changedActivities, getActivitySyncId),
    compradores: filterRowsByIds(payload.compradores, getChangedIds(syncOptions.compradores), getBuyerSyncId),
    responsables_solicitudes: filterRowsByIds(payload.responsables_solicitudes, getChangedIds(syncOptions.responsables_solicitudes), getResponsableSyncId),
    jerarquia_categorias: filterRowsByIds(payload.jerarquia_categorias, getChangedIds(syncOptions.jerarquia_categorias), getJerarquiaSyncId),
    segmentos_clientes: filterRowsByIds(payload.segmentos_clientes, getChangedIds(syncOptions.segmentos_clientes), getSegmentoSyncId),
    notificaciones: filterRowsByIds(payload.notificaciones, getChangedIds(syncOptions.notificaciones), getNotificacionSyncId),
    promociones: filterRowsByIds(payload.promociones, promotionContextIds, getPromotionSyncId),
    promociones_detalle: filterRowsByIds(payload.promociones_detalle, changedPromos, getPromotionDetailSyncId),
    comentarios: filterRowsByIds(payload.comentarios, getChangedIds(syncOptions.comentarios), getCommentSyncId),
    logs: [],
    avances_catalogo: filterRowsByIds(payload.avances_catalogo, getChangedIds(syncOptions.avances_catalogo), getAvanceSyncId),
    sync_options: {
      ...syncOptions,
      promociones: {
        ...(syncOptions.promociones || {}),
        deleted_row_ids: Array.from(deletedPromos),
        validation_row_ids: Array.from(promotionContextIds),
        touched_context_keys: Array.from(touchedPromotionContextKeys),
      },
    },
  };
};

export const getDeltaCounts = (payload = {}) => {
  const syncOptions = payload.sync_options || {};
  const changedPromos = getChangedIds(syncOptions.promociones, "changed_row_ids", "changedRowIds").size;
  const deletedPromos = getDeletedIds(syncOptions.promociones, "deleted_row_ids", "deletedRowIds").size;
  return {
    promociones: changedPromos,
    promocionesEliminadas: deletedPromos,
    comentarios: getChangedIds(syncOptions.comentarios).size,
    avances: getChangedIds(syncOptions.avances_catalogo).size,
    actividades: getChangedIds(syncOptions.actividades).size,
    compradores: Array.isArray(payload.compradores) ? payload.compradores.length : getChangedIds(syncOptions.compradores).size,
    responsables: getChangedIds(syncOptions.responsables_solicitudes).size,
    jerarquia: getChangedIds(syncOptions.jerarquia_categorias).size,
    segmentos: getChangedIds(syncOptions.segmentos_clientes).size,
    notificaciones: getChangedIds(syncOptions.notificaciones).size,
  };
};

export const hasSupabaseDeltaChanges = (payload = {}) => {
  const counts = getDeltaCounts(payload);
  return Object.values(counts).some((count) => count > 0);
};

export const buildSaveOperationSummary = (payload = {}) => {
  const counts = getDeltaCounts(payload);
  const parts = [
    counts.promociones ? `${counts.promociones} promociones` : "",
    counts.promocionesEliminadas ? `${counts.promocionesEliminadas} eliminadas` : "",
    counts.comentarios ? `${counts.comentarios} comentarios` : "",
    counts.avances ? `${counts.avances} avances` : "",
    counts.actividades ? `${counts.actividades} actividades/catalogos` : "",
    counts.compradores ? `${counts.compradores} compradores` : "",
    counts.responsables ? `${counts.responsables} responsables` : "",
    counts.jerarquia ? `${counts.jerarquia} jerarquias` : "",
    counts.segmentos ? `${counts.segmentos} segmentos` : "",
    counts.notificaciones ? `${counts.notificaciones} notificaciones` : "",
  ].filter(Boolean);
  if (parts.length) return `delta: ${parts.join(", ")}`;
  const count = (items) => Array.isArray(items) ? items.length : 0;
  return `sin cambios detectados; ${count(getFullSyncPayload(payload).promociones)} promociones en memoria`;
};

