import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Download,
  FileSpreadsheet,
  Home,
  ListChecks,
  MessageSquare,
  Plus,
  Search,
  X,
} from "lucide-react";
import { classNames, makeId } from "../utils/common";
import {
  formatDurationHours,
  getSpecialRequestStatusKey,
  isActivityComment,
  isLineComment,
  isSegmentedRow,
  normalizeActividad,
} from "../utils/promoHelpers";
import { CONSOLIDADO_TABLE_HEADERS } from "../constants";
import { isComplexPromoType } from "../promoTypes/promoTypeEngine";

function Header({ title, subtitle }) {
  return (
    <div className="header">
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  );
}

function Button({ children, className = "", variant = "default", ...props }) {
  return <button className={classNames("btn", variant === "outline" ? "btn-outline" : "btn-primary", className)} {...props}>{children}</button>;
}

function Card({ children, className = "" }) {
  return <div className={classNames("card", className)}>{children}</div>;
}

function CardContent({ children, className = "" }) {
  return <div className={className}>{children}</div>;
}

function Metric({ title, value, icon: Icon }) {
  return <Card><CardContent className="metric"><div><p>{title}</p><strong>{value}</strong></div><div className="metric-icon"><Icon size={20}/></div></CardContent></Card>;
}

export default function ConsolidadoPage({ rows, actividades = [], comentarios, setComentarios, compradores }) {
  const [compradorFiltro, setCompradorFiltro] = useState("Todos");
  const [tipoFiltro, setTipoFiltro] = useState("Todos");
  const [tipoActividadFiltro, setTipoActividadFiltro] = useState("Todos");
  const [canalFiltro, setCanalFiltro] = useState("Todos");
  const [alcanceFiltro, setAlcanceFiltro] = useState("Todos");
  const [estadoComentarioFiltro, setEstadoComentarioFiltro] = useState("Todos");
  const [skuFiltro, setSkuFiltro] = useState("");
  const [actividadCatalogoFiltro, setActividadCatalogoFiltro] = useState("");
  const [appliedFilters, setAppliedFilters] = useState(null);
  const [commentDrafts, setCommentDrafts] = useState({});

  const activityMap = useMemo(
    () => new Map((actividades || []).map((item) => {
      const activity = normalizeActividad(item);
      return [activity.actividad_id, activity];
    })),
    [actividades],
  );

  const getActivityId = (row) => row.actividadId || row.actividad_id || row.catalogo_id || "";
  const getActivity = (row) => activityMap.get(row.actividadId || row.actividad_id) || activityMap.get(row.catalogo_id) || {};
  const getComentariosRow = (rowId) => comentarios.filter((c) => isLineComment(c) && (c.rowId || c.row_id) === rowId);
  const getActivityComments = (activityId) => comentarios.filter((c) => isActivityComment(c) && (c.actividadId || c.actividad_id) === activityId);
  const generalComments = comentarios.filter(isActivityComment);

  const compradoresUnicos = ["Todos", ...Array.from(new Set(rows.map((row) => row.comprador || getActivity(row).comprador || getActivity(row).solicitante || "Sin comprador")))];
  const tiposUnicos = ["Todos", ...Array.from(new Set(rows.map((row) => row.tipoPromo || "Sin tipo")))];
  const tiposActividad = ["Todos", ...Array.from(new Set(rows.map((row) => getActivity(row).tipo_actividad || "CATALOGO")))];
  const canales = ["Todos", ...Array.from(new Set(rows.map((row) => getActivity(row).canal || "Sin canal")))];
  const alcances = ["Todos", ...Array.from(new Set(rows.map((row) => row.alcanceTipo || row.alcance_tipo || "Sin alcance")))];

  const applyFilters = () => {
    setAppliedFilters({
      comprador: compradorFiltro,
      tipo: tipoFiltro,
      tipoActividad: tipoActividadFiltro,
      canal: canalFiltro,
      alcance: alcanceFiltro,
      estadoComentario: estadoComentarioFiltro,
      sku: skuFiltro,
      actividadCatalogo: actividadCatalogoFiltro,
    });
  };

  const clearFilters = () => {
    setCompradorFiltro("Todos");
    setTipoFiltro("Todos");
    setTipoActividadFiltro("Todos");
    setCanalFiltro("Todos");
    setAlcanceFiltro("Todos");
    setEstadoComentarioFiltro("Todos");
    setSkuFiltro("");
    setActividadCatalogoFiltro("");
    setAppliedFilters(null);
  };

  const rowsFiltradas = appliedFilters ? rows.filter((row) => {
    const activity = getActivity(row);
    const comentariosRow = getComentariosRow(row.id);
    const comentariosActividad = getActivityComments(getActivityId(row));
    const comentariosTotales = [...comentariosRow, ...comentariosActividad];
    const tieneAbierto = comentariosTotales.some((c) => String(c.estado).toLowerCase() === "abierto");
    const tieneResuelto = comentariosTotales.some((c) => String(c.estado).toLowerCase() === "resuelto");
    const compradorRow = row.comprador || activity.comprador || activity.solicitante || "Sin comprador";
    const tipoActividad = activity.tipo_actividad || "CATALOGO";
    const activityId = getActivityId(row);
    const activityName = activity.nombre_actividad || activity.nombreActividad || activity.nombre || "";
    const canal = activity.canal || "Sin canal";
    const alcance = row.alcanceTipo || row.alcance_tipo || "Sin alcance";
    const skuTerm = appliedFilters.sku.trim().toLowerCase();
    const activityTerm = appliedFilters.actividadCatalogo.trim().toLowerCase();
    const matchesSku = !skuTerm || String(row.sku || "").toLowerCase().includes(skuTerm);
    const matchesActivity = !activityTerm || `${activityId} ${activityName}`.toLowerCase().includes(activityTerm);
    return matchesSku
      && matchesActivity
      && (appliedFilters.comprador === "Todos" || compradorRow === appliedFilters.comprador)
      && (appliedFilters.tipo === "Todos" || (row.tipoPromo || "Sin tipo") === appliedFilters.tipo)
      && (appliedFilters.tipoActividad === "Todos" || tipoActividad === appliedFilters.tipoActividad)
      && (appliedFilters.canal === "Todos" || canal === appliedFilters.canal)
      && (appliedFilters.alcance === "Todos" || alcance === appliedFilters.alcance)
      && (appliedFilters.estadoComentario === "Todos"
        || (appliedFilters.estadoComentario === "Abiertos" && tieneAbierto)
        || (appliedFilters.estadoComentario === "Resueltos" && tieneResuelto)
        || (appliedFilters.estadoComentario === "Sin comentarios" && comentariosTotales.length === 0));
  }) : [];

  const resumenComprador = compradores
    .map((buyer) => {
      const nombre = buyer.comprador || buyer.nombre;
      const buyerRows = rowsFiltradas.filter((row) => (row.comprador || getActivity(row).comprador || getActivity(row).solicitante || "Sin comprador") === nombre);
      return { nombre, division: buyer.division, total: buyerRows.length, complejas: buyerRows.filter((row) => isComplexPromoType(row.tipoPromo)).length };
    })
    .filter((item) => item.total > 0);

  const agregarComentario = (rowId) => {
    const texto = String(commentDrafts[rowId] || "").trim();
    if (!texto) return;
    const row = rows.find((item) => item.id === rowId || item.row_id === rowId);
    const id = makeId("CMT");
    setComentarios((prev) => [{ id, comentario_id: id, actividadId: row?.actividadId || row?.actividad_id || "", actividad_id: row?.actividad_id || row?.actividadId || "", rowId, row_id: rowId, alcanceComentario: "LINEA", alcance_comentario: "LINEA", usuario: "Diseño Mercadeo", tipo_usuario: "Mercadeo", texto, comentario: texto, estado: "Abierto", fecha: new Date().toLocaleString(), prioridad: "MEDIA" }, ...prev]);
    setCommentDrafts((prev) => ({ ...prev, [rowId]: "" }));
  };

  const toggleComentario = (id) => setComentarios((prev) => prev.map((c) => ((c.id || c.comentario_id) === id ? { ...c, estado: String(c.estado).toLowerCase() === "abierto" ? "Resuelto" : "Abierto" } : c)));

  const csvColumns = [
    ["Actividad", (row, activity) => row.actividadId || row.actividad_id || row.catalogo_id],
    ["Oferta ID", (row) => row.ofertaId || row.oferta_id || ""],
    ["Tipo actividad", (row, activity) => activity.tipo_actividad || "CATALOGO"],
    ["Canal", (row, activity) => activity.canal || ""],
    ["Alcance", (row) => row.alcanceTipo || row.alcance_tipo || ""],
    ["Valor alcance", (row) => row.alcanceValor || row.alcance_valor || ""],
    ["Segmenta", (row) => isSegmentedRow(row) ? "SI" : "NO"],
    ["Segmento cliente", (row) => row.segmentoCliente || row.segmento_cliente || (isSegmentedRow(row) ? row.segmento : "")],
    ["Comprador", (row) => row.comprador || ""],
    ["Tipo promo", (row) => row.tipoPromo || ""],
    ["Oferta", (row) => row.grupoOferta || ""],
    ["Rol", (row) => row.tipoSku || ""],
    ["Variante", (row) => row.variante || ""],
    ["SKU", (row) => row.sku || ""],
    ["Descripcion", (row) => row.descripcion || ""],
    ["Cantidad", (row) => row.cantidadMinima || ""],
    ["Precio ahora", (row) => row.precioAhora || ""],
    ["Descuento", (row) => row.descuento || ""],
    ["Comentarios actividad", (row) => getActivityComments(getActivityId(row)).map((c) => `${c.estado}: ${c.texto || c.comentario}`).join(" | ")],
    ["Comentarios linea", (row) => getComentariosRow(row.id).map((c) => `${c.estado}: ${c.texto || c.comentario}`).join(" | ")],
  ];

  const escapeCsv = (value) => {
    const text = String(value ?? "").replace(/\r?\n/g, " ");
    return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const exportCsv = () => {
    const lines = [
      csvColumns.map(([label]) => escapeCsv(label)).join(";"),
      ...rowsFiltradas.map((row) => {
        const activity = getActivity(row);
        return csvColumns.map(([, getter]) => escapeCsv(getter(row, activity))).join(";");
      }),
    ];
    const blob = new Blob([`\ufeff${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `consolidado_promociones_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const generalCommentsPanel = appliedFilters && generalComments.length ? (
    <Card className="activity-comments-card">
      <CardContent>
        <div className="section-head">
          <div><h2>Comentarios generales</h2><span>{generalComments.length} comentario(s)</span></div>
        </div>
        <div className="activity-comments-list">
          {generalComments.map((item) => {
            const activityId = item.actividadId || item.actividad_id;
            const activity = activityMap.get(activityId) || {};
            const abierto = String(item.estado).toLowerCase() === "abierto";
            return (
              <div key={item.id || item.comentario_id} className="activity-comment-item">
                <div><strong>{activity.nombre_actividad || activityId}</strong><span className={abierto ? "pill yellow" : "pill green"}>{item.estado}</span></div>
                <p>{item.texto || item.comentario}</p>
                <small>{item.usuario} · {item.fecha}</small>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  ) : null;

  return (
    <div>
      <Header title="Consolidado" subtitle="Vista unificada de promociones registradas por actividad comercial." />
      <div className="metrics four">
        <Metric title="Total promociones" value={rows.length} icon={ListChecks}/>
        <Metric title="Actividades" value={actividades.length} icon={Home}/>
        <Metric title="Tipos de promo" value={tiposUnicos.length - 1} icon={FileSpreadsheet}/>
        <Metric title="Total comentarios" value={comentarios.length} icon={MessageSquare}/>
      </div>
      <div className="consolidado-layout">
        <div className="consolidado-top">
          <Card className="consolidado-summary-card">
            <CardContent>
              <div className="section-head"><h2>Resumen por comprador</h2><span>{appliedFilters ? `${resumenComprador.length} compradores` : "Presione Buscar"}</span></div>
              <div className="summary-list compact">{resumenComprador.map((item) => <div key={item.nombre}><strong>{item.nombre}</strong><span>{item.division}</span><p><b>{item.total}</b> filas · {item.complejas} complejas</p></div>)}</div>
            </CardContent>
          </Card>
          <Card className="consolidado-filter-card">
            <CardContent>
              <div className="section-head">
                <div><h2>Filtros</h2><span>{appliedFilters ? `${rowsFiltradas.length} filas visibles` : "Presione Buscar para cargar"}</span></div>
                <div className="toolbar-actions">
                  <Button variant="outline" onClick={applyFilters}><Search size={16}/> Buscar</Button>
                  <Button variant="outline" onClick={clearFilters}><X size={16}/> Limpiar</Button>
                  <Button variant="outline" onClick={exportCsv} disabled={!rowsFiltradas.length}><Download size={16}/> Exportar CSV</Button>
                </div>
              </div>
              <div className="filter-grid">
                <label className="filter-field"><span>SKU</span><input value={skuFiltro} onChange={(e) => setSkuFiltro(e.target.value)} placeholder="Buscar SKU" /></label>
                <label className="filter-field"><span>Actividad / catálogo</span><input value={actividadCatalogoFiltro} onChange={(e) => setActividadCatalogoFiltro(e.target.value)} placeholder="ID o nombre" /></label>
                <label className="filter-field"><span>Comprador</span><select value={compradorFiltro} onChange={(e) => setCompradorFiltro(e.target.value)}>{compradoresUnicos.map((item) => <option key={item}>{item}</option>)}</select></label>
                <label className="filter-field"><span>Tipo actividad</span><select value={tipoActividadFiltro} onChange={(e) => setTipoActividadFiltro(e.target.value)}>{tiposActividad.map((item) => <option key={item}>{item}</option>)}</select></label>
                <label className="filter-field"><span>Canal</span><select value={canalFiltro} onChange={(e) => setCanalFiltro(e.target.value)}>{canales.map((item) => <option key={item}>{item}</option>)}</select></label>
                <label className="filter-field"><span>Alcance</span><select value={alcanceFiltro} onChange={(e) => setAlcanceFiltro(e.target.value)}>{alcances.map((item) => <option key={item}>{item}</option>)}</select></label>
                <label className="filter-field"><span>Tipo promo</span><select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)}>{tiposUnicos.map((item) => <option key={item}>{item}</option>)}</select></label>
                <label className="filter-field"><span>Comentarios</span><select value={estadoComentarioFiltro} onChange={(e) => setEstadoComentarioFiltro(e.target.value)}><option>Todos</option><option>Abiertos</option><option>Resueltos</option><option>Sin comentarios</option></select></label>
              </div>
            </CardContent>
          </Card>
        </div>
        {generalCommentsPanel}
        <Card className="grid-card consolidado-grid">
          <CardContent>
            <div className="toolbar"><div><h2>Base consolidada</h2><p>Incluye catálogos planificados y promociones especiales.</p></div></div>
            <div className="table-wrap">
              <table>
                <thead><tr>{CONSOLIDADO_TABLE_HEADERS.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {!appliedFilters && <tr><td colSpan={CONSOLIDADO_TABLE_HEADERS.length}><div className="empty-state">Use Buscar para cargar el consolidado.</div></td></tr>}
                  {appliedFilters && !rowsFiltradas.length && <tr><td colSpan={CONSOLIDADO_TABLE_HEADERS.length}><div className="empty-state">No hay promociones con esos filtros.</div></td></tr>}
                  {rowsFiltradas.map((row) => {
                    const activity = getActivity(row);
                    const activityId = getActivityId(row);
                    const comentariosActividad = getActivityComments(activityId);
                    const comentariosRow = getComentariosRow(row.id);
                    const comentariosTotales = [...comentariosRow, ...comentariosActividad];
                    const abiertos = comentariosTotales.filter((c) => String(c.estado).toLowerCase() === "abierto").length;
                    const segmenta = isSegmentedRow(row) ? "SI" : "NO";
                    const segmentoCliente = row.segmentoCliente || row.segmento_cliente || (segmenta === "SI" ? row.segmento : "");
                    return (
                      <tr key={row.id} className={abiertos ? "row-warning" : ""}>
                        <td><b>{activityId}</b>{comentariosActividad.length > 0 && <small className="activity-comment-badge">{comentariosActividad.length} general</small>}</td>
                        <td>{row.ofertaId || row.oferta_id || ""}</td>
                        <td><span className={activity.tipo_actividad === "ESPECIAL" ? "pill yellow" : "pill green"}>{activity.tipo_actividad || "CATALOGO"}</span></td>
                        <td>{activity.canal || ""}</td>
                        <td>{row.alcanceTipo || row.alcance_tipo || ""}</td>
                        <td>{row.alcanceValor || row.alcance_valor || ""}</td>
                        <td>{segmenta}</td>
                        <td>{segmentoCliente}</td>
                        <td>{row.comprador}</td>
                        <td>{row.tipoPromo}</td>
                        <td>{row.grupoOferta}</td>
                        <td>{row.tipoSku}</td>
                        <td>{row.variante || ""}</td>
                        <td><b>{row.sku}</b></td>
                        <td>{row.descripcion}</td>
                        <td>{row.cantidadMinima}</td>
                        <td>{row.precioAhora}</td>
                        <td>{row.descuento}</td>
                        <td>
                          <div className="comments-cell">
                            {comentariosRow.map((c) => {
                              const abierto = String(c.estado).toLowerCase() === "abierto";
                              const prioridad = String(c.prioridad || "media").toLowerCase();
                              return (
                                <div key={c.id || c.comentario_id} className={classNames("comment", abierto ? `priority-${prioridad}` : "resolved")}>
                                  <div>
                                    <span className={abierto ? "pill yellow" : "pill green"}>{abierto ? <AlertTriangle size={12}/> : <MessageSquare size={12}/>} {c.estado}</span>
                                    <button onClick={() => toggleComentario(c.id || c.comentario_id)}>{abierto ? "Marcar resuelto" : "Reabrir"}</button>
                                  </div>
                                  <p>{c.texto || c.comentario}</p>
                                  <small>{c.usuario} · {c.fecha}</small>
                                </div>
                              );
                            })}
                            <div className="comment-input">
                              <input placeholder="Agregar duda o solicitud" value={commentDrafts[row.id] || ""} onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))}/>
                              <Button variant="outline" onClick={() => agregarComentario(row.id)}><Plus size={14}/></Button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
