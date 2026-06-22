import React, { useState } from "react";
import {
  Download,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { loadCatalogFromExcel, loadSkuMasterFromExcel, saveCatalogToExcel } from "./services/excelService";
import {
  hasDriveConnection,
  loadCatalogFromDrive,
  loadStoredDriveConnection,
  pingDriveConnection,
  saveCatalogToDrive,
  saveSettingsToDrive,
  saveStoredDriveConnection,
  setupDriveWorkbook,
} from "./services/googleSheetsService";
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

function AppShell({ active, setActive }) {
  const [collapsed, setCollapsed] = useState(false);
  const ToggleIcon = collapsed ? ChevronsRight : ChevronsLeft;
  return <aside className={classNames("sidebar", collapsed && "collapsed")}><div className="sidebar-head"><div className="brand"><img className="brand-logo" src={sinsaLogo} alt="SINSA" /><div className="brand-copy"><div>Gestor de Promociones</div></div></div><button type="button" className="sidebar-toggle" onClick={() => setCollapsed((value) => !value)} title={collapsed ? "Expandir menu" : "Replegar menu"} aria-label={collapsed ? "Expandir menu" : "Replegar menu"}><ToggleIcon size={18}/></button></div><nav>{SIDEBAR_NAV_ITEMS.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => setActive(item.id)} className={active === item.id ? "active" : ""} title={collapsed ? item.label : undefined}><Icon size={18}/><span className="nav-label">{item.label}</span></button>; })}</nav></aside>;
}

function MobileNav({ active, setActive }) {
  return <div className="mobile-nav">{MOBILE_NAV_ITEMS.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => setActive(item.id)} className={active === item.id ? "active" : ""}><Icon size={18}/><span>{item.label}</span></button>; })}</div>;
}

function LogsPage({ logs }) { return <div><Header title="Logs de cambios" subtitle="Trazabilidad de modificaciones relevantes por catálogo, comprador y acción."/><Card className="grid-card"><CardContent><table><thead><tr><th>Fecha</th><th>Usuario</th><th>Catálogo</th><th>Acción</th></tr></thead><tbody>{logs.map((log, i) => <tr key={i}><td>{log.fecha}</td><td>{log.usuario}</td><td>{log.catalogo}</td><td>{log.accion}</td></tr>)}</tbody></table></CardContent></Card></div>; }
function ExportPage() { return <div><Header title="Exportaciones" subtitle="Salidas preparadas para Pricing, Mercadeo, Planimetria y futura consolidacion."/><div className="export-grid">{LEGACY_EXPORT_PAGE_CARDS.map(([title, desc]) => <Card key={title}><CardContent><Download size={22}/><h3>{title}</h3><p>{desc}</p><Button>Generar</Button></CardContent></Card>)}</div></div>; }

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
  const [logs, setLogs] = useState([{ fecha:"28/05/2026, 08:20", usuario:"Marcela Torrez", catalogo:"Bifoliar Junio 2026", accion:"Agregó combo-1 con SKU principal 100001" }, { fecha:"28/05/2026, 08:12", usuario:"Marcela Torrez", catalogo:"Bifoliar Junio 2026", accion:"Modificó descuento del SKU 200001" }]);
  const [driveConnection, setDriveConnection] = useState(loadStoredDriveConnection);
  const [driveStatus, setDriveStatus] = useState({ type: "idle", message: "Configure la URL /exec de Apps Script para usar Google Sheets." });
  const [saveDriveStatus, setSaveDriveStatus] = useState("idle");
  const [isSyncing, setIsSyncing] = useState(false);
  const fileInputRef = React.useRef(null);
  const skuMasterFileInputRef = React.useRef(null);

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

  const onSaveDriveSettings = () => {
    const saved = saveStoredDriveConnection(driveConnection);
    setDriveConnection(saved);
    setDriveStatus({
      type: hasDriveConnection(saved) ? "ready" : "idle",
      message: hasDriveConnection(saved) ? "Conexion guardada. Ya puede probar o cargar desde Drive." : "Pegue la URL /exec de Apps Script para activar Drive.",
    });
  };

  const onTestDriveConnection = async () => {
    const saved = saveStoredDriveConnection(driveConnection);
    setDriveConnection(saved);
    await runDriveOperation("Probando conexion con Apps Script...", () => pingDriveConnection(saved), "Conexion con Google Sheets verificada.");
  };

  const onSetupDriveWorkbook = async () => {
    const saved = saveStoredDriveConnection(driveConnection);
    setDriveConnection(saved);
    await runDriveOperation("Preparando hojas requeridas en Google Sheets...", () => setupDriveWorkbook(saved), "Hojas requeridas listas en Google Sheets.");
  };

  const onSaveCatalogSettings = async (settings = {}) => {
    const nextConfig = stripCatalogosConfig(config);
    const nextCatalogos = (settings.catalogos || catalogos).map(normalizeCatalogo);
    const nextCompradores = (settings.compradores || compradores).map(normalizeCompradorData);
    setConfig(nextConfig);
    setCatalogos(nextCatalogos);
    setCompradores(nextCompradores);
    if (!hasDriveConnection(driveConnection)) {
      setDriveStatus({ type: "ready", message: "Ajustes guardados en la app. Configure Drive para sincronizarlos con Google Sheets." });
      return;
    }
    setSaveDriveStatus("saving");
    const data = await runDriveOperation("Guardando ajustes en Google Sheets...", () => saveSettingsToDrive(driveConnection, buildCatalogPayload({ config: nextConfig, catalogos: nextCatalogos, compradores: nextCompradores })), "Ajustes guardados en Google Sheets.");
    if (data) {
      applyCatalogData(data);
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
    const data = await runDriveOperation("Cargando catalogo desde Google Sheets...", () => loadCatalogFromDrive(driveConnection), "Catalogo cargado desde Google Sheets.");
    if (data) applyCatalogData(data);
  };

  const onSaveDrive = async () => {
    setSaveDriveStatus("saving");
    const data = await runDriveOperation("Guardando cambios en Google Sheets...", () => saveCatalogToDrive(driveConnection, buildCatalogPayload()), "Cambios guardados y vistas regeneradas en Google Sheets.");
    if (data) {
      applyCatalogData(data);
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

  return <div className="app">
    <AppShell active={active} setActive={setActive}/>
    <main>
      {active === "home" && <HomePage catalogos={catalogos} rows={rows} rowsCount={rows.length} logsCount={logs.length} setActive={setActive} setCatalogoActivo={setCatalogoActivo} onOpenAvances={openAvances} onLoadExcel={onLoadExcel} onSaveExcel={onSaveExcel} onLoadDrive={onLoadDrive} onSaveDrive={onSaveDrive} driveConnection={driveConnection} driveStatus={driveStatus} isSyncing={isSyncing} fileInputRef={fileInputRef}/>}
      {active === "avances" && <GestionAvancesPage catalogo={catalogoAvanceActivo} rows={rows} compradores={compradores} jerarquiaCategorias={jerarquiaCategorias} avances={avanceCatalogos} setAvanceCatalogos={setAvanceCatalogos} setLogs={setLogs} onSaveDrive={onSaveDrive} driveReady={hasDriveConnection(driveConnection)} saveDriveStatus={saveDriveStatus} isSyncing={isSyncing} onBack={() => setActive("home")} onOpenCatalogo={(catalogo) => { setCatalogoActivo(catalogo); setActive("promos"); }}/>}
      {active === "ajustes" && <AjustesPage catalogos={catalogos} setCatalogos={setCatalogos} compradores={compradores} setCompradores={setCompradores} driveConnection={driveConnection} setDriveConnection={setDriveConnection} onSaveDriveSettings={onSaveDriveSettings} onSaveCatalogSettings={onSaveCatalogSettings} onDeleteCatalogo={onDeleteCatalogo} onTestDriveConnection={onTestDriveConnection} onSetupDriveWorkbook={onSetupDriveWorkbook} driveStatus={driveStatus} isSyncing={isSyncing}/>}
      {active === "promos" && <PromosPageView catalogoActivo={catalogoActivo} rows={rows} setRows={setRows} comentarios={comentarios} setComentarios={setComentarios} compradores={compradores} jerarquiaCategorias={jerarquiaCategorias} segmentosClientes={segmentosClientes} skuMaster={skuMaster} setLogs={setLogs} onLoadSkuMaster={onLoadSkuMaster} skuMasterFileInputRef={skuMasterFileInputRef} archivoComprador={archivoComprador} onSaveDrive={onSaveDrive} driveReady={hasDriveConnection(driveConnection)} saveDriveStatus={saveDriveStatus} isSyncing={isSyncing} avanceCatalogos={avanceCatalogos} setAvanceCatalogos={setAvanceCatalogos}/>}
      {active === "especial" && <PromocionEspecialPage actividades={actividades} setActividades={setActividades} rows={rows} setRows={setRows} comentarios={comentarios} setComentarios={setComentarios} compradores={compradores} jerarquiaCategorias={jerarquiaCategorias} segmentosClientes={segmentosClientes} skuMaster={skuMaster} setLogs={setLogs} onLoadSkuMaster={onLoadSkuMaster} skuMasterFileInputRef={skuMasterFileInputRef} archivoComprador={archivoComprador} onSaveDrive={onSaveDrive} driveReady={hasDriveConnection(driveConnection)} saveDriveStatus={saveDriveStatus} isSyncing={isSyncing} catalogos={catalogos}/>}
      {active === "solicitudes" && <SolicitudesEspecialesPageView actividades={actividades} setActividades={setActividades} rows={rows} responsablesSolicitudes={responsablesSolicitudes} setLogs={setLogs} setActive={setActive} onSaveDrive={onSaveDrive} driveReady={hasDriveConnection(driveConnection)} saveDriveStatus={saveDriveStatus} isSyncing={isSyncing}/>}
      {active === "logs" && <LogsPage logs={logs}/>}
      {active === "consolidado" && <ConsolidadoPage rows={rows} actividades={actividades} comentarios={comentarios} setComentarios={setComentarios} compradores={compradores}/>}
      {active === "export" && <ExportPageV2 rows={rows} actividades={actividades} comentarios={comentarios}/>}
    </main>
    <MobileNav active={active} setActive={setActive}/>
  </div>;
}








