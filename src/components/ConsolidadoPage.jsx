import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Download,
  FileSpreadsheet,
  Home,
  ListChecks,
  MessageSquare,
  Plus,
  Save,
  Search,
  X,
} from "lucide-react";
import { classNames, makeId } from "../utils/common";
import { applyComplexPromoBanding, loadStyledXlsx } from "../services/excelStyleService";
import {
  channelMatchesFilter,
  formatDurationHours,
  getSpecialRequestStatusKey,
  isActivityComment,
  isLineComment,
  isSegmentedRow,
  normalizeActividad,
  normalizeCanal,
  splitChannelValues,
} from "../utils/promoHelpers";
import { CONSOLIDADO_TABLE_HEADERS } from "../constants";
import { PERMISSIONS } from "../constants/permissions";
import { usePermissions } from "../hooks/usePermissions";
import { isComplexPromoType } from "../promoTypes/promoTypeEngine";
import { Button, Card, CardContent, Header, Metric } from "./ui";

const CONSOLIDADO_PAGE_SIZE = 100;

export default function ConsolidadoPage({ rows, actividades = [], catalogos = [], comentarios, setComentarios, compradores, onSaveSupabase, supabaseReady, saveSupabaseStatus, isSyncing }) {
  const { can } = usePermissions();
  const canManageComments = can(PERMISSIONS.MANAGE_MARKETING_COMMENTS);
  const canExport = can(PERMISSIONS.EXPORT_CONSOLIDADO);
  const canSyncSupabase = can(PERMISSIONS.SYNC_SUPABASE);
  const [compradorFiltro, setCompradorFiltro] = useState("Todos");
  const [tipoFiltro, setTipoFiltro] = useState("Todos");
  const [tipoActividadFiltro, setTipoActividadFiltro] = useState("Todos");
  const [canalFiltro, setCanalFiltro] = useState("Todos");
  const [alcanceFiltro, setAlcanceFiltro] = useState("Todos");
  const [estadoComentarioFiltro, setEstadoComentarioFiltro] = useState("Todos");
  const [skuFiltro, setSkuFiltro] = useState("");
  const [actividadCatalogoFiltro, setActividadCatalogoFiltro] = useState("");
  const [activityCatalogOpen, setActivityCatalogOpen] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState(null);
  const [commentDrafts, setCommentDrafts] = useState({});
  const [currentPage, setCurrentPage] = useState(1);

  const activityMap = useMemo(
    () => new Map((actividades || []).map((item) => {
      const activity = normalizeActividad(item);
      return [activity.actividad_id, activity];
    })),
    [actividades],
  );
  const catalogNameById = useMemo(() => new Map((catalogos || []).map((catalogo) => [
    String(catalogo.catalogo_id || catalogo.id || ""),
    catalogo.nombre || catalogo.nombre_actividad || "",
  ])), [catalogos]);

  const activityCatalogOptions = useMemo(() => {
    const optionsById = new Map();
    (actividades || []).forEach((item) => {
      const activity = normalizeActividad(item);
      const id = activity.actividad_id;
      const displayName = activity.nombre_actividad || activity.nombreActividad || activity.nombre || catalogNameById.get(String(id)) || "";
      if (!id || !displayName) return;
      optionsById.set(id, {
        id,
        displayName,
      });
    });
    rows.forEach((row) => {
      const id = row.actividadId || row.actividad_id || row.catalogo_id || "";
      if (!id || optionsById.has(id)) return;
      const activity = activityMap.get(row.actividadId || row.actividad_id) || activityMap.get(row.catalogo_id) || {};
      const displayName = activity.nombre_actividad || activity.nombreActividad || activity.nombre || catalogNameById.get(String(id)) || "";
      if (!displayName) return;
      optionsById.set(id, {
        id,
        displayName,
      });
    });
    return Array.from(optionsById.values()).sort((left, right) => left.displayName.localeCompare(right.displayName));
  }, [actividades, activityMap, catalogNameById, rows]);

  const filteredActivityCatalogOptions = useMemo(() => {
    const term = normalizeCanal(actividadCatalogoFiltro);
    const source = term
      ? activityCatalogOptions.filter((item) => normalizeCanal(item.displayName).includes(term))
      : activityCatalogOptions;
    return source.slice(0, 8);
  }, [actividadCatalogoFiltro, activityCatalogOptions]);

  const getActivityId = (row) => row.actividadId || row.actividad_id || row.catalogo_id || "";
  const getRowId = (row) => row.id || row.row_id || row.rowId || "";
  const getActivity = (row) => activityMap.get(row.actividadId || row.actividad_id) || activityMap.get(row.catalogo_id) || {};
  const getActivityName = (row, activity = getActivity(row)) => {
    const activityId = getActivityId(row);
    return activity.nombre_actividad || activity.nombreActividad || activity.nombre || catalogNameById.get(String(activityId)) || "";
  };
  const getOfferId = (row) => row.ofertaId || row.oferta_id || "";
  const compareText = (left, right) => String(left || "").localeCompare(String(right || ""), "es", { numeric: true, sensitivity: "base" });
  const commentIndexes = useMemo(() => {
    const byRowId = new Map();
    const byActivityId = new Map();
    (comentarios || []).forEach((comment) => {
      if (isLineComment(comment)) {
        const rowId = comment.rowId || comment.row_id || "";
        if (rowId) byRowId.set(rowId, [...(byRowId.get(rowId) || []), comment]);
      }
      if (isActivityComment(comment)) {
        const activityId = comment.actividadId || comment.actividad_id || "";
        if (activityId) byActivityId.set(activityId, [...(byActivityId.get(activityId) || []), comment]);
      }
    });
    return { byRowId, byActivityId };
  }, [comentarios]);
  const getComentariosRow = (rowId) => commentIndexes.byRowId.get(rowId) || [];
  const getActivityComments = (activityId) => commentIndexes.byActivityId.get(activityId) || [];

  const compradoresUnicos = ["Todos", ...Array.from(new Set(rows.map((row) => row.comprador || getActivity(row).comprador || getActivity(row).solicitante || "Sin comprador")))];
  const tiposUnicos = ["Todos", ...Array.from(new Set(rows.map((row) => row.tipoPromo || "Sin tipo")))];
  const tiposActividad = ["Todos", ...Array.from(new Set(rows.map((row) => getActivity(row).tipo_actividad || "CATALOGO")))];
  const canales = ["Todos", ...Array.from(rows.reduce((map, row) => {
    const values = splitChannelValues(getActivity(row).canal);
    if (!values.length) {
      if (!map.has("sin-canal")) map.set("sin-canal", "Sin canal");
      return map;
    }
    values.forEach((item) => {
      const key = normalizeCanal(item);
      if (key && !map.has(key)) map.set(key, item);
    });
    return map;
  }, new Map()).values())];
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
    setCurrentPage(1);
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
    setCurrentPage(1);
  };

  const rowsFiltradas = appliedFilters ? rows.filter((row) => {
    const activity = getActivity(row);
    const comentariosRow = getComentariosRow(getRowId(row));
    const comentariosActividad = getActivityComments(getActivityId(row));
    const comentariosTotales = [...comentariosRow, ...comentariosActividad];
    const tieneAbierto = comentariosTotales.some((c) => String(c.estado).toLowerCase() === "abierto");
    const tieneResuelto = comentariosTotales.some((c) => String(c.estado).toLowerCase() === "resuelto");
    const compradorRow = row.comprador || activity.comprador || activity.solicitante || "Sin comprador";
    const tipoActividad = activity.tipo_actividad || "CATALOGO";
    const activityId = getActivityId(row);
    const activityName = getActivityName(row, activity);
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
      && (appliedFilters.canal === "Todos"
        || (canal === "Sin canal" ? appliedFilters.canal === "Sin canal" : channelMatchesFilter(canal, appliedFilters.canal)))
      && (appliedFilters.alcance === "Todos" || alcance === appliedFilters.alcance)
      && (appliedFilters.estadoComentario === "Todos"
        || (appliedFilters.estadoComentario === "Abiertos" && tieneAbierto)
        || (appliedFilters.estadoComentario === "Resueltos" && tieneResuelto)
        || (appliedFilters.estadoComentario === "Sin comentarios" && comentariosTotales.length === 0));
  }).sort((left, right) => {
    const leftActivity = getActivity(left);
    const rightActivity = getActivity(right);
    const leftActivityLabel = getActivityName(left, leftActivity) || getActivityId(left);
    const rightActivityLabel = getActivityName(right, rightActivity) || getActivityId(right);
    return compareText(leftActivityLabel, rightActivityLabel)
      || compareText(getOfferId(left), getOfferId(right))
      || compareText(left.sku, right.sku)
      || compareText(left.id || left.row_id || left.rowId, right.id || right.row_id || right.rowId);
  }) : [];

  const totalPages = Math.max(1, Math.ceil(rowsFiltradas.length / CONSOLIDADO_PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedRows = rowsFiltradas.slice((safeCurrentPage - 1) * CONSOLIDADO_PAGE_SIZE, safeCurrentPage * CONSOLIDADO_PAGE_SIZE);
  const visibleActivityIds = new Set(rowsFiltradas.map(getActivityId).filter(Boolean));
  const saveSupabaseLabel = saveSupabaseStatus === "saving" ? "Guardando..." : saveSupabaseStatus === "error" ? "Reintentar" : saveSupabaseStatus === "success" ? "Guardado" : "Guardar Supabase";
  const generalComments = appliedFilters
    ? comentarios.filter((comment) => isActivityComment(comment) && visibleActivityIds.has(comment.actividadId || comment.actividad_id))
    : [];

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

  const exportColumns = [
    ["Nombre actividad", (row, activity) => getActivityName(row, activity)],
    ["Oferta ID", (row) => getOfferId(row)],
    ["Alcance", (row) => row.alcanceTipo || row.alcance_tipo || ""],
    ["Valor alcance", (row) => row.alcanceValor || row.alcance_valor || ""],
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
    ["Comentarios linea", (row) => getComentariosRow(getRowId(row)).map((c) => `${c.estado}: ${c.texto || c.comentario}`).join(" | ")],
  ];

  const exportXlsx = async () => {
    const XLSX = await loadStyledXlsx();
    const sheetRows = [
      exportColumns.map(([label]) => label),
      ...rowsFiltradas.map((row) => {
        const activity = getActivity(row);
        return exportColumns.map(([, getter]) => getter(row, activity));
      }),
    ];

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
    applyComplexPromoBanding(XLSX, worksheet, rowsFiltradas, exportColumns.length);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Consolidado");
    XLSX.writeFile(workbook, `consolidado_promociones_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
                  {canExport && <Button variant="outline" onClick={exportXlsx} disabled={!rowsFiltradas.length}><Download size={16}/> Exportar XLSX</Button>}
                  {canManageComments && canSyncSupabase && <Button onClick={onSaveSupabase} disabled={!supabaseReady || isSyncing}><Save size={16}/> {saveSupabaseLabel}</Button>}
                </div>
              </div>
              <div className="filter-grid">
                <label className="filter-field"><span>SKU</span><input value={skuFiltro} onChange={(e) => setSkuFiltro(e.target.value)} placeholder="Buscar SKU" /></label>
                <label className="filter-field activity-combobox"><span>Actividad / catálogo</span><input value={actividadCatalogoFiltro} onFocus={() => setActivityCatalogOpen(true)} onBlur={() => window.setTimeout(() => setActivityCatalogOpen(false), 120)} onChange={(e) => { setActividadCatalogoFiltro(e.target.value); setActivityCatalogOpen(true); }} placeholder="Nombre de actividad o catálogo" autoComplete="off" />{activityCatalogOpen && filteredActivityCatalogOptions.length > 0 && <div className="activity-combobox-list" role="listbox">{filteredActivityCatalogOptions.map((item) => <button key={item.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setActividadCatalogoFiltro(item.displayName); setActivityCatalogOpen(false); }} role="option">{item.displayName}</button>)}</div>}</label>
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
                  {paginatedRows.map((row) => {
                    const activity = getActivity(row);
                    const activityId = getActivityId(row);
                    const comentariosActividad = getActivityComments(activityId);
                    const comentariosRow = getComentariosRow(getRowId(row));
                    const comentariosTotales = [...comentariosRow, ...comentariosActividad];
                    const abiertos = comentariosTotales.filter((c) => String(c.estado).toLowerCase() === "abierto").length;
                    const segmenta = isSegmentedRow(row) ? "SI" : "NO";
                    const segmentoCliente = row.segmentoCliente || row.segmento_cliente || (segmenta === "SI" ? row.segmento : "");
                    const activityName = getActivityName(row, activity);
                    return (
                      <tr key={row.id} className={abiertos ? "row-warning" : ""}>
                        <td><b>{activityId}</b>{comentariosActividad.length > 0 && <small className="activity-comment-badge">{comentariosActividad.length} general</small>}</td>
                        <td>{activityName || "Sin nombre"}</td>
                        <td>{getOfferId(row)}</td>
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
                                    {canManageComments && <button onClick={() => toggleComentario(c.id || c.comentario_id)}>{abierto ? "Marcar resuelto" : "Reabrir"}</button>}
                                  </div>
                                  <p>{c.texto || c.comentario}</p>
                                  <small>{c.usuario} · {c.fecha}</small>
                                </div>
                              );
                            })}
                            {canManageComments && <div className="comment-input">
                              <input placeholder="Agregar duda o solicitud" value={commentDrafts[row.id] || ""} onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))}/>
                              <Button variant="outline" onClick={() => agregarComentario(row.id)}><Plus size={14}/></Button>
                            </div>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {appliedFilters && rowsFiltradas.length > CONSOLIDADO_PAGE_SIZE && <div className="pagination-bar"><Button variant="outline" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={safeCurrentPage <= 1}>Anterior</Button><span>Pagina {safeCurrentPage} de {totalPages} · {rowsFiltradas.length} filas filtradas</span><Button variant="outline" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={safeCurrentPage >= totalPages}>Siguiente</Button></div>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
