import React, { useState } from "react";
import { Download, Filter, X } from "lucide-react";
import { Button, Card, CardContent } from "../../components/ui";
import { usePermissions } from "../../hooks/usePermissions";
import { PERMISSIONS, ROLES, normalizeRole } from "../../constants/permissions";
import { PROJECT_STATES } from "../catalogDesign/designPresentation";
import { loadDesignExportData } from "../../services/supabase/designExport";
import { exportStyledWorkbook } from "../../services/excelStyleService";
import { buildDesignReport } from "./designReport";

const EMPTY_FILTERS = { catalog: "", state: "", designer: "", buyer: "" };

export default function DesignExportPanel({ catalogos = [], supabaseConnection, supabaseReady }) {
  const { can, role } = usePermissions();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [modalFilters, setModalFilters] = useState(EMPTY_FILTERS);
  const [showModal, setShowModal] = useState(false);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState({ type: "idle", message: "" });

  const fullAccess = [ROLES.ADMIN, ROLES.MARK].includes(normalizeRole(role));
  const busy = status.type === "loading" || status.type === "downloading";

  if (!can(PERMISSIONS.VIEW_CATALOG_DESIGN) || !can(PERMISSIONS.DOWNLOAD_EXPORTS)) {
    return null;
  }

  const ensureData = async () => {
    if (data) return data;
    setStatus({ type: "loading", message: "Consultando proyectos de diseño..." });
    const result = await loadDesignExportData(supabaseConnection, { fullAccess });
    setData(result);
    setStatus({ type: "idle", message: "" });
    return result;
  };

  const handleOpenModal = () => {
    setModalFilters({ ...filters });
    setShowModal(true);
    if (!data && supabaseReady && supabaseConnection) {
      ensureData().catch((err) => {
        setStatus({ type: "error", message: err.message || "Error al cargar diseñadores y compradores." });
      });
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
  };

  const handleClearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setModalFilters(EMPTY_FILTERS);
  };

  const handleApplyFilters = () => {
    setFilters({ ...modalFilters });
    setShowModal(false);
  };

  const handleDownload = async (customFilters = filters) => {
    if (busy) return;
    if (!supabaseReady || !supabaseConnection) {
      window.alert("Conecte Supabase para exportar el reporte de seguimiento de diseño.");
      return;
    }

    setStatus({ type: "downloading", message: "Preparando Excel..." });
    try {
      const currentData = await ensureData();
      const report = buildDesignReport(currentData, catalogos, customFilters, { fullAccess });

      if (!report?.projectCount) {
        window.alert("No se encontraron proyectos de diseño para los filtros seleccionados.");
        setStatus({ type: "idle", message: "" });
        return;
      }

      const date = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Managua",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      const dateFormat = "dd/mm/yyyy hh:mm";

      await exportStyledWorkbook({
        sheetName: "Detalle páginas",
        rows: report.detail,
        columnCount: report.detail[0].length,
        fileName: `seguimiento_disenos_${date}.xlsx`,
        columnFormats: [
          { column: 1, width: 14 },
          { column: 2, width: 26 },
          { column: 3, width: 26 },
          { column: 4, width: 20 },
          { column: 5, width: 14 },
          { column: 6, width: 24 },
          { column: 7, width: 20 },
          { column: 8, width: 14 },
          { column: 9, width: 14 },
          { column: 10, width: 22 },
          { column: 11, width: 22 },
          { column: 12, width: 18 },
          { column: 13, width: 18 },
          { column: 14, width: 18 },
          { column: 15, width: 60 },
          { column: 16, width: 20, numFmt: dateFormat },
          { column: 17, width: 20, numFmt: dateFormat },
          { column: 18, width: 20, numFmt: dateFormat },
        ],
        additionalSheets: [
          {
            name: "Resumen proyectos",
            rows: report.summary,
            columns: report.summary[0].map((_, index) => ({
              width: [1, 2, 13, 14, 22].includes(index) ? 32 : 22,
              style: {
                alignment: { vertical: "top" },
                ...([18, 19, 20, 21].includes(index) ? { numFmt: index < 20 ? "dd/mm/yyyy" : dateFormat } : {}),
              },
            })),
          },
        ],
      });

      setStatus({ type: "idle", message: "" });
    } catch (error) {
      setStatus({ type: "error", message: error.message || "No se pudo generar el Excel." });
      window.alert(`Error al generar el reporte de diseño: ${error.message || "Error desconocido"}`);
    }
  };

  const handleApplyAndDownload = async () => {
    const nextFilters = { ...modalFilters };
    setFilters(nextFilters);
    setShowModal(false);
    await handleDownload(nextFilters);
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const hasModalFilters = Object.values(modalFilters).filter(Boolean).length > 0;

  const designerOptions = (data?.users || []).filter((user) =>
    data?.pages?.some((page) => page.disenador_id === user.id)
  );
  const buyerOptions = (data?.buyers || []).filter((buyer) =>
    data?.pages?.some((page) => page.comprador_id === buyer.id)
  );

  return (
    <div className="export-section">
      <div className="export-section-head">
        <div>
          <h2>Diseño y Catálogos</h2>
          <span>Reportes de seguimiento operativo, avance por página y comentarios de diseño.</span>
        </div>
      </div>

      <div className="export-grid design-export-grid">
        <Card>
          <CardContent>
            <Download size={22} />
            <h3>Seguimiento de Diseños</h3>
            <p>Desglose por página con estatus, versiones, diseñador, comprador y comentarios.</p>
            <div className="export-card-actions">
              <Button onClick={() => handleDownload()} disabled={busy || !supabaseReady}>
                <Download size={16} /> {busy ? "Preparando..." : "Descargar XLSX"}
              </Button>
              <Button variant="outline" onClick={handleOpenModal} title="Filtrar por catálogo, estado o responsable">
                <Filter size={15} /> Filtros {activeFilterCount > 0 ? `(${activeFilterCount})` : ""}
              </Button>
            </div>
            {activeFilterCount > 0 && (
              <div className="export-card-filter-summary">
                <span>{activeFilterCount} filtro(s) activo(s)</span>
                <button type="button" onClick={handleClearFilters} title="Limpiar filtros">×</button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {showModal && (
        <div className="modal-backdrop" onClick={handleCloseModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>Filtros - Seguimiento de Diseños</h2>
                <p>Personalice los criterios para la exportación de proyectos y páginas.</p>
              </div>
              <button type="button" className="icon-btn" onClick={handleCloseModal} aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <label className="filter-field">
                <span>Catálogo / proyecto</span>
                <input
                  value={modalFilters.catalog}
                  onChange={(e) => setModalFilters((c) => ({ ...c, catalog: e.target.value }))}
                  placeholder="ID o nombre del proyecto..."
                />
              </label>
              <label className="filter-field">
                <span>Estado del proyecto</span>
                <select
                  value={modalFilters.state}
                  onChange={(e) => setModalFilters((c) => ({ ...c, state: e.target.value }))}
                >
                  <option value="">Todos los estados</option>
                  {PROJECT_STATES.map((state) => (
                    <option key={state} value={state}>
                      {state.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="filter-field">
                <span>Diseñador asignado</span>
                <select
                  value={modalFilters.designer}
                  onChange={(e) => setModalFilters((c) => ({ ...c, designer: e.target.value }))}
                  disabled={!data && busy}
                >
                  <option value="">Todos los diseñadores</option>
                  {designerOptions.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.nombre || user.email}
                    </option>
                  ))}
                </select>
              </label>
              <label className="filter-field">
                <span>Comprador asignado</span>
                <select
                  value={modalFilters.buyer}
                  onChange={(e) => setModalFilters((c) => ({ ...c, buyer: e.target.value }))}
                  disabled={!data && busy}
                >
                  <option value="">Todos los compradores</option>
                  {buyerOptions.map((buyer) => (
                    <option key={buyer.id} value={buyer.id}>
                      {buyer.comprador}
                    </option>
                  ))}
                </select>
              </label>
              <p className="modal-note">
                El avance y los conteos corresponden a las páginas {fullAccess ? "incluidas en los filtros" : "autorizadas para su usuario"}. Fechas y horas en zona horaria de Nicaragua.
              </p>
            </div>
            <div className="modal-actions">
              {hasModalFilters && (
                <Button variant="outline" onClick={() => setModalFilters(EMPTY_FILTERS)}>
                  Limpiar
                </Button>
              )}
              <Button variant="outline" onClick={handleApplyFilters}>
                Aplicar
              </Button>
              <Button onClick={handleApplyAndDownload} disabled={busy || !supabaseReady}>
                <Download size={16} /> Descargar con filtros
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
