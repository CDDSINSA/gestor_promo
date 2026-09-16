import {
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
  ].includes(column);
}

export function getDefaultBulkColumnForPromoType(promoType, { includeMegapack = true } = {}) {
  if (promoType === "Umbral") return BULK_COLUMN_UMBRAL_TABLE;
  if (promoType === "Combo") return BULK_COLUMN_COMBO_TABLE;
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
  const bulkInstructions = isMegapackTablePaste
    ? "Pegue una tabla con columnas: Sku principal, Cant, Sku2, Cant, Sku3, Cant, Sku4, Cant, Sku5, Cant. Se crea una fila principal y las regalÃ­as al 100%."
    : isBuyXGetXTablePaste
      ? (tipoActivo === BUY_X_GET_X_V2_PROMO_TYPE
        ? "Pegue una tabla con columnas: SKU, variante, ahora c IVA y descuento. V2 conserva una sola fila por SKU y registra las cantidades en comentario."
        : "Pegue una tabla con columnas: SKU, variante, ahora c IVA y descuento. La variante AxB crea principal con la cantidad menor y regalia con la diferencia.")
      : isComboTablePaste
        ? "Pegue una tabla con columnas: Tipo, Sku, Ahora con iva y descuento. Se crea un combo nuevo cuando una fila Principal viene despues de una Regalia. La cantidad se crea en 1 y puede ajustarse manualmente."
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
  if (config.mode === "megapack") {
    const principalSkuIndex = findTemplateColumn(header, ["sku principal", "sku_principal", "principal"], 0);
    const principalQtyIndex = findTemplateColumn(header, ["cant principal", "cantidad principal", "cantidad compra", "cant"], 1);
    const commentIndex = findTemplateColumn(header, ["comentario", "comentarios", "comment"], header.length - 1);
    return [["Sku principal", "Cant", "Sku2", "Cant", "Sku3", "Cant", "Sku4", "Cant", "Sku5", "Cant", "Comentario"], ...dataRows.map((row) => [
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
  if (!sheetName) throw new Error(`La plantilla no contiene la pestaÃ±a ${config.sheetName}.`);
  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "", raw: false });
  const normalizedRows = normalizeTemplateSheetRows(rows, config);
  if (normalizedRows.length < 2) throw new Error(`La pestaÃ±a ${sheetName} no tiene filas para cargar.`);
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
  if (raw.includes("%")) return { precioAhora: "", descuento: raw, display: `Descuento ${raw}` };
  if (benefitType === "descuento") return { precioAhora: "", descuento: `${raw}%`, display: `Descuento ${raw}%` };
  const price = normalizePastedNumber(raw);
  return { precioAhora: price, descuento: "", display: `Precio fijo ${price}` };
}

export function buildUmbralBulkPreview(text, skuMaster = {}) {
  const pastedRows = parseClipboardRows(text);
  if (!pastedRows.length) return [];
  const headerRow = pastedRows[0] || [];
  const firstHeader = normalizeCanal(headerRow[0]);
  const hasSkuHeader = ["sku", "codigo", "codigosku", "codsku"].includes(firstHeader);
  const tipoIndex = findClipboardColumn(headerRow, ["tipo", "beneficio", "tipo beneficio", "tipo_beneficio"], -1);
  const allThresholds = headerRow
    .map((value, index) => ({ ...parseUmbralHeader(value), cellIndex: index }))
    .filter((item) => item.cellIndex > 0 && item.cellIndex !== tipoIndex && item.label);
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
    const benefitType = tipoIndex >= 0 ? normalizeUmbralBenefitType(cells[tipoIndex]) : "";
    thresholds.forEach((threshold) => {
      const benefit = parseUmbralBenefit(cells[threshold.cellIndex], benefitType);
      if (!sku && !benefit.display) return;
      if (!benefit.display) return;
      const master = skuMaster[sku] || {};
      const invalidThreshold = threshold.cantidadMinima === "";
      const canApply = Boolean(sku && !invalidThreshold);
      const descripcion = canApply ? `${master.descripcion || "SKU no encontrado en maestro en la BD"} | ${threshold.label}` : invalidThreshold ? `El encabezado "${threshold.label}" no tiene cantidad minima.` : "Fila sin SKU.";
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

export function normalizeDiscountValue(value) {
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

export function buildComboBulkPreview(text, skuMaster = {}) {
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
    const benefit = hasPromoFieldValue(precioAhora) ? `Precio fijo ${precioAhora}` : hasPromoFieldValue(descuento) ? `Descuento ${descuento}` : "Sin beneficio";
    preview.push({ index: preview.length + 1, scenario: currentScenario, sku: sku || "SKU vacio", descripcion: `${currentScenario} | ${role || "Rol no reconocido"} | ${master.descripcion || "SKU no encontrado en maestro en la BD"}`, campo: role === "regalia" ? "RegalÃ­a" : role === "principal" ? "Principal" : "Rol", valorActual: "", valorNuevo: benefit, role, cantidadMinima: 1, precioAhora, descuento, comentario, warning, canApply: Boolean(role && sku) });
    previousRole = role || previousRole;
  });
  if (!preview.some((item) => item.canApply)) preview.push({ index: "Aviso", sku: "Sin combos", descripcion: "Pegue columnas: Tipo, Sku, Ahora con iva y descuento.", campo: "Formato", valorActual: "", valorNuevo: "Sin filas para aplicar", warning: true, canApply: false });
  return preview;
}

export function buildBuyXGetXBulkPreview(text, skuMaster = {}, promoType = BUY_X_GET_X_PROMO_TYPE) {
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
    const benefit = hasPromoFieldValue(precioAhora) ? `Precio fijo ${precioAhora}` : hasPromoFieldValue(descuento) ? `Descuento ${descuento}` : "Sin precio/descuento principal";
    preview.push({ index: preview.length + 1, sku: sku || "SKU vacio", descripcion: `${variantLabel} | ${master.descripcion || "SKU no encontrado en maestro en la BD"}`, campo: "Variante", valorActual: "", valorNuevo: benefit, variant: variantLabel, principalQty: parsedVariant?.principalQty || 0, rewardQty: parsedVariant?.rewardQty || 0, precioAhora, descuento, warning, canApply: Boolean(sku && parsedVariant) });
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
  const preview = [];
  pastedRows.slice(1).forEach((cells) => {
    const principalSku = normalizeValue(cells[0]);
    const principalQty = parseMegapackQuantity(cells[1]);
    const comentario = normalizeValue(cells[10]);
    const rewards = [2, 4, 6, 8]
      .map((skuIndex) => ({
        sku: normalizeValue(cells[skuIndex]),
        quantity: parseMegapackQuantity(cells[skuIndex + 1]),
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
      descripcion: `${principalMaster.descripcion || "SKU principal no encontrado en maestro en la BD"} | RegalÃ­as: ${rewardSummary || "sin regalÃ­as vÃ¡lidas"}`,
      campo: MEGAPACK_PROMO_TYPE,
      valorActual: "",
      valorNuevo: `Compra ${principalQty || "?"} | Obsequia ${rewardSummary || "?"}`,
      principalSku,
      principalQty,
      rewards: validRewards,
      comentario,
      warning,
      canApply: Boolean(principalSku && principalQty && validRewards.length),
    });
  });
  if (!preview.some((item) => item.canApply)) preview.push({ index: "Aviso", sku: "Sin megapack", descripcion: "Pegue columnas: Sku principal, Cant, Sku2, Cant, Sku3, Cant, Sku4, Cant, Sku5, Cant.", campo: "Formato", valorActual: "", valorNuevo: "Sin filas para aplicar", warning: true, canApply: false });
  return preview;
}
