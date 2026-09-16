import React, { useState, useMemo, useEffect } from "react";
import {
  Save,
  Plus,
  ArrowLeft,
  Edit3,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Layers,
  Tag,
  Store,
  User,
  X,
} from "lucide-react";
import { allPromoTypes as todosTipos } from "../promoTypes/promoTypeEngine";
import { ROLES, normalizeRole } from "../constants/permissions";
import { useAuth } from "../hooks/useAuth";
import { usePermissions } from "../hooks/usePermissions";
import { getAuthorizedCompradorNamesForAppUser } from "../utils/avanceHelpers";
import {
  getSegmentosByCanal,
  normalizeActividad,
  createSpecialActivityId,
  formatDateKey,
} from "../utils/promoHelpers";
import PromosPageView, { SegmentMultiSelect } from "./PromosPage";
import { Button, Card, CardContent, Header } from "./ui";

const SPECIAL_CHANNEL_OPTIONS = ["Retail", "Comasa", "Galerón", "Ferrex"];
const SPECIAL_REQUEST_REASONS = [
  "Liquidación",
  "Productos próximos a vencer",
  "Ofertas de emergencia",
  "Respuesta competencia",
  "Inventario duro/lento",
  "Introducción",
  "Incentivar venta",
  "Negociación Proveedor",
  "Otros",
];

const ALCANCE_OPTIONS = [
  { value: "CANAL", label: "General (Todo el canal)" },
  { value: "SEGMENTO", label: "Segmento de clientes" },
  { value: "TIENDA", label: "Tienda específica" },
  { value: "MULTI_TIENDA", label: "Múltiples tiendas" },
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
  return Array.from(new Set((values || []).filter(Boolean))).join("; ");
}

function parseReasonState(value) {
  const selections = [];
  let otherText = "";
  splitMultiValue(value).forEach((item) => {
    const lower = item.toLowerCase();
    if (lower.startsWith("otros:") || lower.startsWith("otros :")) {
      selections.push("Otros");
      otherText = item.slice(item.indexOf(":") + 1).replace(/^\s+/, "");
      return;
    }
    if (lower === "otros") {
      selections.push("Otros");
      return;
    }
    if (lower === "productos proximo a vencer") {
      selections.push("Productos próximos a vencer");
      return;
    }
    selections.push(item);
  });
  return { selections: Array.from(new Set(selections)), otherText };
}

function buildReasonValue(selections, otherText) {
  return (selections || [])
    .map((item) => {
      if (item === "Otros" || item.toLowerCase() === "otros") {
        return otherText ? `Otros: ${otherText}` : "Otros";
      }
      return item;
    })
    .filter(Boolean)
    .join("; ");
}

function Field({ label, value, onChange, type = "text", required = false, ...props }) {
  return (
    <label className="field">
      <span>
        {label} {required && <strong className="required-star">*</strong>}
      </span>
      <input type={type} value={value || ""} onChange={(e) => onChange(e.target.value)} {...props} />
    </label>
  );
}

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
  skuMasterCount = 0,
  setLogs,
  onSaveSupabase,
  onSaveSupabaseDirect,
  supabaseReady,
  onResolveSpecialActivityIds,
  saveSupabaseStatus,
  isSyncing,
  catalogos,
  setActive,
}) {
  const { appUser } = useAuth();
  const { role } = usePermissions();
  const today = new Date().toISOString().slice(0, 10);
  const canalOptions = Array.from(
    new Set([...(catalogos || []).map((cat) => normalizeChannelLabel(cat.canal)).filter(Boolean), ...SPECIAL_CHANNEL_OPTIONS])
  );
  const restrictBuyerScope = normalizeRole(role) === ROLES.BUYER;
  const buyerList = useMemo(
    () => getAuthorizedCompradorNamesForAppUser(appUser, compradores, restrictBuyerScope),
    [appUser, compradores, restrictBuyerScope]
  );
  const defaultCanal = canalOptions[0] || "Retail";

  const [currentActivity, setCurrentActivity] = useState(null);
  const [isEditingActivity, setIsEditingActivity] = useState(false);
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

  const [otherReasonText, setOtherReasonText] = useState("");
  const selectedChannels = splitMultiValue(draft.canal);
  const { selections: selectedReasons } = parseReasonState(draft.motivo_solicitud);
  const segmentOptions = getSegmentosByCanal(segmentosClientes, draft.canal);

  const updateDraft = (field, value) => {
    setDraft((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "canal" && next.alcance_tipo === "CANAL") {
        next.alcance_valor = value;
      }
      if (field === "alcance_tipo") {
        if (value === "CANAL") {
          next.alcance_valor = next.canal;
          next.aplica_segmento = "NO";
          next.segmento_cliente = "";
        } else if (value === "SEGMENTO") {
          next.aplica_segmento = "SI";
          next.alcance_valor = "";
          next.segmento_cliente = "";
        } else {
          next.aplica_segmento = "NO";
          next.alcance_valor = "";
          next.segmento_cliente = "";
        }
      }
      if (field === "alcance_valor" && next.alcance_tipo === "SEGMENTO") {
        next.aplica_segmento = "SI";
        next.segmento_cliente = value;
      }
      return next;
    });
  };

  useEffect(() => {
    if (draft.comprador && !buyerList.includes(draft.comprador)) {
      updateDraft("comprador", "");
      return;
    }
    if (!draft.comprador && buyerList.length === 1) {
      updateDraft("comprador", buyerList[0]);
    }
  }, [buyerList, draft.comprador]);

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
    if (!nextSelections.includes("Otros")) {
      setOtherReasonText("");
      updateDraft("motivo_solicitud", buildReasonValue(nextSelections, ""));
    } else {
      updateDraft("motivo_solicitud", buildReasonValue(nextSelections, otherReasonText));
    }
  };

  const handleOtherReasonChange = (val) => {
    setOtherReasonText(val);
    updateDraft("motivo_solicitud", buildReasonValue(selectedReasons, val));
  };

  // Validaciones
  const isDateRangeValid = !draft.fecha_inicio || !draft.fecha_fin || draft.fecha_fin >= draft.fecha_inicio;

  const missingFields = [];
  if (!draft.comprador) missingFields.push("Comprador");
  if (!draft.nombre_actividad.trim()) missingFields.push("Nombre de actividad");
  if (!selectedChannels.length) missingFields.push("Canal");
  if (!draft.fecha_inicio) missingFields.push("Fecha inicio");
  if (!draft.fecha_fin) missingFields.push("Fecha fin");
  if (!isDateRangeValid) missingFields.push("Rango de fechas válido (Fin debe ser posterior o igual a Inicio)");
  if (draft.alcance_tipo === "SEGMENTO" && !String(draft.alcance_valor || "").trim()) {
    missingFields.push("Segmento(s) de clientes");
  }
  if ((draft.alcance_tipo === "TIENDA" || draft.alcance_tipo === "MULTI_TIENDA") && !draft.alcance_valor.trim()) {
    missingFields.push(draft.alcance_tipo === "TIENDA" ? "Tienda" : "Múltiples tiendas");
  }
  if (!selectedReasons.length) missingFields.push("Motivo de solicitud");
  if (selectedReasons.includes("Otros") && !otherReasonText.trim()) {
    missingFields.push("Detalle de 'Otros'");
  }

  const requiredReady = missingFields.length === 0;

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
    const nextActividades = [activity, ...(actividades || [])];
    setActividades(nextActividades);
    setCurrentActivity(activity);
    setIsEditingActivity(false);
    setLogs((prev) => [
      {
        fecha: new Date().toLocaleString(),
        usuario: draft.comprador,
        catalogo: activity.nombre_actividad,
        accion: `Creó actividad especial ${activity.actividad_id}`,
      },
      ...prev,
    ]);
    if (supabaseReady && onSaveSupabaseDirect) {
      try {
        await onSaveSupabaseDirect({ actividades: nextActividades });
      } catch (saveErr) {
        console.error("Error al guardar actividad en el sistema:", saveErr);
      }
    }
    setIsCreatingActivity(false);
  };

  const updateExistingActivity = async () => {
    if (!requiredReady || !currentActivity) return;
    const updated = normalizeActividad({
      ...currentActivity,
      nombre_actividad: draft.nombre_actividad,
      canal: draft.canal,
      fecha_inicio: draft.fecha_inicio,
      fecha_fin: draft.fecha_fin,
      comprador: draft.comprador,
      solicitante: draft.comprador,
      motivo_solicitud: draft.motivo_solicitud,
      fecha_estado: new Date().toISOString(),
    });
    const nextActividades = (actividades || []).map((act) =>
      act.actividad_id === updated.actividad_id ? updated : act
    );
    setActividades(nextActividades);
    setCurrentActivity(updated);
    setIsEditingActivity(false);
    setLogs((prev) => [
      {
        fecha: new Date().toLocaleString(),
        usuario: draft.comprador,
        catalogo: updated.nombre_actividad,
        accion: `Actualizó actividad especial ${updated.actividad_id}`,
      },
      ...prev,
    ]);
    if (supabaseReady && onSaveSupabaseDirect) {
      try {
        await onSaveSupabaseDirect({ actividades: nextActividades });
      } catch (saveErr) {
        console.error("Error al actualizar actividad en el sistema:", saveErr);
      }
    }
  };

  const cancelEditActivity = () => {
    if (!currentActivity) return;
    const parsed = parseReasonState(currentActivity.motivo_solicitud);
    setOtherReasonText(parsed.otherText);
    setDraft((prev) => ({
      ...prev,
      comprador: currentActivity.comprador || "",
      nombre_actividad: currentActivity.nombre_actividad || "",
      canal: currentActivity.canal || defaultCanal,
      fecha_inicio: currentActivity.fecha_inicio || today,
      fecha_fin: currentActivity.fecha_fin || today,
      motivo_solicitud: currentActivity.motivo_solicitud || "",
    }));
    setIsEditingActivity(false);
  };

  const resetActivity = () => {
    setCurrentActivity(null);
    setIsEditingActivity(false);
    setOtherReasonText("");
    setDraft({
      comprador: buyerList.length === 1 ? buyerList[0] : "",
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
        canal: currentActivity.canal,
        alcance_tipo: draft.alcance_tipo,
        alcance_valor: draft.alcance_valor,
        aplica_segmento: draft.alcance_tipo === "SEGMENTO" ? "SI" : "NO",
        segmento_cliente: draft.alcance_tipo === "SEGMENTO" ? draft.alcance_valor : "",
      }
    : null;

  const currentAlcanceLabel =
    ALCANCE_OPTIONS.find((o) => o.value === draft.alcance_tipo)?.label || draft.alcance_tipo;

  return (
    <div className="special-page-container">
      <div className="special-page-top-bar">
        {setActive && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActive("solicitudes")}
            className="special-back-btn"
          >
            <ArrowLeft size={16} /> Volver a Solicitudes
          </Button>
        )}
        <Header
          title="Promoción especial"
          subtitle="Registro rápido de promociones no planificadas sin depender de un catálogo precreado."
        />
      </div>

      {/* Tarjeta de Cabecera: Modo Resumen Colapsado o Modo Edición / Formulario */}
      {currentActivity && !isEditingActivity ? (
        <Card className="special-card special-summary-card">
          <CardContent>
            <div className="special-summary-header">
              <div className="special-summary-title-group">
                <span className="pill green font-mono font-bold">
                  {currentActivity.actividad_id}
                </span>
                <h2 className="special-summary-name">{currentActivity.nombre_actividad}</h2>
                <span className="pill yellow">Nuevo</span>
              </div>
              <div className="toolbar-actions">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditingActivity(true)}
                >
                  <Edit3 size={15} /> Editar parámetros
                </Button>
                <Button variant="outline" size="sm" onClick={resetActivity}>
                  <Plus size={15} /> Nueva especial
                </Button>
              </div>
            </div>

            <div className="special-summary-meta-grid">
              <div className="special-meta-item">
                <User size={15} className="special-meta-icon" />
                <div>
                  <small>Comprador</small>
                  <strong>{currentActivity.comprador}</strong>
                </div>
              </div>
              <div className="special-meta-item">
                <Store size={15} className="special-meta-icon" />
                <div>
                  <small>Canal(es)</small>
                  <strong>{currentActivity.canal}</strong>
                </div>
              </div>
              <div className="special-meta-item">
                <Calendar size={15} className="special-meta-icon" />
                <div>
                  <small>Vigencia</small>
                  <strong>
                    {currentActivity.fecha_inicio} al {currentActivity.fecha_fin}
                  </strong>
                </div>
              </div>
              <div className="special-meta-item">
                <Layers size={15} className="special-meta-icon" />
                <div>
                  <small>Alcance</small>
                  <strong>
                    {currentAlcanceLabel}
                    {draft.alcance_tipo !== "CANAL" && draft.alcance_valor
                      ? ` (${draft.alcance_valor})`
                      : ""}
                  </strong>
                </div>
              </div>
              <div className="special-meta-item wide">
                <Tag size={15} className="special-meta-icon" />
                <div>
                  <small>Motivo de solicitud</small>
                  <span>{currentActivity.motivo_solicitud || "Sin motivo especificado"}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="special-card">
          <CardContent>
            <div className="toolbar">
              <div>
                <h2>
                  {isEditingActivity
                    ? `Modificar actividad ${currentActivity?.actividad_id}`
                    : "Paso 1: Datos de la actividad"}
                </h2>
                <p>
                  {isEditingActivity
                    ? "Actualice los parámetros de la promoción y guarde los cambios."
                    : "Complete los campos obligatorios (*) para habilitar la carga de artículos."}
                </p>
              </div>
              <div className="toolbar-actions">
                {isEditingActivity ? (
                  <>
                    <Button variant="outline" onClick={cancelEditActivity}>
                      <X size={16} /> Cancelar
                    </Button>
                    <Button onClick={updateExistingActivity} disabled={!requiredReady}>
                      <Save size={16} /> Guardar cambios
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={createActivity}
                    disabled={!requiredReady || isCreatingActivity}
                  >
                    <Save size={16} />{" "}
                    {isCreatingActivity ? "Validando ID..." : "Guardar actividad"}
                  </Button>
                )}
              </div>
            </div>

            {activityCreateError && (
              <div className="status-message error">{activityCreateError}</div>
            )}

            {!requiredReady && (
              <div className="special-validation-box">
                <AlertCircle size={16} className="text-amber-600" />
                <span>
                  <strong>Campos requeridos pendientes:</strong> {missingFields.join(", ")}.
                </span>
              </div>
            )}

            <div className="form-grid">
              <label className="field">
                <span>
                  Comprador <strong className="required-star">*</strong>
                </span>
                <select
                  value={draft.comprador}
                  onChange={(e) => updateDraft("comprador", e.target.value)}
                  disabled={buyerList.length <= 1}
                >
                  <option value="">Seleccione comprador</option>
                  {buyerList.map((buyer) => (
                    <option key={buyer}>{buyer}</option>
                  ))}
                </select>
              </label>

              <Field
                label="Nombre de actividad"
                value={draft.nombre_actividad}
                onChange={(v) => updateDraft("nombre_actividad", v)}
                placeholder="Ej. Liquidación Línea Blanca Septiembre"
                required
              />

              <label className="field">
                <span>
                  Canal(es) <strong className="required-star">*</strong>
                </span>
                <div className="segment-panel special-multi-select">
                  <div className="segment-chip-list">
                    {canalOptions.map((canal) => (
                      <button
                        key={canal}
                        type="button"
                        className={
                          selectedChannels.includes(canal)
                            ? "segment-chip selected"
                            : "segment-chip"
                        }
                        onClick={() => toggleChannel(canal)}
                        aria-pressed={selectedChannels.includes(canal)}
                      >
                        {canal}
                      </button>
                    ))}
                  </div>
                </div>
              </label>

              <Field
                label="Fecha inicio"
                value={draft.fecha_inicio}
                onChange={(v) => updateDraft("fecha_inicio", v)}
                type="date"
                required
              />

              <div className="field-with-validation">
                <Field
                  label="Fecha fin"
                  value={draft.fecha_fin}
                  onChange={(v) => updateDraft("fecha_fin", v)}
                  type="date"
                  required
                />
                {!isDateRangeValid && (
                  <small className="field-error-text">
                    La fecha fin no puede ser anterior a la fecha de inicio.
                  </small>
                )}
              </div>

              {/* ALCANCE SIMPLIFICADO */}
              <label className="field">
                <span>
                  Alcance <strong className="required-star">*</strong>
                </span>
                <select
                  value={draft.alcance_tipo}
                  onChange={(e) => updateDraft("alcance_tipo", e.target.value)}
                >
                  {ALCANCE_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              {/* DETALLE DEL ALCANCE (Solo si aplica) */}
              {draft.alcance_tipo === "SEGMENTO" && (
                <label className="field wide">
                  <span>
                    Segmento(s) de clientes <strong className="required-star">*</strong>
                  </span>
                  <SegmentMultiSelect
                    options={segmentOptions}
                    selected={draft.alcance_valor}
                    onChange={(selectedList) => {
                      const val = Array.isArray(selectedList)
                        ? selectedList.join(" | ")
                        : String(selectedList || "");
                      updateDraft("alcance_valor", val);
                    }}
                    placeholder="Seleccione uno o más segmentos..."
                  />
                </label>
              )}

              {draft.alcance_tipo === "TIENDA" && (
                <label className="field">
                  <span>
                    Tienda específica <strong className="required-star">*</strong>
                  </span>
                  <input
                    value={draft.alcance_valor}
                    onChange={(e) => updateDraft("alcance_valor", e.target.value)}
                    placeholder="Ej. T01 - Tienda Central"
                  />
                </label>
              )}

              {draft.alcance_tipo === "MULTI_TIENDA" && (
                <label className="field">
                  <span>
                    Múltiples tiendas <strong className="required-star">*</strong>
                  </span>
                  <input
                    value={draft.alcance_valor}
                    onChange={(e) => updateDraft("alcance_valor", e.target.value)}
                    placeholder="Ej. T01, T04, T08"
                  />
                </label>
              )}

              <label className="field">
                <span>Tipo promo inicial</span>
                <select
                  value={draft.tipo_promo}
                  onChange={(e) => updateDraft("tipo_promo", e.target.value)}
                >
                  {todosTipos.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </label>

              <label className="field wide">
                <span>
                  Motivo de solicitud <strong className="required-star">*</strong>
                </span>
                <div className="segment-panel special-multi-select">
                  <div className="segment-chip-list">
                    {SPECIAL_REQUEST_REASONS.map((reason) => (
                      <button
                        key={reason}
                        type="button"
                        className={
                          selectedReasons.includes(reason)
                            ? "segment-chip selected"
                            : "segment-chip"
                        }
                        onClick={() => toggleReason(reason)}
                        aria-pressed={selectedReasons.includes(reason)}
                      >
                        {reason}
                      </button>
                    ))}
                  </div>
                  {selectedReasons.includes("Otros") && (
                    <div className="special-other-field">
                      <input
                        value={otherReasonText}
                        onChange={(e) => handleOtherReasonChange(e.target.value)}
                        placeholder="Escriba el detalle específico para 'Otros' *"
                      />
                    </div>
                  )}
                </div>
              </label>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Paso 2: Grilla de SKUs o Stepper de Espera */}
      {currentActivity ? (
        <div className="special-grid-wrapper">
          <PromosPageView
            catalogoActivo={{
              id: currentActivity.actividad_id,
              nombre: currentActivity.nombre_actividad,
              canal: currentActivity.canal,
            }}
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
            onSaveSupabase={onSaveSupabase}
            onSaveSupabaseDirect={onSaveSupabaseDirect}
            supabaseReady={supabaseReady}
            saveSupabaseStatus={saveSupabaseStatus}
            isSyncing={isSyncing}
            activityContext={activityContext}
            initialComprador={draft.comprador}
            lockComprador
            initialTipoPromo={draft.tipo_promo}
            hideHeader={true}
          />
        </div>
      ) : (
        <div className="special-stepper-box">
          <div className="special-stepper-card">
            <div className="special-stepper-icon">
              <CheckCircle2 size={28} className="text-emerald-700" />
            </div>
            <div>
              <h3>Paso 2: Carga y validación de artículos (SKUs)</h3>
              <p>
                Al guardar la actividad especial se habilitará automáticamente la grilla controlada
                para ingresar, pegar desde Excel o importar artículos vinculados a esta solicitud.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
