import React, { useMemo } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardPaste,
  CircleDashed,
  FileSpreadsheet,
  MessageSquare,
  Plus,
  Save,
  Search,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import {
  allPromoTypes as todosTipos,
  getColumnsForPromoType,
  isComplexPromoType,
  promoLabels as labels,
} from "../promoTypes/promoTypeEngine";
import {
  BULK_COLUMN_BUY_X_GET_X_TABLE,
  BULK_COLUMN_COMBO_TABLE,
  BULK_COLUMN_UMBRAL_TABLE,
  BUY_X_GET_X_PROMO_TYPE,
  BUY_X_GET_X_PROMO_TYPES,
  BUY_X_GET_X_V2_PROMO_TYPE,
  MAX_UMBRAL_LEVELS,
} from "../constants";
import { usePromoFilters } from "../hooks/usePromoFilters";
import { usePromoForm } from "../hooks/usePromoForm";
import { usePromos } from "../hooks/usePromos";
import { PERMISSIONS } from "../constants/permissions";
import { usePermissions } from "../hooks/usePermissions";
import { classNames, makeId, normalizeValue } from "../utils/common";
import {
  getSegmentosByCanal,
  isComboRewardRole,
  isSegmentedRow,
  normalizeAlcanceType,
  normalizeCanal,
  resolveOfferId,
} from "../utils/promoHelpers";
import {
  getCatalogoAvanceId,
  getCompradorDivisiones,
  getCompradorNombre,
  isAvanceTerminado,
  toggleAvanceTerminado,
} from "../utils/avanceHelpers";

function Header({ title, subtitle }) {
  return <div className="header"><h1>{title}</h1><p>{subtitle}</p></div>;
}

function Button({ children, className = "", variant = "default", ...props }) {
  return <button className={classNames("btn", variant === "outline" ? "btn-outline" : "btn-primary", className)} {...props}>{children}</button>;
}

function Card({ children, className = "" }) {
  return <div className={classNames("card", className)}>{children}</div>;
}

function CardContent({ children, className = "" }) {
  return <div className={className}>{children}</div>;
}

function parseClipboardRows(text) {
  const rawText = String(text || "");
  const normalizedText = rawText.replaceAll(String.fromCharCode(13), "");
  const lines = normalizedText.split(String.fromCharCode(10));
  return lines.map((line) => line.split(String.fromCharCode(9)).map(normalizeValue)).filter((cells) => cells.some(Boolean));
}

function parseClipboardValues(text) {
  return parseClipboardRows(text).map((cells) => cells[0]).filter(isNumericSku);
}

function rowsToClipboardText(rows) {
  return (rows || []).map((row) => (row || []).map((cell) => normalizeValue(cell)).join(String.fromCharCode(9))).join(String.fromCharCode(10));
}

function findTemplateColumn(headerRow, aliases, fallbackIndex = -1) {
  const normalizedAliases = aliases.map(normalizeCanal);
  const index = (headerRow || []).findIndex((header) => normalizedAliases.includes(normalizeCanal(header)));
  return index >= 0 ? index : fallbackIndex;
}

function getPromoTemplateConfig(promoType) {
  if (promoType === "Descuento") return { sheetName: "DESCUENTO", bulkColumn: "descuento", mode: "simple", valueAliases: ["descuento", "desc"] };
  if (promoType === "Precio fijo") return { sheetName: "PRECIO_FIJO", bulkColumn: "precioAhora", mode: "simple", valueAliases: ["ahora c/iva", "ahora con iva", "precio ahora", "precio_ahora"] };
  if (promoType === "Combo") return { sheetName: "COMBO", bulkColumn: BULK_COLUMN_COMBO_TABLE, mode: "combo" };
  if (promoType === "Umbral") return { sheetName: "UMBRAL", bulkColumn: BULK_COLUMN_UMBRAL_TABLE, mode: "raw" };
  if (BUY_X_GET_X_PROMO_TYPES.includes(promoType)) return { sheetName: "COMPRA_X_LLEVA_X", bulkColumn: BULK_COLUMN_BUY_X_GET_X_TABLE, mode: "buyxgetx" };
  return { sheetName: normalizeCanal(promoType).toUpperCase(), bulkColumn: "sku", mode: "raw" };
}

function findWorkbookSheetName(workbook, expectedName) {
  const expected = normalizeCanal(expectedName);
  return (workbook.SheetNames || []).find((name) => normalizeCanal(name) === expected);
}

function normalizeTemplateSheetRows(rows, config) {
  const nonEmptyRows = (rows || []).filter((row) => (row || []).some((cell) => normalizeValue(cell)));
  if (!nonEmptyRows.length) return [];
  const header = nonEmptyRows[0] || [];
  const dataRows = nonEmptyRows.slice(1);
  if (config.mode === "raw") return nonEmptyRows;
  const skuIndex = findTemplateColumn(header, ["sku", "codigo", "codigo_sku"], 0);
  if (config.mode === "simple") {
    const valueIndex = findTemplateColumn(header, config.valueAliases, 1);
    const priceIndex = findTemplateColumn(header, ["ahora c/iva", "ahora con iva", "precio ahora", "precio_ahora"], -1);
    const discountIndex = findTemplateColumn(header, ["descuento", "desc"], -1);
    const optionalIndex = config.bulkColumn === "precioAhora" ? discountIndex : priceIndex;
    const commentIndex = findTemplateColumn(header, ["comentario", "comentarios", "comment"], -1);
    const valueHeader = config.bulkColumn === "precioAhora" ? "Ahora c/iva" : "descuento";
    const optionalHeader = config.bulkColumn === "precioAhora" ? "descuento" : "Ahora c/iva";
    return [["sku", valueHeader, optionalHeader, "Comentario"], ...dataRows.map((row) => [row[skuIndex] || "", row[valueIndex] || "", optionalIndex >= 0 && optionalIndex !== valueIndex ? row[optionalIndex] || "" : "", commentIndex >= 0 ? row[commentIndex] || "" : ""])];
  }
  if (config.mode === "combo") {
    const roleIndex = findTemplateColumn(header, ["tipo", "rol"], 0);
    const priceIndex = findTemplateColumn(header, ["ahora c/iva", "ahora con iva", "precio ahora", "precio_ahora"], 2);
    const discountIndex = findTemplateColumn(header, ["descuento", "desc"], -1);
    const commentIndex = findTemplateColumn(header, ["comentario", "comentarios", "comment"], -1);
    return [["Tipo", "Sku", "Ahora con iva", "descuento", "Comentario"], ...dataRows.map((row) => [row[roleIndex] || "", row[skuIndex] || "", row[priceIndex] || "", discountIndex >= 0 ? row[discountIndex] || "" : "", commentIndex >= 0 ? row[commentIndex] || "" : ""])];
  }
  if (config.mode === "buyxgetx") {
    const variantIndex = findTemplateColumn(header, ["variante", "variant", "compra_lleva", "compra x lleva"], 1);
    const priceIndex = findTemplateColumn(header, ["ahora c/iva", "ahora c iva", "ahora con iva", "precio ahora", "precio_ahora"], 2);
    const discountIndex = findTemplateColumn(header, ["descuento", "desc"], 3);
    return [["sku", "variante", "ahora c IVA", "descuento"], ...dataRows.map((row) => [row[skuIndex] || "", row[variantIndex] || "", row[priceIndex] || "", row[discountIndex] || ""])];
  }
  return nonEmptyRows;
}

async function readPromoTemplateFile(file, promoType) {
  const config = getPromoTemplateConfig(promoType);
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", raw: false });
  const sheetName = findWorkbookSheetName(workbook, config.sheetName);
  if (!sheetName) throw new Error(`La plantilla no contiene la pestaña ${config.sheetName}.`);
  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "", raw: false });
  const normalizedRows = normalizeTemplateSheetRows(rows, config);
  if (normalizedRows.length < 2) throw new Error(`La pestaña ${sheetName} no tiene filas para cargar.`);
  return { sheetName, bulkColumn: config.bulkColumn, text: rowsToClipboardText(normalizedRows), rowCount: normalizedRows.length - 1 };
}

function isNumericSku(value) {
  return /^\d+$/.test(normalizeValue(value));
}

function normalizePastedNumber(value) {
  const original = normalizeValue(value);
  const numericText = original.replace(/[^0-9,.-]/g, "");
  if (!numericText) return original;
  const lastComma = numericText.lastIndexOf(",");
  const lastDot = numericText.lastIndexOf(".");
  let normalized = numericText;
  if (lastComma > -1 && lastDot > -1) {
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    normalized = numericText.replace(decimalSeparator === "," ? /\./g : /,/g, "").replace(decimalSeparator, ".");
  } else if (lastComma > -1) {
    const decimals = numericText.length - lastComma - 1;
    normalized = decimals === 3 ? numericText.replace(/,/g, "") : numericText.replace(",", ".");
  }
  return Number.isNaN(Number(normalized)) ? original : normalized;
}

function parseUmbralHeader(value) {
  const label = normalizeValue(value);
  const match = label.match(/\d+(?:[.,]\d+)?/);
  return { label, cantidadMinima: match ? Number(match[0].replace(",", ".")) : "" };
}

function parseUmbralBenefit(value) {
  const raw = normalizeValue(value);
  if (!raw) return { precioAhora: "", descuento: "", display: "" };
  if (raw.includes("%")) return { precioAhora: "", descuento: raw, display: `Descuento ${raw}` };
  const price = normalizePastedNumber(raw);
  return { precioAhora: price, descuento: "", display: `Precio fijo ${price}` };
}

function buildUmbralBulkPreview(text, skuMaster = {}) {
  const pastedRows = parseClipboardRows(text);
  if (!pastedRows.length) return [];
  const headerRow = pastedRows[0] || [];
  const firstHeader = normalizeCanal(headerRow[0]);
  const hasSkuHeader = ["sku", "codigo", "codigosku", "codsku"].includes(firstHeader);
  const allThresholds = headerRow.slice(1).map((value, index) => ({ ...parseUmbralHeader(value), cellIndex: index + 1 })).filter((item) => item.label);
  const thresholds = allThresholds.slice(0, MAX_UMBRAL_LEVELS);
  const preview = [];
  if (!hasSkuHeader) preview.push({ index: "Aviso", sku: "Encabezado SKU", descripcion: "La primera columna debe ser SKU o Codigo.", campo: "Formato", valorActual: "", valorNuevo: "Revise la tabla pegada", warning: true, canApply: false });
  if (allThresholds.length > MAX_UMBRAL_LEVELS) preview.push({ index: "Aviso", sku: "Limite de umbrales", descripcion: `Se ignoraran ${allThresholds.length - MAX_UMBRAL_LEVELS} columnas porque el maximo es ${MAX_UMBRAL_LEVELS}.`, campo: "Regla", valorActual: "", valorNuevo: `${MAX_UMBRAL_LEVELS} umbrales maximo`, warning: true, canApply: false });
  if (!thresholds.length) {
    preview.push({ index: "Aviso", sku: "Sin umbrales", descripcion: "Incluya encabezados como 1 a mas, 20 a mas o 30 a mas.", campo: "Formato", valorActual: "", valorNuevo: "Sin filas para aplicar", warning: true, canApply: false });
    return preview;
  }
  pastedRows.slice(1).forEach((cells) => {
    const sku = normalizeValue(cells[0]);
    thresholds.forEach((threshold) => {
      const benefit = parseUmbralBenefit(cells[threshold.cellIndex]);
      if (!sku && !benefit.display) return;
      if (!benefit.display) return;
      const master = skuMaster[sku] || {};
      const invalidThreshold = threshold.cantidadMinima === "";
      const canApply = Boolean(sku && !invalidThreshold);
      const descripcion = canApply ? `${master.descripcion || "SKU no encontrado en archivo comprador"} | ${threshold.label}` : invalidThreshold ? `El encabezado "${threshold.label}" no tiene cantidad minima.` : "Fila sin SKU.";
      preview.push({ index: preview.length + 1, sku: sku || "SKU vacio", descripcion, campo: `Umbral ${threshold.label}`, valorActual: "", valorNuevo: benefit.display, thresholdLabel: threshold.label, cantidadMinima: threshold.cantidadMinima, precioAhora: benefit.precioAhora, descuento: benefit.descuento, warning: !canApply || !master.descripcion, canApply });
    });
  });
  if (!preview.some((item) => item.canApply)) preview.push({ index: "Aviso", sku: "Sin beneficios", descripcion: "Pegue valores debajo de cada umbral, por ejemplo 10% o 250.", campo: "Formato", valorActual: "", valorNuevo: "Sin filas para aplicar", warning: true, canApply: false });
  return preview;
}

function findClipboardColumn(headerRow, aliases, fallbackIndex) {
  const normalizedAliases = aliases.map(normalizeCanal);
  const index = (headerRow || []).findIndex((header) => normalizedAliases.includes(normalizeCanal(header)));
  return index >= 0 ? index : fallbackIndex;
}

function normalizeComboRole(value) {
  const normalized = normalizeCanal(value);
  if (normalized.includes("principal")) return "principal";
  if (normalized.includes("regalia") || normalized.includes("recompensa") || normalized.includes("reward")) return "regalia";
  return "";
}

function normalizeDiscountValue(value) {
  const text = normalizeValue(value);
  if (!text) return "";
  return text.includes("%") ? text : `${text}%`;
}

function parseBuyXGetXVariant(value) {
  const text = normalizeValue(value).toLowerCase().replace(/\s+/g, "");
  const match = text.match(/^(\d+)x(\d+)$/);
  if (!match) return null;
  const first = Number(match[1]);
  const second = Number(match[2]);
  if (!first || !second || first === second) return null;
  const principalQty = Math.min(first, second);
  const rewardQty = Math.abs(first - second);
  return { variant: `${first}x${second}`, principalQty, rewardQty };
}

function buildComboBulkPreview(text, skuMaster = {}) {
  const pastedRows = parseClipboardRows(text);
  if (pastedRows.length < 2) return [];
  const header = pastedRows[0] || [];
  const scenarioIndex = (header || []).findIndex((column) => ["escenario", "escenarios"].includes(normalizeCanal(column)));
  const hasScenarioColumn = scenarioIndex >= 0;
  const roleIndex = findClipboardColumn(header, ["tipo", "rol"], hasScenarioColumn ? 1 : 0);
  const skuIndex = findClipboardColumn(header, ["sku", "codigo", "codigo_sku"], hasScenarioColumn ? 2 : 1);
  const priceIndex = findClipboardColumn(header, ["ahora con iva", "precio ahora", "precio_ahora"], hasScenarioColumn ? 3 : 2);
  const discountIndex = findClipboardColumn(header, ["descuento", "desc"], hasScenarioColumn ? 4 : 3);
  const commentIndex = findClipboardColumn(header, ["comentario", "comentarios", "comment"], -1);
  const preview = [];
  let currentScenario = "";
  let generatedScenario = 0;
  let previousRole = "";
  pastedRows.slice(1).forEach((cells) => {
    const role = normalizeComboRole(cells[roleIndex]);
    const sku = normalizeValue(cells[skuIndex]);
    const rawPrice = normalizeValue(cells[priceIndex]);
    const rawDiscount = normalizeValue(cells[discountIndex]);
    const comentario = commentIndex >= 0 ? normalizeValue(cells[commentIndex]) : "";
    if (!sku && !role && !rawPrice && !rawDiscount && !comentario) return;
    const pastedScenario = hasScenarioColumn ? normalizeValue(cells[scenarioIndex]) : "";
    if (pastedScenario) currentScenario = pastedScenario;
    else if (!hasScenarioColumn && role === "principal" && isComboRewardRole(previousRole)) {
      generatedScenario += 1;
      currentScenario = `Combo ${generatedScenario}`;
    }
    if (!currentScenario) {
      generatedScenario += 1;
      currentScenario = `Combo ${generatedScenario}`;
    }
    const reward = isComboRewardRole(role);
    const precioAhora = rawPrice ? normalizePastedNumber(rawPrice) : "";
    const descuento = rawDiscount ? normalizeDiscountValue(rawDiscount) : reward ? "100%" : "";
    const master = skuMaster[sku] || {};
    const warning = !role || !sku || !master.descripcion;
    const benefit = precioAhora ? `Precio fijo ${precioAhora}` : descuento ? `Descuento ${descuento}` : "Sin beneficio";
    preview.push({ index: preview.length + 1, scenario: currentScenario, sku: sku || "SKU vacio", descripcion: `${currentScenario} | ${role || "Rol no reconocido"} | ${master.descripcion || "SKU no encontrado en archivo comprador"}`, campo: role === "regalia" ? "Regalía" : role === "principal" ? "Principal" : "Rol", valorActual: "", valorNuevo: benefit, role, cantidadMinima: 1, precioAhora, descuento, comentario, warning, canApply: Boolean(role && sku) });
    previousRole = role || previousRole;
  });
  if (!preview.some((item) => item.canApply)) preview.push({ index: "Aviso", sku: "Sin combos", descripcion: "Pegue columnas: Tipo, Sku, Ahora con iva y descuento.", campo: "Formato", valorActual: "", valorNuevo: "Sin filas para aplicar", warning: true, canApply: false });
  return preview;
}

function buildBuyXGetXBulkPreview(text, skuMaster = {}, promoType = BUY_X_GET_X_PROMO_TYPE) {
  const pastedRows = parseClipboardRows(text);
  if (pastedRows.length < 2) return [];
  const header = pastedRows[0] || [];
  const skuIndex = findClipboardColumn(header, ["sku", "codigo", "codigo_sku"], 0);
  const variantIndex = findClipboardColumn(header, ["variante", "variant", "compra_lleva", "compra x lleva"], 1);
  const priceIndex = findClipboardColumn(header, ["ahora c iva", "ahora con iva", "precio ahora", "precio_ahora"], 2);
  const discountIndex = findClipboardColumn(header, ["descuento", "desc"], 3);
  const preview = [];
  pastedRows.slice(1).forEach((cells) => {
    const sku = normalizeValue(cells[skuIndex]);
    const variantText = normalizeValue(cells[variantIndex]);
    const parsedVariant = parseBuyXGetXVariant(variantText);
    const rawPrice = normalizeValue(cells[priceIndex]);
    const rawDiscount = normalizeValue(cells[discountIndex]);
    if (!sku && !variantText && !rawPrice && !rawDiscount) return;
    const precioAhora = rawPrice ? normalizePastedNumber(rawPrice) : "";
    const descuento = rawDiscount ? normalizeDiscountValue(rawDiscount) : "";
    const master = skuMaster[sku] || {};
    const warning = !sku || !parsedVariant || !master.descripcion;
    const variantLabel = parsedVariant ? parsedVariant.variant : variantText || "Variante invalida";
    const benefit = precioAhora ? `Precio fijo ${precioAhora}` : descuento ? `Descuento ${descuento}` : "Sin precio/descuento principal";
    preview.push({ index: preview.length + 1, sku: sku || "SKU vacio", descripcion: `${variantLabel} | ${master.descripcion || "SKU no encontrado en archivo comprador"}`, campo: "Variante", valorActual: "", valorNuevo: benefit, variant: variantLabel, principalQty: parsedVariant?.principalQty || 0, rewardQty: parsedVariant?.rewardQty || 0, precioAhora, descuento, warning, canApply: Boolean(sku && parsedVariant) });
  });
  if (!preview.some((item) => item.canApply)) preview.push({ index: "Aviso", sku: "Sin variantes", descripcion: `Pegue columnas: SKU, variante, ahora c IVA y descuento para ${promoType}.`, campo: "Formato", valorActual: "", valorNuevo: "Sin filas para aplicar", warning: true, canApply: false });
  return preview;
}

function toAppRow(row) {
  const segmentValue = row.segmentoCliente || row.segmento_cliente || row.segmento || "";
  const aplicaSegmento = isSegmentedRow({ ...row, segmento: segmentValue }) ? "SI" : "NO";
  const rowId = row.row_id || row.id || makeId("ROW");
  const activityId = row.actividadId || row.actividad_id || row.catalogo_id || "";
  const tipoPromo = row.tipoPromo || row.tipo_promo || "";
  const grupoOferta = row.grupoOferta || row.grupo_oferta || "";
  const offerId = resolveOfferId(row, rowId, activityId, tipoPromo, grupoOferta);
  const compradorId = row.comprador_id || row.compradorId || "";
  return {
    ...row,
    id: rowId,
    row_id: rowId,
    actividadId: activityId,
    actividad_id: activityId,
    ofertaId: offerId,
    oferta_id: offerId,
    tipoPromo,
    tipo_promo: tipoPromo,
    grupoOferta,
    grupo_oferta: grupoOferta,
    compradorId,
    comprador_id: compradorId,
    tipoSku: row.tipoSku || row.tipo_sku || "",
    tipo_sku: row.tipo_sku || row.tipoSku || "",
    variante: row.variante || "",
    numParte: row.numParte || row.num_parte || "",
    num_parte: row.num_parte || row.numParte || "",
    tipoCantidad: row.tipoCantidad || row.tipo_cantidad || "Exacta",
    tipo_cantidad: row.tipo_cantidad || row.tipoCantidad || "Exacta",
    cantidadMinima: row.cantidadMinima || row.cantidad_minima || 1,
    cantidad_minima: row.cantidad_minima || row.cantidadMinima || 1,
    precioAntes: row.precioAntes || row.precio_antes || "",
    precio_antes: row.precio_antes || row.precioAntes || "",
    precioAhora: row.precioAhora || row.precio_ahora || "",
    precio_ahora: row.precio_ahora || row.precioAhora || "",
    comentario: row.comentario || row.comentario_comprador || "",
    comentario_comprador: row.comentario_comprador || row.comentario || "",
    aplicaSegmento,
    aplica_segmento: aplicaSegmento,
    segmento: aplicaSegmento === "SI" ? segmentValue || "" : "Todos",
    segmentoCliente: aplicaSegmento === "SI" ? segmentValue || "" : "",
    segmento_cliente: aplicaSegmento === "SI" ? segmentValue || "" : "",
    alcanceTipo: normalizeAlcanceType(row.alcanceTipo || row.alcance_tipo),
    alcance_tipo: normalizeAlcanceType(row.alcance_tipo || row.alcanceTipo),
    alcanceValor: row.alcanceValor || row.alcance_valor || "",
    alcance_valor: row.alcance_valor || row.alcanceValor || "",
  };
}

function getGridColumnsForPromoType(type) {
  const columns = getColumnsForPromoType(type);
  return ["sku", ...columns.filter((column) => column !== "sku")];
}

function getPromoRowClass(row) {
  if (!["Combo", ...BUY_X_GET_X_PROMO_TYPES].includes(row.tipoPromo || row.tipo_promo)) return "";
  const role = normalizeCanal(row.tipoSku || row.tipo_sku);
  return classNames(role === "principal" && "row-principal", isComboRewardRole(role) && "row-reward");
}

function renderCell(row, col, updateRow, warning, segmentOptions = []) {
  if (col === "tipoCantidad") return <select value={row[col]} onChange={(e) => updateRow(row.id, col, e.target.value)}><option>Exacta</option><option>Mínimo</option></select>;
  if (col === "tipoSku") {
    const role = normalizeCanal(row[col]);
    const highlightRole = ["Combo", ...BUY_X_GET_X_PROMO_TYPES].includes(row.tipoPromo || row.tipo_promo);
    const roleClass = !highlightRole ? "neutral" : isComboRewardRole(role) ? "reward" : role === "principal" ? "principal" : "neutral";
    return <div className={classNames("role-cell", roleClass)}><span className="role-dot" aria-hidden="true"></span><select className="role-select" value={row[col]} onChange={(e) => updateRow(row.id, col, e.target.value)}><option>principal</option><option>regalia</option><option>recompensa</option></select></div>;
  }
  if (col === "aplicaSegmento") return <select value={isSegmentedRow(row) ? "SI" : "NO"} onChange={(e) => updateRow(row.id, col, e.target.value)}><option value="NO">NO</option><option value="SI">SI</option></select>;
  if (col === "segmento") return isSegmentedRow(row) ? <><input list={`segmentos-${row.id}`} value={row.segmento || ""} onChange={(e) => updateRow(row.id, col, e.target.value)} /><datalist id={`segmentos-${row.id}`}>{segmentOptions.map((item) => <option key={item.segmento_id} value={item.segmento_id}>{item.segmento}</option>)}</datalist></> : <div className="readonly-cell">Todos</div>;
  if (["descripcion", "numParte", "grupoOferta", "tipoPromo"].includes(col)) return <div className="readonly-cell">{row[col]}</div>;
  if (col === "descuento") return <div className="inline-cell"><input className={warning ? "input-warning" : ""} value={row[col] || ""} onChange={(e) => updateRow(row.id, col, e.target.value)} />{warning && <AlertTriangle size={15}/>}</div>;
  return <input value={row[col] || ""} onChange={(e) => updateRow(row.id, col, e.target.value)} />;
}

export default function PromosPage({ catalogoActivo, rows, setRows, comentarios, setComentarios, compradores, jerarquiaCategorias = [], segmentosClientes, skuMaster, setLogs, onLoadSkuMaster, skuMasterFileInputRef, archivoComprador, onSaveDrive, driveReady, saveDriveStatus, isSyncing, avanceCatalogos = {}, setAvanceCatalogos, activityContext = null, initialComprador = "", lockComprador = false, initialTipoPromo = "Descuento", title = "Carga de promociones", subtitle = "Grilla controlada para registrar promociones simples y complejas por comprador." }) {
  const { can } = usePermissions();
  const canEditPromos = can(PERMISSIONS.EDIT_PROMOS);
  const canEditAvances = can(PERMISSIONS.EDIT_AVANCES);
  const canSyncSupabase = can(PERMISSIONS.SYNC_SUPABASE);
  const {
    comprador,
    setComprador,
    tipoActivo,
    setTipoActivo,
    search,
    setSearch,
    bulkColumn,
    setBulkColumn,
    bulkText,
    setBulkText,
    bulkPreview,
    setBulkPreview,
    segmentMode,
    setSegmentMode,
    selectedSegments,
    setSelectedSegments,
    comboDraft,
    setComboDraft,
    showActivityComment,
    setShowActivityComment,
    activityCommentDraft,
    setActivityCommentDraft,
    segmentText,
  } = usePromoForm({ initialComprador, initialTipoPromo });
  const promoTemplateFileInputRef = React.useRef(null);
  const buyerList = compradores.filter((c) => c.activo !== false).map((c) => c.comprador || c.nombre).filter(Boolean);
  const compradorSeleccionado = Boolean(comprador);
  const skuMasterTotal = Object.keys(skuMaster || {}).length;
  const esCompleja = isComplexPromoType(tipoActivo);
  const columnas = getGridColumnsForPromoType(tipoActivo);
  const segmentOptions = getSegmentosByCanal(segmentosClientes, catalogoActivo?.canal);
  const currentActivityId = activityContext?.actividad_id || catalogoActivo?.actividad_id || catalogoActivo?.actividadId || catalogoActivo?.id || catalogoActivo?.catalogo_id || "";
  const currentActivityName = activityContext?.nombre_actividad || catalogoActivo?.nombre || "Sin catalogo";
  const currentCatalogoAvanceId = getCatalogoAvanceId(activityContext || catalogoActivo) || currentActivityId;
  const selectedBuyerConfig = compradores.find((buyer) => getCompradorNombre(buyer) === comprador);
  const hierarchyByDepId = useMemo(() => new Map((jerarquiaCategorias || []).filter((item) => item.activo !== false && item.dep_id).map((item) => [normalizeCanal(item.dep_id), item])), [jerarquiaCategorias]);
  const getMasterDivision = (master, fallback = "") => hierarchyByDepId.get(normalizeCanal(master?.dep_id || master?.dept))?.division || fallback;
  const buyerDivisionesAvance = selectedBuyerConfig ? getCompradorDivisiones(selectedBuyerConfig) : [];
  const toggleBuyerAvance = (division) => {
    if (!setAvanceCatalogos || !currentCatalogoAvanceId || !comprador || !division) return;
    setAvanceCatalogos((current) => toggleAvanceTerminado(current, currentCatalogoAvanceId, division, comprador));
  };
  const simpleRequiredBulkColumn = tipoActivo === "Precio fijo" ? "precioAhora" : tipoActivo === "Descuento" ? "descuento" : "";
  const isSimpleRequiredValuePaste = bulkColumn === simpleRequiredBulkColumn;
  const {
    activityComments,
    openActivityComments,
    latestActivityComment,
    rowMatchesSkuSegment,
    createGroupForCurrentActivity,
    rowMatchesActiveScope,
    activeRows,
    filteredRows,
    missingBenefitCount,
    benefitStatusText,
    comboGroups,
  } = usePromoFilters({
    rows,
    comentarios,
    currentActivityId,
    compradorSeleccionado,
    comprador,
    tipoActivo,
    search,
    segmentMode,
    segmentText,
  });
  const comboGroup = comboDraft.group || createGroupForCurrentActivity("Combo");
  const pushLog = (accion) => setLogs((prev) => [{ fecha: new Date().toLocaleString(), usuario: comprador, catalogo: currentActivityName, accion }, ...prev]);
  const toggleSegment = (segmentoId) => setSelectedSegments((prev) => prev.includes(segmentoId) ? prev.filter((item) => item !== segmentoId) : [...prev, segmentoId]);
  const toggleSegmentMode = () => { setSegmentMode((prev) => { if (prev) setSelectedSegments([]); return !prev; }); };
  const applySegmentsToGrid = () => {
    const rowIds = new Set(filteredRows.map((row) => row.id));
    setRows((prev) => prev.map((row) => rowIds.has(row.id) ? toAppRow({ ...row, aplica_segmento: segmentMode && segmentText ? "SI" : "NO", aplicaSegmento: segmentMode && segmentText ? "SI" : "NO", segmento: segmentMode && segmentText ? segmentText : "Todos" }) : row));
    pushLog(segmentMode && segmentText ? `Aplicó segmentos ${segmentText}` : "Marcó promociones para público general");
  };
  const addActivityComment = () => {
    const texto = normalizeValue(activityCommentDraft);
    if (!texto || !currentActivityId) return;
    const id = makeId("CMT");
    setComentarios((prev) => [{
      id,
      comentario_id: id,
      actividadId: currentActivityId,
      actividad_id: currentActivityId,
      rowId: "",
      row_id: "",
      alcanceComentario: "ACTIVITY",
      alcance_comentario: "ACTIVITY",
      usuario: comprador || "Comprador",
      tipo_usuario: "Comprador",
      texto,
      comentario: texto,
      estado: "Abierto",
      fecha: new Date().toLocaleString(),
      prioridad: "MEDIA",
    }, ...prev]);
    setActivityCommentDraft("");
    setShowActivityComment(false);
    pushLog(`Agregó comentario general en ${currentActivityName}`);
  };
  const buildPromoRow = ({ sku = "", promoType = tipoActivo, group = "", tipoSku = "", tipoCantidad = "Exacta", cantidadMinima = 1, precioAhora = "", descuento = "", comentario = "", variante = "" } = {}) => {
    const cleanSku = normalizeValue(sku);
    const master = (skuMaster || {})[cleanSku] || {};
    const rowId = makeId("ROW");
    const promoIsComplex = isComplexPromoType(promoType);
    const nextGroup = group || (promoIsComplex ? createGroupForCurrentActivity(promoType) : promoType);
    const buyer = compradores.find((c) => (c.comprador || c.nombre) === comprador);
    const aplicaSegmento = activityContext?.aplica_segmento || (segmentMode && segmentText ? "SI" : "NO");
    const segmentoCliente = activityContext?.segmento_cliente || (segmentMode && segmentText ? segmentText : "");
    const actividadId = currentActivityId || "BIFOLIAR_JUN2026";
    const division = getMasterDivision(master, buyer?.division || "");
    const compradorId = buyer?.comprador_id || buyer?.compradorId || buyer?.id || "";
    return toAppRow({ row_id: rowId, actividad_id: actividadId, tipo_promo: promoType, grupo_oferta: nextGroup, tipo_sku: tipoSku || (promoIsComplex ? "principal" : "simple"), variante, sku: cleanSku, dep_id: master.dep_id || "", num_parte: master.vpn || "", descripcion: master.descripcion || "", tipo_cantidad: tipoCantidad, cantidad_minima: cantidadMinima, precio_antes: master.precio || "", precio_ahora: precioAhora, descuento, comentario_comprador: comentario, aplica_segmento: aplicaSegmento, segmento: aplicaSegmento === "SI" ? segmentoCliente : "Todos", segmento_cliente: aplicaSegmento === "SI" ? segmentoCliente : "", alcance_tipo: activityContext?.alcance_tipo || "CANAL", alcance_valor: activityContext?.alcance_valor || catalogoActivo?.canal || "", comprador_id: compradorId, comprador, division, estado_registro: "BORRADOR" });
  };
  const updateComboDraft = (field, value) => setComboDraft((prev) => { const next = { ...prev, [field]: value }; if (field === "role") { next.beneficio = isComboRewardRole(value) ? "gratis" : "descuento"; next.valor = ""; } return next; });
  const startNewCombo = () => setComboDraft((prev) => ({ ...prev, group: "", role: "principal", sku: "", cantidad: 1, beneficio: "descuento", valor: "" }));
  const addComboLine = () => {
    if (!compradorSeleccionado) return;
    const sku = normalizeValue(comboDraft.sku);
    if (!sku) return;
    const quantity = Math.max(1, Number(comboDraft.cantidad) || 1);
    const reward = isComboRewardRole(comboDraft.role);
    const benefitValue = normalizeValue(comboDraft.valor);
    const precioAhora = comboDraft.beneficio === "precio" ? benefitValue : reward && comboDraft.beneficio === "gratis" ? 0 : "";
    const descuento = comboDraft.beneficio === "descuento" ? (benefitValue.includes("%") ? benefitValue : `${benefitValue}%`) : reward && comboDraft.beneficio === "gratis" ? "100%" : "";
    const comentario = reward ? `Regalia combo: entrega ${quantity}` : `Principal combo: compra ${quantity}`;
    const newRow = buildPromoRow({ sku, promoType: "Combo", group: comboGroup, tipoSku: reward ? "regalia" : "principal", tipoCantidad: "Exacta", cantidadMinima: quantity, precioAhora, descuento, comentario });
    setRows((prev) => [...prev, newRow]);
    setComboDraft((prev) => ({ ...prev, group: comboGroup, sku: "", cantidad: reward ? 1 : prev.cantidad, valor: "" }));
    pushLog(`Agregó SKU ${sku} al ${comboGroup} como ${reward ? "regalía" : "principal"}`);
  };
  const addRow = (sku = "") => {
    if (!compradorSeleccionado) return;
    sku = normalizeValue(sku);
    if (sku && !isNumericSku(sku)) return;
    const newRow = tipoActivo === "Combo" ? buildPromoRow({ sku, promoType: "Combo", group: comboGroup, tipoSku: "principal", tipoCantidad: "Exacta", cantidadMinima: 1 }) : buildPromoRow({ sku });
    if (tipoActivo === "Combo") setComboDraft((prev) => ({ ...prev, group: comboGroup }));
    setRows((prev) => [...prev, newRow]);
    pushLog(`Agregó SKU ${sku || "sin código"} en ${tipoActivo}`);
  };
  const pasteSkus = async () => {
    if (!compradorSeleccionado) return;
    try {
      const text = await navigator.clipboard.readText();
      if (tipoActivo === "Umbral") { setBulkColumn(BULK_COLUMN_UMBRAL_TABLE); setBulkText(text); setBulkPreview(buildUmbralBulkPreview(text, skuMaster)); return; }
      if (tipoActivo === "Combo") { setBulkColumn(BULK_COLUMN_COMBO_TABLE); setBulkText(text); setBulkPreview(buildComboBulkPreview(text, skuMaster)); return; }
      if (BUY_X_GET_X_PROMO_TYPES.includes(tipoActivo)) { setBulkColumn(BULK_COLUMN_BUY_X_GET_X_TABLE); setBulkText(text); setBulkPreview(buildBuyXGetXBulkPreview(text, skuMaster, tipoActivo)); return; }
      parseClipboardValues(text).forEach(addRow);
    } catch {
      setBulkColumn(tipoActivo === "Umbral" ? BULK_COLUMN_UMBRAL_TABLE : tipoActivo === "Combo" ? BULK_COLUMN_COMBO_TABLE : BUY_X_GET_X_PROMO_TYPES.includes(tipoActivo) ? BULK_COLUMN_BUY_X_GET_X_TABLE : tipoActivo === "Precio fijo" ? "precioAhora" : tipoActivo === "Descuento" ? "descuento" : "sku");
    }
  };
  const changeBulkColumn = (value) => { setBulkColumn(value); setBulkPreview([]); };
  const changeTipoActivo = (value) => {
    setTipoActivo(value);
    setBulkPreview([]);
    if (value === "Umbral") setBulkColumn(BULK_COLUMN_UMBRAL_TABLE);
    else if (value === "Combo") setBulkColumn(BULK_COLUMN_COMBO_TABLE);
    else if (BUY_X_GET_X_PROMO_TYPES.includes(value)) setBulkColumn(BULK_COLUMN_BUY_X_GET_X_TABLE);
    else if (value === "Precio fijo") setBulkColumn("precioAhora");
    else if (value === "Descuento") setBulkColumn("descuento");
    else if ([BULK_COLUMN_UMBRAL_TABLE, BULK_COLUMN_COMBO_TABLE, BULK_COLUMN_BUY_X_GET_X_TABLE].includes(bulkColumn)) setBulkColumn("sku");
  };
  const buildBulkPreviewItems = (text = bulkText, column = bulkColumn) => {
    const pastedRows = parseClipboardRows(text); if (!pastedRows.length) return [];
    if (column === BULK_COLUMN_UMBRAL_TABLE) return buildUmbralBulkPreview(text, skuMaster);
    if (column === BULK_COLUMN_COMBO_TABLE) return buildComboBulkPreview(text, skuMaster);
    if (column === BULK_COLUMN_BUY_X_GET_X_TABLE) return buildBuyXGetXBulkPreview(text, skuMaster, tipoActivo);
    const numericRows = pastedRows.filter((cells) => isNumericSku(cells[0]));
    if (column === "sku") return numericRows.map((cells, index) => { const value = cells[0]; return { index:index+1, rowId:null, sku:value, descripcion:(skuMaster || {})[value]?.descripcion || "SKU no encontrado en archivo comprador", campo:"Nuevo SKU", valorActual:"", valorNuevo:value, warning:!value || !(skuMaster || {})[value] }; });
    const simpleRequiredPaste = column === (tipoActivo === "Precio fijo" ? "precioAhora" : tipoActivo === "Descuento" ? "descuento" : "");
    if (simpleRequiredPaste) return numericRows.map((cells, index) => {
      const sku = cells[0];
      const value = cells.length > 1 ? cells[1] : "";
      const optionalValue = cells.length > 2 ? normalizeValue(cells[2]) : "";
      const commentValue = cells.length > 3 ? normalizeValue(cells[3]) : "";
      const extraValues = {};
      if (optionalValue && column === "descuento") { const precioAhora = normalizePastedNumber(optionalValue); extraValues.precioAhora = precioAhora; extraValues.precio_ahora = precioAhora; }
      if (optionalValue && column === "precioAhora") extraValues.descuento = normalizeDiscountValue(optionalValue);
      if (commentValue) extraValues.comentario = commentValue;
      const extraSummary = [extraValues.precioAhora ? `Precio ${extraValues.precioAhora}` : "", extraValues.descuento ? `Descuento ${extraValues.descuento}` : "", extraValues.comentario ? "Comentario" : ""].filter(Boolean).join(" | ");
      const matches = rows.filter((row) => rowMatchesActiveScope(row) && rowMatchesSkuSegment(row, sku));
      const missingSecondColumn = cells.length < 2;
      const missingRequired = !sku || missingSecondColumn;
      const master = (skuMaster || {})[sku];
      const baseDescripcion = missingRequired ? `Pegue dos columnas: SKU y ${labels[column]}` : matches.length ? `Actualizara ${matches.length} fila(s) existente(s)` : master?.descripcion || "SKU nuevo sin descripcion del archivo comprador";
      const descripcion = extraSummary ? `${baseDescripcion} | ${extraSummary}` : baseDescripcion;
      return { index:index+1, rowId:matches[0]?.id || null, rowIds:matches.map((row) => row.id), sku:sku || "SKU vacio", descripcion, campo:labels[column], valorActual:matches.length ? matches.map((row) => row[column] || "").join(" | ") : "", valorNuevo:value, extraValues, warning:missingRequired || !master, canApply:!missingRequired };
    });
    return numericRows.map((cells, index) => {
      const sku = cells[0];
      const value = cells.length > 1 ? cells[1] : "";
      const matches = rows.filter((row) => rowMatchesActiveScope(row) && rowMatchesSkuSegment(row, sku));
      const row = matches.length === 1 ? matches[0] : null;
      const missingSecondColumn = cells.length < 2;
      const duplicated = matches.length > 1;
      const descripcion = missingSecondColumn ? `Pegue dos columnas: SKU y ${labels[column]}` : duplicated ? "SKU duplicado en la grilla; revise manualmente" : row?.descripcion || "No existe una fila con este SKU";
      const warning = !sku || missingSecondColumn || !row || duplicated;
      return { index:index+1, rowId:row?.id || null, sku:sku || "SKU vacio", descripcion, campo:labels[column], valorActual:row ? row[column] : "", valorNuevo:value, warning, canApply:!warning };
    });
  };
  const buildBulkPreview = () => { if (!compradorSeleccionado) return; setBulkPreview(buildBulkPreviewItems()); };
  const loadPromoTemplate = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !compradorSeleccionado) return;
    try {
      const result = await readPromoTemplateFile(file, tipoActivo);
      const preview = buildBulkPreviewItems(result.text, result.bulkColumn);
      setBulkColumn(result.bulkColumn);
      setBulkText(result.text);
      setBulkPreview(preview.length ? preview : [{ index:"Aviso", sku:"Plantilla", descripcion:`La pestaña ${result.sheetName} no generó vista previa.`, campo:"Archivo", valorActual:"", valorNuevo:file.name, warning:true, canApply:false }]);
    } catch (error) {
      setBulkPreview([{ index:"Aviso", sku:"Plantilla", descripcion:error?.message || "No se pudo leer la plantilla.", campo:"Archivo", valorActual:"", valorNuevo:file.name, warning:true, canApply:false }]);
    } finally {
      event.target.value = "";
    }
  };
  const applyBulkPaste = () => {
    if (!compradorSeleccionado) return;
    if (!bulkPreview.length) return;
    if (bulkColumn === "sku") { bulkPreview.forEach((item) => addRow(item.valorNuevo)); setBulkText(""); setBulkPreview([]); return; }
    if (bulkColumn === BULK_COLUMN_UMBRAL_TABLE) {
      const applicableItems = bulkPreview.filter((item) => item.canApply !== false);
      const groupsBySku = new Map();
      const newRows = [];
      applicableItems.forEach((item) => {
        if (!groupsBySku.has(item.sku)) groupsBySku.set(item.sku, createGroupForCurrentActivity("Umbral", [...rows, ...newRows]));
        newRows.push(buildPromoRow({ sku: item.sku, promoType: "Umbral", group: groupsBySku.get(item.sku), tipoSku: "principal", tipoCantidad: "Mínimo", cantidadMinima: item.cantidadMinima, precioAhora: item.precioAhora, descuento: item.descuento }));
      });
      if (!newRows.length) return;
      setRows((prev) => [...prev, ...newRows]);
      pushLog(`Pegó ${newRows.length} filas de umbral para ${groupsBySku.size} SKU`);
      setBulkText("");
      setBulkPreview([]);
      return;
    }
    if (bulkColumn === BULK_COLUMN_COMBO_TABLE) {
      const applicableItems = bulkPreview.filter((item) => item.canApply !== false);
      const groupsByScenario = new Map();
      const newRows = [];
      applicableItems.forEach((item) => {
        if (!groupsByScenario.has(item.scenario)) groupsByScenario.set(item.scenario, createGroupForCurrentActivity("Combo", [...rows, ...newRows]));
        const reward = isComboRewardRole(item.role);
        const comboComment = [`${item.scenario}: ${reward ? "regalia" : "principal"} cantidad 1`, item.comentario].filter(Boolean).join(" | ");
        newRows.push(buildPromoRow({ sku: item.sku, promoType: "Combo", group: groupsByScenario.get(item.scenario), tipoSku: reward ? "regalia" : "principal", tipoCantidad: "Exacta", cantidadMinima: 1, precioAhora: item.precioAhora, descuento: item.descuento, comentario: comboComment }));
      });
      if (!newRows.length) return;
      setRows((prev) => [...prev, ...newRows]);
      setComboDraft((prev) => ({ ...prev, group: Array.from(groupsByScenario.values()).at(-1) || prev.group }));
      pushLog(`Pegó ${newRows.length} filas de combo para ${groupsByScenario.size} combos`);
      setBulkText("");
      setBulkPreview([]);
      return;
    }
    if (bulkColumn === BULK_COLUMN_BUY_X_GET_X_TABLE) {
      const applicableItems = bulkPreview.filter((item) => item.canApply !== false);
      const newRows = [];
      applicableItems.forEach((item) => {
        const promoType = BUY_X_GET_X_PROMO_TYPES.includes(tipoActivo) ? tipoActivo : BUY_X_GET_X_PROMO_TYPE;
        const group = createGroupForCurrentActivity(promoType, [...rows, ...newRows]);
        if (promoType === BUY_X_GET_X_V2_PROMO_TYPE) {
          newRows.push(buildPromoRow({ sku: item.sku, promoType, group, tipoSku: "principal", tipoCantidad: "Exacta", cantidadMinima: item.principalQty, precioAhora: item.precioAhora, descuento: item.descuento, comentario: `Variante ${item.variant}: principal ${item.principalQty}; regalia ${item.rewardQty}`, variante: item.variant }));
          return;
        }
        newRows.push(buildPromoRow({ sku: item.sku, promoType, group, tipoSku: "principal", tipoCantidad: "Exacta", cantidadMinima: item.principalQty, precioAhora: item.precioAhora, descuento: item.descuento, comentario: `Variante ${item.variant}: principal ${item.principalQty}`, variante: item.variant }));
        newRows.push(buildPromoRow({ sku: item.sku, promoType, group, tipoSku: "regalia", tipoCantidad: "Exacta", cantidadMinima: item.rewardQty, precioAhora: 0, descuento: "100%", comentario: `Variante ${item.variant}: regalia ${item.rewardQty}`, variante: item.variant }));
      });
      if (!newRows.length) return;
      setRows((prev) => [...prev, ...newRows]);
      pushLog(`Pegó ${newRows.length} filas de ${tipoActivo} para ${applicableItems.length} variantes`);
      setBulkText("");
      setBulkPreview([]);
      return;
    }
    if (isSimpleRequiredValuePaste) {
      const applicableItems = bulkPreview.filter((item) => item.canApply !== false && isNumericSku(item.sku));
      if (!applicableItems.length) return;
      setRows((prev) => {
        let nextRows = [...prev];
        applicableItems.forEach((item) => {
          const matches = nextRows.filter((row) => rowMatchesActiveScope(row) && rowMatchesSkuSegment(row, item.sku));
          const extraValues = item.extraValues || {};
          if (matches.length) {
            const ids = new Set(matches.map((row) => row.id));
            nextRows = nextRows.map((row) => ids.has(row.id) ? toAppRow({ ...row, [bulkColumn]: item.valorNuevo, [bulkColumn === "precioAhora" ? "precio_ahora" : bulkColumn]: item.valorNuevo, ...extraValues }) : row);
            return;
          }
          const values = bulkColumn === "precioAhora" ? { precioAhora: item.valorNuevo } : { descuento: item.valorNuevo };
          nextRows = [...nextRows, buildPromoRow({ sku: item.sku, promoType: tipoActivo, ...values, ...extraValues })];
        });
        return nextRows;
      });
      pushLog(`Pegó ${applicableItems.length} valores de ${labels[bulkColumn]} en ${tipoActivo}`);
      setBulkText("");
      setBulkPreview([]);
      return;
    }
    const map = new Map(bulkPreview.filter((item) => item.rowId && !item.warning && isNumericSku(item.sku)).map((item) => [item.rowId, item.valorNuevo]));
    setRows((prev) => prev.map((row) => map.has(row.id) ? toAppRow({ ...row, [bulkColumn]: map.get(row.id), [bulkColumn === "precioAhora" ? "precio_ahora" : bulkColumn]: map.get(row.id) }) : row));
    setBulkText("");
    setBulkPreview([]);
  };
  const clearPromosWorkspace = () => {
    setSearch("");
    setBulkText("");
    setBulkPreview([]);
    setBulkColumn(tipoActivo === "Umbral" ? BULK_COLUMN_UMBRAL_TABLE : tipoActivo === "Combo" ? BULK_COLUMN_COMBO_TABLE : BUY_X_GET_X_PROMO_TYPES.includes(tipoActivo) ? BULK_COLUMN_BUY_X_GET_X_TABLE : tipoActivo === "Precio fijo" ? "precioAhora" : tipoActivo === "Descuento" ? "descuento" : "sku");
    setSegmentMode(false);
    setSelectedSegments([]);
    setComboDraft({ group: "", role: "principal", sku: "", cantidad: 1, beneficio: "descuento", valor: "" });
  };
  const { updateRow, deleteRow } = usePromos({
    setRows,
    skuMaster,
    selectedBuyerConfig,
    getMasterDivision,
    normalizeRow: toAppRow,
  });
  const isUmbralTablePaste = bulkColumn === BULK_COLUMN_UMBRAL_TABLE;
  const isComboTablePaste = bulkColumn === BULK_COLUMN_COMBO_TABLE;
  const isBuyXGetXTablePaste = bulkColumn === BULK_COLUMN_BUY_X_GET_X_TABLE;
  const bulkInstructions = isBuyXGetXTablePaste ? (tipoActivo === BUY_X_GET_X_V2_PROMO_TYPE ? "Pegue una tabla con columnas: SKU, variante, ahora c IVA y descuento. V2 conserva una sola fila por SKU y registra las cantidades en comentario." : "Pegue una tabla con columnas: SKU, variante, ahora c IVA y descuento. La variante AxB crea principal con la cantidad menor y regalia con la diferencia.") : isComboTablePaste ? "Pegue una tabla con columnas: Tipo, Sku, Ahora con iva y descuento. Se crea un combo nuevo cuando una fila Principal viene despues de una Regalia. La cantidad se crea en 1 y puede ajustarse manualmente." : isUmbralTablePaste ? `Pegue una tabla con primera columna SKU y hasta ${MAX_UMBRAL_LEVELS} umbrales. Use % para descuento o numero para precio fijo.` : isSimpleRequiredValuePaste ? `Pegue dos columnas desde Excel: SKU y ${labels[bulkColumn]}. Si el SKU no existe, se crea; si ya existe, se actualiza.` : bulkColumn === "sku" ? "Pegue una columna de SKU para agregar filas nuevas." : `Pegue dos columnas desde Excel: SKU y ${labels[bulkColumn]}.`;
  const bulkPlaceholder = isBuyXGetXTablePaste ? "sku\tvariante\tahora c IVA\tdescuento\n147072842\t4x3\t982\t\n139760160\t5x3\t543\t\n10081749\t5x4\t\t15%\n10081802\t15x12\t\t20%" : isComboTablePaste ? "Tipo\tSku\tAhora con iva\tdescuento\nPrincipal\t152737466\t200\t\nRegalia\t152736551\t\t100%\nPrincipal\t156890097\t789\t\nRegalia\t156890396\t\t100%" : isUmbralTablePaste ? "Sku\t1 a mas\t20 a mas\t30 a mas\t50 a mas\n103163662\t5%\t10%\t15%\t25%" : bulkColumn === "sku" ? "Pegue aqui una columna de SKU copiada desde Excel" : `Pegue aqui dos columnas: SKU y ${labels[bulkColumn]}`;
  const canApplyBulkPreview = bulkPreview.length > 0 && bulkPreview.some((item) => item.canApply !== false);
  const isComboActive = tipoActivo === "Combo";
  const comboIsReward = isComboRewardRole(comboDraft.role);
  const comboNeedsValue = comboDraft.beneficio !== "gratis" && comboDraft.beneficio !== "sin";
  const canAddComboLine = compradorSeleccionado && normalizeValue(comboDraft.sku) && (!comboNeedsValue || normalizeValue(comboDraft.valor));
  const comboBuilder = isComboActive && canEditPromos ? <Card className="combo-builder-card"><CardContent><div className="combo-builder-head"><div><h2>Constructor de combo</h2><p>{comboGroup}</p></div><Button variant="outline" onClick={startNewCombo} disabled={!compradorSeleccionado}><Plus size={16}/> Nuevo combo</Button></div><div className="combo-builder"><label className="field"><span>Oferta</span><select value={comboDraft.group} onChange={(e) => updateComboDraft("group", e.target.value)} disabled={!compradorSeleccionado}><option value="">Nueva oferta: {createGroupForCurrentActivity("Combo")}</option>{comboGroups.map((group) => <option key={group} value={group}>{group}</option>)}</select></label><label className="field"><span>Rol</span><select value={comboDraft.role} onChange={(e) => updateComboDraft("role", e.target.value)} disabled={!compradorSeleccionado}><option value="principal">Principal</option><option value="regalia">Regalía</option></select></label><label className="field"><span>SKU</span><input value={comboDraft.sku} onChange={(e) => updateComboDraft("sku", e.target.value)} disabled={!compradorSeleccionado} placeholder={comboIsReward ? "SKU de regalía" : "SKU principal"} /></label><label className="field"><span>{comboIsReward ? "Cantidad entregada" : "Cantidad comprada"}</span><input type="number" min="1" step="1" value={comboDraft.cantidad} onChange={(e) => updateComboDraft("cantidad", e.target.value)} disabled={!compradorSeleccionado} /></label><label className="field"><span>Beneficio</span><select value={comboDraft.beneficio} onChange={(e) => updateComboDraft("beneficio", e.target.value)} disabled={!compradorSeleccionado}><option value="descuento">Descuento</option><option value="precio">Precio fijo</option><option value="gratis">Gratis / regalía</option><option value="sin">Sin beneficio</option></select></label><label className="field"><span>Valor beneficio</span><input value={comboDraft.valor} onChange={(e) => updateComboDraft("valor", e.target.value)} disabled={!compradorSeleccionado || !comboNeedsValue} placeholder={comboDraft.beneficio === "precio" ? "250" : "10%"} /></label><div className="button-row"><Button onClick={addComboLine} disabled={!canAddComboLine}><Plus size={16}/> Agregar al combo</Button></div></div></CardContent></Card> : null;
  const saveDriveLabel = saveDriveStatus === "saving" ? "Guardando..." : saveDriveStatus === "error" ? "Fallo" : saveDriveStatus === "success" ? "Guardado" : "Guardar Supabase";
  const activityCommentStatus = openActivityComments.length ? `${openActivityComments.length} abierto(s)` : activityComments.length ? `${activityComments.length} registrado(s)` : "Sin comentarios";
  const buyerAvancePanel = compradorSeleccionado && canEditAvances ? <div className="avance-mini-panel"><div className="segment-panel-head"><div><strong>Estado de carga</strong><span>Marque terminado cuando complete sus ofertas por division.</span></div></div>{buyerDivisionesAvance.length ? <div className="segment-chip-list">{buyerDivisionesAvance.map((division) => { const terminado = isAvanceTerminado(avanceCatalogos, currentCatalogoAvanceId, division, comprador); return <button key={division} type="button" className={terminado ? "segment-chip selected" : "segment-chip"} onClick={() => toggleBuyerAvance(division)}>{terminado ? <CheckCircle2 size={14}/> : <CircleDashed size={14}/>} {division}</button>; })}</div> : <div className="empty-state">Este comprador no tiene divisiones configuradas en Ajustes.</div>}</div> : null;
  const activityCommentPanel = <div className="activity-comment-panel"><div className="activity-comment-head"><div><strong>Comentario general</strong><span>{activityCommentStatus}</span></div>{canEditPromos && <Button variant="outline" onClick={() => setShowActivityComment((value) => !value)} disabled={!currentActivityId || !compradorSeleccionado}><MessageSquare size={16}/> {showActivityComment ? "Ocultar" : "Agregar"}</Button>}</div>{latestActivityComment && <div className="activity-comment-latest"><span className={String(latestActivityComment.estado).toLowerCase() === "abierto" ? "pill yellow" : "pill green"}>{latestActivityComment.estado}</span><p>{latestActivityComment.texto || latestActivityComment.comentario}</p></div>}{canEditPromos && showActivityComment && <div className="activity-comment-form"><textarea value={activityCommentDraft} onChange={(e) => setActivityCommentDraft(e.target.value)} placeholder="Ej. 20% de descuento en categoria Puertas" /><div className="button-row"><Button onClick={addActivityComment} disabled={!normalizeValue(activityCommentDraft)}><Save size={16}/> Guardar comentario</Button></div></div>}</div>;
  return <div>
    <Header title={title} subtitle={subtitle} />
    <div className="promos-layout">
      <Card className="promo-controls-card">
        <CardContent>
          <label className="field"><span>{activityContext ? "Actividad" : "Catalogo activo"}</span><div className="readonly">{activityContext?.nombre_actividad || catalogoActivo?.nombre || "Seleccione catalogo"}</div></label>
          <label className="field"><span>Comprador</span><select value={comprador} onChange={(e) => setComprador(e.target.value)} disabled={lockComprador}><option value="">Seleccione comprador</option>{buyerList.map((c) => <option key={c}>{c}</option>)}</select></label>
          <input ref={skuMasterFileInputRef} type="file" accept=".xlsx,.xls" hidden onChange={onLoadSkuMaster}/>
          {canEditPromos && <button type="button" className="upload-box upload-trigger" onClick={() => skuMasterFileInputRef.current?.click()} disabled={!compradorSeleccionado}><Upload size={18}/><div><strong>Archivo comprador ERP</strong><span>{archivoComprador ? `${skuMasterTotal} SKU cargados desde ${archivoComprador.nombre}` : "Cargar Excel con SKU, VPN, descripcion y precio"}</span></div></button>}
          <label className="field"><span>{"Tipo de promoci\u00f3n"}</span><select value={tipoActivo} onChange={(e) => changeTipoActivo(e.target.value)} disabled={!compradorSeleccionado}>{todosTipos.map((t) => <option key={t}>{t}</option>)}</select></label>
          <input ref={promoTemplateFileInputRef} type="file" accept=".xlsx,.xls" hidden onChange={loadPromoTemplate}/>
          <div className="button-row promo-action-row">
            {canEditPromos && <Button onClick={() => addRow()} disabled={!compradorSeleccionado}><Plus size={16}/> Fila</Button>}
            {canEditPromos && <Button variant="outline" onClick={pasteSkus} disabled={!compradorSeleccionado}><ClipboardPaste size={16}/> {tipoActivo === "Umbral" || tipoActivo === "Combo" || BUY_X_GET_X_PROMO_TYPES.includes(tipoActivo) ? "Pegar tabla" : "Pegar SKU"}</Button>}
            {canEditPromos && <Button variant="outline" onClick={() => promoTemplateFileInputRef.current?.click()} disabled={!compradorSeleccionado}><FileSpreadsheet size={16}/> Plantilla</Button>}
          </div>
          {buyerAvancePanel}
          {activityCommentPanel}
          {canEditPromos && !activityContext && <div className="segment-panel"><div className="segment-panel-head"><div><strong>{"P\u00fablico objetivo"}</strong><span>{segmentMode && segmentText ? segmentText : "Todos"}</span></div><Button variant={segmentMode ? "default" : "outline"} onClick={toggleSegmentMode} disabled={!compradorSeleccionado || !segmentOptions.length}><Users size={16}/> Segmento</Button></div>{segmentMode && <div className="segment-chip-list">{segmentOptions.map((item) => <button key={item.segmento_id} type="button" className={selectedSegments.includes(item.segmento_id) ? "segment-chip selected" : "segment-chip"} onClick={() => toggleSegment(item.segmento_id)}>{item.segmento_id} {"\u00b7"} {item.segmento}</button>)}<Button variant="outline" onClick={applySegmentsToGrid} disabled={!filteredRows.length || (segmentMode && !segmentText)}><Users size={16}/> Aplicar a grilla</Button></div>}</div>}
          {canEditPromos && <div className="bulk-box"><p><AlertTriangle size={16}/> {bulkInstructions}</p><label className="field"><span>Pegar valores en</span><select value={bulkColumn} onChange={(e) => changeBulkColumn(e.target.value)} disabled={!compradorSeleccionado}><option value="sku">SKU nuevos</option>{tipoActivo === "Umbral" && <option value={BULK_COLUMN_UMBRAL_TABLE}>Tabla de umbrales</option>}{tipoActivo === "Combo" && <option value={BULK_COLUMN_COMBO_TABLE}>Tabla de combos</option>}{BUY_X_GET_X_PROMO_TYPES.includes(tipoActivo) && <option value={BULK_COLUMN_BUY_X_GET_X_TABLE}>Tabla compra X lleva X</option>}<option value="precioAhora">Precio ahora c/IVA</option><option value="descuento">Descuento</option><option value="cantidadMinima">{"Cantidad m\u00ednima"}</option><option value="comentario">Comentario adicional</option></select></label><textarea placeholder={bulkPlaceholder} value={bulkText} onChange={(e) => setBulkText(e.target.value)} disabled={!compradorSeleccionado} /><div className="button-row"><Button variant="outline" onClick={buildBulkPreview} disabled={!compradorSeleccionado}><Search size={16}/> Vista previa</Button><Button variant="outline" onClick={applyBulkPaste} disabled={!compradorSeleccionado || !canApplyBulkPreview}><ClipboardPaste size={16}/> Aplicar</Button></div>{bulkPreview.length > 0 && <div className="preview-list">{bulkPreview.map((item) => <div key={`${item.index}-${item.sku}`} className={item.warning ? "warning" : ""}><strong>{item.index}. {item.sku}</strong><span>{item.descripcion}</span><p>{item.campo}: <s>{String(item.valorActual)}</s> -&gt; <b>{String(item.valorNuevo)}</b></p></div>)}</div>}</div>}
        </CardContent>
      </Card>
      {comboBuilder}
      <Card className="grid-card">
        <CardContent>
        <div className="toolbar promo-grid-toolbar"><div><h2>{esCompleja ? "Promociones complejas" : "Promociones simples"}</h2><p>{esCompleja ? "Cada paquete se configura hacia abajo: principal y recompensas." : "Cada SKU ocupa una fila independiente."}</p></div><div className="toolbar-actions"><div className="search"><Search size={16}/><input placeholder={"Buscar SKU o descripci\u00f3n"} value={search} onChange={(e) => setSearch(e.target.value)} /></div>{canEditPromos && <Button variant="outline" onClick={clearPromosWorkspace}><X size={16}/> Limpiar</Button>}{canEditPromos && <Button variant="outline" onClick={() => addRow()} disabled={!compradorSeleccionado}><Plus size={16}/> {"Agregar l\u00ednea"}</Button>}{canSyncSupabase && <Button onClick={onSaveDrive} disabled={!driveReady || isSyncing}><Save size={16}/> {saveDriveLabel}</Button>}</div></div>
          {!esCompleja && <div className="promo-integrity-row"><p className={classNames("promo-integrity-note", missingBenefitCount ? "warning" : "ok")}>{benefitStatusText}</p></div>}
          <div className="table-wrap"><table><thead><tr>{canEditPromos && <th className="sticky-action-col"></th>}{columnas.map((col) => <th key={col} className={col === "sku" ? "sticky-sku-col" : ""}>{labels[col]}</th>)}</tr></thead><tbody>{filteredRows.map((row) => { const warning = hasDiscountWarning(row); return <tr key={row.id} className={getPromoRowClass(row)}>{canEditPromos && <td className="sticky-action-col"><button className="icon-btn" onClick={() => deleteRow(row.id)}><Trash2 size={15}/></button></td>}{columnas.map((col) => <td key={col} className={col === "sku" ? "sticky-sku-col" : ""}>{renderCell(row, col, updateRow, warning, segmentOptions)}</td>)}</tr>; })}</tbody></table></div>
        </CardContent>
      </Card>
    </div>
  </div>;
}

function hasDiscountWarning(row) {
  const before = Number(row.precioAntes); const now = Number(row.precioAhora);
  if (!before || Number.isNaN(before) || Number.isNaN(now) || row.descuento === "" || now === "") return false;
  const expected = Math.round((1 - now / before) * 100); const typed = Number(String(row.descuento).replace("%", ""));
  if (Number.isNaN(typed)) return false; return Math.abs(expected - typed) > 1;
}
