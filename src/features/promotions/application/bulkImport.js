import {
  AIRES_PROMO_TYPE,
  BULK_COLUMN_AIRES_TABLE,
  BULK_COLUMN_BUY_X_GET_X_TABLE,
  BULK_COLUMN_COMBO_TABLE,
  BULK_COLUMN_MEGAPACK_TABLE,
  BULK_COLUMN_UMBRAL_TABLE,
  BUY_X_GET_X_PROMO_TYPE,
  BUY_X_GET_X_PROMO_TYPES,
  BUY_X_GET_X_V2_PROMO_TYPE,
  MAX_UMBRAL_LEVELS,
  MEGAPACK_PROMO_TYPE,
} from "../../../constants";
import { normalizeValue } from "../../../utils/common";
import {
  hasPromoFieldValue,
  isComboRewardRole,
  normalizeCanal,
} from "../../../utils/promoHelpers";
import { buildAiresBulkPreviewFromRows, parseAiresTable } from "./airesCombo";

export function parseClipboardRows(text) {
  const rawText = String(text || "");
  const normalizedText = rawText.replaceAll(String.fromCharCode(13), "");
  const lines = normalizedText.split(String.fromCharCode(10));
  return lines.map((line) => line.split(String.fromCharCode(9)).map(normalizeValue)).filter((cells) => cells.some(Boolean));
}

export function parseClipboardValues(text) {
  return parseClipboardRows(text).map((cells) => cells[0]).filter(isNumericSku);
}

// Use the same parsers as preview generation so reward columns are never omitted.
export function getBulkSkuCodes(text, column, promoType) {
  if (column === BULK_COLUMN_AIRES_TABLE) {
    const skus = parseAiresTable(parseClipboardRows(text)).flatMap((group) => group.items.map((item) => item.sku)).filter(isNumericSku);
    return [...new Set(skus)];
  }
  const builders = {
    [BULK_COLUMN_UMBRAL_TABLE]: buildUmbralBulkPreview,
    [BULK_COLUMN_COMBO_TABLE]: buildComboBulkPreview,
    [BULK_COLUMN_BUY_X_GET_X_TABLE]: buildBuyXGetXBulkPreview,
    [BULK_COLUMN_MEGAPACK_TABLE]: buildMegapackBulkPreview,
  };
  const items = builders[column]?.(text, {}, promoType);
  const skus = items
    ? items.flatMap((item) => [item.principalSku || item.sku, ...(item.rewards || []).map((reward) => reward.sku)]).filter(isNumericSku)
    : parseClipboardValues(text);
  return [...new Set(skus)];
}

export function isBulkTableColumn(column) {
  return [
    BULK_COLUMN_UMBRAL_TABLE,
    BULK_COLUMN_COMBO_TABLE,
    BULK_COLUMN_BUY_X_GET_X_TABLE,
    BULK_COLUMN_MEGAPACK_TABLE,
    BULK_COLUMN_AIRES_TABLE,
  ].includes(column);
}

export function getDefaultBulkColumnForPromoType(promoType, { includeMegapack = true } = {}) {
  if (promoType === "Umbral") return BULK_COLUMN_UMBRAL_TABLE;
  if (promoType === "Combo") return BULK_COLUMN_COMBO_TABLE;
  if (promoType === AIRES_PROMO_TYPE) return BULK_COLUMN_AIRES_TABLE;
  if (BUY_X_GET_X_PROMO_TYPES.includes(promoType)) return BULK_COLUMN_BUY_X_GET_X_TABLE;
  if (includeMegapack && promoType === MEGAPACK_PROMO_TYPE) return BULK_COLUMN_MEGAPACK_TABLE;
  if (promoType === "Precio fijo") return "precioAhora";
  if (promoType === "Descuento") return "descuento";
  return "";
}

export function getBulkPasteContent({ bulkColumn, tipoActivo, labels = {}, isSimpleRequiredValuePaste = false } = {}) {
  const isUmbralTablePaste = bulkColumn === BULK_COLUMN_UMBRAL_TABLE;
  const isComboTablePaste = bulkColumn === BULK_COLUMN_COMBO_TABLE;
  const isBuyXGetXTablePaste = bulkColumn === BULK_COLUMN_BUY_X_GET_X_TABLE;
  const isMegapackTablePaste = bulkColumn === BULK_COLUMN_MEGAPACK_TABLE;
  if (bulkColumn === BULK_COLUMN_AIRES_TABLE) {
    return {
      bulkInstructions: "Pegue una tabla con columnas: pagina, combo, SKU, descripcion, ahora c/iva, comentario. Cada aire es un número de combo con todas sus piezas (condensador, evaporador…); la descripción y el precio pueden venir en una sola fila. El precio se reparte por costo (o por precio regular si falta costo).",
      bulkPlaceholder: "pagina\tcombo\tSKU\tdescripcion\tahora c/iva\tcomentario\n\t1\t157638037\tMINI SPLIT 12000BTU 220V SEER 18 HISENSE\t12999\t\n\t1\t157638070\t\t\t",
    };
  }
  const bulkInstructions = isMegapackTablePaste
    ? "Pegue una tabla con columnas: Sku principal, Cant, Sku2, Cant, Sku3, Cant, Sku4, Cant, Sku5, Cant. Se crea una fila principal y las regalías al 100%."
    : isBuyXGetXTablePaste
      ? (tipoActivo === BUY_X_GET_X_V2_PROMO_TYPE
        ? "Pegue una tabla con columnas: SKU, variante, ahora c IVA y descuento. V2 conserva una sola fila por SKU y registra las cantidades en comentario."
        : "Pegue una tabla con columnas: SKU, variante, ahora c IVA y descuento. La variante AxB crea principal con la cantidad menor y regalia con la diferencia.")
      : isComboTablePaste
        ? "Pegue una tabla con columnas: Tipo, Sku, Ahora con iva y descuento. Se crea un combo nuevo cuando una fila Principal viene despues de una Regalia. Columna Cantidad opcional (entero mayor a 0); si viene vacia se crea en 1."
        : isUmbralTablePaste
          ? `Pegue una tabla con primera columna SKU y hasta ${MAX_UMBRAL_LEVELS} umbrales. Use % para descuento o numero para precio fijo.`
          : isSimpleRequiredValuePaste
            ? `Pegue dos columnas desde Excel: SKU y ${labels[bulkColumn]}. Si el SKU no existe, se crea; si ya existe, se actualiza.`
            : bulkColumn === "sku"
              ? "Pegue una columna de SKU para agregar filas nuevas."
              : `Pegue dos columnas desde Excel: SKU y ${labels[bulkColumn]}.`;
  const bulkPlaceholder = isMegapackTablePaste
    ? "Sku principal\tCant\tSku2\tCant\tSku3\tCant\tSku4\tCant\tSku5\tCant\tComentario\nSKU_X\t25\tSKU_X\t5\tSKU_Y\t5\tSKU_Z\t5\tSKU_W\t2\tMegapack ejemplo"
    : isBuyXGetXTablePaste
      ? "sku\tvariante\tahora c IVA\tdescuento\n147072842\t4x3\t982\t\n139760160\t5x3\t543\t\n10081749\t5x4\t\t15%\n10081802\t15x12\t\t20%"
      : isComboTablePaste
        ? "Tipo\tSku\tAhora con iva\tdescuento\nPrincipal\t152737466\t200\t\nRegalia\t152736551\t\t100%\nPrincipal\t156890097\t789\t\nRegalia\t156890396\t\t100%"
        : isUmbralTablePaste
          ? "Sku\t1 a mas\t20 a mas\t30 a mas\t50 a mas\n103163662\t5%\t10%\t15%\t25%"
          : bulkColumn === "sku"
            ? "Pegue aqui una columna de SKU copiada desde Excel"
            : `Pegue aqui dos columnas: SKU y ${labels[bulkColumn]}`;
  return { bulkInstructions, bulkPlaceholder };
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
  if (promoType === AIRES_PROMO_TYPE) return { sheetName: "AIRES", bulkColumn: BULK_COLUMN_AIRES_TABLE, mode: "raw" };
  if (promoType === "Umbral") return { sheetName: "UMBRAL", bulkColumn: BULK_COLUMN_UMBRAL_TABLE, mode: "raw" };
  if (BUY_X_GET_X_PROMO_TYPES.includes(promoType)) return { sheetName: "COMPRA_X_LLEVA_X", bulkColumn: BULK_COLUMN_BUY_X_GET_X_TABLE, mode: "buyxgetx" };
  if (promoType === MEGAPACK_PROMO_TYPE) return { sheetName: "MEGAPACK", bulkColumn: BULK_COLUMN_MEGAPACK_TABLE, mode: "megapack" };
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
  const pageIndex = findTemplateColumn(header, ["pagina", "página", "numero_pagina", "num_pagina", "pag"], -1);
  if (config.mode === "simple") {
    const valueIndex = findTemplateColumn(header, config.valueAliases, 1);
    const priceIndex = findTemplateColumn(header, ["ahora c/iva", "ahora con iva", "precio ahora", "precio_ahora"], -1);
    const discountIndex = findTemplateColumn(header, ["descuento", "desc"], -1);
    const optionalIndex = config.bulkColumn === "precioAhora" ? discountIndex : priceIndex;
    const commentIndex = findTemplateColumn(header, ["comentario", "comentarios", "comment"], -1);
    const valueHeader = config.bulkColumn === "precioAhora" ? "Ahora c/iva" : "descuento";
    const optionalHeader = config.bulkColumn === "precioAhora" ? "descuento" : "Ahora c/iva";
    return [["sku", valueHeader, optionalHeader, "Comentario", "Página"], ...dataRows.map((row) => [row[skuIndex] || "", row[valueIndex] || "", optionalIndex >= 0 && optionalIndex !== valueIndex ? row[optionalIndex] || "" : "", commentIndex >= 0 ? row[commentIndex] || "" : "", pageIndex >= 0 ? row[pageIndex] || "" : ""])];
  }
  if (config.mode === "combo") {
    const roleIndex = findTemplateColumn(header, ["tipo", "rol"], 0);
    const priceIndex = findTemplateColumn(header, ["ahora c/iva", "ahora con iva", "precio ahora", "precio_ahora"], 2);
    const discountIndex = findTemplateColumn(header, ["descuento", "desc"], -1);
    const commentIndex = findTemplateColumn(header, ["comentario", "comentarios", "comment"], -1);
    const quantityIndex = findTemplateColumn(header, ["cantidad", "cant", "cantidad minima", "cantidad_minima", "qty"], -1);
    return [["Tipo", "Sku", "Ahora con iva", "descuento", "Comentario", "Página", "Cantidad"], ...dataRows.map((row) => [row[roleIndex] || "", row[skuIndex] || "", row[priceIndex] || "", discountIndex >= 0 ? row[discountIndex] || "" : "", commentIndex >= 0 ? row[commentIndex] || "" : "", pageIndex >= 0 ? row[pageIndex] || "" : "", quantityIndex >= 0 ? row[quantityIndex] || "" : ""])];
  }
  if (config.mode === "buyxgetx") {
    const variantIndex = findTemplateColumn(header, ["variante", "variant", "compra_lleva", "compra x lleva"], 1);
    const priceIndex = findTemplateColumn(header, ["ahora c/iva", "ahora c iva", "ahora con iva", "precio ahora", "precio_ahora"], 2);
    const discountIndex = findTemplateColumn(header, ["descuento", "desc"], 3);
    return [["sku", "variante", "ahora c IVA", "descuento", "Página"], ...dataRows.map((row) => [row[skuIndex] || "", row[variantIndex] || "", row[priceIndex] || "", row[discountIndex] || "", pageIndex >= 0 ? row[pageIndex] || "" : ""])];
  }
  if (config.mode === "megapack") {
    const principalSkuIndex = findTemplateColumn(header, ["sku principal", "sku_principal", "principal"], 0);
    const principalQtyIndex = findTemplateColumn(header, ["cant principal", "cantidad principal", "cantidad compra", "cant"], 1);
    const commentIndex = findTemplateColumn(header, ["comentario", "comentarios", "comment"], header.length - 1);
    return [["Sku principal", "Cant", "Sku2", "Cant", "Sku3", "Cant", "Sku4", "Cant", "Sku5", "Cant", "Comentario", "Página"], ...dataRows.map((row) => [
      row[principalSkuIndex] || "",
      row[principalQtyIndex] || "",
      row[2] || "",
      row[3] || "",
      row[4] || "",
      row[5] || "",
      row[6] || "",
      row[7] || "",
      row[8] || "",
      row[9] || "",
      commentIndex >= 0 ? row[commentIndex] || "" : "",
      pageIndex >= 0 ? row[pageIndex] || "" : "",
    ])];
  }
  return nonEmptyRows;
}

export async function readPromoTemplateFile(file, promoType) {
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

export function isNumericSku(value) {
  return /^\d+$/.test(normalizeValue(value));
}

export function normalizePastedNumber(value) {
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

function normalizeUmbralBenefitType(value) {
  const type = normalizeCanal(value);
  if (["descuento", "desc", "porcentaje", "porcentual"].includes(type)) return "descuento";
  if (["precio", "preciofijo", "fijo", "montofijo", "monto"].includes(type)) return "precio";
  return "";
}

function parseUmbralBenefit(value, benefitType = "") {
  const raw = normalizeValue(value);
  if (!raw) return { precioAhora: "", descuento: "", display: "" };
  if (raw.includes("%") || benefitType === "descuento") {
    const descuento = normalizeDiscountValue(raw);
    return { precioAhora: "", descuento, display: `Descuento ${descuento}` };
  }
  const price = normalizePastedNumber(raw);
  return { precioAhora: price, descuento: "", display: `Precio fijo ${price}` };
}

function findClipboardColumn(headerRow, aliases, fallbackIndex = -1) {
  const normalizedAliases = aliases.map(normalizeCanal);
  const index = (headerRow || []).findIndex((header) => normalizedAliases.includes(normalizeCanal(header)));
  return index >= 0 ? index : fallbackIndex;
}

export function buildUmbralBulkPreview(text, skuMaster = {}) {
  const pastedRows = parseClipboardRows(text);
  if (!pastedRows.length) return [];
  const headerRow = pastedRows[0] || [];
  const skuIndex = findClipboardColumn(headerRow, ["sku", "codigo", "codigosku", "codsku"], -1);
  const hasSkuHeader = skuIndex >= 0 || ["sku", "codigo", "codigosku", "codsku"].includes(normalizeCanal(headerRow[0]));
  const effectiveSkuIndex = skuIndex >= 0 ? skuIndex : 0;
  const pageIndex = findClipboardColumn(headerRow, ["pagina", "página", "numero_pagina", "num_pagina", "pag"], -1);
  const tipoIndex = findClipboardColumn(headerRow, ["tipo", "beneficio", "tipo beneficio", "tipo_beneficio"], -1);
  const allThresholds = headerRow
    .map((value, index) => ({ ...parseUmbralHeader(value), cellIndex: index }))
    .filter((item) => item.cellIndex !== effectiveSkuIndex && item.cellIndex !== pageIndex && item.cellIndex !== tipoIndex && item.label);
  const thresholds = allThresholds.slice(0, MAX_UMBRAL_LEVELS);
  const preview = [];
  if (!hasSkuHeader) preview.push({ index: "Aviso", sku: "Encabezado SKU", descripcion: "La primera columna debe ser SKU o Codigo.", campo: "Formato", valorActual: "", valorNuevo: "Revise la tabla pegada", warning: true, canApply: false });
  if (allThresholds.length > MAX_UMBRAL_LEVELS) preview.push({ index: "Aviso", sku: "Limite de umbrales", descripcion: `Se ignoraran ${allThresholds.length - MAX_UMBRAL_LEVELS} columnas porque el maximo es ${MAX_UMBRAL_LEVELS}.`, campo: "Regla", valorActual: "", valorNuevo: `${MAX_UMBRAL_LEVELS} umbrales maximo`, warning: true, canApply: false });
  if (!thresholds.length) {
    preview.push({ index: "Aviso", sku: "Sin umbrales", descripcion: "Incluya encabezados como 1 a mas, 20 a mas o 30 a mas.", campo: "Formato", valorActual: "", valorNuevo: "Sin filas para aplicar", warning: true, canApply: false });
    return preview;
  }
  pastedRows.slice(1).forEach((cells) => {
    const sku = normalizeValue(cells[effectiveSkuIndex]);
    const numPagina = pageIndex >= 0 ? normalizeValue(cells[pageIndex]) : "";
    const benefitType = tipoIndex >= 0 ? normalizeUmbralBenefitType(cells[tipoIndex]) : "";
    thresholds.forEach((threshold) => {
      const benefit = parseUmbralBenefit(cells[threshold.cellIndex], benefitType);
      if (!sku && !benefit.display) return;
      if (!benefit.display) return;
      const master = skuMaster[sku] || {};
      const invalidThreshold = threshold.cantidadMinima === "";
      const canApply = Boolean(sku && !invalidThreshold);
      const descripcion = canApply ? `${master.descripcion || "SKU no encontrado en maestro en la BD"} | ${threshold.label}` : invalidThreshold ? `El encabezado "${threshold.label}" no tiene cantidad minima.` : "Fila sin SKU.";
      preview.push(blockDiscountOverLimit({ index: preview.length + 1, sku: sku || "SKU vacio", descripcion, campo: `Umbral ${threshold.label}`, valorActual: "", valorNuevo: benefit.display, thresholdLabel: threshold.label, cantidadMinima: threshold.cantidadMinima, precioAhora: benefit.precioAhora, descuento: benefit.descuento, numPagina, numero_pagina: numPagina, warning: !canApply || !master.descripcion, canApply }, benefit.descuento));
    });
  });
  if (!preview.some((item) => item.canApply)) preview.push({ index: "Aviso", sku: "Sin beneficios", descripcion: "Pegue valores debajo de cada umbral, por ejemplo 10% o 250.", campo: "Formato", valorActual: "", valorNuevo: "Sin filas para aplicar", warning: true, canApply: false });
  return preview;
}

function normalizeComboRole(value) {
  const normalized = normalizeCanal(value);
  if (normalized.includes("principal")) return "principal";
  if (normalized.includes("regalia") || normalized.includes("recompensa") || normalized.includes("reward")) return "regalia";
  return "";
}

// Normaliza descuentos capturados por compradores o leidos de Excel:
// "30", "30%", "30 %", "-30", "-30%", "30% desc", "12,5" -> "30%" / "12.5%".
// Un valor entre 0 y 1 sin "%" (ej. 0.3) viene de una celda Excel con formato
// porcentaje leida como fraccion, porque los compradores no capturan decimales: se convierte a 30%.
export function normalizeDiscountValue(value) {
  const text = normalizeValue(value);
  if (!text) return "";
  const match = text.replace(/\s+/g, "").match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return text;
  let percent = Math.abs(Number(match[0].replace(",", ".")));
  if (!Number.isFinite(percent)) return text;
  if (!text.includes("%") && percent > 0 && percent < 1) percent *= 100;
  const rounded = Math.round((percent + Number.EPSILON) * 100) / 100;
  return `${rounded}%`;
}

export const MAX_DISCOUNT_PERCENT = 100;

// true cuando el descuento (ya normalizado o no) supera el 100%.
export function isDiscountOverLimit(value) {
  const normalized = normalizeDiscountValue(value);
  const percent = Number(String(normalized).replace("%", ""));
  return Number.isFinite(percent) && percent > MAX_DISCOUNT_PERCENT;
}

// Marca una fila de vista previa como bloqueante si su descuento supera el 100%.
export function blockDiscountOverLimit(item, descuento) {
  if (!isDiscountOverLimit(descuento)) return item;
  return {
    ...item,
    descripcion: `Descuento ${normalizeDiscountValue(descuento)} mayor a ${MAX_DISCOUNT_PERCENT}%. ${item.descripcion || ""}`.trim(),
    warning: true,
    canApply: false,
    blocking: true,
    blockReason: "descuento",
  };
}

// Precio fijo: true cuando "Ahora c/iva" viene vacio, no es numerico o no es mayor a 0.
export function isMissingFixedPrice(value) {
  const text = normalizeValue(value);
  if (!text) return true;
  const price = Number(normalizePastedNumber(text));
  return !Number.isFinite(price) || price <= 0;
}

// Marca una fila de Precio fijo como bloqueante si no trae un "Ahora c/iva" valido.
export function blockMissingFixedPrice(item, precioAhora) {
  if (!isMissingFixedPrice(precioAhora)) return item;
  const raw = normalizeValue(precioAhora);
  return {
    ...item,
    descripcion: `${raw ? `Ahora c/iva invalido (${raw})` : "Falta Ahora c/iva"} para Precio fijo. ${item.descripcion || ""}`.trim(),
    warning: true,
    canApply: false,
    blocking: true,
    blockReason: "precio",
  };
}

// Cantidad de combo: vacia = 1 (compatibilidad con plantillas viejas); debe ser entero mayor a 0.
export function parseComboQuantity(value) {
  const text = normalizeValue(value);
  if (!text) return { quantity: 1, valid: true };
  const quantity = Number(normalizePastedNumber(text));
  return Number.isInteger(quantity) && quantity > 0 ? { quantity, valid: true } : { quantity: 0, valid: false };
}

// Marca una fila de combo como bloqueante si la cantidad no es un entero mayor a 0.
export function blockInvalidComboQuantity(item, rawQuantity) {
  if (parseComboQuantity(rawQuantity).valid) return item;
  return {
    ...item,
    descripcion: `Cantidad invalida (${normalizeValue(rawQuantity)}): use un entero mayor a 0. ${item.descripcion || ""}`.trim(),
    warning: true,
    canApply: false,
    blocking: true,
    blockReason: "cantidad",
  };
}

// Si alguna fila es bloqueante, agrega un aviso al inicio y la carga completa queda bloqueada.
export function withDiscountLimitNotice(preview = []) {
  const rows = preview.filter((item) => item.blocking && item.index !== "Aviso");
  if (!rows.length) return preview;
  const discountCount = rows.filter((item) => item.blockReason === "descuento").length;
  const priceCount = rows.filter((item) => item.blockReason === "precio").length;
  const quantityCount = rows.filter((item) => item.blockReason === "cantidad").length;
  const airesCount = new Set(rows.filter((item) => item.blockReason === "aires").map((item) => item.scenario)).size;
  const reasons = [
    discountCount ? `${discountCount} fila(s) con descuento mayor a ${MAX_DISCOUNT_PERCENT}%` : "",
    priceCount ? `${priceCount} fila(s) de Precio fijo sin Ahora c/iva valido` : "",
    quantityCount ? `${quantityCount} fila(s) de combo con cantidad invalida` : "",
    airesCount ? `${airesCount} aire(s) con errores (vea el detalle de cada pieza)` : "",
  ].filter(Boolean).join(", ");
  return [
    { index: "Aviso", sku: "Carga bloqueada", descripcion: `${reasons}. Corrija el archivo y vuelva a cargar.`, campo: discountCount ? "Descuento" : priceCount ? "Ahora c/iva" : quantityCount ? "Cantidad" : "Aire", valorActual: "", valorNuevo: "Sin filas aplicadas", warning: true, canApply: false, blocking: true },
    ...preview,
  ];
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

export function buildComboBulkPreview(text, skuMaster = {}) {
  const pastedRows = parseClipboardRows(text);
  if (pastedRows.length < 2) return [];
  const header = pastedRows[0] || [];
  const scenarioIndex = (header || []).findIndex((column) => ["escenario", "escenarios"].includes(normalizeCanal(column)));
  const hasScenarioColumn = scenarioIndex >= 0;
  const pageIndex = findClipboardColumn(header, ["pagina", "página", "numero_pagina", "num_pagina", "pag"], -1);
  const roleIndex = findClipboardColumn(header, ["tipo", "rol"], hasScenarioColumn ? 1 : pageIndex === 0 ? 1 : 0);
  const skuIndex = findClipboardColumn(header, ["sku", "codigo", "codigo_sku"], hasScenarioColumn ? 2 : pageIndex === 0 ? 2 : 1);
  const priceIndex = findClipboardColumn(header, ["ahora con iva", "ahora c/iva", "precio ahora", "precio_ahora"], hasScenarioColumn ? 3 : 2);
  const discountIndex = findClipboardColumn(header, ["descuento", "desc"], hasScenarioColumn ? 4 : 3);
  const commentIndex = findClipboardColumn(header, ["comentario", "comentarios", "comment"], -1);
  const quantityIndex = findClipboardColumn(header, ["cantidad", "cant", "cantidad minima", "cantidad_minima", "qty"], -1);
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
    const numPagina = pageIndex >= 0 ? normalizeValue(cells[pageIndex]) : "";
    const rawQuantity = quantityIndex >= 0 ? normalizeValue(cells[quantityIndex]) : "";
    if (!sku && !role && !rawPrice && !rawDiscount && !comentario && !rawQuantity) return;
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
    const benefit = hasPromoFieldValue(precioAhora) ? `Precio fijo ${precioAhora}` : hasPromoFieldValue(descuento) ? `Descuento ${descuento}` : "Sin beneficio";
    preview.push(blockInvalidComboQuantity(blockDiscountOverLimit({ index: preview.length + 1, scenario: currentScenario, sku: sku || "SKU vacio", descripcion: `${currentScenario} | ${role || "Rol no reconocido"} | ${master.descripcion || "SKU no encontrado en maestro en la BD"}`, campo: role === "regalia" ? "Regalía" : role === "principal" ? "Principal" : "Rol", valorActual: "", valorNuevo: benefit, role, cantidadMinima: parseComboQuantity(rawQuantity).quantity || 1, precioAhora, descuento, comentario, numPagina, numero_pagina: numPagina, warning, canApply: Boolean(role && sku) }, descuento), rawQuantity));
    previousRole = role || previousRole;
  });
  if (!preview.some((item) => item.canApply)) preview.push({ index: "Aviso", sku: "Sin combos", descripcion: "Pegue columnas: Tipo, Sku, Ahora con iva y descuento.", campo: "Formato", valorActual: "", valorNuevo: "Sin filas para aplicar", warning: true, canApply: false });
  return preview;
}

// AIRES: misma lectura que la plantilla; costWeightsByCombo viene de Supabase (pesos, sin costos).
export function buildAiresBulkPreview(text, skuMaster = {}, { costWeightsByCombo = {}, existingAires = {} } = {}) {
  return buildAiresBulkPreviewFromRows(parseClipboardRows(text), { skuMaster, costWeightsByCombo, existingAires });
}

export function buildBuyXGetXBulkPreview(text, skuMaster = {}, promoType = BUY_X_GET_X_PROMO_TYPE) {
  const pastedRows = parseClipboardRows(text);
  if (pastedRows.length < 2) return [];
  const header = pastedRows[0] || [];
  const pageIndex = findClipboardColumn(header, ["pagina", "página", "numero_pagina", "num_pagina", "pag"], -1);
  const skuIndex = findClipboardColumn(header, ["sku", "codigo", "codigo_sku"], pageIndex === 0 ? 1 : 0);
  const variantIndex = findClipboardColumn(header, ["variante", "variant", "compra_lleva", "compra x lleva"], pageIndex === 0 ? 2 : 1);
  const priceIndex = findClipboardColumn(header, ["ahora c iva", "ahora c/iva", "ahora con iva", "precio ahora", "precio_ahora"], pageIndex === 0 ? 3 : 2);
  const discountIndex = findClipboardColumn(header, ["descuento", "desc"], pageIndex === 0 ? 4 : 3);
  const preview = [];
  pastedRows.slice(1).forEach((cells) => {
    const sku = normalizeValue(cells[skuIndex]);
    const variantText = normalizeValue(cells[variantIndex]);
    const parsedVariant = parseBuyXGetXVariant(variantText);
    const rawPrice = normalizeValue(cells[priceIndex]);
    const rawDiscount = normalizeValue(cells[discountIndex]);
    const numPagina = pageIndex >= 0 ? normalizeValue(cells[pageIndex]) : "";
    if (!sku && !variantText && !rawPrice && !rawDiscount) return;
    const precioAhora = rawPrice ? normalizePastedNumber(rawPrice) : "";
    const descuento = rawDiscount ? normalizeDiscountValue(rawDiscount) : "";
    const master = skuMaster[sku] || {};
    const warning = !sku || !parsedVariant || !master.descripcion;
    const variantLabel = parsedVariant ? parsedVariant.variant : variantText || "Variante invalida";
    const benefit = hasPromoFieldValue(precioAhora) ? `Precio fijo ${precioAhora}` : hasPromoFieldValue(descuento) ? `Descuento ${descuento}` : "Sin precio/descuento principal";
    preview.push(blockDiscountOverLimit({ index: preview.length + 1, sku: sku || "SKU vacio", descripcion: `${variantLabel} | ${master.descripcion || "SKU no encontrado en maestro en la BD"}`, campo: "Variante", valorActual: "", valorNuevo: benefit, variant: variantLabel, principalQty: parsedVariant?.principalQty || 0, rewardQty: parsedVariant?.rewardQty || 0, precioAhora, descuento, numPagina, numero_pagina: numPagina, warning, canApply: Boolean(sku && parsedVariant) }, descuento));
  });
  if (!preview.some((item) => item.canApply)) preview.push({ index: "Aviso", sku: "Sin variantes", descripcion: `Pegue columnas: SKU, variante, ahora c IVA y descuento para ${promoType}.`, campo: "Formato", valorActual: "", valorNuevo: "Sin filas para aplicar", warning: true, canApply: false });
  return preview;
}

function parseMegapackQuantity(value) {
  const parsed = Number(normalizePastedNumber(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function buildMegapackBulkPreview(text, skuMaster = {}) {
  const pastedRows = parseClipboardRows(text);
  if (pastedRows.length < 2) return [];
  const header = pastedRows[0] || [];
  const pageIndex = findClipboardColumn(header, ["pagina", "página", "numero_pagina", "num_pagina", "pag"], -1);
  const principalSkuIndex = findClipboardColumn(header, ["sku principal", "sku_principal", "principal"], pageIndex === 0 ? 1 : 0);
  const principalQtyIndex = findClipboardColumn(header, ["cant principal", "cantidad principal", "cantidad compra", "cant"], principalSkuIndex + 1);
  const commentIndex = findClipboardColumn(header, ["comentario", "comentarios", "comment"], -1);
  const preview = [];
  pastedRows.slice(1).forEach((cells) => {
    const principalSku = normalizeValue(cells[principalSkuIndex]);
    const principalQty = parseMegapackQuantity(cells[principalQtyIndex]);
    const numPagina = pageIndex >= 0 ? normalizeValue(cells[pageIndex]) : "";
    const comentario = commentIndex >= 0 ? normalizeValue(cells[commentIndex]) : normalizeValue(cells[10]);
    const startRewardIndex = principalQtyIndex + 1;
    const rewards = [startRewardIndex, startRewardIndex + 2, startRewardIndex + 4, startRewardIndex + 6]
      .map((skuIdx) => ({
        sku: normalizeValue(cells[skuIdx]),
        quantity: parseMegapackQuantity(cells[skuIdx + 1]),
      }))
      .filter((item) => item.sku || item.quantity);
    if (!principalSku && !principalQty && !rewards.length && !comentario) return;
    const principalMaster = skuMaster[principalSku] || {};
    const validRewards = rewards.filter((item) => item.sku && item.quantity > 0);
    const missingRewardMaster = validRewards.some((item) => !skuMaster[item.sku]?.descripcion);
    const rewardSummary = validRewards.map((item) => `${item.quantity} x ${item.sku}`).join(" | ");
    const warning = !principalSku || !principalQty || !validRewards.length || !principalMaster.descripcion || missingRewardMaster;
    preview.push({
      index: preview.length + 1,
      sku: principalSku || "SKU principal vacio",
      descripcion: `${principalMaster.descripcion || "SKU principal no encontrado en maestro en la BD"} | Regalías: ${rewardSummary || "sin regalías válidas"}`,
      campo: MEGAPACK_PROMO_TYPE,
      valorActual: "",
      valorNuevo: `Compra ${principalQty || "?"} | Obsequia ${rewardSummary || "?"}`,
      principalSku,
      principalQty,
      rewards: validRewards,
      comentario,
      numPagina,
      numero_pagina: numPagina,
      warning,
      canApply: Boolean(principalSku && principalQty && validRewards.length),
    });
  });
  if (!preview.some((item) => item.canApply)) preview.push({ index: "Aviso", sku: "Sin megapack", descripcion: "Pegue columnas: Sku principal, Cant, Sku2, Cant, Sku3, Cant, Sku4, Cant, Sku5, Cant.", campo: "Formato", valorActual: "", valorNuevo: "Sin filas para aplicar", warning: true, canApply: false });
  return preview;
}
