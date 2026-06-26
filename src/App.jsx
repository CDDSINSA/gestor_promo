import React, { useState } from "react";
import {
  Download,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  LogIn,
  LogOut,
  Search,
} from "lucide-react";
import { loadCatalogFromExcel, loadSkuMasterFromExcel, saveCatalogToExcel } from "./services/excelService";
import {
  hasSupabaseConnection,
  loadCatalogFromSupabase,
  loadLogsFromSupabase,
  loadStoredAppSession,
  loadStoredSupabaseConnection,
  pingSupabaseConnection,
  saveCatalogToSupabase,
  saveSettingsToSupabase,
  saveStoredSupabaseConnection,
  signInAppUser,
  signOutAppUser,
} from "./services/supabaseService";
import {
  catalogosIniciales,
  comentariosIniciales,
  compradoresIniciales,
  LEGACY_EXPORT_PAGE_CARDS,
  MOBILE_NAV_ITEMS,
  responsablesSolicitudesIniciales,
  rowsIniciales,
  SIDEBAR_NAV_ITEMS,
  segmentosClientesIniciales,
} from "./constants";
import {
  classNames,
  makeId,
} from "./utils/common";
import {
  buildNotificacionesFromCatalogos,
  getAvanceCatalogoKey,
  mergeCatalogActivities,
  normalizeCompradorData,
  normalizeResponsableSolicitud,
  normalizeCatalogo,
  readCatalogosFromConfig,
  readCatalogosFromData,
  readJerarquiaCategoriasFromData,
  readResponsablesSolicitudesFromData,
  readSegmentosClientesFromData,
  stripCatalogosConfig,
  toAppComment,
  toAppLog,
  toAppRow,
  toExcelComment,
  toExcelComprador,
  toSheetJerarquiaCategoria,
  toSheetResponsableSolicitud,
  toExcelDetalle,
  toExcelLog,
  toExcelRow,
  toExcelAvanceCatalogo,
  toExcelActividad,
  toAppAvanceCatalogo,
  toSheetCatalogo,
  toSheetSegmentoCliente,
} from "./utils/promoHelpers";
import ConsolidadoPage from './components/ConsolidadoPage';
import AjustesPage from './components/AjustesPage';
import ExportPageV2 from './components/ExportPageV2';
import GestionAvancesPage from './components/GestionAvancesPage';
import HomePage from './components/HomePage';
import PromosPageView from './components/PromosPage';
import PromocionEspecialPage from './components/PromocionEspecialPage';
import SolicitudesEspecialesPageView from './components/SolicitudesEspecialesPage';
import sinsaLogo from "./assets/sinsa.webp";

function Header({ title, subtitle }) {
  return <div className="header"><h1>{title}</h1><p>{subtitle}</p></div>;
}

function Button({ children, className = "", variant = "default", ...props }) {
  return <button className={classNames("btn", variant === "outline" ? "btn-outline" : "btn-primary", className)} {...props}>{children}</button>;
}
function Card({ children, className = "" }) { return <div className={classNames("card", className)}>{children}</div>; }
function CardContent({ children, className = "" }) { return <div className={className}>{children}</div>; }

function AppShell({ active, setActive, currentUser, onLogout }) {
  const [collapsed, setCollapsed] = useState(false);
  const ToggleIcon = collapsed ? ChevronsRight : ChevronsLeft;
  return <aside className={classNames("sidebar", collapsed && "collapsed")}><div className="sidebar-head"><div className="brand"><img className="brand-logo" src={sinsaLogo} alt="SINSA" /><div className="brand-copy"><div>Gestor de Promociones</div></div></div><button type="button" className="sidebar-toggle" onClick={() => setCollapsed((value) => !value)} title={collapsed ? "Expandir menu" : "Replegar menu"} aria-label={collapsed ? "Expandir menu" : "Replegar menu"}><ToggleIcon size={18}/></button></div><nav>{SIDEBAR_NAV_ITEMS.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => setActive(item.id)} className={active === item.id ? "active" : ""} title={collapsed ? item.label : undefined}><Icon size={18}/><span className="nav-label">{item.label}</span></button>; })}</nav><div className="sidebar-session"><span title={currentUser}>{currentUser || "Sesion activa"}</span><button type="button" onClick={onLogout} title="Salir"><LogOut size={18}/><span className="nav-label">Salir</span></button></div></aside>;
}

function MobileNav({ active, setActive }) {
  return <div className="mobile-nav">{MOBILE_NAV_ITEMS.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => setActive(item.id)} className={active === item.id ? "active" : ""}><Icon size={18}/><span>{item.label}</span></button>; })}</div>;
}

function LoginPage({ connection, setConnection, onLogin, loginStatus }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [url, setUrl] = useState(connection.url || "");
  const [anonKey, setAnonKey] = useState(connection.anonKey || "");
  const isLoading = loginStatus.type === "loading";
  const submit = (event) => {
    event.preventDefault();
    const nextConnection = { ...connection, url, anonKey };
    setConnection(nextConnection);
    onLogin(nextConnection, email, password);
  };

  return <div className="login-shell"><Card className="login-card"><CardContent><div className="login-brand"><img className="brand-logo" src={sinsaLogo} alt="SINSA" /><div><h1>Gestor de Promociones</h1><p>Ingrese con su usuario autorizado.</p></div></div><form className="login-form" onSubmit={submit}><label className="field"><span>Correo</span><input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label><label className="field"><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label><label className="field"><span>URL Supabase</span><input value={url} onChange={(event) => setUrl(event.target.value)} /></label><label className="field"><span>Anon key</span><input type="password" value={anonKey} onChange={(event) => setAnonKey(event.target.value)} /></label>{loginStatus.message && <p className={classNames("login-status", loginStatus.type === "error" && "error")}>{loginStatus.message}</p>}<Button type="submit" disabled={isLoading}><LogIn size={16}/> {isLoading ? "Ingresando..." : "Ingresar"}</Button></form></CardContent></Card></div>;
}

function LogsPage({ logs, page, pageSize, hasNextPage, status, driveReady, onConsult, onPrevious, onNext, onPageSizeChange }) {
  const isLoading = status.type === "loading";
  return <div><Header title="Logs de cambios" subtitle="Trazabilidad de modificaciones relevantes por catalogo, comprador y accion."/><Card className="grid-card logs-card"><CardContent><div className="toolbar"><div><h2>Consulta bajo demanda</h2><p>Los logs se descargan solo al presionar consultar.</p></div><div className="toolbar-actions"><select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} disabled={isLoading}><option value={25}>25 filas</option><option value={50}>50 filas</option><option value={100}>100 filas</option></select><Button onClick={() => onConsult(1)} disabled={!driveReady || isLoading}><Search size={16}/> {isLoading ? "Consultando..." : "Consultar"}</Button></div></div>{status.message && <div className={classNames("logs-status", status.type === "error" && "error")}>{status.message}</div>}<div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Usuario</th><th>Catalogo</th><th>Accion</th><th>SKU/Fila</th></tr></thead><tbody>{logs.map((log) => <tr key={log.log_id || `${log.fecha}-${log.accion}`}><td>{log.fecha}</td><td>{log.usuario}</td><td>{log.catalogo}</td><td>{log.accion}</td><td>{log.row_id}</td></tr>)}{!logs.length && <tr><td colSpan={5}><div className="empty-state">Presione consultar para cargar los logs.</div></td></tr>}</tbody></table></div><div className="pagination-bar"><Button variant="outline" onClick={onPrevious} disabled={page <= 1 || isLoading}><ChevronLeft size={16}/> Anterior</Button><span>Pagina {page}</span><Button variant="outline" onClick={onNext} disabled={!hasNextPage || isLoading}>Siguiente <ChevronRight size={16}/></Button></div></CardContent></Card></div>;
}
function ExportPage() { return <div><Header title="Exportaciones" subtitle="Salidas preparadas para Pricing, Mercadeo, Planimetria y futura consolidacion."/><div className="export-grid">{LEGACY_EXPORT_PAGE_CARDS.map(([title, desc]) => <Card key={title}><CardContent><Download size={22}/><h3>{title}</h3><p>{desc}</p><Button>Generar</Button></CardContent></Card>)}</div></div>; }

const PROMOTION_SYNC_FIELDS = [
  "row_id",
  "actividad_id",
  "oferta_id",
  "comprador",
  "division",
  "tipo_promo",
  "grupo_oferta",
  "tipo_sku",
  "variante",
  "dep_id",
  "sku",
  "num_parte",
  "descripcion",
  "tipo_cantidad",
  "cantidad_minima",
  "precio_antes",
  "precio_ahora",
  "descuento",
  "comentario_comprador",
  "aplica_segmento",
  "segmento_cliente",
  "alcance_tipo",
  "alcance_valor",
  "estado_registro",
  "ultima_modificacion_por",
];

const BUYER_SYNC_FIELDS = [
  "comprador_id",
  "categoria_comprador",
  "comprador",
  "division",
  "correo",
  "senior_id",
  "activo",
];

const ACTIVITY_SYNC_FIELDS = [
  "actividad_id",
  "nombre_actividad",
  "tipo_actividad",
  "canal",
  "fecha_inicio",
  "fecha_fin",
  "comprador",
  "solicitante",
  "estado",
  "motivo_solicitud",
  "responsable",
  "recursos_ocupados",
  "promo_ids",
  "oferta_ids",
];

const CATALOG_SYNC_FIELDS = [
  "catalogo_id",
  "nombre",
  "canal",
  "vigencia_inicio",
  "vigencia_fin",
  "estado",
  "color",
  "doc_id",
  "token_conexion",
  "notificaciones",
  "correos",
  "divisiones",
];

const COMMENT_SYNC_FIELDS = [
  "comentario_id",
  "actividad_id",
  "row_id",
  "alcance_comentario",
  "prioridad",
  "usuario",
  "tipo_usuario",
  "comentario",
  "estado",
  "fecha",
  "resuelto_por",
  "fecha_resolucion",
];

const LOG_SYNC_FIELDS = [
  "log_id",
  "fecha",
  "usuario",
  "catalogo",
  "accion",
  "row_id",
  "campo",
  "valor_anterior",
  "valor_nuevo",
  "fecha_cierre",
];

const AVANCE_SYNC_FIELDS = [
  "avance_id",
  "catalogo_id",
  "catalogo",
  "comprador_id",
  "comprador",
  "division",
  "estado",
  "fecha_estado",
  "usuario",
];

const RESPONSABLE_SYNC_FIELDS = [
  "responsable_id",
  "nombre",
  "area",
  "correo",
  "activo",
];

const JERARQUIA_SYNC_FIELDS = [
  "dep_id",
  "dep_desc",
  "division",
  "activo",
];

const SEGMENTO_SYNC_FIELDS = [
  "segmento_id",
  "nombre_segmento",
  "canal",
  "activo",
  "orden",
];

const NOTIFICACION_SYNC_FIELDS = [
  "actividad_id",
  "catalogo_id",
  "correo",
  "activo",
];

function getPromotionSyncId(row) {
  return String(row?.row_id || row?.id || "").trim();
}

function getCommentSyncId(row) {
  return String(row?.comentario_id || row?.id || "").trim();
}

function getLogSyncId(row) {
  return String(row?.log_id || row?.id || "").trim();
}

function getAvanceSyncId(row) {
  return String(row?.avance_id || row?.id || "").trim();
}

function getResponsableSyncId(row) {
  return String(row?.responsable_id || row?.id || "").trim();
}

function getJerarquiaSyncId(row) {
  return String(row?.dep_id || row?.id || "").trim();
}

function getSegmentoSyncId(row) {
  return String(row?.segmento_id || row?.id || "").trim();
}

function getNotificacionSyncId(row) {
  return String(row?.notificacion_id || row?.id || `${row?.actividad_id || row?.catalogo_id || ""}__${row?.correo || ""}`).trim();
}

function ensureLogIds(rows = []) {
  return (rows || []).map((row) => {
    if (row?.log_id || row?.id) return row;
    return { ...row, log_id: makeId("LOG") };
  });
}

function getSyncSignature(row, fields) {
  return JSON.stringify(fields.map((field) => [field, String(row?.[field] ?? "").trim()]));
}

function getPromotionSyncSignature(row) {
  return getSyncSignature(row, PROMOTION_SYNC_FIELDS);
}

function buildPromotionSyncState(promotions = []) {
  const state = new Map();
  promotions.forEach((row) => {
    const normalized = toExcelRow(row);
    const rowId = getPromotionSyncId(normalized);
    if (rowId) state.set(rowId, getPromotionSyncSignature(normalized));
  });
  return state;
}

function buildPromotionSyncOptions(promotions = [], previousState = new Map()) {
  const currentState = buildPromotionSyncState(promotions);
  const changed_row_ids = [];
  const deleted_row_ids = [];

  currentState.forEach((signature, rowId) => {
    if (previousState.get(rowId) !== signature) changed_row_ids.push(rowId);
  });
  previousState.forEach((_, rowId) => {
    if (!currentState.has(rowId)) deleted_row_ids.push(rowId);
  });

  return { changed_row_ids, deleted_row_ids };
}

function buildKeyedSyncState(rows = [], getKey, fields) {
  const state = new Map();
  rows.forEach((row) => {
    const key = String(getKey(row) || "").trim();
    if (key) state.set(key, getSyncSignature(row, fields));
  });
  return state;
}

function buildKeyedSyncOptions(rows = [], previousState = new Map(), getKey, fields) {
  const currentState = buildKeyedSyncState(rows, getKey, fields);
  const changed_ids = [];
  const deleted_ids = [];

  currentState.forEach((signature, key) => {
    if (previousState.get(key) !== signature) changed_ids.push(key);
  });
  previousState.forEach((_, key) => {
    if (!currentState.has(key)) deleted_ids.push(key);
  });

  return { changed_ids, deleted_ids };
}

function buildActivitySyncState(activities = [], catalogos = []) {
  const catalogById = new Map(catalogos.map((catalogo) => [String(catalogo.catalogo_id || catalogo.id || "").trim(), catalogo]));
  const rows = activities.map((activity) => ({
    ...activity,
    ...(catalogById.get(String(activity.actividad_id || "").trim()) || {}),
  }));
  return buildKeyedSyncState(rows, (row) => row.actividad_id, [...ACTIVITY_SYNC_FIELDS, ...CATALOG_SYNC_FIELDS]);
}

function buildActivitySyncOptions(activities = [], catalogos = [], previousState = new Map()) {
  const catalogById = new Map(catalogos.map((catalogo) => [String(catalogo.catalogo_id || catalogo.id || "").trim(), catalogo]));
  const rows = activities.map((activity) => ({
    ...activity,
    ...(catalogById.get(String(activity.actividad_id || "").trim()) || {}),
  }));
  return buildKeyedSyncOptions(rows, previousState, (row) => row.actividad_id, [...ACTIVITY_SYNC_FIELDS, ...CATALOG_SYNC_FIELDS]);
}

export default function PromoMVP() {
  const [active, setActive] = useState("home");
  const [catalogos, setCatalogos] = useState(catalogosIniciales);
  const [catalogoActivo, setCatalogoActivo] = useState(catalogosIniciales[0]);
  const [catalogoAvanceActivo, setCatalogoAvanceActivo] = useState(catalogosIniciales[0]);
  const [actividades, setActividades] = useState(() => mergeCatalogActivities(catalogosIniciales, []));
  const [rows, setRows] = useState(() => rowsIniciales.map(toAppRow));
  const [avanceCatalogos, setAvanceCatalogos] = useState({});
  const [promocionesDetalle, setPromocionesDetalle] = useState([]);
  const [compradores, setCompradores] = useState(() => compradoresIniciales.map(normalizeCompradorData));
  const [responsablesSolicitudes, setResponsablesSolicitudes] = useState(() => responsablesSolicitudesIniciales.map(normalizeResponsableSolicitud));
  const [jerarquiaCategorias, setJerarquiaCategorias] = useState([]);
  const [segmentosClientes, setSegmentosClientes] = useState(segmentosClientesIniciales);
  const [config, setConfig] = useState([]);
  const [notificaciones, setNotificaciones] = useState([]);
  const [skuMaster, setSkuMaster] = useState({});
  const [archivoComprador, setArchivoComprador] = useState(null);
  const [comentarios, setComentarios] = useState(comentariosIniciales);
  const [logs, setLogsState] = useState([]);
  const [consultedLogs, setConsultedLogs] = useState([]);
  const [logsPage, setLogsPage] = useState(1);
  const [logsPageSize, setLogsPageSize] = useState(25);
  const [logsHasNextPage, setLogsHasNextPage] = useState(false);
  const [logsStatus, setLogsStatus] = useState({ type: "idle", message: "Presione consultar para cargar logs." });
  const [driveConnection, setDriveConnection] = useState(loadStoredSupabaseConnection);
  const [driveStatus, setDriveStatus] = useState({ type: "idle", message: "Configure el usuario tecnico para sincronizar con Supabase." });
  const [saveDriveStatus, setSaveDriveStatus] = useState("idle");
  const [isSyncing, setIsSyncing] = useState(false);
  const [appSession, setAppSession] = useState(loadStoredAppSession);
  const [loginStatus, setLoginStatus] = useState({ type: "idle", message: "" });
  const syncedPromotionStateRef = React.useRef(new Map());
  const syncedBuyerStateRef = React.useRef(new Map());
  const syncedActivityStateRef = React.useRef(new Map());
  const syncedCommentStateRef = React.useRef(new Map());
  const syncedLogStateRef = React.useRef(new Map());
  const syncedAvanceStateRef = React.useRef(new Map());
  const syncedResponsableStateRef = React.useRef(new Map());
  const syncedJerarquiaStateRef = React.useRef(new Map());
  const syncedSegmentoStateRef = React.useRef(new Map());
  const syncedNotificacionStateRef = React.useRef(new Map());
  const fileInputRef = React.useRef(null);
  const skuMasterFileInputRef = React.useRef(null);
  const setLogs = React.useCallback((updater) => {
    setLogsState((currentLogs) => ensureLogIds(typeof updater === "function" ? updater(currentLogs) : updater));
  }, []);

  const applyCatalogData = (data) => {
    const nextConfig = data.config || [];
    const nextCatalogos = readCatalogosFromData(data, catalogos);
    setConfig(nextConfig);
    setCatalogos(nextCatalogos);
    setActividades(mergeCatalogActivities(nextCatalogos, data.actividades || []));
    setCatalogoActivo((current) => nextCatalogos.find((cat) => cat.id === current?.id) || nextCatalogos[0] || current);
    setCatalogoAvanceActivo((current) => nextCatalogos.find((cat) => cat.id === current?.id) || nextCatalogos[0] || current);
    setSegmentosClientes(readSegmentosClientesFromData(data));
    setCompradores((data.compradores || []).map(normalizeCompradorData));
    setResponsablesSolicitudes(readResponsablesSolicitudesFromData(data));
    setJerarquiaCategorias(readJerarquiaCategoriasFromData(data));
    setRows((data.promociones || []).map(toAppRow));
    setPromocionesDetalle(data.promociones_detalle || []);
    setComentarios((data.comentarios || []).map(toAppComment));
    setLogs((data.logs || []).map(toAppLog));
    setNotificaciones(data.notificaciones || []);
    const nextAvances = {};
    (data.avances_catalogo || data.avancesCatalogo || []).map(toAppAvanceCatalogo).filter((avance) => avance.terminado).forEach((avance) => {
      nextAvances[getAvanceCatalogoKey(avance.catalogo_id, avance.division, avance.comprador)] = avance;
    });
    setAvanceCatalogos(nextAvances);
  };

  const buildCatalogPayload = (overrides = {}) => {
    const nextCatalogos = overrides.catalogos || catalogos;
    const nextConfig = stripCatalogosConfig(overrides.config || config);
    const nextActividades = mergeCatalogActivities(nextCatalogos, overrides.actividades || actividades);
    const nextCompradores = overrides.compradores || compradores;
    const nextResponsablesSolicitudes = overrides.responsables_solicitudes || responsablesSolicitudes;
    const nextJerarquiaCategorias = overrides.jerarquia_categorias || jerarquiaCategorias;
    const nextAvancesCatalogo = overrides.avances_catalogo || Object.values(avanceCatalogos)
      .map((avance) => toExcelAvanceCatalogo(avance, nextCatalogos, nextCompradores))
      .filter((avance) => avance.estado === "Terminado");
    const nextSegmentosClientes = overrides.segmentos_clientes || segmentosClientes;
    const nextNotificaciones = overrides.notificaciones || buildNotificacionesFromCatalogos(nextCatalogos);
    const normalizedRows = rows.map(toExcelRow);
    const rowsById = new Map(normalizedRows.map((row) => [row.row_id, row]));
    return {
      config: nextConfig,
      catalogos: nextCatalogos.map(toSheetCatalogo),
      actividades: nextActividades.map(toExcelActividad),
      segmentos_clientes: nextSegmentosClientes.map(toSheetSegmentoCliente),
      compradores: nextCompradores.map(toExcelComprador),
      responsables_solicitudes: nextResponsablesSolicitudes.map(toSheetResponsableSolicitud),
      jerarquia_categorias: nextJerarquiaCategorias.map(toSheetJerarquiaCategoria),
      avances_catalogo: nextAvancesCatalogo,
      promociones: normalizedRows,
      promociones_detalle: promocionesDetalle.map((item) => toExcelDetalle(item, rowsById)),
      comentarios: comentarios.map((item) => toExcelComment(item, rowsById)),
      logs: logs.map(toExcelLog),
      notificaciones: nextNotificaciones,
      catalogo_nombre: catalogoActivo?.nombre || "",
    };
  };

  const rememberSyncedPromotions = (promotions = []) => {
    syncedPromotionStateRef.current = buildPromotionSyncState(promotions);
  };

  const rememberSyncedSettings = (data = {}) => {
    const nextCatalogos = readCatalogosFromData(data, catalogos).map(toSheetCatalogo);
    const nextActividades = mergeCatalogActivities(nextCatalogos.map(normalizeCatalogo), data.actividades || []).map(toExcelActividad);
    syncedBuyerStateRef.current = buildKeyedSyncState((data.compradores || []).map(toExcelComprador), (row) => row.comprador, BUYER_SYNC_FIELDS);
    syncedActivityStateRef.current = buildActivitySyncState(nextActividades, nextCatalogos);
    syncedResponsableStateRef.current = buildKeyedSyncState((data.responsables_solicitudes || []).map(toSheetResponsableSolicitud), getResponsableSyncId, RESPONSABLE_SYNC_FIELDS);
    syncedJerarquiaStateRef.current = buildKeyedSyncState((data.jerarquia_categorias || []).map(toSheetJerarquiaCategoria), getJerarquiaSyncId, JERARQUIA_SYNC_FIELDS);
    syncedSegmentoStateRef.current = buildKeyedSyncState((data.segmentos_clientes || []).map(toSheetSegmentoCliente), getSegmentoSyncId, SEGMENTO_SYNC_FIELDS);
    syncedNotificacionStateRef.current = buildKeyedSyncState(data.notificaciones || [], getNotificacionSyncId, NOTIFICACION_SYNC_FIELDS);
  };

  const rememberSyncedOperations = (data = {}) => {
    const rowsById = new Map((data.promociones || []).map((row) => [row.row_id || row.id, row]));
    syncedCommentStateRef.current = buildKeyedSyncState((data.comentarios || []).map((item) => toExcelComment(item, rowsById)), getCommentSyncId, COMMENT_SYNC_FIELDS);
    syncedLogStateRef.current = buildKeyedSyncState((data.logs || []).map(toExcelLog), getLogSyncId, LOG_SYNC_FIELDS);
    syncedAvanceStateRef.current = buildKeyedSyncState((data.avances_catalogo || data.avancesCatalogo || []).map((item) => toExcelAvanceCatalogo(item)), getAvanceSyncId, AVANCE_SYNC_FIELDS);
  };

  const rememberSyncedPayload = (payload = {}) => {
    rememberSyncedPromotions(payload.promociones || []);
    rememberSyncedSettings(payload);
    rememberSyncedOperations(payload);
  };

  const resetSyncedState = () => {
    syncedPromotionStateRef.current = new Map();
    syncedBuyerStateRef.current = new Map();
    syncedActivityStateRef.current = new Map();
    syncedCommentStateRef.current = new Map();
    syncedLogStateRef.current = new Map();
    syncedAvanceStateRef.current = new Map();
    syncedResponsableStateRef.current = new Map();
    syncedJerarquiaStateRef.current = new Map();
    syncedSegmentoStateRef.current = new Map();
    syncedNotificacionStateRef.current = new Map();
  };

  const buildSupabasePayload = (overrides = {}) => {
    const payload = buildCatalogPayload(overrides);
    return {
      ...payload,
      sync_options: {
        return_mode: "delta",
        promociones: buildPromotionSyncOptions(payload.promociones, syncedPromotionStateRef.current),
        compradores: buildKeyedSyncOptions(payload.compradores, syncedBuyerStateRef.current, (row) => row.comprador, BUYER_SYNC_FIELDS),
        actividades: buildActivitySyncOptions(payload.actividades, payload.catalogos, syncedActivityStateRef.current),
        comentarios: buildKeyedSyncOptions(payload.comentarios, syncedCommentStateRef.current, getCommentSyncId, COMMENT_SYNC_FIELDS),
        logs: buildKeyedSyncOptions(payload.logs, syncedLogStateRef.current, getLogSyncId, LOG_SYNC_FIELDS),
        avances_catalogo: buildKeyedSyncOptions(payload.avances_catalogo, syncedAvanceStateRef.current, getAvanceSyncId, AVANCE_SYNC_FIELDS),
        responsables_solicitudes: buildKeyedSyncOptions(payload.responsables_solicitudes, syncedResponsableStateRef.current, getResponsableSyncId, RESPONSABLE_SYNC_FIELDS),
        jerarquia_categorias: buildKeyedSyncOptions(payload.jerarquia_categorias, syncedJerarquiaStateRef.current, getJerarquiaSyncId, JERARQUIA_SYNC_FIELDS),
        segmentos_clientes: buildKeyedSyncOptions(payload.segmentos_clientes, syncedSegmentoStateRef.current, getSegmentoSyncId, SEGMENTO_SYNC_FIELDS),
        notificaciones: buildKeyedSyncOptions(payload.notificaciones, syncedNotificacionStateRef.current, getNotificacionSyncId, NOTIFICACION_SYNC_FIELDS),
      },
    };
  };

  const runDriveOperation = async (loadingMessage, operation, successMessage) => {
    setIsSyncing(true);
    setDriveStatus({ type: "loading", message: loadingMessage });
    try {
      const result = await operation();
      setDriveStatus({ type: "ready", message: successMessage });
      return result;
    } catch (error) {
      setDriveStatus({ type: "error", message: error.message || "No se pudo completar la operacion." });
      return null;
    } finally {
      setIsSyncing(false);
    }
  };

  const onLogin = async (connection, email, password) => {
    setLoginStatus({ type: "loading", message: "Validando usuario..." });
    try {
      const savedConnection = saveStoredSupabaseConnection(connection);
      setDriveConnection(savedConnection);
      const session = await signInAppUser(savedConnection, email, password);
      setAppSession(session);
      setLoginStatus({ type: "ready", message: "" });
    } catch (error) {
      setLoginStatus({ type: "error", message: error.message || "No se pudo iniciar sesion." });
    }
  };

  const onLogout = () => {
    signOutAppUser();
    setAppSession(null);
    setLoginStatus({ type: "idle", message: "" });
  };

  const onConsultLogs = async (page = logsPage, pageSize = logsPageSize) => {
    if (!hasSupabaseConnection(driveConnection)) {
      setLogsStatus({ type: "error", message: "Configure Supabase antes de consultar logs." });
      return;
    }
    setLogsStatus({ type: "loading", message: "Consultando logs..." });
    try {
      const data = await loadLogsFromSupabase(driveConnection, { page, pageSize });
      const nextLogs = (data.logs || []).map(toAppLog);
      setConsultedLogs(nextLogs);
      setLogsPage(data.page || page);
      setLogsHasNextPage(Boolean(data.has_next_page));
      setLogsStatus({ type: "ready", message: nextLogs.length ? "Logs cargados." : "No hay logs para esta pagina." });
    } catch (error) {
      setLogsStatus({ type: "error", message: error.message || "No se pudieron consultar los logs." });
    }
  };

  const onLogsPageSizeChange = (nextPageSize) => {
    setLogsPageSize(nextPageSize);
    onConsultLogs(1, nextPageSize);
  };

  const onSaveDriveSettings = () => {
    const saved = saveStoredSupabaseConnection(driveConnection);
    setDriveConnection(saved);
    setDriveStatus({
      type: hasSupabaseConnection(saved) ? "ready" : "idle",
      message: hasSupabaseConnection(saved) ? "Conexion guardada. Ya puede probar o cargar desde Supabase." : "Complete URL, anon key y usuario tecnico para activar Supabase.",
    });
  };

  const onTestDriveConnection = async () => {
    const saved = saveStoredSupabaseConnection(driveConnection);
    setDriveConnection(saved);
    await runDriveOperation("Probando conexion con Supabase...", () => pingSupabaseConnection(saved), "Conexion con Supabase verificada.");
  };

  const onSetupDriveWorkbook = async () => {
    const saved = saveStoredSupabaseConnection(driveConnection);
    setDriveConnection(saved);
    await runDriveOperation("Validando sesion tecnica en Supabase...", () => pingSupabaseConnection(saved), "Sesion tecnica de Supabase lista.");
  };

  const onSaveCatalogSettings = async (settings = {}) => {
    const nextConfig = stripCatalogosConfig(config);
    const nextCatalogos = (settings.catalogos || catalogos).map(normalizeCatalogo);
    const nextCompradores = (settings.compradores || compradores).map(normalizeCompradorData);
    setConfig(nextConfig);
    setCatalogos(nextCatalogos);
    setCompradores(nextCompradores);
    if (!hasSupabaseConnection(driveConnection)) {
      setDriveStatus({ type: "ready", message: "Ajustes guardados en la app. Configure Supabase para sincronizarlos." });
      return;
    }
    setSaveDriveStatus("saving");
    const payload = buildSupabasePayload({ config: nextConfig, catalogos: nextCatalogos, compradores: nextCompradores });
    const data = await runDriveOperation("Guardando ajustes en Supabase...", () => saveSettingsToSupabase(driveConnection, payload), "Ajustes guardados en Supabase.");
    if (data) {
      if (data.sync_mode === "delta") {
        rememberSyncedPayload(payload);
      } else {
        applyCatalogData(data);
        rememberSyncedPromotions(data.promociones || []);
        rememberSyncedSettings(data);
        rememberSyncedOperations(data);
      }
      setSaveDriveStatus("success");
    } else {
      setSaveDriveStatus("error");
    }
  };

  const onDeleteCatalogo = (catalogoId) => {
    setCatalogos((prev) => {
      const remaining = prev.filter((cat) => cat.id !== catalogoId);
      setCatalogoActivo((current) => current?.id === catalogoId ? remaining[0] || current : current);
      setCatalogoAvanceActivo((current) => current?.id === catalogoId ? remaining[0] || current : current);
      return remaining.length ? remaining : prev;
    });
  };

  const openAvances = (catalogo) => {
    setCatalogoAvanceActivo(catalogo);
    setCatalogoActivo(catalogo);
    setActive("avances");
  };

  const onLoadDrive = async () => {
    const data = await runDriveOperation("Cargando catalogo desde Supabase...", () => loadCatalogFromSupabase(driveConnection), "Catalogo cargado desde Supabase.");
    if (data) {
      applyCatalogData(data);
      rememberSyncedPromotions(data.promociones || []);
      rememberSyncedSettings(data);
      rememberSyncedOperations(data);
    }
  };

  const onSaveDrive = async () => {
    setSaveDriveStatus("saving");
    const payload = buildSupabasePayload();
    const data = await runDriveOperation("Guardando cambios en Supabase...", () => saveCatalogToSupabase(driveConnection, payload), "Cambios guardados en Supabase.");
    if (data) {
      if (data.sync_mode === "delta") {
        rememberSyncedPayload(payload);
      } else {
        applyCatalogData(data);
        rememberSyncedPromotions(data.promociones || []);
        rememberSyncedSettings(data);
        rememberSyncedOperations(data);
      }
      setSaveDriveStatus("success");
    } else {
      setSaveDriveStatus("error");
    }
  };

  const onLoadExcel = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const data = await loadCatalogFromExcel(file);
      applyCatalogData(data);
      resetSyncedState();
      setDriveStatus({ type: "ready", message: `Excel cargado: ${file.name}` });
    } catch (error) {
      setDriveStatus({ type: "error", message: error.message || "No se pudo cargar el Excel." });
    } finally {
      event.target.value = "";
    }
  };

  const onLoadSkuMaster = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const data = await loadSkuMasterFromExcel(file);
    setSkuMaster(data.skuMaster);
    setArchivoComprador({ nombre:file.name, total:data.items.length, hoja:data.sheetName });
    event.target.value = "";
  };

  const onSaveExcel = async () => {
    try {
      await saveCatalogToExcel(buildCatalogPayload());
      setDriveStatus({ type: "ready", message: "Excel exportado correctamente." });
    } catch (error) {
      setDriveStatus({ type: "error", message: error.message || "No se pudo exportar el Excel." });
    }
  };

  if (!appSession?.access_token) {
    return <LoginPage connection={driveConnection} setConnection={setDriveConnection} onLogin={onLogin} loginStatus={loginStatus}/>;
  }

  const currentUser = appSession.user_email || appSession.user?.email || "";

  return <div className="app">
    <AppShell active={active} setActive={setActive} currentUser={currentUser} onLogout={onLogout}/>
    <main>
      {active === "home" && <HomePage catalogos={catalogos} rows={rows} rowsCount={rows.length} logsCount={consultedLogs.length} setActive={setActive} setCatalogoActivo={setCatalogoActivo} onOpenAvances={openAvances} onLoadExcel={onLoadExcel} onSaveExcel={onSaveExcel} onLoadDrive={onLoadDrive} onSaveDrive={onSaveDrive} driveConnection={driveConnection} driveStatus={driveStatus} isSyncing={isSyncing} fileInputRef={fileInputRef}/>}
      {active === "avances" && <GestionAvancesPage catalogo={catalogoAvanceActivo} rows={rows} compradores={compradores} jerarquiaCategorias={jerarquiaCategorias} avances={avanceCatalogos} setAvanceCatalogos={setAvanceCatalogos} setLogs={setLogs} onSaveDrive={onSaveDrive} driveReady={hasSupabaseConnection(driveConnection)} saveDriveStatus={saveDriveStatus} isSyncing={isSyncing} onBack={() => setActive("home")} onOpenCatalogo={(catalogo) => { setCatalogoActivo(catalogo); setActive("promos"); }}/>}
      {active === "ajustes" && <AjustesPage catalogos={catalogos} setCatalogos={setCatalogos} compradores={compradores} setCompradores={setCompradores} driveConnection={driveConnection} setDriveConnection={setDriveConnection} onSaveDriveSettings={onSaveDriveSettings} onSaveCatalogSettings={onSaveCatalogSettings} onDeleteCatalogo={onDeleteCatalogo} onTestDriveConnection={onTestDriveConnection} onSetupDriveWorkbook={onSetupDriveWorkbook} driveStatus={driveStatus} isSyncing={isSyncing}/>}
      {active === "promos" && <PromosPageView catalogoActivo={catalogoActivo} rows={rows} setRows={setRows} comentarios={comentarios} setComentarios={setComentarios} compradores={compradores} jerarquiaCategorias={jerarquiaCategorias} segmentosClientes={segmentosClientes} skuMaster={skuMaster} setLogs={setLogs} onLoadSkuMaster={onLoadSkuMaster} skuMasterFileInputRef={skuMasterFileInputRef} archivoComprador={archivoComprador} onSaveDrive={onSaveDrive} driveReady={hasSupabaseConnection(driveConnection)} saveDriveStatus={saveDriveStatus} isSyncing={isSyncing} avanceCatalogos={avanceCatalogos} setAvanceCatalogos={setAvanceCatalogos}/>}
      {active === "especial" && <PromocionEspecialPage actividades={actividades} setActividades={setActividades} rows={rows} setRows={setRows} comentarios={comentarios} setComentarios={setComentarios} compradores={compradores} jerarquiaCategorias={jerarquiaCategorias} segmentosClientes={segmentosClientes} skuMaster={skuMaster} setLogs={setLogs} onLoadSkuMaster={onLoadSkuMaster} skuMasterFileInputRef={skuMasterFileInputRef} archivoComprador={archivoComprador} onSaveDrive={onSaveDrive} driveReady={hasSupabaseConnection(driveConnection)} saveDriveStatus={saveDriveStatus} isSyncing={isSyncing} catalogos={catalogos}/>}
      {active === "solicitudes" && <SolicitudesEspecialesPageView actividades={actividades} setActividades={setActividades} rows={rows} responsablesSolicitudes={responsablesSolicitudes} setLogs={setLogs} setActive={setActive} onSaveDrive={onSaveDrive} driveReady={hasSupabaseConnection(driveConnection)} saveDriveStatus={saveDriveStatus} isSyncing={isSyncing}/>}
      {active === "logs" && <LogsPage logs={consultedLogs} page={logsPage} pageSize={logsPageSize} hasNextPage={logsHasNextPage} status={logsStatus} driveReady={hasSupabaseConnection(driveConnection)} onConsult={onConsultLogs} onPrevious={() => onConsultLogs(Math.max(1, logsPage - 1))} onNext={() => onConsultLogs(logsPage + 1)} onPageSizeChange={onLogsPageSizeChange}/>}
      {active === "consolidado" && <ConsolidadoPage rows={rows} actividades={actividades} comentarios={comentarios} setComentarios={setComentarios} compradores={compradores}/>}
      {active === "export" && <ExportPageV2 rows={rows} actividades={actividades} comentarios={comentarios}/>}
    </main>
    <MobileNav active={active} setActive={setActive}/>
  </div>;
}








