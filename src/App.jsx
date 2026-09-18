import React, { useEffect, useMemo, useState } from "react";
import DatabaseStatus from "./app/shell/DatabaseStatus";
import { SkuLookupContext } from "./features/skuMaster/SkuLookupContext";
import { useExcelBackup } from "./hooks/useExcelBackup";
import { useCatalogLoader } from "./hooks/useCatalogLoader";
import { useCatalogSync } from "./hooks/useCatalogSync";
import {
  hasSupabaseConnection,
  loadActivityIdsByPrefixFromSupabase,
  pingSupabaseConnection,
  saveStoredSupabaseConnection,
} from "./services/supabaseService";
import {
  SIDEBAR_NAV_ITEMS,
} from "./constants";

import {
  buildNotificacionesFromCatalogos,
  getAvanceCatalogoKey,
  mergeCatalogActivities,
  normalizeCompradorData,
  normalizeResponsableSolicitud,
  normalizeCatalogo,
  readCatalogosFromData,
  readJerarquiaCategoriasFromData,
  readResponsablesSolicitudesFromData,
  readSegmentosClientesFromData,
  stripCatalogosConfig,
  toAppComment,
  toAppLog,
  toAppRow,
  toExcelComment,
  toExcelComprador,
  toSheetJerarquiaCategoria,
  toSheetResponsableSolicitud,
  toExcelDetalle,
  toExcelLog,
  toExcelRow,
  toExcelAvanceCatalogo,
  toExcelActividad,
  toAppAvanceCatalogo,
  toSheetCatalogo,
  toSheetSegmentoCliente,
  normalizeActividad,
} from "./utils/promoHelpers";
import { AuthProvider } from "./context/AuthContext";
import { ConfirmModal, PromotionConflictModal, SuccessToast } from "./components/AppFeedback";
import {
  AuthLoadingPage,
  DataLoadErrorScreen,
  DataLoadingScreen,
  ForgotPasswordPage,
  LoginPage,
  ResetPasswordPage,
} from "./components/AuthScreens";
import { Button } from "./components/ui";
import AppContent from "./app/shell/AppContent";
import { AppShell, MobileNav } from "./app/shell/AppNavigation";
import LiveNotifications, { LiveNotificationsToast } from "./components/LiveNotifications";
import { clearAuthTokensFromUrl } from "./app/session/sessionHelpers";
import { canAccessModule, getFirstAllowedModule, normalizeRole } from "./constants/permissions";
import { useAuthSession } from "./hooks/useAuthSession";
import { useCatalogData } from "./hooks/useCatalogData";
import { useNotifications } from "./hooks/useNotifications";
import { usePromotionsData } from "./hooks/usePromotionsData";
import { useLogsData } from "./hooks/useLogsData";
import { useLiveNotifications } from "./hooks/useLiveNotifications";
import { useNotificationSound } from "./hooks/useNotificationSound";
import { useSkuMaster } from "./hooks/useSkuMaster";
import { useSyncStatus } from "./hooks/useSyncStatus";
import {
  AVANCE_SYNC_FIELDS,
  BUYER_SYNC_FIELDS,
  COMMENT_SYNC_FIELDS,
  JERARQUIA_SYNC_FIELDS,
  LOG_SYNC_FIELDS,
  RESPONSABLE_SYNC_FIELDS,
  SEGMENTO_SYNC_FIELDS,
  buildActivitySyncState,
  buildKeyedSyncState,
  buildNotificacionSyncState,
  buildPromotionSyncState,
  getAvanceSyncId,
  getBuyerSyncId,
  getCommentSyncId,
  getJerarquiaSyncId,
  getLogSyncId,
  getPromotionSyncId,
  getPromotionSyncSignature,
  getPromotionSyncSnapshot,
  getPromotionSyncVersion,
  getResponsableSyncId,
  getSegmentoSyncId,
  getSyncSignature,
  getSyncedPromotionSignature,
} from "./app/sync/syncOptions";
import {
  normalizePromotionConflict,
} from "./app/sync/savePayload";

const SKU_MASTER_FLOW_MODULES = new Set(["promos", "especial", "solicitudes", "fidelizacion"]);
const USE_DEMO_SEED_DATA = Boolean(import.meta.env.DEV && import.meta.env.VITE_USE_DEMO_DATA === "true");


export default function PromoMVP() {
  const [active, setActive] = useState("home");
  const [dataState, setDataState] = useState({ status: "idle", error: null });
  const { catalogos, setCatalogos, catalogoActivo, setCatalogoActivo, catalogoAvanceActivo, setCatalogoAvanceActivo, actividades, setActividades, compradores, setCompradores, responsablesSolicitudes, setResponsablesSolicitudes, jerarquiaCategorias, setJerarquiaCategorias, segmentosClientes, setSegmentosClientes, catalogoResumen, setCatalogoResumen, config, setConfig, notificaciones, setNotificaciones, resetCatalogData } = useCatalogData({ useDemoData: USE_DEMO_SEED_DATA });
  const { rows, setRows, avanceCatalogos, setAvanceCatalogos, promocionesDetalle, setPromocionesDetalle, comentarios, setComentarios, logs, setLogs, resetPromotionsData } = usePromotionsData({ useDemoData: USE_DEMO_SEED_DATA });
  const { supabaseSettings, setSupabaseSettings, supabaseStatus, setSupabaseStatus, saveSupabaseStatus, setSaveSupabaseStatus, isSyncing, setIsSyncing, specialRequestsRefreshStatus, setSpecialRequestsRefreshStatus, promotionScopeRefreshStatus, setPromotionScopeRefreshStatus } = useSyncStatus();
  const {
    appSession, appUser, authStatus, loginStatus, recoveryStatus, setRecoveryStatus,
    authScreen, setAuthScreen, recoverySession, setRecoverySession, recoveryUser, setRecoveryUser,
    handleSessionRefresh, onLogin, onRequestPasswordRecovery, onResetPassword, onLogout: closeSession,
  } = useAuthSession({ supabaseSettings, setSupabaseSettings });
  const { pendingSaveAction, setPendingSaveAction, successToast, setSuccessToast } = useNotifications();
  const [liveNotificationToast, setLiveNotificationToast] = useState(null);
  const { soundEnabled, toggleSound } = useNotificationSound(liveNotificationToast);
  const [promotionConflict, setPromotionConflict] = useState(null);
  const initialLoadSessionRef = React.useRef("");
  const specialRequestsRefreshRef = React.useRef(false);
  const promotionScopeRefreshRef = React.useRef("");
  const syncedPromotionStateRef = React.useRef(new Map());
  const syncedBuyerStateRef = React.useRef(new Map());
  const syncedActivityStateRef = React.useRef(new Map());
  const syncedCommentStateRef = React.useRef(new Map());
  const syncedLogStateRef = React.useRef(new Map());
  const syncedAvanceStateRef = React.useRef(new Map());
  const syncedResponsableStateRef = React.useRef(new Map());
  const syncedJerarquiaStateRef = React.useRef(new Map());
  const syncedSegmentoStateRef = React.useRef(new Map());
  const syncedNotificacionStateRef = React.useRef(new Map());
  const saveOperationInFlightRef = React.useRef(false);
  const pendingSaveConfirmRef = React.useRef(false);
  const dataOwnerRef = React.useRef("");
  const rowsRef = React.useRef(rows);
  const comentariosRef = React.useRef(comentarios);
  const promocionesDetalleRef = React.useRef(promocionesDetalle);

  function resetSyncedState() {
    syncedPromotionStateRef.current = new Map();
    syncedBuyerStateRef.current = new Map();
    syncedActivityStateRef.current = new Map();
    syncedCommentStateRef.current = new Map();
    syncedLogStateRef.current = new Map();
    syncedAvanceStateRef.current = new Map();
    syncedResponsableStateRef.current = new Map();
    syncedJerarquiaStateRef.current = new Map();
    syncedSegmentoStateRef.current = new Map();
    syncedNotificacionStateRef.current = new Map();
  }

  const supabaseConnection = useMemo(() => ({
    ...supabaseSettings,
    session: appSession,
    appUser,
    onSessionRefresh: handleSessionRefresh,
  }), [supabaseSettings, appSession, appUser, handleSessionRefresh]);

  const {
    consultedLogs, logsPage, logsPageSize, logsHasNextPage, logsStatus,
    onConsultLogs, onLogsPageSizeChange, resetLogsData,
  } = useLogsData(supabaseConnection);

  const {
    skuMaster, skuMasterCount, skuMasterStatus, resetSkuMaster,
    loadSkuMasterFromRemote, cancelSkuMasterLoad, ensureSkuMasterLoaded,
  } = useSkuMaster(supabaseConnection);

  const liveNotifications = useLiveNotifications({
    connection: supabaseConnection,
    currentUserId: appUser?.id || "",
    enabled: Boolean(appSession?.access_token && appUser?.activo && hasSupabaseConnection(supabaseConnection)),
    onIncoming: (notification) => setLiveNotificationToast(notification),
  });

  const resetDomainState = React.useCallback(() => {
    resetCatalogData();
    resetPromotionsData();
    resetLogsData();
    resetSkuMaster();
    resetSyncedState();
    setActive("home");
    setDataState({ status: "idle", error: null });
    setSaveSupabaseStatus("idle");
    setSpecialRequestsRefreshStatus({ type: "idle", message: "" });
    setPromotionScopeRefreshStatus({ type: "idle", message: "" });
    setPendingSaveAction(null);
    setSuccessToast(null);
    setLiveNotificationToast(null);
    setPromotionConflict(null);
    initialLoadSessionRef.current = "";
    specialRequestsRefreshRef.current = false;
    promotionScopeRefreshRef.current = "";
    saveOperationInFlightRef.current = false;
    pendingSaveConfirmRef.current = false;
  }, [
    resetCatalogData,
    resetPromotionsData,
    resetLogsData,
    resetSkuMaster,
    setSaveSupabaseStatus,
    setSpecialRequestsRefreshStatus,
    setPromotionScopeRefreshStatus,
    setPendingSaveAction,
    setSuccessToast,
  ]);
  const resolveSpecialActivityIds = React.useCallback(async (prefix) => {
    if (!hasSupabaseConnection(supabaseConnection)) return [];
    return loadActivityIdsByPrefixFromSupabase(supabaseConnection, prefix);
  }, [supabaseConnection]);

  const showSuccessToast = (message, title = "Cambios guardados") => {
    setSuccessToast({ id: Date.now(), title, message });
  };

  useEffect(() => {
    if (!successToast) return undefined;
    const timeoutId = window.setTimeout(() => setSuccessToast(null), 3600);
    return () => window.clearTimeout(timeoutId);
  }, [successToast]);

  useEffect(() => {
    if (!liveNotificationToast) return undefined;
    const timeoutId = window.setTimeout(() => setLiveNotificationToast(null), 4800);
    return () => window.clearTimeout(timeoutId);
  }, [liveNotificationToast]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    comentariosRef.current = comentarios;
  }, [comentarios]);

  useEffect(() => {
    promocionesDetalleRef.current = promocionesDetalle;
  }, [promocionesDetalle]);

  useEffect(() => {
    if (!appSession?.access_token) {
      dataOwnerRef.current = "";
      resetDomainState();
    }
  }, [appSession, supabaseSettings, handleSessionRefresh, resetDomainState]);

  useEffect(() => {
    if (!appSession?.access_token || !appUser?.activo) return;
    void bootstrapData();
  }, [appSession, appUser, supabaseConnection]);

  useEffect(() => {
    if (!appSession?.access_token || !appUser?.activo) return;
    if (!SKU_MASTER_FLOW_MODULES.has(active)) return;
    void ensureSkuMasterLoaded(rows.map((row) => row.sku)).catch(() => {});
  }, [active, appSession, appUser, rows, ensureSkuMasterLoaded]);

  const applyCatalogData = (data, { fallbackActivities = [] } = {}) => {
    const nextConfig = data.config || [];
    const nextCatalogos = readCatalogosFromData(data, catalogos);
    const incomingActivities = Array.isArray(data.actividades) ? data.actividades : [];
    const activityMap = new Map(fallbackActivities.map((item) => {
      const activity = normalizeActividad(item);
      return [activity.actividad_id, activity];
    }));
    incomingActivities.forEach((item) => {
      const activity = normalizeActividad(item);
      activityMap.set(activity.actividad_id, activity);
    });
    setConfig(nextConfig);
    setCatalogos(nextCatalogos);
    setActividades(mergeCatalogActivities(nextCatalogos, Array.from(activityMap.values())));
    setCatalogoActivo((current) => nextCatalogos.find((cat) => cat.id === current?.id) || nextCatalogos[0] || current);
    setCatalogoAvanceActivo((current) => nextCatalogos.find((cat) => cat.id === current?.id) || nextCatalogos[0] || current);
    setSegmentosClientes(readSegmentosClientesFromData(data));
    setCompradores((data.compradores || []).map(normalizeCompradorData));
    setResponsablesSolicitudes(readResponsablesSolicitudesFromData(data));
    setJerarquiaCategorias(readJerarquiaCategoriasFromData(data));
    setCatalogoResumen(data.catalogo_resumen || data.catalogoResumen || []);
    if (Array.isArray(data.promociones)) setRows(data.promociones.map(toAppRow));
    if (Array.isArray(data.promociones_detalle)) setPromocionesDetalle(data.promociones_detalle);
    if (Array.isArray(data.comentarios)) setComentarios(data.comentarios.map(toAppComment));
    if (Array.isArray(data.logs)) setLogs(data.logs.map(toAppLog));
    setNotificaciones(data.notificaciones || []);
    const nextAvances = {};
    (data.avances_catalogo || data.avancesCatalogo || []).map(toAppAvanceCatalogo).filter((avance) => avance.terminado).forEach((avance) => {
      nextAvances[getAvanceCatalogoKey(avance.catalogo_id, avance.division, avance.comprador)] = avance;
    });
    setAvanceCatalogos(nextAvances);
  };

  const applySpecialRequestsData = (data = {}) => {
    const nextActivities = (data.actividades || [])
      .map(normalizeActividad)
      .filter((activity) => activity.tipo_actividad === "ESPECIAL" && activity.actividad_id);
    const nextActivityIds = new Set(nextActivities.map((activity) => activity.actividad_id));
    if (!nextActivityIds.size) return { count: 0 };

    setActividades((prev) => {
      const previousById = new Map((prev || []).map((item) => {
        const activity = normalizeActividad(item);
        return [activity.actividad_id, activity];
      }));
      nextActivities.forEach((activity) => previousById.set(activity.actividad_id, activity));
      return Array.from(previousById.values());
    });

    const nextRows = (data.promociones || []).map(toAppRow);
    setRows((prev) => [
      ...(prev || []).filter((row) => !nextActivityIds.has(row.actividadId || row.actividad_id || row.catalogo_id || row.catalogoId || "")),
      ...nextRows,
    ]);

    const nextDetails = data.promociones_detalle || [];
    setPromocionesDetalle((prev) => [
      ...(prev || []).filter((item) => !nextActivityIds.has(item.actividad_id || item.actividadId || "")),
      ...nextDetails,
    ]);

    const nextComments = (data.comentarios || []).map(toAppComment);
    setComentarios((prev) => [
      ...(prev || []).filter((comment) => !nextActivityIds.has(comment.actividadId || comment.actividad_id || "")),
      ...nextComments,
    ]);

    if (Array.isArray(data.responsables_solicitudes)) {
      setResponsablesSolicitudes(data.responsables_solicitudes.map(normalizeResponsableSolicitud));
    }

    return { count: nextActivities.length };
  };

  const rowMatchesPromotionScope = (row, { actividadId, comprador, tipoPromo } = {}) => {
    const rowActivityId = row.actividadId || row.actividad_id || row.catalogo_id || row.catalogoId || "";
    const rowBuyer = row.comprador || "";
    const rowType = row.tipoPromo || row.tipo_promo || "";
    return rowActivityId === actividadId && rowBuyer === comprador && rowType === tipoPromo;
  };

  const hasUnsavedPromotionScopeRows = (scope, scopeRows = []) => scopeRows.some((row) => {
    const normalized = toExcelRow(row);
    const rowId = getPromotionSyncId(normalized);
    if (!rowId) return true;
    return getSyncedPromotionSignature(syncedPromotionStateRef.current.get(rowId)) !== getPromotionSyncSignature(normalized);
  });

  const applyPromotionScopeData = (scope = {}, data = {}) => {
    const currentRows = rowsRef.current || [];
    const localScopeRows = currentRows.filter((row) => rowMatchesPromotionScope(row, scope));
    if (hasUnsavedPromotionScopeRows(scope, localScopeRows)) {
      return { skipped: true, count: localScopeRows.length };
    }

    const nextRows = (data.promociones || []).map(toAppRow);
    const localScopeRowIds = new Set(localScopeRows.map((row) => row.row_id || row.id).filter(Boolean));
    const nextRowIds = new Set(nextRows.map((row) => row.row_id || row.id).filter(Boolean));
    const allScopeRowIds = new Set([...localScopeRowIds, ...nextRowIds]);

    setRows([
      ...currentRows.filter((row) => !rowMatchesPromotionScope(row, scope)),
      ...nextRows,
    ]);

    setPromocionesDetalle([
      ...(promocionesDetalleRef.current || []).filter((item) => {
        const rowId = item.row_id || item.rowId || "";
        const matchesRow = rowId && allScopeRowIds.has(rowId);
        const matchesScope = (item.actividad_id || item.actividadId || "") === scope.actividadId
          && (item.tipo_promo || item.tipoPromo || "") === scope.tipoPromo;
        return !matchesRow && !matchesScope;
      }),
      ...(data.promociones_detalle || []),
    ]);

    const nextComments = (data.comentarios || []).map(toAppComment);
    setComentarios([
      ...(comentariosRef.current || []).filter((comment) => {
        const rowId = comment.rowId || comment.row_id || "";
        return !rowId || !allScopeRowIds.has(rowId);
      }),
      ...nextComments,
    ]);

    localScopeRowIds.forEach((rowId) => syncedPromotionStateRef.current.delete(rowId));
    nextRows.forEach((row) => {
      const normalized = toExcelRow(row);
      const rowId = getPromotionSyncId(normalized);
      if (rowId) syncedPromotionStateRef.current.set(rowId, getPromotionSyncSnapshot(row));
    });

    const nextCommentSync = new Map(syncedCommentStateRef.current);
    (comentariosRef.current || []).forEach((comment) => {
      const rowId = comment.rowId || comment.row_id || "";
      if (!rowId || !allScopeRowIds.has(rowId)) return;
      const commentId = getCommentSyncId(comment);
      if (commentId) nextCommentSync.delete(commentId);
    });
    nextComments.forEach((comment) => {
      const commentId = getCommentSyncId(comment);
      if (commentId) nextCommentSync.set(commentId, getSyncSignature(toExcelComment(comment), COMMENT_SYNC_FIELDS));
    });
    syncedCommentStateRef.current = nextCommentSync;

    return { skipped: false, count: nextRows.length };
  };

  const buildCatalogPayload = (overrides = {}) => {
    const nextCatalogos = overrides.catalogos || catalogos;
    const nextConfig = stripCatalogosConfig(overrides.config || config);
    const nextActividades = mergeCatalogActivities(nextCatalogos, overrides.actividades || actividades);
    const nextCompradores = overrides.compradores || compradores;
    const nextResponsablesSolicitudes = overrides.responsables_solicitudes || responsablesSolicitudes;
    const nextJerarquiaCategorias = overrides.jerarquia_categorias || jerarquiaCategorias;
    const nextAvancesCatalogo = overrides.avances_catalogo || Object.values(avanceCatalogos)
      .map((avance) => toExcelAvanceCatalogo(avance, nextCatalogos, nextCompradores))
      .filter((avance) => avance.estado === "Terminado");
    const nextSegmentosClientes = overrides.segmentos_clientes || segmentosClientes;
    const nextNotificaciones = overrides.notificaciones || buildNotificacionesFromCatalogos(nextCatalogos);
    const sourceRows = overrides.rows || rows;
    const normalizedRows = sourceRows.map((row) => {
      const normalized = toExcelRow(row);
      const version = getPromotionSyncVersion(row);
      return version ? { ...normalized, version } : normalized;
    });
    const rowsById = new Map(normalizedRows.map((row) => [row.row_id, row]));
    return {
      config: nextConfig,
      catalogos: nextCatalogos.map(toSheetCatalogo),
      actividades: nextActividades.map(toExcelActividad),
      segmentos_clientes: nextSegmentosClientes.map(toSheetSegmentoCliente),
      compradores: nextCompradores.map(toExcelComprador),
      responsables_solicitudes: nextResponsablesSolicitudes.map(toSheetResponsableSolicitud),
      jerarquia_categorias: nextJerarquiaCategorias.map(toSheetJerarquiaCategoria),
      avances_catalogo: nextAvancesCatalogo,
      promociones: normalizedRows,
      promociones_detalle: promocionesDetalle.map((item) => toExcelDetalle(item, rowsById)),
      comentarios: comentarios.map((item) => toExcelComment(item, rowsById)),
      logs: logs.map(toExcelLog),
      notificaciones: nextNotificaciones,
      catalogo_nombre: catalogoActivo?.nombre || "",
    };
  };

  const rememberSyncedPromotions = (promotions = []) => {
    syncedPromotionStateRef.current = buildPromotionSyncState(promotions);
  };

  const rememberSyncedSettings = (data = {}) => {
    const nextCatalogos = readCatalogosFromData(data, catalogos).map(toSheetCatalogo);
    const nextActividades = mergeCatalogActivities(nextCatalogos.map(normalizeCatalogo), data.actividades || []).map(toExcelActividad);
    syncedBuyerStateRef.current = buildKeyedSyncState((data.compradores || []).map(toExcelComprador), getBuyerSyncId, BUYER_SYNC_FIELDS);
    syncedActivityStateRef.current = buildActivitySyncState(nextActividades, nextCatalogos);
    syncedResponsableStateRef.current = buildKeyedSyncState((data.responsables_solicitudes || []).map(toSheetResponsableSolicitud), getResponsableSyncId, RESPONSABLE_SYNC_FIELDS);
    syncedJerarquiaStateRef.current = buildKeyedSyncState((data.jerarquia_categorias || []).map(toSheetJerarquiaCategoria), getJerarquiaSyncId, JERARQUIA_SYNC_FIELDS);
    syncedSegmentoStateRef.current = buildKeyedSyncState((data.segmentos_clientes || []).map(toSheetSegmentoCliente), getSegmentoSyncId, SEGMENTO_SYNC_FIELDS);
    syncedNotificacionStateRef.current = buildNotificacionSyncState(data.notificaciones || []);
  };

  const rememberSyncedOperations = (data = {}) => {
    const rowsById = new Map((data.promociones || []).map((row) => [row.row_id || row.id, row]));
    syncedCommentStateRef.current = buildKeyedSyncState((data.comentarios || []).map((item) => toExcelComment(item, rowsById)), getCommentSyncId, COMMENT_SYNC_FIELDS);
    syncedLogStateRef.current = buildKeyedSyncState((data.logs || []).map(toExcelLog), getLogSyncId, LOG_SYNC_FIELDS);
    syncedAvanceStateRef.current = buildKeyedSyncState((data.avances_catalogo || data.avancesCatalogo || []).map((item) => toExcelAvanceCatalogo(item)), getAvanceSyncId, AVANCE_SYNC_FIELDS);
  };

  const rememberSyncedOperationalRows = (data = {}) => {
    (data.promociones || []).forEach((row) => {
      const normalized = toExcelRow(row);
      const rowId = getPromotionSyncId(normalized);
      if (rowId) syncedPromotionStateRef.current.set(rowId, getPromotionSyncSnapshot(row));
    });

    const rowsById = new Map((data.promociones || []).map((row) => {
      const normalized = toExcelRow(row);
      return [normalized.row_id || normalized.id, normalized];
    }));
    (data.comentarios || []).forEach((comment) => {
      const normalized = toExcelComment(comment, rowsById);
      const commentId = getCommentSyncId(normalized);
      if (commentId) syncedCommentStateRef.current.set(commentId, getSyncSignature(normalized, COMMENT_SYNC_FIELDS));
    });
  };

  const runSupabaseOperation = async (loadingMessage, operation, successMessage) => {
    setIsSyncing(true);
    setSupabaseStatus({ type: "loading", message: loadingMessage });
    try {
      const result = await operation();
      setSupabaseStatus({ type: "ready", message: successMessage });
      return result;
    } catch (error) {
      if (error?.code === "PROMOTION_VERSION_CONFLICT") {
        setPromotionConflict(normalizePromotionConflict(error.conflict));
      }
      setSupabaseStatus({ type: "error", message: error.message || "No se pudo completar la operacion." });
      return null;
    } finally {
      setIsSyncing(false);
    }
  };

  const onLogout = async () => {
    await closeSession();
    dataOwnerRef.current = "";
    resetDomainState();
  };

  const onTestSupabaseConnection = async () => {
    const saved = saveStoredSupabaseConnection(supabaseSettings);
    setSupabaseSettings(saved);
    await runSupabaseOperation("Probando conexion con Supabase...", () => pingSupabaseConnection({ ...saved, session: appSession }), "Conexion con Supabase verificada.");
  };

  const onValidateSupabaseSession = async () => {
    const saved = saveStoredSupabaseConnection(supabaseSettings);
    setSupabaseSettings(saved);
    await runSupabaseOperation("Validando sesion de Supabase...", () => pingSupabaseConnection({ ...saved, session: appSession }), "Sesion de Supabase lista.");
  };

  const onDeleteCatalogo = (catalogoId) => {
    setCatalogos((prev) => {
      const remaining = prev.filter((cat) => cat.id !== catalogoId);
      setCatalogoActivo((current) => current?.id === catalogoId ? remaining[0] || current : current);
      setCatalogoAvanceActivo((current) => current?.id === catalogoId ? remaining[0] || current : current);
      return remaining.length ? remaining : prev;
    });
  };

  const openAvances = (catalogo) => {
    setCatalogoAvanceActivo(catalogo);
    setCatalogoActivo(catalogo);
    setActive("avances");
  };

  const {
    bootstrapData, onLoadSupabase, refreshSpecialRequestsFromSupabase, refreshPromotionScopeFromSupabase,
  } = useCatalogLoader({
    appSession, appUser, supabaseSettings, supabaseConnection, supabaseStatus,
    setSupabaseStatus, setDataState, setSpecialRequestsRefreshStatus, setPromotionScopeRefreshStatus,
    initialLoadSessionRef, dataOwnerRef, specialRequestsRefreshRef, promotionScopeRefreshRef,
    resetDomainState, runSupabaseOperation, applyCatalogData,
    rememberSyncedPromotions, rememberSyncedSettings, rememberSyncedOperations,
    applySpecialRequestsData, rememberSyncedOperationalRows, applyPromotionScopeData,
  });

  const {
    executePendingSaveAction,
    onSaveSupabase, onRequestSaveSupabase, onRequestSaveSupabaseSettings, onRequestSaveCatalogSettings,
    reloadAfterPromotionConflict, keepLocalPromotionConflict, discardLocalPromotionConflict,
  } = useCatalogSync({
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
  });

  const { fileInputRef, onLoadExcel, onSaveExcel } = useExcelBackup({
    buildCatalogPayload,
    applyCatalogData,
    resetSyncedState,
    setSupabaseStatus,
    showSuccessToast,
  });

  const currentRole = normalizeRole(appUser?.rol || "");
  const authValue = useMemo(() => ({
    appSession,
    appUser,
    role: currentRole,
    isAuthenticated: Boolean(appSession?.access_token && appUser?.activo !== false),
  }), [appSession, appUser, currentRole]);

  useEffect(() => {
    if (!currentRole || canAccessModule(currentRole, active)) return;
    setActive(getFirstAllowedModule(currentRole, SIDEBAR_NAV_ITEMS));
  }, [active, currentRole]);

  if (!appSession?.access_token) {
    if (authScreen === "forgot") {
      return <ForgotPasswordPage onSubmit={onRequestPasswordRecovery} onBack={() => { setAuthScreen("login"); setRecoveryStatus({ type: "idle", message: "" }); }} recoveryStatus={recoveryStatus} connectionStatus={hasSupabaseConnection(supabaseSettings) ? "" : "Faltan variables de entorno de Supabase en este entorno."}/>;
    }
    if (authScreen === "reset") {
      return <ResetPasswordPage recoverySession={recoverySession} recoveryUser={recoveryUser} onSubmit={onResetPassword} onBack={() => { clearAuthTokensFromUrl(); setRecoverySession(null); setRecoveryUser(null); setRecoveryStatus({ type: "idle", message: "" }); setAuthScreen("login"); }} recoveryStatus={recoveryStatus} connectionStatus={hasSupabaseConnection(supabaseSettings) ? "" : "Faltan variables de entorno de Supabase en este entorno."}/>;
    }
    return <LoginPage onLogin={onLogin} onForgotPassword={() => { setRecoveryStatus({ type: "idle", message: "" }); setAuthScreen("forgot"); }} loginStatus={loginStatus} connectionStatus={hasSupabaseConnection(supabaseSettings) ? "" : "Faltan variables de entorno de Supabase en este entorno."}/>;
  }

  if (!appUser) {
    return <AuthLoadingPage message={authStatus.message || "Cargando permisos..."}/>;
  }

  if (dataState.status === "loading") {
    return <DataLoadingScreen message="Cargando datos operativos..."/>;
  }

  if (dataState.status === "error") {
    return <DataLoadErrorScreen
      message={dataState.error}
      onRetry={() => void bootstrapData({ force: true })}
      onLogout={onLogout}
      isRetrying={false}
    />;
  }

  if (dataState.status !== "ready") {
    return <DataLoadingScreen message="Preparando datos operativos..."/>;
  }

  const currentUser = appSession.user_email || appSession.user?.email || "";
  const saveSupabaseDataLabel = pendingSaveAction?.confirmLabel || "Guardar";
  const supabaseDataReady = dataState.status === "ready";
  const supabaseSettingsReady = supabaseDataReady && hasSupabaseConnection(supabaseSettings);
  const supabaseConnectionReady = supabaseDataReady && hasSupabaseConnection(supabaseConnection);
  const navigate = (nextActive) => {
    setActive(nextActive);
    if (nextActive === "solicitudes") void refreshSpecialRequestsFromSupabase();
  };

  return <AuthProvider value={authValue}><SkuLookupContext.Provider value={ensureSkuMasterLoaded}><div className="app">
    <AppShell active={active} setActive={navigate} currentUser={currentUser} currentRole={currentRole} onLogout={onLogout}/>
    <main>
      <div className="top-status-bar">
        <DatabaseStatus
          connected={supabaseConnectionReady}
          busy={isSyncing}
          statuses={[supabaseStatus, skuMasterStatus, specialRequestsRefreshStatus, promotionScopeRefreshStatus]}
        />
        <LiveNotifications
          soundEnabled={soundEnabled}
          onToggleSound={toggleSound}
          items={liveNotifications.items}
          unreadCount={liveNotifications.unreadCount}
          status={liveNotifications.status}
          isOpen={liveNotifications.isOpen}
          onToggle={() => liveNotifications.setIsOpen((value) => !value)}
          onClose={() => liveNotifications.setIsOpen(false)}
          onRefresh={liveNotifications.refresh}
          onMarkRead={liveNotifications.markRead}
          onMarkAllRead={liveNotifications.markAllRead}
          onOpenItem={(notification) => {
            void liveNotifications.markRead(notification.id);
            if (notification.urlModulo) navigate(notification.urlModulo);
            liveNotifications.setIsOpen(false);
          }}
        />
      </div>
      <AppContent
        active={active}
        catalogData={{
          catalogos, setCatalogos, catalogoActivo, setCatalogoActivo, catalogoAvanceActivo,
          actividades, setActividades, compradores, setCompradores, jerarquiaCategorias,
          segmentosClientes, catalogoResumen, responsablesSolicitudes
        }}
        promotionData={{
          rows, setRows, comentarios, setComentarios, avanceCatalogos, setAvanceCatalogos, setLogs
        }}
        masterData={{
          skuMaster, skuMasterCount, skuMasterStatus, loadSkuMasterFromRemote, cancelSkuMasterLoad
        }}
        connectionData={{
          supabaseSettings, setSupabaseSettings, supabaseConnection, supabaseSettingsReady,
          supabaseConnectionReady, supabaseStatus, isSyncing, saveSupabaseStatus,
          promotionScopeRefreshStatus, specialRequestsRefreshStatus
        }}
        logsData={{
          consultedLogs, logsPage, logsPageSize, logsHasNextPage, logsStatus,
          onConsultLogs, onLogsPageSizeChange
        }}
        navigation={{
          setActive, navigate, openAvances
        }}
        actions={{
          onLoadExcel, onSaveExcel, fileInputRef, onLoadSupabase,
          onRequestSaveSupabase, onSaveSupabase, refreshPromotionScopeFromSupabase,
          onRequestSaveSupabaseSettings, onRequestSaveCatalogSettings, onDeleteCatalogo,
          onTestSupabaseConnection, onValidateSupabaseSession, resolveSpecialActivityIds
        }}
      />
    </main>
    <MobileNav active={active} setActive={navigate}/>
    <SuccessToast toast={successToast} onClose={() => setSuccessToast(null)}/>
    <LiveNotificationsToast notification={liveNotifications.isOpen ? null : liveNotificationToast} onClose={() => setLiveNotificationToast(null)}/>
    <PromotionConflictModal
      conflict={promotionConflict}
      onReload={reloadAfterPromotionConflict}
      onMerge={keepLocalPromotionConflict}
      onDiscard={discardLocalPromotionConflict}
    />
    {pendingSaveAction && <ConfirmModal
      title={pendingSaveAction.title || "Confirmar guardado"}
      description={pendingSaveAction.description || "Vas a guardar cambios en Supabase."}
      note={pendingSaveAction.note || "Este paso sincroniza los cambios con la base de datos y puede tardar unos segundos."}
      confirmLabel={saveSupabaseDataLabel}
      cancelLabel="Cancelar"
      onConfirm={executePendingSaveAction}
      onCancel={() => {
        pendingSaveConfirmRef.current = false;
        setPendingSaveAction(null);
      }}
    />}
  </div></SkuLookupContext.Provider></AuthProvider>;
}








