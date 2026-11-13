import { AIRES_PROMO_TYPE, BUY_X_GET_X_PROMO_TYPE, MEGAPACK_PROMO_TYPE } from "../../constants/promoConstants.js";

// Cantidad maxima de promociones modificadas por llamada a save_catalog_transactional.
// Con ~6.000 filas en una sola llamada la RPC supera el statement_timeout de Supabase
// (8 s para el rol authenticated). 500 filas tardan menos de 1 s en pruebas locales.
export const PROMOTION_SAVE_CHUNK_SIZE = 500;

// AIRES va completo en una sola parte: nunca queda guardado medio aire.
const GROUPED_OFFER_TYPES = new Set(["Combo", BUY_X_GET_X_PROMO_TYPE, MEGAPACK_PROMO_TYPE, AIRES_PROMO_TYPE]);

// Entidades de configuracion que las promociones pueden necesitar ya guardadas: van en la primera parte.
const LEADING_KEYS = ["catalogos", "actividades", "compradores", "responsables_solicitudes", "jerarquia_categorias", "segmentos_clientes"];
// Entidades que pueden apuntar a promociones nuevas: van en la ultima parte.
const TRAILING_KEYS = ["comentarios", "avances_catalogo", "notificaciones"];

const text = (value) => String(value ?? "").trim();
const promotionId = (row) => text(row?.row_id || row?.id);
const detailId = (row) => text(row?.row_id || row?.rowId);

function getPromotionSync(data = {}) {
  return data.sync_options?.promociones || data.sync_options?.promotions || null;
}

function readIds(sync, ...keys) {
  for (const key of keys) {
    if (Array.isArray(sync?.[key])) return sync[key].map(text).filter(Boolean);
  }
  return [];
}

function isGroupedOffer(row = {}) {
  return GROUPED_OFFER_TYPES.has(text(row.tipo_promo || row.tipoPromo));
}

function pickVersions(expectedVersions = {}, ids = []) {
  const result = {};
  ids.forEach((id) => {
    if (Object.prototype.hasOwnProperty.call(expectedVersions, id)) result[id] = expectedVersions[id];
  });
  return result;
}

/**
 * Divide un guardado grande en varias llamadas a la RPC.
 * - Si hay PROMOTION_SAVE_CHUNK_SIZE promociones modificadas o menos, devuelve el payload tal cual (una sola llamada).
 * - Las ofertas agrupadas (Combo, Compra X lleva X, Megapack, AIRES) y las eliminaciones viajan juntas en la primera parte,
 *   porque la RPC valida esas ofertas completas al final de cada llamada.
 * - Las promociones simples se reparten en partes de chunkSize.
 */
export function splitCatalogSavePayload(data = {}, chunkSize = PROMOTION_SAVE_CHUNK_SIZE) {
  const sync = getPromotionSync(data);
  const changedIds = readIds(sync, "changed_row_ids", "changedRowIds");
  if (!sync || changedIds.length <= chunkSize) return [data];

  const changedSet = new Set(changedIds);
  const deletedIds = readIds(sync, "deleted_row_ids", "deletedRowIds");
  const expectedVersions = sync.expected_versions || sync.expectedVersions || {};
  const promotions = Array.isArray(data.promociones) ? data.promociones : [];
  const details = Array.isArray(data.promociones_detalle) ? data.promociones_detalle : [];

  const groupedRows = promotions.filter(isGroupedOffer);
  const groupedChangedIds = groupedRows.map(promotionId).filter((id) => changedSet.has(id));
  const groupedChangedSet = new Set(groupedChangedIds);
  const simpleChangedIds = changedIds.filter((id) => !groupedChangedSet.has(id));

  const firstRoom = Math.max(chunkSize - groupedChangedIds.length, 0);
  const idGroups = [[...groupedChangedIds, ...simpleChangedIds.slice(0, firstRoom)]];
  for (let index = firstRoom; index < simpleChangedIds.length; index += chunkSize) {
    idGroups.push(simpleChangedIds.slice(index, index + chunkSize));
  }

  const promotionsById = new Map(promotions.map((row) => [promotionId(row), row]));
  const total = idGroups.length;

  return idGroups.map((ids, index) => {
    const isFirst = index === 0;
    const isLast = index === total - 1;
    const idSet = new Set(ids);
    const chunkPromotions = isFirst
      ? promotions.filter((row) => idSet.has(promotionId(row)) || isGroupedOffer(row))
      : ids.map((id) => promotionsById.get(id)).filter(Boolean);
    const chunkDeleted = isFirst ? deletedIds : [];

    const chunk = {
      ...data,
      promociones: chunkPromotions,
      promociones_detalle: details.filter((row) => idSet.has(detailId(row))),
      logs: [],
      sync_options: {
        ...(data.sync_options || {}),
        promociones: {
          ...sync,
          changed_row_ids: ids,
          deleted_row_ids: chunkDeleted,
          expected_versions: pickVersions(expectedVersions, [...ids, ...chunkDeleted]),
          validation_row_ids: ids,
          touched_context_keys: isFirst ? (sync.touched_context_keys || sync.touchedContextKeys || []) : [],
        },
      },
    };
    delete chunk.sync_options.promotions;
    delete chunk.sync_options.promociones.changedRowIds;
    delete chunk.sync_options.promociones.deletedRowIds;
    delete chunk.sync_options.promociones.expectedVersions;
    delete chunk.sync_options.promociones.validationRowIds;
    delete chunk.sync_options.promociones.touchedContextKeys;
    if (!isFirst) LEADING_KEYS.forEach((key) => { if (key in chunk) chunk[key] = []; });
    if (!isLast) TRAILING_KEYS.forEach((key) => { if (key in chunk) chunk[key] = []; });
    return chunk;
  });
}

/** Une las respuestas de las partes en una sola respuesta con la misma forma que la RPC. */
export function mergeCatalogSaveResponses(responses = []) {
  if (responses.length === 1) return responses[0];
  const last = responses[responses.length - 1] || {};
  const cambios = {};
  responses.forEach((response) => {
    Object.entries(response?.cambios || {}).forEach(([key, value]) => {
      cambios[key] = (cambios[key] || 0) + (Number(value) || 0);
    });
  });
  return {
    ...last,
    sync_mode: "delta",
    promociones: responses.flatMap((response) => (Array.isArray(response?.promociones) ? response.promociones : [])),
    cambios,
    partes: responses.length,
    idempotent_replay: responses.every((response) => response?.idempotent_replay),
  };
}
