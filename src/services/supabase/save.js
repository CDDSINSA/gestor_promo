import { normalizeRole, ROLES } from "../../constants/permissions";
import { formatPromotionValidationErrors, validatePromotions } from "../promotionValidationService";
import { cleanText } from "./config";
import { callRpc } from "./http";
import { mergeCatalogSaveResponses, splitCatalogSavePayload } from "./saveChunks";
import { BULK_DELETE_HEADER } from "../../app/sync/deleteGuard";

function getPromotionSyncOptions(data = {}) {
  return data.sync_options?.promociones || data.sync_options?.promotions || null;
}

function getChangedPromotionIds(syncOptions) {
  return new Set((syncOptions?.changed_row_ids || syncOptions?.changedRowIds || []).map(cleanText).filter(Boolean));
}

function getPromotionValidationScopeIds(syncOptions) {
  const validationIds = new Set((syncOptions?.validation_row_ids || syncOptions?.validationRowIds || []).map(cleanText).filter(Boolean));
  return validationIds.size ? validationIds : getChangedPromotionIds(syncOptions);
}

function assertCanSave(connection = {}) {
  const role = normalizeRole(connection.appUser?.rol || connection.role);
  const canWrite = [ROLES.ADMIN, ROLES.BUYER, ROLES.MARK].includes(role);
  if (!canWrite) throw new Error("Su rol no tiene permisos para guardar cambios en Supabase.");
}

function assertValidPromotions(data = {}) {
  const promotionSyncOptions = getPromotionSyncOptions(data);
  const validationScopeIds = getPromotionValidationScopeIds(promotionSyncOptions);
  const validation = validatePromotions(data.promociones || [], {
    actividades: data.actividades || [],
    compradores: data.compradores || [],
    scopeRowIds: promotionSyncOptions ? validationScopeIds : null,
  });
  if (validation.errors.length) {
    throw new Error(`No se guardo en Supabase porque hay promociones incompletas o invalidas:\n${formatPromotionValidationErrors(validation).join("\n")}`);
  }
}

function createClientOperationId() {
  const randomId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `save-service-${randomId}`;
}

function withOperationId(data = {}) {
  if (data.operation_id || data.operationId || data.client_operation_id) return data;
  return {
    ...data,
    operation_id: createClientOperationId(),
    operation_type: "service",
    client_started_at: new Date().toISOString(),
  };
}

function withoutOperationId(data = {}) {
  const {
    operation_id,
    operationId,
    client_operation_id,
    operation_type,
    operationType,
    client_started_at,
    clientStartedAt,
    ...rest
  } = data;
  return rest;
}

function isMissingDigestFunction(error) {
  const message = error?.message || "";
  return message.includes("function digest") && message.includes("does not exist");
}

function parseConflictDetails(error) {
  const rawDetail = error?.supabaseError?.details || error?.supabaseError?.detail || "";
  if (!rawDetail || typeof rawDetail !== "string") return null;
  try {
    return JSON.parse(rawDetail);
  } catch {
    return null;
  }
}

function normalizeConcurrencyConflict(error) {
  const message = error?.message || "";
  const details = parseConflictDetails(error);
  if (!message.includes("PROMOTION_VERSION_CONFLICT") && details?.type !== "PROMOTION_VERSION_CONFLICT") {
    return error;
  }
  const conflictError = new Error("La promocion cambio en Supabase desde que fue abierta. Revise el conflicto antes de guardar nuevamente.");
  conflictError.code = "PROMOTION_VERSION_CONFLICT";
  conflictError.conflict = details;
  conflictError.cause = error;
  return conflictError;
}

function normalizeBulkDeleteBlocked(error) {
  const message = error?.message || "";
  const details = parseConflictDetails(error);
  if (!message.includes("PROMO_BULK_DELETE_BLOCKED") && details?.type !== "PROMO_BULK_DELETE_BLOCKED") return null;
  const actividad = details?.actividad_id ? ` de la actividad ${details.actividad_id}` : "";
  const counts = details?.eliminadas ? ` (${details.eliminadas} de ${details.total} promociones)` : "";
  const blocked = new Error(
    `Supabase bloqueó el borrado masivo de promociones${actividad}${counts}. No se guardó nada. `
    + "Si el borrado es intencional, vuelva a guardar y confírmelo; si no, recargue los datos antes de guardar.",
  );
  blocked.code = "PROMO_BULK_DELETE_BLOCKED";
  blocked.details = details;
  blocked.cause = error;
  return blocked;
}

async function callSaveRpc(connection, payload, { allowBulkDelete = false } = {}) {
  const rpcOptions = allowBulkDelete ? { headers: { [BULK_DELETE_HEADER]: "true" } } : undefined;
  try {
    return await callRpc(connection, "save_catalog_transactional", { p_payload: payload }, rpcOptions);
  } catch (error) {
    const message = error?.message || "";
    const bulkDeleteBlocked = normalizeBulkDeleteBlocked(error);
    if (bulkDeleteBlocked) throw bulkDeleteBlocked;
    if (isMissingDigestFunction(error)) {
      return callRpc(connection, "save_catalog_transactional", { p_payload: withoutOperationId(payload) }, rpcOptions);
    }
    if (message.includes("save_catalog_transactional") || message.includes("PGRST202") || message.includes("Could not find the function")) {
      throw new Error("No se encontro la funcion RPC transaccional save_catalog_transactional en Supabase. Ejecute docs/supabase_transactional_save_rpc.sql antes de guardar.");
    }
    throw normalizeConcurrencyConflict(error);
  }
}

function withChunkOperationId(payload, index, total) {
  if (total === 1) return payload;
  const baseId = payload.operation_id || payload.operationId || payload.client_operation_id;
  if (!baseId) return payload;
  return { ...payload, operation_id: `${baseId}-parte-${index + 1}-de-${total}` };
}

/**
 * Guarda en Supabase. Los guardados grandes (p. ej. una plantilla con miles de SKU) se envian
 * en varias partes para no superar el statement_timeout. Cada parte es transaccional; si una
 * parte falla, las anteriores ya quedaron guardadas y el error trae `partialSave` con lo guardado
 * para que la app marque esas filas como sincronizadas y el reintento envie solo lo pendiente.
 */
export async function saveCatalogToSupabase(connection, data = {}, options = {}) {
  assertCanSave(connection);
  assertValidPromotions(data);
  const payload = withOperationId(data);
  const chunks = splitCatalogSavePayload(payload, options.chunkSize);
  const responses = [];

  for (let index = 0; index < chunks.length; index += 1) {
    options.onProgress?.({ part: index + 1, total: chunks.length });
    try {
      responses.push(await callSaveRpc(connection, withChunkOperationId(chunks[index], index, chunks.length), {
        allowBulkDelete: Boolean(options.allowBulkDelete),
      }));
    } catch (error) {
      if (index > 0) {
        const saved = mergeCatalogSaveResponses(responses);
        const savedDeleted = getPromotionSyncOptions(chunks[0])?.deleted_row_ids || [];
        error.partialSave = {
          promociones: saved.promociones || [],
          deletedRowIds: savedDeleted,
          completedParts: index,
          totalParts: chunks.length,
        };
        error.message = `Se guardaron ${index} de ${chunks.length} partes (${(saved.promociones || []).length} promociones). `
          + `La parte ${index + 1} fallo: ${error.message} Vuelva a guardar para enviar solo lo pendiente.`;
      }
      throw error;
    }
  }

  return mergeCatalogSaveResponses(responses);
}

export function saveSettingsToSupabase(connection, data = {}, options = {}) {
  return saveCatalogToSupabase(connection, data, options);
}
