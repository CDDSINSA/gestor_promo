import React, { useMemo, useState } from "react";
import { X } from "lucide-react";
import { PERMISSIONS } from "../constants/permissions";
import { usePermissions } from "../hooks/usePermissions";
import { allPromoTypes } from "../promoTypes/promoTypeEngine";
import { normalizeActividad } from "../utils/promoHelpers";
import { Card, CardContent, Header } from "./ui";
import MarginFilters from "../features/margins/MarginFilters";
import MarginSummary from "../features/margins/MarginSummary";
import MarginOfferTable from "../features/margins/MarginOfferTable";
import { useMarginReport } from "../features/margins/useMarginReport";
import { exportMarginReport } from "../features/margins/marginExport";
import MarginAbcAnalysis from "../features/margins/MarginAbcAnalysis";
import { ABC_FILTER_OPTIONS } from "../features/margins/abcMarginAnalysis";
import "../styles/pages/margenes.page.css";

const TABS = [
  { id: "ofertas", label: "Detalle por oferta" },
  { id: "abc", label: "Análisis por clasificación ABC" },
];

function uniqueSorted(values) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, "es"));
}

export default function MargenesPage({
  compradores = [], jerarquiaCategorias = [], actividades = [], catalogos = [], supabaseConnection = null, supabaseReady = false,
}) {
  const { can } = usePermissions();
  const canExport = can(PERMISSIONS.EXPORT_MARGINS);
  const { filters, updateFilter, consult, clear, report, visibleOffers, status } = useMarginReport(supabaseConnection, supabaseReady);
  const [exportStatus, setExportStatus] = useState(null);
  const [tab, setTab] = useState("ofertas");
  const showOffersForAbc = (code) => { updateFilter("abc", code); setTab("ofertas"); };

  const options = useMemo(() => {
    const activityItems = [...catalogos, ...actividades].map((item) => {
      const activity = normalizeActividad(item);
      return { id: activity.actividad_id, nombre: activity.nombre_actividad || activity.actividad_id, tipo: activity.tipo_actividad };
    });
    return {
      compradores: uniqueSorted(compradores.filter((item) => item.activo !== false).map((item) => item.comprador || item.nombre)),
      divisiones: uniqueSorted([
        ...jerarquiaCategorias.filter((item) => item.activo !== false).map((item) => item.division),
        ...compradores.map((item) => item.division),
      ]),
      actividades: Array.from(new Map(activityItems.filter((item) => item.id).map((item) => [item.id, item])).values()),
      tiposPromo: allPromoTypes,
    };
  }, [actividades, catalogos, compradores, jerarquiaCategorias]);

  const handleExport = async () => {
    if (!report) return;
    setExportStatus(null);
    try {
      await exportMarginReport(visibleOffers);
    } catch (error) {
      setExportStatus(error.message || "No se pudo generar el Excel.");
    }
  };

  const loading = status.type === "loading";

  return <div className="margins-page">
    <Header title="Monitoreo de márgenes" subtitle="Detecta ofertas fuera de meta en catálogos y solicitudes especiales, con el costo guardado en cada promoción."/>
    <MarginFilters
      filters={filters}
      onChange={updateFilter}
      onConsult={consult}
      onClear={() => { clear(); setExportStatus(null); }}
      onExport={handleExport}
      options={options}
      loading={loading}
      canExport={canExport}
      exportDisabled={!report || !visibleOffers.length || loading}
    />
    {status.message && <p className={`status-message${status.type === "error" ? " error" : ""}`} role={status.type === "error" ? "alert" : "status"}>{status.message}</p>}
    {exportStatus && <p className="status-message error" role="alert">{exportStatus}</p>}
    {report && <MarginSummary report={report} activeStatus={filters.estado} onSelectStatus={(value) => updateFilter("estado", value)}/>}
    <div className="margin-tabs" role="tablist" aria-label="Vistas del resultado">
      {TABS.map((item) => <button
        key={item.id}
        type="button"
        role="tab"
        id={`margin-tab-${item.id}`}
        aria-selected={tab === item.id}
        aria-controls={`margin-panel-${item.id}`}
        className={tab === item.id ? "margin-tab active" : "margin-tab"}
        onClick={() => setTab(item.id)}
      >{item.label}</button>)}
      {filters.abc !== "Todos" && <button type="button" className="margin-tab-chip" onClick={() => updateFilter("abc", "Todos")} aria-label="Quitar filtro de clasificación">
        {ABC_FILTER_OPTIONS.find((option) => option.value === filters.abc)?.label} <X size={13} aria-hidden="true"/>
      </button>}
    </div>
    <div role="tabpanel" id={`margin-panel-${tab}`} aria-labelledby={`margin-tab-${tab}`}>
      {!report
        ? status.type !== "loading" && <Card className="margin-placeholder"><CardContent>
          <div className="empty-state">{tab === "abc"
            ? "Elija los filtros y presione Consultar para ver el análisis por clasificación ABC: cantidad de SKU, proporciones, margen promedio y desglose por estado."
            : "Elija los filtros y presione Consultar. Precios sin IVA (÷ 1.15) contra el costo guardado en cada promoción; las promociones anuladas no se incluyen."}</div>
        </CardContent></Card>
        : tab === "ofertas"
          ? <MarginOfferTable offers={visibleOffers} totalOffers={report.offers.length}/>
          : <MarginAbcAnalysis offers={visibleOffers} thresholds={report.thresholds} abcFilter={filters.abc} onSelectAbc={showOffersForAbc}/>}
    </div>
  </div>;
}
