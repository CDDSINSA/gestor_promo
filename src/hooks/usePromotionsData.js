import { useCallback, useState } from "react";
import { comentariosIniciales, rowsIniciales } from "../constants";
import { makeId } from "../utils/common";
import { toAppRow } from "../utils/promoHelpers";

function ensureLogIds(rows = []) {
  return (rows || []).map((row) => {
    if (row?.log_id || row?.id) return row;
    return { ...row, log_id: makeId("LOG") };
  });
}

export function usePromotionsData({ useDemoData = false } = {}) {
  const [rows, setRows] = useState(() => useDemoData ? rowsIniciales.map(toAppRow) : []);
  const [avanceCatalogos, setAvanceCatalogos] = useState({});
  const [promocionesDetalle, setPromocionesDetalle] = useState([]);
  const [comentarios, setComentarios] = useState(() => useDemoData ? comentariosIniciales : []);
  const [logs, setLogsState] = useState([]);

  const setLogs = useCallback((updater) => {
    setLogsState((currentLogs) => ensureLogIds(typeof updater === "function" ? updater(currentLogs) : updater));
  }, []);

  const resetPromotionsData = useCallback(() => {
    setRows(useDemoData ? rowsIniciales.map(toAppRow) : []);
    setAvanceCatalogos({});
    setPromocionesDetalle([]);
    setComentarios(useDemoData ? comentariosIniciales : []);
    setLogsState([]);
  }, [useDemoData]);

  return {
    rows,
    setRows,
    avanceCatalogos,
    setAvanceCatalogos,
    promocionesDetalle,
    setPromocionesDetalle,
    comentarios,
    setComentarios,
    logs,
    setLogs,
    resetPromotionsData,
  };
}
