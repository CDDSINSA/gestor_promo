import React, { useEffect, useMemo, useState } from "react";
import {
  Download,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowLeft,
  KeyRound,
  LogIn,
  LogOut,
  Mail,
  ShieldAlert,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  X,
} from "lucide-react";
import { loadCatalogFromExcel, loadSkuMasterFromExcel, saveCatalogToExcel } from "./services/excelService";
import {
  hasSupabaseConnection,
  loadAppUserProfile,
  loadCatalogFromSupabase,
  loadLogsFromSupabase,
  loadAuthUserFromSession,
  loadStoredAppSession,
  loadStoredSupabaseConnection,
  requestPasswordRecovery,
  pingSupabaseConnection,
  saveCatalogToSupabase,
  saveSettingsToSupabase,
  saveStoredSupabaseConnection,
  signInAppUser,
  signOutAppUser,
  updateRecoveredPassword,
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
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import ConsolidadoPage from './components/ConsolidadoPage';
import ConsultaSkuPage from './components/ConsultaSkuPage';
import AjustesPage from './components/AjustesPage';
import ExportPageV2 from './components/ExportPageV2';
import GestionAvancesPage from './components/GestionAvancesPage';
import HomePage from './components/HomePage';
import CatalogDesignPage from './components/CatalogDesignPage';
import PromosPageView from './components/PromosPage';
import PromocionEspecialPage from './components/PromocionEspecialPage';
import SolicitudesEspecialesPageView from './components/SolicitudesEspecialesPage';
import sinsaLogo from "./assets/sinsa.webp";
import { canAccessModule, getFirstAllowedModule, MODULE_PERMISSIONS, normalizeRole, ROLE_LABELS } from "./constants/permissions";
import { usePermissions } from "./hooks/usePermissions";

function Header({ title, subtitle }) {
  return <div className="header"><h1>{title}</h1><p>{subtitle}</p></div>;
}

function Button({ children, className = "", variant = "default", ...props }) {
  return <button className={classNames("btn", variant === "outline" ? "btn-outline" : "btn-primary", className)} {...props}>{children}</button>;
}
function Card({ children, className = "" }) { return <div className={classNames("card", className)}>{children}</div>; }
function CardContent({ children, className = "" }) { return <div className={className}>{children}</div>; }
function ModalButton({ children, className = "", variant = "default", ...props }) {
  return <button className={classNames("btn", variant === "outline" ? "btn-outline" : "btn-primary", className)} {...props}>{children}</button>;
}

function ConfirmModal({ title, description, note, confirmLabel = "Confirmar", cancelLabel = "Cancelar", icon: Icon = AlertTriangle, onConfirm, onCancel }) {
  return <div className="modal-backdrop" role="presentation"><div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="save-confirm-title"><div className="modal-head"><div><h2 id="save-confirm-title">{title}</h2><p>{description}</p></div><button type="button" className="icon-btn" onClick={onCancel} aria-label="Cerrar confirmacion"><X size={18}/></button></div><div className="modal-body"><p className="modal-note"><Icon size={16}/> {note}</p></div><div className="modal-actions"><ModalButton variant="outline" onClick={onCancel}>{cancelLabel}</ModalButton><ModalButton onClick={onConfirm}>{confirmLabel}</ModalButton></div></div></div>;
}

function SuccessToast({ toast, onClose }) {
  if (!toast) return null;
  return <div className="success-toast" role="status" aria-live="polite"><div className="success-toast-icon"><CheckCircle2 size={18}/></div><div className="success-toast-copy"><strong>{toast.title}</strong><span>{toast.message}</span></div><button type="button" className="success-toast-close" onClick={onClose} aria-label="Cerrar mensaje"><X size={16}/></button></div>;
}

function AppShell({ active, setActive, currentUser, currentRole, onLogout }) {
  const [collapsed, setCollapsed] = useState(false);
  const { can } = usePermissions();
  const ToggleIcon = collapsed ? ChevronsRight : ChevronsLeft;
  const visibleItems = SIDEBAR_NAV_ITEMS.filter((item) => can(item.permission));
  const roleLabel = ROLE_LABELS[currentRole] || currentRole || "Sesion activa";
  return <aside className={classNames("sidebar", collapsed && "collapsed")}><div className="sidebar-head"><div className="brand"><img className="brand-logo" src={sinsaLogo} alt="SINSA" /><div className="brand-copy"><div>Gestor de Promociones</div></div></div><button type="button" className="sidebar-toggle" onClick={() => setCollapsed((value) => !value)} title={collapsed ? "Expandir menu" : "Replegar menu"} aria-label={collapsed ? "Expandir menu" : "Replegar menu"}><ToggleIcon size={18}/></button></div><nav>{visibleItems.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => setActive(item.id)} className={active === item.id ? "active" : ""} title={collapsed ? item.label : undefined}><Icon size={18}/><span className="nav-label">{item.label}</span></button>; })}</nav><div className="sidebar-session"><span title={`${currentUser} - ${roleLabel}`}>{currentUser || roleLabel}</span><button type="button" onClick={onLogout} title="Salir"><LogOut size={18}/><span className="nav-label">Salir</span></button></div></aside>;
}

function MobileNav({ active, setActive }) {
  const { can } = usePermissions();
  const visibleItems = MOBILE_NAV_ITEMS.filter((item) => can(item.permission));
  return <div className="mobile-nav">{visibleItems.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => setActive(item.id)} className={active === item.id ? "active" : ""}><Icon size={18}/><span>{item.label}</span></button>; })}</div>;
}

function parseRecoverySessionFromLocation() {
  if (typeof window === "undefined") return null;
  const fragments = [];
  if (window.location.hash) fragments.push(window.location.hash.replace(/^#/, ""));
  if (window.location.search) fragments.push(window.location.search.replace(/^\?/, ""));
  const params = new URLSearchParams(fragments.join("&"));
  const type = String(params.get("type") || "").trim().toLowerCase();
  const accessToken = String(params.get("access_token") || "").trim();
  if (type !== "recovery" || !accessToken) return null;
  const expiresAtRaw = String(params.get("expires_at") || "").trim();
  const expiresInRaw = String(params.get("expires_in") || "").trim();
  const expiresAt = expiresAtRaw
    ? (Number(expiresAtRaw) > 1e12 ? Number(expiresAtRaw) : Number(expiresAtRaw) * 1000)
    : Date.now() + Number(expiresInRaw || 3600) * 1000;
  return {
    access_token: accessToken,
    refresh_token: String(params.get("refresh_token") || "").trim(),
    expires_at: Number.isNaN(expiresAt) ? Date.now() + 3600 * 1000 : expiresAt,
    token_type: String(params.get("token_type") || "bearer").trim(),
    type: "recovery",
    user_email: String(params.get("email") || "").trim(),
  };
}

function clearAuthTokensFromUrl() {
  if (typeof window === "undefined" || !window.history?.replaceState) return;
  const nextUrl = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState({}, document.title, nextUrl);
}

function AuthBrand({ message }) {
  return <div className="login-brand"><img className="brand-logo" src={sinsaLogo} alt="SINSA" /><div><h1>Gestor de Promociones</h1><p>{message}</p></div></div>;
}

function LoginPage({ onLogin, onForgotPassword, loginStatus, connectionStatus }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const isLoading = loginStatus.type === "loading";
  const submit = (event) => {
    event.preventDefault();
    onLogin(email, password);
  };

  return <div className="login-shell"><Card className="login-card"><CardContent><AuthBrand message="Ingrese con su usuario autorizado." /><form className="login-form" onSubmit={submit}><label className="field"><span>Correo</span><input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label><label className="field"><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>{connectionStatus && <p className="login-status">{connectionStatus}</p>}{loginStatus.message && <p className={classNames("login-status", loginStatus.type === "error" && "error")}>{loginStatus.message}</p>}<div className="button-row"><Button type="submit" disabled={isLoading}><LogIn size={16}/> {isLoading ? "Ingresando..." : "Ingresar"}</Button><Button type="button" variant="outline" onClick={onForgotPassword} disabled={isLoading}><KeyRound size={16}/> Olvide mi contraseña</Button></div></form></CardContent></Card></div>;
}

function ForgotPasswordPage({ onSubmit, onBack, recoveryStatus, connectionStatus }) {
  const [email, setEmail] = useState("");
  const isLoading = recoveryStatus.type === "loading";
  const submit = (event) => {
    event.preventDefault();
    onSubmit(email);
  };

  return <div className="login-shell"><Card className="login-card"><CardContent><AuthBrand message="Recupere el acceso con su correo corporativo." /><form className="login-form" onSubmit={submit}><label className="field"><span>Correo</span><input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label><p className="login-status"><Mail size={14}/> Se enviara un enlace para crear una nueva contraseña.</p>{connectionStatus && <p className="login-status">{connectionStatus}</p>}{recoveryStatus.message && <p className={classNames("login-status", recoveryStatus.type === "error" && "error", recoveryStatus.type === "success" && "success")}>{recoveryStatus.message}</p>}<div className="button-row"><Button type="button" variant="outline" onClick={onBack} disabled={isLoading}><ArrowLeft size={16}/> Volver</Button><Button type="submit" disabled={isLoading}><RefreshCw size={16}/> {isLoading ? "Enviando..." : "Enviar enlace"}</Button></div></form></CardContent></Card></div>;
}

function ResetPasswordPage({ recoverySession, recoveryUser, onSubmit, onBack, recoveryStatus, connectionStatus }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const isLoading = recoveryStatus.type === "loading";
  const email = recoveryUser?.email || recoverySession?.user_email || "";
  const submit = (event) => {
    event.preventDefault();
    onSubmit(password, confirmPassword);
  };

  return <div className="login-shell"><Card className="login-card"><CardContent><AuthBrand message="Defina una nueva contraseña para continuar." /><form className="login-form" onSubmit={submit}><div className="recovery-info"><ShieldAlert size={16}/> {email ? `Restableciendo acceso para ${email}` : "Restableciendo acceso con enlace de recuperacion."}</div><label className="field"><span>Nueva contraseña</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" /></label><label className="field"><span>Confirmar contraseña</span><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" /></label>{connectionStatus && <p className="login-status">{connectionStatus}</p>}{recoveryStatus.message && <p className={classNames("login-status", recoveryStatus.type === "error" && "error", recoveryStatus.type === "success" && "success")}>{recoveryStatus.message}</p>}<div className="button-row"><Button type="button" variant="outline" onClick={onBack} disabled={isLoading}><ArrowLeft size={16}/> Volver</Button><Button type="submit" disabled={isLoading}><KeyRound size={16}/> {isLoading ? "Guardando..." : "Actualizar contraseña"}</Button></div></form></CardContent></Card></div>;
}

function AuthLoadingPage({ message = "Cargando permisos..." }) {
  return <div className="login-shell"><Card className="login-card"><CardContent><AuthBrand message={message} /></CardContent></Card></div>;
}

function LogsPage({ logs, page, pageSize, hasNextPage, status, supabaseReady, onConsult, onPrevious, onNext, onPageSizeChange }) {
  const isLoading = status.type === "loading";
  return <div><Header title="Logs de cambios" subtitle="Trazabilidad de modificaciones relevantes por catalogo, comprador y accion."/><Card className="grid-card logs-card"><CardContent><div className="toolbar"><div><h2>Consulta bajo demanda</h2><p>Los logs se descargan solo al presionar consultar.</p></div><div className="toolbar-actions"><select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} disabled={isLoading}><option value={25}>25 filas</option><option value={50}>50 filas</option><option value={100}>100 filas</option></select><Button onClick={() => onConsult(1)} disabled={!supabaseReady || isLoading}><Search size={16}/> {isLoading ? "Consultando..." : "Consultar"}</Button></div></div>{status.message && <div className={classNames("logs-status", status.type === "error" && "error")}>{status.message}</div>}<div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Usuario</th><th>Catalogo</th><th>Accion</th><th>SKU/Fila</th></tr></thead><tbody>{logs.map((log) => <tr key={log.log_id || `${log.fecha}-${log.accion}`}><td>{log.fecha}</td><td>{log.usuario}</td><td>{log.catalogo}</td><td>{log.accion}</td><td>{log.row_id}</td></tr>)}{!logs.length && <tr><td colSpan={5}><div className="empty-state">Presione consultar para cargar los logs.</div></td></tr>}</tbody></table></div><div className="pagination-bar"><Button variant="outline" onClick={onPrevious} disabled={page <= 1 || isLoading}><ChevronLeft size={16}/> Anterior</Button><span>Pagina {page}</span><Button variant="outline" onClick={onNext} disabled={!hasNextPage || isLoading}>Siguiente <ChevronRight size={16}/></Button></div></CardContent></Card></div>;
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
  const [supabaseSettings, setSupabaseSettings] = useState(loadStoredSupabaseConnection);
  const [supabaseStatus, setSupabaseStatus] = useState({ type: "idle", message: "Configure Supabase para sincronizar datos." });
  const [saveSupabaseStatus, setSaveSupabaseStatus] = useState("idle");
  const [isSyncing, setIsSyncing] = useState(false);
  const [appSession, setAppSession] = useState(loadStoredAppSession);
  const [appUser, setAppUser] = useState(null);
  const [authStatus, setAuthStatus] = useState({ type: "idle", message: "" });
  const [loginStatus, setLoginStatus] = useState({ type: "idle", message: "" });
  const [recoveryStatus, setRecoveryStatus] = useState({ type: "idle", message: "" });
  const [authScreen, setAuthScreen] = useState("login");
  const [recoverySession, setRecoverySession] = useState(null);
  const [recoveryUser, setRecoveryUser] = useState(null);
  const [pendingSaveAction, setPendingSaveAction] = useState(null);
  const [successToast, setSuccessToast] = useState(null);
  const initialLoadSessionRef = React.useRef("");
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
  const supabaseConnection = useMemo(() => ({
    ...supabaseSettings,
    session: appSession,
    appUser,
  }), [supabaseSettings, appSession, appUser]);

  const requestSupabaseSaveConfirmation = (payload) => {
    if (isSyncing) return;
    setPendingSaveAction(payload);
  };

  const showSuccessToast = (message, title = "Cambios guardados") => {
    setSuccessToast({ id: Date.now(), title, message });
  };

  const executePendingSaveAction = async () => {
    const current = pendingSaveAction;
    if (!current) return;
    setPendingSaveAction(null);
    try {
      await current.action();
    } catch (error) {
      setSupabaseStatus({ type: "error", message: error.message || "No se pudo completar el guardado." });
    }
  };

  useEffect(() => {
    const nextRecoverySession = parseRecoverySessionFromLocation();
    if (!nextRecoverySession) return;
    clearAuthTokensFromUrl();
    setAuthScreen("reset");
    setRecoverySession(nextRecoverySession);
    setRecoveryUser(null);
    setLoginStatus({ type: "idle", message: "" });
    setRecoveryStatus({ type: "loading", message: "Validando enlace de recuperacion..." });
    let cancelled = false;
    loadAuthUserFromSession(supabaseSettings, nextRecoverySession)
      .then((user) => {
        if (cancelled) return;
        setRecoveryUser(user);
        setRecoveryStatus({ type: "idle", message: "" });
      })
      .catch((error) => {
        if (cancelled) return;
        setRecoveryStatus({ type: "error", message: error.message || "No se pudo validar el enlace de recuperacion." });
      });
    return () => {
      cancelled = true;
    };
  }, [supabaseSettings]);

  useEffect(() => {
    if (!successToast) return undefined;
    const timeoutId = window.setTimeout(() => setSuccessToast(null), 3600);
    return () => window.clearTimeout(timeoutId);
  }, [successToast]);

  useEffect(() => {
    if (!appSession?.access_token) {
      setAppUser(null);
      setAuthStatus({ type: "idle", message: "" });
      initialLoadSessionRef.current = "";
      return;
    }
    let cancelled = false;
    setAuthStatus({ type: "loading", message: "Cargando permisos..." });
    loadAppUserProfile(supabaseSettings, appSession)
      .then((profile) => {
        if (cancelled) return;
        setAppUser(profile);
        setAuthStatus({ type: "ready", message: "" });
      })
      .catch((error) => {
        if (cancelled) return;
        signOutAppUser();
        setAppSession(null);
        setAppUser(null);
        setAuthStatus({ type: "error", message: error.message || "No se pudieron cargar los permisos." });
        setLoginStatus({ type: "error", message: error.message || "No se pudieron cargar los permisos." });
      });
    return () => {
      cancelled = true;
    };
  }, [appSession, supabaseSettings]);

  useEffect(() => {
    if (!appSession?.access_token || !appUser?.activo) return;
    if (!hasSupabaseConnection(supabaseConnection)) {
      setSupabaseStatus({ type: "error", message: "Faltan variables de entorno de Supabase para cargar los datos automaticamente." });
      return;
    }
    if (initialLoadSessionRef.current === appSession.access_token) return;
    initialLoadSessionRef.current = appSession.access_token;
    void onLoadSupabase();
  }, [appSession, appUser, supabaseConnection]);

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

  const runSupabaseOperation = async (loadingMessage, operation, successMessage) => {
    setIsSyncing(true);
    setSupabaseStatus({ type: "loading", message: loadingMessage });
    try {
      const result = await operation();
      setSupabaseStatus({ type: "ready", message: successMessage });
      return result;
    } catch (error) {
      setSupabaseStatus({ type: "error", message: error.message || "No se pudo completar la operacion." });
      return null;
    } finally {
      setIsSyncing(false);
    }
  };

  const onLogin = async (email, password) => {
    setLoginStatus({ type: "loading", message: "Validando usuario..." });
    try {
      const savedConnection = saveStoredSupabaseConnection(supabaseSettings);
      setSupabaseSettings(savedConnection);
      const session = await signInAppUser(savedConnection, email, password);
      const profile = await loadAppUserProfile(savedConnection, session);
      setAppUser(profile);
      setAppSession(session);
      setLoginStatus({ type: "ready", message: "" });
    } catch (error) {
      setLoginStatus({ type: "error", message: error.message || "No se pudo iniciar sesion." });
    }
  };

  const onRequestPasswordRecovery = async (email) => {
    setRecoveryStatus({ type: "loading", message: "Enviando enlace de recuperacion..." });
    try {
      const savedConnection = saveStoredSupabaseConnection(supabaseSettings);
      setSupabaseSettings(savedConnection);
      await requestPasswordRecovery(savedConnection, email);
      setRecoveryStatus({ type: "success", message: "Si el correo existe, recibira un enlace para restablecer la contraseña." });
      setLoginStatus({ type: "idle", message: "" });
    } catch (error) {
      setRecoveryStatus({ type: "error", message: error.message || "No se pudo enviar el enlace de recuperacion." });
    }
  };

  const onResetPassword = async (password, confirmPassword) => {
    if (password !== confirmPassword) {
      setRecoveryStatus({ type: "error", message: "Las contraseñas no coinciden." });
      return;
    }
    setRecoveryStatus({ type: "loading", message: "Actualizando contraseña..." });
    try {
      const savedConnection = saveStoredSupabaseConnection(supabaseSettings);
      setSupabaseSettings(savedConnection);
      await updateRecoveredPassword(savedConnection, recoverySession, password);
      signOutAppUser();
      setAppSession(null);
      setAppUser(null);
      setRecoverySession(null);
      setAuthScreen("login");
      setRecoveryStatus({ type: "idle", message: "" });
      setLoginStatus({ type: "success", message: "Contraseña actualizada. Ya puede iniciar sesion con la nueva contraseña." });
    } catch (error) {
      setRecoveryStatus({ type: "error", message: error.message || "No se pudo actualizar la contraseña." });
    }
  };

  const onLogout = () => {
    signOutAppUser();
    setAppSession(null);
    setAppUser(null);
    setAuthStatus({ type: "idle", message: "" });
    setLoginStatus({ type: "idle", message: "" });
    setRecoveryStatus({ type: "idle", message: "" });
    setRecoverySession(null);
    setRecoveryUser(null);
    setAuthScreen("login");
    initialLoadSessionRef.current = "";
  };

  const onConsultLogs = async (page = logsPage, pageSize = logsPageSize) => {
    if (!hasSupabaseConnection(supabaseConnection)) {
      setLogsStatus({ type: "error", message: "Configure Supabase antes de consultar logs." });
      return;
    }
    setLogsStatus({ type: "loading", message: "Consultando logs..." });
    try {
      const data = await loadLogsFromSupabase(supabaseConnection, { page, pageSize });
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

  const onSaveSupabaseSettings = () => {
    const saved = saveStoredSupabaseConnection(supabaseSettings);
    setSupabaseSettings(saved);
    setSupabaseStatus({
      type: hasSupabaseConnection(saved) ? "ready" : "idle",
      message: hasSupabaseConnection(saved) ? "Conexion guardada. Ya puede probar o cargar desde Supabase." : "Complete URL y anon key para activar Supabase.",
    });
    showSuccessToast("La configuracion de conexion se guardo correctamente.", "Conexion guardada");
  };

  const onTestSupabaseConnection = async () => {
    const saved = saveStoredSupabaseConnection(supabaseSettings);
    setSupabaseSettings(saved);
    await runSupabaseOperation("Probando conexion con Supabase...", () => pingSupabaseConnection({ ...saved, session: appSession }), "Conexion con Supabase verificada.");
  };

  const onValidateSupabaseSession = async () => {
    const saved = saveStoredSupabaseConnection(supabaseSettings);
    setSupabaseSettings(saved);
    await runSupabaseOperation("Validando sesion de Supabase...", () => pingSupabaseConnection({ ...saved, session: appSession }), "Sesion de Supabase lista.");
  };

  const onSaveCatalogSettings = async (settings = {}) => {
    const nextConfig = stripCatalogosConfig(config);
    const nextCatalogos = (settings.catalogos || catalogos).map(normalizeCatalogo);
    const nextCompradores = (settings.compradores || compradores).map(normalizeCompradorData);
    setConfig(nextConfig);
    setCatalogos(nextCatalogos);
    setCompradores(nextCompradores);
    if (!hasSupabaseConnection(supabaseConnection)) {
      setSupabaseStatus({ type: "ready", message: "Ajustes guardados en la app. Configure Supabase para sincronizarlos." });
      showSuccessToast("Los ajustes quedaron guardados en la aplicacion.", "Ajustes guardados");
      return;
    }
    setSaveSupabaseStatus("saving");
    const payload = buildSupabasePayload({ config: nextConfig, catalogos: nextCatalogos, compradores: nextCompradores });
    const data = await runSupabaseOperation("Guardando ajustes en Supabase...", () => saveSettingsToSupabase(supabaseConnection, payload), "Ajustes guardados en Supabase.");
    if (data) {
      if (data.sync_mode === "delta") {
        rememberSyncedPayload(payload);
      } else {
        applyCatalogData(data);
        rememberSyncedPromotions(data.promociones || []);
        rememberSyncedSettings(data);
        rememberSyncedOperations(data);
      }
      setSaveSupabaseStatus("success");
      showSuccessToast("Compradores y catalogos se sincronizaron correctamente.", "Ajustes guardados");
    } else {
      setSaveSupabaseStatus("error");
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

  const onLoadSupabase = async () => {
    const data = await runSupabaseOperation("Cargando catalogo desde Supabase...", () => loadCatalogFromSupabase(supabaseConnection), "Catalogo cargado desde Supabase.");
    if (data) {
      applyCatalogData(data);
      rememberSyncedPromotions(data.promociones || []);
      rememberSyncedSettings(data);
      rememberSyncedOperations(data);
    }
    return data;
  };

  const onSaveSupabase = async () => {
    setSaveSupabaseStatus("saving");
    const payload = buildSupabasePayload();
    const data = await runSupabaseOperation("Guardando cambios en Supabase...", () => saveCatalogToSupabase(supabaseConnection, payload), "Cambios guardados en Supabase.");
    if (data) {
      if (data.sync_mode === "delta") {
        rememberSyncedPayload(payload);
      } else {
        applyCatalogData(data);
        rememberSyncedPromotions(data.promociones || []);
        rememberSyncedSettings(data);
        rememberSyncedOperations(data);
      }
      setSaveSupabaseStatus("success");
      showSuccessToast("La informacion se sincronizo correctamente en Supabase.");
    } else {
      setSaveSupabaseStatus("error");
    }
  };

  const onRequestSaveSupabase = () => requestSupabaseSaveConfirmation({
    title: "Confirmar guardado",
    description: "Vas a guardar los cambios del catalogo en Supabase.",
    note: "Este guardado sincroniza promociones, comentarios, avances y ajustes relacionados.",
    confirmLabel: "Guardar Supabase",
    action: onSaveSupabase,
  });

  const onRequestSaveSupabaseSettings = () => requestSupabaseSaveConfirmation({
    title: "Confirmar ajustes",
    description: "Vas a guardar los ajustes de conexión en Supabase.",
    note: "La conexión se actualizará con los valores actuales de la pantalla de Ajustes.",
    confirmLabel: "Guardar Supabase",
    action: onSaveSupabaseSettings,
  });

  const onRequestSaveCatalogSettings = (settings = {}) => requestSupabaseSaveConfirmation({
    title: "Confirmar guardado",
    description: "Vas a guardar compradores y catalogos en Supabase.",
    note: "Este cambio impacta la estructura base del sistema y luego sincroniza el catálogo.",
    confirmLabel: "Guardar Supabase",
    action: () => onSaveCatalogSettings(settings),
  });

  const onLoadExcel = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const data = await loadCatalogFromExcel(file);
      applyCatalogData(data);
      resetSyncedState();
      setSupabaseStatus({ type: "ready", message: `Excel cargado: ${file.name}` });
    } catch (error) {
      setSupabaseStatus({ type: "error", message: error.message || "No se pudo cargar el Excel." });
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
      setSupabaseStatus({ type: "ready", message: "Excel exportado correctamente." });
      showSuccessToast("El archivo Excel se genero correctamente.", "Exportacion lista");
    } catch (error) {
      setSupabaseStatus({ type: "error", message: error.message || "No se pudo exportar el Excel." });
    }
  };

  const currentRole = normalizeRole(appUser?.rol || "");
  const authValue = useMemo(() => ({
    appSession,
    appUser,
    role: currentRole,
    isAuthenticated: Boolean(appSession?.access_token && appUser?.activo !== false),
  }), [appSession, appUser, currentRole]);

  useEffect(() => {
    if (!currentRole || canAccessModule(currentRole, active)) return;
    setActive(getFirstAllowedModule(currentRole, SIDEBAR_NAV_ITEMS));
  }, [active, currentRole]);

  if (!appSession?.access_token) {
    if (authScreen === "forgot") {
      return <ForgotPasswordPage onSubmit={onRequestPasswordRecovery} onBack={() => { setAuthScreen("login"); setRecoveryStatus({ type: "idle", message: "" }); }} recoveryStatus={recoveryStatus} connectionStatus={hasSupabaseConnection(supabaseSettings) ? "" : "Faltan variables de entorno de Supabase en este entorno."}/>;
    }
    if (authScreen === "reset") {
      return <ResetPasswordPage recoverySession={recoverySession} recoveryUser={recoveryUser} onSubmit={onResetPassword} onBack={() => { clearAuthTokensFromUrl(); setRecoverySession(null); setRecoveryUser(null); setRecoveryStatus({ type: "idle", message: "" }); setAuthScreen("login"); }} recoveryStatus={recoveryStatus} connectionStatus={hasSupabaseConnection(supabaseSettings) ? "" : "Faltan variables de entorno de Supabase en este entorno."}/>;
    }
    return <LoginPage onLogin={onLogin} onForgotPassword={() => { setRecoveryStatus({ type: "idle", message: "" }); setAuthScreen("forgot"); }} loginStatus={loginStatus} connectionStatus={hasSupabaseConnection(supabaseSettings) ? "" : "Faltan variables de entorno de Supabase en este entorno."}/>;
  }

  if (!appUser) {
    return <AuthLoadingPage message={authStatus.message || "Cargando permisos..."}/>;
  }

  const currentUser = appSession.user_email || appSession.user?.email || "";
  const saveSupabaseDataLabel = pendingSaveAction?.confirmLabel || "Guardar";

  return <AuthProvider value={authValue}><div className="app">
    <AppShell active={active} setActive={setActive} currentUser={currentUser} currentRole={currentRole} onLogout={onLogout}/>
    <main>
      {active === "home" && <ProtectedRoute permission={MODULE_PERMISSIONS.home}><HomePage catalogos={catalogos} rows={rows} actividades={actividades} comentarios={comentarios} compradores={compradores} jerarquiaCategorias={jerarquiaCategorias} rowsCount={rows.length} logsCount={consultedLogs.length} setActive={setActive} setCatalogoActivo={setCatalogoActivo} onOpenAvances={openAvances} onLoadExcel={onLoadExcel} onSaveExcel={onSaveExcel} onLoadSupabase={onLoadSupabase} supabaseSettings={supabaseSettings} supabaseStatus={supabaseStatus} isSyncing={isSyncing} fileInputRef={fileInputRef}/></ProtectedRoute>}
      {active === "avances" && <ProtectedRoute permission={MODULE_PERMISSIONS.avances}><GestionAvancesPage catalogo={catalogoAvanceActivo} rows={rows} compradores={compradores} jerarquiaCategorias={jerarquiaCategorias} avances={avanceCatalogos} setAvanceCatalogos={setAvanceCatalogos} setLogs={setLogs} onSaveSupabase={onRequestSaveSupabase} supabaseReady={hasSupabaseConnection(supabaseSettings)} saveSupabaseStatus={saveSupabaseStatus} isSyncing={isSyncing} onBack={() => setActive("home")} onOpenCatalogo={(catalogo) => { setCatalogoActivo(catalogo); setActive("promos"); }}/></ProtectedRoute>}
      {active === "ajustes" && <ProtectedRoute permission={MODULE_PERMISSIONS.ajustes}><AjustesPage catalogos={catalogos} setCatalogos={setCatalogos} compradores={compradores} setCompradores={setCompradores} supabaseSettings={supabaseSettings} setSupabaseSettings={setSupabaseSettings} onSaveSupabaseSettings={onRequestSaveSupabaseSettings} onSaveCatalogSettings={onRequestSaveCatalogSettings} onDeleteCatalogo={onDeleteCatalogo} onTestSupabaseConnection={onTestSupabaseConnection} onValidateSupabaseSession={onValidateSupabaseSession} supabaseStatus={supabaseStatus} isSyncing={isSyncing}/></ProtectedRoute>}
      {active === "promos" && <ProtectedRoute permission={MODULE_PERMISSIONS.promos}><PromosPageView catalogoActivo={catalogoActivo} rows={rows} setRows={setRows} comentarios={comentarios} setComentarios={setComentarios} compradores={compradores} jerarquiaCategorias={jerarquiaCategorias} segmentosClientes={segmentosClientes} skuMaster={skuMaster} setLogs={setLogs} onLoadSkuMaster={onLoadSkuMaster} skuMasterFileInputRef={skuMasterFileInputRef} archivoComprador={archivoComprador} onSaveSupabase={onRequestSaveSupabase} supabaseReady={hasSupabaseConnection(supabaseSettings)} saveSupabaseStatus={saveSupabaseStatus} isSyncing={isSyncing} avanceCatalogos={avanceCatalogos} setAvanceCatalogos={setAvanceCatalogos}/></ProtectedRoute>}
      {active === "consulta" && <ProtectedRoute permission={MODULE_PERMISSIONS.consulta}><ConsultaSkuPage rows={rows} actividades={actividades}/></ProtectedRoute>}
      {active === "especial" && <ProtectedRoute permission={MODULE_PERMISSIONS.especial}><PromocionEspecialPage actividades={actividades} setActividades={setActividades} rows={rows} setRows={setRows} comentarios={comentarios} setComentarios={setComentarios} compradores={compradores} jerarquiaCategorias={jerarquiaCategorias} segmentosClientes={segmentosClientes} skuMaster={skuMaster} setLogs={setLogs} onLoadSkuMaster={onLoadSkuMaster} skuMasterFileInputRef={skuMasterFileInputRef} archivoComprador={archivoComprador} onSaveSupabase={onRequestSaveSupabase} supabaseReady={hasSupabaseConnection(supabaseSettings)} saveSupabaseStatus={saveSupabaseStatus} isSyncing={isSyncing} catalogos={catalogos}/></ProtectedRoute>}
      {active === "solicitudes" && <ProtectedRoute permission={MODULE_PERMISSIONS.solicitudes}><SolicitudesEspecialesPageView actividades={actividades} setActividades={setActividades} rows={rows} responsablesSolicitudes={responsablesSolicitudes} setLogs={setLogs} setActive={setActive} onSaveSupabase={onRequestSaveSupabase} supabaseReady={hasSupabaseConnection(supabaseSettings)} saveSupabaseStatus={saveSupabaseStatus} isSyncing={isSyncing}/></ProtectedRoute>}
      {active === "catalogDesign" && <ProtectedRoute permission={MODULE_PERMISSIONS.catalogDesign}><CatalogDesignPage catalogos={catalogos} supabaseConnection={supabaseConnection} supabaseReady={hasSupabaseConnection(supabaseConnection)}/></ProtectedRoute>}
      {active === "logs" && <ProtectedRoute permission={MODULE_PERMISSIONS.logs}><LogsPage logs={consultedLogs} page={logsPage} pageSize={logsPageSize} hasNextPage={logsHasNextPage} status={logsStatus} supabaseReady={hasSupabaseConnection(supabaseSettings)} onConsult={onConsultLogs} onPrevious={() => onConsultLogs(Math.max(1, logsPage - 1))} onNext={() => onConsultLogs(logsPage + 1)} onPageSizeChange={onLogsPageSizeChange}/></ProtectedRoute>}
      {active === "consolidado" && <ProtectedRoute permission={MODULE_PERMISSIONS.consolidado}><ConsolidadoPage rows={rows} actividades={actividades} catalogos={catalogos} comentarios={comentarios} setComentarios={setComentarios} compradores={compradores} onSaveSupabase={onRequestSaveSupabase} supabaseReady={hasSupabaseConnection(supabaseSettings)} saveSupabaseStatus={saveSupabaseStatus} isSyncing={isSyncing}/></ProtectedRoute>}
      {active === "export" && <ProtectedRoute permission={MODULE_PERMISSIONS.export}><ExportPageV2 rows={rows} actividades={actividades} comentarios={comentarios}/></ProtectedRoute>}
    </main>
    <MobileNav active={active} setActive={setActive}/>
    <SuccessToast toast={successToast} onClose={() => setSuccessToast(null)}/>
    {pendingSaveAction && <ConfirmModal
      title={pendingSaveAction.title || "Confirmar guardado"}
      description={pendingSaveAction.description || "Vas a guardar cambios en Supabase."}
      note={pendingSaveAction.note || "Este paso sincroniza los cambios con la base de datos y puede tardar unos segundos."}
      confirmLabel={saveSupabaseDataLabel}
      cancelLabel="Cancelar"
      onConfirm={executePendingSaveAction}
      onCancel={() => setPendingSaveAction(null)}
    />}
  </div></AuthProvider>;
}








