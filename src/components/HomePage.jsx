import React, { useMemo, useState } from "react";
import {
  Bell,
  BellOff,
  CalendarDays,
  History,
  LayoutDashboard,
  ListChecks,
  Plus,
  Settings,
  MessageSquareWarning,
  Percent,
  ShoppingBag,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { hasSupabaseConnection } from "../services/supabaseService";
import { PERMISSIONS, ROLES, normalizeRole } from "../constants/permissions";
import { useAuth } from "../hooks/useAuth";
import { usePermissions } from "../hooks/usePermissions";
import { classNames } from "../utils/common";
import {
  getAuthorizedCompradoresForAppUser,
  getCompradorNombre,
} from "../utils/avanceHelpers";
import { isActivityComment, isLineComment, normalizeActividad, normalizeCanal } from "../utils/promoHelpers";
import { Button, Card, CardContent, Header, Metric } from "./ui";

export default function HomePage({ catalogos, rows = [], actividades = [], comentarios = [], compradores = [], jerarquiaCategorias = [], catalogoResumen = [], rowsCount, logsCount, setActive, setCatalogoActivo, onOpenAvances, onLoadSupabase, onSaveSupabase, supabaseSettings, supabaseReady: domainSupabaseReady, supabaseStatus, isSyncing }) {
  const { appUser } = useAuth();
  const { can } = usePermissions();
  const catalogosVisibles = useMemo(() => (catalogos || []).filter((c) => String(c.estado).toLowerCase() !== "cerrado"), [catalogos]);
  const activos = catalogosVisibles.filter((c) => c.estado === "Activo").length;
  const supabaseReady = domainSupabaseReady ?? hasSupabaseConnection(supabaseSettings);
  const statusType = supabaseStatus?.type || (supabaseReady ? "ready" : "idle");
  const statusMessage = supabaseStatus?.message || (supabaseReady ? "Conexión lista para actualizarse." : "Configure Supabase en Ajustes.");
  const currentRole = normalizeRole(appUser?.rol || appUser?.role);
  const buyerProfile = Array.isArray(appUser?.compradores) ? appUser.compradores[0] : appUser?.compradores;
  const currentBuyerName = buyerProfile?.comprador || appUser?.comprador || appUser?.nombre || "";
  const catalogStats = useMemo(() => {
    const stats = new Map(catalogosVisibles.map((cat) => [cat.id, { compradores: new Set(), divisiones: new Set(), skus: new Set(), skusCount: null }]));
    const byKey = new Map();
    catalogosVisibles.forEach((cat) => [cat.id, cat.catalogo_id].filter(Boolean).forEach((key) => byKey.set(String(key), cat.id)));
    (catalogoResumen || []).forEach((item) => {
      const catalogId = byKey.get(String(item.actividad_id || item.actividadId || item.catalogo_id || ""));
      if (!catalogId || !stats.has(catalogId)) return;
      const stat = stats.get(catalogId);
      if (item.comprador) stat.compradores.add(item.comprador);
      if (item.division) stat.divisiones.add(item.division);
      stat.skusCount = (stat.skusCount || 0) + (Number(item.skus_count || item.skusCount || item.skus || 0) || 0);
    });
    rows.forEach((row) => {
      const rowCatalogKey = row.actividad_id || row.actividadId || row.catalogo_id || row.catalogoId;
      const catalogId = byKey.get(String(rowCatalogKey || ""));
      if (!catalogId || !stats.has(catalogId)) return;
      const stat = stats.get(catalogId);
      if (row.comprador) stat.compradores.add(row.comprador);
      if (row.division) stat.divisiones.add(row.division);
      if (row.sku) stat.skus.add(row.sku);
    });
    return stats;
  }, [catalogosVisibles, catalogoResumen, rows]);
  const visibleRowsCount = useMemo(() => {
    if ((catalogoResumen || []).length) {
      return catalogoResumen.reduce((total, item) => total + (Number(item.promociones_count || item.promocionesCount || item.promociones || 0) || 0), 0);
    }
    const catalogKeys = new Set();
    catalogosVisibles.forEach((cat) => {
      [cat.id, cat.catalogo_id].filter(Boolean).forEach((key) => catalogKeys.add(String(key)));
    });
    return rows.filter((row) => {
      const rowCatalogKey = row.actividad_id || row.actividadId || row.catalogo_id || row.catalogoId;
      return catalogKeys.has(String(rowCatalogKey || ""));
    }).length;
  }, [catalogosVisibles, catalogoResumen, rows]);
  const buyerOpenComments = useMemo(() => {
    if (currentRole !== ROLES.BUYER || !currentBuyerName) return 0;
    const authorizedBuyerNames = new Set(
      getAuthorizedCompradoresForAppUser(appUser, compradores, true)
        .map(getCompradorNombre)
        .map(normalizeCanal)
        .filter(Boolean)
    );
    if (!authorizedBuyerNames.size) authorizedBuyerNames.add(normalizeCanal(currentBuyerName));
    const rowBelongsToBuyer = (row, activity = {}) => {
      const rowBuyer = row.comprador || activity.comprador || activity.solicitante || "";
      return authorizedBuyerNames.has(normalizeCanal(rowBuyer));
    };
    const activityById = new Map((actividades || []).map((item) => {
      const activity = normalizeActividad(item);
      return [activity.actividad_id, activity];
    }));
    const buyerRowIds = new Set();
    const buyerActivityIds = new Set();

    rows.forEach((row) => {
      const activityId = row.actividadId || row.actividad_id || row.catalogo_id || row.catalogoId || "";
      const activity = activityById.get(activityId) || {};
      if (!rowBelongsToBuyer(row, activity)) return;
      if (row.id || row.row_id || row.rowId) buyerRowIds.add(row.id || row.row_id || row.rowId);
      if (activityId) buyerActivityIds.add(activityId);
    });

    return comentarios.filter((comment) => {
      if (String(comment.estado || "").toLowerCase() !== "abierto") return false;
      const rowId = comment.rowId || comment.row_id || "";
      const activityId = comment.actividadId || comment.actividad_id || "";
      if (isLineComment(comment)) return buyerRowIds.has(rowId);
      if (isActivityComment(comment)) return buyerActivityIds.has(activityId);
      return buyerRowIds.has(rowId) || buyerActivityIds.has(activityId);
    }).length;
  }, [actividades, appUser, comentarios, compradores, currentBuyerName, currentRole, rows]);
  const showBuyerCommentAlert = currentRole === ROLES.BUYER;
  const buyerCommentAlertCopy = buyerOpenComments
    ? `Tienes ${buyerOpenComments} comentario${buyerOpenComments === 1 ? "" : "s"} abierto${buyerOpenComments === 1 ? "" : "s"} de Mercadeo por revisar.`
    : "No tienes comentarios abiertos de Mercadeo.";

  const [selectedSection, setSelectedSection] = useState("hub"); // "hub" | "estrategia"

  return <div>
    <div className="home-topbar">
      <Header
        title={selectedSection === "hub" ? "Portal de Gestión Comercial" : "Estrategia Comercial: Catálogos"}
        subtitle={selectedSection === "hub"
          ? "Gestión centralizada de fidelización de clientes y campañas comerciales."
          : "Panel para administrar catálogos activos, promociones y exportaciones."}
      />
    </div>

    {selectedSection === "hub" ? (
      <div className="home-hub-container">
        <div className="home-hub-canvas">
          <div className="home-hub-glow-emerald" aria-hidden="true" />
          <div className="home-hub-glow-cyan" aria-hidden="true" />
          
          <div className="home-hub-intro">
            <span className="home-hub-pill">
              <span className="home-hub-pill-dot" />
              SISTEMA DE GESTIÓN COMERCIAL
            </span>
            <h2 className="home-hub-title">Seleccione el Proceso Comercial</h2>
          </div>

          <div className="home-hub-cards-grid">
            {/* Tarjeta 1: Fidelización de Clientes */}
            <div
              className="hub-tile hub-tile-fidelizacion"
              onClick={() => setActive("fidelizacion")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setActive("fidelizacion");
                }
              }}
            >
              <div className="hub-tile-header">
                <div className="hub-tile-icon-box emerald">
                  <Percent size={28} />
                </div>
                <div className="hub-tile-tag-wrap">
                  <span className="hub-tile-badge emerald">Canastos Permanentes</span>
                  <span className="hub-tile-indicator">Fidelización</span>
                </div>
              </div>

              <div className="hub-tile-body">
                <h3 className="hub-tile-title">Fidelización de Clientes</h3>
                <p className="hub-tile-desc">
                  Gestión de canastos de artículos y descuentos permanentes por segmento de clientes para <strong>Comasa</strong> y <strong>Retail</strong>. Consulta por división y solicitudes de actualización con análisis de deltas.
                </p>

                <div className="hub-tile-features">
                  <div className="hub-feature-item">
                    <CheckCircle2 size={15} className="hub-feature-check emerald" />
                    <span>Segmentos Comasa & Retail</span>
                  </div>
                  <div className="hub-feature-item">
                    <CheckCircle2 size={15} className="hub-feature-check emerald" />
                    <span>Canastos permanentes</span>
                  </div>
                  <div className="hub-feature-item">
                    <CheckCircle2 size={15} className="hub-feature-check emerald" />
                    <span>Análisis de deltas & aprobaciones</span>
                  </div>
                </div>
              </div>

              <div className="hub-tile-footer">
                <button
                  type="button"
                  className="hub-cta-button emerald"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActive("fidelizacion");
                  }}
                >
                  <span>Ingresar a Fidelización</span>
                  <ArrowRight size={17} className="hub-cta-arrow" />
                </button>
              </div>
            </div>

            {/* Tarjeta 2: Campañas Comerciales */}
            <div
              className="hub-tile hub-tile-estrategia"
              onClick={() => setSelectedSection("estrategia")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedSection("estrategia");
                }
              }}
            >
              <div className="hub-tile-header">
                <div className="hub-tile-icon-box cyan">
                  <ShoppingBag size={28} />
                </div>
                <div className="hub-tile-tag-wrap">
                  <span className="hub-tile-badge cyan">Promociones & Catálogos</span>
                  <span className="hub-tile-indicator">Estrategia Comercial</span>
                </div>
              </div>

              <div className="hub-tile-body">
                <h3 className="hub-tile-title">Campañas Comerciales</h3>
                <p className="hub-tile-desc">
                  Planificación y administración de catálogos comerciales bimensuales, promociones masivas, combos, escalas y promociones especiales para tiendas y canales corporativos.
                </p>

                <div className="hub-tile-features">
                  <div className="hub-feature-item">
                    <CheckCircle2 size={15} className="hub-feature-check cyan" />
                    <span>Catálogos comerciales bimensuales</span>
                  </div>
                  <div className="hub-feature-item">
                    <CheckCircle2 size={15} className="hub-feature-check cyan" />
                    <span>Combos, escalas y ofertas masivas</span>
                  </div>
                  <div className="hub-feature-item">
                    <CheckCircle2 size={15} className="hub-feature-check cyan" />
                    <span>Canales tiendas y corporativo</span>
                  </div>
                </div>
              </div>

              <div className="hub-tile-footer">
                <button
                  type="button"
                  className="hub-cta-button cyan"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedSection("estrategia");
                  }}
                >
                  <span>Explorar Catálogos Activos</span>
                  <ArrowRight size={17} className="hub-cta-arrow" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    ) : (
      <div className="home-estrategia-section">
        <div style={{ marginBottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Button variant="outline" className="btn-sm" onClick={() => setSelectedSection("hub")}>
            <ArrowLeft size={15} /> Volver al menú principal
          </Button>
        </div>

        <div className="metrics">
          <Metric title="Catalogos activos" value={activos} icon={LayoutDashboard}/>
          <Metric title="Promos registradas" value={visibleRowsCount} icon={ListChecks}/>
          <Metric title="Cambios recientes" value={logsCount} icon={History}/>
          <Metric title="Conexion Supabase" value={supabaseReady ? "ON" : "OFF"} icon={Bell}/>
        </div>

        <div id="catalogos-section" className="toolbar home-catalog-toolbar">
          <div className="home-catalog-title">
            <h2>Catalogos disponibles</h2>
            {showBuyerCommentAlert && (
              <div className={classNames("buyer-comment-alert", buyerOpenComments ? "has-open" : "clear")}>
                <div className="buyer-comment-alert-icon"><MessageSquareWarning size={18}/></div>
                <div>
                  <strong>{buyerOpenComments ? "Comentarios abiertos" : "Sin pendientes"}</strong>
                  <span>{buyerCommentAlertCopy}</span>
                </div>
              </div>
            )}
          </div>
          <div className="toolbar-actions">
            {can(PERMISSIONS.CREATE_SPECIAL_PROMO) && <Button onClick={() => setActive("especial")}><Plus size={16}/> Nueva promocion especial</Button>}
            {can(PERMISSIONS.MANAGE_SETTINGS) && <Button variant="outline" onClick={() => setActive("ajustes")}><Settings size={16}/> Ajustes</Button>}
          </div>
        </div>

        <div className="catalog-grid">
          {catalogosVisibles.map((cat) => {
            const stats = catalogStats.get(cat.id) || { compradores: new Set(), divisiones: new Set(), skus: new Set() };
            return <Card key={cat.id} className="catalog-card">
                <div className={classNames("color-strip", cat.color)}></div>
                <CardContent>
                  <div className="catalog-head">
                    <div>
                      <h3>{cat.nombre}</h3>
                      <p className="catalog-note">{stats.compradores.size} compradores - {stats.divisiones.size} divisiones - {stats.skusCount ?? stats.skus.size} SKU</p>
                      <p className="catalog-meta-row"><span>{cat.canal}</span><span><CalendarDays size={14}/>{cat.vigencia}</span></p>
                    </div>
                    <div className="catalog-status">
                      <span className={cat.estado === "Activo" ? "pill green" : "pill"}>{cat.estado}</span>
                      <span className={cat.notificaciones ? "notification-dot active" : "notification-dot inactive"} title={cat.notificaciones ? "Notificaciones activas" : "Notificaciones inactivas"} aria-label={cat.notificaciones ? "Notificaciones activas" : "Notificaciones inactivas"}>
                        {cat.notificaciones ? <Bell size={15}/> : <BellOff size={15}/>}
                      </span>
                    </div>
                  </div>
                  <div className="catalog-actions">
                    {can(PERMISSIONS.VIEW_PROMOS) && <Button className="full" onClick={() => { setCatalogoActivo(cat); setActive("promos"); }}>Trabajar catalogo</Button>}
                    {can(PERMISSIONS.VIEW_AVANCES) && <Button className="full btn-avances" variant="outline" onClick={() => onOpenAvances?.(cat)}><ListChecks size={16}/> Avances</Button>}
                  </div>
                </CardContent>
              </Card>;
          })}
        </div>
      </div>
    )}
  </div>;
}
