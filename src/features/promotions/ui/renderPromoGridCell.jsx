import React from "react";
import { AlertTriangle } from "lucide-react";
import { BUY_X_GET_X_PROMO_TYPES } from "../../../constants";
import { classNames } from "../../../utils/common";
import { isComboRewardRole, isSegmentedRow, normalizeCanal } from "../../../utils/promoHelpers";
import EditableGridInput from "./EditableGridInput";
import { TIPOS_CANTIDAD, normalizeTipoCantidad } from "../application/tipoCantidad.js";
import { isAiresRow } from "../application/airesCombo.js";

// AIRES: las piezas no se editan una por una (SKU, precio, cantidad); solo el precio del aire.
const AIRES_READONLY_COLUMNS = ["sku", "precioAhora", "cantidadMinima", "descuento", "tipoSku", "tipoCantidad"];

export function renderCell(row, col, updateRow, warning, segmentOptions = [], cellError = null, onKeyDown = null, rowIndex = 0, colIndex = 0) {
  const hasErr = cellError?.type === "error";
  const hasWarn = cellError?.type === "warning" || (col === "descuento" && warning);
  const inputClass = classNames(
    hasErr && "input-error",
    hasWarn && !hasErr && "input-warning"
  );
  const titleText = cellError ? cellError.message : undefined;

  if (isAiresRow(row) && AIRES_READONLY_COLUMNS.includes(col)) {
    return <div className="readonly-cell" title={col === "precioAhora" ? "Precio de la pieza: se calcula desde el precio del aire" : titleText}>{row[col]}</div>;
  }
  if (col === "precioAire") {
    if (!isAiresRow(row)) return <div className="readonly-cell"></div>;
    return <div className="inline-cell">
      <EditableGridInput className={inputClass} title={titleText || "Precio del aire c/IVA: al cambiarlo se recalcula el precio de cada pieza"} data-row-index={rowIndex} data-col-index={colIndex} onKeyDown={onKeyDown} value={row.precioAire ?? ""} onCommit={(value) => updateRow(row.id, "precioAire", value)} />
      {hasErr && <AlertTriangle size={15} style={{color: "#ef4444"}}/>}
    </div>;
  }
  if (col === "tipoCantidad") {
    return <select className={inputClass} title={titleText} data-row-index={rowIndex} data-col-index={colIndex} onKeyDown={onKeyDown} value={normalizeTipoCantidad(row[col]) || "Exacta"} onChange={(e) => updateRow(row.id, col, e.target.value)}>
      {TIPOS_CANTIDAD.map((item) => <option key={item} value={item}>{item}</option>)}
    </select>;
  }
  if (col === "tipoSku") {
    const role = normalizeCanal(row[col]);
    const highlightRole = ["Combo", ...BUY_X_GET_X_PROMO_TYPES].includes(row.tipoPromo || row.tipo_promo);
    const roleClass = !highlightRole ? "neutral" : isComboRewardRole(role) ? "reward" : role === "principal" ? "principal" : "neutral";
    return <div className={classNames("role-cell", roleClass)} title={titleText}>
      <span className="role-dot" aria-hidden="true"></span>
      <select className={classNames("role-select", inputClass)} data-row-index={rowIndex} data-col-index={colIndex} onKeyDown={onKeyDown} value={row[col]} onChange={(e) => updateRow(row.id, col, e.target.value)}>
        <option>principal</option>
        <option>regalia</option>
        <option>recompensa</option>
      </select>
    </div>;
  }
  if (col === "aplicaSegmento") {
    return <select className={inputClass} title={titleText} data-row-index={rowIndex} data-col-index={colIndex} onKeyDown={onKeyDown} value={isSegmentedRow(row) ? "SI" : "NO"} onChange={(e) => updateRow(row.id, col, e.target.value)}>
      <option value="NO">NO</option>
      <option value="SI">SI</option>
    </select>;
  }
  if (col === "segmento") {
    return isSegmentedRow(row) ? (
      <>
        <EditableGridInput className={inputClass} title={titleText} data-row-index={rowIndex} data-col-index={colIndex} onKeyDown={onKeyDown} list={`segmentos-${row.id}`} value={row.segmento || ""} onCommit={(value) => updateRow(row.id, col, value)} />
        <datalist id={`segmentos-${row.id}`}>
          {segmentOptions.map((item) => <option key={item.segmento_id} value={item.segmento_id}>{item.segmento}</option>)}
        </datalist>
      </>
    ) : (
      <div className="readonly-cell">Todos</div>
    );
  }
  if (["descripcion", "numParte", "grupoOferta", "tipoPromo"].includes(col)) {
    return <div className="readonly-cell">{row[col]}</div>;
  }
  if (col === "numPagina") {
    return <div className="inline-cell">
      <EditableGridInput
        className={inputClass}
        title={titleText || "Número de página sugerido para catálogo (opcional)"}
        data-row-index={rowIndex}
        data-col-index={colIndex}
        onKeyDown={onKeyDown}
        placeholder="Opcional"
        style={{ width: "65px", textAlign: "center" }}
        value={row[col] ?? row.numero_pagina ?? ""}
        onCommit={(value) => updateRow(row.id, "numPagina", value)}
      />
      {hasErr && <AlertTriangle size={15} style={{color: "#ef4444"}}/>}
    </div>;
  }
  if (col === "descuento") {
    return <div className="inline-cell">
      <EditableGridInput className={inputClass} title={titleText} data-row-index={rowIndex} data-col-index={colIndex} onKeyDown={onKeyDown} value={row[col] || ""} onCommit={(value) => updateRow(row.id, col, value)} />
      {hasErr ? <AlertTriangle size={15} style={{color: "#ef4444"}}/> : hasWarn ? <AlertTriangle size={15}/> : null}
    </div>;
  }
  return <div className="inline-cell">
    <EditableGridInput className={inputClass} title={titleText} data-row-index={rowIndex} data-col-index={colIndex} onKeyDown={onKeyDown} value={row[col] || ""} onCommit={(value) => updateRow(row.id, col, value)} />
    {hasErr && <AlertTriangle size={15} style={{color: "#ef4444"}}/>}
  </div>;
}
