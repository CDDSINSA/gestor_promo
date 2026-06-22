import {
  formatDisplayDate,
  formatVigenciaRange,
  makeId,
  normalizeBoolean,
  normalizeValue,
} from "./common";
import {
  ACTIVITY_TYPES,
  ALCANCE_TYPES,
  CATALOGOS_CONFIG_KEY,
  COMMENT_SCOPE_ACTIVITY,
  COMMENT_SCOPE_LINE,
  COMBO_REWARD_ROLES,
} from "../constants";
import { catalogosIniciales, responsablesSolicitudesIniciales, segmentosClientesIniciales } from "../constants";
import { isComplexPromoType, validatePromoByType } from "../promoTypes/promoTypeEngine";

function normalizeHeader(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function normalizeDivisionesCatalogo(value) {
  const rawItems = Array.isArray(value) ? value : String(value || "").split(/[;|,]/);
  const seen = new Set();
  return rawItems
    .map((item) => normalizeValue(item))
    .filter(Boolean)
    .filter((item) => {
      const key = normalizeCanal(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function normalizeCatalogo(item) {
  const id = item.id || item.catalogo_id || item.catalogoId || makeId("cat");
  const vigenciaInicio = item.vigencia_inicio || item.vigenciaInicio || "";
  const vigenciaFin = item.vigencia_fin || item.vigenciaFin || "";
  const divisiones = normalizeDivisionesCatalogo(item.divisiones || item.divisiones_catalogo || item.categorias || item.categorias_catalogo);
  return {
    ...item,
    id,
    catalogo_id: id,
    nombre: item.nombre || item.catalogo || "",
    canal: item.canal || "",
    vigencia_inicio: vigenciaInicio,
    vigencia_fin: vigenciaFin,
    vigencia: item.vigencia || formatVigenciaRange(vigenciaInicio, vigenciaFin),
    estado: item.estado || "Borrador",
    color: item.color || "bg-emerald-700",
    docId: item.docId || item.doc_id || "",
    tokenConexion: item.tokenConexion || item.token_conexion || "",
    notificaciones: normalizeBoolean(item.notificaciones),
    correos: item.correos || item.correo || "",
    divisiones,
  };
}

export function readCatalogosFromConfig(config, fallback = catalogosIniciales) {
  const row = (config || []).find((item) => String(item.clave || item.key || "").trim() === CATALOGOS_CONFIG_KEY);
  if (!row) return fallback.map(normalizeCatalogo);
  try {
    const parsed = JSON.parse(row.valor || row.value || "[]");
    return Array.isArray(parsed) && parsed.length ? parsed.map(normalizeCatalogo) : fallback.map(normalizeCatalogo);
  } catch {
    return fallback.map(normalizeCatalogo);
  }
}

export function readCatalogosFromData(data, fallback = catalogosIniciales) {
  const tabularCatalogos = (data?.catalogos || []).filter((item) => item.catalogo_id || item.id || item.nombre);
  if (tabularCatalogos.length) return tabularCatalogos.map(normalizeCatalogo);
  return readCatalogosFromConfig(data?.config || [], fallback);
}

export function stripCatalogosConfig(config) {
  return (config || []).filter((item) => String(item.clave || item.key || "").trim() !== CATALOGOS_CONFIG_KEY);
}

export function toSheetCatalogo(item) {
  const catalogo = normalizeCatalogo(item);
  return {
    catalogo_id: catalogo.id,
    nombre: catalogo.nombre,
    canal: catalogo.canal,
    vigencia_inicio: catalogo.vigencia_inicio,
    vigencia_fin: catalogo.vigencia_fin,
    vigencia: catalogo.vigencia,
    estado: catalogo.estado,
    color: catalogo.color,
    doc_id: catalogo.docId,
    token_conexion: catalogo.tokenConexion,
    notificaciones: catalogo.notificaciones,
    correos: catalogo.correos,
    divisiones: catalogo.divisiones.join("; "),
  };
}

export function normalizeActivityType(value) {
  const text = String(value || "").trim().toUpperCase();
  return ACTIVITY_TYPES.includes(text) ? text : "";
}

export function normalizeAlcanceType(value) {
  const text = String(value || "").trim().toUpperCase();
  return ALCANCE_TYPES.includes(text) ? text : "";
}

export function normalizeSpecialRequestStatus(value) {
  const text = normalizeCanal(value);
  if (["aprovado", "aprovada", "aprobado", "aprobada", "asignado", "asignada"].includes(text)) return "Aprovado";
  if (["entrabajo", "trabajando", "enproceso", "proceso", "activo", "activa"].includes(text)) return "En trabajo";
  if (["finalizado", "finalizada", "resuelto", "resuelta", "cerrado", "cerrada"].includes(text)) return "Finalizado";
  return "Nuevo";
}

export function getSpecialRequestStatusKey(value) {
  return normalizeCanal(normalizeSpecialRequestStatus(value));
}

export function numberFromHours(value) {
  const number = Number(value || 0);
  return Number.isNaN(number) ? 0 : number;
}

export function addElapsedHours(current, elapsed) {
  return Math.round((numberFromHours(current) + elapsed) * 100) / 100;
}

export function diffHours(from, to = new Date()) {
  const start = from ? new Date(from) : null;
  const end = to instanceof Date ? to : new Date(to);
  if (!start || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(0, Math.round(((end.getTime() - start.getTime()) / 3600000) * 100) / 100);
}

export function formatDurationHours(value) {
  const totalMinutes = Math.round(numberFromHours(value) * 60);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

export function normalizeActividad(item) {
  const id = item.actividad_id || item.actividadId || item.catalogo_id || item.id || makeId("ACT");
  const fechaCreacion = item.fecha_creacion || item.fechaCreacion || new Date().toISOString();
  const tipoActividad = normalizeActivityType(item.tipo_actividad || item.tipoActividad) || "CATALOGO";
  const estado = tipoActividad === "ESPECIAL" ? normalizeSpecialRequestStatus(item.estado) : item.estado || "Borrador";
  const statusKey = getSpecialRequestStatusKey(estado);
  return {
    ...item,
    id,
    actividadId: id,
    actividad_id: id,
    nombreActividad: item.nombreActividad || item.nombre_actividad || item.nombre || "",
    nombre_actividad: item.nombre_actividad || item.nombreActividad || item.nombre || "",
    tipoActividad,
    tipo_actividad: tipoActividad,
    canal: item.canal || "",
    fechaInicio: item.fechaInicio || item.fecha_inicio || item.vigencia_inicio || "",
    fecha_inicio: item.fecha_inicio || item.fechaInicio || item.vigencia_inicio || "",
    fechaFin: item.fechaFin || item.fecha_fin || item.vigencia_fin || "",
    fecha_fin: item.fecha_fin || item.fechaFin || item.vigencia_fin || "",
    comprador: item.comprador || item.solicitante || "",
    solicitante: item.solicitante || item.comprador || "",
    estado,
    fechaCreacion,
    fecha_creacion: fechaCreacion,
    motivoSolicitud: item.motivoSolicitud || item.motivo_solicitud || "",
    motivo_solicitud: item.motivo_solicitud || item.motivoSolicitud || "",
    fechaModificacion: item.fechaModificacion || item.fecha_modificacion || "",
    fecha_modificacion: item.fecha_modificacion || item.fechaModificacion || "",
    responsable: item.responsable || "",
    recursosOcupados: item.recursosOcupados || item.recursos_ocupados || "",
    recursos_ocupados: item.recursos_ocupados || item.recursosOcupados || "",
    fechaEstado: item.fechaEstado || item.fecha_estado || item.fecha_modificacion || item.fechaModificacion || "",
    fecha_estado: item.fecha_estado || item.fechaEstado || item.fecha_modificacion || item.fechaModificacion || "",
    fecha_nuevo: item.fecha_nuevo || (tipoActividad === "ESPECIAL" && statusKey === "nuevo" ? fechaCreacion : ""),
    fecha_aprovado: item.fecha_aprovado || item.fecha_aprobado || item.fecha_asignado || "",
    fecha_entrabajo: item.fecha_entrabajo || item.fecha_en_trabajo || item.fecha_trabajando || "",
    fecha_finalizado: item.fecha_finalizado || item.fecha_resuelto || "",
    fecha_asignado: item.fecha_asignado || item.fecha_aprovado || "",
    fecha_trabajando: item.fecha_trabajando || item.fecha_entrabajo || "",
    fecha_resuelto: item.fecha_resuelto || item.fecha_finalizado || "",
    tiempo_nuevo_horas: numberFromHours(item.tiempo_nuevo_horas),
    tiempo_aprovado_horas: numberFromHours(item.tiempo_aprovado_horas || item.tiempo_aprobado_horas || item.tiempo_asignado_horas),
    tiempo_entrabajo_horas: numberFromHours(item.tiempo_entrabajo_horas || item.tiempo_en_trabajo_horas || item.tiempo_trabajando_horas),
    tiempo_finalizado_horas: numberFromHours(item.tiempo_finalizado_horas || item.tiempo_resuelto_horas),
    tiempo_asignado_horas: numberFromHours(item.tiempo_asignado_horas || item.tiempo_aprovado_horas),
    tiempo_trabajando_horas: numberFromHours(item.tiempo_trabajando_horas || item.tiempo_entrabajo_horas),
    tiempo_resuelto_horas: numberFromHours(item.tiempo_resuelto_horas || item.tiempo_finalizado_horas),
    tiempo_total_horas: numberFromHours(item.tiempo_total_horas),
    promo_ids: item.promo_ids || item.promoIds || "",
    oferta_ids: item.oferta_ids || item.ofertaIds || "",
  };
}

export function activityFromCatalogo(catalogo, existing = {}) {
  const catalogoId = catalogo.id || catalogo.catalogo_id;
  return normalizeActividad({
    ...existing,
    actividad_id: catalogoId,
    nombre_actividad: catalogo.nombre || existing.nombre_actividad,
    tipo_actividad: "CATALOGO",
    canal: catalogo.canal || existing.canal,
    fecha_inicio: catalogo.vigencia_inicio || existing.fecha_inicio,
    fecha_fin: catalogo.vigencia_fin || existing.fecha_fin,
    estado: catalogo.estado || existing.estado || "Borrador",
    motivo_solicitud: existing.motivo_solicitud || "Actividad planificada desde Ajustes",
  });
}

export function mergeCatalogActivities(catalogos, actividades) {
  const activityMap = new Map((actividades || []).map((item) => {
    const activity = normalizeActividad(item);
    return [activity.actividad_id, activity];
  }));
  const catalogIds = new Set((catalogos || []).map((catalogo) => catalogo.id || catalogo.catalogo_id).filter(Boolean));
  const catalogActivities = (catalogos || []).map((catalogo) => activityFromCatalogo(catalogo, activityMap.get(catalogo.id || catalogo.catalogo_id)));
  const otherActivities = Array.from(activityMap.values()).filter((activity) => activity.tipo_actividad !== "CATALOGO" || !catalogIds.has(activity.actividad_id));
  return [...catalogActivities, ...otherActivities];
}

export function toExcelActividad(item) {
  const activity = normalizeActividad(item);
  return {
    actividad_id: activity.actividad_id,
    nombre_actividad: activity.nombre_actividad,
    tipo_actividad: activity.tipo_actividad,
    canal: activity.canal,
    fecha_inicio: activity.fecha_inicio,
    fecha_fin: activity.fecha_fin,
    comprador: activity.comprador,
    solicitante: activity.solicitante,
    estado: activity.estado,
    fecha_creacion: activity.fecha_creacion,
    motivo_solicitud: activity.motivo_solicitud,
    fecha_modificacion: activity.fecha_modificacion,
    responsable: activity.responsable,
    recursos_ocupados: activity.recursos_ocupados,
    fecha_estado: activity.fecha_estado,
    fecha_aprovado: activity.fecha_aprovado,
    fecha_entrabajo: activity.fecha_entrabajo,
    fecha_finalizado: activity.fecha_finalizado,
    fecha_nuevo: activity.fecha_nuevo,
    fecha_asignado: activity.fecha_asignado,
    fecha_trabajando: activity.fecha_trabajando,
    fecha_resuelto: activity.fecha_resuelto,
    tiempo_nuevo_horas: activity.tiempo_nuevo_horas,
    tiempo_aprovado_horas: activity.tiempo_aprovado_horas,
    tiempo_entrabajo_horas: activity.tiempo_entrabajo_horas,
    tiempo_finalizado_horas: activity.tiempo_finalizado_horas,
    tiempo_asignado_horas: activity.tiempo_asignado_horas,
    tiempo_trabajando_horas: activity.tiempo_trabajando_horas,
    tiempo_resuelto_horas: activity.tiempo_resuelto_horas,
    tiempo_total_horas: activity.tiempo_total_horas,
    promo_ids: activity.promo_ids,
    oferta_ids: activity.oferta_ids,
  };
}

export function formatDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export function createSpecialActivityId(actividades) {
  const dateKey = formatDateKey();
  const prefix = `ESP-${dateKey}-`;
  const maxSequence = (actividades || []).reduce((max, activity) => {
    const id = activity.actividad_id || activity.actividadId || "";
    if (!id.startsWith(prefix)) return max;
    const sequence = Number(id.slice(prefix.length));
    return Number.isNaN(sequence) ? max : Math.max(max, sequence);
  }, 0);
  return `${prefix}${String(maxSequence + 1).padStart(3, "0")}`;
}

export function normalizeCanal(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function getCommentScope(item) {
  const explicit = normalizeValue(item?.alcanceComentario || item?.alcance_comentario || item?.tipo_comentario).toUpperCase();
  if (["ACTIVIDAD", "CATALOGO", "CATÁLOGO", "GENERAL"].includes(explicit)) return COMMENT_SCOPE_ACTIVITY;
  if (["LINEA", "LÍNEA", "SKU"].includes(explicit)) return COMMENT_SCOPE_LINE;
  return item?.row_id || item?.rowId ? COMMENT_SCOPE_LINE : COMMENT_SCOPE_ACTIVITY;
}

export function isActivityComment(item) {
  return getCommentScope(item) === COMMENT_SCOPE_ACTIVITY;
}

export function isLineComment(item) {
  return getCommentScope(item) === COMMENT_SCOPE_LINE;
}

export function createDerivedOfferId({ actividadId, tipoPromo, grupoOferta, rowId }) {
  const activityKey = normalizeCanal(actividadId) || "actividad";
  const typeKey = normalizeCanal(tipoPromo) || "promo";
  const groupKey = normalizeCanal(grupoOferta);
  if (isComplexPromoType(tipoPromo) && groupKey) return `OFE-${activityKey}-${typeKey}-${groupKey}`;
  return `OFE-${activityKey}-${typeKey}-${normalizeCanal(rowId) || makeId("ROW")}`;
}

export function resolveOfferId(row, rowId, activityId, tipoPromo, grupoOferta) {
  return row.ofertaId || row.oferta_id || createDerivedOfferId({ actividadId: activityId, tipoPromo, grupoOferta, rowId });
}

export function normalizeSegmentoCliente(item) {
  const canal = item.canal || "";
  const segmento = item.segmento || item.nombre_segmento || item.nombre || "";
  return {
    canal,
    segmento_id: item.segmento_id || item.id || `${normalizeCanal(canal)}-${normalizeCanal(segmento) || makeId("seg")}`,
    nombre_segmento: segmento,
    segmento,
    activo: item.activo === undefined || item.activo === "" ? true : normalizeBoolean(item.activo),
    orden: Number(item.orden || 0),
  };
}

export function toSheetSegmentoCliente(item) {
  const segmento = normalizeSegmentoCliente(item);
  return {
    segmento_id: segmento.segmento_id,
    nombre_segmento: segmento.segmento,
    canal: segmento.canal,
    activo: segmento.activo,
    orden: segmento.orden,
  };
}

export function readSegmentosClientesFromData(data) {
  const rows = data?.segmentos_clientes || data?.segmentosClientes || [];
  return rows.length ? rows.map(normalizeSegmentoCliente) : segmentosClientesIniciales.map(normalizeSegmentoCliente);
}

export function normalizeResponsableSolicitud(item) {
  const nombre = normalizeValue(item.nombre || item.responsable || item.usuario || "");
  const area = normalizeValue(item.area || item.departamento || item.equipo || "");
  return {
    ...item,
    responsable_id: item.responsable_id || item.responsableId || item.id || `${normalizeCanal(area) || "resp"}-${normalizeCanal(nombre) || makeId("resp")}`,
    nombre,
    responsable: nombre,
    area,
    correo: item.correo || item.email || "",
    activo: item.activo === undefined || item.activo === "" ? true : normalizeBoolean(item.activo),
  };
}

export function toSheetResponsableSolicitud(item) {
  const responsable = normalizeResponsableSolicitud(item);
  return {
    responsable_id: responsable.responsable_id,
    nombre: responsable.nombre,
    area: responsable.area,
    correo: responsable.correo,
    activo: responsable.activo,
  };
}

export function readResponsablesSolicitudesFromData(data) {
  const rows = data?.responsables_solicitudes || data?.responsablesSolicitudes || [];
  return rows.length ? rows.map(normalizeResponsableSolicitud) : responsablesSolicitudesIniciales.map(normalizeResponsableSolicitud);
}

export function normalizeJerarquiaCategoria(item) {
  return {
    ...item,
    dep_id: normalizeValue(item.dep_id || item.depId || item.dept || item.DEPT || ""),
    dep_desc: normalizeValue(item.dep_desc || item.depDesc || item.departamento || item.descripcion || ""),
    division: normalizeValue(item.division || item.categoria || ""),
    activo: item.activo === undefined || item.activo === "" ? true : normalizeBoolean(item.activo),
  };
}

export function toSheetJerarquiaCategoria(item) {
  const hierarchy = normalizeJerarquiaCategoria(item);
  return {
    dep_id: hierarchy.dep_id,
    dep_desc: hierarchy.dep_desc,
    division: hierarchy.division,
    activo: hierarchy.activo,
  };
}

export function readJerarquiaCategoriasFromData(data) {
  const rows = data?.jerarquia_categorias || data?.jerarquiaCategorias || [];
  return rows.map(normalizeJerarquiaCategoria).filter((item) => item.dep_id);
}

export function getSegmentosByCanal(segmentos, canal) {
  const normalizedCanal = normalizeCanal(canal);
  return (segmentos || [])
    .map(normalizeSegmentoCliente)
    .filter((item) => item.activo && normalizeCanal(item.canal) === normalizedCanal)
    .sort((a, b) => Number(a.orden || 0) - Number(b.orden || 0) || a.segmento.localeCompare(b.segmento));
}

export function isSegmentedRow(row) {
  const aplica = String(row.aplicaSegmento || row.aplica_segmento || "").trim().toUpperCase();
  const segmento = normalizeValue(row.segmentoCliente || row.segmento_cliente || row.segmento);
  return aplica === "SI" || (Boolean(segmento) && segmento.toLowerCase() !== "todos");
}

export function isComboRewardRole(value) {
  return COMBO_REWARD_ROLES.includes(String(value || "").trim().toLowerCase());
}

export function getPromotionStatus(row) {
  const current = String(row.estado_registro || "").trim().toUpperCase();
  if (["CERRADO", "ANULADO"].includes(current)) return current;
  const promoType = normalizeValue(row.tipoPromo || row.tipo_promo);
  const isComplex = isComplexPromoType(promoType);
  const hasComplexFields = !isComplex || Boolean(normalizeValue(row.grupoOferta || row.grupo_oferta) && normalizeValue(row.tipoSku || row.tipo_sku));
  const hasTypeFields = validatePromoByType(row).length === 0;
  const segmentoCliente = normalizeValue(row.segmentoCliente || row.segmento_cliente || row.segmento);
  const hasSegmentFields = !isSegmentedRow(row) || Boolean(segmentoCliente && segmentoCliente.toLowerCase() !== "todos");
  const hasRequiredFields = Boolean(normalizeValue(row.sku) && promoType && normalizeValue(row.comprador) && hasComplexFields && hasTypeFields && hasSegmentFields);
  return hasRequiredFields ? "REGISTRADO" : "BORRADOR";
}

export function toAppRow(row) {
  const segmentValue = row.segmentoCliente || row.segmento_cliente || row.segmento || "";
  const aplicaSegmento = isSegmentedRow({ ...row, segmento: segmentValue }) ? "SI" : "NO";
  const rowId = row.row_id || row.id || makeId("ROW");
  const activityId = row.actividadId || row.actividad_id || row.catalogo_id || "";
  const tipoPromo = row.tipoPromo || row.tipo_promo || "";
  const grupoOferta = row.grupoOferta || row.grupo_oferta || "";
  const offerId = resolveOfferId(row, rowId, activityId, tipoPromo, grupoOferta);
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
    tipoSku: row.tipoSku || row.tipo_sku || "",
    tipo_sku: row.tipo_sku || row.tipoSku || "",
    variante: row.variante || "",
    depId: row.depId || row.dep_id || row.dept || row.DEPT || "",
    dep_id: row.dep_id || row.depId || row.dept || row.DEPT || "",
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

export function toExcelRow(row) {
  const segmented = isSegmentedRow(row);
  const segmentoCliente = segmented ? row.segmentoCliente || row.segmento_cliente || row.segmento || "" : "";
  const rowId = row.row_id || row.id || makeId("ROW");
  const activityId = row.actividadId || row.actividad_id || row.catalogo_id || "BIFOLIAR_JUN2026";
  const tipoPromo = row.tipoPromo || row.tipo_promo || "";
  const grupoOferta = row.grupoOferta || row.grupo_oferta || "";
  const offerId = resolveOfferId(row, rowId, activityId, tipoPromo, grupoOferta);
  return {
    row_id: rowId,
    actividad_id: activityId,
    oferta_id: offerId,
    comprador: row.comprador || "",
    division: row.division || "",
    tipo_promo: tipoPromo,
    grupo_oferta: grupoOferta,
    tipo_sku: row.tipoSku || row.tipo_sku || "",
    variante: row.variante || "",
    dep_id: row.depId || row.dep_id || row.dept || "",
    sku: row.sku || "",
    num_parte: row.numParte || row.num_parte || "",
    descripcion: row.descripcion || "",
    tipo_cantidad: row.tipoCantidad || row.tipo_cantidad || "Exacta",
    cantidad_minima: row.cantidadMinima || row.cantidad_minima || 1,
    precio_antes: row.precioAntes || row.precio_antes || "",
    precio_ahora: row.precioAhora || row.precio_ahora || "",
    descuento: row.descuento || "",
    comentario_comprador: row.comentario || row.comentario_comprador || "",
    aplica_segmento: segmented ? "SI" : "NO",
    segmento: segmented ? segmentoCliente : "Todos",
    segmento_cliente: segmentoCliente,
    alcance_tipo: normalizeAlcanceType(row.alcanceTipo || row.alcance_tipo),
    alcance_valor: row.alcanceValor || row.alcance_valor || "",
    estado_registro: getPromotionStatus(row),
    fecha_creacion: row.fecha_creacion || new Date().toISOString(),
    fecha_modificacion: new Date().toISOString(),
    ultima_modificacion_por: row.ultima_modificacion_por || "",
  };
}

export function toExcelComment(item, rowById = new Map()) {
  const rowId = item.row_id || item.rowId;
  const row = rowById.get(rowId) || {};
  const scope = getCommentScope(item);
  return {
    comentario_id: item.comentario_id || item.id || makeId("CMT"),
    actividad_id: item.actividad_id || item.actividadId || row.actividad_id || row.actividadId || "",
    row_id: scope === COMMENT_SCOPE_ACTIVITY ? "" : rowId,
    alcance_comentario: scope,
    prioridad: item.prioridad || "MEDIA",
    usuario: item.usuario || "Diseno Mercadeo",
    tipo_usuario: item.tipo_usuario || "Mercadeo",
    comentario: item.comentario || item.texto || "",
    estado: String(item.estado || "ABIERTO").toUpperCase(),
    fecha: item.fecha || new Date().toISOString(),
    resuelto_por: item.resuelto_por || "",
    fecha_resolucion: item.fecha_resolucion || "",
  };
}

export function toExcelDetalle(item, rowById = new Map()) {
  const rowId = item.row_id || item.rowId || "";
  const row = rowById.get(rowId) || {};
  return {
    detalle_id: item.detalle_id || item.id || makeId("DET"),
    row_id: rowId,
    actividad_id: item.actividad_id || item.actividadId || row.actividad_id || row.actividadId || "",
    oferta_id: item.oferta_id || item.ofertaId || row.oferta_id || row.ofertaId || "",
    grupo_oferta: item.grupo_oferta || item.grupoOferta || row.grupo_oferta || row.grupoOferta || "",
    tipo_promo: item.tipo_promo || item.tipoPromo || row.tipo_promo || row.tipoPromo || "",
    campo: item.campo || item.field || "",
    valor: item.valor || item.value || "",
  };
}

export function normalizeCompradorData(item) {
  const categoriaRaw = item.categoria_comprador || item.categoriaComprador || item.categoria || "";
  const seniorId = item.senior_id || item.seniorId || item.senior || "";
  const categoria = categoriaRaw || (seniorId ? "Junior" : "Senior");
  const comprador = item.comprador || item.nombre || "";
  return {
    ...item,
    comprador_id: item.comprador_id || item.compradorId || item.id || "",
    categoria_comprador: String(categoria).trim().toLowerCase() === "junior" ? "Junior" : "Senior",
    comprador,
    nombre: comprador,
    division: item.division || item.divisiones || "",
    correo: item.correo || "",
    senior_id: seniorId,
    activo: item.activo === undefined || item.activo === "" ? true : normalizeBoolean(item.activo),
  };
}

export function toExcelComprador(item) {
  const comprador = normalizeCompradorData(item);
  return {
    comprador_id: comprador.comprador_id,
    categoria_comprador: comprador.categoria_comprador,
    comprador: comprador.comprador,
    division: comprador.division,
    correo: comprador.correo,
    senior_id: comprador.senior_id,
    activo: comprador.activo,
  };
}

export function getAvanceCatalogoKey(catalogoId, division, comprador) {
  return [catalogoId, normalizeCanal(division), normalizeCanal(comprador)].join("__");
}

export function toAppAvanceCatalogo(item) {
  const catalogoId = item.catalogo_id || item.catalogoId || "";
  const division = item.division || "";
  const comprador = item.comprador || "";
  const estado = String(item.estado || (item.terminado ? "Terminado" : "")).trim();
  const terminado = estado.toLowerCase() === "terminado" || item.terminado === true;
  return {
    ...item,
    avance_id: item.avance_id || getAvanceCatalogoKey(catalogoId, division, comprador),
    catalogo_id: catalogoId,
    catalogo: item.catalogo || "",
    comprador_id: item.comprador_id || item.compradorId || "",
    comprador,
    division,
    estado: terminado ? "Terminado" : "Pendiente",
    terminado,
    fecha_estado: item.fecha_estado || item.fechaEstado || item.fecha || "",
    usuario: item.usuario || comprador,
  };
}

export function toExcelAvanceCatalogo(item, catalogos = [], compradores = []) {
  const avance = toAppAvanceCatalogo(item);
  const catalogo = catalogos.find((cat) => (cat.id || cat.catalogo_id) === avance.catalogo_id) || {};
  const comprador = compradores.find((buyer) => (buyer.comprador || buyer.nombre) === avance.comprador) || {};
  return {
    avance_id: avance.avance_id || getAvanceCatalogoKey(avance.catalogo_id, avance.division, avance.comprador),
    catalogo_id: avance.catalogo_id,
    catalogo: avance.catalogo || catalogo.nombre || catalogo.catalogo || "",
    comprador_id: avance.comprador_id || comprador.comprador_id || comprador.compradorId || "",
    comprador: avance.comprador,
    division: avance.division,
    estado: avance.terminado ? "Terminado" : "Pendiente",
    fecha_estado: avance.fecha_estado || avance.fecha || new Date().toISOString(),
    usuario: avance.usuario || avance.comprador,
  };
}

export function buildNotificacionesFromCatalogos(catalogos = []) {
  return catalogos.flatMap((catalogo) => {
    const catalogoId = catalogo.id || catalogo.catalogo_id || "";
    const correos = String(catalogo.correos || catalogo.correo || "")
      .split(/[;,]/)
      .map((correo) => correo.trim())
      .filter(Boolean);
    return correos.map((correo) => ({
      catalogo_id: catalogoId,
      correo,
      activo: catalogo.notificaciones !== false,
    }));
  });
}

export function toAppComment(item) {
  const scope = getCommentScope(item);
  const rowId = scope === COMMENT_SCOPE_ACTIVITY ? "" : item.rowId || item.row_id;
  return {
    ...item,
    id: item.id || item.comentario_id,
    comentario_id: item.comentario_id || item.id,
    actividadId: item.actividadId || item.actividad_id || item.catalogo_id || "",
    actividad_id: item.actividad_id || item.actividadId || item.catalogo_id || "",
    rowId,
    row_id: rowId,
    alcanceComentario: scope,
    alcance_comentario: scope,
    texto: item.texto || item.comentario,
    comentario: item.comentario || item.texto || "",
    estado: String(item.estado || "ABIERTO").toLowerCase() === "abierto" ? "Abierto" : "Resuelto",
  };
}

export function toAppLog(item) {
  const rawUsuario = item.usuario || "";
  const rawAccion = item.accion || "";
  return {
    ...item,
    log_id: item.log_id || item.id || makeId("LOG"),
    fecha: item.fecha || new Date().toLocaleString(),
    usuario: rawUsuario === "App React" ? "Sistema" : rawUsuario,
    catalogo: item.catalogo || item.catalogo_id || "",
    accion: rawAccion === "Guardado en Google Sheets" ? "Sincronizacion con Google Sheets" : rawAccion === "Guardado de ajustes en Google Sheets" ? "Sincronizacion de ajustes con Google Sheets" : rawAccion,
  };
}

export function toExcelLog(item) {
  const rawUsuario = item.usuario || "";
  const rawAccion = item.accion || "";
  return {
    log_id: item.log_id || item.id || makeId("LOG"),
    fecha: item.fecha || new Date().toISOString(),
    usuario: rawUsuario === "App React" ? "Sistema" : rawUsuario,
    catalogo: item.catalogo || "",
    accion: rawAccion === "Guardado en Google Sheets" ? "Sincronizacion con Google Sheets" : rawAccion === "Guardado de ajustes en Google Sheets" ? "Sincronizacion de ajustes con Google Sheets" : rawAccion,
    row_id: item.row_id || item.rowId || "",
    campo: item.campo || "",
    valor_anterior: item.valor_anterior || "",
    valor_nuevo: item.valor_nuevo || "",
    fecha_cierre: item.fecha_cierre || "",
  };
}
