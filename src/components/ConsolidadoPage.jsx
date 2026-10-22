import React, { useMemo, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  Home,
  ListChecks,
  Search,
  X,
} from "lucide-react";
import { classNames } from "../utils/common";
import { exportStyledWorkbook } from "../services/excelStyleService";
import { getModificationExcelDate, isModifiedPromotion, MODIFICATION_DATE_FORMAT } from "../features/consolidado/exportMetadata";
import { isAnulledPromotion } from "../features/promotions/application/promotionAnulation";
import {
  channelMatchesFilter,
  formatDurationHours,
  getSpecialRequestStatusKey,
  isSegmentedRow,
  normalizeActividad,
  normalizeCanal,
  splitChannelValues,
} from "../utils/promoHelpers";
import { CONSOLIDADO_TABLE_HEADERS } from "../constants";
import { ACTIVITY_TYPES, ALCANCE_TYPES } from "../constants/promoConstants";
import { allPromoTypes } from "../promoTypes/promoTypeEngine";
import { getConsolidadoCampaignIds, hasConsolidadoFilters } from "../features/consolidado/consolidadoScope";
import { PERMISSIONS } from "../constants/permissions";
import { usePermissions } from "../hooks/usePermissions";
import { Button, Card, CardContent, Header, Metric } from "./ui";
import ActivityCombobox from "./ActivityCombobox";
import "../styles/pages/consolidado.page.css";

const CONSOLIDADO_PAGE_SIZE = 100;

// Un solo comparador: crear las opciones de idioma en cada comparación hacía muy lento ordenar miles de filas.
const textCollator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

function firstFilled(...values) {
  const match = values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
  return match === undefined ? "" : match;
}

export default function ConsolidadoPage({ rows, actividades = [], catalogos = [], compradores, campaignLoadingEnabled = false, onEnsureCampaigns, catalogoResumen = [] }) {
  const { can } = usePermissions();
  const canExport = can(PERMISSIONS.EXPORT_CONSOLIDADO);
  const [compradorFiltro, setCompradorFiltro] = useState("Todos");
  const [tipoFiltro, setTipoFiltro] = useState("Todos");
  const [tipoActividadFiltro, setTipoActividadFiltro] = useState("Todos");
  const [canalFiltro, setCanalFiltro] = useState("Todos");
  const [alcanceFiltro, setAlcanceFiltro] = useState("Todos");
  const [skuFiltro, setSkuFiltro] = useState("");
  const [actividadCatalogoFiltro, setActividadCatalogoFiltro] = useState("");
  const [appliedFilters, setAppliedFilters] = useState(null);
  // Carga por campaña: las promociones se descargan al presionar Buscar, segun los filtros.
  const [queryState, setQueryState] = useState({ status: "idle", message: "" });
  const [currentPage, setCurrentPage] = useState(1);

  const activityMap = useMemo(
    () => new Map((actividades || []).map((item) => {
      const activity = normalizeActividad(item);
      return [activity.actividad_id, activity];
    })),
    [actividades],
  );
  const catalogNameById = useMemo(() => new Map((catalogos || []).map((catalogo) => [
    String(catalogo.catalogo_id || catalogo.id || ""),
    catalogo.nombre || catalogo.nombre_actividad || "",
  ])), [catalogos]);

  const getActivityId = (row) => firstFilled(row.actividadId, row.actividad_id, row.catalogoId, row.catalogo_id);
  const getRowId = (row) => firstFilled(row.id, row.row_id, row.rowId);
  const getActivity = (row) => activityMap.get(getActivityId(row)) || {};
  const getActivityName = (row, activity = getActivity(row)) => {
    const activityId = getActivityId(row);
    return firstFilled(activity.nombre_actividad, activity.nombreActividad, activity.nombre, catalogNameById.get(String(activityId)));
  };
  const getOfferId = (row) => firstFilled(row.ofertaId, row.oferta_id);
  const getTipoPromo = (row) => firstFilled(row.tipoPromo, row.tipo_promo);
  const getGrupoOferta = (row) => firstFilled(row.grupoOferta, row.grupo_oferta);
  const getTipoSku = (row) => firstFilled(row.tipoSku, row.tipo_sku);
  const getCantidadMinima = (row) => firstFilled(row.cantidadMinima, row.cantidad_minima);
  const getPrecioAhora = (row) => firstFilled(row.precioAhora, row.precio_ahora);
  const getAlcanceTipo = (row) => firstFilled(row.alcanceTipo, row.alcance_tipo);
  const getAlcanceValor = (row) => firstFilled(row.alcanceValor, row.alcance_valor);

  // Opciones del autocompletado: { id, nombre, tipo } de actividades, catálogos y lineas cargadas.
  const activityCatalogOptions = useMemo(() => {
    const optionsById = new Map();
    const add = (id, nombre, tipo) => {
      const key = String(id || "").trim();
      if (!key || optionsById.has(key)) return;
      optionsById.set(key, { id: key, nombre: String(nombre || key), tipo: tipo || "CATALOGO" });
    };
    (actividades || []).forEach((item) => {
      const activity = normalizeActividad(item);
      const id = activity.actividad_id;
      add(id, activity.nombre_actividad || activity.nombreActividad || activity.nombre || catalogNameById.get(String(id)), activity.tipo_actividad);
    });
    (catalogos || []).forEach((catalogo) => add(catalogo.catalogo_id || catalogo.id, catalogo.nombre || catalogo.nombre_actividad, "CATALOGO"));
    rows.forEach((row) => {
      const id = getActivityId(row);
      if (!id || optionsById.has(id)) return;
      const activity = getActivity(row);
      add(id, getActivityName(row, activity), activity.tipo_actividad);
    });
    return Array.from(optionsById.values());
  }, [actividades, activityMap, catalogNameById, catalogos, rows]);
  const activityIdSet = useMemo(() => new Set(activityCatalogOptions.map((item) => item.id)), [activityCatalogOptions]);

  const compareText = (left, right) => textCollator.compare(String(left || ""), String(right || ""));

  // Listas de los filtros: se recalculan solo cuando cambian los datos, no al escribir.
  const { compradoresUnicos, tiposUnicos, tiposActividad, canales, alcances } = useMemo(() => {
    // Con carga por campaña las opciones no pueden salir solo de las lineas (aun no estan cargadas):
    // se completan con maestros, actividades y valores fijos.
    const optionList = (values, extras = []) => ["Todos", ...Array.from(new Set([
      ...values,
      ...(campaignLoadingEnabled ? extras : []),
    ].map((value) => String(value || "").trim()).filter(Boolean)))];
    const compradoresUnicos = optionList(
      rows.map((row) => row.comprador || getActivity(row).comprador || getActivity(row).solicitante || "Sin comprador"),
      [
        ...(compradores || []).map((item) => item?.comprador || item?.nombre),
        ...(catalogoResumen || []).map((item) => item?.comprador),
        ...(actividades || []).map((item) => item?.comprador || item?.solicitante),
      ],
    );
    const tiposUnicos = optionList(rows.map((row) => getTipoPromo(row) || "Sin tipo"), allPromoTypes);
    const tiposActividad = optionList(
      rows.map((row) => getActivity(row).tipo_actividad || "CATALOGO"),
      [...ACTIVITY_TYPES, ...(actividades || []).map((item) => item?.tipo_actividad || "CATALOGO")],
    );
    const channelSources = campaignLoadingEnabled
      ? [...rows.map((row) => getActivity(row).canal), ...(actividades || []).map((item) => item?.canal)]
      : rows.map((row) => getActivity(row).canal);
    const canales = ["Todos", ...Array.from(channelSources.reduce((map, canalValue) => {
      const values = splitChannelValues(canalValue);
      if (!values.length) {
        if (!map.has("sin-canal")) map.set("sin-canal", "Sin canal");
        return map;
      }
      values.forEach((item) => {
        const key = normalizeCanal(item);
        if (key && !map.has(key)) map.set(key, item);
      });
      return map;
    }, new Map()).values())];
    const alcances = optionList(rows.map((row) => getAlcanceTipo(row) || "Sin alcance"), ["Sin alcance", ...ALCANCE_TYPES]);
    return { compradoresUnicos, tiposUnicos, tiposActividad, canales, alcances };
  }, [actividades, activityMap, campaignLoadingEnabled, catalogoResumen, compradores, rows]);

  const applyFilters = async () => {
    const filters = {
      comprador: compradorFiltro,
      tipo: tipoFiltro,
      tipoActividad: tipoActividadFiltro,
      canal: canalFiltro,
      alcance: alcanceFiltro,
      sku: skuFiltro,
      actividadCatalogo: actividadCatalogoFiltro,
    };
    if (campaignLoadingEnabled && onEnsureCampaigns) {
      const activities = (actividades || []).map(normalizeActividad);
      const catalogOnlyIds = (catalogos || [])
        .map((catalogo) => String(catalogo.catalogo_id || catalogo.id || "").trim())
        .filter((id) => id && !activityMap.has(id));
      const campaignIds = hasConsolidadoFilters(filters)
        ? getConsolidadoCampaignIds(filters, [...activities, ...catalogOnlyIds.map((id) => ({ actividad_id: id, tipo_actividad: "CATALOGO" }))], {
          catalogNames: catalogNameById,
          resumen: catalogoResumen,
          normalize: normalizeCanal,
          channelMatches: channelMatchesFilter,
        })
        : [...activities.map((activity) => activity.actividad_id), ...catalogOnlyIds];
      if (campaignIds.length) {
        setQueryState({ status: "loading", message: `Cargando promociones de ${campaignIds.length} ${campaignIds.length === 1 ? "actividad" : "actividades"}...` });
        const loaded = await onEnsureCampaigns(campaignIds);
        if (loaded === false) {
          setQueryState({ status: "error", message: "No se pudieron cargar las promociones. Vuelva a presionar Buscar." });
          return;
        }
      }
      setQueryState({ status: "idle", message: "" });
    }
    setAppliedFilters(filters);
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setCompradorFiltro("Todos");
    setTipoFiltro("Todos");
    setTipoActividadFiltro("Todos");
    setCanalFiltro("Todos");
    setAlcanceFiltro("Todos");
    setSkuFiltro("");
    setActividadCatalogoFiltro("");
    setAppliedFilters(null);
    setCurrentPage(1);
  };

  // Filtro y orden memorizados: paginar no los recalcula.
  const rowsFiltradas = useMemo(() => (appliedFilters ? rows.filter((row) => {
    const activity = getActivity(row);
    const compradorRow = row.comprador || activity.comprador || activity.solicitante || "Sin comprador";
    const tipoActividad = activity.tipo_actividad || "CATALOGO";
    const activityId = getActivityId(row);
    const activityName = getActivityName(row, activity);
    const canal = activity.canal || "Sin canal";
    const tipoPromo = getTipoPromo(row) || "Sin tipo";
    const alcance = getAlcanceTipo(row) || "Sin alcance";
    const skuTerm = appliedFilters.sku.trim().toLowerCase();
    const activityTerm = normalizeCanal(appliedFilters.actividadCatalogo);
    const matchesSku = !skuTerm || String(row.sku || "").toLowerCase().includes(skuTerm);
    // Actividad elegida en la lista = ID exacto; texto libre = "contiene", como antes.
    const exactActivity = activityIdSet.has(String(appliedFilters.actividadCatalogo || "").trim());
    const matchesActivity = exactActivity
      ? activityId === String(appliedFilters.actividadCatalogo).trim()
      : !activityTerm || normalizeCanal(`${activityId} ${activityName}`).includes(activityTerm);
    return matchesSku
      && matchesActivity
      && (appliedFilters.comprador === "Todos" || compradorRow === appliedFilters.comprador)
      && (appliedFilters.tipo === "Todos" || tipoPromo === appliedFilters.tipo)
      && (appliedFilters.tipoActividad === "Todos" || tipoActividad === appliedFilters.tipoActividad)
      && (appliedFilters.canal === "Todos"
        || (canal === "Sin canal" ? appliedFilters.canal === "Sin canal" : channelMatchesFilter(canal, appliedFilters.canal)))
      && (appliedFilters.alcance === "Todos" || alcance === appliedFilters.alcance);
  }).sort((left, right) => {
    const leftActivity = getActivity(left);
    const rightActivity = getActivity(right);
    const leftActivityLabel = getActivityName(left, leftActivity) || getActivityId(left);
    const rightActivityLabel = getActivityName(right, rightActivity) || getActivityId(right);
    return compareText(leftActivityLabel, rightActivityLabel)
      || compareText(getOfferId(left), getOfferId(right))
      || compareText(left.sku, right.sku)
      || compareText(left.id || left.row_id || left.rowId, right.id || right.row_id || right.rowId);
  }) : []), [appliedFilters, rows, activityMap, catalogNameById, activityIdSet]);

  const totalPages = Math.max(1, Math.ceil(rowsFiltradas.length / CONSOLIDADO_PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedRows = rowsFiltradas.slice((safeCurrentPage - 1) * CONSOLIDADO_PAGE_SIZE, safeCurrentPage * CONSOLIDADO_PAGE_SIZE);

  const exportColumns = [
    ["Nombre actividad", (row, activity) => getActivityName(row, activity)],
    ["Oferta ID", (row) => getOfferId(row)],
    ["Alcance", (row) => getAlcanceTipo(row)],
    ["Valor alcance", (row) => getAlcanceValor(row)],
    ["Comprador", (row) => row.comprador || ""],
    ["Tipo promo", (row) => getTipoPromo(row)],
    ["Oferta", (row) => getGrupoOferta(row)],
    ["Rol", (row) => getTipoSku(row)],
    ["Variante", (row) => row.variante || ""],
    ["SKU", (row) => row.sku || ""],
    ["Página", (row) => firstFilled(row.numero_pagina, row.numPagina, row.num_pagina)],
    ["Descripcion", (row) => row.descripcion || ""],
    ["Cantidad", (row) => getCantidadMinima(row)],
    ["Precio ahora", (row) => getPrecioAhora(row)],
    ["Descuento", (row) => row.descuento ?? ""],
    ["Estado", (row) => row.estado_registro || row.estadoRegistro || ""],
    ["Comentario comprador", (row) => firstFilled(row.comentario, row.comentario_comprador)],
    ["Fecha de modificación", (row) => getModificationExcelDate(row)],
  ];

  const exportXlsx = async () => {
    const sheetRows = [
      exportColumns.map(([label]) => label),
      ...rowsFiltradas.map((row) => {
        const activity = getActivity(row);
        return exportColumns.map(([, getter]) => getter(row, activity));
      }),
    ];

    await exportStyledWorkbook({
      sheetName: "Consolidado",
      rows: sheetRows,
      dataRows: rowsFiltradas,
      columnCount: exportColumns.length,
      isModifiedRow: isModifiedPromotion,
      columnFormats: [{ column: exportColumns.length, numFmt: MODIFICATION_DATE_FORMAT, width: 25 }],
      fileName: `consolidado_promociones_${new Date().toISOString().slice(0, 10)}.xlsx`,
    });
  };

  return (
    <div>
      <Header title="Consolidado" subtitle="Vista unificada de promociones registradas por actividad comercial." />
      <div className="metrics consolidado-metrics">
        <Metric title="Total promociones" value={campaignLoadingEnabled && !appliedFilters
          ? (catalogoResumen || []).reduce((total, item) => total + (Number(item?.promociones_count) || 0), 0)
          : rows.length} icon={ListChecks}/>
        <Metric title="Actividades" value={actividades.length} icon={Home}/>
        <Metric title="Tipos de promo" value={tiposUnicos.length - 1} icon={FileSpreadsheet}/>
      </div>
      <div className="consolidado-layout">
        <div className="consolidado-top">
          <Card className="consolidado-filter-card">
            <CardContent>
              <div className="section-head">
                <div><h2>Filtros</h2><span role={queryState.status === "error" ? "alert" : undefined}>{queryState.status !== "idle" ? queryState.message : appliedFilters ? `${rowsFiltradas.length} filas visibles` : "Presione Buscar para cargar"}</span></div>
                <div className="toolbar-actions">
                  <Button variant="outline" onClick={() => void applyFilters()} disabled={queryState.status === "loading"}><Search size={16}/> {queryState.status === "loading" ? "Cargando..." : "Buscar"}</Button>
                  <Button variant="outline" onClick={clearFilters}><X size={16}/> Limpiar</Button>
                  {canExport && <Button variant="outline" onClick={exportXlsx} disabled={!rowsFiltradas.length}><Download size={16}/> Exportar XLSX</Button>}
                </div>
              </div>
              <div className="filter-grid">
                <label className="filter-field"><span>SKU</span><input value={skuFiltro} onChange={(e) => setSkuFiltro(e.target.value)} placeholder="Buscar SKU" /></label>
                <ActivityCombobox
                  value={actividadCatalogoFiltro}
                  onChange={setActividadCatalogoFiltro}
                  options={activityCatalogOptions}
                  tipoActividad={tipoActividadFiltro}
                />
                <label className="filter-field"><span>Comprador</span><select value={compradorFiltro} onChange={(e) => setCompradorFiltro(e.target.value)}>{compradoresUnicos.map((item) => <option key={item}>{item}</option>)}</select></label>
                <label className="filter-field"><span>Tipo actividad</span><select value={tipoActividadFiltro} onChange={(e) => setTipoActividadFiltro(e.target.value)}>{tiposActividad.map((item) => <option key={item}>{item}</option>)}</select></label>
                <label className="filter-field"><span>Canal</span><select value={canalFiltro} onChange={(e) => setCanalFiltro(e.target.value)}>{canales.map((item) => <option key={item}>{item}</option>)}</select></label>
                <label className="filter-field"><span>Alcance</span><select value={alcanceFiltro} onChange={(e) => setAlcanceFiltro(e.target.value)}>{alcances.map((item) => <option key={item}>{item}</option>)}</select></label>
                <label className="filter-field"><span>Tipo promo</span><select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)}>{tiposUnicos.map((item) => <option key={item}>{item}</option>)}</select></label>
              </div>
            </CardContent>
          </Card>
        </div>
        <Card className="grid-card consolidado-grid">
          <CardContent>
            <div className="toolbar"><div><h2>Base consolidada</h2><p>Incluye catálogos planificados y promociones especiales.</p></div></div>
            <div className="table-wrap">
              <table>
                <thead><tr>{CONSOLIDADO_TABLE_HEADERS.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {!appliedFilters && <tr><td colSpan={CONSOLIDADO_TABLE_HEADERS.length}><div className="empty-state">Use Buscar para cargar el consolidado.</div></td></tr>}
                  {appliedFilters && !rowsFiltradas.length && <tr><td colSpan={CONSOLIDADO_TABLE_HEADERS.length}><div className="empty-state">No hay promociones con esos filtros.</div></td></tr>}
                  {paginatedRows.map((row) => {
                    const activity = getActivity(row);
                    const activityId = getActivityId(row);
                    const segmenta = isSegmentedRow(row) ? "SI" : "NO";
                    const segmentoCliente = row.segmentoCliente || row.segmento_cliente || (segmenta === "SI" ? row.segmento : "");
                    const activityName = getActivityName(row, activity);
                    const rowId = getRowId(row);
                    return (
                      <tr key={rowId} className={classNames(isAnulledPromotion(row) && "row-anulled")}>
                        <td><b>{activityId}</b></td>
                        <td>{activityName || "Sin nombre"}</td>
                        <td>{getOfferId(row)}</td>
                        <td><span className={activity.tipo_actividad === "ESPECIAL" ? "pill yellow" : "pill green"}>{activity.tipo_actividad || "CATALOGO"}</span></td>
                        <td>{activity.canal || ""}</td>
                        <td>{getAlcanceTipo(row)}</td>
                        <td>{getAlcanceValor(row)}</td>
                        <td>{segmenta}</td>
                        <td>{segmentoCliente}</td>
                        <td>{row.comprador}</td>
                        <td>{getTipoPromo(row)}</td>
                        <td>{getGrupoOferta(row)}</td>
                        <td>{getTipoSku(row)}</td>
                        <td>{row.variante || ""}</td>
                        <td><b>{row.sku}</b></td>
                        <td style={{ textAlign: "center" }}>{row.numero_pagina || row.numPagina || "-"}</td>
                        <td>{row.descripcion}</td>
                        <td>{getCantidadMinima(row)}</td>
                        <td>{getPrecioAhora(row)}</td>
                        <td>{row.descuento}</td>
                        <td><span className={isAnulledPromotion(row) ? "pill red" : "pill green"}>{row.estado_registro || row.estadoRegistro || "REGISTRADO"}</span></td>
                        <td className="comprador-comment-cell" style={{ minWidth: 220, maxWidth: 320, whiteSpace: "normal" }}>{firstFilled(row.comentario, row.comentario_comprador) || <span className="muted">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {appliedFilters && rowsFiltradas.length > CONSOLIDADO_PAGE_SIZE && <div className="pagination-bar"><Button variant="outline" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={safeCurrentPage <= 1}>Anterior</Button><span>Pagina {safeCurrentPage} de {totalPages} · {rowsFiltradas.length} filas filtradas</span><Button variant="outline" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={safeCurrentPage >= totalPages}>Siguiente</Button></div>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
