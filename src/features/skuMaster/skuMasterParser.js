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
 */

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

function detectColumnIndices(headerRow = []) {
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
  };
}

export async function parseSkuMasterFile(file) {
  if (!file) throw new Error("No se ha seleccionado ningún archivo.");

  const isCsv = file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv";
  const XLSX = await import("xlsx");

  let rawRows = [];

  if (isCsv) {
    const text = await file.text();
    // Detectar separador común (; o ,)
    const firstLine = text.slice(0, 1000).split(/\r?\n/)[0] || "";
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    const commaCount = (firstLine.match(/,/g) || []).length;
    const delimiter = semicolonCount > commaCount ? ";" : ",";

    // Si tiene comas o puntos y coma, leer con SheetJS o split
    const workbook = XLSX.read(text, { type: "string", raw: false, FS: delimiter });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  } else {
    // Archivos Excel (.xlsx, .xls)
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", raw: false });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  }

  if (!rawRows || rawRows.length < 2) {
    throw new Error("El archivo no contiene suficientes filas o está vacío.");
  }

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

    parsedRows.push({
      sku,
      descripcion: descripcion || "Sin descripción",
      dep_id,
      unidad_medida,
      proveedor,
      precio_regular,
      num_parte,
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

  return {
    rows: uniqueRows,
    totalValid: uniqueRows.length,
    invalidCount,
    duplicateCount,
    colMap,
    preview: uniqueRows.slice(0, 5),
  };
}
