import { useSkuLookup } from "../features/skuMaster/SkuLookupContext";
import React, { useState, useMemo } from "react";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  MinusCircle,
  PlusCircle,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "./ui";
import { classNames } from "../utils/common";
import {
  calculateFidelizacionDeltas,
  createFidelizacionActivityId,
  createSolicitudFidelizacion,
  downloadPlantillaFidelizacion,
  parseFidelizacionExcel,
} from "../services/fidelizacionService";
import { findCompradorForAppUser } from "../utils/avanceHelpers";

export default function FidelizacionUpdateModal({
  isOpen,
  onClose,
  canal = "comasa",
  currentCanasto = [],
  segmentos = [],
  skuMaster = {},
  catalogSkuMap = null,
  catalogRows = [],
  actividades = [],
  compradores = [],
  appUser = null,
  connection = null,
  onSolicitudCreated,
}) {
  const lookupSkus = useSkuLookup();
  const [file, setFile] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");
  const [motivo, setMotivo] = useState("");
  const [deltasData, setDeltasData] = useState(null);
  const [previewFilter, setPreviewFilter] = useState("TODOS");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Manual input state
  const [mode, setMode] = useState("excel"); // 'excel' | 'manual'
  const [manualSku, setManualSku] = useState("");
  const [manualDiscounts, setManualDiscounts] = useState({});

  const matchedComprador = useMemo(() => {
    return findCompradorForAppUser(appUser, compradores);
  }, [appUser, compradores]);

  const currentUserBuyerName = matchedComprador?.comprador || appUser?.comprador || appUser?.nombre || appUser?.email || "Comprador";
  const currentUserBuyerId = matchedComprador?.id || appUser?.buyer_id || connection?.appUser?.buyer_id || null;

  const filteredDeltas = useMemo(() => {
    if (!deltasData?.deltas) return [];
    if (previewFilter === "TODOS") return deltasData.deltas;
    return deltasData.deltas.filter((d) => d.tipo_cambio === previewFilter);
  }, [deltasData, previewFilter]);

  if (!isOpen) return null;

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    processFile(selectedFile);
  };

  const processFile = async (uploadedFile) => {
    setFile(uploadedFile);
    setError("");
    setParsing(true);
    try {
      const parsed = await parseFidelizacionExcel(uploadedFile, segmentos);

      const master = await lookupSkus(parsed.items.map((item) => item.sku));
      const combinedMap = new Map(Object.entries(master).map(([key, item]) => [key, {
        ...item, division: item.dep_id || "",
      }]));

      const calculated = calculateFidelizacionDeltas({
        parsedItems: parsed.items.map((item) => ({ ...item, descripcion: master[item.sku]?.descripcion || "" })),
        currentCanasto,
        canal,
        skuMaster: master,
        catalogMap: combinedMap,
        defaultDivision: "",
      });
      setDeltasData(calculated);
    } catch (err) {
      console.error(err);
      setError(err.message || "Error al procesar el archivo Excel.");
      setDeltasData(null);
    } finally {
      setParsing(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) processFile(droppedFile);
  };

  const handleClear = () => {
    setFile(null);
    setDeltasData(null);
    setError("");
    setManualSku("");
    setManualDiscounts({});
  };

  const handleAddManualItem = async () => {
    const s = manualSku.trim();
    if (!s) {
      setError("Ingrese un código de SKU válido.");
      return;
    }
    setError("");

    let master;
    try { master = await lookupSkus([s]); }
    catch (error) { setError(error.message); return; }
    const itemDesc = master[s]?.descripcion || "";
    const itemDiv = master[s]?.dep_id || "";
    const combinedMap = new Map();

    if (itemDesc) {
      const entry = { sku: s, descripcion: itemDesc, division: itemDiv };
      combinedMap.set(s, entry);
      combinedMap.set(s.toLowerCase(), entry);
      if (!Number.isNaN(Number(s))) {
        combinedMap.set(String(Number(s)), entry);
      }
    }

    const parsedItem = {
      sku: s,
      descripcion: itemDesc,
      segments: { ...manualDiscounts },
    };
    const calculated = calculateFidelizacionDeltas({
      parsedItems: [parsedItem],
      currentCanasto,
      canal,
      skuMaster: master,
      catalogMap: combinedMap,
      defaultDivision: "",
    });

    setDeltasData((prev) => {
      if (!prev) return calculated;
      // Merge
      const mergedDeltas = [...calculated.deltas, ...prev.deltas.filter((d) => d.sku !== s)];
      return {
        ...prev,
        deltas: mergedDeltas,
        totalSkus: new Set(mergedDeltas.map((d) => d.sku)).size,
        nuevosCount: mergedDeltas.filter((d) => d.tipo_cambio === "NUEVO").length,
        subenCount: mergedDeltas.filter((d) => d.tipo_cambio === "SUBE").length,
        bajanCount: mergedDeltas.filter((d) => d.tipo_cambio === "BAJA").length,
        eliminanCount: mergedDeltas.filter((d) => d.tipo_cambio === "ELIMINA").length,
      };
    });

    setManualSku("");
    setManualDiscounts({});
  };

  const handleSubmit = async () => {
    if (!motivo.trim()) {
      setError("Debe especificar el motivo o justificación de la solicitud.");
      return;
    }
    if (!deltasData || !deltasData.deltas.length) {
      setError("No hay datos de descuentos para enviar.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    try {
      const nextActivityId = createFidelizacionActivityId(actividades);
      const res = await createSolicitudFidelizacion(connection, {
        actividadId: nextActivityId,
        canal,
        motivo: motivo.trim(),
        solicitante: currentUserBuyerName,
        comprador: currentUserBuyerName,
        buyerId: currentUserBuyerId,
        deltas: deltasData.deltas,
      });

      onSolicitudCreated?.(res.actividad, res.stagingRecords);
      handleClear();
      onClose();
    } catch (err) {
      console.error("Error al crear solicitud de fidelizacion:", err);
      setError(err.message || "Ocurrió un error al enviar la solicitud.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-card fidelizacion-modal-card" role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <h2>Solicitud de Actualización de Canasto</h2>
            <p>
              Canal <strong>{String(canal || "comasa").toUpperCase()}</strong> · Ingrese los descuentos por segmento para solicitar aprobación a Pricing.
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} disabled={isSubmitting}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {error && (
            <div className="modal-error wide" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <AlertCircle size={16} /> {error}
            </div>
          )}

          {/* Opciones de carga: Plantilla Excel o Manual */}
          <div className="fidelizacion-modal-tabs">
            <div className="toolbar-actions">
              <button
                type="button"
                className={classNames("btn btn-sm", mode === "excel" ? "btn-primary" : "btn-outline")}
                onClick={() => setMode("excel")}
              >
                <FileSpreadsheet size={15} /> Cargar con Plantilla Excel
              </button>
              <button
                type="button"
                className={classNames("btn btn-sm", mode === "manual" ? "btn-primary" : "btn-outline")}
                onClick={() => setMode("manual")}
              >
                <PlusCircle size={15} /> Carga Manual
              </button>
            </div>

            <Button
              variant="outline"
              className="btn-sm"
              onClick={() => downloadPlantillaFidelizacion(segmentos, canal)}
              title="Descargar plantilla Excel limpia"
            >
              <Download size={14} /> Descargar Plantilla
            </Button>
          </div>

          {/* Modo Excel */}
          {mode === "excel" && !deltasData && (
            <div
              className="fidelizacion-dropzone"
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => document.getElementById("fidelizacion-file-input")?.click()}
            >
              <Upload size={38} style={{ color: "#006B3F", margin: "0 auto 0.75rem" }} />
              <h4 style={{ margin: "0 0 0.35rem", fontSize: "1rem", color: "#0f172a" }}>
                {parsing ? "Procesando archivo..." : "Arrastra tu plantilla Excel aquí o haz clic para seleccionar"}
              </h4>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b" }}>
                Formato admitido: .xlsx, .xls con columna Sku y columnas de segmentos (ej. 1002, 1102, 1003, etc.)
              </p>
              <input
                id="fidelizacion-file-input"
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: "none" }}
                onChange={handleFileChange}
              />
            </div>
          )}

          {/* Modo Manual */}
          {mode === "manual" && (
            <div style={{ background: "#f8fafc", padding: "1rem", borderRadius: "0.65rem", border: "1px solid #e2e8f0" }}>
              <div style={{ display: "grid", gridTemplateColumns: "140px 1fr auto", gap: "0.75rem", alignItems: "end" }}>
                <label className="field" style={{ margin: 0 }}>
                  <span>SKU</span>
                  <input
                    placeholder="Ej. 1009"
                    value={manualSku}
                    onChange={(e) => setManualSku(e.target.value)}
                  />
                </label>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {(segmentos || []).map((s) => {
                    const segId = s.segmento_id || s.segmento || String(s);
                    const segName = s.nombre_segmento || s.segmento || segId;
                    return (
                      <label key={segId} className="field" style={{ margin: 0, width: "80px" }}>
                        <span title={segName}>{segId}</span>
                        <input
                          placeholder="%"
                          value={manualDiscounts[segId] ?? ""}
                          onChange={(e) => setManualDiscounts({ ...manualDiscounts, [segId]: e.target.value })}
                        />
                      </label>
                    );
                  })}
                </div>
                <Button onClick={handleAddManualItem}>
                  <PlusCircle size={15} /> Agregar SKU
                </Button>
              </div>
            </div>
          )}

          {/* Resumen de Deltas y KPIs */}
          {deltasData && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <strong style={{ fontSize: "0.95rem", color: "#0f172a" }}>
                  Resumen de Cambios Calculados ({deltasData.totalSkus} SKUs analizados)
                </strong>
                <button
                  type="button"
                  onClick={handleClear}
                  className="btn btn-outline btn-sm"
                  style={{ color: "#b91c1c", borderColor: "#fecaca" }}
                >
                  <Trash2 size={14} /> Limpiar y cambiar archivo
                </button>
              </div>

              <div className="fidelizacion-deltas-grid">
                <div
                  className="fidelizacion-delta-card nuevo"
                  onClick={() => setPreviewFilter("NUEVO")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.78rem", fontWeight: 600 }}>
                    <PlusCircle size={15} /> Nuevos SKUs
                  </div>
                  <div className="fidelizacion-delta-val">+{deltasData.nuevosCount}</div>
                </div>

                <div
                  className="fidelizacion-delta-card sube"
                  onClick={() => setPreviewFilter("SUBE")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.78rem", fontWeight: 600 }}>
                    <ArrowUpRight size={15} /> Descuentos que Suben
                  </div>
                  <div className="fidelizacion-delta-val">{deltasData.subenCount}</div>
                </div>

                <div
                  className="fidelizacion-delta-card baja"
                  onClick={() => setPreviewFilter("BAJA")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.78rem", fontWeight: 600 }}>
                    <ArrowDownRight size={15} /> Descuentos que Bajan
                  </div>
                  <div className="fidelizacion-delta-val">{deltasData.bajanCount}</div>
                </div>

                <div
                  className="fidelizacion-delta-card elimina"
                  onClick={() => setPreviewFilter("ELIMINA")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.78rem", fontWeight: 600 }}>
                    <MinusCircle size={15} /> Pasan a 0% (Inactivos)
                  </div>
                  <div className="fidelizacion-delta-val">{deltasData.eliminanCount}</div>
                </div>
              </div>

              {/* Previsualización en tabla */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                  Mostrando {filteredDeltas.length} registros ({previewFilter === "TODOS" ? "Todos los cambios" : `Filtrado por: ${previewFilter}`})
                </span>
                {previewFilter !== "TODOS" && (
                  <button type="button" className="btn btn-sm btn-outline" onClick={() => setPreviewFilter("TODOS")}>
                    Ver todos los cambios
                  </button>
                )}
              </div>

              <div className="fidelizacion-preview-table-wrap">
                <table className="fidelizacion-table">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Descripción</th>
                      <th>Segmento</th>
                      <th>Anterior</th>
                      <th>Solicitado</th>
                      <th>Cambio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDeltas.slice(0, 100).map((d, idx) => (
                      <tr key={`${d.sku}-${d.segmento_id}-${idx}`}>
                        <td className="fidelizacion-sku-code">{d.sku}</td>
                        <td className="fidelizacion-desc-cell">
                          {d.descripcion || "-"}
                        </td>
                        <td>{d.segmento_id}</td>
                        <td>{d.descuento_anterior}%</td>
                        <td style={{ fontWeight: 600 }}>{d.descuento_solicitado}%</td>
                        <td>
                          <span
                            className={classNames(
                              "pill",
                              d.tipo_cambio === "NUEVO" && "green",
                              d.tipo_cambio === "SUBE" && "green",
                              d.tipo_cambio === "BAJA" && "yellow",
                              d.tipo_cambio === "ELIMINA" && "red"
                            )}
                            style={{ fontSize: "0.7rem", padding: "0.1rem 0.4rem" }}
                          >
                            {d.tipo_cambio}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Formulario de Solicitud */}
          <div className="fidelizacion-modal-form-grid">
            <label className="field">
              <span>Motivo o Justificación comercial *</span>
              <input
                placeholder="Ej. Actualización mensual COMASA septiembre 2026"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                disabled={isSubmitting}
              />
            </label>
            <label className="field">
              <span>Comprador Solicitante</span>
              <input value={currentUserBuyerName} readOnly style={{ background: "#f8fafc" }} />
            </label>
          </div>
        </div>

        <div className="modal-actions">
          <Button variant="outline" onClick={handleClear} disabled={isSubmitting}>
            Limpiar Ventana
          </Button>
          <div className="toolbar-actions">
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting || !deltasData || !deltasData.deltas?.length}>
              {isSubmitting ? "Enviando solicitud..." : "Enviar Solicitud a Pricing"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
