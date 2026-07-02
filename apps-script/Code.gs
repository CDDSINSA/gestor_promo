const SPREADSHEET_ID = "1QuT13pajfbLx_90oTZEosB3O7G3mpwuk_soOPqyOCms";
const API_TOKEN_PROPERTY = "PROMO_API_TOKEN";

const SHEETS = {
  CONFIG: "CONFIG",
  CATALOGOS: "CATALOGOS",
  ACTIVIDADES: "ACTIVIDADES",
  SEGMENTOS_CLIENTES: "segmentos_clientes",
  COMPRADORES: "COMPRADORES",
  RESPONSABLES_SOLICITUDES: "RESPONSABLES_SOLICITUDES",
  JERARQUIA_CATEGORIAS: "JERARQUIA_CATEGORIAS",
  AVANCES_CATALOGO: "AVANCES_CATALOGO",
  NOTIFICACIONES: "NOTIFICACIONES",
  PROMOCIONES: "PROMOCIONES",
  PROMOCIONES_DETALLE: "PROMOCIONES_DETALLE",
  COMENTARIOS: "COMENTARIOS",
  LOGS: "LOGS",
  CONSOLIDADO: "CONSOLIDADO",
  EXPORT_PRICING: "EXPORT_PRICING",
  EXPORT_MERCADEO: "EXPORT_MERCADEO",
  EXPORT_PLANIMETRIA: "EXPORT_PLANIMETRIA",
};

const COMPLEX_TYPES = ["Combo", "Umbral", "Compra X lleva X", "Compra X Lleva X V2"];
const ACTIVITY_TYPES = ["CATALOGO", "ESPECIAL"];
const ALCANCE_TYPES = ["CANAL", "SEGMENTO", "TIENDA", "MULTI_TIENDA"];
const COMBO_REWARD_ROLES = ["regalia", "regalía", "recompensa", "reward"];
const COMMENT_SCOPE_ACTIVITY = "ACTIVIDAD";
const COMMENT_SCOPE_LINE = "LINEA";

const HEADERS = {
  CONFIG: ["clave", "valor", "descripcion"],
  CATALOGOS: [
    "catalogo_id",
    "nombre",
    "canal",
    "vigencia_inicio",
    "vigencia_fin",
    "vigencia",
    "estado",
    "color",
    "doc_id",
    "token_conexion",
    "notificaciones",
    "correos",
    "divisiones",
  ],
  SEGMENTOS_CLIENTES: ["segmento_id", "nombre_segmento", "canal", "activo", "orden"],
  ACTIVIDADES: ["actividad_id", "nombre_actividad", "tipo_actividad", "canal", "fecha_inicio", "fecha_fin", "solicitante", "estado", "fecha_creacion", "motivo_solicitud", "fecha_modificacion", "responsable", "recursos_ocupados", "fecha_estado", "fecha_nuevo", "fecha_aprovado", "fecha_entrabajo", "fecha_finalizado", "fecha_asignado", "fecha_trabajando", "fecha_resuelto", "tiempo_nuevo_horas", "tiempo_aprovado_horas", "tiempo_entrabajo_horas", "tiempo_finalizado_horas", "tiempo_asignado_horas", "tiempo_trabajando_horas", "tiempo_resuelto_horas", "tiempo_total_horas", "promo_ids", "oferta_ids"],
  COMPRADORES: ["comprador_id", "categoria_comprador", "comprador", "division", "correo", "activo", "senior_id"],
  RESPONSABLES_SOLICITUDES: ["responsable_id", "nombre", "area", "correo", "activo"],
  JERARQUIA_CATEGORIAS: ["dep_id", "dep_desc", "division", "activo"],
  AVANCES_CATALOGO: ["avance_id", "catalogo_id", "catalogo", "comprador_id", "comprador", "division", "estado", "fecha_estado", "usuario"],
  NOTIFICACIONES: ["catalogo_id", "correo", "activo"],
  PROMOCIONES: [
    "row_id",
    "actividad_id",
    "oferta_id",
    "comprador",
    "division",
    "dep_id",
    "tipo_promo",
    "grupo_oferta",
    "tipo_sku",
    "variante",
    "sku",
    "num_parte",
    "descripcion",
    "tipo_cantidad",
    "cantidad_minima",
    "precio_antes",
    "precio_ahora",
    "descuento",
    "comentario_comprador",
    "aplica_segmento",
    "segmento_cliente",
    "segmento",
    "alcance_tipo",
    "alcance_valor",
    "estado_registro",
    "fecha_creacion",
    "fecha_modificacion",
    "ultima_modificacion_por",
  ],
  PROMOCIONES_DETALLE: ["detalle_id", "row_id", "actividad_id", "oferta_id", "grupo_oferta", "tipo_promo", "campo", "valor"],
  COMENTARIOS: [
    "comentario_id",
    "actividad_id",
    "row_id",
    "alcance_comentario",
    "prioridad",
    "usuario",
    "tipo_usuario",
    "comentario",
    "estado",
    "fecha",
    "resuelto_por",
    "fecha_resolucion",
  ],
  LOGS: [
    "log_id",
    "fecha",
    "usuario",
    "catalogo",
    "accion",
    "row_id",
    "campo",
    "valor_anterior",
    "valor_nuevo",
    "fecha_cierre",
  ],
  CONSOLIDADO: [
    "actividad_id",
    "oferta_id",
    "tipo_actividad",
    "canal",
    "alcance_tipo",
    "alcance_valor",
    "comprador",
    "division",
    "tipo_promo",
    "grupo_oferta",
    "tipo_sku",
    "variante",
    "sku",
    "num_parte",
    "descripcion",
    "tipo_cantidad",
    "cantidad_minima",
    "precio_antes",
    "precio_ahora",
    "descuento",
    "comentario_comprador",
    "aplica_segmento",
    "segmento_cliente",
    "segmento",
    "estado_registro",
    "comentarios_abiertos",
    "total_comentarios",
    "comentarios_actividad",
    "comentarios_actividad_abiertos",
    "fecha_modificacion",
    "ultima_modificacion_por",
  ],
  EXPORT_PRICING: [
    "actividad_id",
    "oferta_id",
    "tipo_actividad",
    "canal",
    "alcance_tipo",
    "alcance_valor",
    "comprador",
    "tipo_promo",
    "grupo_oferta",
    "tipo_sku",
    "variante",
    "sku",
    "tipo_cantidad",
    "cantidad_minima",
    "precio_antes",
    "precio_ahora",
    "descuento",
    "aplica_segmento",
    "segmento_cliente",
    "segmento",
    "estado_registro",
    "comentarios_actividad",
  ],
  EXPORT_MERCADEO: [
    "actividad_id",
    "oferta_id",
    "tipo_actividad",
    "canal",
    "alcance_tipo",
    "alcance_valor",
    "comprador",
    "tipo_promo",
    "grupo_oferta",
    "variante",
    "sku",
    "num_parte",
    "descripcion",
    "precio_antes",
    "precio_ahora",
    "descuento",
    "comentario_comprador",
    "aplica_segmento",
    "segmento_cliente",
    "segmento",
    "comentarios_actividad",
    "comentarios_abiertos_mercadeo",
  ],
  EXPORT_PLANIMETRIA: [
    "actividad_id",
    "oferta_id",
    "tipo_actividad",
    "canal",
    "alcance_tipo",
    "alcance_valor",
    "comprador",
    "division",
    "tipo_promo",
    "grupo_oferta",
    "variante",
    "sku",
    "descripcion",
    "precio_antes",
    "precio_ahora",
    "descuento",
    "aplica_segmento",
    "segmento_cliente",
    "segmento",
    "comentarios_actividad",
  ],
};

function doGet(e) {
  return handleRequest_(readRequest_(e));
}

function doPost(e) {
  return handleRequest_(readRequest_(e));
}

function setupWorkbook() {
  return setupWorkbook_();
}

function rebuildViews() {
  return rebuildViews_();
}

function handleRequest_(request) {
  try {
    const action = request.action || "ping";
    assertAuthorized_(request.token);

    switch (action) {
      case "ping":
        return success_({
          message: "Promo API activa",
          spreadsheetId: SPREADSHEET_ID,
          spreadsheetUrl: getSpreadsheet_().getUrl(),
          generatedAt: now_(),
        }, request);
      case "setupWorkbook":
        return success_(setupWorkbook_(), request);
      case "getCatalog":
        return success_(loadCatalog_(), request);
      case "saveCatalog":
        return success_(saveCatalog_(request.data || {}, request.user || "Sistema"), request);
      case "saveSettings":
        return success_(saveSettings_(request.data || {}, request.user || "Sistema"), request);
      case "rebuildViews":
        return success_(rebuildViews_(), request);
      case "upsertPromocion":
        return success_(upsertPromocion_(request.data || {}, request.user || "Sistema"), request);
      case "deletePromocion":
        return success_(deletePromocion_(request.row_id || request.rowId, request.user || "Sistema"), request);
      case "upsertComentario":
        return success_(upsertComentario_(request.data || {}, request.user || "Mercadeo"), request);
      case "resolveComentario":
        return success_(resolveComentario_(request.comentario_id || request.comentarioId, request.estado || "RESUELTO", request.user || "Mercadeo"), request);
      default:
        throw new Error("Accion no soportada: " + action);
    }
  } catch (error) {
    return failure_(error, request);
  }
}

function readRequest_(e) {
  const params = (e && e.parameter) || {};
  const contents = e && e.postData && e.postData.contents;

  if (contents) {
    const contentType = String(e.postData.type || "").toLowerCase();
    const looksLikeJson = String(contents).trim().charAt(0) === "{";
    if (contentType.indexOf("json") >= 0 || looksLikeJson) {
      try {
        return JSON.parse(contents);
      } catch (error) {
        throw new Error("El cuerpo enviado no es JSON valido.");
      }
    }
  }

  if (params.payload) {
    try {
      return JSON.parse(params.payload);
    } catch (error) {
      throw new Error("El parametro payload no es JSON valido.");
    }
  }

  return params;
}

function success_(data, request) {
  return output_({ ok: true, data, requestId: request && request.requestId }, request);
}

function failure_(error, request) {
  return output_({ ok: false, error: String(error && error.message ? error.message : error), requestId: request && request.requestId }, request);
}

function output_(payload, request) {
  if (request && request.callback) return jsonpOutput_(payload, request.callback);
  if (request && request.transport === "iframe") return htmlPostMessageOutput_(payload);
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function jsonpOutput_(payload, callbackName) {
  const callback = String(callbackName || "").replace(/[^a-zA-Z0-9_.$]/g, "");
  if (!callback) return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
  return ContentService
    .createTextOutput(callback + "(" + JSON.stringify(payload) + ");")
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function htmlPostMessageOutput_(payload) {
  const json = JSON.stringify(payload)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return HtmlService
    .createHtmlOutput("<!doctype html><html><body><script>window.parent.postMessage(" + json + ", '*');</script></body></html>")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function assertAuthorized_(token) {
  const expectedToken = PropertiesService.getScriptProperties().getProperty(API_TOKEN_PROPERTY) || "";
  if (!expectedToken) return;
  if (String(token || "") !== expectedToken) throw new Error("Token de conexion invalido.");
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function setupWorkbook_() {
  const ss = getSpreadsheet_();
  ensureWorkbook_(ss);
  return {
    spreadsheetId: SPREADSHEET_ID,
    spreadsheetUrl: ss.getUrl(),
    sheets: Object.keys(SHEETS).map(function (key) {
      return SHEETS[key];
    }),
    generatedAt: now_(),
  };
}

function ensureWorkbook_(ss) {
  Object.keys(SHEETS).forEach(function (key) {
    const sheetName = SHEETS[key];
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) sheet = ss.insertSheet(sheetName);
    const headers = HEADERS[sheetName] || [];
    if (sheet.getLastRow() === 0) {
      writeObjects_(sheet, [], headers);
    } else {
      ensureHeaders_(sheet, headers);
    }
  });
}

function loadCatalog_() {
  const ss = getSpreadsheet_();
  ensureWorkbook_(ss);

  const promociones = sheetToObjects_(ss.getSheetByName(SHEETS.PROMOCIONES)).map(normalizePromocion_);
  const actividades = sheetToObjects_(ss.getSheetByName(SHEETS.ACTIVIDADES)).map(normalizeActividad_);
  const promocionesDetalle = sheetToObjects_(ss.getSheetByName(SHEETS.PROMOCIONES_DETALLE)).map(normalizePromocionDetalle_);
  const comentarios = sheetToObjects_(ss.getSheetByName(SHEETS.COMENTARIOS)).map(normalizeComentario_);
  const logs = sheetToObjects_(ss.getSheetByName(SHEETS.LOGS)).map(normalizeLog_);

  return {
    config: sheetToObjects_(ss.getSheetByName(SHEETS.CONFIG)),
    catalogos: sheetToObjects_(ss.getSheetByName(SHEETS.CATALOGOS)).map(normalizeCatalogo_),
    segmentos_clientes: sheetToObjects_(ss.getSheetByName(SHEETS.SEGMENTOS_CLIENTES)).map(normalizeSegmentoCliente_),
    compradores: sheetToObjects_(ss.getSheetByName(SHEETS.COMPRADORES)).map(normalizeComprador_),
    responsables_solicitudes: sheetToObjects_(ss.getSheetByName(SHEETS.RESPONSABLES_SOLICITUDES)).map(normalizeResponsableSolicitud_),
    jerarquia_categorias: sheetToObjects_(ss.getSheetByName(SHEETS.JERARQUIA_CATEGORIAS)).map(normalizeJerarquiaCategoria_),
    avances_catalogo: sheetToObjects_(ss.getSheetByName(SHEETS.AVANCES_CATALOGO)).map(normalizeAvanceCatalogo_),
    actividades,
    promociones,
    promociones_detalle: promocionesDetalle,
    comentarios,
    logs,
    notificaciones: sheetToObjects_(ss.getSheetByName(SHEETS.NOTIFICACIONES)).map(normalizeNotificacion_),
    spreadsheetId: SPREADSHEET_ID,
    spreadsheetUrl: ss.getUrl(),
    generatedAt: now_(),
    views: {
      consolidado: buildConsolidado_(promociones, comentarios, actividades),
      export_pricing: buildPricingExport_(promociones, comentarios, actividades),
      export_mercadeo: buildMercadeoExport_(promociones, comentarios, actividades),
      export_planimetria: buildPlanimetriaExport_(promociones, comentarios, actividades),
    },
  };
}

function saveCatalog_(data, user) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    const ss = getSpreadsheet_();
    ensureWorkbook_(ss);

    const promociones = (data.promociones || []).map(normalizePromocion_);
    const promocionesByRowId = promociones.reduce(function (acc, promo) {
      if (promo.row_id) acc[promo.row_id] = promo;
      return acc;
    }, {});
    const actividades = (data.actividades || []).map(normalizeActividad_);
    const promocionesDetalle = (data.promociones_detalle || []).map(normalizePromocionDetalle_).map(function (detalle) {
      const promo = promocionesByRowId[detalle.row_id] || {};
      detalle.actividad_id = detalle.actividad_id || promo.actividad_id || "";
      detalle.oferta_id = detalle.oferta_id || promo.oferta_id || "";
      detalle.grupo_oferta = detalle.grupo_oferta || promo.grupo_oferta || "";
      detalle.tipo_promo = detalle.tipo_promo || promo.tipo_promo || "";
      return detalle;
    });
    const comentarios = (data.comentarios || []).map(normalizeComentario_);
    const validationErrors = validateActividades_(actividades).concat(validatePromociones_(promociones));
    if (validationErrors.length) throw new Error(validationErrors.join("\n"));

    const logs = (data.logs || []).map(normalizeLog_);
    logs.unshift(normalizeLog_({
      fecha: now_(),
      usuario: user || "Sistema",
      catalogo: data.catalogo_nombre || "",
      accion: "Sincronización con Google Sheets",
      campo: "SYNC",
      valor_anterior: data.sync_request_id || "",
      valor_nuevo: promociones.length + " promociones",
    }));

    writeObjects_(ss.getSheetByName(SHEETS.CONFIG), data.config || [], HEADERS.CONFIG);
    writeObjects_(ss.getSheetByName(SHEETS.CATALOGOS), (data.catalogos || []).map(normalizeCatalogo_), HEADERS.CATALOGOS);
    writeObjects_(ss.getSheetByName(SHEETS.ACTIVIDADES), actividades, HEADERS.ACTIVIDADES);
    writeObjects_(ss.getSheetByName(SHEETS.SEGMENTOS_CLIENTES), (data.segmentos_clientes || []).map(normalizeSegmentoCliente_), HEADERS.SEGMENTOS_CLIENTES);
    writeObjects_(ss.getSheetByName(SHEETS.COMPRADORES), (data.compradores || []).map(normalizeComprador_), HEADERS.COMPRADORES);
    writeObjects_(ss.getSheetByName(SHEETS.RESPONSABLES_SOLICITUDES), (data.responsables_solicitudes || []).map(normalizeResponsableSolicitud_), HEADERS.RESPONSABLES_SOLICITUDES);
    writeObjects_(ss.getSheetByName(SHEETS.JERARQUIA_CATEGORIAS), (data.jerarquia_categorias || []).map(normalizeJerarquiaCategoria_), HEADERS.JERARQUIA_CATEGORIAS);
    writeObjects_(ss.getSheetByName(SHEETS.AVANCES_CATALOGO), (data.avances_catalogo || []).map(normalizeAvanceCatalogo_), HEADERS.AVANCES_CATALOGO);
    writeObjects_(ss.getSheetByName(SHEETS.NOTIFICACIONES), (data.notificaciones || []).map(normalizeNotificacion_), HEADERS.NOTIFICACIONES);
    writeObjects_(ss.getSheetByName(SHEETS.PROMOCIONES), promociones, HEADERS.PROMOCIONES);
    writeObjects_(ss.getSheetByName(SHEETS.PROMOCIONES_DETALLE), promocionesDetalle, HEADERS.PROMOCIONES_DETALLE);
    writeObjects_(ss.getSheetByName(SHEETS.COMENTARIOS), comentarios, HEADERS.COMENTARIOS);
    writeObjects_(ss.getSheetByName(SHEETS.LOGS), logs, HEADERS.LOGS);
    writeGeneratedViews_(ss, promociones, comentarios, actividades);

    return loadCatalog_();
  } finally {
    lock.releaseLock();
  }
}

function saveSettings_(data, user) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    const ss = getSpreadsheet_();
    ensureWorkbook_(ss);

    const config = data.config || [];
    const catalogos = (data.catalogos || []).map(normalizeCatalogo_);
    const actividades = (data.actividades || []).map(normalizeActividad_);
    const segmentos = (data.segmentos_clientes || []).map(normalizeSegmentoCliente_);
    const compradores = (data.compradores || []).map(normalizeComprador_);
    const responsablesSolicitudes = (data.responsables_solicitudes || []).map(normalizeResponsableSolicitud_);
    const jerarquiaCategorias = (data.jerarquia_categorias || []).map(normalizeJerarquiaCategoria_);
    const avancesCatalogo = (data.avances_catalogo || []).map(normalizeAvanceCatalogo_);
    const notificaciones = (data.notificaciones || []).map(normalizeNotificacion_);
    const validationErrors = validateActividades_(actividades);
    if (validationErrors.length) throw new Error(validationErrors.join("\n"));

    const promociones = sheetToObjects_(ss.getSheetByName(SHEETS.PROMOCIONES)).map(normalizePromocion_);
    const comentarios = sheetToObjects_(ss.getSheetByName(SHEETS.COMENTARIOS)).map(normalizeComentario_);
    const logs = sheetToObjects_(ss.getSheetByName(SHEETS.LOGS)).map(normalizeLog_);
    logs.unshift(normalizeLog_({
      fecha: now_(),
      usuario: user || "Sistema",
      catalogo: data.catalogo_nombre || "Ajustes",
      accion: "Sincronización de ajustes con Google Sheets",
      campo: "SYNC",
      valor_anterior: data.sync_request_id || "",
      valor_nuevo: catalogos.length + " catalogos / " + compradores.length + " compradores",
    }));

    writeObjects_(ss.getSheetByName(SHEETS.CONFIG), config, HEADERS.CONFIG);
    writeObjects_(ss.getSheetByName(SHEETS.CATALOGOS), catalogos, HEADERS.CATALOGOS);
    writeObjects_(ss.getSheetByName(SHEETS.ACTIVIDADES), actividades, HEADERS.ACTIVIDADES);
    writeObjects_(ss.getSheetByName(SHEETS.SEGMENTOS_CLIENTES), segmentos, HEADERS.SEGMENTOS_CLIENTES);
    writeObjects_(ss.getSheetByName(SHEETS.COMPRADORES), compradores, HEADERS.COMPRADORES);
    writeObjects_(ss.getSheetByName(SHEETS.RESPONSABLES_SOLICITUDES), responsablesSolicitudes, HEADERS.RESPONSABLES_SOLICITUDES);
    writeObjects_(ss.getSheetByName(SHEETS.JERARQUIA_CATEGORIAS), jerarquiaCategorias, HEADERS.JERARQUIA_CATEGORIAS);
    writeObjects_(ss.getSheetByName(SHEETS.AVANCES_CATALOGO), avancesCatalogo, HEADERS.AVANCES_CATALOGO);
    writeObjects_(ss.getSheetByName(SHEETS.NOTIFICACIONES), notificaciones, HEADERS.NOTIFICACIONES);
    writeObjects_(ss.getSheetByName(SHEETS.LOGS), logs, HEADERS.LOGS);
    writeGeneratedViews_(ss, promociones, comentarios, actividades);

    return loadCatalog_();
  } finally {
    lock.releaseLock();
  }
}

function rebuildViews_() {
  const ss = getSpreadsheet_();
  ensureWorkbook_(ss);
  const promociones = sheetToObjects_(ss.getSheetByName(SHEETS.PROMOCIONES)).map(normalizePromocion_);
  const actividades = sheetToObjects_(ss.getSheetByName(SHEETS.ACTIVIDADES)).map(normalizeActividad_);
  const comentarios = sheetToObjects_(ss.getSheetByName(SHEETS.COMENTARIOS)).map(normalizeComentario_);
  const validationErrors = validatePromociones_(promociones);
  if (validationErrors.length) throw new Error(validationErrors.join("\n"));
  writeGeneratedViews_(ss, promociones, comentarios, actividades);
  return loadCatalog_();
}

function upsertPromocion_(promocion, user) {
  const catalog = loadCatalog_();
  const next = normalizePromocion_(promocion);
  const index = catalog.promociones.findIndex(function (item) {
    return item.row_id === next.row_id;
  });

  if (index >= 0) catalog.promociones[index] = next;
  else catalog.promociones.push(next);

  catalog.logs = catalog.logs || [];
  catalog.logs.unshift(normalizeLog_({
    fecha: now_(),
    usuario: user || next.comprador || "Sistema",
    catalogo: next.actividad_id,
    accion: (index >= 0 ? "Actualizo promocion " : "Agrego promocion ") + next.sku,
    row_id: next.row_id,
  }));

  return saveCatalog_(catalog, user || "Sistema");
}

function deletePromocion_(rowId, user) {
  if (!rowId) throw new Error("row_id es obligatorio para eliminar una promocion.");
  const catalog = loadCatalog_();
  const before = catalog.promociones.length;
  catalog.promociones = catalog.promociones.filter(function (item) {
    return item.row_id !== rowId;
  });
  if (catalog.promociones.length === before) throw new Error("No se encontro la promocion " + rowId);

  catalog.logs = catalog.logs || [];
  catalog.logs.unshift(normalizeLog_({
    fecha: now_(),
    usuario: user || "Sistema",
    accion: "Elimino promocion",
    row_id: rowId,
  }));

  return saveCatalog_(catalog, user || "Sistema");
}

function upsertComentario_(comentario, user) {
  const catalog = loadCatalog_();
  const next = normalizeComentario_(comentario);
  const index = catalog.comentarios.findIndex(function (item) {
    return item.comentario_id === next.comentario_id;
  });

  if (index >= 0) catalog.comentarios[index] = next;
  else catalog.comentarios.unshift(next);

  catalog.logs = catalog.logs || [];
  catalog.logs.unshift(normalizeLog_({
    fecha: now_(),
    usuario: user || next.usuario || "Mercadeo",
    catalogo: next.actividad_id,
    accion: (index >= 0 ? "Actualizo comentario" : "Agrego comentario"),
    row_id: next.row_id,
    campo: "comentario_mercadeo",
  }));

  return saveCatalog_(catalog, user || "Mercadeo");
}

function resolveComentario_(comentarioId, estado, user) {
  if (!comentarioId) throw new Error("comentario_id es obligatorio.");
  const catalog = loadCatalog_();
  let found = false;
  const normalizedEstado = String(estado || "RESUELTO").toUpperCase();

  catalog.comentarios = catalog.comentarios.map(function (item) {
    if (item.comentario_id !== comentarioId) return item;
    found = true;
    item.estado = normalizedEstado;
    item.resuelto_por = normalizedEstado === "RESUELTO" ? user || item.resuelto_por : "";
    item.fecha_resolucion = normalizedEstado === "RESUELTO" ? now_() : "";
    return normalizeComentario_(item);
  });

  if (!found) throw new Error("No se encontro el comentario " + comentarioId);

  catalog.logs = catalog.logs || [];
  catalog.logs.unshift(normalizeLog_({
    fecha: now_(),
    usuario: user || "Mercadeo",
    accion: "Cambio estado de comentario a " + normalizedEstado,
    campo: "estado_comentario",
    valor_nuevo: normalizedEstado,
  }));

  return saveCatalog_(catalog, user || "Mercadeo");
}

function writeGeneratedViews_(ss, promociones, comentarios, actividades) {
  writeObjects_(ss.getSheetByName(SHEETS.CONSOLIDADO), buildConsolidado_(promociones, comentarios, actividades), HEADERS.CONSOLIDADO);
  writeObjects_(ss.getSheetByName(SHEETS.EXPORT_PRICING), buildPricingExport_(promociones, comentarios, actividades), HEADERS.EXPORT_PRICING);
  writeObjects_(ss.getSheetByName(SHEETS.EXPORT_MERCADEO), buildMercadeoExport_(promociones, comentarios, actividades), HEADERS.EXPORT_MERCADEO);
  writeObjects_(ss.getSheetByName(SHEETS.EXPORT_PLANIMETRIA), buildPlanimetriaExport_(promociones, comentarios, actividades), HEADERS.EXPORT_PLANIMETRIA);
}

function sheetToObjects_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (!lastRow || !lastColumn) return [];

  const values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  const headers = values[0].map(function (header) {
    return String(header || "").trim();
  });

  const rows = [];
  for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    const row = {};
    let hasValue = false;
    for (let columnIndex = 0; columnIndex < headers.length; columnIndex += 1) {
      const header = headers[columnIndex];
      if (!header) continue;
      const value = formatCellValue_(values[rowIndex][columnIndex]);
      if (value !== "") hasValue = true;
      row[header] = value;
    }
    if (hasValue) rows.push(row);
  }

  return rows;
}

function writeObjects_(sheet, data, preferredHeaders) {
  const rows = Array.isArray(data) ? data : [];
  const headers = buildHeaders_(preferredHeaders || [], rows);
  const matrix = [headers].concat(rows.map(function (row) {
    return headers.map(function (header) {
      return cellValue_(row[header]);
    });
  }));

  sheet.clearContents();
  if (!headers.length) return;
  sheet.getRange(1, 1, matrix.length, headers.length).setValues(matrix);
  sheet.setFrozenRows(1);
}

function ensureHeaders_(sheet, preferredHeaders) {
  const headers = preferredHeaders || [];
  const lastColumn = sheet.getLastColumn();
  if (!headers.length) return;
  if (!lastColumn) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return;
  }

  const currentHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function (header) {
    return String(header || "").trim();
  });
  const seen = currentHeaders.reduce(function (acc, header) {
    if (header) acc[normalizeHeader_(header)] = true;
    return acc;
  }, {});
  const missing = headers.filter(function (header) {
    return !seen[normalizeHeader_(header)];
  });

  if (!missing.length) return;
  sheet.getRange(1, lastColumn + 1, 1, missing.length).setValues([missing]);
  sheet.setFrozenRows(1);
}

function buildHeaders_(preferredHeaders, rows) {
  const headers = [];
  const seen = {};

  function add(header) {
    const value = String(header || "").trim();
    if (!value || seen[value]) return;
    seen[value] = true;
    headers.push(value);
  }

  (preferredHeaders || []).forEach(add);
  rows.forEach(function (row) {
    Object.keys(row || {}).forEach(add);
  });

  return headers;
}

function formatCellValue_(value) {
  if (value instanceof Date) return value.toISOString();
  if (value === null || value === undefined) return "";
  return value;
}

function cellValue_(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value) || (typeof value === "object" && !(value instanceof Date))) return JSON.stringify(value);
  return value;
}

function createDerivedOfferId_(actividadId, tipoPromo, grupoOferta, rowId) {
  const activityKey = normalizeHeader_(actividadId) || "actividad";
  const typeKey = normalizeHeader_(tipoPromo) || "promo";
  const groupKey = normalizeHeader_(grupoOferta);
  if (isComplexType_(tipoPromo) && groupKey) return "OFE-" + activityKey + "-" + typeKey + "-" + groupKey;
  return "OFE-" + activityKey + "-" + typeKey + "-" + (normalizeHeader_(rowId) || createId_("ROW"));
}

function resolveOfferId_(row, rowId, actividadId, tipoPromo, grupoOferta) {
  return getByAliases_(row, ["oferta_id", "ofertaId"]) || createDerivedOfferId_(actividadId, tipoPromo, grupoOferta, rowId);
}

function normalizePromocion_(row) {
  const rowId = getByAliases_(row, ["row_id", "id"]) || createId_("ROW");
  const actividadId = getByAliases_(row, ["actividad_id", "actividadId"]) || getByAliases_(row, ["catalogo_id", "catalogo"]) || "";
  const tipoPromo = getByAliases_(row, ["tipo_promo", "tipoPromo"]) || "";
  const grupoOferta = getByAliases_(row, ["grupo_oferta", "grupoOferta"]) || "";
  const ofertaId = resolveOfferId_(row, rowId, actividadId, tipoPromo, grupoOferta);
  const segmento = getByAliases_(row, ["segmento_cliente", "segmentoCliente", "segmento", "segmentos"]) || "";
  const aplicaSegmento = normalizeAplicaSegmento_(getByAliases_(row, ["aplica_segmento", "aplicaSegmento"]), segmento);
  return {
    row_id: rowId,
    actividad_id: actividadId,
    oferta_id: ofertaId,
    comprador: getByAliases_(row, ["comprador", "buyer"]) || "",
    division: getByAliases_(row, ["division"]) || "",
    dep_id: getByAliases_(row, ["dep_id", "depId", "dept", "DEPT"]) || "",
    tipo_promo: tipoPromo,
    grupo_oferta: grupoOferta,
    tipo_sku: getByAliases_(row, ["tipo_sku", "tipoSku"]) || "",
    variante: getByAliases_(row, ["variante", "variant"]) || "",
    sku: String(getByAliases_(row, ["sku", "codigo"]) || "").trim(),
    num_parte: getByAliases_(row, ["num_parte", "numParte", "vpn"]) || "",
    descripcion: getByAliases_(row, ["descripcion"]) || "",
    tipo_cantidad: getByAliases_(row, ["tipo_cantidad", "tipoCantidad"]) || "Exacta",
    cantidad_minima: normalizeNumber_(getByAliases_(row, ["cantidad_minima", "cantidadMinima"]) || 1),
    precio_antes: normalizeNumber_(getByAliases_(row, ["precio_antes", "precioAntes"])),
    precio_ahora: normalizeNumber_(getByAliases_(row, ["precio_ahora", "precioAhora"])),
    descuento: getByAliases_(row, ["descuento"]) || "",
    comentario_comprador: getByAliases_(row, ["comentario_comprador", "comentario"]) || "",
    aplica_segmento: aplicaSegmento,
    segmento_cliente: aplicaSegmento === "SI" ? segmento : "",
    segmento: aplicaSegmento === "SI" ? segmento : "Todos",
    alcance_tipo: normalizeAlcanceType_(getByAliases_(row, ["alcance_tipo", "alcanceTipo"])),
    alcance_valor: getByAliases_(row, ["alcance_valor", "alcanceValor"]) || "",
    estado_registro: getByAliases_(row, ["estado_registro"]) || "BORRADOR",
    fecha_creacion: getByAliases_(row, ["fecha_creacion"]) || now_(),
    fecha_modificacion: getByAliases_(row, ["fecha_modificacion"]) || "",
    ultima_modificacion_por: getByAliases_(row, ["ultima_modificacion_por"]) || "",
  };
}

function getCommentScope_(row) {
  const explicit = String(getByAliases_(row, ["alcance_comentario", "alcanceComentario", "tipo_comentario"]) || "").trim().toUpperCase();
  if (["ACTIVIDAD", "CATALOGO", "CATÁLOGO", "GENERAL"].indexOf(explicit) >= 0) return COMMENT_SCOPE_ACTIVITY;
  if (["LINEA", "LÍNEA", "SKU"].indexOf(explicit) >= 0) return COMMENT_SCOPE_LINE;
  return getByAliases_(row, ["row_id", "rowId"]) ? COMMENT_SCOPE_LINE : COMMENT_SCOPE_ACTIVITY;
}

function isActivityComment_(row) {
  return getCommentScope_(row) === COMMENT_SCOPE_ACTIVITY;
}

function isLineComment_(row) {
  return getCommentScope_(row) === COMMENT_SCOPE_LINE;
}

function formatComments_(comments) {
  return (comments || []).map(function (comment) {
    return String((comment.estado || "") + ": " + (comment.comentario || "")).trim();
  }).filter(Boolean).join(" | ");
}

function normalizeComentario_(row) {
  const estado = String(getByAliases_(row, ["estado"]) || "ABIERTO").toUpperCase();
  const scope = getCommentScope_(row);
  return {
    comentario_id: getByAliases_(row, ["comentario_id", "id"]) || createId_("CMT"),
    actividad_id: getByAliases_(row, ["actividad_id", "actividadId", "catalogo_id", "catalogo"]) || "",
    row_id: scope === COMMENT_SCOPE_ACTIVITY ? "" : getByAliases_(row, ["row_id", "rowId"]) || "",
    alcance_comentario: scope,
    prioridad: String(getByAliases_(row, ["prioridad"]) || "MEDIA").toUpperCase(),
    usuario: getByAliases_(row, ["usuario"]) || "",
    tipo_usuario: getByAliases_(row, ["tipo_usuario", "tipoUsuario"]) || "",
    comentario: getByAliases_(row, ["comentario", "texto"]) || "",
    estado: estado === "RESUELTO" ? "RESUELTO" : "ABIERTO",
    fecha: getByAliases_(row, ["fecha"]) || now_(),
    resuelto_por: getByAliases_(row, ["resuelto_por"]) || "",
    fecha_resolucion: getByAliases_(row, ["fecha_resolucion"]) || "",
  };
}

function normalizePromocionDetalle_(row) {
  return {
    detalle_id: getByAliases_(row, ["detalle_id", "id"]) || createId_("DET"),
    row_id: getByAliases_(row, ["row_id", "rowId"]) || "",
    actividad_id: getByAliases_(row, ["actividad_id", "actividadId"]) || "",
    oferta_id: getByAliases_(row, ["oferta_id", "ofertaId"]) || "",
    grupo_oferta: getByAliases_(row, ["grupo_oferta", "grupoOferta"]) || "",
    tipo_promo: getByAliases_(row, ["tipo_promo", "tipoPromo"]) || "",
    campo: getByAliases_(row, ["campo", "field"]) || "",
    valor: getByAliases_(row, ["valor", "value"]) || "",
  };
}

function normalizeLog_(row) {
  return {
    log_id: getByAliases_(row, ["log_id", "id"]) || createId_("LOG"),
    fecha: getByAliases_(row, ["fecha"]) || now_(),
    usuario: getByAliases_(row, ["usuario"]) || "",
    catalogo: getByAliases_(row, ["catalogo", "catalogo_id"]) || "",
    accion: getByAliases_(row, ["accion"]) || "",
    row_id: getByAliases_(row, ["row_id", "rowId"]) || "",
    campo: getByAliases_(row, ["campo"]) || "",
    valor_anterior: getByAliases_(row, ["valor_anterior"]) || "",
    valor_nuevo: getByAliases_(row, ["valor_nuevo"]) || "",
    fecha_cierre: getByAliases_(row, ["fecha_cierre"]) || "",
  };
}

function normalizeComprador_(row) {
  const seniorId = getByAliases_(row, ["senior_id", "seniorId", "senior", "comprador_senior_id"]) || "";
  const categoriaRaw = getByAliases_(row, ["categoria_comprador", "categoriaComprador", "categoria", "tipo_comprador"]) || "";
  const categoria = String(categoriaRaw || (seniorId ? "Junior" : "Senior")).trim().toLowerCase() === "junior" ? "Junior" : "Senior";
  const activoRaw = getByAliases_(row, ["activo"]);
  return {
    comprador_id: getByAliases_(row, ["comprador_id", "compradorId", "id"]) || "",
    categoria_comprador: categoria,
    comprador: getByAliases_(row, ["comprador", "nombre"]) || "",
    division: getByAliases_(row, ["division", "divisiones"]) || "",
    correo: getByAliases_(row, ["correo", "email"]) || "",
    activo: activoRaw === "" ? true : normalizeBoolean_(activoRaw),
    senior_id: seniorId,
  };
}

function normalizeResponsableSolicitud_(row) {
  const nombre = getByAliases_(row, ["nombre", "responsable", "usuario"]) || "";
  const area = getByAliases_(row, ["area", "departamento", "equipo"]) || "";
  const activoRaw = getByAliases_(row, ["activo"]);
  return {
    responsable_id: getByAliases_(row, ["responsable_id", "responsableId", "id"]) || [normalizeHeader_(area) || "resp", normalizeHeader_(nombre) || createId_("RESP")].join("-"),
    nombre,
    area,
    correo: getByAliases_(row, ["correo", "email"]) || "",
    activo: activoRaw === "" ? true : normalizeBoolean_(activoRaw),
  };
}

function normalizeJerarquiaCategoria_(row) {
  const activoRaw = getByAliases_(row, ["activo"]);
  return {
    dep_id: String(getByAliases_(row, ["dep_id", "depId", "dept", "DEPT"]) || "").trim(),
    dep_desc: getByAliases_(row, ["dep_desc", "depDesc", "departamento", "descripcion"]) || "",
    division: getByAliases_(row, ["division", "categoria"]) || "",
    activo: activoRaw === "" ? true : normalizeBoolean_(activoRaw),
  };
}

function normalizeAvanceCatalogo_(row) {
  const catalogoId = getByAliases_(row, ["catalogo_id", "catalogoId"]) || "";
  const comprador = getByAliases_(row, ["comprador", "comprador_nombre"]) || "";
  const division = getByAliases_(row, ["division"]) || "";
  const estado = getByAliases_(row, ["estado"]) || (normalizeBoolean_(getByAliases_(row, ["terminado"])) ? "Terminado" : "Pendiente");
  return {
    avance_id: getByAliases_(row, ["avance_id", "avanceId", "id"]) || [catalogoId, normalizeHeader_(division), normalizeHeader_(comprador)].join("__"),
    catalogo_id: catalogoId,
    catalogo: getByAliases_(row, ["catalogo", "catalogo_nombre"]) || "",
    comprador_id: getByAliases_(row, ["comprador_id", "compradorId"]) || "",
    comprador,
    division,
    estado: String(estado).trim().toLowerCase() === "terminado" ? "Terminado" : "Pendiente",
    fecha_estado: getByAliases_(row, ["fecha_estado", "fechaEstado", "fecha"]) || now_(),
    usuario: getByAliases_(row, ["usuario"]) || comprador,
  };
}

function normalizeCatalogo_(row) {
  const catalogoId = getByAliases_(row, ["catalogo_id", "catalogoId", "id"]) || createId_("CAT");
  return {
    catalogo_id: catalogoId,
    nombre: getByAliases_(row, ["nombre", "catalogo", "catalogo_nombre"]) || "",
    canal: getByAliases_(row, ["canal"]) || "",
    vigencia_inicio: getByAliases_(row, ["vigencia_inicio", "vigenciaInicio", "inicio"]) || "",
    vigencia_fin: getByAliases_(row, ["vigencia_fin", "vigenciaFin", "fin"]) || "",
    vigencia: getByAliases_(row, ["vigencia"]) || "",
    estado: getByAliases_(row, ["estado"]) || "Borrador",
    color: getByAliases_(row, ["color"]) || "bg-emerald-700",
    doc_id: getByAliases_(row, ["doc_id", "docId", "documento_id"]) || "",
    token_conexion: getByAliases_(row, ["token_conexion", "tokenConexion"]) || "",
    notificaciones: normalizeBoolean_(getByAliases_(row, ["notificaciones"])),
    correos: getByAliases_(row, ["correos", "correo"]) || "",
    divisiones: getByAliases_(row, ["divisiones", "divisiones_catalogo", "categorias", "categorias_catalogo"]) || "",
  };
}

function normalizeActivityType_(value) {
  const text = String(value || "").trim().toUpperCase();
  return ACTIVITY_TYPES.indexOf(text) >= 0 ? text : "";
}

function normalizeAlcanceType_(value) {
  const text = String(value || "").trim().toUpperCase();
  return ALCANCE_TYPES.indexOf(text) >= 0 ? text : "";
}

function normalizeSpecialRequestStatus_(value) {
  const text = normalizeHeader_(value);
  if (["aprovado", "aprovada", "aprobado", "aprobada", "asignado", "asignada"].indexOf(text) >= 0) return "Aprovado";
  if (["entrabajo", "trabajando", "enproceso", "proceso", "activo", "activa"].indexOf(text) >= 0) return "En trabajo";
  if (["finalizado", "finalizada", "resuelto", "resuelta", "cerrado", "cerrada"].indexOf(text) >= 0) return "Finalizado";
  return "Nuevo";
}

function normalizeHours_(value) {
  const number = Number(value || 0);
  return isNaN(number) ? 0 : number;
}

function normalizeActividad_(row) {
  const actividadId = getByAliases_(row, ["actividad_id", "actividadId", "catalogo_id", "id"]) || createId_("ACT");
  const tipoActividad = normalizeActivityType_(getByAliases_(row, ["tipo_actividad", "tipoActividad"])) || "CATALOGO";
  const estadoRaw = getByAliases_(row, ["estado"]) || "Borrador";
  const estado = tipoActividad === "ESPECIAL" ? normalizeSpecialRequestStatus_(estadoRaw) : estadoRaw;
  return {
    actividad_id: actividadId,
    nombre_actividad: getByAliases_(row, ["nombre_actividad", "nombreActividad", "nombre", "catalogo"]) || "",
    tipo_actividad: tipoActividad,
    canal: getByAliases_(row, ["canal"]) || "",
    fecha_inicio: getByAliases_(row, ["fecha_inicio", "fechaInicio", "vigencia_inicio"]) || "",
    fecha_fin: getByAliases_(row, ["fecha_fin", "fechaFin", "vigencia_fin"]) || "",
    solicitante: getByAliases_(row, ["solicitante", "comprador"]) || "",
    estado: estado,
    fecha_creacion: getByAliases_(row, ["fecha_creacion", "fechaCreacion"]) || now_(),
    motivo_solicitud: getByAliases_(row, ["motivo_solicitud", "motivoSolicitud"]) || "",
    fecha_modificacion: getByAliases_(row, ["fecha_modificacion", "fechaModificacion"]) || "",
    responsable: getByAliases_(row, ["responsable"]) || "",
    recursos_ocupados: getByAliases_(row, ["recursos_ocupados", "recursosOcupados"]) || "",
    fecha_estado: getByAliases_(row, ["fecha_estado", "fechaEstado"]) || "",
    fecha_nuevo: getByAliases_(row, ["fecha_nuevo"]) || "",
    fecha_aprovado: getByAliases_(row, ["fecha_aprovado", "fecha_aprobado", "fecha_asignado"]) || "",
    fecha_entrabajo: getByAliases_(row, ["fecha_entrabajo", "fecha_en_trabajo", "fecha_trabajando"]) || "",
    fecha_finalizado: getByAliases_(row, ["fecha_finalizado", "fecha_resuelto"]) || "",
    fecha_asignado: getByAliases_(row, ["fecha_asignado", "fecha_aprovado"]) || "",
    fecha_trabajando: getByAliases_(row, ["fecha_trabajando", "fecha_entrabajo"]) || "",
    fecha_resuelto: getByAliases_(row, ["fecha_resuelto", "fecha_finalizado"]) || "",
    tiempo_nuevo_horas: normalizeHours_(getByAliases_(row, ["tiempo_nuevo_horas"])),
    tiempo_aprovado_horas: normalizeHours_(getByAliases_(row, ["tiempo_aprovado_horas", "tiempo_aprobado_horas", "tiempo_asignado_horas"])),
    tiempo_entrabajo_horas: normalizeHours_(getByAliases_(row, ["tiempo_entrabajo_horas", "tiempo_en_trabajo_horas", "tiempo_trabajando_horas"])),
    tiempo_finalizado_horas: normalizeHours_(getByAliases_(row, ["tiempo_finalizado_horas", "tiempo_resuelto_horas"])),
    tiempo_asignado_horas: normalizeHours_(getByAliases_(row, ["tiempo_asignado_horas", "tiempo_aprovado_horas"])),
    tiempo_trabajando_horas: normalizeHours_(getByAliases_(row, ["tiempo_trabajando_horas", "tiempo_entrabajo_horas"])),
    tiempo_resuelto_horas: normalizeHours_(getByAliases_(row, ["tiempo_resuelto_horas", "tiempo_finalizado_horas"])),
    tiempo_total_horas: normalizeHours_(getByAliases_(row, ["tiempo_total_horas"])),
    promo_ids: getByAliases_(row, ["promo_ids", "promoIds", "id_promos", "ids_promos"]) || "",
    oferta_ids: getByAliases_(row, ["oferta_ids", "ofertaIds", "id_ofertas", "ids_ofertas"]) || "",
  };
}

function normalizeSegmentoCliente_(row) {
  const canal = getByAliases_(row, ["canal"]) || "";
  const segmento = getByAliases_(row, ["nombre_segmento", "segmento", "nombre", "segmento_nombre"]) || "";
  const activoValue = getByAliases_(row, ["activo"]);
  return {
    segmento_id: getByAliases_(row, ["segmento_id", "id"]) || createSegmentoId_(canal, segmento),
    nombre_segmento: segmento,
    canal,
    activo: activoValue === "" ? true : normalizeBoolean_(activoValue),
    orden: normalizeNumber_(getByAliases_(row, ["orden"]) || ""),
  };
}

function normalizeNotificacion_(row) {
  return {
    catalogo_id: getByAliases_(row, ["catalogo_id", "catalogo"]) || "",
    correo: getByAliases_(row, ["correo", "email"]) || "",
    activo: normalizeBoolean_(getByAliases_(row, ["activo"])),
  };
}

function buildActivityMap_(actividades) {
  const map = {};
  (actividades || []).forEach(function (actividad) {
    if (actividad.actividad_id) map[actividad.actividad_id] = actividad;
  });
  return map;
}

function getPromoActivity_(promo, activityMap) {
  return activityMap[promo.actividad_id] || activityMap[promo.catalogo_id] || {};
}

function enrichPromo_(promo, activityMap) {
  const activity = getPromoActivity_(promo, activityMap);
  const tipoActividad = normalizeActivityType_(promo.tipo_actividad || activity.tipo_actividad) || (String(promo.actividad_id || "").indexOf("ESP-") === 0 ? "ESPECIAL" : "CATALOGO");
  return Object.assign({}, promo, {
    actividad_id: promo.actividad_id || activity.actividad_id || promo.catalogo_id || "",
    oferta_id: promo.oferta_id || createDerivedOfferId_(promo.actividad_id || activity.actividad_id || promo.catalogo_id || "", promo.tipo_promo, promo.grupo_oferta, promo.row_id),
    tipo_actividad: tipoActividad,
    nombre_actividad: activity.nombre_actividad || "",
    canal: activity.canal || promo.canal || "",
    alcance_tipo: normalizeAlcanceType_(promo.alcance_tipo) || "",
    alcance_valor: promo.alcance_valor || "",
    segmento_cliente: promo.segmento_cliente || (promo.aplica_segmento === "SI" ? promo.segmento || "" : ""),
  });
}

function buildConsolidado_(promociones, comentarios, actividades) {
  const activityMap = buildActivityMap_(actividades);
  return promociones.map(function (promo) {
    const enriched = enrichPromo_(promo, activityMap);
    const comentariosRow = comentarios.filter(function (item) {
      return isLineComment_(item) && item.row_id === promo.row_id;
    });
    const comentariosActividad = comentarios.filter(function (item) {
      return isActivityComment_(item) && item.actividad_id === enriched.actividad_id;
    });
    return {
      actividad_id: enriched.actividad_id,
      tipo_actividad: enriched.tipo_actividad,
      canal: enriched.canal,
      alcance_tipo: enriched.alcance_tipo,
      alcance_valor: enriched.alcance_valor,
      oferta_id: enriched.oferta_id,
      comprador: promo.comprador,
      division: promo.division,
      tipo_promo: promo.tipo_promo,
      grupo_oferta: promo.grupo_oferta,
      tipo_sku: promo.tipo_sku,
      variante: promo.variante,
      sku: promo.sku,
      num_parte: promo.num_parte,
      descripcion: promo.descripcion,
      tipo_cantidad: promo.tipo_cantidad,
      cantidad_minima: promo.cantidad_minima,
      precio_antes: promo.precio_antes,
      precio_ahora: promo.precio_ahora,
      descuento: promo.descuento,
      comentario_comprador: promo.comentario_comprador,
      aplica_segmento: promo.aplica_segmento,
      segmento_cliente: enriched.segmento_cliente,
      segmento: promo.segmento,
      estado_registro: promo.estado_registro,
      comentarios_abiertos: comentariosRow.filter(function (item) {
        return String(item.estado).toUpperCase() === "ABIERTO";
      }).length,
      total_comentarios: comentariosRow.length,
      comentarios_actividad: formatComments_(comentariosActividad),
      comentarios_actividad_abiertos: comentariosActividad.filter(function (item) {
        return String(item.estado).toUpperCase() === "ABIERTO";
      }).length,
      fecha_modificacion: promo.fecha_modificacion,
      ultima_modificacion_por: promo.ultima_modificacion_por,
    };
  });
}

function buildPricingExport_(promociones, comentarios, actividades) {
  const activityMap = buildActivityMap_(actividades);
  return promociones.map(function (promo) {
    const enriched = enrichPromo_(promo, activityMap);
    const comentariosActividad = comentarios.filter(function (item) {
      return isActivityComment_(item) && item.actividad_id === enriched.actividad_id;
    });
    return {
      actividad_id: enriched.actividad_id,
      tipo_actividad: enriched.tipo_actividad,
      canal: enriched.canal,
      alcance_tipo: enriched.alcance_tipo,
      alcance_valor: enriched.alcance_valor,
      oferta_id: enriched.oferta_id,
      comprador: promo.comprador,
      tipo_promo: promo.tipo_promo,
      grupo_oferta: promo.grupo_oferta,
      tipo_sku: promo.tipo_sku,
      variante: promo.variante,
      sku: promo.sku,
      tipo_cantidad: promo.tipo_cantidad,
      cantidad_minima: promo.cantidad_minima,
      precio_antes: promo.precio_antes,
      precio_ahora: promo.precio_ahora,
      descuento: promo.descuento,
      aplica_segmento: promo.aplica_segmento,
      segmento_cliente: enriched.segmento_cliente,
      segmento: promo.segmento,
      estado_registro: promo.estado_registro,
      comentarios_actividad: formatComments_(comentariosActividad),
    };
  });
}

function buildMercadeoExport_(promociones, comentarios, actividades) {
  const activityMap = buildActivityMap_(actividades);
  return promociones.map(function (promo) {
    const enriched = enrichPromo_(promo, activityMap);
    const comentariosActividad = comentarios.filter(function (item) {
      return isActivityComment_(item) && item.actividad_id === enriched.actividad_id;
    });
    const abiertos = comentarios
      .filter(function (comentario) {
        return isLineComment_(comentario) && comentario.row_id === promo.row_id && String(comentario.estado).toUpperCase() === "ABIERTO";
      })
      .map(function (comentario) {
        return comentario.comentario;
      })
      .join(" | ");

    return {
      actividad_id: enriched.actividad_id,
      tipo_actividad: enriched.tipo_actividad,
      canal: enriched.canal,
      alcance_tipo: enriched.alcance_tipo,
      alcance_valor: enriched.alcance_valor,
      oferta_id: enriched.oferta_id,
      comprador: promo.comprador,
      tipo_promo: promo.tipo_promo,
      grupo_oferta: promo.grupo_oferta,
      variante: promo.variante,
      sku: promo.sku,
      num_parte: promo.num_parte,
      descripcion: promo.descripcion,
      precio_antes: promo.precio_antes,
      precio_ahora: promo.precio_ahora,
      descuento: promo.descuento,
      comentario_comprador: promo.comentario_comprador,
      aplica_segmento: promo.aplica_segmento,
      segmento_cliente: enriched.segmento_cliente,
      segmento: promo.segmento,
      comentarios_actividad: formatComments_(comentariosActividad),
      comentarios_abiertos_mercadeo: abiertos,
    };
  });
}

function buildPlanimetriaExport_(promociones, comentarios, actividades) {
  const activityMap = buildActivityMap_(actividades);
  return promociones.map(function (promo) {
    const enriched = enrichPromo_(promo, activityMap);
    const comentariosActividad = comentarios.filter(function (item) {
      return isActivityComment_(item) && item.actividad_id === enriched.actividad_id;
    });
    return {
      actividad_id: enriched.actividad_id,
      tipo_actividad: enriched.tipo_actividad,
      canal: enriched.canal,
      alcance_tipo: enriched.alcance_tipo,
      alcance_valor: enriched.alcance_valor,
      oferta_id: enriched.oferta_id,
      comprador: promo.comprador,
      division: promo.division,
      tipo_promo: promo.tipo_promo,
      grupo_oferta: promo.grupo_oferta,
      variante: promo.variante,
      sku: promo.sku,
      descripcion: promo.descripcion,
      precio_antes: promo.precio_antes,
      precio_ahora: promo.precio_ahora,
      descuento: promo.descuento,
      aplica_segmento: promo.aplica_segmento,
      segmento_cliente: enriched.segmento_cliente,
      segmento: promo.segmento,
      comentarios_actividad: formatComments_(comentariosActividad),
    };
  });
}

function validateActividades_(actividades) {
  const errors = [];
  (actividades || []).forEach(function (actividad, index) {
    const rowNumber = index + 2;
    if (!actividad.actividad_id) errors.push("ACTIVIDADES fila " + rowNumber + ": actividad_id vacio.");
    if (ACTIVITY_TYPES.indexOf(actividad.tipo_actividad) < 0) errors.push("ACTIVIDADES fila " + rowNumber + ": tipo_actividad invalido.");
    if (actividad.tipo_actividad === "ESPECIAL") {
      if (!actividad.solicitante) errors.push("ACTIVIDADES fila " + rowNumber + ": especial sin solicitante.");
      if (!actividad.canal) errors.push("ACTIVIDADES fila " + rowNumber + ": especial sin canal.");
      if (!actividad.fecha_inicio) errors.push("ACTIVIDADES fila " + rowNumber + ": especial sin fecha_inicio.");
      if (!actividad.fecha_fin) errors.push("ACTIVIDADES fila " + rowNumber + ": especial sin fecha_fin.");
    }
  });
  return errors;
}

function validatePromociones_(promociones) {
  const errors = [];

  promociones.forEach(function (promo, index) {
    const rowNumber = index + 2;
    if (!promo.sku) errors.push("Fila " + rowNumber + ": SKU vacio.");
    if (!promo.tipo_promo) errors.push("Fila " + rowNumber + ": tipo_promo vacio.");
    if (!promo.comprador) errors.push("Fila " + rowNumber + ": comprador vacio.");

    if (isComplexType_(promo.tipo_promo)) {
      if (!promo.grupo_oferta) errors.push("Fila " + rowNumber + ": promocion compleja sin grupo_oferta.");
      if (!promo.tipo_sku) errors.push("Fila " + rowNumber + ": promocion compleja sin tipo_sku.");
    }
    if ((promo.tipo_promo === "Compra X lleva X" || promo.tipo_promo === "Compra X Lleva X V2") && !promo.variante) {
      errors.push("Fila " + rowNumber + ": " + promo.tipo_promo + " sin variante.");
    }
    if (!promo.actividad_id) errors.push("Fila " + rowNumber + ": actividad_id vacio.");
    if (!promo.oferta_id) errors.push("Fila " + rowNumber + ": oferta_id vacio.");
    if (promo.alcance_tipo && ALCANCE_TYPES.indexOf(promo.alcance_tipo) < 0) {
      errors.push("Fila " + rowNumber + ": alcance_tipo invalido.");
    }
    if (promo.alcance_tipo === "SEGMENTO") {
      if (promo.aplica_segmento !== "SI") errors.push("Fila " + rowNumber + ": alcance SEGMENTO debe aplicar segmento.");
      if (!promo.segmento_cliente || promo.segmento_cliente !== promo.alcance_valor) errors.push("Fila " + rowNumber + ": segmento_cliente debe ser igual a alcance_valor.");
    }
    if (promo.aplica_segmento === "SI" && !promo.segmento_cliente) {
      errors.push("Fila " + rowNumber + ": promocion segmentada sin segmento_cliente.");
    }
  });

  const groups = {};
  promociones.forEach(function (promo) {
    if (!promo.oferta_id) return;
    const groupKey = [promo.actividad_id, promo.tipo_promo, promo.oferta_id].join("::");
    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(promo);
  });

  Object.keys(groups).forEach(function (groupName) {
    const items = groups[groupName];
    const isComplex = items.some(function (item) {
      return isComplexType_(item.tipo_promo);
    });
    if (!isComplex) return;

    const hasPrincipal = items.some(function (item) {
      return String(item.tipo_sku).toLowerCase() === "principal";
    });
    if (!hasPrincipal) errors.push("Grupo " + groupName + ": promocion compleja sin SKU principal.");
    const isCombo = items.some(function (item) {
      return item.tipo_promo === "Combo";
    });
    if (isCombo) {
      const hasReward = items.some(function (item) {
        return COMBO_REWARD_ROLES.indexOf(String(item.tipo_sku || "").toLowerCase()) >= 0;
      });
      if (!hasReward) errors.push("Grupo " + groupName + ": combo sin regalia.");
    }
    const isBuyXGetX = items.some(function (item) {
      return item.tipo_promo === "Compra X lleva X";
    });
    if (isBuyXGetX) {
      const hasReward = items.some(function (item) {
        return COMBO_REWARD_ROLES.indexOf(String(item.tipo_sku || "").toLowerCase()) >= 0;
      });
      if (!hasReward) errors.push("Grupo " + groupName + ": Compra X lleva X sin regalia.");
    }
  });

  return errors;
}

function getByAliases_(row, aliases) {
  const source = row || {};
  const normalizedAliases = aliases.map(normalizeHeader_);
  const keys = Object.keys(source);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (normalizedAliases.indexOf(normalizeHeader_(key)) >= 0) return source[key];
  }
  return "";
}

function isComplexType_(value) {
  const normalizedValue = normalizeHeader_(value);
  return COMPLEX_TYPES.some(function (type) {
    return normalizeHeader_(type) === normalizedValue;
  });
}

function normalizeHeader_(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeBoolean_(value) {
  if (typeof value === "boolean") return value;
  const text = String(value || "").trim().toUpperCase();
  return text === "TRUE" || text === "SI" || text === "ACTIVO" || text === "1";
}

function normalizeAplicaSegmento_(value, segmento) {
  const text = String(value || "").trim().toUpperCase();
  if (text === "SI" || text === "TRUE" || text === "1" || text === "APLICA") return "SI";
  if (text === "NO" || text === "FALSE" || text === "0") return "NO";
  return segmento && String(segmento).toLowerCase() !== "todos" ? "SI" : "NO";
}

function normalizeNumber_(value) {
  if (value === "" || value === null || value === undefined) return "";
  if (typeof value === "number") return value;
  const clean = String(value).replace(",", ".").replace("%", "").trim();
  const number = Number(clean);
  return Number.isNaN(number) ? value : number;
}

function createId_(prefix) {
  return prefix + "-" + Date.now() + "-" + Math.floor(Math.random() * 100000);
}

function createSegmentoId_(canal, segmento) {
  const source = normalizeHeader_(canal + "-" + segmento);
  return source || createId_("SEG");
}

function now_() {
  return new Date().toISOString();
}


