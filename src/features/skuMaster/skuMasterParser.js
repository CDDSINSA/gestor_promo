/**
 * Parser de archivos de catálogo ERP (Excel .xlsx/.xls o CSV).
 * Extrae las columnas especificadas por negocio:
 *   A (0): SKU (ITEM)
 *   D (3): Descripción (ITEM_DESC)
 *   E (4): Departamento (DEPT)
 *   H (7): Unidad de medida (STANDARD_UOM)
 *   K (10): Proveedor (SUP_NAME)
 *   M (12): Precio regular / venta con IVA (UNIT_RETAIL)
 *   O (14): Número de parte / VPN (VPN)
 *   AV_COST (costo promedio): se ubica solo por encabezado (sin posición fija).
 *     Viene SIEMPRE en córdobas: no se convierte. Se guarda en sku_costos (no en
 *     sku_master) y no se muestra al crear ofertas. Otras columnas de costo del ERP
 *     (UNIT_COST, etc.) se ignoran a propósito.
 *
 * También detecta el reporte UDA del ERP (UDA_ID, UDA_DESC, UDA_ITEM, UDA_VALUE):
 * en ese caso NO es una carga completa, sino una actualización de la clasificación
 * ABC (solo filas con UDA_ID = 4). Ver parseAbcClassificationRows.
 */

export const SKU_FILE_KIND_FULL = "full";
export const SKU_FILE_KIND_ABC = "abc";
export const ABC_UDA_ID = 4;
// Clasificación que se asume para los SKU sin dato en el reporte UDA: 8 (Nuevo).
export const ABC_DEFAULT_CODE = 8;

// Equivalencias acordadas con negocio (código ↔ nombre). Mismo catálogo en
// docs/supabase_clasificacion_abc.sql (clasificacion_abc_catalogo).
export const ABC_CLASSIFICATIONS = Object.freeze({
  1: "AA",
  2: "C",
  3: "Descontinuado",
  4: "B",
  5: "A",
  6: "Lento Movimiento",
  7: "Temporada",
  8: "Nuevo",
  9: "Inventario Duro",
  10: "Servicio",
  11: "Quebrada",
});

function cleanText(value) {
  return String(value ?? "").trim();
}

function normalizeHeader(value) {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const ABC_CODE_BY_NAME = new Map(
  Object.entries(ABC_CLASSIFICATIONS).map(([code, name]) => [normalizeHeader(name), Number(code)])
);

/** Nombre de la clasificación para un código (o "" si no existe). */
export function getAbcClassificationName(code) {
  return ABC_CLASSIFICATIONS[Number(code)] || "";
}

/**
 * Convierte UDA_VALUE a código 1–11. Acepta el código ("5", 5, "5.0") o el nombre
 * ("A", "Lento Movimiento", "lento movimiento"). Devuelve null si no es válido.
 */
export function parseAbcCode(value) {
  const text = cleanText(value);
  if (!text) return null;
  if (/^\d+(\.0+)?$/.test(text)) {
    const code = Number(text);
    return ABC_CLASSIFICATIONS[code] ? code : null;
  }
  return ABC_CODE_BY_NAME.get(normalizeHeader(text)) ?? null;
}

/** Devuelve "abc" si el encabezado es el reporte UDA; "full" para el maestro completo. */
export function detectSkuFileKind(headerRow = []) {
  const headers = new Set(headerRow.map(normalizeHeader));
  return ["udaid", "udaitem", "udavalue"].every((name) => headers.has(name))
    ? SKU_FILE_KIND_ABC
    : SKU_FILE_KIND_FULL;
}

function parsePrice(value) {
  if (value === "" || value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value).replace(/[^0-9,.-]/g, "").trim();
  if (!text) return null;
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  const decimalSep = lastComma > lastDot ? "," : ".";
  const normalized = text
    .replace(decimalSep === "," ? /\./g : /,/g, "")
    .replace(decimalSep, ".");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function parseCost(value) {
  const cost = parsePrice(value);
  return cost !== null && cost >= 0 ? cost : null;
}

export function detectColumnIndices(headerRow = []) {
  const normHeaders = headerRow.map(normalizeHeader);

  // Alias conocidos
  const aliases = {
    sku: ["item", "sku", "codigo", "itemcode", "articulo", "codarticulo"],
    descripcion: ["itemdesc", "descripcion", "desc", "producto", "nombrearticulo", "itemdescription"],
    dep_id: ["dept", "dep", "departamento", "depid", "division", "depto"],
    unidad_medida: ["standarduom", "uom", "unidad", "unidadmedida", "medida"],
    proveedor: ["supname", "suppliername", "nombreproveedor", "nombresuplidor", "proveedor", "supplier"],
    precio_regular: ["unitretail", "precioregular", "precio", "precioventa", "pvp", "preciolista"],
    num_parte: ["vpn", "numparte", "numeroparte", "partnumber", "modelo", "referencia"],
    // Solo el costo promedio. No se agregan alias genéricos ("costo", "cost") para no
    // tomar por error UNIT_COST u otra columna de costo del reporte.
    av_cost: ["avcost", "costopromedio", "averagecost", "avgcost"],
  };

  const findIndex = (aliasList, fallbackIndex) => {
    for (const alias of aliasList) {
      const idx = normHeaders.indexOf(alias);
      if (idx !== -1) return idx;
    }
    return fallbackIndex;
  };

  return {
    sku: findIndex(aliases.sku, 0),             // Col A (0)
    descripcion: findIndex(aliases.descripcion, 3), // Col D (3)
    dep_id: findIndex(aliases.dep_id, 4),           // Col E (4)
    unidad_medida: findIndex(aliases.unidad_medida, 7), // Col H (7)
    proveedor: findIndex(aliases.proveedor, 10),    // Col K (10)
    precio_regular: findIndex(aliases.precio_regular, 12), // Col M (12)
    num_parte: findIndex(aliases.num_parte, 14),    // Col O (14)
    av_cost: findIndex(aliases.av_cost, -1),
  };
}

async function readSheetRows(file) {
  const isCsv = file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv";
  const XLSX = await import("xlsx");

  if (isCsv) {
    const text = await file.text();
    // Detectar separador común (; o ,)
    const firstLine = text.slice(0, 1000).split(/\r?\n/)[0] || "";
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    const commaCount = (firstLine.match(/,/g) || []).length;
    const delimiter = semicolonCount > commaCount ? ";" : ",";
    const workbook = XLSX.read(text, { type: "string", raw: false, FS: delimiter });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  }

  // Archivos Excel (.xlsx, .xls)
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", raw: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
}

export async function parseSkuMasterFile(file) {
  if (!file) throw new Error("No se ha seleccionado ningún archivo.");
  const rawRows = await readSheetRows(file);
  return parseSkuMasterRows(rawRows);
}

/**
 * Decide el tipo de archivo por su encabezado y lo procesa:
 * - Reporte UDA (UDA_ID/UDA_ITEM/UDA_VALUE) -> actualización de clasificación ABC.
 * - Cualquier otro -> carga completa del maestro.
 */
export function parseSkuMasterRows(rawRows = []) {
  if (!rawRows || rawRows.length < 2) {
    throw new Error("El archivo no contiene suficientes filas o está vacío.");
  }
  return detectSkuFileKind(rawRows[0]) === SKU_FILE_KIND_ABC
    ? parseAbcClassificationRows(rawRows)
    : parseFullMasterRows(rawRows);
}

/**
 * Reporte UDA del ERP. Solo filas con UDA_ID = 4; UDA_ITEM = SKU y UDA_VALUE =
 * código o nombre de la clasificación. Si un SKU se repite, prevalece la última fila.
 */
export function parseAbcClassificationRows(rawRows = []) {
  const headers = (rawRows[0] || []).map(normalizeHeader);
  const col = {
    udaId: headers.indexOf("udaid"),
    sku: headers.indexOf("udaitem"),
    value: headers.indexOf("udavalue"),
  };

  const skuMap = new Map();
  let otherUdaCount = 0;
  let invalidCount = 0;
  let invalidValueCount = 0;
  let duplicateCount = 0;
  const invalidValues = new Set();

  for (let r = 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!Array.isArray(row) || row.every((cell) => cleanText(cell) === "")) continue;

    const udaId = cleanText(row[col.udaId]);
    if (Number(udaId) !== ABC_UDA_ID) {
      otherUdaCount++;
      continue;
    }
    const sku = cleanText(row[col.sku]);
    if (!sku) {
      invalidCount++;
      continue;
    }
    const code = parseAbcCode(row[col.value]);
    if (code === null) {
      invalidValueCount++;
      if (invalidValues.size < 10) invalidValues.add(cleanText(row[col.value]) || "(vacío)");
      continue;
    }
    if (skuMap.has(sku)) duplicateCount++;
    skuMap.set(sku, { sku, clasificacion_abc: code, clasificacion_abc_nombre: ABC_CLASSIFICATIONS[code] });
  }

  const rows = Array.from(skuMap.values());
  if (!rows.length) {
    throw new Error(`El archivo de clasificación no tiene filas válidas con UDA_ID = ${ABC_UDA_ID}.`);
  }

  const distribution = {};
  for (const item of rows) distribution[item.clasificacion_abc] = (distribution[item.clasificacion_abc] || 0) + 1;

  return {
    kind: SKU_FILE_KIND_ABC,
    rows,
    totalValid: rows.length,
    invalidCount,
    invalidValueCount,
    invalidValues: Array.from(invalidValues),
    otherUdaCount,
    duplicateCount,
    distribution,
    colMap: col,
    preview: rows.slice(0, 5),
  };
}

function parseFullMasterRows(rawRows) {
  // Detectar columnas desde la primera fila (encabezado)
  const headerRow = rawRows[0];
  const colMap = detectColumnIndices(headerRow);

  const parsedRows = [];
  let invalidCount = 0;

  for (let r = 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!Array.isArray(row) || !row.length) continue;

    const sku = cleanText(row[colMap.sku]);
    if (!sku) {
      invalidCount++;
      continue;
    }

    const descripcion = cleanText(row[colMap.descripcion]);
    const dep_id = cleanText(row[colMap.dep_id]);
    const unidad_medida = cleanText(row[colMap.unidad_medida]);
    const proveedor = cleanText(row[colMap.proveedor]);
    const precio_regular = parsePrice(row[colMap.precio_regular]);
    const num_parte = cleanText(row[colMap.num_parte]);
    // AV_COST en C$ (sin conversión de moneda).
    const av_cost = colMap.av_cost >= 0 ? parseCost(row[colMap.av_cost]) : null;

    parsedRows.push({
      sku,
      descripcion: descripcion || "Sin descripción",
      dep_id,
      unidad_medida,
      proveedor,
      precio_regular,
      num_parte,
      av_cost,
      activo: true,
    });
  }

  // Deduplicar por SKU (si el archivo tiene el mismo SKU varias veces, prevalece la última fila)
  const skuMap = new Map();
  let duplicateCount = 0;
  for (const item of parsedRows) {
    if (skuMap.has(item.sku)) {
      duplicateCount++;
    }
    skuMap.set(item.sku, item);
  }

  const uniqueRows = Array.from(skuMap.values());
  const costCount = uniqueRows.filter((item) => item.av_cost !== null).length;

  return {
    kind: SKU_FILE_KIND_FULL,
    rows: uniqueRows,
    totalValid: uniqueRows.length,
    invalidCount,
    duplicateCount,
    costCount,
    hasCostColumn: colMap.av_cost >= 0,
    colMap,
    preview: uniqueRows.slice(0, 5),
  };
}
