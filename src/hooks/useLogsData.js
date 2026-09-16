import { useCallback, useState } from "react";
import { hasSupabaseConnection, loadLogsFromSupabase } from "../services/supabaseService";
import { toAppLog } from "../utils/promoHelpers";

export function useLogsData(supabaseConnection) {
  const [consultedLogs, setConsultedLogs] = useState([]);
  const [logsPage, setLogsPage] = useState(1);
  const [logsPageSize, setLogsPageSize] = useState(25);
  const [logsHasNextPage, setLogsHasNextPage] = useState(false);
  const [logsStatus, setLogsStatus] = useState({ type: "idle", message: "Presione consultar para cargar logs." });

  const resetLogsData = useCallback(() => {
    setConsultedLogs([]);
    setLogsPage(1);
    setLogsPageSize(25);
    setLogsHasNextPage(false);
    setLogsStatus({ type: "idle", message: "Presione consultar para cargar logs." });
  }, []);

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

  return {
    consultedLogs,
    logsPage,
    logsPageSize,
    logsHasNextPage,
    logsStatus,
    onConsultLogs,
    onLogsPageSizeChange,
    resetLogsData,
  };
}
