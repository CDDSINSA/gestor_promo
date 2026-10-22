import React, { useMemo, useState } from "react";
import { Download, FileSpreadsheet, X } from "lucide-react";
import { Button } from "./ui";
import { previewOrceImport, saveOrceImport } from "../services/fidelizacionOrceService";
import { ORCE_STATUS_LABELS, orceKey } from "../features/fidelizacion/orceReconciliation";

export default function FidelizacionOrceImportModal({ connection, segments, onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [operationId, setOperationId] = useState("");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [progress, setProgress] = useState(null);
  const counts = useMemo(() => (preview?.rows || []).reduce((all, r) => ({ ...all, [r.status]: (all[r.status] || 0) + 1 }), {}), [preview]);
  const rows = (preview?.rows || []).filter((r) => !filter || r.status === filter);
  const pages = Math.max(1, Math.ceil(rows.length / 50));

  async function readFile(event) {
    const next = event.target.files?.[0];
    if (!next) return;
    setFile(next); setPreview(null); setSaved(false); setError(""); setBusy(true); setPage(1); setFilter(""); setProgress(null);
    try {
      setPreview(await previewOrceImport(connection, next, segments));
      setOperationId(crypto.randomUUID());
    } catch (e) { setError(e.message); }
    finally { setBusy(false); event.target.value = ""; }
  }

  async function save() {
    setBusy(true); setError("");
    try {
      const result = await saveOrceImport(connection, file.name, preview, operationId, setProgress);
      const results = new Map(result.rows.map((r) => [orceKey(r), r.status]));
      setPreview((old) => ({ ...old, rows: old.rows.map((r) => results.has(orceKey(r)) ? { ...r, status: results.get(orceKey(r)) } : r) }));
      setSaved(true); setPage(1); setFilter("");
      onImported();
    } catch (e) {
      setError(`${e.message || "No se pudo confirmar la carga."} Los lotes confirmados se conservan. Reintente con este mismo reporte para continuar sin duplicarlos.`);
      onImported();
    }
    finally { setBusy(false); }
  }

  function downloadResults() {
    const cell = (value) => `"${String(value ?? "").replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`;
    const data = [["Filas", "SKU", "Canal", "Segmento", "Descuento", "ID promo", "ID oferta", "Resultado", "Observaciones"],
      ...preview.rows.map((r) => [(r.source_rows || [r.source_row]).join(", "), r.sku, r.canal, r.segmento_id,
        Number.isFinite(r.descuento) ? r.descuento : "", r.promo_id_orce, r.oferta_id_orce, ORCE_STATUS_LABELS[r.status],
        [r.message, ...r.warnings].filter(Boolean).join("; ")])];
    const url = URL.createObjectURL(new Blob(["\uFEFF", data.map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "Resultado_conciliacion_ORCE.csv";
    a.click(); URL.revokeObjectURL(url);
  }

  return <div className="modal-backdrop"><div className="modal-card fidelizacion-modal-card" role="dialog" aria-modal="true" aria-labelledby="orce-import-title">
    <div className="modal-head"><div><h2 id="orce-import-title">Conciliar IDs de ORCE</h2><p>Actualizar referencias del canasto desde el reporte de promociones.</p></div>
      <button className="icon-btn" disabled={busy} onClick={onClose} aria-label="Cerrar"><X size={18}/></button></div>
    <div className="modal-body">
      <p className="modal-note">Solo se actualizan IDs en combinaciones existentes con el mismo descuento. Las ubicaciones se ignoran y las fechas generan advertencias informativas.</p>
      <label className="field"><span><FileSpreadsheet size={16}/> Reporte ORCE (.xlsx)</span><input type="file" accept=".xlsx" disabled={busy} onChange={readFile}/></label>
      {file && <p>{file.name}</p>}
      {busy && <p role="status">Procesando reporte…</p>}
      {progress && <p role="status">{progress.processed} / {progress.total} combinaciones procesadas.</p>}
      {error && <p className="modal-error" role="alert">{error}</p>}
      {preview && <>
        <p role="status">{preview.sourceRows} filas · {preview.duplicateCount} duplicados unificados · {counts.LISTO || 0} listas · {counts.ACTUALIZADO || 0} actualizadas</p>
        {saved && <p className="modal-note">Carga terminada. Los registros no encontrados, con conflictos o descuentos diferentes permanecen sin modificar.</p>}
        <label className="field"><span>Resultado</span><select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}>
          <option value="">Todos ({preview.rows.length})</option>{Object.entries(counts).map(([key, count]) => <option key={key} value={key}>{ORCE_STATUS_LABELS[key]} ({count})</option>)}
        </select></label>
        <div className="fidelizacion-preview-table-wrap"><table className="fidelizacion-table"><thead><tr>
          {["Fila", "SKU", "Canal", "Segmento", "%", "ID promo", "ID oferta", "Resultado / observaciones"].map((name) => <th key={name}>{name}</th>)}
        </tr></thead><tbody>{rows.slice((page - 1) * 50, page * 50).map((r) => <tr key={r.source_row}>
          <td>{r.source_row}</td><td>{r.sku}</td><td>{r.canal}</td><td>{r.segmento_id}</td><td>{Number.isFinite(r.descuento) ? r.descuento : "—"}</td>
          <td>{r.promo_id_orce}</td><td>{r.oferta_id_orce}</td><td>{ORCE_STATUS_LABELS[r.status]}{r.message && <p>{r.message}</p>}{r.warnings.length > 0 && <p>{r.warnings.join(" · ")}</p>}</td>
        </tr>)}</tbody></table></div>
        <div className="pagination-bar"><Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</Button><span>{page} / {pages}</span><Button variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>Siguiente</Button></div>
      </>}
    </div>
    <div className="modal-actions"><Button variant="outline" disabled={busy} onClick={onClose}>Cerrar</Button><div className="toolbar-actions">
      {preview && <Button variant="outline" disabled={busy} onClick={downloadResults}><Download size={15}/> Descargar resultado</Button>}
      <Button disabled={busy || saved || !counts.LISTO} onClick={save}>Actualizar IDs ({counts.LISTO || 0})</Button>
    </div></div>
  </div></div>;
}
