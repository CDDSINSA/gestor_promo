import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadAbcClassificationsFromSupabase, loadMarginLinesFromSupabase, loadMarginSettingsFromSupabase } from "../../services/supabase/margins";
import { attachAbcClassification } from "./marginClassification.js";
import { filterOffersByAbc } from "./abcMarginAnalysis.js";
import { buildMarginReport, DEFAULT_MARGIN_THRESHOLDS, filterOffersByStatus } from "./marginEngine.js";

export const EMPTY_MARGIN_FILTERS = Object.freeze({
  comprador: "Todos",
  division: "Todos",
  tipoActividad: "Todos",
  actividad: "",
  tipoPromo: "Todos",
  sku: "",
  estado: "Todos",
  abc: "Todos",
});

/** Consulta bajo demanda y cálculo de márgenes por grupo de oferta. */
export function useMarginReport(connection, ready) {
  const [filters, setFilters] = useState(EMPTY_MARGIN_FILTERS);
  const [lines, setLines] = useState(null);
  const [thresholds, setThresholds] = useState(DEFAULT_MARGIN_THRESHOLDS);
  const [status, setStatus] = useState({ type: "idle", message: "" });
  const requestRef = useRef(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  const updateFilter = useCallback((field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  }, []);

  const consult = useCallback(async () => {
    if (!ready || !connection) {
      setStatus({ type: "error", message: "Se requiere una sesión conectada a la base de datos para consultar márgenes." });
      return;
    }
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setStatus({ type: "loading", message: "Consultando promociones y costos guardados..." });
    try {
      const [settings, result] = await Promise.all([
        loadMarginSettingsFromSupabase(connection).catch(() => null),
        loadMarginLinesFromSupabase(connection, filters, { signal: controller.signal }),
      ]);
      if (controller.signal.aborted) return;
      if (settings?.semaforo) setThresholds(settings.semaforo);
      const classifications = await loadAbcClassificationsFromSupabase(
        connection,
        result.rows.map((row) => row.sku),
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      setLines(attachAbcClassification(result.rows, classifications));
      setStatus(result.truncated
        ? { type: "warning", message: "La consulta superó el máximo de líneas; afine los filtros para ver todo." }
        : { type: "ready", message: "" });
    } catch (error) {
      if (controller.signal.aborted) return;
      setLines(null);
      setStatus({ type: "error", message: error.message || "No se pudo consultar los márgenes." });
    }
  }, [connection, filters, ready]);

  const clear = useCallback(() => {
    requestRef.current?.abort();
    setFilters(EMPTY_MARGIN_FILTERS);
    setLines(null);
    setStatus({ type: "idle", message: "" });
  }, []);

  const report = useMemo(() => (lines ? buildMarginReport(lines, thresholds) : null), [lines, thresholds]);
  const visibleOffers = useMemo(
    () => (report ? filterOffersByAbc(filterOffersByStatus(report.offers, filters.estado), filters.abc) : []),
    [report, filters.estado, filters.abc],
  );

  return { filters, updateFilter, setFilters, consult, clear, report, visibleOffers, status };
}
