import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Search } from "lucide-react";
import { classNames } from "../utils/common";
import { presentLog } from "../features/logs/logPresentation";
import { Button, Card, CardContent, Header } from "./ui";
import "../styles/pages/logs.page.css";

function LogDetail({ cambios }) {
  if (!cambios.length) return <p className="log-detail-empty">Sin campos de negocio para mostrar.</p>;
  const hasBefore = cambios.some((item) => item.antes);
  const hasAfter = cambios.some((item) => item.despues);
  return <table className="log-detail-table"><thead><tr><th>Campo</th>{hasBefore && <th>Antes</th>}{hasAfter && <th>Después</th>}</tr></thead><tbody>{cambios.map((item) => <tr key={item.campo}><td>{item.etiqueta}</td>{hasBefore && <td className="log-before">{item.antes}</td>}{hasAfter && <td className="log-after">{item.despues}</td>}</tr>)}</tbody></table>;
}

export default function LogsPage({ logs, page, pageSize, hasNextPage, status, supabaseReady, onConsult, onPrevious, onNext, onPageSizeChange }) {
  const isLoading = status.type === "loading";
  const [expanded, setExpanded] = useState(() => new Set());
  const rows = useMemo(() => logs.map(presentLog), [logs]);
  const toggle = (id) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return <div><Header title="Logs de cambios" subtitle="Quién hizo qué, cuándo y en qué actividad o SKU."/><Card className="grid-card logs-card"><CardContent><div className="toolbar"><div><h2>Consulta bajo demanda</h2><p>Los logs se descargan solo al presionar consultar.</p></div><div className="toolbar-actions"><select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} disabled={isLoading}><option value={25}>25 filas</option><option value={50}>50 filas</option><option value={100}>100 filas</option></select><Button onClick={() => onConsult(1)} disabled={!supabaseReady || isLoading}><Search size={16}/> {isLoading ? "Consultando..." : "Consultar"}</Button></div></div>{status.message && <div className={classNames("logs-status", status.type === "error" && "error")}>{status.message}</div>}<div className="table-wrap"><table className="logs-table"><thead><tr><th>Fecha</th><th>Usuario</th><th>Módulo</th><th>Actividad</th><th>SKU</th><th>Qué pasó</th><th>Detalle</th></tr></thead><tbody>{rows.map((row) => {
    const isOpen = expanded.has(row.id);
    return <React.Fragment key={row.id}><tr className={classNames(isOpen && "log-row-open")}><td className="log-nowrap">{row.fecha}</td><td><div className="log-primary">{row.usuario.nombre}</div>{row.usuario.rol && <div className="log-secondary">{row.usuario.rol}</div>}</td><td className="log-nowrap">{row.modulo}</td><td><div className="log-primary">{row.actividad || "—"}</div>{row.actividadNombre && <div className="log-secondary">{row.actividadNombre}</div>}</td><td>{row.sku ? <><div className="log-primary">{row.sku}</div>{row.descripcionSku && <div className="log-secondary">{row.descripcionSku}</div>}</> : "—"}</td><td className="log-summary">{row.resumen}</td><td>{row.cambios.length ? <Button variant="outline" className="log-toggle" onClick={() => toggle(row.id)} aria-expanded={isOpen}>{isOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} {isOpen ? "Ocultar" : `Ver (${row.cambios.length})`}</Button> : "—"}</td></tr>{isOpen && <tr className="log-detail-row"><td colSpan={7}><LogDetail cambios={row.cambios}/></td></tr>}</React.Fragment>;
  })}{!rows.length && <tr><td colSpan={7}><div className="empty-state">Presione consultar para cargar los logs.</div></td></tr>}</tbody></table></div><div className="pagination-bar"><Button variant="outline" onClick={onPrevious} disabled={page <= 1 || isLoading}><ChevronLeft size={16}/> Anterior</Button><span>Pagina {page}</span><Button variant="outline" onClick={onNext} disabled={!hasNextPage || isLoading}>Siguiente <ChevronRight size={16}/></Button></div></CardContent></Card></div>;
}
