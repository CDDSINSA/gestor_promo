import React, { useState } from "react";
import { Save, Plus } from "lucide-react";
import { allPromoTypes as todosTipos } from "../promoTypes/promoTypeEngine";
import { ALCANCE_TYPES } from "../constants";
import { classNames } from "../utils/common";
import {
  getSegmentosByCanal,
  normalizeActividad,
  createSpecialActivityId,
} from "../utils/promoHelpers";
import PromosPageView from "./PromosPage";

function Header({ title, subtitle }) {
  return <div className="header"><h1>{title}</h1><p>{subtitle}</p></div>;
}

function Button({ children, className = "", variant = "default", ...props }) {
  return <button className={classNames("btn", variant === "outline" ? "btn-outline" : "btn-primary", className)} {...props}>{children}</button>;
}

function Card({ children, className = "" }) { return <div className={classNames("card", className)}>{children}</div>; }
function CardContent({ children, className = "" }) { return <div className={className}>{children}</div>; }
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
  onSaveDrive,
  driveReady,
  saveDriveStatus,
  isSyncing,
  catalogos,
}) {
  const today = new Date().toISOString().slice(0, 10);
  const canalOptions = Array.from(new Set([...(catalogos || []).map((cat) => cat.canal).filter(Boolean), "Retail", "Galeron", "Comasa"]));
  const buyerList = compradores.filter((c) => c.activo !== false).map((c) => c.comprador || c.nombre).filter(Boolean);
  const [currentActivity, setCurrentActivity] = useState(null);
  const [draft, setDraft] = useState({
    comprador: "",
    nombre_actividad: "",
    canal: canalOptions[0] || "Retail",
    fecha_inicio: today,
    fecha_fin: today,
    alcance_tipo: "CANAL",
    alcance_valor: canalOptions[0] || "Retail",
    aplica_segmento: "NO",
    segmento_cliente: "",
    motivo_solicitud: "",
    tipo_promo: "Descuento",
  });
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

  const requiredReady = Boolean(
    draft.comprador &&
    draft.nombre_actividad &&
    draft.canal &&
    draft.fecha_inicio &&
    draft.fecha_fin &&
    draft.alcance_tipo &&
    (draft.alcance_tipo === "CANAL" || draft.alcance_valor) &&
    (draft.aplica_segmento !== "SI" || draft.segmento_cliente)
  );

  const createActivity = () => {
    if (!requiredReady || currentActivity) return;
    const now = new Date().toISOString();
    const activity = normalizeActividad({
      actividad_id: createSpecialActivityId(actividades),
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
  };

  const resetActivity = () => {
    setCurrentActivity(null);
    setDraft({
      comprador: "",
      nombre_actividad: "",
      canal: canalOptions[0] || "Retail",
      fecha_inicio: today,
      fecha_fin: today,
      alcance_tipo: "CANAL",
      alcance_valor: canalOptions[0] || "Retail",
      aplica_segmento: "NO",
      segmento_cliente: "",
      motivo_solicitud: "",
      tipo_promo: "Descuento",
    });
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
            <Button onClick={createActivity} disabled={!requiredReady || Boolean(currentActivity)}><Save size={16}/> Guardar actividad</Button>
            {currentActivity && <Button variant="outline" onClick={resetActivity}><Plus size={16}/> Nueva especial</Button>}
          </div>
        </div>
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
            <select value={draft.canal} onChange={(e) => updateDraft("canal", e.target.value)} disabled={Boolean(currentActivity)}>
              {canalOptions.map((canal) => <option key={canal}>{canal}</option>)}
            </select>
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
            <textarea value={draft.motivo_solicitud} onChange={(e) => updateDraft("motivo_solicitud", e.target.value)} disabled={Boolean(currentActivity)} />
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
        onSaveDrive={onSaveDrive}
        driveReady={driveReady}
        saveDriveStatus={saveDriveStatus}
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
