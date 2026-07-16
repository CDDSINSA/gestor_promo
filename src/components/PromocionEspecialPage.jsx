import React, { useState } from "react";
import { Save, Plus } from "lucide-react";
import { allPromoTypes as todosTipos } from "../promoTypes/promoTypeEngine";
import { ALCANCE_TYPES } from "../constants";
import {
  getSegmentosByCanal,
  normalizeActividad,
  createSpecialActivityId,
  formatDateKey,
} from "../utils/promoHelpers";
import PromosPageView from "./PromosPage";
import { Button, Card, CardContent, Header } from "./ui";

const SPECIAL_CHANNEL_OPTIONS = ["Retail", "Comasa", "Galerón", "Ferrex"];
const SPECIAL_REQUEST_REASONS = [
  "Liquidación",
  "Productos proximo a vencer",
  "Ofertas de emergencia",
  "Respuesta competencia",
  "Inventario duro/lento",
  "Introducción",
  "Incentivar venta",
  "Negociación Proveedor",
  "otros",
];

function normalizeChannelLabel(value) {
  return String(value || "").trim().toLowerCase() === "galeron" ? "Galerón" : String(value || "").trim();
}

function splitMultiValue(value) {
  return String(value || "")
    .split(/[;|,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinMultiValue(values) {
  return Array.from(new Set((values || []).map((item) => String(item || "").trim()).filter(Boolean))).join("; ");
}

function parseReasonState(value) {
  const selections = [];
  let otherText = "";
  splitMultiValue(value).forEach((item) => {
    const lower = item.toLowerCase();
    if (lower.startsWith("otros:")) {
      selections.push("otros");
      otherText = item.slice(item.indexOf(":") + 1).trim();
      return;
    }
    selections.push(item);
  });
  return { selections: Array.from(new Set(selections)), otherText };
}

function buildReasonValue(selections, otherText) {
  return joinMultiValue((selections || []).flatMap((item) => {
    if (item !== "otros") return item;
    const text = String(otherText || "").trim();
    return text ? `otros: ${text}` : "otros";
  }));
}

function Field({ label, value, onChange, type = "text", ...props }) { return <label className="field"><span>{label}</span><input type={type} value={value || ""} onChange={(e) => onChange(e.target.value)} {...props} /></label>; }

export default function PromocionEspecialPage({
  actividades,
  setActividades,
  rows,
  setRows,
  comentarios,
  setComentarios,
  compradores,
  jerarquiaCategorias = [],
  segmentosClientes,
  skuMaster,
  setLogs,
  onLoadSkuMaster,
  skuMasterFileInputRef,
  archivoComprador,
  onSaveSupabase,
  supabaseReady,
  onResolveSpecialActivityIds,
  saveSupabaseStatus,
  isSyncing,
  catalogos,
}) {
  const today = new Date().toISOString().slice(0, 10);
  const canalOptions = Array.from(new Set([...(catalogos || []).map((cat) => normalizeChannelLabel(cat.canal)).filter(Boolean), ...SPECIAL_CHANNEL_OPTIONS]));
  const buyerList = compradores.filter((c) => c.activo !== false).map((c) => c.comprador || c.nombre).filter(Boolean);
  const defaultCanal = canalOptions[0] || "Retail";
  const [currentActivity, setCurrentActivity] = useState(null);
  const [isCreatingActivity, setIsCreatingActivity] = useState(false);
  const [activityCreateError, setActivityCreateError] = useState("");
  const [draft, setDraft] = useState({
    comprador: "",
    nombre_actividad: "",
    canal: defaultCanal,
    fecha_inicio: today,
    fecha_fin: today,
    alcance_tipo: "CANAL",
    alcance_valor: defaultCanal,
    aplica_segmento: "NO",
    segmento_cliente: "",
    motivo_solicitud: "",
    tipo_promo: "Descuento",
  });
  const selectedChannels = splitMultiValue(draft.canal);
  const { selections: selectedReasons, otherText: otherReasonText } = parseReasonState(draft.motivo_solicitud);
  const segmentOptions = getSegmentosByCanal(segmentosClientes, draft.canal);
  const alcanceValorLabel = { CANAL: "Canal", SEGMENTO: "Segmento", TIENDA: "Tienda", MULTI_TIENDA: "Tiendas" }[draft.alcance_tipo] || "Alcance";

  const updateDraft = (field, value) => {
    setDraft((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "canal" && next.alcance_tipo === "CANAL") next.alcance_valor = value;
      if (field === "alcance_tipo") {
        if (value === "CANAL") {
          next.alcance_valor = next.canal;
          next.aplica_segmento = "NO";
          next.segmento_cliente = "";
        }
        if (value === "SEGMENTO") {
          next.aplica_segmento = "SI";
          next.segmento_cliente = next.alcance_valor || "";
        }
        if (value !== "SEGMENTO" && value !== "CANAL") {
          next.alcance_valor = "";
          next.aplica_segmento = "NO";
          next.segmento_cliente = "";
        }
      }
      if (field === "alcance_valor" && next.alcance_tipo === "SEGMENTO") {
        next.aplica_segmento = "SI";
        next.segmento_cliente = value;
      }
      if (field === "aplica_segmento" && value !== "SI") next.segmento_cliente = "";
      return next;
    });
  };

  const toggleChannel = (channel) => {
    const nextChannels = selectedChannels.includes(channel)
      ? selectedChannels.filter((item) => item !== channel)
      : [...selectedChannels, channel];
    const nextValue = joinMultiValue(nextChannels);
    updateDraft("canal", nextValue);
  };

  const toggleReason = (reason) => {
    const nextSelections = selectedReasons.includes(reason)
      ? selectedReasons.filter((item) => item !== reason)
      : [...selectedReasons, reason];
    const nextOtherText = nextSelections.includes("otros") ? otherReasonText : "";
    updateDraft("motivo_solicitud", buildReasonValue(nextSelections, nextOtherText));
  };

  const updateOtherReason = (value) => {
    updateDraft("motivo_solicitud", buildReasonValue(selectedReasons, value));
  };

  const requiredReady = Boolean(
    draft.comprador &&
    draft.nombre_actividad &&
    selectedChannels.length &&
    draft.fecha_inicio &&
    draft.fecha_fin &&
    draft.alcance_tipo &&
    (draft.alcance_tipo === "CANAL" || draft.alcance_valor) &&
    (draft.aplica_segmento !== "SI" || draft.segmento_cliente) &&
    (!selectedReasons.includes("otros") || String(otherReasonText || "").trim())
  );

  const resolveSpecialActivityId = async () => {
    const dateKey = formatDateKey();
    const prefix = `ESP-${dateKey}-`;
    if (!supabaseReady || !onResolveSpecialActivityIds) return createSpecialActivityId(actividades);

    const remoteIds = await onResolveSpecialActivityIds(prefix);
    const remoteActivities = remoteIds.map((actividadId) => ({ actividad_id: actividadId }));
    return createSpecialActivityId([...(actividades || []), ...remoteActivities]);
  };

  const createActivity = async () => {
    if (!requiredReady || currentActivity || isCreatingActivity) return;
    setIsCreatingActivity(true);
    setActivityCreateError("");
    let actividadId = "";
    try {
      actividadId = await resolveSpecialActivityId();
    } catch (error) {
      setActivityCreateError(error?.message || "No se pudo validar el ID de actividad en Supabase.");
      setIsCreatingActivity(false);
      return;
    }

    const now = new Date().toISOString();
    const activity = normalizeActividad({
      actividad_id: actividadId,
      nombre_actividad: draft.nombre_actividad,
      tipo_actividad: "ESPECIAL",
      canal: draft.canal,
      fecha_inicio: draft.fecha_inicio,
      fecha_fin: draft.fecha_fin,
      comprador: draft.comprador,
      solicitante: draft.comprador,
      estado: "Nuevo",
      motivo_solicitud: draft.motivo_solicitud,
      fecha_creacion: now,
      fecha_estado: now,
      fecha_nuevo: now,
    });
    setActividades((prev) => [activity, ...prev]);
    setCurrentActivity(activity);
    setLogs((prev) => [{ fecha: new Date().toLocaleString(), usuario: draft.comprador, catalogo: activity.nombre_actividad, accion: `Creo actividad especial ${activity.actividad_id}` }, ...prev]);
    setIsCreatingActivity(false);
  };

  const resetActivity = () => {
    setCurrentActivity(null);
    setDraft({
      comprador: "",
      nombre_actividad: "",
      canal: defaultCanal,
      fecha_inicio: today,
      fecha_fin: today,
      alcance_tipo: "CANAL",
      alcance_valor: defaultCanal,
      aplica_segmento: "NO",
      segmento_cliente: "",
      motivo_solicitud: "",
      tipo_promo: "Descuento",
    });
    setActivityCreateError("");
  };

  const activityContext = currentActivity
    ? {
      actividad_id: currentActivity.actividad_id,
      nombre_actividad: currentActivity.nombre_actividad,
      alcance_tipo: draft.alcance_tipo,
      alcance_valor: draft.alcance_valor,
      aplica_segmento: draft.aplica_segmento,
      segmento_cliente: draft.segmento_cliente,
    }
    : null;

  return <div>
    <Header title="Promocion especial" subtitle="Registro rapido de promociones no planificadas sin depender de un catalogo precreado." />
    <Card className="special-card">
      <CardContent>
        <div className="toolbar">
          <div>
            <h2>Datos de la actividad</h2>
            <p>{currentActivity ? currentActivity.actividad_id : "Complete la solicitud para habilitar la grilla."}</p>
          </div>
          <div className="toolbar-actions">
            <Button onClick={createActivity} disabled={!requiredReady || Boolean(currentActivity) || isCreatingActivity}><Save size={16}/> {isCreatingActivity ? "Validando ID..." : "Guardar actividad"}</Button>
            {currentActivity && <Button variant="outline" onClick={resetActivity}><Plus size={16}/> Nueva especial</Button>}
          </div>
        </div>
        {activityCreateError && <div className="status-message error">{activityCreateError}</div>}
        <div className="form-grid">
          <label className="field">
            <span>Comprador</span>
            <select value={draft.comprador} onChange={(e) => updateDraft("comprador", e.target.value)} disabled={Boolean(currentActivity)}>
              <option value="">Seleccione comprador</option>
              {buyerList.map((buyer) => <option key={buyer}>{buyer}</option>)}
            </select>
          </label>
          <Field label="Nombre de actividad" value={draft.nombre_actividad} onChange={(v) => updateDraft("nombre_actividad", v)} />
          <label className="field">
            <span>Canal</span>
            <div className="segment-panel special-multi-select">
              <div className="segment-chip-list">
                {canalOptions.map((canal) => <button key={canal} type="button" className={selectedChannels.includes(canal) ? "segment-chip selected" : "segment-chip"} onClick={() => toggleChannel(canal)} disabled={Boolean(currentActivity)}>{canal}</button>)}
              </div>
            </div>
          </label>
          <Field label="Fecha inicio" value={draft.fecha_inicio} onChange={(v) => updateDraft("fecha_inicio", v)} type="date" />
          <Field label="Fecha fin" value={draft.fecha_fin} onChange={(v) => updateDraft("fecha_fin", v)} type="date" />
          <label className="field">
            <span>Alcance tipo</span>
            <select value={draft.alcance_tipo} onChange={(e) => updateDraft("alcance_tipo", e.target.value)} disabled={Boolean(currentActivity)}>
              {ALCANCE_TYPES.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className="field">
            <span>{alcanceValorLabel}</span>
            {draft.alcance_tipo === "SEGMENTO"
              ? <select value={draft.alcance_valor} onChange={(e) => updateDraft("alcance_valor", e.target.value)} disabled={Boolean(currentActivity)}>
                <option value="">Seleccione segmento</option>
                {segmentOptions.map((item) => <option key={item.segmento_id} value={item.segmento_id}>{item.segmento_id} - {item.segmento}</option>)}
              </select>
              : <input value={draft.alcance_valor} onChange={(e) => updateDraft("alcance_valor", e.target.value)} disabled={Boolean(currentActivity) || draft.alcance_tipo === "CANAL"} />}
          </label>
          <label className="field">
            <span>Aplica segmento</span>
            <select value={draft.aplica_segmento} onChange={(e) => updateDraft("aplica_segmento", e.target.value)} disabled={Boolean(currentActivity) || draft.alcance_tipo === "SEGMENTO"}>
              <option value="NO">NO</option>
              <option value="SI">SI</option>
            </select>
          </label>
          <label className="field">
            <span>Segmento cliente</span>
            <input list="segmento-especial" value={draft.segmento_cliente} onChange={(e) => updateDraft("segmento_cliente", e.target.value)} disabled={Boolean(currentActivity) || draft.aplica_segmento !== "SI" || draft.alcance_tipo === "SEGMENTO"} />
            <datalist id="segmento-especial">
              {segmentOptions.map((item) => <option key={item.segmento_id} value={item.segmento_id}>{item.segmento}</option>)}
            </datalist>
          </label>
          <label className="field">
            <span>Tipo promo inicial</span>
            <select value={draft.tipo_promo} onChange={(e) => updateDraft("tipo_promo", e.target.value)} disabled={Boolean(currentActivity)}>
              {todosTipos.map((type) => <option key={type}>{type}</option>)}
            </select>
          </label>
          <label className="field wide">
            <span>Motivo solicitud</span>
            <div className="segment-panel special-multi-select">
              <div className="segment-chip-list">
                {SPECIAL_REQUEST_REASONS.map((reason) => <button key={reason} type="button" className={selectedReasons.includes(reason) ? "segment-chip selected" : "segment-chip"} onClick={() => toggleReason(reason)} disabled={Boolean(currentActivity)}>{reason}</button>)}
              </div>
              {selectedReasons.includes("otros") && <div className="special-other-field"><input value={otherReasonText} onChange={(e) => updateOtherReason(e.target.value)} placeholder="Detalle de otros" disabled={Boolean(currentActivity)} /></div>}
            </div>
          </label>
        </div>
      </CardContent>
    </Card>
    {currentActivity
      ? <PromosPageView
        catalogoActivo={{ id: currentActivity.actividad_id, nombre: currentActivity.nombre_actividad, canal: currentActivity.canal }}
        rows={rows}
        setRows={setRows}
        comentarios={comentarios}
        setComentarios={setComentarios}
        compradores={compradores}
        jerarquiaCategorias={jerarquiaCategorias}
        segmentosClientes={segmentosClientes}
        skuMaster={skuMaster}
        setLogs={setLogs}
        onLoadSkuMaster={onLoadSkuMaster}
        skuMasterFileInputRef={skuMasterFileInputRef}
        archivoComprador={archivoComprador}
        onSaveSupabase={onSaveSupabase}
        supabaseReady={supabaseReady}
        saveSupabaseStatus={saveSupabaseStatus}
        isSyncing={isSyncing}
        activityContext={activityContext}
        initialComprador={draft.comprador}
        lockComprador
        initialTipoPromo={draft.tipo_promo}
        title="Carga de SKU"
        subtitle="Use la misma grilla de promociones para la actividad especial."
      />
      : <div className="empty-state">Guarde la actividad especial para habilitar la carga de SKU.</div>}
  </div>;
}
