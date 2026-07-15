import React, { useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Search, Upload, X } from "lucide-react";
import { normalizeValue } from "../utils/common";
import { normalizeActividad } from "../utils/promoHelpers";
import { Button, Card, CardContent, Header } from "./ui";

function parseSkuText(text) {
  const seen = new Set();
  return String(text || "")
    .split(/[\s,;|\t\r\n]+/)
    .map((value) => normalizeValue(value))
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (["sku", "codigo", "codigosku", "codigo_sku"].includes(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizeDateOnly(value) {
  const text = normalizeValue(value);
  if (!text) return "";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function getActivityDateRange(activity = {}) {
  return {
    start: normalizeDateOnly(activity.fecha_inicio || activity.fechaInicio || activity.vigencia_inicio),
    end: normalizeDateOnly(activity.fecha_fin || activity.fechaFin || activity.vigencia_fin),
  };
}

function getMonthRange(monthValue) {
  const [yearText, monthText] = String(monthValue || "").split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!year || !month) return null;
  const start = `${yearText}-${monthText}-01`;
  const endDate = new Date(year, month, 0);
  const end = `${yearText}-${monthText}-${String(endDate.getDate()).padStart(2, "0")}`;
  return { start, end };
}

function rangesOverlap(activity, queryRange) {
  if (!queryRange) return true;
  const { start, end } = getActivityDateRange(activity);
  if (!start && !end) return false;
  const activityStart = start || end;
  const activityEnd = end || start;
  return activityStart <= queryRange.end && activityEnd >= queryRange.start;
}

function formatVigencia(activity = {}) {
  const { start, end } = getActivityDateRange(activity);
  if (start && end) return `${start} al ${end}`;
  return start || end || "Sin vigencia";
}

function getRowActivityId(row) {
  return row.actividadId || row.actividad_id || row.catalogo_id || "";
}

function getRowValue(row, camelField, snakeField) {
  return row[camelField] || row[snakeField] || "";
}

export default function ConsultaSkuPage({ rows = [], actividades = [] }) {
  const fileInputRef = useRef(null);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [skuText, setSkuText] = useState("");
  const [mode, setMode] = useState("month");
  const [month, setMonth] = useState(currentMonth);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [queriedSkus, setQueriedSkus] = useState([]);
  const [fileStatus, setFileStatus] = useState("");

  const activityMap = useMemo(() => new Map((actividades || []).map((item) => {
    const activity = normalizeActividad(item);
    return [activity.actividad_id, activity];
  })), [actividades]);

  const queryRange = mode === "date"
    ? { start: date, end: date }
    : getMonthRange(month);

  const results = useMemo(() => {
    if (!queriedSkus.length) return [];
    const skuSet = new Set(queriedSkus.map((sku) => sku.toLowerCase()));
    return (rows || [])
      .filter((row) => skuSet.has(normalizeValue(row.sku).toLowerCase()))
      .map((row) => {
        const activity = activityMap.get(getRowActivityId(row)) || {};
        return { row, activity };
      })
      .filter(({ activity }) => rangesOverlap(activity, queryRange));
  }, [activityMap, queryRange, queriedSkus, rows]);

  const resultCountsBySku = useMemo(() => results.reduce((map, { row, activity }) => {
    const sku = normalizeValue(row.sku);
    const current = map.get(sku) || { total: 0, activities: new Set() };
    current.total += 1;
    current.activities.add(activity.actividad_id || getRowActivityId(row));
    map.set(sku, current);
    return map;
  }, new Map()), [results]);

  const missingSkus = queriedSkus.filter((sku) => !resultCountsBySku.has(sku));
  const repeatedSkus = Array.from(resultCountsBySku.entries()).filter(([, value]) => value.activities.size > 1);

  const applyQuery = () => {
    setQueriedSkus(parseSkuText(skuText));
  };

  const clearQuery = () => {
    setSkuText("");
    setQueriedSkus([]);
    setFileStatus("");
  };

  const loadSkuExcel = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", raw: false });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const values = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "", raw: false })
        .flat()
        .map((value) => normalizeValue(value))
        .filter(Boolean);
      const skus = parseSkuText(values.join("\n"));
      setSkuText(skus.join("\n"));
      setQueriedSkus(skus);
      setFileStatus(`${skus.length} SKU cargados desde ${file.name}`);
    } catch (error) {
      setFileStatus(error.message || "No se pudo leer el Excel.");
    } finally {
      event.target.value = "";
    }
  };

  return <div>
    <Header title="Consulta SKU" subtitle="Verifique si uno o varios codigos ya participan en ofertas activas por mes o fecha." />
    <div className="consulta-layout">
      <Card className="consulta-panel">
        <CardContent>
          <div className="section-head">
            <div>
              <h2>Codigos a consultar</h2>
              <span>{queriedSkus.length ? `${queriedSkus.length} SKU consultados` : "Pegue SKU o cargue Excel"}</span>
            </div>
          </div>
          <label className="field">
            <span>SKU</span>
            <textarea value={skuText} onChange={(event) => setSkuText(event.target.value)} placeholder="155337978&#10;100001&#10;200001" />
          </label>
          <div className="consulta-mode-grid">
            <label className="field">
              <span>Periodo</span>
              <select value={mode} onChange={(event) => setMode(event.target.value)}>
                <option value="month">Mes</option>
                <option value="date">Fecha especifica</option>
              </select>
            </label>
            {mode === "month" ? <label className="field">
              <span>Mes</span>
              <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
            </label> : <label className="field">
              <span>Fecha</span>
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>}
          </div>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" hidden onChange={loadSkuExcel}/>
          <div className="button-row">
            <Button onClick={applyQuery}><Search size={16}/> Consultar</Button>
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}><Upload size={16}/> Cargar Excel</Button>
            <Button variant="outline" onClick={clearQuery}><X size={16}/> Limpiar</Button>
          </div>
          {fileStatus && <p className="consulta-status">{fileStatus}</p>}
        </CardContent>
      </Card>
      <Card className="consulta-summary-card">
        <CardContent>
          <div className="consulta-kpi"><span>Coincidencias</span><strong>{results.length}</strong></div>
          <div className="consulta-kpi"><span>SKU sin oferta</span><strong>{missingSkus.length}</strong></div>
          <div className="consulta-kpi warning"><span>En varias actividades</span><strong>{repeatedSkus.length}</strong></div>
        </CardContent>
      </Card>
    </div>

    <Card className="grid-card consulta-results-card">
      <CardContent>
        <div className="toolbar">
          <div>
            <h2>Ofertas encontradas</h2>
            <p>{queriedSkus.length ? `${results.length} coincidencias para el periodo seleccionado` : "Ingrese SKU para consultar"}</p>
          </div>
        </div>
        {!!repeatedSkus.length && <div className="logs-status error">Hay SKU presentes en mas de una actividad activa para el periodo consultado.</div>}
        <div className="table-wrap">
          <table>
            <thead><tr><th>SKU</th><th>Actividad</th><th>Vigencia</th><th>Oferta</th><th>Tipo</th><th>Precio ahora</th><th>Descuento</th><th>Rol</th><th>Descripcion</th></tr></thead>
            <tbody>
              {results.map(({ row, activity }) => <tr key={`${row.id || row.row_id}-${activity.actividad_id}`}>
                <td>{row.sku}</td>
                <td>{activity.nombre_actividad || activity.nombreActividad || activity.nombre || getRowActivityId(row)}</td>
                <td>{formatVigencia(activity)}</td>
                <td>{getRowValue(row, "grupoOferta", "grupo_oferta") || getRowValue(row, "ofertaId", "oferta_id")}</td>
                <td>{getRowValue(row, "tipoPromo", "tipo_promo")}</td>
                <td>{getRowValue(row, "precioAhora", "precio_ahora")}</td>
                <td>{row.descuento || ""}</td>
                <td>{getRowValue(row, "tipoSku", "tipo_sku")}</td>
                <td>{row.descripcion || ""}</td>
              </tr>)}
              {!results.length && <tr><td colSpan={9}><div className="empty-state">{queriedSkus.length ? "No se encontraron ofertas activas para los SKU consultados." : "Pegue SKU o cargue un Excel para consultar."}</div></td></tr>}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  </div>;
}
