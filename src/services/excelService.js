import {
  ACTIVITY_TYPES,
  ALCANCE_TYPES,
  COMMENT_SCOPE_ACTIVITY,
  COMMENT_SCOPE_LINE,
  COMBO_REWARD_ROLES,
  MEGAPACK_PROMO_TYPE,
  REQUIRED_SHEETS,
  SHEETS,
} from "../constants";

let xlsxModule;

async function loadXlsx() {
  if (!xlsxModule) xlsxModule = await import("xlsx");
  return xlsxModule;
}

function sheetToJson(workbook, sheetName) {
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) return [];
  return xlsxModule.utils.sheet_to_json(worksheet, { defval: "", raw: false });
}

function jsonToSheet(data) {
  return xlsxModule.utils.json_to_sheet(data || []);
}

function validateWorkbook(workbook) {
  const missingSheets = REQUIRED_SHEETS.filter((sheetName) => !workbook.SheetNames.includes(sheetName));
  if (missingSheets.length > 0) throw new Error(`Faltan hojas obligatorias: ${missingSheets.join(", ")}`);
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  const text = String(value || "").trim().toUpperCase();
  return text === "TRUE" || text === "SI" || text === "SÃ" || text === "ACTIVO";
}

function normalizeAplicaSegmento(value, segmento) {
  const text = String(value || "").trim().toUpperCase();
  if (text === "SI" || text === "SÃ" || text === "TRUE" || text === "1" || text === "APLICA") return "SI";
  if (text === "NO" || text === "FALSE" || text === "0") return "NO";
  return segmento && String(segmento).toLowerCase() !== "todos" ? "SI" : "NO";
}

function normalizeActivityType(value) {
  const text = String(value || "").trim().toUpperCase();
  return ACTIVITY_TYPES.includes(text) ? text : "";
}

function normalizeAlcanceType(value) {
  const text = String(value || "").trim().toUpperCase();
  return ALCANCE_TYPES.includes(text) ? text : "";
}

function normalizeSpecialRequestStatus(value) {
  const text = normalizeHeader(value);
  if (["aprovado", "aprovada", "aprobado", "aprobada", "asignado", "asignada"].includes(text)) return "Aprovado";
  if (["entrabajo", "trabajando", "enproceso", "proceso", "activo", "activa"].includes(text)) return "En trabajo";
  if (["finalizado", "finalizada", "resuelto", "resuelta", "cerrado", "cerrada"].includes(text)) return "Finalizado";
  return "Nuevo";
}

function normalizeHours(value) {
  const number = Number(value || 0);
  return Number.isNaN(number) ? 0 : number;
}

function normalizeNumber(value) {
  if (value === "" || value === null || value === undefined) return "";
  const clean = String(value).replace(",", ".").replace("%", "").trim();
  const number = Number(clean);
  return Number.isNaN(number) ? value : number;
}

function normalizeHeader(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function isComplexType(value) {
  return ["Combo", "Umbral", "Compra X lleva X", "Compra X Lleva X V2", MEGAPACK_PROMO_TYPE].map(normalizeHeader).includes(normalizeHeader(value));
}

function getOfferOwnerKey({ usuarioId, compradorId } = {}) {
  return normalizeHeader(usuarioId || compradorId);
}

function createDerivedOfferId({ actividadId, tipoPromo, grupoOferta, rowId, usuarioId, compradorId }) {
  const activityKey = normalizeHeader(actividadId) || "actividad";
  const typeKey = normalizeHeader(tipoPromo) || "promo";
  const groupKey = normalizeHeader(grupoOferta);
  const ownerKey = getOfferOwnerKey({ usuarioId, compradorId });
  if (isComplexType(tipoPromo) && groupKey) return `OFE-${activityKey}-${typeKey}${ownerKey ? `-${ownerKey}` : ""}-${groupKey}`;
  return `OFE-${activityKey}-${typeKey}-${normalizeHeader(rowId) || createId("ROW")}`;
}

function resolveOfferId(row, rowId, actividadId, tipoPromo, grupoOferta) {
  const usuarioId = row.usuario_id || row.usuarioId || row.comprador_id || row.compradorId || row.buyer_id || row.buyerId || "";
  return row.oferta_id || row.ofertaId || createDerivedOfferId({ actividadId, tipoPromo, grupoOferta, rowId, usuarioId });
}

function getCommentScope(row) {
  const explicit = String(row?.alcance_comentario || row?.alcanceComentario || row?.tipo_comentario || "").trim().toUpperCase();
  if (["ACTIVIDAD", "CATALOGO", "CATÃLOGO", "GENERAL"].includes(explicit)) return COMMENT_SCOPE_ACTIVITY;
  if (["LINEA", "LÃNEA", "SKU"].includes(explicit)) return COMMENT_SCOPE_LINE;
  return row?.row_id || row?.rowId ? COMMENT_SCOPE_LINE : COMMENT_SCOPE_ACTIVITY;
}

function isActivityComment(row) {
  return getCommentScope(row) === COMMENT_SCOPE_ACTIVITY;
}

function isLineComment(row) {
  return getCommentScope(row) === COMMENT_SCOPE_LINE;
}

function formatComments(comments = []) {
  return comments.map((comment) => `${comment.estado || ""}: ${comment.comentario || ""}`.trim()).filter(Boolean).join(" | ");
}

function getByAliases(row, aliases) {
  const entries = Object.entries(row || {});
  const normalizedAliases = aliases.map(normalizeHeader);
  const match = entries.find(([key]) => normalizedAliases.includes(normalizeHeader(key)));
  return match ? match[1] : "";
}

function getEntryByAliases(row, aliases) {
  const entries = Object.entries(row || {});
  const normalizedAliases = aliases.map(normalizeHeader);
  const match = entries.find(([key]) => normalizedAliases.includes(normalizeHeader(key)));
  return match ? { key: match[0], value: match[1] } : null;
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

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function normalizeActividad(row) {
  const tipoActividad = normalizeActivityType(row.tipo_actividad || row.tipoActividad) || "CATALOGO";
  const estado = tipoActividad === "ESPECIAL" ? normalizeSpecialRequestStatus(row.estado) : row.estado || "Borrador";
  return {
    actividad_id: row.actividad_id || row.actividadId || row.catalogo_id || row.id || createId("ACT"),
    nombre_actividad: row.nombre_actividad || row.nombreActividad || row.nombre || row.catalogo || "",
    tipo_actividad: tipoActividad,
    canal: row.canal || "",
    fecha_inicio: row.fecha_inicio || row.fechaInicio || row.vigencia_inicio || "",
    fecha_fin: row.fecha_fin || row.fechaFin || row.vigencia_fin || "",
    comprador: row.comprador || row.solicitante || "",
    solicitante: row.solicitante || row.comprador || "",
    estado,
    fecha_creacion: row.fecha_creacion || row.fechaCreacion || new Date().toISOString(),
    motivo_solicitud: row.motivo_solicitud || row.motivoSolicitud || "",
    fecha_modificacion: row.fecha_modificacion || row.fechaModificacion || "",
    responsable: row.responsable || "",
    recursos_ocupados: row.recursos_ocupados || row.recursosOcupados || "",
    fecha_estado: row.fecha_estado || row.fechaEstado || "",
    fecha_nuevo: row.fecha_nuevo || "",
    fecha_aprovado: row.fecha_aprovado || row.fecha_aprobado || row.fecha_asignado || "",
    fecha_entrabajo: row.fecha_entrabajo || row.fecha_en_trabajo || row.fecha_trabajando || "",
    fecha_finalizado: row.fecha_finalizado || row.fecha_resuelto || "",
    fecha_asignado: row.fecha_asignado || row.fecha_aprovado || "",
    fecha_trabajando: row.fecha_trabajando || row.fecha_entrabajo || "",
    fecha_resuelto: row.fecha_resuelto || row.fecha_finalizado || "",
    tiempo_nuevo_horas: normalizeHours(row.tiempo_nuevo_horas),
    tiempo_aprovado_horas: normalizeHours(row.tiempo_aprovado_horas || row.tiempo_aprobado_horas || row.tiempo_asignado_horas),
    tiempo_entrabajo_horas: normalizeHours(row.tiempo_entrabajo_horas || row.tiempo_en_trabajo_horas || row.tiempo_trabajando_horas),
    tiempo_finalizado_horas: normalizeHours(row.tiempo_finalizado_horas || row.tiempo_resuelto_horas),
    tiempo_asignado_horas: normalizeHours(row.tiempo_asignado_horas || row.tiempo_aprovado_horas),
    tiempo_trabajando_horas: normalizeHours(row.tiempo_trabajando_horas || row.tiempo_entrabajo_horas),
    tiempo_resuelto_horas: normalizeHours(row.tiempo_resuelto_horas || row.tiempo_finalizado_horas),
    tiempo_total_horas: normalizeHours(row.tiempo_total_horas),
    promo_ids: row.promo_ids || row.promoIds || "",
    oferta_ids: row.oferta_ids || row.ofertaIds || "",
  };
}

function buildActivityMap(actividades = []) {
  return actividades.reduce((acc, actividad) => {
    if (actividad.actividad_id) acc[actividad.actividad_id] = actividad;
    return acc;
  }, {});
}

function getPromoActivity(promo, activityMap) {
  return activityMap[promo.actividad_id] || activityMap[promo.catalogo_id] || null;
}

function enrichPromoWithActivity(promo, activityMap) {
  const activity = getPromoActivity(promo, activityMap) || {};
  const tipoActividad = normalizeActivityType(promo.tipo_actividad || activity.tipo_actividad) || (String(promo.actividad_id || "").startsWith("ESP-") ? "ESPECIAL" : "CATALOGO");
  return {
    ...promo,
    actividad_id: promo.actividad_id || activity.actividad_id || promo.catalogo_id || "",
    oferta_id: promo.oferta_id || resolveOfferId(promo, promo.row_id, promo.actividad_id || activity.actividad_id || promo.catalogo_id || "", promo.tipo_promo, promo.grupo_oferta),
    tipo_actividad: tipoActividad,
    nombre_actividad: activity.nombre_actividad || "",
    canal: activity.canal || promo.canal || "",
    alcance_tipo: normalizeAlcanceType(promo.alcance_tipo) || "",
    alcance_valor: promo.alcance_valor || "",
    aplica_segmento: normalizeAplicaSegmento(promo.aplica_segmento, promo.segmento_cliente || promo.segmento),
    segmento_cliente: promo.segmento_cliente || (normalizeAplicaSegmento(promo.aplica_segmento, promo.segmento) === "SI" ? promo.segmento || "" : ""),
  };
}

function normalizePromocion(row) {
  const rowId = row.row_id || row.id || createId("ROW");
  const actividadId = row.actividad_id || row.actividadId || row.catalogo_id || "";
  const tipoPromo = row.tipo_promo || row.tipoPromo || "";
  const grupoOferta = row.grupo_oferta || row.grupoOferta || "";
  const ofertaId = resolveOfferId(row, rowId, actividadId, tipoPromo, grupoOferta);
  const segmentoCliente = row.segmento_cliente || row.segmentoCliente || row.segmento || "";
  const aplicaSegmento = normalizeAplicaSegmento(row.aplica_segmento || row.aplicaSegmento, segmentoCliente);
  return {
    row_id: rowId,
    actividad_id: actividadId,
    oferta_id: ofertaId,
    comprador_id: row.comprador_id || row.compradorId || "",
    comprador: row.comprador || "",
    division: row.division || "",
    dep_id: row.dep_id || row.depId || row.dept || "",
    tipo_promo: tipoPromo,
    grupo_oferta: grupoOferta,
    tipo_sku: row.tipo_sku || "",
    variante: row.variante || "",
    sku: String(row.sku || "").trim(),
    num_parte: row.num_parte || "",
    descripcion: row.descripcion || "",
    tipo_cantidad: row.tipo_cantidad || "Exacta",
    cantidad_minima: normalizeNumber(row.cantidad_minima || 1),
    precio_antes: normalizeNumber(row.precio_antes),
    precio_ahora: normalizeNumber(row.precio_ahora),
    descuento: row.descuento || "",
    comentario_comprador: row.comentario_comprador || "",
    aplica_segmento: aplicaSegmento,
    segmento: aplicaSegmento === "SI" ? segmentoCliente || "" : "Todos",
    segmento_cliente: aplicaSegmento === "SI" ? segmentoCliente || "" : "",
    alcance_tipo: normalizeAlcanceType(row.alcance_tipo || row.alcanceTipo),
    alcance_valor: row.alcance_valor || row.alcanceValor || "",
    estado_registro: row.estado_registro || "BORRADOR",
    fecha_creacion: row.fecha_creacion || new Date().toISOString(),
    fecha_modificacion: row.fecha_modificacion || "",
    ultima_modificacion_por: row.ultima_modificacion_por || "",
  };
}

function normalizeCatalogo(row) {
  const id = row.catalogo_id || row.id || createId("CAT");
  return {
    catalogo_id: id,
    id,
    nombre: row.nombre || row.catalogo || "",
    canal: row.canal || "",
    vigencia_inicio: row.vigencia_inicio || row.vigenciaInicio || "",
    vigencia_fin: row.vigencia_fin || row.vigenciaFin || "",
    vigencia: row.vigencia || "",
    estado: row.estado || "Borrador",
    color: row.color || "bg-emerald-700",
    doc_id: row.doc_id || row.docId || "",
    token_conexion: row.token_conexion || row.tokenConexion || "",
    notificaciones: normalizeBoolean(row.notificaciones),
    correos: row.correos || row.correo || "",
    divisiones: row.divisiones || row.divisiones_catalogo || "",
  };
}

function normalizeComprador(row) {
  return {
    comprador_id: row.comprador_id || row.compradorId || row.id || "",
    categoria_comprador: row.categoria_comprador || row.categoriaComprador || row.categoria || "",
    comprador: row.comprador || row.nombre || "",
    nombre: row.comprador || row.nombre || "",
    division: row.division || row.divisiones || "",
    correo: row.correo || "",
    senior_id: row.senior_id || row.seniorId || row.senior || "",
    activo: row.activo === "" || row.activo === undefined ? true : normalizeBoolean(row.activo),
  };
}

function normalizeResponsableSolicitud(row) {
  const nombre = row.nombre || row.responsable || row.usuario || "";
  const area = row.area || row.departamento || row.equipo || "";
  return {
    responsable_id: row.responsable_id || row.responsableId || row.id || `${normalizeHeader(area) || "resp"}-${normalizeHeader(nombre) || createId("RESP")}`,
    nombre,
    area,
    correo: row.correo || row.email || "",
    activo: row.activo === "" || row.activo === undefined ? true : normalizeBoolean(row.activo),
  };
}

function normalizeJerarquiaCategoria(row) {
  return {
    dep_id: String(row.dep_id || row.depId || row.dept || row.DEPT || "").trim(),
    dep_desc: row.dep_desc || row.depDesc || row.departamento || row.descripcion || "",
    division: row.division || row.categoria || "",
    activo: row.activo === "" || row.activo === undefined ? true : normalizeBoolean(row.activo),
  };
}

function normalizeAvanceCatalogo(row) {
  const catalogoId = row.catalogo_id || row.catalogoId || "";
  const comprador = row.comprador || "";
  const division = row.division || "";
  const estado = row.estado || (normalizeBoolean(row.terminado) ? "Terminado" : "Pendiente");
  return {
    avance_id: row.avance_id || `${catalogoId}__${division}__${comprador}`,
    catalogo_id: catalogoId,
    catalogo: row.catalogo || "",
    comprador_id: row.comprador_id || row.compradorId || "",
    comprador,
    division,
    estado,
    fecha_estado: row.fecha_estado || row.fechaEstado || row.fecha || "",
    usuario: row.usuario || comprador,
  };
}

function normalizeSegmentoCliente(row) {
  const canal = row.canal || "";
  const segmento = row.segmento || row.nombre_segmento || row.nombre || "";
  return {
    segmento_id: row.segmento_id || row.id || `${normalizeHeader(canal)}-${normalizeHeader(segmento) || createId("SEG")}`,
    nombre_segmento: segmento,
    canal,
    activo: row.activo === "" || row.activo === undefined ? true : normalizeBoolean(row.activo),
    orden: normalizeNumber(row.orden || ""),
  };
}

function normalizeComentario(row) {
  const scope = getCommentScope(row);
  return {
    comentario_id: row.comentario_id || createId("CMT"),
    actividad_id: row.actividad_id || row.actividadId || row.catalogo_id || "",
    row_id: scope === COMMENT_SCOPE_ACTIVITY ? "" : row.row_id || row.rowId || "",
    alcance_comentario: scope,
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

function normalizePromocionDetalle(row) {
  return {
    detalle_id: row.detalle_id || row.id || createId("DET"),
    row_id: row.row_id || row.rowId || "",
    actividad_id: row.actividad_id || row.actividadId || "",
    oferta_id: row.oferta_id || row.ofertaId || "",
    grupo_oferta: row.grupo_oferta || row.grupoOferta || "",
    tipo_promo: row.tipo_promo || row.tipoPromo || "",
    campo: row.campo || row.field || "",
    valor: row.valor || row.value || "",
  };
}

function normalizeLog(row) {
  return {
    log_id: row.log_id || createId("LOG"),
    fecha: row.fecha || new Date().toISOString(),
    usuario: row.usuario || "",
    catalogo: row.catalogo || row.catalogo_id || "",
    accion: row.accion || "",
    row_id: row.row_id || "",
    campo: row.campo || "",
    valor_anterior: row.valor_anterior || "",
    valor_nuevo: row.valor_nuevo || "",
    fecha_cierre: row.fecha_cierre || "",
  };
}

export async function loadCatalogFromExcel(file) {
  const XLSX = await loadXlsx();
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  validateWorkbook(workbook);
  return {
    config: sheetToJson(workbook, SHEETS.CONFIG),
    catalogos: sheetToJson(workbook, SHEETS.CATALOGOS).map(normalizeCatalogo),
    actividades: sheetToJson(workbook, SHEETS.ACTIVIDADES).map(normalizeActividad),
    segmentos_clientes: sheetToJson(workbook, SHEETS.SEGMENTOS_CLIENTES).map(normalizeSegmentoCliente),
    compradores: sheetToJson(workbook, SHEETS.COMPRADORES).map(normalizeComprador),
    responsables_solicitudes: sheetToJson(workbook, SHEETS.RESPONSABLES_SOLICITUDES).map(normalizeResponsableSolicitud),
    jerarquia_categorias: sheetToJson(workbook, SHEETS.JERARQUIA_CATEGORIAS).map(normalizeJerarquiaCategoria),
    avances_catalogo: sheetToJson(workbook, SHEETS.AVANCES_CATALOGO).map(normalizeAvanceCatalogo),
    promociones: sheetToJson(workbook, SHEETS.PROMOCIONES).map(normalizePromocion),
    promociones_detalle: sheetToJson(workbook, SHEETS.PROMOCIONES_DETALLE).map(normalizePromocionDetalle),
    comentarios: sheetToJson(workbook, SHEETS.COMENTARIOS).map(normalizeComentario),
    logs: sheetToJson(workbook, SHEETS.LOGS).map(normalizeLog),
    notificaciones: sheetToJson(workbook, SHEETS.NOTIFICACIONES).map((row) => ({ catalogo_id: row.catalogo_id || "", correo: row.correo || "", activo: normalizeBoolean(row.activo) })),
  };
}

export async function loadSkuMasterFromExcel(file) {
  const XLSX = await loadXlsx();
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error("El archivo comprador no contiene hojas.");
  const items = sheetToJson(workbook, firstSheetName).map(normalizeSkuMasterRow).filter(Boolean);
  if (!items.length) throw new Error("No se encontraron SKU en el archivo comprador.");
  const skuMaster = items.reduce((acc, item) => {
    acc[item.sku] = item;
    return acc;
  }, {});
  return { items, skuMaster, sheetName: firstSheetName };
}

export function buildConsolidado(promociones, comentarios = [], actividades = []) {
  const activityMap = buildActivityMap(actividades);
  return promociones.map((promo) => {
    const enriched = enrichPromoWithActivity(promo, activityMap);
    const comentariosRow = comentarios.filter((item) => isLineComment(item) && item.row_id === promo.row_id);
    const comentariosActividad = comentarios.filter((item) => isActivityComment(item) && item.actividad_id === enriched.actividad_id);
    return {
      actividad_id: enriched.actividad_id,
      oferta_id: enriched.oferta_id,
      tipo_actividad: enriched.tipo_actividad,
      canal: enriched.canal,
      alcance_tipo: enriched.alcance_tipo,
      alcance_valor: enriched.alcance_valor,
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
      aplica_segmento: enriched.aplica_segmento,
      segmento_cliente: enriched.segmento_cliente,
      segmento: promo.segmento,
      estado_registro: promo.estado_registro,
      comentarios_abiertos: comentariosRow.filter((item) => String(item.estado).toUpperCase() === "ABIERTO").length,
      total_comentarios: comentariosRow.length,
      comentarios_actividad: formatComments(comentariosActividad),
      comentarios_actividad_abiertos: comentariosActividad.filter((item) => String(item.estado).toUpperCase() === "ABIERTO").length,
      fecha_modificacion: promo.fecha_modificacion,
      ultima_modificacion_por: promo.ultima_modificacion_por,
    };
  });
}

export function buildPricingExport(promociones, comentarios = [], actividades = []) {
  const activityMap = buildActivityMap(actividades);
  return promociones.map((promo) => {
    const enriched = enrichPromoWithActivity(promo, activityMap);
    const comentariosActividad = comentarios.filter((item) => isActivityComment(item) && item.actividad_id === enriched.actividad_id);
    return { actividad_id: enriched.actividad_id, oferta_id: enriched.oferta_id, tipo_actividad: enriched.tipo_actividad, canal: enriched.canal, alcance_tipo: enriched.alcance_tipo, alcance_valor: enriched.alcance_valor, comprador: promo.comprador, tipo_promo: promo.tipo_promo, grupo_oferta: promo.grupo_oferta, tipo_sku: promo.tipo_sku, variante: promo.variante, sku: promo.sku, tipo_cantidad: promo.tipo_cantidad, cantidad_minima: promo.cantidad_minima, precio_antes: promo.precio_antes, precio_ahora: promo.precio_ahora, descuento: promo.descuento, aplica_segmento: enriched.aplica_segmento, segmento_cliente: enriched.segmento_cliente, segmento: promo.segmento, estado_registro: promo.estado_registro, comentarios_actividad: formatComments(comentariosActividad) };
  });
}

export function buildMercadeoExport(promociones, comentarios = [], actividades = []) {
  const activityMap = buildActivityMap(actividades);
  return promociones.map((promo) => {
    const enriched = enrichPromoWithActivity(promo, activityMap);
    const comentariosActividad = comentarios.filter((item) => isActivityComment(item) && item.actividad_id === enriched.actividad_id);
    return {
      actividad_id: enriched.actividad_id,
      oferta_id: enriched.oferta_id,
      tipo_actividad: enriched.tipo_actividad,
      canal: enriched.canal,
      alcance_tipo: enriched.alcance_tipo,
      alcance_valor: enriched.alcance_valor,
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
      aplica_segmento: enriched.aplica_segmento,
      segmento_cliente: enriched.segmento_cliente,
      segmento: promo.segmento,
      comentarios_actividad: formatComments(comentariosActividad),
      comentarios_abiertos_mercadeo: comentarios.filter((c) => isLineComment(c) && c.row_id === promo.row_id && String(c.estado).toUpperCase() === "ABIERTO").map((c) => c.comentario).join(" | "),
    };
  });
}

export function buildPlanimetriaExport(promociones, comentarios = [], actividades = []) {
  const activityMap = buildActivityMap(actividades);
  return promociones.map((promo) => {
    const enriched = enrichPromoWithActivity(promo, activityMap);
    const comentariosActividad = comentarios.filter((item) => isActivityComment(item) && item.actividad_id === enriched.actividad_id);
    return { actividad_id: enriched.actividad_id, oferta_id: enriched.oferta_id, tipo_actividad: enriched.tipo_actividad, canal: enriched.canal, alcance_tipo: enriched.alcance_tipo, alcance_valor: enriched.alcance_valor, comprador: promo.comprador, division: promo.division, tipo_promo: promo.tipo_promo, grupo_oferta: promo.grupo_oferta, variante: promo.variante, sku: promo.sku, descripcion: promo.descripcion, precio_antes: promo.precio_antes, precio_ahora: promo.precio_ahora, descuento: promo.descuento, aplica_segmento: enriched.aplica_segmento, segmento_cliente: enriched.segmento_cliente, segmento: promo.segmento, comentarios_actividad: formatComments(comentariosActividad) };
  });
}

export function validateActividades(actividades = []) {
  const errors = [];
  actividades.forEach((actividad, index) => {
    const rowNumber = index + 2;
    if (!actividad.actividad_id) errors.push(`ACTIVIDADES fila ${rowNumber}: actividad_id vacío.`);
    if (!ACTIVITY_TYPES.includes(actividad.tipo_actividad)) errors.push(`ACTIVIDADES fila ${rowNumber}: tipo_actividad inválido.`);
    if (actividad.tipo_actividad === "ESPECIAL") {
      if (!(actividad.comprador || actividad.solicitante)) errors.push(`ACTIVIDADES fila ${rowNumber}: especial sin comprador.`);
      if (!actividad.canal) errors.push(`ACTIVIDADES fila ${rowNumber}: especial sin canal.`);
      if (!actividad.fecha_inicio) errors.push(`ACTIVIDADES fila ${rowNumber}: especial sin fecha_inicio.`);
      if (!actividad.fecha_fin) errors.push(`ACTIVIDADES fila ${rowNumber}: especial sin fecha_fin.`);
    }
  });
  return errors;
}
export function validatePromociones(promociones, actividades = []) {
  const errors = [];
  const activityMap = buildActivityMap(actividades);
  const comboGroups = {};
  const buyXGetYGroups = {};
  const megapackGroups = {};
  promociones.forEach((promo, index) => {
    const rowNumber = index + 2;
    const enriched = enrichPromoWithActivity(promo, activityMap);
    const activity = getPromoActivity(promo, activityMap);
    if (!promo.sku) errors.push(`Fila ${rowNumber}: SKU vacÃ­o.`);
    if (!promo.tipo_promo) errors.push(`Fila ${rowNumber}: tipo_promo vacÃ­o.`);
    if (!promo.comprador) errors.push(`Fila ${rowNumber}: comprador vacÃ­o.`);
    if (!enriched.actividad_id) errors.push(`Fila ${rowNumber}: actividad_id vacÃ­o.`);
    if (!enriched.oferta_id) errors.push(`Fila ${rowNumber}: oferta_id vacÃ­o.`);
    if (enriched.tipo_actividad && !ACTIVITY_TYPES.includes(enriched.tipo_actividad)) errors.push(`Fila ${rowNumber}: tipo_actividad invÃ¡lido.`);
    if (enriched.alcance_tipo && !ALCANCE_TYPES.includes(enriched.alcance_tipo)) errors.push(`Fila ${rowNumber}: alcance_tipo invÃ¡lido.`);
    if (enriched.alcance_tipo === "SEGMENTO") {
      if (enriched.aplica_segmento !== "SI") errors.push(`Fila ${rowNumber}: alcance SEGMENTO debe aplicar segmento.`);
      if (!enriched.segmento_cliente || enriched.segmento_cliente !== enriched.alcance_valor) errors.push(`Fila ${rowNumber}: segmento_cliente debe ser igual a alcance_valor.`);
    }
    if (enriched.aplica_segmento === "SI" && !enriched.segmento_cliente) errors.push(`Fila ${rowNumber}: promocion segmentada sin segmento_cliente.`);
    if (enriched.tipo_actividad === "ESPECIAL") {
      if (!enriched.actividad_id) errors.push(`Fila ${rowNumber}: especial sin actividad_id.`);
      if (!activity) errors.push(`Fila ${rowNumber}: especial sin registro en ACTIVIDADES.`);
      if (activity) {
        if (!(activity.comprador || activity.solicitante)) errors.push(`Fila ${rowNumber}: especial sin comprador.`);
        if (!activity.canal) errors.push(`Fila ${rowNumber}: especial sin canal.`);
        if (!activity.fecha_inicio) errors.push(`Fila ${rowNumber}: especial sin fecha_inicio.`);
        if (!activity.fecha_fin) errors.push(`Fila ${rowNumber}: especial sin fecha_fin.`);
      }
    }
    if (isComplexType(promo.tipo_promo)) {
      if (!promo.grupo_oferta) errors.push(`Fila ${rowNumber}: promociÃ³n compleja sin grupo_oferta.`);
      if (!promo.tipo_sku) errors.push(`Fila ${rowNumber}: promociÃ³n compleja sin tipo_sku.`);
    }
    if (["Compra X lleva X", "Compra X Lleva X V2"].includes(promo.tipo_promo) && !promo.variante) errors.push(`Fila ${rowNumber}: ${promo.tipo_promo} sin variante.`);
    const offerGroupKey = `${enriched.actividad_id}::${promo.tipo_promo}::${enriched.oferta_id}`;
    if (promo.tipo_promo === "Combo" && enriched.oferta_id) {
      if (!comboGroups[offerGroupKey]) comboGroups[offerGroupKey] = [];
      comboGroups[offerGroupKey].push(promo);
    }
    if (promo.tipo_promo === "Compra X lleva X" && enriched.oferta_id) {
      if (!buyXGetYGroups[offerGroupKey]) buyXGetYGroups[offerGroupKey] = [];
      buyXGetYGroups[offerGroupKey].push(promo);
    }
    if (promo.tipo_promo === MEGAPACK_PROMO_TYPE && enriched.oferta_id) {
      if (!megapackGroups[offerGroupKey]) megapackGroups[offerGroupKey] = [];
      megapackGroups[offerGroupKey].push(promo);
    }
  });
  Object.entries(comboGroups).forEach(([group, items]) => {
    const hasPrincipal = items.some((item) => String(item.tipo_sku || "").toLowerCase() === "principal");
    const hasReward = items.some((item) => COMBO_REWARD_ROLES.includes(String(item.tipo_sku || "").toLowerCase()));
    if (!hasPrincipal) errors.push(`Grupo ${group}: combo sin SKU principal.`);
    if (!hasReward) errors.push(`Grupo ${group}: combo sin regalÃ­a.`);
  });
  Object.entries(buyXGetYGroups).forEach(([group, items]) => {
    const hasPrincipal = items.some((item) => String(item.tipo_sku || "").toLowerCase() === "principal");
    const hasReward = items.some((item) => COMBO_REWARD_ROLES.includes(String(item.tipo_sku || "").toLowerCase()));
    if (!hasPrincipal) errors.push(`Grupo ${group}: Compra X lleva X sin principal.`);
    if (!hasReward) errors.push(`Grupo ${group}: Compra X lleva X sin regalÃ­a.`);
  });
  Object.entries(megapackGroups).forEach(([group, items]) => {
    const hasPrincipal = items.some((item) => String(item.tipo_sku || "").toLowerCase() === "principal");
    const hasReward = items.some((item) => COMBO_REWARD_ROLES.includes(String(item.tipo_sku || "").toLowerCase()));
    if (!hasPrincipal) errors.push(`Grupo ${group}: Megapack sin SKU principal.`);
    if (!hasReward) errors.push(`Grupo ${group}: Megapack sin regalía.`);
  });
  return errors;
}

export async function saveCatalogToExcel(data) {
  const XLSX = await loadXlsx();
  const { config = [], catalogos = [], actividades = [], segmentos_clientes = [], compradores = [], responsables_solicitudes = [], jerarquia_categorias = [], avances_catalogo = [], promociones = [], promociones_detalle = [], comentarios = [], logs = [], notificaciones = [] } = data;
  const normalizedPromociones = promociones.map(normalizePromocion);
  const normalizedComentarios = comentarios.map(normalizeComentario);
  const validationErrors = [...validateActividades(actividades), ...validatePromociones(normalizedPromociones, actividades)];
  if (validationErrors.length > 0) throw new Error(validationErrors.join("\n"));
  const promocionesByRowId = new Map(normalizedPromociones.map((promo) => [promo.row_id, promo]));
  const promocionesDetalleNormalizadas = promociones_detalle.map((detalle) => {
    const promo = promocionesByRowId.get(detalle.row_id || detalle.rowId) || {};
    return {
      detalle_id: detalle.detalle_id || detalle.id || createId("DET"),
      row_id: detalle.row_id || detalle.rowId || "",
      actividad_id: detalle.actividad_id || detalle.actividadId || promo.actividad_id || "",
      oferta_id: detalle.oferta_id || detalle.ofertaId || promo.oferta_id || "",
      grupo_oferta: detalle.grupo_oferta || detalle.grupoOferta || promo.grupo_oferta || "",
      tipo_promo: detalle.tipo_promo || detalle.tipoPromo || promo.tipo_promo || "",
      campo: detalle.campo || detalle.field || "",
      valor: detalle.valor || detalle.value || "",
    };
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, jsonToSheet(config), SHEETS.CONFIG);
  XLSX.utils.book_append_sheet(workbook, jsonToSheet(catalogos), SHEETS.CATALOGOS);
  XLSX.utils.book_append_sheet(workbook, jsonToSheet(actividades), SHEETS.ACTIVIDADES);
  XLSX.utils.book_append_sheet(workbook, jsonToSheet(segmentos_clientes), SHEETS.SEGMENTOS_CLIENTES);
  XLSX.utils.book_append_sheet(workbook, jsonToSheet(buildPricingExport(normalizedPromociones, normalizedComentarios, actividades)), SHEETS.EXPORT_PRICING);
  XLSX.utils.book_append_sheet(workbook, jsonToSheet(buildMercadeoExport(normalizedPromociones, normalizedComentarios, actividades)), SHEETS.EXPORT_MERCADEO);
  XLSX.utils.book_append_sheet(workbook, jsonToSheet(buildPlanimetriaExport(normalizedPromociones, normalizedComentarios, actividades)), SHEETS.EXPORT_PLANIMETRIA);
  XLSX.utils.book_append_sheet(workbook, jsonToSheet(normalizedComentarios), SHEETS.COMENTARIOS);
  XLSX.utils.book_append_sheet(workbook, jsonToSheet(compradores), SHEETS.COMPRADORES);
  XLSX.utils.book_append_sheet(workbook, jsonToSheet(responsables_solicitudes.map(normalizeResponsableSolicitud)), SHEETS.RESPONSABLES_SOLICITUDES);
  XLSX.utils.book_append_sheet(workbook, jsonToSheet(jerarquia_categorias.map(normalizeJerarquiaCategoria)), SHEETS.JERARQUIA_CATEGORIAS);
  XLSX.utils.book_append_sheet(workbook, jsonToSheet(avances_catalogo.map(normalizeAvanceCatalogo)), SHEETS.AVANCES_CATALOGO);
  XLSX.utils.book_append_sheet(workbook, jsonToSheet(buildConsolidado(normalizedPromociones, normalizedComentarios, actividades)), SHEETS.CONSOLIDADO);
  XLSX.utils.book_append_sheet(workbook, jsonToSheet(notificaciones), SHEETS.NOTIFICACIONES);
  XLSX.utils.book_append_sheet(workbook, jsonToSheet(normalizedPromociones), SHEETS.PROMOCIONES);
  XLSX.utils.book_append_sheet(workbook, jsonToSheet(promocionesDetalleNormalizadas), SHEETS.PROMOCIONES_DETALLE);
  XLSX.utils.book_append_sheet(workbook, jsonToSheet(logs), SHEETS.LOGS);
  XLSX.writeFile(workbook, "Catalogo_Promociones_Actualizado.xlsx");
}

