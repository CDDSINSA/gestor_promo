import { useSkuLookup } from "../features/skuMaster/SkuLookupContext";
import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Download,
  FileSpreadsheet,
  Filter,
  ListChecks,
  Percent,
  Plus,
  RefreshCw,
  Search,
  Tag,
  Users,
  X,
} from "lucide-react";
import { Button, Card, CardContent, Header, Metric } from "./ui";
import { classNames } from "../utils/common";
import { PERMISSIONS, ROLES, normalizeRole } from "../constants/permissions";
import { useAuth } from "../hooks/useAuth";
import { usePermissions } from "../hooks/usePermissions";
import {
  exportFidelizacionOrce,
  loadCanastoFidelizacion,
  loadSolicitudFidelizacionDetalle,
} from "../services/fidelizacionService";
import { hasSupabaseConnection } from "../services/supabase";
import { segmentosClientesIniciales } from "../constants/seedData";
import FidelizacionUpdateModal from "./FidelizacionUpdateModal";

const PAGE_SIZE = 50;

export default function FidelizacionPage({
  actividades = [],
  setActividades,
  compradores = [],
  jerarquiaCategorias = [],
  segmentosClientes = [],
  skuMaster = {},
  skuMasterCount = 0,
  supabaseConnection = null,
  supabaseReady = false,
  setActive,
  rows = [],
}) {
  const lookupSkus = useSkuLookup();
  const { appUser } = useAuth();
  const { can } = usePermissions();

  const [canal, setCanal] = useState("comasa"); // 'comasa' | 'retail'
  const [activeTab, setActiveTab] = useState("canasto"); // 'canasto' | 'solicitudes'

  const [canastoRows, setCanastoRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  // Filters
  const [selectedDivision, setSelectedDivision] = useState("Todas");
  const [selectedEstatus, setSelectedEstatus] = useState("Todos");
  const [skuSearch, setSkuSearch] = useState("");
  const [massSkuInput, setMassSkuInput] = useState("");
  const [showMassSkuModal, setShowMassSkuModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Update modal
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);

  // Request detail viewer modal
  const [selectedSolicitud, setSelectedSolicitud] = useState(null);
  const [solicitudDetalleRows, setSolicitudDetalleRows] = useState([]);
  const [loadingDetalle, setLoadingDetalle] = useState(false);

  const currentRole = normalizeRole(appUser?.rol || appUser?.role);
  const isBuyer = currentRole === ROLES.BUYER;
  const isPricingOrAdmin = currentRole === ROLES.ADMIN || currentRole === ROLES.OPER;

  // Segmentos activos para el canal seleccionado
  const channelSegments = useMemo(() => {
    const list = (segmentosClientes && segmentosClientes.length > 0)
      ? segmentosClientes
      : segmentosClientesIniciales;
    return list
      .filter((s) => s.activo !== false && String(s.canal).toLowerCase() === String(canal).toLowerCase())
      .sort((a, b) => (a.orden || 0) - (b.orden || 0));
  }, [segmentosClientes, canal]);

  // Lista de divisiones disponibles
  const divisionOptions = useMemo(() => {
    const set = new Set();
    (jerarquiaCategorias || []).forEach((j) => {
      const name = j.division || j.categoria || j.nombre;
      if (name) set.add(name);
    });
    canastoRows.forEach((r) => {
      if (r.division) set.add(r.division);
    });
    return ["Todas", ...Array.from(set).sort()];
  }, [jerarquiaCategorias, canastoRows]);

  // Cargar canasto
  const fetchData = async () => {
    setLoading(true);
    setStatusMessage("");
    try {
      const data = await loadCanastoFidelizacion(supabaseConnection, {
        canal,
        division: selectedDivision,
        estatus: selectedEstatus,
      });
      setCanastoRows(data);
    } catch (err) {
      console.error(err);
      setStatusMessage("Error al cargar canasto de fidelización.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [canal, selectedDivision, selectedEstatus]);

  // Reset page when filters or channel change
  useEffect(() => {
    setCurrentPage(1);
  }, [canal, selectedDivision, selectedEstatus, skuSearch]);

  // Mapa consolidado de SKU -> datos de catálogo ya existentes (descripción, división, etc.)
  const catalogSkuMap = useMemo(() => {
    const map = new Map();

    const registerItem = (sku, desc, div, comp) => {
      if (!sku) return;
      const s = String(sku).trim();
      const sKey = s.toLowerCase();
      const existing = map.get(sKey);
      const cleanDesc = desc || existing?.descripcion || "";
      const cleanDiv = div || existing?.division || "";
      const cleanComp = comp || existing?.comprador || "";
      const entry = { sku: s, descripcion: cleanDesc, division: cleanDiv, comprador: cleanComp };
      
      map.set(sKey, entry);
      map.set(s, entry);
      const num = Number(s);
      if (!Number.isNaN(num)) {
        const numStr = String(num);
        map.set(numStr, entry);
        map.set(numStr.padStart(5, "0"), entry);
        map.set(numStr.padStart(6, "0"), entry);
        map.set(numStr.padStart(7, "0"), entry);
        map.set(numStr.padStart(8, "0"), entry);
      }
    };

    // 1. Del catálogo de promociones ya existente en la aplicación (rows)
    (rows || []).forEach((r) => {
      const s = String(r.sku || "").trim();
      if (!s) return;
      const desc = r.descripcion || r.desc || r.articulo || r.nombre_articulo || "";
      const div = r.division || r.depto || r.departamento || "";
      const comp = r.comprador || "";
      registerItem(s, desc, div, comp);
    });

    // 2. Del maestro de SKU (skuMaster)
    Object.entries(skuMaster || {}).forEach(([sku, info]) => {
      const s = String(sku || "").trim();
      if (!s || !info) return;
      const desc = info.descripcion || "";
      const div = info.dep_id || info.division || info.departamento || "";
      registerItem(s, desc, div, "");
    });

    // 3. Del canasto actual existente
    (canastoRows || []).forEach((c) => {
      const s = String(c.sku || "").trim();
      if (!s) return;
      const desc = c.descripcion || "";
      const div = c.division || "";
      const comp = c.comprador || "";
      registerItem(s, desc, div, comp);
    });

    return map;
  }, [rows, skuMaster, canastoRows]);

  // Consultar descripciones faltantes en Supabase para los SKUs del canasto
  useEffect(() => {
    if (!canastoRows.length) return;
    let cancelled = false;
    void lookupSkus(canastoRows.map((row) => row.sku)).catch((error) => {
      if (!cancelled) setStatusMessage(error.message || "No se pudieron consultar los artículos.");
    });
    return () => { cancelled = true; };
  }, [canastoRows, lookupSkus]);

  // Transformar / pivotar canasto vertical a horizontal para visualización
  const pivotedRows = useMemo(() => {
    const skuMap = new Map();

    canastoRows.forEach((item) => {
      const sku = String(item.sku).trim();
      if (!skuMap.has(sku)) {
        const sKey = sku.toLowerCase();
        const skuNum = Number(sku);
        const catItem =
          catalogSkuMap.get(sKey) ||
          catalogSkuMap.get(sku) ||
          (!Number.isNaN(skuNum) ? catalogSkuMap.get(String(skuNum)) : null) ||
          {};
        const masterItem =
          skuMaster[sku] ||
          skuMaster[sKey] ||
          (!Number.isNaN(skuNum) ? skuMaster[String(skuNum)] : null) ||
          {};
        const finalDesc = item.descripcion || catItem.descripcion || masterItem.descripcion || "-";
        const finalDiv = item.division || catItem.division || masterItem.dep_id || masterItem.division || masterItem.departamento || "-";
        const finalComp = item.comprador || catItem.comprador || "-";

        skuMap.set(sku, {
          sku,
          descripcion: finalDesc,
          division: finalDiv,
          comprador: finalComp,
          estatus: item.estatus || "Activo",
          ultima_solicitud_id: item.ultima_solicitud_id || "",
          updated_at: item.updated_at || "",
          discounts: {},
        });
      }
      const entry = skuMap.get(sku);
      entry.discounts[String(item.segmento_id)] = item.descuento;
      if (item.estatus === "En proceso") {
        entry.estatus = "En proceso";
      }
    });

    let list = Array.from(skuMap.values());

    // Filtrar por SKU o lista de SKUs
    if (skuSearch.trim()) {
      const query = skuSearch.trim().toLowerCase();
      list = list.filter((r) => r.sku.toLowerCase().includes(query) || r.descripcion.toLowerCase().includes(query));
    }

    return list;
  }, [canastoRows, catalogSkuMap, skuSearch]);

  // Paginación segura
  const totalPages = Math.max(1, Math.ceil(pivotedRows.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedRows = useMemo(() => {
    const start = (safeCurrentPage - 1) * PAGE_SIZE;
    return pivotedRows.slice(start, start + PAGE_SIZE);
  }, [pivotedRows, safeCurrentPage]);

  // Solicitudes de fidelización
  const fidelizacionRequests = useMemo(() => {
    return (actividades || []).filter((act) => {
      const id = act.actividad_id || act.actividadId || "";
      const isFid = id.startsWith("FID-") || act.subtipo === "FIDELIZACION";
      const matchesCanal = String(act.canal).toLowerCase() === canal.toLowerCase();
      return isFid && matchesCanal;
    });
  }, [actividades, canal]);

  const handleOpenSolicitudDetalle = async (req) => {
    setSelectedSolicitud(req);
    setLoadingDetalle(true);
    try {
      const id = req.actividad_id || req.actividadId;
      const details = await loadSolicitudFidelizacionDetalle(supabaseConnection, id);
      await lookupSkus((details || []).map((item) => item.sku));
      setSolicitudDetalleRows(details || []);
      return details || [];
    } catch (e) {
      console.error(e);
      setSolicitudDetalleRows([]);
      return [];
    } finally {
      setLoadingDetalle(false);
    }
  };

  const handleExportOrce = async (itemsToExport, customName) => {
    try {
    const masterData = await lookupSkus((itemsToExport || []).map((item) => item.sku));
    const filename = customName || `Carga_ORCE_Fidelizacion_${canal.toUpperCase()}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const enriched = (itemsToExport || []).map((d) => {
      const sKey = String(d.sku || "").trim().toLowerCase();
      const skuNum = Number(d.sku);
      const cat =
        catalogSkuMap.get(sKey) ||
        catalogSkuMap.get(String(d.sku)) ||
        (!Number.isNaN(skuNum) ? catalogSkuMap.get(String(skuNum)) : null) ||
        {};
      const master =
        masterData[d.sku] ||
        masterData[sKey] ||
        (!Number.isNaN(skuNum) ? masterData[String(skuNum)] : null) ||
        {};
      return {
        ...d,
        descripcion: d.descripcion || cat.descripcion || master.descripcion || "",
        division: d.division || cat.division || master.dep_id || master.division || master.departamento || "",
      };
    });
    await exportFidelizacionOrce(enriched, filename);
    } catch (error) { alert(`No se pudo exportar: ${error.message}`); }
  };

  const handleExportOrceByRequest = async (req) => {
    try {
      const id = req.actividad_id || req.actividadId;
      const details = await loadSolicitudFidelizacionDetalle(supabaseConnection, id);
      if (!details || !details.length) {
        alert(`No se encontraron registros de detalle para la solicitud ${id}.`);
        return;
      }
      handleExportOrce(details, `ORCE_${id}.xlsx`);
    } catch (e) {
      console.error("Error al exportar ORCE:", e);
    }
  };

  const handleApplyMassSku = () => {
    const skus = massSkuInput
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (skus.length > 0) {
      setSkuSearch(skus[0]);
    }
    setShowMassSkuModal(false);
  };

  const handleSolicitudCreated = (newActividad) => {
    if (setActividades && newActividad) {
      setActividades((prev) => [newActividad, ...prev]);
    }
    fetchData();
  };

  return (
    <div className="fidelizacion-page">
      <div className="toolbar page-header-toolbar">
        <Header
          title="Fidelización de Clientes"
          subtitle="Administración de canastos permanentes y matriz de descuentos por segmento para Comasa y Retail."
        />
        <div className="toolbar-actions home-sync-actions">
          <Button variant="outline" onClick={fetchData} disabled={loading}>
            <RefreshCw size={15} className={loading ? "spin" : ""} /> Actualizar datos
          </Button>
          <Button onClick={() => setIsUpdateModalOpen(true)}>
            <Plus size={16} /> Solicitar actualización de canasto
          </Button>
        </div>
      </div>

      {/* Selector de Canal y Pestañas de Subvista */}
      <div className="fidelizacion-top-controls">
        <div className="fidelizacion-channel-nav">
          <button
            type="button"
            className={classNames("fidelizacion-channel-btn", canal === "comasa" && "active")}
            onClick={() => setCanal("comasa")}
          >
            COMASA (~12,000 SKU)
          </button>
          <button
            type="button"
            className={classNames("fidelizacion-channel-btn", canal === "retail" && "active")}
            onClick={() => setCanal("retail")}
          >
            RETAIL
          </button>
        </div>

        <div className="special-request-tabs" role="tablist">
          <button
            type="button"
            className={activeTab === "canasto" ? "selected" : ""}
            onClick={() => setActiveTab("canasto")}
          >
            <Percent size={15} /> Canasto de Artículos ({pivotedRows.length})
          </button>
          <button
            type="button"
            className={activeTab === "solicitudes" ? "selected" : ""}
            onClick={() => setActiveTab("solicitudes")}
          >
            <ListChecks size={15} /> Solicitudes de Modificación ({fidelizacionRequests.length})
          </button>
        </div>
      </div>

      {/* Subvista 1: Canasto de Artículos */}
      {activeTab === "canasto" && (
        <>
          {/* Barra de Filtros */}
          <Card className="fidelizacion-filter-card">
            <CardContent>
              <div className="fidelizacion-filter-grid">
                <label className="field">
                  <span>Buscar por SKU o descripción</span>
                  <div className="search compact">
                    <Search size={16} />
                    <input
                      placeholder="Ingrese código SKU o texto..."
                      value={skuSearch}
                      onChange={(e) => setSkuSearch(e.target.value)}
                    />
                    {skuSearch && (
                      <button type="button" onClick={() => setSkuSearch("")} className="icon-btn-compact" title="Limpiar búsqueda">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </label>

                <label className="field">
                  <span>División / Categoría</span>
                  <select value={selectedDivision} onChange={(e) => setSelectedDivision(e.target.value)}>
                    {divisionOptions.map((div) => (
                      <option key={div} value={div}>{div}</option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Estatus</span>
                  <select value={selectedEstatus} onChange={(e) => setSelectedEstatus(e.target.value)}>
                    <option value="Todos">Todos</option>
                    <option value="Activo">Activo (con descuento)</option>
                    <option value="Inactivo">Inactivo (0%)</option>
                    <option value="En proceso">En proceso</option>
                  </select>
                </label>

                <div className="toolbar-actions">
                  <Button variant="outline" onClick={() => setShowMassSkuModal(true)} title="Consultar varios SKU a la vez">
                    Pegar lista SKU
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleExportOrce(canastoRows, `Canasto_Fidelizacion_${canal.toUpperCase()}.xlsx`)}
                    title="Exportar formato ORCE"
                  >
                    <Download size={15} /> Exportar ORCE
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Grilla Pivoteada */}
          <Card>
            <CardContent style={{ padding: 0 }}>
              <div className="fidelizacion-table-wrapper">
                <table className="fidelizacion-table">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Descripción</th>
                      <th>División</th>
                      {channelSegments.map((s) => (
                        <th key={s.segmento_id} className="segment-header">
                          <span style={{ display: "block", fontWeight: 700 }}>{s.segmento_id}</span>
                          <span style={{ fontSize: "0.68rem", color: "#64748b", fontWeight: 400 }}>{s.nombre_segmento}</span>
                        </th>
                      ))}
                      <th style={{ textAlign: "center" }}>Estatus</th>
                      <th>Comprador</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRows.map((row) => (
                      <tr key={row.sku}>
                        <td className="fidelizacion-sku-code">{row.sku}</td>
                        <td className="fidelizacion-desc-cell" title={row.descripcion}>
                          {row.descripcion}
                        </td>
                        <td style={{ color: "#64748b" }}>{row.division}</td>
                        {channelSegments.map((s) => {
                          const val = row.discounts[s.segmento_id];
                          const hasDiscount = val !== undefined && val !== null && val > 0;
                          return (
                            <td
                              key={s.segmento_id}
                              className={classNames(
                                "segment-cell",
                                hasDiscount ? "has-discount" : "zero-discount"
                              )}
                            >
                              {hasDiscount ? `${val}%` : "0%"}
                            </td>
                          );
                        })}
                        <td style={{ textAlign: "center" }}>
                          <span
                            className={classNames(
                              "pill",
                              row.estatus === "Activo" && "green",
                              row.estatus === "Inactivo" && "gray",
                              row.estatus === "En proceso" && "yellow"
                            )}
                            title={row.ultima_solicitud_id ? `En proceso en ${row.ultima_solicitud_id}` : ""}
                          >
                            {row.estatus}
                          </span>
                        </td>
                        <td style={{ color: "#64748b" }}>{row.comprador}</td>
                      </tr>
                    ))}

                    {pivotedRows.length === 0 && (
                      <tr>
                        <td colSpan={5 + channelSegments.length} style={{ textAlign: "center", padding: "2.5rem" }}>
                          <div className="empty-state">No se encontraron artículos con los filtros aplicados.</div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Paginación */}
              {pivotedRows.length > PAGE_SIZE && (
                <div className="pagination-bar">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    disabled={safeCurrentPage <= 1}
                  >
                    Anterior
                  </Button>
                  <span>
                    Página {safeCurrentPage} de {totalPages} · {pivotedRows.length} artículos (Mostrando {(safeCurrentPage - 1) * PAGE_SIZE + 1} - {Math.min(safeCurrentPage * PAGE_SIZE, pivotedRows.length)})
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                    disabled={safeCurrentPage >= totalPages}
                  >
                    Siguiente
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Subvista 2: Solicitudes de Actualización */}
      {activeTab === "solicitudes" && (
        <Card>
          <CardContent style={{ padding: 0 }}>
            <div className="fidelizacion-table-wrapper">
              <table className="fidelizacion-table">
                <thead>
                  <tr>
                    <th>ID Solicitud</th>
                    <th>Nombre / Motivo</th>
                    <th>Solicitante</th>
                    <th>SKUs Afectados</th>
                    <th>Estado en Kanban</th>
                    <th>Fecha Solicitud</th>
                    <th style={{ textAlign: "right" }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {fidelizacionRequests.map((req) => (
                    <tr key={req.actividad_id}>
                      <td className="fidelizacion-sku-code">{req.actividad_id}</td>
                      <td>
                        <strong>{req.nombre_actividad}</strong>
                        <p style={{ margin: 0, fontSize: "0.75rem", color: "#64748b" }}>{req.motivo_solicitud}</p>
                      </td>
                      <td>{req.comprador || req.solicitante}</td>
                      <td>{req.skus_count || "-"} SKU</td>
                      <td>
                        <span className={classNames("status-badge", `status-${String(req.estado || "").toLowerCase().replace(/\s+/g, "")}`)}>
                          {req.estado}
                        </span>
                      </td>
                      <td style={{ color: "#64748b" }}>
                        {req.fecha_creacion ? new Date(req.fecha_creacion).toLocaleDateString() : "-"}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div className="toolbar-actions" style={{ justifyContent: "flex-end" }}>
                          <Button variant="outline" className="btn-sm" onClick={() => handleOpenSolicitudDetalle(req)}>
                            Ver Detalle
                          </Button>
                          <Button
                            variant="outline"
                            className="btn-sm"
                            onClick={() => handleExportOrceByRequest(req)}
                            title="Descargar formato plano para procesar en ORCE"
                          >
                            <Download size={14} /> ORCE
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {fidelizacionRequests.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", padding: "2.5rem" }}>
                        <div className="empty-state">No hay solicitudes registradas para el canal {canal.toUpperCase()}.</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modal de Búsqueda Masiva de SKUs */}
      {showMassSkuModal && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card" role="dialog" aria-modal="true" style={{ width: "min(32rem, 95vw)" }}>
            <div className="modal-head">
              <h2>Pegar lista de SKUs</h2>
              <button type="button" className="icon-btn" onClick={() => setShowMassSkuModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-note">Ingrese los códigos de SKU separados por coma, espacio o salto de línea:</p>
              <textarea
                rows={6}
                value={massSkuInput}
                onChange={(e) => setMassSkuInput(e.target.value)}
                placeholder="Ejemplo:&#10;1009&#10;34324&#10;200001"
              />
            </div>
            <div className="modal-actions">
              <Button variant="outline" onClick={() => setShowMassSkuModal(false)}>Cancelar</Button>
              <Button onClick={handleApplyMassSku}>Filtrar Canasto</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para ver detalle de la Solicitud */}
      {selectedSolicitud && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card fidelizacion-modal-card" role="dialog" aria-modal="true" style={{ width: "min(52rem, 95vw)" }}>
            <div className="modal-head">
              <div>
                <h2>Detalle de Solicitud: {selectedSolicitud.actividad_id}</h2>
                <p>{selectedSolicitud.nombre_actividad} · Estado: {selectedSolicitud.estado}</p>
              </div>
              <button type="button" className="icon-btn" onClick={() => setSelectedSolicitud(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              {loadingDetalle ? (
                <div className="empty-state">Cargando detalles de la solicitud...</div>
              ) : (
                <div className="fidelizacion-preview-table-wrap" style={{ maxHeight: "350px" }}>
                  <table className="fidelizacion-table">
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Descripción</th>
                        <th>Segmento</th>
                        <th>Descuento Anterior</th>
                        <th>Descuento Solicitado</th>
                        <th>Cambio</th>
                        <th>Estado Staging</th>
                      </tr>
                    </thead>
                    <tbody>
                      {solicitudDetalleRows.map((d, i) => {
                        const sKey = String(d.sku || "").trim().toLowerCase();
                        const skuNum = Number(d.sku);
                        const cat =
                          catalogSkuMap.get(sKey) ||
                          catalogSkuMap.get(String(d.sku)) ||
                          (!Number.isNaN(skuNum) ? catalogSkuMap.get(String(skuNum)) : null) ||
                          {};
                        const master =
                          skuMaster[d.sku] ||
                          skuMaster[sKey] ||
                          (!Number.isNaN(skuNum) ? skuMaster[String(skuNum)] : null) ||
                          {};
                        const desc = d.descripcion || cat.descripcion || master.descripcion || "-";

                        return (
                          <tr key={i}>
                            <td className="fidelizacion-sku-code">{d.sku}</td>
                            <td className="fidelizacion-desc-cell">{desc}</td>
                            <td>{d.segmento_id}</td>
                            <td>{d.descuento_anterior}%</td>
                            <td style={{ fontWeight: 600 }}>{d.descuento_solicitado}%</td>
                            <td>
                              <span className={classNames("pill", d.tipo_cambio === "NUEVO" && "green", d.tipo_cambio === "SUBE" && "green", d.tipo_cambio === "BAJA" && "yellow", d.tipo_cambio === "ELIMINA" && "red")}>
                                {d.tipo_cambio}
                              </span>
                            </td>
                            <td>{d.estado}</td>
                          </tr>
                        );
                      })}
                      {solicitudDetalleRows.length === 0 && (
                        <tr>
                          <td colSpan={7} style={{ textAlign: "center", padding: "1.5rem" }}>No se encontraron registros de detalle.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="modal-actions">
              <Button variant="outline" onClick={() => setSelectedSolicitud(null)}>Cerrar</Button>
              <Button onClick={() => handleExportOrce(solicitudDetalleRows, `ORCE_${selectedSolicitud.actividad_id}.xlsx`)}>
                <Download size={15} /> Descargar Archivo para ORCE
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Actualización de Canasto */}
      {isUpdateModalOpen && (
        <FidelizacionUpdateModal
          isOpen={isUpdateModalOpen}
          onClose={() => setIsUpdateModalOpen(false)}
          canal={canal}
          currentCanasto={canastoRows}
          segmentos={channelSegments}
          skuMaster={skuMaster}
          catalogSkuMap={catalogSkuMap}
          catalogRows={rows}
          actividades={actividades}
          compradores={compradores}
          appUser={appUser}
          connection={supabaseConnection}
          onSolicitudCreated={handleSolicitudCreated}
        />
      )}
    </div>
  );
}
