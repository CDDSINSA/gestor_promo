import React, { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  Info,
  Layers,
  RefreshCw,
  Search,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import {
  getSkuMasterSummaryFromSupabase,
  replaceSkuMasterInSupabase,
} from "../../services/supabaseService";
import { formatDateTime } from "../../utils/common";
import { Button, Card, CardContent } from "../../components/ui";
import { parseSkuMasterFile } from "./skuMasterParser";

export default function SkuMasterSettingsCard({
  supabaseConnection,
  supabaseReady = true,
  onSkuMasterUpdated = null,
}) {
  const [stats, setStats] = useState({ total: 0, last_updated: null, loading: false, error: null });
  const [selectedFile, setSelectedFile] = useState(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const [parsedResult, setParsedResult] = useState(null);
  const [uploadState, setUploadState] = useState({ status: "idle", percent: 0, message: "" });
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showHelpGuide, setShowHelpGuide] = useState(false);
  const [previewFilter, setPreviewFilter] = useState("");
  const fileInputRef = useRef(null);

  const fetchStats = async () => {
    if (!supabaseReady) return;
    setStats((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await getSkuMasterSummaryFromSupabase(supabaseConnection);
      setStats({
        total: data?.total ?? 0,
        last_updated: data?.last_updated ?? null,
        loading: false,
        error: null,
      });
    } catch (err) {
      setStats((prev) => ({
        ...prev,
        loading: false,
        error: err.message || "No se pudo consultar el estado del catálogo.",
      }));
    }
  };

  useEffect(() => {
    fetchStats();
  }, [supabaseReady]);

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setIsParsing(true);
    setParseError("");
    setParsedResult(null);
    setUploadState({ status: "idle", percent: 0, message: "" });
    setPreviewFilter("");

    try {
      const result = await parseSkuMasterFile(file);
      setParsedResult(result);
    } catch (err) {
      setParseError(err.message || "Error al procesar el archivo seleccionado.");
      setSelectedFile(null);
    } finally {
      setIsParsing(false);
      event.target.value = "";
    }
  };

  const handleStartUpload = () => {
    if (!parsedResult?.rows?.length) return;
    setShowConfirmModal(true);
  };

  const executeUpload = async () => {
    setShowConfirmModal(false);
    if (!parsedResult?.rows?.length) return;

    setUploadState({
      status: "uploading",
      percent: 2,
      message: "Preparando actualización del catálogo maestro...",
    });

    try {
      await replaceSkuMasterInSupabase(
        supabaseConnection,
        parsedResult.rows,
        ({ phase, percent, message }) => {
          setUploadState({ status: "uploading", percent, message });
        }
      );

      setUploadState({
        status: "success",
        percent: 100,
        message: `¡Catálogo maestro actualizado exitosamente! Se procesaron ${parsedResult.rows.length.toLocaleString()} artículos.`,
      });

      await fetchStats();
      onSkuMasterUpdated?.(parsedResult.rows.length);
      setParsedResult(null);
      setSelectedFile(null);
    } catch (err) {
      setUploadState({
        status: "error",
        percent: 0,
        message: err.message || "Ocurrió un error al actualizar el catálogo.",
      });
    }
  };

  const handleResetFile = () => {
    setSelectedFile(null);
    setParsedResult(null);
    setParseError("");
    setPreviewFilter("");
    setUploadState({ status: "idle", percent: 0, message: "" });
  };

  const filteredPreview = parsedResult?.rows
    ? parsedResult.rows
        .filter((row) => {
          if (!previewFilter.trim()) return true;
          const q = previewFilter.toLowerCase().trim();
          return (
            String(row.sku || "").toLowerCase().includes(q) ||
            String(row.descripcion || "").toLowerCase().includes(q) ||
            String(row.proveedor || "").toLowerCase().includes(q) ||
            String(row.num_parte || "").toLowerCase().includes(q)
          );
        })
        .slice(0, 8)
    : [];

  const isExcel = selectedFile?.name?.toLowerCase().endsWith(".xlsx") || selectedFile?.name?.toLowerCase().endsWith(".xls");

  return (
    <Card className="settings-section-card" style={{ border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
      <CardContent style={{ padding: "1.5rem" }}>
        {/* Cabecera del Módulo */}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", paddingBottom: "1.25rem", borderBottom: "1px solid #f1f5f9" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <div style={{ width: "2.25rem", height: "2.25rem", borderRadius: "0.5rem", background: "#e8f5ee", display: "flex", alignItems: "center", justifyContent: "center", color: "#006B3F" }}>
                <Database size={20} />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "#0f172a", letterSpacing: "-0.01em" }}>
                  Catálogo Maestro de Productos
                </h2>
                <p style={{ margin: "0.15rem 0 0", color: "#64748b", fontSize: "0.85rem" }}>
                  Sincronización del catálogo oficial de artículos para búsqueda y autocompletado en promociones.
                </p>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <button
              type="button"
              onClick={() => setShowHelpGuide(!showHelpGuide)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                padding: "0.45rem 0.8rem",
                borderRadius: "0.45rem",
                border: "1px solid #cbd5e1",
                background: showHelpGuide ? "#f8fafc" : "#ffffff",
                color: "#475569",
                fontSize: "0.82rem",
                fontWeight: 500,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <HelpCircle size={15} color="#006B3F" />
              <span>Formato de archivo</span>
              {showHelpGuide ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            <Button
              variant="outline"
              onClick={fetchStats}
              disabled={stats.loading || uploadState.status === "uploading"}
              title="Refrescar estado actual"
              style={{ padding: "0.45rem 0.8rem", fontSize: "0.82rem" }}
            >
              <RefreshCw size={14} className={stats.loading ? "spin" : ""} /> Refrescar
            </Button>
          </div>
        </div>

        {/* Guía Desplegable de Formato (limpia, no invasiva) */}
        {showHelpGuide && (
          <div
            style={{
              margin: "1.25rem 0 0",
              padding: "1rem 1.25rem",
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: "0.6rem",
              fontSize: "0.83rem",
              color: "#166534",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 600, marginBottom: "0.5rem" }}>
              <Info size={16} /> Estructura requerida en el archivo (Excel o CSV):
            </div>
            <p style={{ margin: "0 0 0.75rem", color: "#15803d", lineHeight: "1.4" }}>
              El archivo de extracción de Oracle / ERP debe contener los encabezados estándar o ubicarse en las siguientes posiciones:
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.5rem" }}>
              <div style={{ background: "#ffffff", padding: "0.5rem 0.75rem", borderRadius: "0.35rem", border: "1px solid #dcfce7" }}>
                <strong style={{ color: "#006B3F" }}>Columna A:</strong> SKU / Código Artículo
              </div>
              <div style={{ background: "#ffffff", padding: "0.5rem 0.75rem", borderRadius: "0.35rem", border: "1px solid #dcfce7" }}>
                <strong style={{ color: "#006B3F" }}>Columna D:</strong> Descripción comercial
              </div>
              <div style={{ background: "#ffffff", padding: "0.5rem 0.75rem", borderRadius: "0.35rem", border: "1px solid #dcfce7" }}>
                <strong style={{ color: "#006B3F" }}>Columna E:</strong> Departamento (DEPT)
              </div>
              <div style={{ background: "#ffffff", padding: "0.5rem 0.75rem", borderRadius: "0.35rem", border: "1px solid #dcfce7" }}>
                <strong style={{ color: "#006B3F" }}>Columna H:</strong> Unidad de Medida (UOM)
              </div>
              <div style={{ background: "#ffffff", padding: "0.5rem 0.75rem", borderRadius: "0.35rem", border: "1px solid #dcfce7" }}>
                <strong style={{ color: "#006B3F" }}>Columna K:</strong> Nombre del Proveedor
              </div>
              <div style={{ background: "#ffffff", padding: "0.5rem 0.75rem", borderRadius: "0.35rem", border: "1px solid #dcfce7" }}>
                <strong style={{ color: "#006B3F" }}>Columna M:</strong> Precio Regular / Lista
              </div>
              <div style={{ background: "#ffffff", padding: "0.5rem 0.75rem", borderRadius: "0.35rem", border: "1px solid #dcfce7" }}>
                <strong style={{ color: "#006B3F" }}>Columna O:</strong> Número de Parte / VPN
              </div>
            </div>
          </div>
        )}

        {/* Tarjetas de Métricas Ejecutivas */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "1rem",
            margin: "1.25rem 0",
          }}
        >
          <div
            style={{
              padding: "1rem 1.25rem",
              background: "#ffffff",
              borderRadius: "0.75rem",
              border: "1px solid #e2e8f0",
              borderLeft: "4px solid #006B3F",
              boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
            }}
          >
            <div style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.03em" }}>
              Total de Artículos Activos
            </div>
            <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "#0f172a", marginTop: "0.25rem" }}>
              {stats.loading ? "Consultando..." : `${stats.total.toLocaleString()} SKU`}
            </div>
          </div>

          <div
            style={{
              padding: "1rem 1.25rem",
              background: "#ffffff",
              borderRadius: "0.75rem",
              border: "1px solid #e2e8f0",
              borderLeft: "4px solid #00A6C8",
              boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
            }}
          >
            <div style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.03em" }}>
              Última Actualización
            </div>
            <div style={{ fontSize: "1.05rem", fontWeight: 600, color: "#334155", marginTop: "0.45rem" }}>
              {stats.last_updated ? formatDateTime(stats.last_updated) : "Sin registros cargados aún"}
            </div>
          </div>

          <div
            style={{
              padding: "1rem 1.25rem",
              background: "#ffffff",
              borderRadius: "0.75rem",
              border: "1px solid #e2e8f0",
              borderLeft: supabaseReady ? "4px solid #10b981" : "4px solid #ef4444",
              boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
            }}
          >
            <div style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.03em" }}>
              Estado del Catálogo
            </div>
            <div
              style={{
                fontSize: "0.92rem",
                fontWeight: 600,
                color: supabaseReady ? "#047857" : "#b91c1c",
                marginTop: "0.5rem",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
              }}
            >
              {supabaseReady ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
              {supabaseReady ? "Sincronizado y Operativo" : "Servicio no disponible"}
            </div>
          </div>
        </div>

        {/* Zona de Arrastrar / Cargar Archivo */}
        {!selectedFile && uploadState.status !== "uploading" && (
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: "2px dashed #cbd5e1",
              borderRadius: "0.85rem",
              padding: "2.5rem 1.5rem",
              textAlign: "center",
              cursor: "pointer",
              background: "#fcfdfd",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#006B3F";
              e.currentTarget.style.background = "#f7faf8";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "#cbd5e1";
              e.currentTarget.style.background = "#fcfdfd";
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
            <div
              style={{
                width: "3.5rem",
                height: "3.5rem",
                borderRadius: "50%",
                background: "#e8f5ee",
                color: "#006B3F",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 1rem",
              }}
            >
              <UploadCloud size={28} />
            </div>
            <div style={{ fontSize: "1.05rem", fontWeight: 600, color: "#1e293b" }}>
              Seleccionar nuevo archivo del catálogo
            </div>
            <div style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "0.35rem", maxWidth: "34rem", marginInline: "auto" }}>
              Haz clic aquí para examinar o arrastra tu archivo <strong>Excel (.xlsx, .xls)</strong> o <strong>CSV</strong> exportado del ERP.
            </div>
          </div>
        )}

        {/* Estado mientras parsea el archivo localmente */}
        {isParsing && (
          <div style={{ padding: "2rem", textAlign: "center", color: "#006B3F" }}>
            <RefreshCw size={26} className="spin" style={{ margin: "0 auto 0.5rem" }} />
            <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>Analizando estructura del archivo...</div>
            <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "0.25rem" }}>
              Validando columnas, formatos y deduplicando artículos
            </div>
          </div>
        )}

        {/* Alerta de Error al procesar el archivo */}
        {parseError && (
          <div
            style={{
              padding: "0.85rem 1rem",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              borderRadius: "0.5rem",
              margin: "1rem 0",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "0.85rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <AlertTriangle size={18} />
              <span>{parseError}</span>
            </div>
            <button
              type="button"
              onClick={() => setParseError("")}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#991b1b" }}
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Vista Previa y Confirmación de Carga */}
        {parsedResult && uploadState.status !== "uploading" && (
          <div
            style={{
              marginTop: "1.25rem",
              border: "1px solid #cbd5e1",
              borderRadius: "0.75rem",
              overflow: "hidden",
              boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)",
            }}
          >
            {/* Barra informativa del archivo cargado */}
            <div
              style={{
                padding: "0.85rem 1.25rem",
                background: "#f8fafc",
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.75rem",
                borderBottom: "1px solid #e2e8f0",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <div
                  style={{
                    width: "2rem",
                    height: "2rem",
                    borderRadius: "0.4rem",
                    background: isExcel ? "#ecfdf5" : "#eff6ff",
                    color: isExcel ? "#059669" : "#2563eb",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {isExcel ? <FileSpreadsheet size={16} /> : <FileText size={16} />}
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: "#1e293b", fontSize: "0.9rem" }}>
                    {selectedFile?.name}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.4rem", marginTop: "0.15rem", fontSize: "0.78rem" }}>
                    <span style={{ color: "#047857", fontWeight: 600 }}>
                      {parsedResult.totalValid.toLocaleString()} artículos válidos
                    </span>
                    {parsedResult.duplicateCount > 0 && (
                      <span style={{ color: "#0284c7", background: "#e0f2fe", padding: "0.05rem 0.4rem", borderRadius: "0.25rem" }}>
                        {parsedResult.duplicateCount.toLocaleString()} duplicados unificados
                      </span>
                    )}
                    {parsedResult.invalidCount > 0 && (
                      <span style={{ color: "#b45309", background: "#fef3c7", padding: "0.05rem 0.4rem", borderRadius: "0.25rem" }}>
                        {parsedResult.invalidCount.toLocaleString()} filas sin SKU ignoradas
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleResetFile}
                style={{
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "0.4rem",
                  padding: "0.35rem 0.7rem",
                  cursor: "pointer",
                  color: "#475569",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                  fontSize: "0.8rem",
                  fontWeight: 500,
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#94a3b8")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#cbd5e1")}
              >
                <X size={14} /> Descartar y elegir otro
              </button>
            </div>

            {/* Barra de Filtro de Muestra */}
            <div
              style={{
                padding: "0.6rem 1.25rem",
                background: "#ffffff",
                borderBottom: "1px solid #f1f5f9",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "1rem",
              }}
            >
              <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 500 }}>
                Vista previa de verificación (mostrando hasta 8 filas):
              </div>
              <div style={{ position: "relative", width: "16rem", maxWidth: "100%" }}>
                <Search size={14} style={{ position: "absolute", left: "0.6rem", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
                <input
                  type="text"
                  placeholder="Filtrar vista previa..."
                  value={previewFilter}
                  onChange={(e) => setPreviewFilter(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.3rem 0.5rem 0.3rem 2rem",
                    fontSize: "0.78rem",
                    border: "1px solid #cbd5e1",
                    borderRadius: "0.35rem",
                    outline: "none",
                  }}
                />
              </div>
            </div>

            {/* Tabla de Muestra Limpia y Profesional */}
            <div style={{ overflowX: "auto", background: "#ffffff" }}>
              <table style={{ width: "100%", fontSize: "0.8rem", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", textAlign: "left", color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ padding: "0.6rem 0.85rem", fontWeight: 600 }}>SKU</th>
                    <th style={{ padding: "0.6rem 0.85rem", fontWeight: 600 }}>Descripción</th>
                    <th style={{ padding: "0.6rem 0.85rem", fontWeight: 600 }}>Departamento</th>
                    <th style={{ padding: "0.6rem 0.85rem", fontWeight: 600 }}>Unidad</th>
                    <th style={{ padding: "0.6rem 0.85rem", fontWeight: 600 }}>Proveedor</th>
                    <th style={{ padding: "0.6rem 0.85rem", fontWeight: 600, textAlign: "right" }}>Precio Regular</th>
                    <th style={{ padding: "0.6rem 0.85rem", fontWeight: 600 }}>Núm. Parte</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPreview.length > 0 ? (
                    filteredPreview.map((row, idx) => (
                      <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9", transition: "background 0.15s" }}>
                        <td style={{ padding: "0.55rem 0.85rem", fontWeight: 600, color: "#0f172a" }}>{row.sku}</td>
                        <td style={{ padding: "0.55rem 0.85rem", color: "#334155", maxWidth: "18rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={row.descripcion}>
                          {row.descripcion}
                        </td>
                        <td style={{ padding: "0.55rem 0.85rem", color: "#64748b" }}>{row.dep_id || "-"}</td>
                        <td style={{ padding: "0.55rem 0.85rem", color: "#64748b" }}>{row.unidad_medida || "-"}</td>
                        <td style={{ padding: "0.55rem 0.85rem", color: "#475569", maxWidth: "14rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={row.proveedor}>
                          {row.proveedor || "-"}
                        </td>
                        <td style={{ padding: "0.55rem 0.85rem", fontWeight: 600, color: "#006B3F", textAlign: "right" }}>
                          {row.precio_regular !== null ? `$${row.precio_regular.toFixed(2)}` : "-"}
                        </td>
                        <td style={{ padding: "0.55rem 0.85rem", color: "#64748b" }}>{row.num_parte || "-"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} style={{ padding: "1.5rem", textAlign: "center", color: "#94a3b8" }}>
                        No hay registros que coincidan con el filtro en la vista previa.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pie de Acción y Confirmación */}
            <div
              style={{
                padding: "1rem 1.25rem",
                background: "#f8fafc",
                borderTop: "1px solid #e2e8f0",
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "1rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", color: "#475569", fontSize: "0.84rem" }}>
                <Info size={18} color="#006B3F" style={{ flexShrink: 0 }} />
                <span>
                  Al aplicar los cambios, el catálogo anterior será reemplazado íntegramente por estos{" "}
                  <strong style={{ color: "#0f172a" }}>{parsedResult.totalValid.toLocaleString()} artículos</strong>.
                </span>
              </div>
              <Button
                style={{
                  background: "#006B3F",
                  color: "#ffffff",
                  borderColor: "#004B2D",
                  padding: "0.6rem 1.25rem",
                  fontWeight: 600,
                  fontSize: "0.88rem",
                  boxShadow: "0 2px 4px rgba(0, 107, 63, 0.2)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                }}
                onClick={handleStartUpload}
                disabled={!supabaseReady}
              >
                <span>Confirmar y Actualizar Catálogo</span>
                <ArrowRight size={16} />
              </Button>
            </div>
          </div>
        )}

        {/* Barra de Progreso durante la carga por lotes */}
        {uploadState.status === "uploading" && (
          <div
            style={{
              marginTop: "1.25rem",
              padding: "1.5rem",
              border: "1px solid #bbf7d0",
              background: "#f0fdf4",
              borderRadius: "0.75rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.9rem", fontWeight: 600, color: "#166534", marginBottom: "0.6rem" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <RefreshCw size={16} className="spin" /> {uploadState.message}
              </span>
              <span>{uploadState.percent}%</span>
            </div>
            <div style={{ width: "100%", height: "0.65rem", background: "#dcfce7", borderRadius: "999px", overflow: "hidden" }}>
              <div
                style={{
                  width: `${uploadState.percent}%`,
                  height: "100%",
                  background: "#006B3F",
                  borderRadius: "999px",
                  transition: "width 0.25s ease",
                }}
              />
            </div>
            <div style={{ fontSize: "0.78rem", color: "#15803d", marginTop: "0.5rem", textAlign: "right" }}>
              Por favor, no cierres esta ventana mientras la sincronización esté en curso...
            </div>
          </div>
        )}

        {/* Mensaje de Éxito */}
        {uploadState.status === "success" && (
          <div
            style={{
              padding: "1rem 1.25rem",
              background: "#ecfdf5",
              border: "1px solid #a7f3d0",
              borderRadius: "0.6rem",
              marginTop: "1.25rem",
              color: "#065f46",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <CheckCircle2 size={20} color="#059669" />
              <span style={{ fontWeight: 500, fontSize: "0.9rem" }}>{uploadState.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setUploadState({ status: "idle", percent: 0, message: "" })}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#065f46" }}
              title="Cerrar notificación"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Mensaje de Error en Carga */}
        {uploadState.status === "error" && (
          <div
            style={{
              padding: "1rem 1.25rem",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "0.6rem",
              marginTop: "1.25rem",
              color: "#991b1b",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <AlertTriangle size={20} color="#dc2626" />
              <span style={{ fontWeight: 500, fontSize: "0.9rem" }}>{uploadState.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setUploadState({ status: "idle", percent: 0, message: "" })}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#991b1b" }}
              title="Cerrar notificación"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Modal de Confirmación sobrio y profesional */}
        {showConfirmModal && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15, 23, 42, 0.55)",
              backdropFilter: "blur(2px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9999,
              padding: "1rem",
            }}
          >
            <div
              style={{
                background: "#ffffff",
                borderRadius: "0.85rem",
                padding: "1.75rem",
                maxWidth: "28rem",
                width: "100%",
                boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
                border: "1px solid #e2e8f0",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
                <div style={{ width: "2.5rem", height: "2.5rem", borderRadius: "50%", background: "#fef2f2", color: "#dc2626", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <AlertTriangle size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, color: "#0f172a" }}>
                    ¿Actualizar catálogo maestro?
                  </h3>
                  <div style={{ fontSize: "0.8rem", color: "#64748b" }}>Acción de reemplazo total</div>
                </div>
              </div>

              <p style={{ color: "#475569", fontSize: "0.88rem", lineHeight: "1.45", margin: "0 0 1.25rem" }}>
                Se reemplazarán los registros actuales del catálogo por los{" "}
                <strong style={{ color: "#0f172a" }}>{parsedResult?.totalValid?.toLocaleString()} artículos</strong> contenidos en este archivo.
                <br /><br />
                Los artículos no incluidos en la nueva lista dejarán de aparecer en las búsquedas del sistema.
              </p>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                <Button variant="outline" onClick={() => setShowConfirmModal(false)}>
                  Cancelar
                </Button>
                <Button
                  style={{ background: "#006B3F", color: "#ffffff", borderColor: "#004B2D", fontWeight: 600 }}
                  onClick={executeUpload}
                >
                  Sí, actualizar catálogo
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
