import {
  hasSupabaseConnection,
  createLiveNotification,
  saveCatalogToSupabase,
  saveSettingsToSupabase,
  saveStoredSupabaseConnection,
} from "../services/supabaseService";
import {
  makeId,
} from "../utils/common";
import {
  mergeCatalogActivities,
  normalizeCompradorData,
  normalizeCatalogo,
  stripCatalogosConfig,
  toAppRow,
} from "../utils/promoHelpers";
import {
  AVANCE_SYNC_FIELDS,
  COMMENT_SYNC_FIELDS,
  JERARQUIA_SYNC_FIELDS,
  RESPONSABLE_SYNC_FIELDS,
  SEGMENTO_SYNC_FIELDS,
  applyPromotionVersions,
  buildActivitySyncOptions,
  buildBuyerSyncOptions,
  buildKeyedSyncOptions,
  buildNotificacionSyncOptions,
  buildPromotionSyncOptions,
  getAvanceSyncId,
  getCommentSyncId,
  getJerarquiaSyncId,
  getPromotionSyncId,
  getPromotionSyncSnapshot,
  getResponsableSyncId,
  getSegmentoSyncId,
} from "../app/sync/syncOptions";
import {
  getFullSyncPayload, compactSupabasePayload, hasSupabaseDeltaChanges, buildSaveOperationSummary,
} from "../app/sync/savePayload";

export function useCatalogSync({
  dataState, config, catalogos, compradores, supabaseSettings, supabaseConnection,
  isSyncing, pendingSaveAction, promotionConflict,
  setConfig, setCatalogos, setCompradores, setActividades, setRows,
  setSupabaseSettings, setSupabaseStatus, setSaveSupabaseStatus, setPendingSaveAction, setPromotionConflict,
  saveOperationInFlightRef, pendingSaveConfirmRef,
  syncedPromotionStateRef, syncedBuyerStateRef, syncedActivityStateRef, syncedCommentStateRef,
  syncedAvanceStateRef, syncedResponsableStateRef, syncedJerarquiaStateRef, syncedSegmentoStateRef, syncedNotificacionStateRef,
  buildCatalogPayload, runSupabaseOperation, applyCatalogData,
  rememberSyncedPromotions, rememberSyncedSettings, rememberSyncedOperations,
  showSuccessToast, onLoadSupabase,
}) {
  const requestSupabaseSaveConfirmation = (payload) => {
    if (dataState.status !== "ready") {
      setSupabaseStatus({ type: "error", message: "Espere a que los datos operativos carguen correctamente antes de guardar." });
      return;
    }
    if (isSyncing || saveOperationInFlightRef.current || pendingSaveConfirmRef.current) return;
    pendingSaveConfirmRef.current = true;
    setPendingSaveAction(payload);
  };

  const executePendingSaveAction = async () => {
    const current = pendingSaveAction;
    if (!current || saveOperationInFlightRef.current) return;
    pendingSaveConfirmRef.current = false;
    setPendingSaveAction(null);
    try {
      await current.action();
    } catch (error) {
      setSupabaseStatus({ type: "error", message: error.message || "No se pudo completar el guardado." });
    }
  };

  const applySavedActivities = (payload = {}) => {
    if (!Array.isArray(payload.actividades)) return;
    const savedCatalogos = Array.isArray(payload.catalogos)
      ? payload.catalogos.map(normalizeCatalogo)
      : catalogos;
    setActividades(mergeCatalogActivities(savedCatalogos, payload.actividades));
  };

  const rememberSyncedPayload = (payload = {}) => {
    rememberSyncedPromotions(payload.promociones || []);
    rememberSyncedSettings(payload);
    rememberSyncedOperations(payload);
  };

  const buildSupabasePayload = (overrides = {}, operation = {}) => {
    const fullPayload = buildCatalogPayload(overrides);
    const operationId = operation.operationId || "";
    const payload = {
      ...fullPayload,
      logs: [],
      operation_id: operationId,
      operation_type: operation.operationType || "",
      client_started_at: operation.startedAt || "",
      sync_options: {
        return_mode: "delta",
        promociones: buildPromotionSyncOptions(fullPayload.promociones, syncedPromotionStateRef.current),
        compradores: buildBuyerSyncOptions(fullPayload.compradores, syncedBuyerStateRef.current),
        actividades: buildActivitySyncOptions(fullPayload.actividades, fullPayload.catalogos, syncedActivityStateRef.current),
        comentarios: buildKeyedSyncOptions(fullPayload.comentarios, syncedCommentStateRef.current, getCommentSyncId, COMMENT_SYNC_FIELDS),
        avances_catalogo: buildKeyedSyncOptions(fullPayload.avances_catalogo, syncedAvanceStateRef.current, getAvanceSyncId, AVANCE_SYNC_FIELDS),
        responsables_solicitudes: buildKeyedSyncOptions(fullPayload.responsables_solicitudes, syncedResponsableStateRef.current, getResponsableSyncId, RESPONSABLE_SYNC_FIELDS),
        jerarquia_categorias: buildKeyedSyncOptions(fullPayload.jerarquia_categorias, syncedJerarquiaStateRef.current, getJerarquiaSyncId, JERARQUIA_SYNC_FIELDS),
        segmentos_clientes: buildKeyedSyncOptions(fullPayload.segmentos_clientes, syncedSegmentoStateRef.current, getSegmentoSyncId, SEGMENTO_SYNC_FIELDS),
        notificaciones: buildNotificacionSyncOptions(fullPayload.notificaciones, syncedNotificacionStateRef.current),
      },
    };

    const compactPayload = compactSupabasePayload(payload);
    Object.defineProperty(compactPayload, "__full_sync_payload", {
      value: payload,
      enumerable: false,
    });
    return compactPayload;
  };

  const createSaveOperation = (operationType) => {
    const operationId = window.crypto?.randomUUID?.() || makeId("SAVE");
    return {
      operationId: `save-${operationType}-${operationId}`,
      operationType,
      startedAt: new Date().toISOString(),
    };
  };

  const firstChangedPromotion = (payload = {}) => {
    const changedIds = new Set(payload.sync_options?.promociones?.changed_row_ids || []);
    return (payload.promociones || []).find((row) => changedIds.has(row.row_id)) || (payload.promociones || [])[0] || {};
  };

  const firstChangedComment = (payload = {}) => {
    const changedIds = new Set(payload.sync_options?.comentarios?.changed_ids || []);
    return (payload.comentarios || []).find((comment) => changedIds.has(comment.comentario_id)) || (payload.comentarios || [])[0] || {};
  };

  const findPromotionForComment = (payload = {}, comment = {}) => {
    const rowId = comment.row_id || "";
    if (rowId) return (payload.promociones || []).find((row) => row.row_id === rowId) || {};
    return {};
  };

  const notifyAfterSave = async (payload = {}, operationType = "catalog") => {
    if (!hasSupabaseConnection(supabaseConnection)) return;
    const promotionChanges = payload.sync_options?.promociones?.changed_row_ids?.length || 0;
    const commentChanges = payload.sync_options?.comentarios?.changed_ids?.length || 0;
    const activityChanges = payload.sync_options?.actividades?.changed_ids?.length || 0;
    const events = [];

    if (operationType === "catalog" && promotionChanges) {
      const row = firstChangedPromotion(payload);
      events.push({
        tipoEvento: "PROMOCION_ACTUALIZADA",
        titulo: "Promociones actualizadas",
        mensaje: `${promotionChanges} cambio(s) de promociones requieren revision.`,
        actividadId: row.actividad_id,
        rowId: row.row_id,
        destinatarioRoles: ["MARK"],
        urlModulo: "consolidado",
        metadata: { promotionChanges },
      });
    }

    if (operationType === "catalog" && commentChanges) {
      const comment = firstChangedComment(payload);
      const commentPromotion = findPromotionForComment(payload, comment);
      const targetBuyerIds = [commentPromotion.buyer_id].filter(Boolean);
      events.push({
        tipoEvento: "COMENTARIO_MERCADEO",
        titulo: "Comentarios de Mercadeo actualizados",
        mensaje: `${commentChanges} comentario(s) fueron creados o actualizados.`,
        actividadId: comment.actividad_id,
        rowId: comment.row_id,
        comentarioId: comment.comentario_id,
        destinatarioBuyerIds: targetBuyerIds,
        destinatarioRoles: targetBuyerIds.length ? [] : ["BUYER"],
        urlModulo: "home",
        metadata: { commentChanges },
      });
    }

    if (operationType === "settings" && activityChanges) {
      const activity = (payload.actividades || [])[0] || {};
      events.push({
        tipoEvento: "CATALOGO_ACTUALIZADO",
        titulo: "Catalogos actualizados",
        mensaje: "La configuracion de catalogos fue actualizada.",
        actividadId: activity.actividad_id,
        destinatarioRoles: ["MARK", "BUYER"],
        urlModulo: "home",
        metadata: { activityChanges },
      });
    }

    for (const event of events) {
      try {
        await createLiveNotification(supabaseConnection, event);
      } catch (error) {
        setSupabaseStatus((current) => current?.type === "error"
          ? current
          : { type: "ready", message: "Cambios guardados. No se pudo crear una notificacion en vivo." });
      }
    }
  };

  const onSaveSupabaseSettings = () => {
    const saved = saveStoredSupabaseConnection(supabaseSettings);
    setSupabaseSettings(saved);
    setSupabaseStatus({
      type: hasSupabaseConnection(saved) ? "ready" : "idle",
      message: hasSupabaseConnection(saved) ? "Conexion guardada. Ya puede probar o cargar desde Supabase." : "Complete URL y anon key para activar Supabase.",
    });
    showSuccessToast("La configuracion de conexion se guardo correctamente.", "Conexion guardada");
  };

  const onSaveCatalogSettings = async (settings = {}) => {
    if (dataState.status !== "ready") {
      setSupabaseStatus({ type: "error", message: "Espere a que los datos operativos carguen correctamente antes de guardar ajustes." });
      return;
    }
    const nextConfig = stripCatalogosConfig(config);
    const nextCatalogos = (settings.catalogos || catalogos).map(normalizeCatalogo);
    const nextCompradores = (settings.compradores || compradores).map(normalizeCompradorData);
    setConfig(nextConfig);
    setCatalogos(nextCatalogos);
    setCompradores(nextCompradores);
    if (!hasSupabaseConnection(supabaseConnection)) {
      setSupabaseStatus({ type: "ready", message: "Ajustes guardados en la app. Configure Supabase para sincronizarlos." });
      showSuccessToast("Los ajustes quedaron guardados en la aplicacion.", "Ajustes guardados");
      return;
    }
    if (saveOperationInFlightRef.current) {
      setSupabaseStatus({ type: "loading", message: "Ya hay un guardado en curso. Espere a que finalice antes de intentar nuevamente." });
      return;
    }
    saveOperationInFlightRef.current = true;
    setSaveSupabaseStatus("saving");
    try {
      const operation = createSaveOperation("settings");
      const payload = buildSupabasePayload({ config: nextConfig, catalogos: nextCatalogos, compradores: nextCompradores }, operation);
      const saveSummary = buildSaveOperationSummary(payload);
      if (!hasSupabaseDeltaChanges(payload)) {
        setSaveSupabaseStatus("success");
        setSupabaseStatus({ type: "ready", message: "No hay ajustes pendientes para sincronizar." });
        showSuccessToast("No se detectaron cambios nuevos para enviar a Supabase.", "Sin cambios");
        return;
      }
      const data = await runSupabaseOperation(`Guardando ajustes en Supabase (${saveSummary})...`, () => saveSettingsToSupabase(supabaseConnection, payload), "Ajustes guardados en Supabase.");
      if (data) {
        const fullPayload = getFullSyncPayload(payload);
        setSupabaseStatus({ type: "loading", message: "Aplicando respuesta de Supabase en la app..." });
        if (data.sync_mode === "delta") {
          applySavedActivities(fullPayload);
          const syncedPayload = { ...fullPayload, promociones: applyPromotionVersions(fullPayload.promociones, data.promociones || []) };
          setRows((currentRows) => applyPromotionVersions(currentRows, data.promociones || []));
          rememberSyncedPayload(syncedPayload);
        } else {
          applyCatalogData(data, { fallbackActivities: fullPayload.actividades });
          rememberSyncedPromotions(data.promociones || []);
          rememberSyncedSettings(data);
          rememberSyncedOperations(data);
        }
        setSaveSupabaseStatus("success");
        setSupabaseStatus({ type: "ready", message: data.idempotent_replay ? "Estos cambios ya estaban guardados en el sistema." : "Cambios guardados en el sistema." });
        showSuccessToast("La información se sincronizó correctamente en el sistema.");
        if (!data.idempotent_replay) void notifyAfterSave(fullPayload, "settings");
      } else {
        setSaveSupabaseStatus("error");
        setSupabaseStatus((current) => ({ type: "error", message: "No se pudieron guardar los cambios en el sistema. " + (current?.message || "Revise la conexión y vuelva a intentar.") }));
      }
    } finally {
      saveOperationInFlightRef.current = false;
    }
  };

  const onRequestSaveSupabase = () => requestSupabaseSaveConfirmation({
    title: "Confirmar guardado",
    description: "Vas a guardar los cambios del catálogo en el sistema.",
    note: "Este guardado sincroniza promociones, comentarios, avances y ajustes relacionados.",
    confirmLabel: "Guardar cambios",
    action: onSaveSupabase,
  });

  const onRequestSaveSupabaseSettings = () => requestSupabaseSaveConfirmation({
    title: "Confirmar ajustes",
    description: "Vas a guardar los ajustes de conexión en el sistema.",
    note: "La conexión se actualizará con los valores actuales de la pantalla de Ajustes.",
    confirmLabel: "Guardar ajustes",
    action: onSaveSupabaseSettings,
  });

  const onRequestSaveCatalogSettings = (settings = {}) => requestSupabaseSaveConfirmation({
    title: "Confirmar guardado",
    description: "Vas a guardar compradores y catálogos en el sistema.",
    note: "Este cambio impacta la estructura base del sistema y luego sincroniza el catálogo.",
    confirmLabel: "Guardar cambios",
    action: () => onSaveCatalogSettings(settings),
  });

  const reloadAfterPromotionConflict = async () => {
    const data = await onLoadSupabase({ blocking: false });
    if (data) {
      setPromotionConflict(null);
      setSupabaseStatus({ type: "ready", message: "Datos recargados desde Supabase." });
    }
  };

  const keepLocalPromotionConflict = () => {
    setPromotionConflict(null);
    setSupabaseStatus({
      type: "error",
      message: "Se conservaron los cambios locales. Compare con la version actual antes de intentar guardar nuevamente.",
    });
  };

  const discardLocalPromotionConflict = () => {
    const currentRow = promotionConflict?.current_row;
    const rowId = promotionConflict?.row_id;
    if (!currentRow || !rowId) {
      void reloadAfterPromotionConflict();
      return;
    }
    const appRow = toAppRow(currentRow);
    setRows((currentRows) => currentRows.map((row) => getPromotionSyncId(row) === rowId ? appRow : row));
    syncedPromotionStateRef.current.set(rowId, getPromotionSyncSnapshot(currentRow));
    setPromotionConflict(null);
    setSupabaseStatus({ type: "ready", message: "Cambio local descartado para la promocion en conflicto." });
  };

  const onSaveSupabase = async (overrides = {}) => {
    if (dataState.status !== "ready") {
      setSupabaseStatus({ type: "error", message: "Espere a que los datos operativos carguen correctamente antes de guardar." });
      return;
    }
    if (saveOperationInFlightRef.current) {
      setSupabaseStatus({ type: "loading", message: "Ya hay un guardado en curso. Espere a que finalice antes de intentar nuevamente." });
      return;
    }
    saveOperationInFlightRef.current = true;
    setSaveSupabaseStatus("saving");
    try {
      const operation = createSaveOperation("catalog");
      const payload = buildSupabasePayload(overrides, operation);
      const saveSummary = buildSaveOperationSummary(payload);
      if (!hasSupabaseDeltaChanges(payload)) {
        setSaveSupabaseStatus("success");
        setSupabaseStatus({ type: "ready", message: "No hay cambios pendientes para sincronizar." });
        showSuccessToast("No se detectaron cambios nuevos para enviar a Supabase.", "Sin cambios");
        return;
      }
      const data = await runSupabaseOperation(`Guardando cambios en Supabase (${saveSummary})...`, () => saveCatalogToSupabase(supabaseConnection, payload), "Cambios guardados en Supabase.");
      if (data) {
        const fullPayload = getFullSyncPayload(payload);
        setSupabaseStatus({ type: "loading", message: "Aplicando respuesta de Supabase en la app..." });
        if (data.sync_mode === "delta") {
          applySavedActivities(fullPayload);
          const syncedPayload = { ...fullPayload, promociones: applyPromotionVersions(fullPayload.promociones, data.promociones || []) };
          setRows((currentRows) => applyPromotionVersions(currentRows, data.promociones || []));
          rememberSyncedPayload(syncedPayload);
        } else {
          applyCatalogData(data, { fallbackActivities: fullPayload.actividades });
          rememberSyncedPromotions(data.promociones || []);
          rememberSyncedSettings(data);
          rememberSyncedOperations(data);
        }
        setSaveSupabaseStatus("success");
        setSupabaseStatus({ type: "ready", message: data.idempotent_replay ? "Estos cambios ya estaban guardados en el sistema." : "Cambios guardados en el sistema." });
        showSuccessToast("La información se sincronizó correctamente en el sistema.");
        if (!data.idempotent_replay) void notifyAfterSave(fullPayload, "catalog");
      } else {
        setSaveSupabaseStatus("error");
        setSupabaseStatus((current) => ({ type: "error", message: `No se pudieron guardar los cambios en el sistema. ${current?.message || "Revise la conexión y vuelva a intentar."}` }));
      }
    } finally {
      saveOperationInFlightRef.current = false;
    }
  };

  return {
    executePendingSaveAction,
    onSaveSupabase, onRequestSaveSupabase, onRequestSaveSupabaseSettings, onRequestSaveCatalogSettings,
    reloadAfterPromotionConflict, keepLocalPromotionConflict, discardLocalPromotionConflict,
  };
}
