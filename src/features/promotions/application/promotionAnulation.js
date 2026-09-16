import { isComplexPromoType } from "../../../promoTypes/promoTypeEngine";

export const ANULADO_STATUS = "ANULADO";

export function getPromotionStatusValue(row = {}) {
  return String(row.estado_registro || row.estadoRegistro || "").trim().toUpperCase();
}

export function isAnulledPromotion(row = {}) {
  return getPromotionStatusValue(row) === ANULADO_STATUS;
}

export function isPersistedPromotion(row = {}) {
  const version = row.version ?? row.expected_version ?? row.expectedVersion;
  return version !== undefined && version !== null && String(version).trim() !== "";
}

function getRowId(row = {}) {
  return String(row.id || row.row_id || row.rowId || "").trim();
}

function getActivityId(row = {}) {
  return String(row.actividadId || row.actividad_id || row.catalogo_id || row.catalogoId || "").trim();
}

function getPromoType(row = {}) {
  return String(row.tipoPromo || row.tipo_promo || "").trim();
}

function getOfferId(row = {}) {
  return String(row.ofertaId || row.oferta_id || "").trim();
}

export function getPromotionAnulationScope(targetRow = {}, rows = []) {
  const targetId = getRowId(targetRow);
  if (!targetId) return [];

  const promoType = getPromoType(targetRow);
  const activityId = getActivityId(targetRow);
  const offerId = getOfferId(targetRow);

  if (!isComplexPromoType(promoType) || !activityId || !offerId) {
    return rows.filter((row) => getRowId(row) === targetId);
  }

  return rows.filter((row) => (
    getActivityId(row) === activityId
    && getPromoType(row) === promoType
    && getOfferId(row) === offerId
  ));
}

export function getPromotionAnulationScopeByIds(ids = [], rows = []) {
  const targetIds = new Set(ids.map((id) => String(id || "").trim()).filter(Boolean));
  const scopedIds = new Set();

  rows.forEach((row) => {
    const rowId = getRowId(row);
    if (!targetIds.has(rowId)) return;
    getPromotionAnulationScope(row, rows).forEach((scopeRow) => {
      const scopeId = getRowId(scopeRow);
      if (scopeId) scopedIds.add(scopeId);
    });
  });

  return rows.filter((row) => scopedIds.has(getRowId(row)));
}

export function applyPromotionAnulation(rows = [], scopeRows = [], stampRow = (row) => row) {
  const scopeIds = new Set(scopeRows.map(getRowId).filter(Boolean));
  if (!scopeIds.size) return rows;

  return rows
    .filter((row) => !(scopeIds.has(getRowId(row)) && !isPersistedPromotion(row)))
    .map((row) => {
      if (!scopeIds.has(getRowId(row)) || !isPersistedPromotion(row)) return row;
      return stampRow({
        ...row,
        estado_registro: ANULADO_STATUS,
        estadoRegistro: ANULADO_STATUS,
      });
    });
}

export function summarizePromotionAnulation(scopeRows = []) {
  const persisted = scopeRows.filter(isPersistedPromotion).length;
  const local = scopeRows.length - persisted;
  return { persisted, local, total: scopeRows.length };
}
