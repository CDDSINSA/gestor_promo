import * as XLSX from "xlsx";

const SHEETS = {
  CONFIG: "CONFIG",
  COMPRADORES: "COMPRADORES",
  PROMOCIONES: "PROMOCIONES",
  COMENTARIOS: "COMENTARIOS",
  LOGS: "LOGS",
  NOTIFICACIONES: "NOTIFICACIONES",
  CONSOLIDADO: "CONSOLIDADO",
  EXPORT_PRICING: "EXPORT_PRICING",
  EXPORT_MERCADEO: "EXPORT_MERCADEO",
  EXPORT_PLANIMETRIA: "EXPORT_PLANIMETRIA",
};

const REQUIRED_SHEETS = [
  SHEETS.CONFIG,
  SHEETS.COMPRADORES,
  SHEETS.PROMOCIONES,
  SHEETS.COMENTARIOS,
  SHEETS.LOGS,
  SHEETS.NOTIFICACIONES,
];

function sheetToJson(workbook, sheetName) {
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) return [];
  return XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false });
}

function jsonToSheet(data) {
  return XLSX.utils.json_to_sheet(data || []);
}

function validateWorkbook(workbook) {
  const missingSheets = REQUIRED_SHEETS.filter((sheetName) => !workbook.SheetNames.includes(sheetName));
  if (missingSheets.length > 0) {
    throw new Error(`Faltan hojas obligatorias: ${missingSheets.join(", ")}`);
  }
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  const text = String(value || "").trim().toUpperCase();
  return text === "TRUE" || text === "SI" || text === "SÍ" || text === "ACTIVO";
}

function normalizeNumber(value) {
  if (value === "" || value === null || value === undefined) return "";
  const clean = String(value).replace(",", ".").replace("%", "").trim();
  const number = Number(clean);
  return Number.isNaN(number) ? value : number;
}

function createRowId() {
  return `ROW-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function createCommentId() {
  return `CMT-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function createLogId() {
  return `LOG-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function normalizePromocion(row) {
  return {
    row_id: row.row_id || createRowId(),
    catalogo_id: row.catalogo_id || "",
    comprador: row.comprador || "",
    division: row.division || "",
    tipo_promo: row.tipo_promo || "",
    grupo_oferta: row.grupo_oferta || "",
    tipo_sku: row.tipo_sku || "",
    sku: String(row.sku || "").trim(),
    num_parte: row.num_parte || "",
    descripcion: row.descripcion || "",
    tipo_cantidad: row.tipo_cantidad || "Exacta",
    cantidad_minima: normalizeNumber(row.cantidad_minima || 1),
    precio_antes: normalizeNumber(row.precio_antes),
    precio_ahora: normalizeNumber(row.precio_ahora),
    descuento: row.descuento || "",
    comentario_comprador: row.comentario_comprador || "",
    estado_registro: row.estado_registro || "BORRADOR",
    fecha_creacion: row.fecha_creacion || new Date().toISOString(),
    fecha_modificacion: row.fecha_modificacion || "",
    ultima_modificacion_por: row.ultima_modificacion_por || "",
  };
}

function normalizeComentario(row) {
  return {
    comentario_id: row.comentario_id || createCommentId(),
    catalogo_id: row.catalogo_id || "",
    row_id: row.row_id || "",
    prioridad: row.prioridad || "MEDIA",
    usuario: row.usuario || "",
    tipo_usuario: row.tipo_usuario || "",
    comentario: row.comentario || "",
    estado: row.estado || "ABIERTO",
    fecha: row.fecha || new Date().toISOString(),
    resuelto_por: row.resuelto_por || "",
    fecha_resolucion: row.fecha_resolucion || "",
  };
}

function normalizeLog(row) {
  return {
    log_id: row.log_id || createLogId(),
    fecha: row.fecha || new Date().toISOString(),
    usuario: row.usuario || "",
    accion: row.accion || "",
    row_id: row.row_id || "",
    campo: row.campo || "",
    valor_anterior: row.valor_anterior || "",
    valor_nuevo: row.valor_nuevo || "",
    fecha_cierre: row.fecha_cierre || "",
  };
}

export async function loadCatalogFromExcel(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  validateWorkbook(workbook);

  return {
    config: sheetToJson(workbook, SHEETS.CONFIG),
    compradores: sheetToJson(workbook, SHEETS.COMPRADORES).map((row) => ({
      comprador: row.comprador || "",
      division: row.division || "",
      correo: row.correo || "",
      activo: normalizeBoolean(row.activo),
    })),
    promociones: sheetToJson(workbook, SHEETS.PROMOCIONES).map(normalizePromocion),
    comentarios: sheetToJson(workbook, SHEETS.COMENTARIOS).map(normalizeComentario),
    logs: sheetToJson(workbook, SHEETS.LOGS).map(normalizeLog),
    notificaciones: sheetToJson(workbook, SHEETS.NOTIFICACIONES).map((row) => ({
      catalogo_id: row.catalogo_id || "",
      correo: row.correo || "",
      activo: normalizeBoolean(row.activo),
    })),
  };
}

export function buildConsolidado(promociones, comentarios = []) {
  return promociones.map((promo) => {
    const comentariosRow = comentarios.filter((item) => item.row_id === promo.row_id);
    const comentariosAbiertos = comentariosRow.filter((item) => item.estado === "ABIERTO").length;

    return {
      catalogo_id: promo.catalogo_id,
      comprador: promo.comprador,
      division: promo.division,
      tipo_promo: promo.tipo_promo,
      grupo_oferta: promo.grupo_oferta,
      tipo_sku: promo.tipo_sku,
      sku: promo.sku,
      num_parte: promo.num_parte,
      descripcion: promo.descripcion,
      tipo_cantidad: promo.tipo_cantidad,
      cantidad_minima: promo.cantidad_minima,
      precio_antes: promo.precio_antes,
      precio_ahora: promo.precio_ahora,
      descuento: promo.descuento,
      comentario_comprador: promo.comentario_comprador,
      estado_registro: promo.estado_registro,
      comentarios_abiertos: comentariosAbiertos,
      total_comentarios: comentariosRow.length,
      fecha_modificacion: promo.fecha_modificacion,
      ultima_modificacion_por: promo.ultima_modificacion_por,
    };
  });
}

export function buildPricingExport(promociones) {
  return promociones.map((promo) => ({
    catalogo_id: promo.catalogo_id,
    comprador: promo.comprador,
    tipo_promo: promo.tipo_promo,
    grupo_oferta: promo.grupo_oferta,
    tipo_sku: promo.tipo_sku,
    sku: promo.sku,
    tipo_cantidad: promo.tipo_cantidad,
    cantidad_minima: promo.cantidad_minima,
    precio_antes: promo.precio_antes,
    precio_ahora: promo.precio_ahora,
    descuento: promo.descuento,
    estado_registro: promo.estado_registro,
  }));
}

export function buildMercadeoExport(promociones, comentarios = []) {
  return promociones.map((promo) => ({
    catalogo_id: promo.catalogo_id,
    comprador: promo.comprador,
    tipo_promo: promo.tipo_promo,
    grupo_oferta: promo.grupo_oferta,
    sku: promo.sku,
    num_parte: promo.num_parte,
    descripcion: promo.descripcion,
    precio_antes: promo.precio_antes,
    precio_ahora: promo.precio_ahora,
    descuento: promo.descuento,
    comentario_comprador: promo.comentario_comprador,
    comentarios_abiertos_mercadeo: comentarios
      .filter((comentario) => comentario.row_id === promo.row_id && comentario.estado === "ABIERTO")
      .map((comentario) => comentario.comentario)
      .join(" | "),
  }));
}

export function buildPlanimetriaExport(promociones) {
  return promociones.map((promo) => ({
    catalogo_id: promo.catalogo_id,
    comprador: promo.comprador,
    division: promo.division,
    tipo_promo: promo.tipo_promo,
    grupo_oferta: promo.grupo_oferta,
    sku: promo.sku,
    descripcion: promo.descripcion,
    precio_antes: promo.precio_antes,
    precio_ahora: promo.precio_ahora,
    descuento: promo.descuento,
  }));
}

export function validatePromociones(promociones) {
  const errors = [];

  promociones.forEach((promo, index) => {
    const rowNumber = index + 2;

    if (!promo.sku) errors.push(`Fila ${rowNumber}: SKU vacío.`);
    if (!promo.tipo_promo) errors.push(`Fila ${rowNumber}: tipo_promo vacío.`);
    if (!promo.comprador) errors.push(`Fila ${rowNumber}: comprador vacío.`);

    if (["Combo", "Kit", "Umbral", "Compra X lleva Y", "Regalía compleja"].includes(promo.tipo_promo)) {
      if (!promo.grupo_oferta) errors.push(`Fila ${rowNumber}: promoción compleja sin grupo_oferta.`);
      if (!promo.tipo_sku) errors.push(`Fila ${rowNumber}: promoción compleja sin tipo_sku.`);
    }
  });

  const grupos = promociones.reduce((acc, promo) => {
    if (!promo.grupo_oferta) return acc;
    if (!acc[promo.grupo_oferta]) acc[promo.grupo_oferta] = [];
    acc[promo.grupo_oferta].push(promo);
    return acc;
  }, {});

  Object.entries(grupos).forEach(([grupo, items]) => {
    const isComplex = items.some((item) =>
      ["Combo", "Kit", "Umbral", "Compra X lleva Y", "Regalía compleja"].includes(item.tipo_promo)
    );
    if (!isComplex) return;

    const hasPrincipal = items.some((item) => item.tipo_sku === "principal");
    if (!hasPrincipal) errors.push(`Grupo ${grupo}: promoción compleja sin SKU principal.`);
  });

  return errors;
}

export function saveCatalogToExcel(data) {
  const {
    config = [],
    compradores = [],
    promociones = [],
    comentarios = [],
    logs = [],
    notificaciones = [],
  } = data;

  const validationErrors = validatePromociones(promociones);
  if (validationErrors.length > 0) {
    throw new Error(validationErrors.join("\n"));
  }

  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, jsonToSheet(config), SHEETS.CONFIG);
  XLSX.utils.book_append_sheet(workbook, jsonToSheet(buildPricingExport(promociones)), SHEETS.EXPORT_PRICING);
  XLSX.utils.book_append_sheet(workbook, jsonToSheet(buildMercadeoExport(promociones, comentarios)), SHEETS.EXPORT_MERCADEO);
  XLSX.utils.book_append_sheet(workbook, jsonToSheet(buildPlanimetriaExport(promociones)), SHEETS.EXPORT_PLANIMETRIA);
  XLSX.utils.book_append_sheet(workbook, jsonToSheet(comentarios), SHEETS.COMENTARIOS);
  XLSX.utils.book_append_sheet(workbook, jsonToSheet(compradores), SHEETS.COMPRADORES);
  XLSX.utils.book_append_sheet(workbook, jsonToSheet(buildConsolidado(promociones, comentarios)), SHEETS.CONSOLIDADO);
  XLSX.utils.book_append_sheet(workbook, jsonToSheet(notificaciones), SHEETS.NOTIFICACIONES);
  XLSX.utils.book_append_sheet(workbook, jsonToSheet(promociones), SHEETS.PROMOCIONES);
  XLSX.utils.book_append_sheet(workbook, jsonToSheet(logs), SHEETS.LOGS);

  XLSX.writeFile(workbook, "Catalogo_Promociones_Actualizado.xlsx");
}
