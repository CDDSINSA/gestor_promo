import * as XLSX from "xlsx";

const DEFAULT_LIMITS = {
  maxBytes: 50 * 1024 * 1024,
  maxRows: 170000,
  maxColumns: 50,
};

const SKU_ALIASES = ["sku", "codigo", "codigo_sku", "cod_sku", "articulo", "item", "item_code", "codigo_articulo"];

function normalizeHeader(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getEntryByAliases(row, aliases) {
  const keys = Object.keys(row || {});
  const normalizedAliases = aliases.map(normalizeHeader);
  const key = keys.find((item) => normalizedAliases.includes(normalizeHeader(item)));
  return key ? { key, value: row[key] } : null;
}

function getByAliases(row, aliases) {
  return getEntryByAliases(row, aliases)?.value;
}

function normalizeERPNumber(value) {
  if (value === "" || value === null || value === undefined) return "";
  if (typeof value === "number") return value;
  const text = String(value).replace(/[^0-9,.-]/g, "").trim();
  if (!text) return "";
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  const decimalSeparator = lastComma > lastDot ? "," : ".";
  const normalized = text
    .replace(decimalSeparator === "," ? /\./g : /,/g, "")
    .replace(decimalSeparator, ".");
  const number = Number(normalized);
  return Number.isNaN(number) ? value : number;
}

function addIva(value) {
  if (typeof value !== "number") return value;
  return Math.round(value * 1.15 * 100) / 100;
}

function normalizeSkuMasterRow(row) {
  const sku = String(getByAliases(row, ["sku", "codigo", "codigo_sku", "cod_sku", "articulo", "item", "item_code", "codigo_articulo"]) || "").trim();
  if (!sku) return null;
  const priceEntry = getEntryByAliases(row, ["precio", "precio_antes", "precio_regular", "precio_venta", "pvp", "precio_iva", "precio_con_iva", "unit_retail"]);
  const priceValue = normalizeERPNumber(priceEntry?.value);
  const isPriceWithoutIva = normalizeHeader(priceEntry?.key) === "unitretail";
  return {
    sku,
    vpn: String(getByAliases(row, ["vpn", "num_parte", "numero_parte", "parte", "part_number", "modelo", "referencia", "codigo_proveedor"]) || "").trim(),
    descripcion: String(getByAliases(row, ["descripcion", "descripcion_articulo", "desc", "producto", "nombre", "nombre_articulo", "item_desc"]) || "").trim(),
    precio: isPriceWithoutIva ? addIva(priceValue) : priceValue,
    dep_id: String(getByAliases(row, ["dep_id", "dept", "DEPT", "departamento_id", "department"]) || "").trim(),
  };
}

function assertSkuMasterShape(worksheet, limits) {
  if (!worksheet?.["!ref"]) throw new Error("El archivo ERP no contiene datos.");
  const range = XLSX.utils.decode_range(worksheet["!ref"]);
  const rowCount = range.e.r - range.s.r + 1;
  const columnCount = range.e.c - range.s.c + 1;
  if (rowCount <= 1) throw new Error("El archivo ERP no contiene filas de datos.");
  if (rowCount - 1 > limits.maxRows) throw new Error(`El archivo ERP supera el limite de ${limits.maxRows} filas.`);
  if (columnCount > limits.maxColumns) throw new Error(`El archivo ERP supera el limite de ${limits.maxColumns} columnas.`);

  const headers = [];
  for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
    const cellAddress = XLSX.utils.encode_cell({ r: range.s.r, c: columnIndex });
    headers.push(worksheet[cellAddress]?.v || "");
  }
  const normalizedHeaders = headers.map(normalizeHeader);
  const hasSkuColumn = SKU_ALIASES.map(normalizeHeader).some((alias) => normalizedHeaders.includes(alias));
  if (!hasSkuColumn) throw new Error("El archivo ERP no contiene una columna SKU reconocible.");
}

self.addEventListener("message", (event) => {
  const { id, buffer, limits: rawLimits } = event.data || {};
  const limits = { ...DEFAULT_LIMITS, ...(rawLimits || {}) };
  try {
    if (!buffer?.byteLength) throw new Error("El archivo ERP no contiene datos.");
    if (buffer.byteLength > limits.maxBytes) throw new Error(`El archivo ERP supera el limite de ${Math.round(limits.maxBytes / 1024 / 1024)} MB.`);
    const csvText = new TextDecoder("utf-8").decode(buffer);
    const workbook = XLSX.read(csvText, { type: "string", raw: false });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error("El archivo ERP no contiene datos.");
    const worksheet = workbook.Sheets[sheetName];
    assertSkuMasterShape(worksheet, limits);
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false });
    const skuMaster = {};
    let skuMasterCount = 0;
    rows.forEach((row) => {
      const item = normalizeSkuMasterRow(row);
      if (!item) return;
      skuMaster[item.sku] = item;
      skuMasterCount += 1;
    });
    self.postMessage({ id, result: { skuMaster, skuMasterCount, sheetName } });
  } catch (error) {
    self.postMessage({ id, error: error.message || "No se pudo procesar el archivo ERP." });
  }
});
