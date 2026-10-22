import { useEffect, useRef, useState } from "react";
import { loadFidelizacionSummary } from "../../../services/fidelizacionSummaryService";
import { buildSummary, managuaDate } from "./summaryModel";

export function useSummary({ connection, channel, allowed }) {
  const [state, setState] = useState({});
  const request = useRef(null);
  useEffect(() => {
    // Cambiar contexto invalida la consulta; nunca inicia una carga automática.
    request.current?.abort();
    setState({});
    return () => request.current?.abort();
  }, [connection, channel, allowed]);

  const refresh = async () => {
    if (!allowed) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState({ loading: true, connection, channel });
    try {
      const data = await loadFidelizacionSummary(connection, channel, controller.signal);
      if (controller.signal.aborted) return;
      const now = new Date();
      setState({ summary: buildSummary({ ...data, channel, today: managuaDate(now) }), updatedAt: now.toISOString(), connection, channel });
    } catch (error) {
      if (!controller.signal.aborted) setState({ error: error.message || "No se pudo cargar el resumen.", connection, channel });
    }
  };
  return { state: allowed && state.connection === connection && state.channel === channel ? state : {}, refresh };
}
