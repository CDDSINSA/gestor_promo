import { useCallback } from "react";
import {
  hasSupabaseConnection,
  loadCatalogFromSupabase,
  loadSpecialRequestsFromSupabase,
  loadPromotionScopeFromSupabase,
} from "../services/supabaseService";
import { getDataOwnerKey } from "../app/session/sessionHelpers";

// Application of loaded data and sync snapshots is shared with saves and Excel imports.
export function useCatalogLoader({
  appSession, appUser, supabaseSettings, supabaseConnection,
  setSupabaseStatus, setDataState, setSpecialRequestsRefreshStatus, setPromotionScopeRefreshStatus,
  initialLoadSessionRef, dataOwnerRef, specialRequestsRefreshRef, promotionScopeRefreshRef,
  resetDomainState, runSupabaseOperation, applyCatalogData,
  rememberSyncedPromotions, rememberSyncedSettings, rememberSyncedOperations,
  applySpecialRequestsData, rememberSyncedOperationalRows, applyPromotionScopeData,
}) {
  const getPromotionScopeKey = ({ actividadId, comprador, tipoPromo } = {}) => [
    actividadId || "",
    comprador || "",
    tipoPromo || "",
  ].map((value) => String(value).trim()).join("__");

  const onLoadSupabase = async ({ blocking = false } = {}) => {
    if (!hasSupabaseConnection(supabaseConnection)) {
      const message = "Faltan variables de entorno de Supabase para cargar los datos.";
      setSupabaseStatus({ type: "error", message });
      if (blocking) setDataState({ status: "error", error: message });
      return null;
    }
    if (blocking) setDataState({ status: "loading", error: null });
    let loadError = null;
    const data = await runSupabaseOperation("Cargando catalogo desde Supabase...", async () => {
      try {
        return await loadCatalogFromSupabase(supabaseConnection);
      } catch (error) {
        // The shared operation handler updates React state and returns null.
        // Capture this request's error instead of reading the previous render's status.
        loadError = error;
        throw error;
      }
    }, "Catalogo cargado desde Supabase.");
    if (data) {
      applyCatalogData(data);
      if (Array.isArray(data.promociones)) rememberSyncedPromotions(data.promociones);
      rememberSyncedSettings(data);
      rememberSyncedOperations(data);
      setDataState({ status: "ready", error: null });
    } else if (blocking) {
      setDataState({
        status: "error",
        error: loadError?.message || "No se pudieron cargar los datos operativos desde Supabase.",
      });
    }
    return data;
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

  const refreshSpecialRequestsFromSupabase = useCallback(async () => {
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

  const refreshPromotionScopeFromSupabase = useCallback(async (scope = {}) => {
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

  return {
    bootstrapData,
    onLoadSupabase,
    refreshSpecialRequestsFromSupabase,
    refreshPromotionScopeFromSupabase,
  };
}
