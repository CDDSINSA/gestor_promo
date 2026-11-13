import React from "react";
import { ROLES, normalizeRole } from "../../../constants/permissions";
import { useSummary } from "./useSummary";
import SummaryView from "./SummaryView";

export default function SummaryPanel({ connection, channel, onReconcile }) {
  const allowed = [ROLES.ADMIN, ROLES.OPER].includes(normalizeRole(connection?.appUser?.rol || connection?.appUser?.role));
  const { state, refresh } = useSummary({ connection, channel, allowed });
  if (!allowed) return null;
  if (state.error) return <div className="fid-summary-state" role="alert"><p>{state.error}</p><button type="button" className="fid-summary-refresh" onClick={refresh}>Reintentar</button></div>;
  if (state.loading) return <div className="fid-summary-state" role="status">Consultando ofertas y segmentos…</div>;
  if (!state.summary) return <section className="fid-summary-state" aria-label="Resumen bajo demanda">
    <h2>Resumen de ofertas · {channel.toUpperCase()}</h2>
    <p>Consulta los datos cuando lo necesites. Este resumen no se actualiza automáticamente.</p>
    <button type="button" className="fid-summary-refresh" onClick={refresh}>Actualizar resumen</button>
  </section>;
  return <SummaryView summary={state.summary} channel={channel} updatedAt={state.updatedAt} onRefresh={refresh} onReconcile={onReconcile} />;
}
