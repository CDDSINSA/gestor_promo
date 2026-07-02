import {
  cleanText,
  emptyToNull,
  normalizeDate,
  normalizeTimestamp,
  toBoolean,
  toNumber,
} from "./config";

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function buildCatalogosFromCampanas(campanas = []) {
  return campanas
    .filter((item) => item.tipo_actividad === "CATALOGO")
    .map((item) => ({
      catalogo_id: item.legacy_actividad_id,
      id: item.legacy_actividad_id,
      nombre: item.nombre_actividad,
      canal: item.canal,
      vigencia_inicio: item.fecha_inicio || "",
      vigencia_fin: item.fecha_fin || "",
      estado: item.estado,
      color: item.color,
      doc_id: item.doc_id,
      token_conexion: item.token_conexion,
      notificaciones: item.notificaciones,
      correos: item.correos,
      divisiones: item.divisiones || "",
    }));
}

export function toActividad(row, compradorById = {}) {
  const solicitante = row.comprador || compradorById[row.solicitante_buyer_id]?.comprador || "";
  return {
    actividad_id: row.legacy_actividad_id,
    nombre_actividad: row.nombre_actividad,
    tipo_actividad: row.tipo_actividad,
    canal: row.canal,
    fecha_inicio: row.fecha_inicio || "",
    fecha_fin: row.fecha_fin || "",
    comprador: row.comprador || solicitante,
    solicitante,
    estado: row.estado,
    fecha_creacion: row.created_at,
    motivo_solicitud: row.motivo_solicitud,
    fecha_modificacion: row.updated_at,
    responsable: row.responsable,
    recursos_ocupados: row.recursos_ocupados,
    fecha_estado: row.fecha_estado || "",
    fecha_nuevo: row.fecha_nuevo || "",
    fecha_aprovado: row.fecha_aprovado || "",
    fecha_entrabajo: row.fecha_entrabajo || "",
    fecha_finalizado: row.fecha_finalizado || "",
    fecha_asignado: row.fecha_asignado || "",
    fecha_trabajando: row.fecha_trabajando || "",
    fecha_resuelto: row.fecha_resuelto || "",
    tiempo_nuevo_horas: row.tiempo_nuevo_horas,
    tiempo_aprovado_horas: row.tiempo_aprovado_horas,
    tiempo_entrabajo_horas: row.tiempo_entrabajo_horas,
    tiempo_finalizado_horas: row.tiempo_finalizado_horas,
    tiempo_asignado_horas: row.tiempo_asignado_horas,
    tiempo_trabajando_horas: row.tiempo_trabajando_horas,
    tiempo_resuelto_horas: row.tiempo_resuelto_horas,
    tiempo_total_horas: row.tiempo_total_horas,
    promo_ids: row.promo_ids,
    oferta_ids: row.oferta_ids,
  };
}

export function toPromotionRow(row, campanaById = {}, compradorById = {}, hierarchyByDepId = {}) {
  const campana = campanaById[row.campana_id] || {};
  const comprador = compradorById[row.buyer_id] || {};
  const hierarchyDivision = hierarchyByDepId[normalizeKey(row.dep_id)]?.division || "";
  return {
    row_id: row.legacy_row_id,
    actividad_id: campana.legacy_actividad_id || "",
    oferta_id: row.oferta_id,
    comprador_id: comprador.comprador_id || "",
    comprador: comprador.comprador || "",
    division: hierarchyDivision || row.division || comprador.division || "",
    dep_id: row.dep_id || "",
    tipo_promo: row.tipo_promo,
    grupo_oferta: row.grupo_oferta,
    tipo_sku: row.tipo_sku,
    variante: row.variante,
    sku: row.sku,
    num_parte: row.num_parte,
    descripcion: row.descripcion,
    tipo_cantidad: row.tipo_cantidad,
    cantidad_minima: row.cantidad_minima,
    precio_antes: row.precio_antes,
    precio_ahora: row.precio_ahora,
    descuento: row.descuento,
    comentario_comprador: row.comentario_comprador,
    aplica_segmento: row.aplica_segmento,
    segmento_cliente: row.segmento_cliente,
    segmento: row.aplica_segmento === "SI" ? row.segmento_cliente : "Todos",
    alcance_tipo: row.alcance_tipo,
    alcance_valor: row.alcance_valor,
    estado_registro: row.estado_registro,
    fecha_creacion: row.created_at,
    fecha_modificacion: row.updated_at,
    ultima_modificacion_por: row.ultima_modificacion_por,
  };
}

export function toDbComprador(row) {
  return {
    comprador_id: emptyToNull(row.comprador_id),
    categoria_comprador: cleanText(row.categoria_comprador) || "Senior",
    comprador: cleanText(row.comprador || row.nombre),
    division: cleanText(row.division),
    correo: cleanText(row.correo),
    senior_id: cleanText(row.senior_id),
    activo: row.activo === undefined || row.activo === "" ? true : toBoolean(row.activo),
  };
}

export function toDbCampana(row, catalogosById = {}, compradorByName = {}) {
  const actividadId = cleanText(row.actividad_id || row.catalogo_id);
  const catalogo = catalogosById[actividadId] || {};
  const solicitante = cleanText(row.solicitante || row.comprador);
  return {
    legacy_actividad_id: actividadId,
    tipo_actividad: cleanText(row.tipo_actividad) || "CATALOGO",
    nombre_actividad: cleanText(row.nombre_actividad || row.nombre),
    canal: cleanText(row.canal || catalogo.canal),
    fecha_inicio: normalizeDate(row.fecha_inicio || catalogo.vigencia_inicio),
    fecha_fin: normalizeDate(row.fecha_fin || catalogo.vigencia_fin),
    solicitante_buyer_id: compradorByName[solicitante]?.id || null,
    estado: cleanText(row.estado) || "Borrador",
    motivo_solicitud: cleanText(row.motivo_solicitud),
    color: cleanText(catalogo.color) || "bg-emerald-700",
    doc_id: cleanText(catalogo.doc_id),
    token_conexion: cleanText(catalogo.token_conexion),
    notificaciones: toBoolean(catalogo.notificaciones),
    correos: cleanText(catalogo.correos),
    comprador: solicitante,
    responsable: cleanText(row.responsable),
    recursos_ocupados: cleanText(row.recursos_ocupados),
    fecha_estado: normalizeTimestamp(row.fecha_estado),
    fecha_nuevo: normalizeTimestamp(row.fecha_nuevo),
    fecha_aprovado: normalizeTimestamp(row.fecha_aprovado),
    fecha_entrabajo: normalizeTimestamp(row.fecha_entrabajo),
    fecha_finalizado: normalizeTimestamp(row.fecha_finalizado),
    fecha_asignado: normalizeTimestamp(row.fecha_asignado),
    fecha_trabajando: normalizeTimestamp(row.fecha_trabajando),
    fecha_resuelto: normalizeTimestamp(row.fecha_resuelto),
    tiempo_nuevo_horas: toNumber(row.tiempo_nuevo_horas) || 0,
    tiempo_aprovado_horas: toNumber(row.tiempo_aprovado_horas) || 0,
    tiempo_entrabajo_horas: toNumber(row.tiempo_entrabajo_horas) || 0,
    tiempo_finalizado_horas: toNumber(row.tiempo_finalizado_horas) || 0,
    tiempo_asignado_horas: toNumber(row.tiempo_asignado_horas) || 0,
    tiempo_trabajando_horas: toNumber(row.tiempo_trabajando_horas) || 0,
    tiempo_resuelto_horas: toNumber(row.tiempo_resuelto_horas) || 0,
    tiempo_total_horas: toNumber(row.tiempo_total_horas) || 0,
    promo_ids: cleanText(row.promo_ids),
    oferta_ids: cleanText(row.oferta_ids),
    divisiones: cleanText(catalogo.divisiones),
  };
}

export function toDbPromocion(row, campanaByLegacy = {}, compradorByName = {}) {
  return {
    legacy_row_id: cleanText(row.row_id),
    campana_id: campanaByLegacy[cleanText(row.actividad_id)]?.id,
    oferta_id: cleanText(row.oferta_id),
    buyer_id: compradorByName[cleanText(row.comprador)]?.id,
    tipo_promo: cleanText(row.tipo_promo),
    grupo_oferta: cleanText(row.grupo_oferta),
    tipo_sku: cleanText(row.tipo_sku) || "simple",
    variante: cleanText(row.variante),
    sku: cleanText(row.sku),
    num_parte: cleanText(row.num_parte),
    descripcion: cleanText(row.descripcion),
    tipo_cantidad: cleanText(row.tipo_cantidad) || "Exacta",
    cantidad_minima: toNumber(row.cantidad_minima) || 1,
    precio_antes: toNumber(row.precio_antes),
    precio_ahora: toNumber(row.precio_ahora),
    descuento: cleanText(row.descuento),
    comentario_comprador: cleanText(row.comentario_comprador),
    aplica_segmento: cleanText(row.aplica_segmento).toUpperCase() === "SI" ? "SI" : "NO",
    segmento_cliente: cleanText(row.segmento_cliente),
    alcance_tipo: cleanText(row.alcance_tipo),
    alcance_valor: cleanText(row.alcance_valor),
    estado_registro: cleanText(row.estado_registro) || "BORRADOR",
    dep_id: cleanText(row.dep_id),
    ultima_modificacion_por: cleanText(row.ultima_modificacion_por),
  };
}
