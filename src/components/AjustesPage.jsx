import React, { useState } from "react";
import { Plus, Save, Search, FileSpreadsheet, Trash2, Download } from "lucide-react";
import { DIVISIONES_CATALOGO } from "../constants";
import { classNames, formatVigenciaRange, makeId } from "../utils/common";
import { Button, Card, CardContent, Header } from "./ui";
import {
  getCompradorCategoria,
  getCompradorId,
  getCompradorNombre,
  getDivisionOptionsFromCompradores,
  getSeniorIds,
  isCompradorJunior,
} from "../utils/avanceHelpers";
import { normalizeCanal, normalizeCatalogo, splitChannelValues } from "../utils/promoHelpers";
import SkuMasterSettingsCard from "../features/skuMaster/SkuMasterSettingsCard";

function Field({ label, value, onChange, type = "text", ...props }) { return <label className="field"><span>{label}</span><input type={type} value={value || ""} onChange={(e) => onChange(e.target.value)} {...props} /></label>; }

const CATALOG_CHANNEL_OPTIONS = ["Retail", "Comasa", "Galerón", "Ferrex", "Proyectos"];

function normalizeDivisionKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export default function AjustesPage({
  catalogos,
  setCatalogos,
  compradores,
  setCompradores,
  rows = [],
  actividades = [],
  supabaseSettings,
  setSupabaseSettings,
  supabaseConnection,
  onSkuMasterUpdated,
  onSaveExcel,
  onSaveSupabaseSettings,
  onSaveCatalogSettings,
  onDeleteCatalogo,
  onTestSupabaseConnection,
  onValidateSupabaseSession,
  supabaseStatus,
  isSyncing,
}) {
  const [selectedId, setSelectedId] = useState(catalogos[0]?.id);
  const [selectedBuyerIndex, setSelectedBuyerIndex] = useState(0);
  const [activeSection, setActiveSection] = useState("general");
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const downloadExcelBackup = async () => {
    if (isExportingExcel || !onSaveExcel) return;
    setIsExportingExcel(true);
    try {
      await onSaveExcel();
    } finally {
      setIsExportingExcel(false);
    }
  };
  const selected = catalogos.find((c) => c.id === selectedId) || catalogos[0];
  const getCompradorKey = (item) => item?.comprador || item?.nombre || "";
  const activeBuyerIndex = selectedBuyerIndex < compradores.length ? selectedBuyerIndex : 0;
  const selectedBuyer = compradores[activeBuyerIndex];
  const selectedBuyerActive = selectedBuyer?.activo !== false;
  const selectedBuyerCategoria = getCompradorCategoria(selectedBuyer) || "Senior";
  const seniorOptions = compradores
    .filter((buyer, index) => index !== activeBuyerIndex && buyer.activo !== false && !isCompradorJunior(buyer))
    .map((buyer) => ({ id: getCompradorId(buyer), nombre: getCompradorNombre(buyer) }))
    .filter((buyer) => buyer.id && buyer.nombre);

  const nextCompradorId = () => {
    const maxId = compradores.reduce((max, buyer) => {
      const number = Number(getCompradorId(buyer));
      return Number.isNaN(number) ? max : Math.max(max, number);
    }, 0);
    return maxId ? String(maxId + 1) : "";
  };

  const addCatalogo = () => {
    const id = makeId("cat");
    const nuevoCatalogo = { id, nombre: "Nuevo catalogo", canal: "Retail", vigencia_inicio: "", vigencia_fin: "", vigencia: "", estado: "Borrador", color: "bg-emerald-700", docId: `local-${id}`, tokenConexion: "********", notificaciones: false, notificacionesEnvivo: true, notificaciones_envivo: true, correos: "" };
    setCatalogos((prev) => [...prev, nuevoCatalogo]);
    setSelectedId(id);
  };

  const updateSelectedFields = (changes) => {
    if (!selected) return;
    setCatalogos((prev) => prev.map((c) => c.id === selected.id ? normalizeCatalogo({ ...c, ...changes }) : c));
  };

  const updateSelected = (field, value) => updateSelectedFields({ [field]: value });

  const updateVigencia = (field, value) => {
    const nextInicio = field === "vigencia_inicio" ? value : selected.vigencia_inicio;
    const nextFin = field === "vigencia_fin" ? value : selected.vigencia_fin;
    updateSelectedFields({ [field]: value, vigencia: formatVigenciaRange(nextInicio, nextFin) });
  };

  const divisionOptionsBase = getDivisionOptionsFromCompradores(compradores, DIVISIONES_CATALOGO);
  const divisionOptionsKeys = new Set(divisionOptionsBase.map(normalizeDivisionKey));
  const selectedExtraDivisiones = (selected?.divisiones || []).filter((division) => !divisionOptionsKeys.has(normalizeDivisionKey(division)));
  const divisionOptions = [...divisionOptionsBase, ...selectedExtraDivisiones];
  const selectedDivisiones = selected?.divisiones?.length ? selected.divisiones : divisionOptions;
  const selectedDivisionKeys = new Set(selectedDivisiones.map(normalizeDivisionKey));
  const selectedChannels = splitChannelValues(selected?.canal || "");
  const selectedChannelKeys = new Set(selectedChannels.map(normalizeCanal));
  const updateCatalogDivisiones = (nextDivisiones) => {
    const nextKeys = new Set((nextDivisiones || []).map(normalizeDivisionKey));
    const cleaned = divisionOptions.filter((division) => nextKeys.has(normalizeDivisionKey(division)));
    updateSelected("divisiones", cleaned.length === divisionOptions.length ? [] : cleaned);
  };
  const toggleCatalogChannel = (channel) => {
    const key = normalizeCanal(channel);
    const next = selectedChannelKeys.has(key)
      ? selectedChannels.filter((item) => normalizeCanal(item) !== key)
      : [...selectedChannels, channel];
    const ordered = CATALOG_CHANNEL_OPTIONS.filter((item) => next.some((selectedItem) => normalizeCanal(selectedItem) === normalizeCanal(item)));
    updateSelected("canal", ordered.join(", "));
  };

  const toggleCatalogDivision = (division) => {
    const key = normalizeDivisionKey(division);
    const next = selectedDivisionKeys.has(key)
      ? selectedDivisiones.filter((item) => normalizeDivisionKey(item) !== key)
      : [...selectedDivisiones, division];
    updateCatalogDivisiones(next.length ? next : divisionOptions);
  };

  const deleteSelected = () => {
    if (!selected || catalogos.length <= 1) return;
    const remaining = catalogos.filter((cat) => cat.id !== selected.id);
    const nextId = remaining[0]?.id;
    onDeleteCatalogo(selected.id);
    setSelectedId(nextId);
  };

  const getBuyerImpact = (buyer) => {
    const buyerId = getCompradorId(buyer);
    const buyerName = getCompradorNombre(buyer);
    const buyerKeys = new Set([buyerId, buyerName].map((value) => String(value || "").trim()).filter(Boolean));
    const hasBuyerKey = (item, fields) => fields.some((field) => buyerKeys.has(String(item?.[field] || "").trim()));
    const promociones = rows.filter((row) => hasBuyerKey(row, ["comprador_id", "compradorId", "comprador"])).length;
    const solicitudes = actividades.filter((activity) => hasBuyerKey(activity, ["comprador_id", "compradorId", "comprador", "solicitante"])).length;
    return { promociones, solicitudes };
  };

  const addComprador = () => {
    const nombre = `Nuevo comprador ${compradores.length + 1}`;
    setCompradores((prev) => [...prev, { comprador_id: nextCompradorId(), categoria_comprador: "Senior", comprador: nombre, nombre, division: "", correo: "", senior_id: "", activo: true }]);
    setSelectedBuyerIndex(compradores.length);
  };

  const updateComprador = (field, value) => {
    if (!selectedBuyer) return;
    setCompradores((prev) => prev.map((item, index) => {
      if (index !== activeBuyerIndex) return item;
      const changes = field === "comprador"
        ? { comprador: value, nombre: value }
        : field === "categoria_comprador" && value !== "Junior"
          ? { categoria_comprador: value, senior_id: "" }
          : { [field]: value };
      return { ...item, ...changes };
    }));
  };

  const toggleComprador = () => {
    if (!selectedBuyer) return;
    if (selectedBuyerActive) {
      const impact = getBuyerImpact(selectedBuyer);
      const confirmed = window.confirm(`Va a inactivar este comprador.\n\nPromociones afectadas: ${impact.promociones}\nSolicitudes asociadas: ${impact.solicitudes}\n\nLas referencias historicas se conservaran y el comprador podra reactivarse.`);
      if (!confirmed) return;
    }
    updateComprador("activo", !selectedBuyerActive);
  };

  return <div className="settings-page">
    <Header title="Ajustes" subtitle="Configuración administrativa de catálogos, estado del sistema, notificaciones y fuentes maestras." />
    <div className="settings-tabs" role="tablist" aria-label="Secciones de ajustes">
      <button type="button" className={activeSection === "general" ? "selected" : ""} onClick={() => setActiveSection("general")}>General</button>
      <button type="button" className={activeSection === "compradores" ? "selected" : ""} onClick={() => setActiveSection("compradores")}>Compradores</button>
      <button type="button" className={activeSection === "catalogos" ? "selected" : ""} onClick={() => setActiveSection("catalogos")}>Catalogos</button>
      <button type="button" className={activeSection === "maestro" ? "selected" : ""} onClick={() => setActiveSection("maestro")}>Maestro de SKU (ERP)</button>
    </div>

    {activeSection === "general" && <Card className="settings-section-card">
      <CardContent>
        <div className="toolbar">
          <h2>Estado del sistema</h2>
          <div className="toolbar-actions">
            <Button className="settings-btn-test" variant="outline" onClick={onTestSupabaseConnection} disabled={isSyncing}><Search size={16}/> Probar conexión</Button>
            <Button className="settings-btn-validate" variant="outline" onClick={onValidateSupabaseSession} disabled={isSyncing}><FileSpreadsheet size={16}/> Validar sesión</Button>
          </div>
        </div>
        <div className="connection-panel">
          <div>
            <strong>Conexión con el servidor</strong>
            <p>{supabaseStatus?.message || "La conexión se administra de forma segura a través de variables de entorno del sistema."}</p>
          </div>
        </div>
      </CardContent>
    </Card>}

    {activeSection === "general" && <Card className="settings-section-card">
      <CardContent>
        <div className="toolbar">
          <h2>Respaldo de promociones en Excel</h2>
          <div className="toolbar-actions">
            <Button onClick={downloadExcelBackup} disabled={isSyncing || isExportingExcel || !onSaveExcel}>
              <Download size={16}/>{isExportingExcel ? "Generando Excel..." : "Descargar catálogo Excel"}
            </Button>
          </div>
        </div>
        <p>Descarga Catalogo_Promociones_Actualizado.xlsx con los datos actualmente cargados en la sesión, incluidos los cambios sin guardar. No es una copia completa de la base de datos.</p>
      </CardContent>
    </Card>}

    {activeSection === "compradores" && <Card className="buyers-card settings-section-card">
      <CardContent>
        <div className="toolbar">
          <h2>Configuracion de compradores</h2>
          <div className="toolbar-actions">
            <Button className="settings-btn-save" onClick={() => onSaveCatalogSettings({ compradores })} disabled={isSyncing}><Save size={16}/> Guardar compradores</Button>
            <Button className="settings-btn-add" variant="outline" onClick={addComprador}><Plus size={16}/> Nuevo</Button>
          </div>
        </div>
        <div className="buyer-manager">
          <div className="list buyer-list">
            {compradores.map((buyer, index) => {
              const buyerKey = getCompradorKey(buyer);
              const isSelected = index === activeBuyerIndex;
              const isActive = buyer.activo !== false;
              const categoria = getCompradorCategoria(buyer) || "Senior";
              return <button key={`${buyerKey || buyer.correo || "comprador"}-${index}`} onClick={() => setSelectedBuyerIndex(index)} className={classNames(isSelected && "selected", !isActive && "inactive")}><strong>{buyerKey || "Sin nombre"}</strong><span>{categoria} - ID {getCompradorId(buyer) || "sin ID"} - {buyer.division || "Sin division"}</span><em>{isActive ? "Activo" : "Inactivo"}</em></button>;
            })}
          </div>
          {selectedBuyer ? <div className="buyer-form">
            <Field label="ID comprador" value={selectedBuyer.comprador_id || ""} onChange={(v) => updateComprador("comprador_id", v)}/>
            <label className="field">
              <span>Categoria comprador</span>
              <select value={selectedBuyerCategoria} onChange={(e) => updateComprador("categoria_comprador", e.target.value)}>
                <option>Senior</option>
                <option>Junior</option>
              </select>
            </label>
            <Field label="Nombre comprador" value={selectedBuyer.comprador || selectedBuyer.nombre || ""} onChange={(v) => updateComprador("comprador", v)}/>
            <Field label="Division" value={selectedBuyer.division || ""} onChange={(v) => updateComprador("division", v)}/>
            <Field label="Correo" value={selectedBuyer.correo || ""} onChange={(v) => updateComprador("correo", v)}/>
            {selectedBuyerCategoria === "Junior" && <label className="field">
              <span>Comprador Senior asignado</span>
              <select value={getSeniorIds(selectedBuyer)[0] || ""} onChange={(e) => updateComprador("senior_id", e.target.value)}>
                <option value="">Seleccione Senior</option>
                {seniorOptions.map((senior) => <option key={senior.id} value={senior.id}>{senior.nombre} - ID {senior.id}</option>)}
              </select>
            </label>}
            <div className="button-row">
              <Button className={selectedBuyerActive ? "settings-btn-warning" : "settings-btn-save"} variant="outline" onClick={toggleComprador}>{selectedBuyerActive ? "Inactivar" : "Activar"}</Button>
              <Button className="settings-btn-danger" variant="outline" disabled title="La eliminacion fisica esta deshabilitada; inactive el comprador para conservar referencias."><Trash2 size={16}/> Quitar</Button>
            </div>
          </div> : <div className="empty-state">Agregue compradores para habilitar la seleccion.</div>}
        </div>
      </CardContent>
    </Card>}

    {activeSection === "catalogos" && <div className="settings-layout">
      <Card>
        <CardContent>
          <div className="toolbar">
            <h2>Catalogos</h2>
            <Button className="settings-btn-add" variant="outline" onClick={addCatalogo}><Plus size={16}/> Nuevo</Button>
          </div>
          <div className="list">
            {catalogos.map((cat) => <button key={cat.id} onClick={() => setSelectedId(cat.id)} className={selected?.id === cat.id ? "selected" : ""}><strong>{cat.nombre}</strong><span>{cat.canal}</span></button>)}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <div className="toolbar">
            <h2>Configuracion del catalogo</h2>
            <div className="toolbar-actions">
              <Button className="settings-btn-save" onClick={() => onSaveCatalogSettings({ catalogos })} disabled={isSyncing || !selected}><Save size={16}/> Guardar catalogos</Button>
              <Button className="settings-btn-danger" variant="outline" onClick={deleteSelected} disabled title="La eliminacion fisica de catalogos esta deshabilitada hasta que el RPC soporte archivado explicito."><Trash2 size={16}/> Borrar</Button>
            </div>
          </div>
          <div className="form-grid">
            <Field label="Nombre del catalogo" value={selected?.nombre || ""} onChange={(v) => updateSelected("nombre", v)}/>
            <div className="division-picker wide">
              <div className="segment-panel-head">
                <div>
                  <strong>Canal</strong>
                  <span>{selectedChannels.length ? selectedChannels.join(", ") : "Seleccione canal"}</span>
                </div>
              </div>
              <div className="segment-chip-list">
                {CATALOG_CHANNEL_OPTIONS.map((channel) => <button key={channel} type="button" className={selectedChannelKeys.has(normalizeCanal(channel)) ? "segment-chip selected" : "segment-chip"} onClick={() => toggleCatalogChannel(channel)}>{channel}</button>)}
              </div>
            </div>
            <div className="division-picker wide">
              <div className="segment-panel-head">
                <div>
                  <strong>Divisiones del catalogo</strong>
                  <span>{selected?.divisiones?.length ? `${selected.divisiones.length} divisiones seleccionadas` : "Todas las divisiones de COMPRADORES incluidas"}</span>
                </div>
                <Button variant="outline" onClick={() => updateSelected("divisiones", [])}>Todas</Button>
              </div>
              <div className="segment-chip-list">
                {divisionOptions.map((division) => <button key={division} type="button" className={selectedDivisionKeys.has(normalizeDivisionKey(division)) ? "segment-chip selected" : "segment-chip"} onClick={() => toggleCatalogDivision(division)}>{division}</button>)}
              </div>
            </div>
            <Field label="Inicio vigencia" value={selected?.vigencia_inicio || ""} onChange={(v) => updateVigencia("vigencia_inicio", v)} type="date"/>
            <Field label="Fin vigencia" value={selected?.vigencia_fin || ""} onChange={(v) => updateVigencia("vigencia_fin", v)} type="date"/>
            <label className="field"><span>Vigencia</span><input value={selected?.vigencia || ""} readOnly /></label>
            <Field label="Documento ID" value={selected?.docId || ""} onChange={(v) => updateSelected("docId", v)}/>
            <Field label="Token de conexion" value={selected?.tokenConexion || ""} onChange={(v) => updateSelected("tokenConexion", v)} type="password"/>
            <label className="field"><span>Estado</span><select value={selected?.estado || "Borrador"} onChange={(e) => updateSelected("estado", e.target.value)}><option>Preliminar</option><option>Activo</option><option>Borrador</option><option>Cerrado</option></select></label>
            <label className="field wide"><span>Correos para notificacion por cambios</span><textarea value={selected?.correos || ""} onChange={(e) => updateSelected("correos", e.target.value)} /></label>
            <div className="switch-row wide"><div><strong>Enviar notificaciones por cambios</strong><p>Aplica cuando se modifica SKU, precio, descuento o logica de promocion.</p></div><button className={selected?.notificaciones ? "switch on" : "switch"} onClick={() => updateSelected("notificaciones", !selected?.notificaciones)}><span/></button></div>
            <div className="switch-row wide"><div><strong>Activar notificaciones en vivo</strong><p>Muestra avisos dentro de la app cuando Compras o Mercadeo guardan cambios relevantes.</p></div><button className={selected?.notificacionesEnvivo !== false && selected?.notificaciones_envivo !== false ? "switch on" : "switch"} onClick={() => updateSelectedFields({ notificacionesEnvivo: !(selected?.notificacionesEnvivo !== false && selected?.notificaciones_envivo !== false), notificaciones_envivo: !(selected?.notificacionesEnvivo !== false && selected?.notificaciones_envivo !== false) })}><span/></button></div>
          </div>
        </CardContent>
      </Card>
    </div>}

    {activeSection === "maestro" && (
      <SkuMasterSettingsCard
        supabaseConnection={supabaseConnection || supabaseSettings}
        supabaseReady={Boolean(supabaseSettings?.url || SUPABASE_PROJECT_URL)}
        onSkuMasterUpdated={onSkuMasterUpdated}
      />
    )}
  </div>;
}
