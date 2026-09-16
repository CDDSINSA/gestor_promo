import { useCallback, useEffect, useRef, useState } from "react";
import { loadSkuMasterBySkusFromSupabase } from "../services/supabaseService";

// Session-scoped cache. Absent articles are cached too; failed requests are retryable.
export function useSkuMaster(connection) {
  const cache = useRef({});
  const known = useRef(new Set());
  const requested = useRef(new Set());
  const pending = useRef(new Map());
  const generation = useRef(0);
  const [skuMaster, setSkuMaster] = useState({});
  const [skuMasterStatus, setSkuMasterStatus] = useState({ type: "idle", message: "Artículos disponibles por consulta a la BD." });

  const cancelSkuMasterLoad = useCallback(() => {
    generation.current++;
    new Set(pending.current.values()).forEach((task) => task.controller.abort());
    pending.current.clear();
    setSkuMasterStatus({ type: "idle", message: "Consulta cancelada. Puede reintentar." });
  }, []);

  const resetSkuMaster = useCallback(() => {
    cancelSkuMasterLoad();
    cache.current = {};
    known.current.clear();
    requested.current.clear();
    setSkuMaster({});
  }, [cancelSkuMasterLoad]);

  useEffect(() => () => {
    generation.current++;
    new Set(pending.current.values()).forEach((task) => task.controller.abort());
    pending.current.clear();
  }, []);

  const ensureSkuMasterLoaded = useCallback(async (skus = []) => {
    const keys = [...new Set(skus.map((sku) => String(sku ?? "").trim()).filter(Boolean))];
    keys.forEach((key) => requested.current.add(key));
    const missing = keys.filter((key) => !known.current.has(key) && !pending.current.has(key));
    const epoch = generation.current;
    if (missing.length) {
      const controller = new AbortController();
      const task = { controller, promise: null };
      setSkuMasterStatus({ type: "loading", message: "Consultando artículos en la BD..." });
      task.promise = loadSkuMasterBySkusFromSupabase(connection, missing, { signal: controller.signal })
        .then((data) => {
          if (epoch !== generation.current || controller.signal.aborted) throw new Error("Consulta de artículos cancelada.");
          cache.current = { ...cache.current, ...data.skuMaster };
          missing.forEach((key) => known.current.add(key));
          setSkuMaster(cache.current);
        })
        .catch((error) => {
          if (epoch === generation.current) setSkuMasterStatus({ type: "error", message: error.message || "No se pudieron consultar los artículos." });
          throw error;
        })
        .finally(() => {
          missing.forEach((key) => { if (pending.current.get(key) === task) pending.current.delete(key); });
          if (epoch === generation.current && !pending.current.size) {
            setSkuMasterStatus((status) => status.type === "error" ? status : { type: "ready", message: "Consulta de artículos completada." });
          }
        });
      missing.forEach((key) => pending.current.set(key, task));
    }
    await Promise.all([...new Set(keys.map((key) => pending.current.get(key)?.promise).filter(Boolean))]);
    if (epoch !== generation.current) throw new Error("Consulta de artículos cancelada.");
    return cache.current;
  }, [connection]);

  // Refresh only requested articles, including previous misses after an admin import.
  const loadSkuMasterFromRemote = useCallback(async () => {
    const keys = [...requested.current];
    resetSkuMaster();
    try { return await ensureSkuMasterLoaded(keys); } catch { return null; }
  }, [ensureSkuMasterLoaded, resetSkuMaster]);

  return {
    skuMaster, skuMasterCount: new Set(Object.values(skuMaster).map((item) => item.sku)).size,
    skuMasterStatus, resetSkuMaster, loadSkuMasterFromRemote, cancelSkuMasterLoad, ensureSkuMasterLoaded,
  };
}
