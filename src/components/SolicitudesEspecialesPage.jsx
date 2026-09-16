import { useSkuLookup } from "../features/skuMaster/SkuLookupContext";
import React, { useMemo, useState } from "react";
import {
  ArrowRight,
  Archive,
  CircleDot,
  Clock3,
  Download,
  Edit3,
  ListChecks,
  Plus,
  Save,
  Search,
  UserCheck,
  Users,
  Percent,
  X,
} from "lucide-react";
import { SPECIAL_REQUEST_ARCHIVED_STATUS, SPECIAL_REQUEST_STATUSES } from "../constants";
import { PERMISSIONS } from "../constants/permissions";
import { usePermissions } from "../hooks/usePermissions";
import { classNames, formatDateTime } from "../utils/common";
import {
  addElapsedHours,
  diffHours,
  formatDurationHours,
  getSpecialRequestStatusKey,
  normalizeActividad,
  normalizeResponsableSolicitud,
  normalizeSpecialRequestStatus,
  numberFromHours,
} from "../utils/promoHelpers";
import PromosPageView from "./PromosPage";
import { Button, Card, CardContent, Header, Metric } from "./ui";
import {
  exportFidelizacionOrce,
  finalizarSolicitudFidelizacion,
  loadSolicitudFidelizacionDetalle,
} from "../services/fidelizacionService";

function getStatusLabel(status) {
  return status;
}

function getStatusBoardLabel(status) {
  if (status === "Aprobado") return "Aprobadas";
  if (status === "Nuevo") return "Nuevas";
  if (status === "Finalizado") return "Finalizadas";
  return status;
}

function normalizeIdList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .join(", ");
}

function formatRequestDateTime(value) {
  return value ? formatDateTime(value) : "Pendiente";
}

export default function SolicitudesEspecialesPage({ actividades = [], setActividades, rows = [], setRows, comentarios = [], setComentarios, compradores = [], jerarquiaCategorias = [], segmentosClientes = [], skuMaster = {}, skuMasterCount = 0, skuMasterStatus = null, onRefreshSkuMaster, onCancelSkuMaster, responsablesSolicitudes = [], setLogs, setActive, onSaveSupabase, supabaseReady, supabaseConnection = null, saveSupabaseStatus, isSyncing, refreshStatus = { type: "idle", message: "" } }) {
  const lookupSkus = useSkuLookup();
  const { can } = usePermissions();
  const canManageRequests = can(PERMISSIONS.MANAGE_SOLICITUDES);
  const canCreateSpecial = can(PERMISSIONS.CREATE_SPECIAL_PROMO);
  const canSyncSupabase = can(PERMISSIONS.SYNC_SUPABASE);
  const [activeTab, setActiveTab] = useState("seguimiento");
  const [search, setSearch] = useState("");
  const [buyerFilter, setBuyerFilter] = useState("Todos");
  const [appliedSearch, setAppliedSearch] = useState(null);
  const [appliedBuyerFilter, setAppliedBuyerFilter] = useState("Todos");
  const [selectedId, setSelectedId] = useState("");
  const [finishModal, setFinishModal] = useState(null);
  const [assignmentError, setAssignmentError] = useState("");

  const responsables = useMemo(() => {
    const seen = new Set();
    return (responsablesSolicitudes || [])
      .map(normalizeResponsableSolicitud)
      .filter((item) => item.activo !== false && item.nombre)
      .filter((item) => {
        const key = item.nombre.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [responsablesSolicitudes]);
  const rowCounts = useMemo(() => rows.reduce((acc, row) => {
    const id = row.actividadId || row.actividad_id || "";
    if (id) acc.set(id, (acc.get(id) || 0) + 1);
    return acc;
  }, new Map()), [rows]);

  const specialRequests = useMemo(() => actividades
    .map(normalizeActividad)
    .filter((item) => (item.tipo_actividad === "ESPECIAL" || String(item.actividad_id || "").startsWith("FID-")) && normalizeSpecialRequestStatus(item.estado) !== SPECIAL_REQUEST_ARCHIVED_STATUS), [actividades]);
  const buyerOptions = useMemo(() => {
    const values = specialRequests.map((item) => item.comprador || item.solicitante).filter(Boolean);
    return ["Todos", ...Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))];
  }, [specialRequests]);
  const filteredRequests = useMemo(() => {
    if (appliedSearch === null) return [];
    const term = appliedSearch.trim().toLowerCase();
    const buyerTerm = appliedBuyerFilter === "Todos" ? "" : appliedBuyerFilter;
    return specialRequests.filter((item) => {
      const buyer = item.comprador || item.solicitante || "";
      const matchesBuyer = !buyerTerm || buyer === buyerTerm;
      const matchesTerm = !term || `${item.actividad_id} ${item.nombre_actividad} ${buyer} ${item.responsable} ${item.canal}`.toLowerCase().includes(term);
      return matchesBuyer && matchesTerm;
    });
  }, [specialRequests, appliedSearch, appliedBuyerFilter]);
  const selected = filteredRequests.find((item) => item.actividad_id === selectedId) || filteredRequests[0] || null;
  const selectedRows = useMemo(() => selected ? rows.filter((row) => (row.actividadId || row.actividad_id || row.catalogo_id || row.catalogoId || "") === selected.actividad_id) : [], [rows, selected]);
  const firstSelectedRow = selectedRows[0] || {};
  const selectedInitialPromoType = firstSelectedRow.tipoPromo || firstSelectedRow.tipo_promo || "Descuento";
  const selectedActivityContext = selected ? {
    actividad_id: selected.actividad_id,
    nombre_actividad: selected.nombre_actividad,
    alcance_tipo: firstSelectedRow.alcanceTipo || firstSelectedRow.alcance_tipo || selected.alcance_tipo || "CANAL",
    alcance_valor: firstSelectedRow.alcanceValor || firstSelectedRow.alcance_valor || selected.alcance_valor || selected.canal || "",
    aplica_segmento: firstSelectedRow.aplicaSegmento || firstSelectedRow.aplica_segmento || selected.aplica_segmento || "NO",
    segmento_cliente: firstSelectedRow.segmentoCliente || firstSelectedRow.segmento_cliente || selected.segmento_cliente || "",
  } : null;

  const applySearch = () => {
    setAppliedSearch(search);
    setAppliedBuyerFilter(buyerFilter);
    setSelectedId("");
    setAssignmentError("");
  };

  const clearSearch = () => {
    setSearch("");
    setBuyerFilter("Todos");
    setAppliedSearch(null);
    setAppliedBuyerFilter("Todos");
    setSelectedId("");
    setAssignmentError("");
  };

  const applyActivityChanges = (activity, changes, action) => {
    const updated = normalizeActividad({ ...activity, ...changes });
    setActividades((prev) => prev.map((item) => {
      const current = normalizeActividad(item);
      return current.actividad_id === updated.actividad_id ? updated : item;
    }));
    setSelectedId(updated.actividad_id);
    if (action) {
      setLogs((prev) => [{
        fecha: new Date().toLocaleString(),
        usuario: updated.responsable || updated.comprador || updated.solicitante || "Seguimiento",
        catalogo: updated.nombre_actividad,
        accion: action,
      }, ...prev]);
    }
  };

  const updateField = (activity, field, value) => {
    if (!activity) return;
    if (field === "responsable") {
      const currentStatus = normalizeSpecialRequestStatus(activity.estado);
      if (value && currentStatus !== "Aprobado" && currentStatus !== "En trabajo") {
        setAssignmentError("Primero debe aprobar la solicitud antes de asignar responsable.");
        return;
      }
      setAssignmentError("");
      const action = value !== activity.responsable ? `Asigno responsable de ${activity.actividad_id}: ${value || "Sin asignar"}` : "";
      if (value && currentStatus === "Aprobado") {
        performStatusChange({ ...activity, responsable: value }, "En trabajo", { responsable: value }, action || `Solicitud ${activity.actividad_id} pasa a En trabajo`);
        return;
      }
      applyActivityChanges(activity, { responsable: value, fecha_modificacion: new Date().toISOString() }, action);
      return;
    }
    const action = field === "nombre_actividad" && value !== activity.nombre_actividad
      ? `Actualizo nombre de solicitud ${activity.actividad_id}: ${value}`
      : "";
    applyActivityChanges(activity, { [field]: value, fecha_modificacion: new Date().toISOString() }, action);
  };

  const performStatusChange = (activity, nextStatus, extraChanges = {}, customAction = "") => {
    if (!activity) return;
    const currentStatus = normalizeSpecialRequestStatus(activity.estado);
    const targetStatus = normalizeSpecialRequestStatus(nextStatus);
    if (currentStatus === targetStatus) return;

    const now = new Date();
    const isoNow = now.toISOString();
    const currentKey = getSpecialRequestStatusKey(currentStatus);
    const targetKey = getSpecialRequestStatusKey(targetStatus);
    const startedAt = activity.fecha_estado || activity[`fecha_${currentKey}`] || activity.fecha_modificacion || activity.fecha_creacion;
    const elapsed = diffHours(startedAt, now);

    applyActivityChanges(activity, {
      estado: targetStatus,
      fecha_modificacion: isoNow,
      fecha_estado: isoNow,
      [`fecha_${targetKey}`]: activity[`fecha_${targetKey}`] || isoNow,
      [`tiempo_${currentKey}_horas`]: addElapsedHours(activity[`tiempo_${currentKey}_horas`], elapsed),
      tiempo_total_horas: addElapsedHours(activity.tiempo_total_horas, elapsed),
      ...extraChanges,
    }, customAction || `Cambio estado de ${activity.actividad_id}: ${currentStatus} -> ${targetStatus}`);
  };

  const requestStatusChange = (activity, nextStatus) => {
    if (!activity) return;
    const currentStatus = normalizeSpecialRequestStatus(activity.estado);
    const targetStatus = normalizeSpecialRequestStatus(nextStatus);
    if (currentStatus === targetStatus) return;

    if (targetStatus === "Finalizado") {
      setFinishModal({
        activity,
        promoIds: activity.promo_ids || "",
        ofertaIds: activity.oferta_ids || "",
        error: "",
      });
      return;
    }

    performStatusChange(activity, targetStatus);
  };

  const archiveRequest = (activity) => {
    if (!activity || normalizeSpecialRequestStatus(activity.estado) !== "Finalizado") return;
    performStatusChange(activity, SPECIAL_REQUEST_ARCHIVED_STATUS, {}, `Archivo solicitud ${activity.actividad_id}`);
  };

  const confirmFinish = async () => {
    if (!finishModal?.activity) return;
    const isFidelizacion = String(finishModal.activity.actividad_id || "").startsWith("FID-") || finishModal.activity.subtipo === "FIDELIZACION";
    const promoIds = normalizeIdList(finishModal.promoIds);
    const ofertaIds = normalizeIdList(finishModal.ofertaIds);
    if (!isFidelizacion && (!promoIds || !ofertaIds)) {
      setFinishModal((current) => ({ ...current, error: "Para finalizar debe ingresar ID de promo e ID de oferta." }));
      return;
    }

    if (isFidelizacion) {
      try {
        await finalizarSolicitudFidelizacion(supabaseConnection, finishModal.activity.actividad_id);
      } catch (err) {
        console.error("Error al finalizar fidelizacion:", err);
      }
    }

    performStatusChange(finishModal.activity, "Finalizado", {
      promo_ids: promoIds || (isFidelizacion ? "ORCE-CARGADO" : ""),
      oferta_ids: ofertaIds || (isFidelizacion ? "ORCE-CARGADO" : ""),
    }, isFidelizacion ? `Finalizó y aplicó descuentos de fidelización para ${finishModal.activity.actividad_id}` : "");
    setFinishModal(null);
  };

  const handleExportOrceFromCanvas = async (activity) => {
    if (!activity) return;
    const id = activity.actividad_id || activity.actividadId;
    try {
      let details = await loadSolicitudFidelizacionDetalle(supabaseConnection, id);
      if (!details || !details.length) {
        alert(`No se encontraron registros de detalle para la solicitud ${id}.`);
        return;
      }
      const masterData = await lookupSkus(details.map((d) => d.sku));
      const enriched = details.map((d) => {
        const sKey = String(d.sku || "").trim().toLowerCase();
        const skuNum = Number(d.sku);
        const master =
          masterData[d.sku] ||
          masterData[sKey] ||
          (!Number.isNaN(skuNum) ? masterData[String(skuNum)] : null) ||
          {};
        return {
          ...d,
          descripcion: d.descripcion || master.descripcion || "",
          division: d.division || master.dep_id || master.division || master.departamento || "",
        };
      });
      await exportFidelizacionOrce(enriched, `ORCE_${id}.xlsx`);
    } catch (e) {
      console.error("Error al exportar ORCE desde canvas:", e);
      alert(`Ocurrió un error al exportar la solicitud ${id}: ${e.message}`);
    }
  };

  const getCurrentElapsed = (activity) => {
    const status = normalizeSpecialRequestStatus(activity.estado);
    if (status === "Finalizado") return 0;
    const key = getSpecialRequestStatusKey(status);
    return diffHours(activity.fecha_estado || activity[`fecha_${key}`] || activity.fecha_creacion);
  };

  const getTotalElapsed = (activity) => numberFromHours(activity.tiempo_total_horas) + getCurrentElapsed(activity);
  const statusTotals = SPECIAL_REQUEST_STATUSES.reduce((acc, status) => {
    acc[status] = specialRequests.filter((item) => normalizeSpecialRequestStatus(item.estado) === status).length;
    return acc;
  }, {});
  const selectedStatus = selected ? normalizeSpecialRequestStatus(selected.estado) : "";
  const saveSupabaseLabel = saveSupabaseStatus === "saving" ? "Guardando..." : saveSupabaseStatus === "error" ? "Reintentar" : saveSupabaseStatus === "success" ? "Guardado" : "Guardar cambios";

  return <div>
    <Header title="Solicitudes especiales" subtitle="Seguimiento operativo de promociones especiales desde solicitud hasta resolucion." />
    {refreshStatus.message && <div className={classNames("status-message", refreshStatus.type === "error" && "error")}>{refreshStatus.message}</div>}
    <div className="special-request-tabs" role="tablist" aria-label="Vista de solicitudes especiales">
      <button type="button" className={activeTab === "seguimiento" ? "selected" : ""} onClick={() => setActiveTab("seguimiento")}><ListChecks size={16}/> Seguimiento</button>
      <button type="button" className={activeTab === "editar" ? "selected" : ""} onClick={() => setActiveTab("editar")}><Edit3 size={16}/> Editar solicitud</button>
    </div>
    {activeTab === "seguimiento" && <div className="special-request-kpis">
      <Metric title="Nuevas" value={statusTotals.Nuevo || 0} icon={CircleDot}/>
      <Metric title="Aprobadas" value={statusTotals.Aprobado || 0} icon={UserCheck}/>
      <Metric title="En trabajo" value={statusTotals["En trabajo"] || 0} icon={Clock3}/>
      <Metric title="Finalizadas" value={statusTotals.Finalizado || 0} icon={ListChecks}/>
    </div>}

    <div className="special-request-top">
      <Card className="special-request-list-card">
        <CardContent>
          <div className="section-head">
            <div><h2>Solicitudes</h2><span>{appliedSearch === null ? "Presione Buscar para cargar" : `${filteredRequests.length} visibles`}</span></div>
            <div className="toolbar-actions">
              <label className="special-request-buyer-filter"><span>Comprador</span><select value={buyerFilter} onChange={(e) => setBuyerFilter(e.target.value)}>{buyerOptions.map((buyer) => <option key={buyer}>{buyer}</option>)}</select></label>
              <div className="search compact"><Search size={16}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar solicitud" /></div>
              <Button variant="outline" onClick={applySearch}><Search size={16}/> Buscar</Button>
              <Button variant="outline" onClick={clearSearch}><X size={16}/> Limpiar</Button>
            </div>
          </div>
          <div className="special-request-list">
            {filteredRequests.map((item) => {
              const status = normalizeSpecialRequestStatus(item.estado);
              const isSelected = selected?.actividad_id === item.actividad_id;
              return <button key={item.actividad_id} className={classNames("special-request-row", isSelected && "selected")} onClick={() => setSelectedId(item.actividad_id)}>
                <div><strong>{item.nombre_actividad || item.actividad_id}</strong><span>{item.actividad_id} · {item.comprador || item.solicitante || "Sin comprador"}</span></div>
                <span className={classNames("status-badge", `status-${getSpecialRequestStatusKey(status)}`)}>{getStatusLabel(status)}</span>
                <small>{rowCounts.get(item.actividad_id) || 0} SKU · {item.canal || "Sin canal"}</small>
              </button>;
            })}
            {appliedSearch === null && <div className="empty-state">Use Buscar para cargar solicitudes especiales.</div>}
            {appliedSearch !== null && !filteredRequests.length && <div className="empty-state">No hay solicitudes especiales con ese filtro.</div>}
          </div>
        </CardContent>
      </Card>

      {activeTab === "seguimiento" ? <Card className="special-request-detail-card">
        <CardContent>
          <div className="section-head">
            <div><h2>{selected ? selected.nombre_actividad : "Detalle"}</h2><span>{selected ? selected.actividad_id : "Seleccione una solicitud"}</span></div>
            <div className="toolbar-actions">
              {selected && (String(selected.actividad_id || "").startsWith("FID-") || selected.subtipo === "FIDELIZACION") && (
                <Button
                  style={{ background: "#006b3f", color: "#fff" }}
                  onClick={() => handleExportOrceFromCanvas(selected)}
                  title="Descargar archivo plano para ORCE"
                >
                  <Download size={15}/> Exportar ORCE
                </Button>
              )}
              {selected && canCreateSpecial && <Button variant="outline" onClick={() => setActive("especial")}><Plus size={16}/> Nueva especial</Button>}
              {canSyncSupabase && <Button onClick={onSaveSupabase} disabled={!supabaseReady || isSyncing}><Save size={16}/> {saveSupabaseLabel}</Button>}
            </div>
          </div>
          {selected ? <div className="special-detail-grid">
            <label className="field"><span>Estado</span><select value={selectedStatus} onChange={(e) => requestStatusChange(selected, e.target.value)} disabled={!canManageRequests}>{SPECIAL_REQUEST_STATUSES.map((status) => <option key={status} value={status}>{getStatusLabel(status)}</option>)}</select></label>
            <label className="field"><span>Responsable</span><select value={selected.responsable || ""} onChange={(e) => updateField(selected, "responsable", e.target.value)} disabled={!canManageRequests}><option value="">Sin asignar</option>{selected.responsable && !responsables.some((item) => item.nombre === selected.responsable) && <option value={selected.responsable}>{selected.responsable} - no esta en catalogo</option>}{responsables.map((item) => <option key={item.responsable_id || item.nombre} value={item.nombre}>{item.area ? `${item.nombre} - ${item.area}` : item.nombre}</option>)}</select></label>
            {assignmentError && <p className="modal-error wide">{assignmentError}</p>}
            <label className="field"><span>Comprador</span><input value={selected.comprador || selected.solicitante || ""} readOnly /></label>
            <label className="field"><span>Canal</span><input value={selected.canal || ""} readOnly /></label>
            <label className="field"><span>Tiempo actual</span><input value={formatDurationHours(getCurrentElapsed(selected))} readOnly /></label>
            <label className="field"><span>Tiempo total</span><input value={formatDurationHours(getTotalElapsed(selected))} readOnly /></label>
            <label className="field"><span>ID promos finalizadas</span><input value={selected.promo_ids || ""} readOnly placeholder="Pendiente" /></label>
            <label className="field"><span>ID ofertas finalizadas</span><input value={selected.oferta_ids || ""} readOnly placeholder="Pendiente" /></label>
            <label className="field wide"><span>Recursos ocupados</span><textarea value={selected.recursos_ocupados || ""} onChange={(e) => updateField(selected, "recursos_ocupados", e.target.value)} placeholder="Ej. pricing, pauta digital, diseno, rotulacion" readOnly={!canManageRequests} /></label>
            <div className="special-timeline wide">{SPECIAL_REQUEST_STATUSES.map((status) => {
              const key = getSpecialRequestStatusKey(status);
              return <div key={status}><span>{getStatusLabel(status)}</span><strong>{formatRequestDateTime(selected[`fecha_${key}`])}</strong><small>{formatDurationHours(selected[`tiempo_${key}_horas`] || 0)}</small></div>;
            })}</div>
          </div> : <div className="empty-state">Seleccione una solicitud para asignar responsable y recursos.</div>}
        </CardContent>
      </Card> : <Card className="special-request-detail-card">
        <CardContent>
          <div className="section-head">
            <div><h2>{selected ? "Editar solicitud" : "Seleccione una solicitud"}</h2><span>{selected ? `${selected.actividad_id} · ${selectedRows.length} SKU` : "Use la lista para abrir la grilla"}</span></div>
            <div className="toolbar-actions">
              {canCreateSpecial && <Button variant="outline" onClick={() => setActive("especial")}><Plus size={16}/> Nueva especial</Button>}
              {canSyncSupabase && <Button onClick={onSaveSupabase} disabled={!supabaseReady || isSyncing}><Save size={16}/> {saveSupabaseLabel}</Button>}
            </div>
          </div>
          {selected ? <div className="special-edit-summary">
            <label className="field"><span>Nombre de solicitud</span><input value={selected.nombre_actividad || ""} onChange={(e) => updateField(selected, "nombre_actividad", e.target.value)} placeholder="Nombre de solicitud especial" /></label>
            <div><strong>{selected.actividad_id}</strong><span>{selected.comprador || selected.solicitante || "Sin comprador"} · {selected.canal || "Sin canal"}</span></div>
            <span className={classNames("status-badge", `status-${getSpecialRequestStatusKey(selectedStatus)}`)}>{getStatusLabel(selectedStatus)}</span>
          </div> : <div className="empty-state">Busque y seleccione una solicitud especial para editar sus SKU.</div>}
        </CardContent>
      </Card>}
    </div>

    {activeTab === "editar" && selected && (String(selected.actividad_id || "").startsWith("FID-") || selected.subtipo === "FIDELIZACION") ? (
      <Card style={{ marginTop: "1rem" }}>
        <CardContent style={{ padding: "2.5rem 1.5rem", textAlign: "center" }}>
          <div style={{ maxWidth: "560px", margin: "0 auto" }}>
            <div style={{ width: "3.5rem", height: "3.5rem", borderRadius: "0.85rem", background: "#e8f5ee", color: "#006b3f", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1rem" }}>
              <Percent size={28} />
            </div>
            <h3 style={{ fontSize: "1.15rem", color: "#0f172a", marginBottom: "0.4rem" }}>Solicitud de Actualización de Fidelización</h3>
            <p style={{ color: "#64748b", fontSize: "0.85rem", lineHeight: "1.4", marginBottom: "1.5rem" }}>
              Esta tarea corresponde a la actualización de descuentos permanentes por segmento ({selected.canal}) para <strong>{selected.actividad_id}</strong>. Los SKUs y descuentos se encuentran almacenados en la tabla de staging y se descargan en formato ORCE desde el módulo de Fidelización.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
              <Button style={{ background: "#006b3f", color: "#fff" }} onClick={() => handleExportOrceFromCanvas(selected)}>
                <Download size={16} /> Descargar Archivo para ORCE
              </Button>
              <Button variant="outline" onClick={() => setActive("fidelizacion")}>
                Abrir Módulo de Fidelización <ArrowRight size={16} />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    ) : activeTab === "editar" && selected ? <div className="special-request-editor">
      <PromosPageView
        key={selected.actividad_id}
        catalogoActivo={{ id: selected.actividad_id, nombre: selected.nombre_actividad, canal: selected.canal }}
        rows={rows}
        setRows={setRows}
        comentarios={comentarios}
        setComentarios={setComentarios}
        compradores={compradores}
        jerarquiaCategorias={jerarquiaCategorias}
        segmentosClientes={segmentosClientes}
        skuMaster={skuMaster}
        skuMasterCount={skuMasterCount}
        setLogs={setLogs}
        skuMasterStatus={skuMasterStatus}
        onRefreshSkuMaster={onRefreshSkuMaster}
        onCancelSkuMaster={onCancelSkuMaster}
        onSaveSupabase={onSaveSupabase}
        supabaseReady={supabaseReady}
        saveSupabaseStatus={saveSupabaseStatus}
        isSyncing={isSyncing}
        activityContext={selectedActivityContext}
        initialComprador={selected.comprador || selected.solicitante || ""}
        lockComprador
        initialTipoPromo={selectedInitialPromoType}
        title="Editar SKU de solicitud"
        subtitle="Corrija descuentos, precios, SKU y comentarios de la solicitud especial seleccionada."
      />
    </div> : activeTab === "editar" ? <div className="empty-state">Use Buscar y seleccione una solicitud para habilitar la edición.</div> : null}

    {activeTab === "seguimiento" && <div className="special-board">
      {SPECIAL_REQUEST_STATUSES.map((status) => {
        const key = getSpecialRequestStatusKey(status);
        const items = filteredRequests.filter((item) => normalizeSpecialRequestStatus(item.estado) === status);
        const nextStatus = SPECIAL_REQUEST_STATUSES[SPECIAL_REQUEST_STATUSES.indexOf(status) + 1];
        return <section key={status} className={classNames("special-board-column", `status-${key}`)}>
          <div className="special-board-head"><strong>{getStatusBoardLabel(status)}</strong><span>{items.length}</span></div>
          <div className="special-board-list">
            {items.map((item) => {
              const isFidelizacion = String(item.actividad_id || "").startsWith("FID-") || item.subtipo === "FIDELIZACION";
              return (
                <article key={item.actividad_id} className={classNames("special-task-card", selected?.actividad_id === item.actividad_id && "selected")} onClick={() => setSelectedId(item.actividad_id)}>
                  <div><strong>{item.nombre_actividad || item.actividad_id}</strong><span>{item.actividad_id}</span></div>
                  <p>{item.motivo_solicitud || "Sin motivo registrado"}</p>
                  <div className="special-task-meta">
                    <span><Users size={13}/>{item.comprador || item.solicitante || "Sin comprador"}</span>
                    <span><UserCheck size={13}/>{item.responsable || "Sin asignar"}</span>
                    <span><Clock3 size={13}/>{formatDurationHours(getTotalElapsed(item))}</span>
                  </div>
                  {isFidelizacion && (
                    <Button
                      variant="outline"
                      className="btn-sm"
                      style={{ marginTop: "0.45rem", width: "100%", justifyContent: "center", borderColor: "#006b3f", color: "#006b3f" }}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleExportOrceFromCanvas(item);
                      }}
                      title="Descargar formato plano para procesar en ORCE"
                    >
                      <Download size={13} /> Exportar ORCE
                    </Button>
                  )}
                  {canManageRequests && nextStatus && <Button variant="outline" onClick={(event) => { event.stopPropagation(); requestStatusChange(item, nextStatus); }}><ArrowRight size={14}/> {getStatusLabel(nextStatus)}</Button>}
                  {canManageRequests && status === "Finalizado" && <Button variant="outline" onClick={(event) => { event.stopPropagation(); archiveRequest(item); }}><Archive size={14}/> Archivar</Button>}
                </article>
              );
            })}
            {!items.length && <div className="special-board-empty">Sin solicitudes</div>}
          </div>
        </section>;
      })}
    </div>}

    {finishModal && <div className="modal-backdrop" role="presentation">
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="finish-special-title">
        <div className="modal-head">
          <div>
            <h2 id="finish-special-title">Finalizar solicitud</h2>
            <p>{finishModal.activity.nombre_actividad || finishModal.activity.actividad_id}</p>
          </div>
          <button type="button" className="icon-btn" onClick={() => setFinishModal(null)}><X size={18}/></button>
        </div>
        <div className="modal-body">
          {String(finishModal.activity.actividad_id || "").startsWith("FID-") || finishModal.activity.subtipo === "FIDELIZACION" ? (
            <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", padding: "0.75rem", borderRadius: "0.5rem", color: "#065f46", fontSize: "0.82rem" }}>
              <strong>Actualización de Fidelización:</strong> Al finalizar esta solicitud, los descuentos solicitados se aplicarán automáticamente a la matriz definitiva del Canasto y los registros quedarán archivados como aplicados.
            </div>
          ) : (
            <p className="modal-note">Para cambiar a Finalizado debe registrar los ID de promos y los ID de oferta. Si hay varios, separelos por coma.</p>
          )}
          <label className="field"><span>ID de promos / ORCE</span><textarea value={finishModal.promoIds} onChange={(e) => setFinishModal((current) => ({ ...current, promoIds: e.target.value, error: "" }))} placeholder="Ej. PROMO-001 o ID ORCE" /></label>
          <label className="field"><span>ID de oferta / ORCE</span><textarea value={finishModal.ofertaIds} onChange={(e) => setFinishModal((current) => ({ ...current, ofertaIds: e.target.value, error: "" }))} placeholder="Ej. OFE-001 o ID ORCE" /></label>
          {finishModal.error && <p className="modal-error">{finishModal.error}</p>}
        </div>
        <div className="modal-actions">
          <Button variant="outline" onClick={() => setFinishModal(null)}>Cancelar</Button>
          <Button onClick={confirmFinish}>Finalizar solicitud</Button>
        </div>
      </div>
    </div>}
  </div>;
}
