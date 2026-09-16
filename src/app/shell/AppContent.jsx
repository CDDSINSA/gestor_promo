import React, { Suspense } from "react";
import ProtectedRoute from "../../components/ProtectedRoute";
import LogsPage from "../../components/LogsPage";
import { MODULE_PERMISSIONS } from "../../constants/permissions";

const ConsolidadoPage = React.lazy(() => import("../../components/ConsolidadoPage"));
const ConsultaSkuPage = React.lazy(() => import("../../components/ConsultaSkuPage"));
const AjustesPage = React.lazy(() => import("../../components/AjustesPage"));
const ExportPageV2 = React.lazy(() => import("../../components/ExportPageV2"));
const GestionAvancesPage = React.lazy(() => import("../../components/GestionAvancesPage"));
const HomePage = React.lazy(() => import("../../components/HomePage"));
const CatalogDesignPage = React.lazy(() => import("../../components/CatalogDesignPage"));
const SeguimientoGanttPage = React.lazy(() => import("../../components/SeguimientoGanttPage"));
const PromosPageView = React.lazy(() => import("../../components/PromosPage"));
const PromocionEspecialPage = React.lazy(() => import("../../components/PromocionEspecialPage"));
const SolicitudesEspecialesPageView = React.lazy(() => import("../../components/SolicitudesEspecialesPage"));
const FidelizacionPage = React.lazy(() => import("../../components/FidelizacionPage"));
import ErrorBoundary from "../../components/ErrorBoundary";

function LoadingScreen() {
  return <div className="empty-state">Cargando modulo...</div>;
}

export default function AppContent({
  active, catalogData, promotionData, masterData, connectionData, logsData, navigation, actions,
}) {
  const {
    catalogos, setCatalogos, catalogoActivo, setCatalogoActivo, catalogoAvanceActivo,
    actividades, setActividades, compradores, setCompradores, jerarquiaCategorias,
    segmentosClientes, catalogoResumen, responsablesSolicitudes
  } = catalogData;
  const {
    rows, setRows, comentarios, setComentarios, avanceCatalogos, setAvanceCatalogos, setLogs
  } = promotionData;
  const {
    skuMaster, skuMasterCount, skuMasterStatus, loadSkuMasterFromRemote, cancelSkuMasterLoad
  } = masterData;
  const {
    supabaseSettings, setSupabaseSettings, supabaseConnection, supabaseSettingsReady,
    supabaseConnectionReady, supabaseStatus, isSyncing, saveSupabaseStatus,
    promotionScopeRefreshStatus, specialRequestsRefreshStatus
  } = connectionData;
  const {
    consultedLogs, logsPage, logsPageSize, logsHasNextPage, logsStatus,
    onConsultLogs, onLogsPageSizeChange
  } = logsData;
  const {
    setActive, navigate, openAvances
  } = navigation;
  const {
    onLoadExcel, onSaveExcel, fileInputRef, onLoadSupabase,
    onRequestSaveSupabase, onSaveSupabase, refreshPromotionScopeFromSupabase,
    onRequestSaveSupabaseSettings, onRequestSaveCatalogSettings, onDeleteCatalogo,
    onTestSupabaseConnection, onValidateSupabaseSession, resolveSpecialActivityIds
  } = actions;

  return (
      <ErrorBoundary onNavigateHome={() => navigate("home")}>
        <Suspense fallback={<LoadingScreen />}>
        {active === "home" && <ProtectedRoute permission={MODULE_PERMISSIONS.home}><HomePage catalogos={catalogos} rows={rows} actividades={actividades} comentarios={comentarios} compradores={compradores} jerarquiaCategorias={jerarquiaCategorias} catalogoResumen={catalogoResumen} rowsCount={rows.length} logsCount={consultedLogs.length} setActive={setActive} setCatalogoActivo={setCatalogoActivo} onOpenAvances={openAvances} onLoadExcel={onLoadExcel} onSaveExcel={onSaveExcel} onLoadSupabase={onLoadSupabase} supabaseSettings={supabaseSettings} supabaseReady={supabaseSettingsReady} supabaseStatus={supabaseStatus} isSyncing={isSyncing} fileInputRef={fileInputRef}/></ProtectedRoute>}
        {active === "fidelizacion" && <ProtectedRoute permission={MODULE_PERMISSIONS.fidelizacion}><FidelizacionPage actividades={actividades} setActividades={setActividades} compradores={compradores} jerarquiaCategorias={jerarquiaCategorias} segmentosClientes={segmentosClientes} skuMaster={skuMaster} skuMasterCount={skuMasterCount} supabaseConnection={supabaseConnection} supabaseReady={supabaseConnectionReady} setActive={navigate} rows={rows}/></ProtectedRoute>}
        {active === "avances" && <ProtectedRoute permission={MODULE_PERMISSIONS.avances}><GestionAvancesPage catalogo={catalogoAvanceActivo} rows={rows} catalogoResumen={catalogoResumen} compradores={compradores} jerarquiaCategorias={jerarquiaCategorias} avances={avanceCatalogos} setAvanceCatalogos={setAvanceCatalogos} setLogs={setLogs} onSaveSupabase={onRequestSaveSupabase} supabaseReady={supabaseSettingsReady} saveSupabaseStatus={saveSupabaseStatus} isSyncing={isSyncing} onBack={() => setActive("home")} onOpenCatalogo={(catalogo) => { setCatalogoActivo(catalogo); setActive("promos"); }}/></ProtectedRoute>}
        {active === "ajustes" && <ProtectedRoute permission={MODULE_PERMISSIONS.ajustes}><AjustesPage catalogos={catalogos} setCatalogos={setCatalogos} compradores={compradores} setCompradores={setCompradores} rows={rows} actividades={actividades} supabaseSettings={supabaseSettings} setSupabaseSettings={setSupabaseSettings} supabaseConnection={supabaseConnection} onSkuMasterUpdated={loadSkuMasterFromRemote} onSaveExcel={onSaveExcel} onSaveSupabaseSettings={onRequestSaveSupabaseSettings} onSaveCatalogSettings={onRequestSaveCatalogSettings} onDeleteCatalogo={onDeleteCatalogo} onTestSupabaseConnection={onTestSupabaseConnection} onValidateSupabaseSession={onValidateSupabaseSession} supabaseStatus={supabaseStatus} isSyncing={isSyncing}/></ProtectedRoute>}
        {active === "promos" && <ProtectedRoute permission={MODULE_PERMISSIONS.promos}><PromosPageView catalogoActivo={catalogoActivo} rows={rows} setRows={setRows} comentarios={comentarios} setComentarios={setComentarios} compradores={compradores} jerarquiaCategorias={jerarquiaCategorias} segmentosClientes={segmentosClientes} skuMaster={skuMaster} skuMasterCount={skuMasterCount} setLogs={setLogs} skuMasterStatus={skuMasterStatus} onRefreshSkuMaster={loadSkuMasterFromRemote} onCancelSkuMaster={cancelSkuMasterLoad} onSaveSupabase={onRequestSaveSupabase} onSaveSupabaseDirect={onSaveSupabase} onRefreshPromotionScope={refreshPromotionScopeFromSupabase} promotionScopeRefreshStatus={promotionScopeRefreshStatus} supabaseReady={supabaseSettingsReady} saveSupabaseStatus={saveSupabaseStatus} isSyncing={isSyncing} avanceCatalogos={avanceCatalogos} setAvanceCatalogos={setAvanceCatalogos}/></ProtectedRoute>}
        {active === "consulta" && <ProtectedRoute permission={MODULE_PERMISSIONS.consulta}><ConsultaSkuPage rows={rows} actividades={actividades}/></ProtectedRoute>}
        {active === "especial" && <ProtectedRoute permission={MODULE_PERMISSIONS.especial}><PromocionEspecialPage actividades={actividades} setActividades={setActividades} rows={rows} setRows={setRows} comentarios={comentarios} setComentarios={setComentarios} compradores={compradores} jerarquiaCategorias={jerarquiaCategorias} segmentosClientes={segmentosClientes} skuMaster={skuMaster} skuMasterCount={skuMasterCount} setLogs={setLogs} onSaveSupabase={onRequestSaveSupabase} onSaveSupabaseDirect={onSaveSupabase} supabaseReady={supabaseSettingsReady} onResolveSpecialActivityIds={resolveSpecialActivityIds} saveSupabaseStatus={saveSupabaseStatus} isSyncing={isSyncing} catalogos={catalogos} setActive={navigate}/></ProtectedRoute>}
        {active === "solicitudes" && <ProtectedRoute permission={MODULE_PERMISSIONS.solicitudes}><SolicitudesEspecialesPageView actividades={actividades} setActividades={setActividades} rows={rows} setRows={setRows} comentarios={comentarios} setComentarios={setComentarios} compradores={compradores} jerarquiaCategorias={jerarquiaCategorias} segmentosClientes={segmentosClientes} skuMaster={skuMaster} skuMasterCount={skuMasterCount} skuMasterStatus={skuMasterStatus} onRefreshSkuMaster={loadSkuMasterFromRemote} onCancelSkuMaster={cancelSkuMasterLoad} responsablesSolicitudes={responsablesSolicitudes} setLogs={setLogs} setActive={setActive} onSaveSupabase={onRequestSaveSupabase} onSaveSupabaseDirect={onSaveSupabase} supabaseReady={supabaseSettingsReady} supabaseConnection={supabaseConnection} saveSupabaseStatus={saveSupabaseStatus} isSyncing={isSyncing} refreshStatus={specialRequestsRefreshStatus}/></ProtectedRoute>}
        {active === "seguimiento" && <ProtectedRoute permission={MODULE_PERMISSIONS.seguimiento}><SeguimientoGanttPage actividades={actividades} rows={rows} catalogos={catalogos}/></ProtectedRoute>}
        {active === "catalogDesign" && <ProtectedRoute permission={MODULE_PERMISSIONS.catalogDesign}><CatalogDesignPage catalogos={catalogos} rows={rows} supabaseConnection={supabaseConnection} supabaseReady={supabaseConnectionReady}/></ProtectedRoute>}
        {active === "logs" && <ProtectedRoute permission={MODULE_PERMISSIONS.logs}><LogsPage logs={consultedLogs} page={logsPage} pageSize={logsPageSize} hasNextPage={logsHasNextPage} status={logsStatus} supabaseReady={supabaseSettingsReady} onConsult={onConsultLogs} onPrevious={() => onConsultLogs(Math.max(1, logsPage - 1))} onNext={() => onConsultLogs(logsPage + 1)} onPageSizeChange={onLogsPageSizeChange}/></ProtectedRoute>}
        {active === "consolidado" && <ProtectedRoute permission={MODULE_PERMISSIONS.consolidado}><ConsolidadoPage rows={rows} actividades={actividades} catalogos={catalogos} comentarios={comentarios} setComentarios={setComentarios} compradores={compradores} onSaveSupabase={onRequestSaveSupabase} supabaseReady={supabaseSettingsReady} saveSupabaseStatus={saveSupabaseStatus} isSyncing={isSyncing}/></ProtectedRoute>}
        {active === "export" && <ProtectedRoute permission={MODULE_PERMISSIONS.export}><ExportPageV2 rows={rows} actividades={actividades} comentarios={comentarios} supabaseConnection={supabaseConnection} supabaseReady={supabaseConnectionReady}/></ProtectedRoute>}
        </Suspense>
      </ErrorBoundary>
  );
}
