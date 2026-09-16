import {
  BUY_X_GET_X_PROMO_TYPE,
  MEGAPACK_PROMO_TYPE,
} from "../../constants";
import { toExcelRow } from "../../utils/promoHelpers";

export const PROMOTION_SYNC_FIELDS = [
  "row_id",
  "actividad_id",
  "oferta_id",
  "comprador",
  "division",
  "tipo_promo",
  "grupo_oferta",
  "tipo_sku",
  "variante",
  "dep_id",
  "sku",
  "num_parte",
  "descripcion",
  "tipo_cantidad",
  "cantidad_minima",
  "precio_antes",
  "precio_ahora",
  "descuento",
  "comentario_comprador",
  "aplica_segmento",
  "segmento_cliente",
  "alcance_tipo",
  "alcance_valor",
  "estado_registro",
  "usuario_crea",
  "usuario_edita",
  "ultima_modificacion_por",
];

export const BUYER_SYNC_FIELDS = [
  "comprador_id",
  "categoria_comprador",
  "comprador",
  "division",
  "correo",
  "senior_id",
  "activo",
];

export const ACTIVITY_SYNC_FIELDS = [
  "actividad_id",
  "nombre_actividad",
  "tipo_actividad",
  "canal",
  "fecha_inicio",
  "fecha_fin",
  "comprador",
  "solicitante",
  "estado",
  "motivo_solicitud",
  "responsable",
  "recursos_ocupados",
  "promo_ids",
  "oferta_ids",
];

export const CATALOG_SYNC_FIELDS = [
  "catalogo_id",
  "nombre",
  "canal",
  "vigencia_inicio",
  "vigencia_fin",
  "estado",
  "color",
  "doc_id",
  "token_conexion",
  "notificaciones",
  "notificaciones_envivo",
  "correos",
  "divisiones",
];

export const COMMENT_SYNC_FIELDS = [
  "comentario_id",
  "actividad_id",
  "row_id",
  "alcance_comentario",
  "prioridad",
  "usuario",
  "tipo_usuario",
  "comentario",
  "estado",
  "fecha",
  "resuelto_por",
  "fecha_resolucion",
];

export const LOG_SYNC_FIELDS = [
  "log_id",
  "fecha",
  "usuario",
  "catalogo",
  "accion",
  "row_id",
  "campo",
  "valor_anterior",
  "valor_nuevo",
  "fecha_cierre",
];

export const AVANCE_SYNC_FIELDS = [
  "avance_id",
  "catalogo_id",
  "catalogo",
  "comprador_id",
  "comprador",
  "division",
  "estado",
  "fecha_estado",
  "usuario",
];

export const RESPONSABLE_SYNC_FIELDS = [
  "responsable_id",
  "nombre",
  "area",
  "correo",
  "activo",
];

export const JERARQUIA_SYNC_FIELDS = [
  "dep_id",
  "dep_desc",
  "division",
  "activo",
];

export const SEGMENTO_SYNC_FIELDS = [
  "segmento_id",
  "nombre_segmento",
  "canal",
  "activo",
  "orden",
];

export const NOTIFICACION_SYNC_FIELDS = [
  "actividad_id",
  "catalogo_id",
  "correo",
  "activo",
];

export function getPromotionSyncId(row) {
  return String(row?.row_id || row?.id || "").trim();
}

export function getCommentSyncId(row) {
  return String(row?.comentario_id || row?.id || "").trim();
}

export function getLogSyncId(row) {
  return String(row?.log_id || row?.id || "").trim();
}

export function getAvanceSyncId(row) {
  return String(row?.avance_id || row?.id || "").trim();
}

export function getResponsableSyncId(row) {
  return String(row?.responsable_id || row?.id || "").trim();
}

export function getJerarquiaSyncId(row) {
  return String(row?.dep_id || row?.id || "").trim();
}

export function getSegmentoSyncId(row) {
  return String(row?.segmento_id || row?.id || "").trim();
}

export function getNotificacionSyncId(row) {
  const activityId = String(row?.actividad_id || row?.catalogo_id || "").trim();
  return String(row?.notificacion_id || row?.id || `${activityId}__${row?.correo || ""}`).trim();
}

export function getBuyerSyncId(row) {
  return String(row?.comprador_id || row?.compradorId || row?.id || row?.comprador || row?.nombre || "").trim();
}

export function getSyncSignature(row, fields) {
  return JSON.stringify(fields.map((field) => [field, String(row?.[field] ?? "").trim()]));
}

export function getPromotionSyncSignature(row) {
  return getSyncSignature(row, PROMOTION_SYNC_FIELDS);
}

export function getPromotionSyncVersion(row) {
  const raw = row?.version ?? row?.expected_version ?? row?.expectedVersion;
  if (raw === "" || raw === null || raw === undefined) return null;
  const version = Number(raw);
  return Number.isFinite(version) && version > 0 ? version : null;
}

export function getPromotionSyncSnapshot(row) {
  const normalized = toExcelRow(row);
  return {
    signature: getPromotionSyncSignature(normalized),
    contextKey: getPromotionContextKey(normalized),
    version: getPromotionSyncVersion(row),
  };
}

export function getSyncedPromotionSignature(value) {
  return typeof value === "string" ? value : value?.signature || "";
}

export function getSyncedPromotionContextKey(value) {
  return typeof value === "string" ? "" : value?.contextKey || "";
}

export function buildPromotionSyncState(promotions = []) {
  const state = new Map();
  promotions.forEach((row) => {
    const normalized = toExcelRow(row);
    const rowId = getPromotionSyncId(normalized);
    if (rowId) state.set(rowId, getPromotionSyncSnapshot(row));
  });
  return state;
}

export function buildPromotionSyncOptions(promotions = [], previousState = new Map()) {
  const currentState = buildPromotionSyncState(promotions);
  const changed_row_ids = [];
  const deleted_row_ids = [];
  const expected_versions = {};
  const touched_context_keys = new Set();

  currentState.forEach((snapshot, rowId) => {
    const previous = previousState.get(rowId);
    if (getSyncedPromotionSignature(previous) !== snapshot.signature) {
      changed_row_ids.push(rowId);
      const expectedVersion = getPromotionSyncVersion(previous);
      if (expectedVersion) expected_versions[rowId] = expectedVersion;
      if (snapshot.contextKey) touched_context_keys.add(snapshot.contextKey);
      const previousContextKey = getSyncedPromotionContextKey(previous);
      if (previousContextKey) touched_context_keys.add(previousContextKey);
    }
  });
  previousState.forEach((previous, rowId) => {
    if (!currentState.has(rowId)) {
      deleted_row_ids.push(rowId);
      const expectedVersion = getPromotionSyncVersion(previous);
      if (expectedVersion) expected_versions[rowId] = expectedVersion;
      const previousContextKey = getSyncedPromotionContextKey(previous);
      if (previousContextKey) touched_context_keys.add(previousContextKey);
    }
  });

  return { changed_row_ids, deleted_row_ids, expected_versions, touched_context_keys: Array.from(touched_context_keys) };
}

export function buildPromotionVersionMap(promotions = []) {
  const versions = new Map();
  (promotions || []).forEach((row) => {
    const rowId = getPromotionSyncId(row);
    const version = getPromotionSyncVersion(row);
    if (rowId && version) versions.set(rowId, version);
  });
  return versions;
}

export function applyPromotionVersions(promotions = [], savedPromotions = []) {
  const versions = buildPromotionVersionMap(savedPromotions);
  if (!versions.size) return promotions;
  return (promotions || []).map((row) => {
    const rowId = getPromotionSyncId(row);
    return rowId && versions.has(rowId) ? { ...row, version: versions.get(rowId) } : row;
  });
}

export function buildKeyedSyncState(rows = [], getKey, fields) {
  const state = new Map();
  rows.forEach((row) => {
    const key = String(getKey(row) || "").trim();
    if (key) state.set(key, getSyncSignature(row, fields));
  });
  return state;
}

export function buildKeyedSyncOptions(rows = [], previousState = new Map(), getKey, fields) {
  const currentState = buildKeyedSyncState(rows, getKey, fields);
  const changed_ids = [];
  const deleted_ids = [];

  currentState.forEach((signature, key) => {
    if (previousState.get(key) !== signature) changed_ids.push(key);
  });
  previousState.forEach((_, key) => {
    if (!currentState.has(key)) deleted_ids.push(key);
  });

  return { changed_ids, deleted_ids };
}

export function buildBuyerSyncOptions(rows = [], previousState = new Map()) {
  const options = buildKeyedSyncOptions(rows, previousState, getBuyerSyncId, BUYER_SYNC_FIELDS);
  const changedIds = new Set(options.changed_ids);

  rows.forEach((row) => {
    const syncId = getBuyerSyncId(row);
    if (!syncId || !changedIds.has(syncId)) return;
    [row.comprador, row.nombre].forEach((name) => {
      const value = String(name || "").trim();
      if (value) changedIds.add(value);
    });
  });

  return {
    ...options,
    changed_ids: Array.from(changedIds),
  };
}

function normalizeNotificacionSyncRow(row = {}) {
  const activityId = String(row.actividad_id || row.catalogo_id || "").trim();
  return {
    ...row,
    actividad_id: activityId,
    catalogo_id: activityId,
  };
}

export function buildNotificacionSyncState(rows = []) {
  return buildKeyedSyncState(rows.map(normalizeNotificacionSyncRow), getNotificacionSyncId, NOTIFICACION_SYNC_FIELDS);
}

export function buildNotificacionSyncOptions(rows = [], previousState = new Map()) {
  return buildKeyedSyncOptions(rows.map(normalizeNotificacionSyncRow), previousState, getNotificacionSyncId, NOTIFICACION_SYNC_FIELDS);
}

export function buildActivitySyncState(activities = [], catalogos = []) {
  const catalogById = new Map(catalogos.map((catalogo) => [String(catalogo.catalogo_id || catalogo.id || "").trim(), catalogo]));
  const rows = activities.map((activity) => ({
    ...activity,
    ...(catalogById.get(String(activity.actividad_id || "").trim()) || {}),
  }));
  return buildKeyedSyncState(rows, (row) => row.actividad_id, [...ACTIVITY_SYNC_FIELDS, ...CATALOG_SYNC_FIELDS]);
}

export function buildActivitySyncOptions(activities = [], catalogos = [], previousState = new Map()) {
  const catalogById = new Map(catalogos.map((catalogo) => [String(catalogo.catalogo_id || catalogo.id || "").trim(), catalogo]));
  const rows = activities.map((activity) => ({
    ...activity,
    ...(catalogById.get(String(activity.actividad_id || "").trim()) || {}),
  }));
  return buildKeyedSyncOptions(rows, previousState, (row) => row.actividad_id, [...ACTIVITY_SYNC_FIELDS, ...CATALOG_SYNC_FIELDS]);
}

export function getChangedIds(syncOptions, field = "changed_ids", fallbackField = "changedIds") {
  return new Set((syncOptions?.[field] || syncOptions?.[fallbackField] || []).map((value) => String(value || "").trim()).filter(Boolean));
}

export function getDeletedIds(syncOptions, field = "deleted_ids", fallbackField = "deletedIds") {
  return new Set((syncOptions?.[field] || syncOptions?.[fallbackField] || []).map((value) => String(value || "").trim()).filter(Boolean));
}

export function getTouchedPromotionContextKeys(syncOptions) {
  return new Set((syncOptions?.touched_context_keys || syncOptions?.touchedContextKeys || []).map((value) => String(value || "").trim()).filter(Boolean));
}

export function filterRowsByIds(rows = [], ids = new Set(), getKey) {
  if (!ids.size) return [];
  return (rows || []).filter((row) => ids.has(String(getKey(row) || "").trim()));
}

const PROMOTION_CONTEXT_TYPES = new Set(["Combo", BUY_X_GET_X_PROMO_TYPE, MEGAPACK_PROMO_TYPE]);

export function getPromotionContextKey(row = {}) {
  const tipoPromo = String(row.tipo_promo || row.tipoPromo || "").trim();
  if (!PROMOTION_CONTEXT_TYPES.has(tipoPromo)) return "";
  const actividadId = String(row.actividad_id || row.actividadId || row.catalogo_id || row.catalogoId || "").trim();
  const ofertaId = String(row.oferta_id || row.ofertaId || "").trim();
  if (!actividadId || !ofertaId) return "";
  return `${actividadId}::${tipoPromo}::${ofertaId}`;
}

export function expandPromotionContextIds(rows = [], changedIds = new Set(), touchedContextKeys = new Set()) {
  const contextKeys = new Set(touchedContextKeys);
  (rows || []).forEach((row) => {
    const rowId = getPromotionSyncId(row);
    if (!changedIds.has(rowId)) return;
    const contextKey = getPromotionContextKey(row);
    if (contextKey) contextKeys.add(contextKey);
  });
  if (!contextKeys.size) return new Set(changedIds);
  const contextIds = new Set(changedIds);
  (rows || []).forEach((row) => {
    const contextKey = getPromotionContextKey(row);
    if (contextKey && contextKeys.has(contextKey)) {
      const rowId = getPromotionSyncId(row);
      if (rowId) contextIds.add(rowId);
    }
  });
  return contextIds;
}

export function getCatalogSyncId(row) {
  return String(row?.catalogo_id || row?.id || "").trim();
}

export function getActivitySyncId(row) {
  return String(row?.actividad_id || row?.catalogo_id || row?.id || "").trim();
}

export function getPromotionDetailSyncId(row) {
  return String(row?.row_id || row?.rowId || "").trim();
}
