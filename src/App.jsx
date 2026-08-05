import React, { Suspense, useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { clearCachedSkuMaster, loadCatalogFromExcel, loadSkuMasterFromCsvUrl, loadSkuMasterFromExcel, saveCatalogToExcel } from "./services/excelService";
import {
  abortActiveSupabaseRequests,
  hasSupabaseConnection,
  loadActivityIdsByPrefixFromSupabase,
  loadAppUserProfile,
  loadCatalogFromSupabase,
  loadLogsFromSupabase,
  loadPromotionScopeFromSupabase,
  loadRecoverySessionFromUrl,
  loadSpecialRequestsFromSupabase,
  loadAuthUserFromSession,
  requestPasswordRecovery,
  pingSupabaseConnection,
  saveCatalogToSupabase,
  saveSettingsToSupabase,
  saveStoredSupabaseConnection,
  signInAppUser,
  signOutAppUser,
  updateRecoveredPassword,
} from "./services/supabaseService";
import {
  LEGACY_EXPORT_PAGE_CARDS,
  SIDEBAR_NAV_ITEMS,
} from "./constants";
import {
  makeId,
} from "./utils/common";
import {
  buildNotificacionesFromCatalogos,
  getAvanceCatalogoKey,
  mergeCatalogActivities,
  normalizeCompradorData,
  normalizeResponsableSolicitud,
  normalizeCatalogo,
  readCatalogosFromConfig,
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
import ProtectedRoute from "./components/ProtectedRoute";
import LogsPage from "./components/LogsPage";
import { ConfirmModal, PromotionConflictModal, SuccessToast } from "./components/AppFeedback";
import {
  AuthLoadingPage,
  DataLoadErrorScreen,
  DataLoadingScreen,
  ForgotPasswordPage,
  LoginPage,
  ResetPasswordPage,
} from "./components/AuthScreens";
import { Button, Card, CardContent, Header } from "./components/ui";
import { AppShell, MobileNav } from "./app/shell/AppNavigation";
import { clearAuthTokensFromUrl, getDataOwnerKey } from "./app/session/sessionHelpers";
import { canAccessModule, getFirstAllowedModule, MODULE_PERMISSIONS, normalizeRole } from "./constants/permissions";
import { useAuthSession } from "./hooks/useAuthSession";
import { useCatalogData } from "./hooks/useCatalogData";
import { useNotifications } from "./hooks/useNotifications";
import { usePromotionsData } from "./hooks/usePromotionsData";
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
  applyPromotionVersions,
  buildActivitySyncOptions,
  buildActivitySyncState,
  buildBuyerSyncOptions,
  buildKeyedSyncOptions,
  buildKeyedSyncState,
  buildNotificacionSyncOptions,
  buildNotificacionSyncState,
  buildPromotionSyncOptions,
  buildPromotionSyncState,
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
  getLogSyncId,
  getNotificacionSyncId,
  getPromotionDetailSyncId,
  getPromotionSyncId,
  getPromotionSyncSignature,
  getPromotionSyncSnapshot,
  getPromotionSyncVersion,
  getResponsableSyncId,
  getSegmentoSyncId,
  getSyncSignature,
  getSyncedPromotionSignature,
  getTouchedPromotionContextKeys,
} from "./app/sync/syncOptions";
import { getFullSyncPayload, normalizePromotionConflict } from "./app/sync/savePayload";

const ConsolidadoPage = React.lazy(() => import("./components/ConsolidadoPage"));
const ConsultaSkuPage = React.lazy(() => import("./components/ConsultaSkuPage"));
const AjustesPage = React.lazy(() => import("./components/AjustesPage"));
const ExportPageV2 = React.lazy(() => import("./components/ExportPageV2"));
const GestionAvancesPage = React.lazy(() => import("./components/GestionAvancesPage"));
const HomePage = React.lazy(() => import("./components/HomePage"));
const CatalogDesignPage = React.lazy(() => import("./components/CatalogDesignPage"));
const SeguimientoGanttPage = React.lazy(() => import("./components/SeguimientoGanttPage"));
const PromosPageView = React.lazy(() => import("./components/PromosPage"));
const PromocionEspecialPage = React.lazy(() => import("./components/PromocionEspecialPage"));
const SolicitudesEspecialesPageView = React.lazy(() => import("./components/SolicitudesEspecialesPage"));

const SKU_MASTER_FLOW_MODULES = new Set(["promos", "especial", "solicitudes"]);
const USE_DEMO_SEED_DATA = Boolean(import.meta.env.DEV && import.meta.env.VITE_USE_DEMO_DATA === "true");

const DEFAULT_ERP_SKU_MASTER_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSK3K3H_iL0iG-LqQt96jLXDly7ru3kCRzlr4our5GcIye1kr-NjBD9alSIsp6c4A/pub?output=csv";
const ERP_SKU_MASTER_CSV_URL = import.meta.env.VITE_SKU_MASTER_CSV_URL || DEFAULT_ERP_SKU_MASTER_CSV_URL;

function LoadingScreen() {
  return <div className="empty-state">Cargando modulo...</div>;
}

function ExportPage() { return <div><Header title="Exportaciones" subtitle="Salidas preparadas para Pricing, Mercadeo, Planimetria y futura consolidacion."/><div className="export-grid">{LEGACY_EXPORT_PAGE_CARDS.map(([title, desc]) => <Card key={title}><CardContent><Download size={22}/><h3>{title}</h3><p>{desc}</p><Button>Generar</Button></CardContent></Card>)}</div></div>; }

export default function PromoMVP() {
  const [active, setActive] = useState("home");
  const [dataState, setDataState] = useState({ status: "idle", error: null });
  const { catalogos, setCatalogos, catalogoActivo, setCatalogoActivo, catalogoAvanceActivo, setCatalogoAvanceActivo, actividades, setActividades, compradores, setCompradores, responsablesSolicitudes, setResponsablesSolicitudes, jerarquiaCategorias, setJerarquiaCategorias, segmentosClientes, setSegmentosClientes, catalogoResumen, setCatalogoResumen, config, setConfig, notificaciones, setNotificaciones, resetCatalogData } = useCatalogData({ useDemoData: USE_DEMO_SEED_DATA });
  const { rows, setRows, avanceCatalogos, setAvanceCatalogos, promocionesDetalle, setPromocionesDetalle, comentarios, setComentarios, logs, setLogs, consultedLogs, setConsultedLogs, logsPage, setLogsPage, logsPageSize, setLogsPageSize, logsHasNextPage, setLogsHasNextPage, logsStatus, setLogsStatus, resetPromotionsData } = usePromotionsData({ useDemoData: USE_DEMO_SEED_DATA });
  const { skuMaster, setSkuMaster, skuMasterCount, setSkuMasterCount, archivoComprador, setArchivoComprador, skuMasterStatus, setSkuMasterStatus, resetSkuMaster } = useSkuMaster();
  const { supabaseSettings, setSupabaseSettings, supabaseStatus, setSupabaseStatus, saveSupabaseStatus, setSaveSupabaseStatus, isSyncing, setIsSyncing, specialRequestsRefreshStatus, setSpecialRequestsRefreshStatus, promotionScopeRefreshStatus, setPromotionScopeRefreshStatus } = useSyncStatus();
  const { appSession, setAppSession, appUser, setAppUser, authStatus, setAuthStatus, loginStatus, setLoginStatus, recoveryStatus, setRecoveryStatus, authScreen, setAuthScreen, recoverySession, setRecoverySession, recoveryUser, setRecoveryUser } = useAuthSession();
  const { pendingSaveAction, setPendingSaveAction, successToast, setSuccessToast } = useNotifications();
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
  const skuMasterDeferredLoadRef = React.useRef(false);
  const skuMasterAbortRef = React.useRef(null);
  const saveOperationInFlightRef = React.useRef(false);
  const pendingSaveConfirmRef = React.useRef(false);
  const fileInputRef = React.useRef(null);
  const skuMasterFileInputRef = React.useRef(null);
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

  const resetDomainState = React.useCallback(() => {
    resetCatalogData();
    resetPromotionsData();
    resetSkuMaster();
    resetSyncedState();
    setActive("home");
    setDataState({ status: "idle", error: null });
    setSaveSupabaseStatus("idle");
    setSpecialRequestsRefreshStatus({ type: "idle", message: "" });
    setPromotionScopeRefreshStatus({ type: "idle", message: "" });
    setPendingSaveAction(null);
    setSuccessToast(null);
    setPromotionConflict(null);
    initialLoadSessionRef.current = "";
    specialRequestsRefreshRef.current = false;
    promotionScopeRefreshRef.current = "";
    skuMasterDeferredLoadRef.current = false;
    skuMasterAbortRef.current?.abort();
    skuMasterAbortRef.current = null;
    saveOperationInFlightRef.current = false;
    pendingSaveConfirmRef.current = false;
  }, [
    resetCatalogData,
    resetPromotionsData,
    resetSkuMaster,
    setSaveSupabaseStatus,
    setSpecialRequestsRefreshStatus,
    setPromotionScopeRefreshStatus,
    setPendingSaveAction,
    setSuccessToast,
  ]);
  const handleSessionRefresh = React.useCallback((nextSession) => {
    setAppSession(nextSession);
  }, []);
  const supabaseConnection = useMemo(() => ({
    ...supabaseSettings,
    session: appSession,
    appUser,
    onSessionRefresh: handleSessionRefresh,
  }), [supabaseSettings, appSession, appUser, handleSessionRefresh]);

  const resolveSpecialActivityIds = React.useCallback(async (prefix) => {
    if (!hasSupabaseConnection(supabaseConnection)) return [];
    return loadActivityIdsByPrefixFromSupabase(supabaseConnection, prefix);
  }, [supabaseConnection]);

  const requestSupabaseSaveConfirmation = (payload) => {
    if (dataState.status !== "ready") {
      setSupabaseStatus({ type: "error", message: "Espere a que los datos operativos carguen correctamente antes de guardar." });
      return;
    }
    if (isSyncing || saveOperationInFlightRef.current || pendingSaveConfirmRef.current) return;
    pendingSaveConfirmRef.current = true;
    setPendingSaveAction(payload);
  };

  const showSuccessToast = (message, title = "Cambios guardados") => {
    setSuccessToast({ id: Date.now(), title, message });
  };

  const loadSkuMasterFromRemote = React.useCallback(async () => {
    skuMasterAbortRef.current?.abort();
    const controller = new AbortController();
    skuMasterAbortRef.current = controller;
    setSkuMasterStatus({ type: "loading", message: "Actualizando archivo ERP...", progress: 5 });
    try {
      const data = await loadSkuMasterFromCsvUrl(ERP_SKU_MASTER_CSV_URL, (progress) => {
        setSkuMasterStatus({ type: "loading", message: "Actualizando archivo ERP...", progress });
      }, { signal: controller.signal });
      setSkuMaster(data.skuMaster);
      setSkuMasterCount(data.skuMasterCount);
      setArchivoComprador({
        nombre: "ERP publicado",
        total: data.skuMasterCount,
        hoja: data.sheetName,
        fecha: data.cachedAt || new Date().toISOString(),
        etag: data.etag,
        lastModified: data.lastModified,
      });
      const cacheMessage = data.fromCache
        ? data.cacheReason
          ? " desde cache local; el origen no se actualizo."
          : " desde cache"
        : "";
      setSkuMasterStatus({ type: "ready", message: `${data.skuMasterCount} SKU cargados desde ERP${cacheMessage}.`, progress: 100 });
    } catch (error) {
      if (error?.name === "AbortError") {
        setSkuMasterStatus({ type: "idle", message: "Actualizacion del ERP cancelada.", progress: 0 });
        return;
      }
      setSkuMasterStatus({ type: "error", message: error.message || "No se pudo cargar el archivo ERP.", progress: 0 });
    } finally {
      if (skuMasterAbortRef.current === controller) skuMasterAbortRef.current = null;
    }
  }, []);

  const cancelSkuMasterLoad = React.useCallback(() => {
    skuMasterAbortRef.current?.abort();
  }, []);

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

  useEffect(() => {
    let cancelled = false;
    loadRecoverySessionFromUrl(supabaseSettings)
      .then((nextRecoverySession) => {
        if (cancelled || !nextRecoverySession) return null;
        clearAuthTokensFromUrl();
        setAuthScreen("reset");
        setRecoverySession(nextRecoverySession);
        setRecoveryUser(null);
        setLoginStatus({ type: "idle", message: "" });
        setRecoveryStatus({ type: "loading", message: "Validando enlace de recuperacion..." });
        return loadAuthUserFromSession(supabaseSettings, nextRecoverySession);
      })
      .then((user) => {
        if (!user) return;
        if (cancelled) return;
        setRecoveryUser(user);
        setRecoveryStatus({ type: "idle", message: "" });
      })
      .catch((error) => {
        if (cancelled) return;
        clearAuthTokensFromUrl();
        setAuthScreen("reset");
        setRecoveryStatus({ type: "error", message: error.message || "No se pudo validar el enlace de recuperacion." });
      });
    return () => {
      cancelled = true;
    };
  }, [supabaseSettings]);

  useEffect(() => {
    if (!successToast) return undefined;
    const timeoutId = window.setTimeout(() => setSuccessToast(null), 3600);
    return () => window.clearTimeout(timeoutId);
  }, [successToast]);

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
      setAppUser(null);
      setAuthStatus({ type: "idle", message: "" });
      dataOwnerRef.current = "";
      resetDomainState();
      return;
    }
    let cancelled = false;
    setAuthStatus({ type: "loading", message: "Cargando permisos..." });
    loadAppUserProfile({ ...supabaseSettings, onSessionRefresh: handleSessionRefresh }, appSession)
      .then((profile) => {
        if (cancelled) return;
        setAppUser(profile);
        setAuthStatus({ type: "ready", message: "" });
      })
      .catch((error) => {
        if (cancelled) return;
        void signOutAppUser(supabaseSettings, appSession).catch(() => null);
        setAppSession(null);
        setAppUser(null);
        setAuthStatus({ type: "error", message: error.message || "No se pudieron cargar los permisos." });
        setLoginStatus({ type: "error", message: error.message || "No se pudieron cargar los permisos." });
      });
    return () => {
      cancelled = true;
    };
  }, [appSession, supabaseSettings, handleSessionRefresh, resetDomainState]);

  useEffect(() => {
    if (!appSession?.access_token || !appUser?.activo) return;
    void bootstrapData();
  }, [appSession, appUser, supabaseConnection]);

  useEffect(() => {
    if (!appSession?.access_token || !appUser?.activo) return;
    if (!SKU_MASTER_FLOW_MODULES.has(active)) return;
    if (skuMasterCount > 0 || skuMasterStatus.type === "loading" || skuMasterDeferredLoadRef.current) return;
    skuMasterDeferredLoadRef.current = true;
    void loadSkuMasterFromRemote();
  }, [active, appSession, appUser, skuMasterCount, skuMasterStatus.type, loadSkuMasterFromRemote]);

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

  const applySavedActivities = (payload = {}) => {
    if (!Array.isArray(payload.actividades)) return;
    const savedCatalogos = Array.isArray(payload.catalogos)
      ? payload.catalogos.map(normalizeCatalogo)
      : catalogos;
    setActividades(mergeCatalogActivities(savedCatalogos, payload.actividades));
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

  const getPromotionScopeKey = ({ actividadId, comprador, tipoPromo } = {}) => [
    actividadId || "",
    comprador || "",
    tipoPromo || "",
  ].map((value) => String(value).trim()).join("__");

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

  const rememberSyncedPayload = (payload = {}) => {
    rememberSyncedPromotions(payload.promociones || []);
    rememberSyncedSettings(payload);
    rememberSyncedOperations(payload);
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

  const compactSupabasePayload = (payload = {}) => {
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

  const getDeltaCounts = (payload = {}) => {
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

  const hasSupabaseDeltaChanges = (payload = {}) => {
    const counts = getDeltaCounts(payload);
    return Object.values(counts).some((count) => count > 0);
  };

  const buildSaveOperationSummary = (payload = {}) => {
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

  const createSaveOperation = (operationType) => {
    const operationId = window.crypto?.randomUUID?.() || makeId("SAVE");
    return {
      operationId: `save-${operationType}-${operationId}`,
      operationType,
      startedAt: new Date().toISOString(),
    };
  };

  async function bootstrapData({ force = false } = {}) {
    const ownerKey = getDataOwnerKey(appSession, appUser);
    if (!appSession?.access_token || !appUser?.activo || !ownerKey) return null;
    if (dataOwnerRef.current !== ownerKey) {
      dataOwnerRef.current = ownerKey;
      resetDomainState();
    }
    if (!hasSupabaseConnection(supabaseConnection)) {
      const message = "Faltan variables de entorno de Supabase para cargar los datos automaticamente.";
      setSupabaseStatus({ type: "error", message });
      setDataState({ status: "error", error: message });
      return null;
    }

    const loadKey = `${ownerKey}:${supabaseSettings.url || ""}`;
    if (!force && initialLoadSessionRef.current === loadKey) return null;
    initialLoadSessionRef.current = loadKey;
    const data = await onLoadSupabase({ blocking: true });
    if (!data && initialLoadSessionRef.current === loadKey) {
      initialLoadSessionRef.current = "";
    }
    return data;
  }

  const onLogin = async (email, password) => {
    setLoginStatus({ type: "loading", message: "Validando usuario..." });
    try {
      const savedConnection = saveStoredSupabaseConnection(supabaseSettings);
      setSupabaseSettings(savedConnection);
      const session = await signInAppUser(savedConnection, email, password);
      const profile = await loadAppUserProfile(savedConnection, session);
      setAppUser(profile);
      setAppSession(session);
      setLoginStatus({ type: "ready", message: "" });
    } catch (error) {
      setLoginStatus({ type: "error", message: error.message || "No se pudo iniciar sesion." });
    }
  };

  const onRequestPasswordRecovery = async (email) => {
    setRecoveryStatus({ type: "loading", message: "Enviando enlace de recuperacion..." });
    try {
      const savedConnection = saveStoredSupabaseConnection(supabaseSettings);
      setSupabaseSettings(savedConnection);
      await requestPasswordRecovery(savedConnection, email);
      setRecoveryStatus({ type: "success", message: "Si el correo existe, recibira un enlace para restablecer la contraseña." });
      setLoginStatus({ type: "idle", message: "" });
    } catch (error) {
      setRecoveryStatus({ type: "error", message: error.message || "No se pudo enviar el enlace de recuperacion." });
    }
  };

  const onResetPassword = async (password, confirmPassword) => {
    if (password !== confirmPassword) {
      setRecoveryStatus({ type: "error", message: "Las contraseñas no coinciden." });
      return;
    }
    setRecoveryStatus({ type: "loading", message: "Actualizando contraseña..." });
    try {
      const savedConnection = saveStoredSupabaseConnection(supabaseSettings);
      setSupabaseSettings(savedConnection);
      await updateRecoveredPassword(savedConnection, recoverySession, password);
      await signOutAppUser(savedConnection, recoverySession).catch(() => null);
      setAppSession(null);
      setAppUser(null);
      setRecoverySession(null);
      setAuthScreen("login");
      setRecoveryStatus({ type: "idle", message: "" });
      setLoginStatus({ type: "success", message: "Contraseña actualizada. Ya puede iniciar sesion con la nueva contraseña." });
    } catch (error) {
      setRecoveryStatus({ type: "error", message: error.message || "No se pudo actualizar la contraseña." });
    }
  };

  const onLogout = async () => {
    let signOutError = null;
    setAuthStatus({ type: "loading", message: "Cerrando sesion..." });
    try {
      await signOutAppUser(supabaseSettings, appSession, { scope: "global" });
    } catch (error) {
      signOutError = error;
    }
    abortActiveSupabaseRequests();
    await clearCachedSkuMaster().catch(() => null);
    setAppSession(null);
    setAppUser(null);
    setAuthStatus({ type: "idle", message: "" });
    setLoginStatus(signOutError
      ? { type: "error", message: `Sesion local cerrada. Supabase reporto: ${signOutError.message || signOutError}` }
      : { type: "idle", message: "" });
    setRecoveryStatus({ type: "idle", message: "" });
    setRecoverySession(null);
    setRecoveryUser(null);
    setAuthScreen("login");
    dataOwnerRef.current = "";
    resetDomainState();
  };

  const onConsultLogs = async (page = logsPage, pageSize = logsPageSize) => {
    if (!hasSupabaseConnection(supabaseConnection)) {
      setLogsStatus({ type: "error", message: "Configure Supabase antes de consultar logs." });
      return;
    }
    setLogsStatus({ type: "loading", message: "Consultando logs..." });
    try {
      const data = await loadLogsFromSupabase(supabaseConnection, { page, pageSize });
      const nextLogs = (data.logs || []).map(toAppLog);
      setConsultedLogs(nextLogs);
      setLogsPage(data.page || page);
      setLogsHasNextPage(Boolean(data.has_next_page));
      setLogsStatus({ type: "ready", message: nextLogs.length ? "Logs cargados." : "No hay logs para esta pagina." });
    } catch (error) {
      setLogsStatus({ type: "error", message: error.message || "No se pudieron consultar los logs." });
    }
  };

  const onLogsPageSizeChange = (nextPageSize) => {
    setLogsPageSize(nextPageSize);
    onConsultLogs(1, nextPageSize);
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
        setSupabaseStatus({ type: "ready", message: data.idempotent_replay ? "Ajustes ya estaban guardados en Supabase." : "Ajustes guardados en Supabase." });
        showSuccessToast("Compradores y catalogos se sincronizaron correctamente.", "Ajustes guardados");
      } else {
        setSaveSupabaseStatus("error");
        setSupabaseStatus((current) => ({ type: "error", message: `No se pudieron guardar los ajustes en Supabase. ${current?.message || "Revise la conexión y vuelva a intentar."}` }));
      }
    } finally {
      saveOperationInFlightRef.current = false;
    }
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

  const onLoadSupabase = async ({ blocking = false } = {}) => {
    if (!hasSupabaseConnection(supabaseConnection)) {
      const message = "Faltan variables de entorno de Supabase para cargar los datos.";
      setSupabaseStatus({ type: "error", message });
      if (blocking) setDataState({ status: "error", error: message });
      return null;
    }
    if (blocking) setDataState({ status: "loading", error: null });
    const data = await runSupabaseOperation("Cargando catalogo desde Supabase...", () => loadCatalogFromSupabase(supabaseConnection), "Catalogo cargado desde Supabase.");
    if (data) {
      applyCatalogData(data);
      if (Array.isArray(data.promociones)) rememberSyncedPromotions(data.promociones);
      rememberSyncedSettings(data);
      rememberSyncedOperations(data);
      setDataState({ status: "ready", error: null });
    } else if (blocking) {
      setDataState((current) => ({
        status: "error",
        error: current.error || supabaseStatus.message || "No se pudieron cargar los datos operativos desde Supabase.",
      }));
    }
    return data;
  };

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

  const refreshSpecialRequestsFromSupabase = React.useCallback(async () => {
    if (specialRequestsRefreshRef.current || !hasSupabaseConnection(supabaseConnection)) return;
    specialRequestsRefreshRef.current = true;
    setSpecialRequestsRefreshStatus({ type: "loading", message: "Actualizando solicitudes especiales..." });
    try {
      const data = await loadSpecialRequestsFromSupabase(supabaseConnection);
      const result = applySpecialRequestsData(data);
      rememberSyncedOperationalRows(data);
      setSpecialRequestsRefreshStatus({
        type: "ready",
        message: result.count ? "Solicitudes especiales actualizadas." : "No hay solicitudes especiales en Supabase.",
      });
    } catch (error) {
      setSpecialRequestsRefreshStatus({ type: "error", message: error.message || "No se pudieron actualizar las solicitudes especiales." });
    } finally {
      specialRequestsRefreshRef.current = false;
    }
  }, [supabaseConnection]);

  const refreshPromotionScopeFromSupabase = React.useCallback(async (scope = {}) => {
    const nextScope = {
      actividadId: String(scope.actividadId || "").trim(),
      comprador: String(scope.comprador || "").trim(),
      tipoPromo: String(scope.tipoPromo || "").trim(),
    };
    if (!nextScope.actividadId || !nextScope.comprador || !nextScope.tipoPromo || !hasSupabaseConnection(supabaseConnection)) return;

    const scopeKey = getPromotionScopeKey(nextScope);
    promotionScopeRefreshRef.current = scopeKey;
    setPromotionScopeRefreshStatus({ type: "loading", message: "Actualizando ofertas desde Supabase..." });
    try {
      const data = await loadPromotionScopeFromSupabase(supabaseConnection, nextScope);
      if (promotionScopeRefreshRef.current !== scopeKey) return;
      const result = applyPromotionScopeData(nextScope, data);
      if (result.skipped) {
        setPromotionScopeRefreshStatus({
          type: "error",
          message: "No se actualizó la grilla porque hay cambios locales sin guardar en esta combinación.",
        });
        return;
      }
      setPromotionScopeRefreshStatus({
        type: "ready",
        message: result.count ? "Ofertas actualizadas desde Supabase." : "No hay ofertas guardadas para esta combinación.",
      });
    } catch (error) {
      if (promotionScopeRefreshRef.current === scopeKey) {
        setPromotionScopeRefreshStatus({ type: "error", message: error.message || "No se pudieron actualizar las ofertas desde Supabase." });
      }
    }
  }, [supabaseConnection]);

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
        setSupabaseStatus({ type: "ready", message: data.idempotent_replay ? "Estos cambios ya estaban guardados en Supabase." : "Cambios guardados en Supabase." });
        showSuccessToast("La informacion se sincronizo correctamente en Supabase.");
      } else {
        setSaveSupabaseStatus("error");
        setSupabaseStatus((current) => ({ type: "error", message: `No se pudieron guardar los cambios en Supabase. ${current?.message || "Revise la conexión y vuelva a intentar."}` }));
      }
    } finally {
      saveOperationInFlightRef.current = false;
    }
  };

  const onRequestSaveSupabase = () => requestSupabaseSaveConfirmation({
    title: "Confirmar guardado",
    description: "Vas a guardar los cambios del catalogo en Supabase.",
    note: "Este guardado sincroniza promociones, comentarios, avances y ajustes relacionados.",
    confirmLabel: "Guardar Supabase",
    action: onSaveSupabase,
  });

  const onRequestSaveSupabaseSettings = () => requestSupabaseSaveConfirmation({
    title: "Confirmar ajustes",
    description: "Vas a guardar los ajustes de conexión en Supabase.",
    note: "La conexión se actualizará con los valores actuales de la pantalla de Ajustes.",
    confirmLabel: "Guardar Supabase",
    action: onSaveSupabaseSettings,
  });

  const onRequestSaveCatalogSettings = (settings = {}) => requestSupabaseSaveConfirmation({
    title: "Confirmar guardado",
    description: "Vas a guardar compradores y catalogos en Supabase.",
    note: "Este cambio impacta la estructura base del sistema y luego sincroniza el catálogo.",
    confirmLabel: "Guardar Supabase",
    action: () => onSaveCatalogSettings(settings),
  });

  const onLoadExcel = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const data = await loadCatalogFromExcel(file);
      applyCatalogData(data);
      resetSyncedState();
      setSupabaseStatus({ type: "ready", message: `Excel cargado: ${file.name}` });
    } catch (error) {
      setSupabaseStatus({ type: "error", message: error.message || "No se pudo cargar el Excel." });
    } finally {
      event.target.value = "";
    }
  };

  const onLoadSkuMaster = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSkuMasterStatus({ type: "loading", message: "Cargando archivo ERP..." });
    try {
      const data = await loadSkuMasterFromExcel(file);
      setSkuMaster(data.skuMaster);
      setSkuMasterCount(data.skuMasterCount);
      setArchivoComprador({ nombre:file.name, total:data.skuMasterCount, hoja:data.sheetName, fecha: new Date().toISOString() });
      setSkuMasterStatus({ type: "ready", message: `${data.skuMasterCount} SKU cargados desde ${file.name}.` });
    } catch (error) {
      setSkuMasterStatus({ type: "error", message: error.message || "No se pudo cargar el archivo ERP." });
    } finally {
      event.target.value = "";
    }
  };

  const onSaveExcel = async () => {
    try {
      await saveCatalogToExcel(buildCatalogPayload());
      setSupabaseStatus({ type: "ready", message: "Excel exportado correctamente." });
      showSuccessToast("El archivo Excel se genero correctamente.", "Exportacion lista");
    } catch (error) {
      setSupabaseStatus({ type: "error", message: error.message || "No se pudo exportar el Excel." });
    }
  };

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

  return <AuthProvider value={authValue}><div className="app">
    <AppShell active={active} setActive={navigate} currentUser={currentUser} currentRole={currentRole} onLogout={onLogout}/>
    <main>
      <Suspense fallback={<LoadingScreen />}>
      {active === "home" && <ProtectedRoute permission={MODULE_PERMISSIONS.home}><HomePage catalogos={catalogos} rows={rows} actividades={actividades} comentarios={comentarios} compradores={compradores} jerarquiaCategorias={jerarquiaCategorias} catalogoResumen={catalogoResumen} rowsCount={rows.length} logsCount={consultedLogs.length} setActive={setActive} setCatalogoActivo={setCatalogoActivo} onOpenAvances={openAvances} onLoadExcel={onLoadExcel} onSaveExcel={onSaveExcel} onLoadSupabase={onLoadSupabase} supabaseSettings={supabaseSettings} supabaseReady={supabaseSettingsReady} supabaseStatus={supabaseStatus} isSyncing={isSyncing} fileInputRef={fileInputRef}/></ProtectedRoute>}
      {active === "avances" && <ProtectedRoute permission={MODULE_PERMISSIONS.avances}><GestionAvancesPage catalogo={catalogoAvanceActivo} rows={rows} catalogoResumen={catalogoResumen} compradores={compradores} jerarquiaCategorias={jerarquiaCategorias} avances={avanceCatalogos} setAvanceCatalogos={setAvanceCatalogos} setLogs={setLogs} onSaveSupabase={onRequestSaveSupabase} supabaseReady={supabaseSettingsReady} saveSupabaseStatus={saveSupabaseStatus} isSyncing={isSyncing} onBack={() => setActive("home")} onOpenCatalogo={(catalogo) => { setCatalogoActivo(catalogo); setActive("promos"); }}/></ProtectedRoute>}
      {active === "ajustes" && <ProtectedRoute permission={MODULE_PERMISSIONS.ajustes}><AjustesPage catalogos={catalogos} setCatalogos={setCatalogos} compradores={compradores} setCompradores={setCompradores} rows={rows} actividades={actividades} supabaseSettings={supabaseSettings} setSupabaseSettings={setSupabaseSettings} onSaveSupabaseSettings={onRequestSaveSupabaseSettings} onSaveCatalogSettings={onRequestSaveCatalogSettings} onDeleteCatalogo={onDeleteCatalogo} onTestSupabaseConnection={onTestSupabaseConnection} onValidateSupabaseSession={onValidateSupabaseSession} supabaseStatus={supabaseStatus} isSyncing={isSyncing}/></ProtectedRoute>}
      {active === "promos" && <ProtectedRoute permission={MODULE_PERMISSIONS.promos}><PromosPageView catalogoActivo={catalogoActivo} rows={rows} setRows={setRows} comentarios={comentarios} setComentarios={setComentarios} compradores={compradores} jerarquiaCategorias={jerarquiaCategorias} segmentosClientes={segmentosClientes} skuMaster={skuMaster} skuMasterCount={skuMasterCount} setLogs={setLogs} onLoadSkuMaster={onLoadSkuMaster} skuMasterFileInputRef={skuMasterFileInputRef} archivoComprador={archivoComprador} skuMasterStatus={skuMasterStatus} onRefreshSkuMaster={loadSkuMasterFromRemote} onCancelSkuMaster={cancelSkuMasterLoad} onSaveSupabase={onRequestSaveSupabase} onSaveSupabaseDirect={onSaveSupabase} onRefreshPromotionScope={refreshPromotionScopeFromSupabase} promotionScopeRefreshStatus={promotionScopeRefreshStatus} supabaseReady={supabaseSettingsReady} saveSupabaseStatus={saveSupabaseStatus} isSyncing={isSyncing} avanceCatalogos={avanceCatalogos} setAvanceCatalogos={setAvanceCatalogos}/></ProtectedRoute>}
      {active === "consulta" && <ProtectedRoute permission={MODULE_PERMISSIONS.consulta}><ConsultaSkuPage rows={rows} actividades={actividades}/></ProtectedRoute>}
      {active === "especial" && <ProtectedRoute permission={MODULE_PERMISSIONS.especial}><PromocionEspecialPage actividades={actividades} setActividades={setActividades} rows={rows} setRows={setRows} comentarios={comentarios} setComentarios={setComentarios} compradores={compradores} jerarquiaCategorias={jerarquiaCategorias} segmentosClientes={segmentosClientes} skuMaster={skuMaster} skuMasterCount={skuMasterCount} setLogs={setLogs} onLoadSkuMaster={onLoadSkuMaster} skuMasterFileInputRef={skuMasterFileInputRef} archivoComprador={archivoComprador} onSaveSupabase={onRequestSaveSupabase} supabaseReady={supabaseSettingsReady} onResolveSpecialActivityIds={resolveSpecialActivityIds} saveSupabaseStatus={saveSupabaseStatus} isSyncing={isSyncing} catalogos={catalogos}/></ProtectedRoute>}
      {active === "solicitudes" && <ProtectedRoute permission={MODULE_PERMISSIONS.solicitudes}><SolicitudesEspecialesPageView actividades={actividades} setActividades={setActividades} rows={rows} setRows={setRows} comentarios={comentarios} setComentarios={setComentarios} compradores={compradores} jerarquiaCategorias={jerarquiaCategorias} segmentosClientes={segmentosClientes} skuMaster={skuMaster} skuMasterCount={skuMasterCount} archivoComprador={archivoComprador} skuMasterStatus={skuMasterStatus} onRefreshSkuMaster={loadSkuMasterFromRemote} onCancelSkuMaster={cancelSkuMasterLoad} responsablesSolicitudes={responsablesSolicitudes} setLogs={setLogs} setActive={setActive} onSaveSupabase={onRequestSaveSupabase} supabaseReady={supabaseSettingsReady} saveSupabaseStatus={saveSupabaseStatus} isSyncing={isSyncing} refreshStatus={specialRequestsRefreshStatus}/></ProtectedRoute>}
      {active === "seguimiento" && <ProtectedRoute permission={MODULE_PERMISSIONS.seguimiento}><SeguimientoGanttPage actividades={actividades} rows={rows} catalogos={catalogos}/></ProtectedRoute>}
      {active === "catalogDesign" && <ProtectedRoute permission={MODULE_PERMISSIONS.catalogDesign}><CatalogDesignPage catalogos={catalogos} rows={rows} supabaseConnection={supabaseConnection} supabaseReady={supabaseConnectionReady}/></ProtectedRoute>}
      {active === "logs" && <ProtectedRoute permission={MODULE_PERMISSIONS.logs}><LogsPage logs={consultedLogs} page={logsPage} pageSize={logsPageSize} hasNextPage={logsHasNextPage} status={logsStatus} supabaseReady={supabaseSettingsReady} onConsult={onConsultLogs} onPrevious={() => onConsultLogs(Math.max(1, logsPage - 1))} onNext={() => onConsultLogs(logsPage + 1)} onPageSizeChange={onLogsPageSizeChange}/></ProtectedRoute>}
      {active === "consolidado" && <ProtectedRoute permission={MODULE_PERMISSIONS.consolidado}><ConsolidadoPage rows={rows} actividades={actividades} catalogos={catalogos} comentarios={comentarios} setComentarios={setComentarios} compradores={compradores} onSaveSupabase={onRequestSaveSupabase} supabaseReady={supabaseSettingsReady} saveSupabaseStatus={saveSupabaseStatus} isSyncing={isSyncing}/></ProtectedRoute>}
      {active === "export" && <ProtectedRoute permission={MODULE_PERMISSIONS.export}><ExportPageV2 rows={rows} actividades={actividades} comentarios={comentarios} supabaseConnection={supabaseConnection} supabaseReady={supabaseConnectionReady}/></ProtectedRoute>}
      </Suspense>
    </main>
    <MobileNav active={active} setActive={navigate}/>
    <SuccessToast toast={successToast} onClose={() => setSuccessToast(null)}/>
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
  </div></AuthProvider>;
}








