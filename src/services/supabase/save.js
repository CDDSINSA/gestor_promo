import { normalizeRole, ROLES } from "../../constants/permissions";
import { formatPromotionValidationErrors, validatePromotions } from "../promotionValidationService";
import { cleanText } from "./config";
import { callRpc } from "./http";

function getPromotionSyncOptions(data = {}) {
  return data.sync_options?.promociones || data.sync_options?.promotions || null;
}

function getChangedPromotionIds(syncOptions) {
  return new Set((syncOptions?.changed_row_ids || syncOptions?.changedRowIds || []).map(cleanText).filter(Boolean));
}

function assertCanSave(connection = {}) {
  const role = normalizeRole(connection.appUser?.rol || connection.role);
  const canWrite = [ROLES.ADMIN, ROLES.BUYER, ROLES.MARK].includes(role);
  if (!canWrite) throw new Error("Su rol no tiene permisos para guardar cambios en Supabase.");
}

function assertValidPromotions(data = {}) {
  const promotionSyncOptions = getPromotionSyncOptions(data);
  const changedPromotionIds = getChangedPromotionIds(promotionSyncOptions);
  const validation = validatePromotions(data.promociones || [], {
    actividades: data.actividades || [],
    compradores: data.compradores || [],
    scopeRowIds: promotionSyncOptions ? changedPromotionIds : null,
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

export async function saveCatalogToSupabase(connection, data = {}) {
  assertCanSave(connection);
  assertValidPromotions(data);
  const payload = withOperationId(data);

  try {
    return await callRpc(connection, "save_catalog_transactional", { p_payload: payload });
  } catch (error) {
    const message = error?.message || "";
    if (isMissingDigestFunction(error)) {
      return callRpc(connection, "save_catalog_transactional", { p_payload: withoutOperationId(payload) });
    }
    if (message.includes("save_catalog_transactional") || message.includes("PGRST202") || message.includes("Could not find the function")) {
      throw new Error("No se encontro la funcion RPC transaccional save_catalog_transactional en Supabase. Ejecute docs/supabase_transactional_save_rpc.sql antes de guardar.");
    }
    throw error;
  }
}

export function saveSettingsToSupabase(connection, data = {}) {
  return saveCatalogToSupabase(connection, data);
}
