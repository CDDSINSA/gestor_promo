// Presentación legible de la auditoría (tabla logs).
// Funciona con los dos formatos guardados por el trigger audit_business_row_change:
//  - anterior: valor_anterior/valor_nuevo con la fila completa y campo = "*";
//  - formato 2: UPDATE solo con los campos cambiados y contexto.ref con SKU/actividad.
import { ROLE_LABELS, normalizeRole } from "../../constants/permissions.js";

const NOISE_FIELDS = new Set([
  "id", "campana_id", "promocion_id", "buyer_id", "usuario_id", "resuelto_por", "updated_by",
  "solicitante_buyer_id", "proyecto_id", "pagina_id", "disenador_id", "comprador_id",
  "created_at", "updated_at", "version", "usuario_crea", "usuario_edita", "legacy_row_id",
  "legacy_actividad_id", "token_conexion", "doc_id", "color", "fecha_actualizacion",
  "fecha_estado", "fecha_nuevo", "fecha_aprovado", "fecha_entrabajo", "fecha_finalizado",
  "fecha_asignado", "fecha_trabajando", "fecha_resuelto", "actualizado_por",
]);
const NOISE_PATTERN = /^tiempo_.*_horas$/;

export const LOG_FIELD_LABELS = Object.freeze({
  nombre_actividad: "Nombre",
  tipo_actividad: "Tipo de actividad",
  fecha_inicio: "Inicio",
  fecha_fin: "Fin",
  estado: "Estado",
  motivo_solicitud: "Motivo",
  canal: "Canal",
  comprador: "Comprador",
  responsable: "Responsable",
  recursos_ocupados: "Recursos",
  divisiones: "Divisiones",
  promo_ids: "ID promo",
  oferta_ids: "ID oferta",
  correos: "Correos",
  notificaciones: "Notificaciones",
  sku: "SKU",
  descripcion: "Descripción",
  oferta_id: "Oferta",
  tipo_promo: "Tipo de promoción",
  grupo_oferta: "Grupo de oferta",
  tipo_sku: "Tipo de SKU",
  variante: "Variante",
  numero_pagina: "Página",
  num_parte: "N.º de parte",
  tipo_cantidad: "Tipo de cantidad",
  cantidad_minima: "Cantidad mínima",
  precio_antes: "Precio antes",
  precio_ahora: "Precio ahora",
  descuento: "Descuento",
  comentario_comprador: "Comentario del comprador",
  aplica_segmento: "Aplica segmento",
  segmento_cliente: "Segmento",
  alcance_tipo: "Alcance",
  alcance_valor: "Valor del alcance",
  estado_registro: "Estado de la línea",
  dep_id: "Departamento",
  comentario: "Comentario",
  prioridad: "Prioridad",
  alcance_comentario: "Alcance del comentario",
  campo: "Dato",
  valor: "Valor",
  titulo_pagina: "Título de página",
  observacion_actual: "Observación",
  archivo_path: "Archivo",
});

const KIND_LABELS = {
  CATALOGO: { label: "Catálogo", article: "el catálogo" },
  ESPECIAL: { label: "Solicitud especial", article: "la solicitud especial" },
  FIDELIZACION: { label: "Fidelización", article: "la actividad de Fidelización" },
};

const DESIGN_ENTITIES = {
  CATALOGO_PROYECTO_DISENO: "el proyecto de diseño",
  CATALOGO_PAGINAS_DISENO: "una página de diseño",
  CATALOGO_PAGINA_COMENTARIOS: "una observación de diseño",
  CATALOGO_CONSOLIDADO_FINAL: "el consolidado final del catálogo",
};

const VERBS = { INSERT: "Creó", UPDATE: "Modificó", DELETE: "Eliminó", CAMBIO_ESTADO: "Cambió el estado de" };

function text(value) {
  return String(value ?? "").trim();
}

export function parseLogJson(value) {
  if (value && typeof value === "object") return value;
  const raw = text(value);
  if (!raw || (raw[0] !== "{" && raw[0] !== "[")) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getContext(log = {}) {
  const contexto = parseLogJson(log.contexto) || {};
  return { contexto, ref: parseLogJson(contexto.ref) || {} };
}

function getRows(log = {}) {
  return { before: parseLogJson(log.valor_anterior) || {}, after: parseLogJson(log.valor_nuevo) || {} };
}

function getEntity(log = {}) {
  return text(log.entidad).toUpperCase();
}

function getAction(log = {}) {
  return text(log.accion).toUpperCase();
}

function isHiddenField(key) {
  return NOISE_FIELDS.has(key) || NOISE_PATTERN.test(key);
}

export function getFieldLabel(key) {
  return LOG_FIELD_LABELS[key] || text(key).replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export function formatLogValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Datos de referencia del log: actividad, SKU y descripción, con varias fuentes de respaldo. */
export function getLogReference(log = {}) {
  const { ref } = getContext(log);
  const { before, after } = getRows(log);
  const row = { ...before, ...after };
  const actividadId = text(log.actividad_id || log.catalogo || ref.legacy_actividad_id || row.legacy_actividad_id);
  const actividadTipo = text(log.actividad_tipo || ref.tipo_actividad || row.tipo_actividad).toUpperCase();
  return {
    actividadId,
    actividadNombre: text(log.actividad_nombre || ref.nombre_actividad || row.nombre_actividad),
    actividadTipo,
    sku: text(log.sku || ref.sku || row.sku),
    descripcion: text(log.descripcion || ref.descripcion || row.descripcion),
    rowId: text(log.row_id || ref.legacy_row_id || row.legacy_row_id),
  };
}

export function getActivityKind(log = {}) {
  const { actividadId, actividadTipo } = getLogReference(log);
  if (actividadId.toUpperCase().startsWith("FID-")) return "FIDELIZACION";
  if (actividadTipo === "ESPECIAL") return "ESPECIAL";
  if (actividadTipo === "CATALOGO" || actividadId) return "CATALOGO";
  return "";
}

export function getLogModule(log = {}) {
  const entity = getEntity(log);
  if (DESIGN_ENTITIES[entity]) return "Diseño de catálogo";
  if (entity === "COMENTARIOS") return "Comentario";
  if (entity === "AVANCES_CATALOGO") return "Avance de catálogo";
  const kind = getActivityKind(log);
  if (["CAMPANAS", "PROMOCIONES", "PROMOCIONES_DETALLE"].includes(entity)) return KIND_LABELS[kind]?.label || "Actividad";
  return entity ? getFieldLabel(entity.toLowerCase()) : "";
}

/** Lista de cambios {campo, etiqueta, antes, despues} para el detalle del log. */
export function getLogChanges(log = {}) {
  const action = getAction(log);
  const { before, after } = getRows(log);
  if (action === "INSERT" || action === "DELETE") {
    const source = action === "INSERT" ? after : before;
    return Object.keys(LOG_FIELD_LABELS)
      .filter((key) => key in source && source[key] !== null && source[key] !== "")
      .map((key) => ({
        campo: key,
        etiqueta: getFieldLabel(key),
        antes: action === "DELETE" ? formatLogValue(source[key]) : "",
        despues: action === "INSERT" ? formatLogValue(source[key]) : "",
      }));
  }
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  return keys
    .filter((key) => !isHiddenField(key))
    .filter((key) => JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null))
    .sort((a, b) => {
      const order = Object.keys(LOG_FIELD_LABELS);
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.localeCompare(b);
    })
    .map((key) => ({
      campo: key,
      etiqueta: getFieldLabel(key),
      antes: formatLogValue(before[key]),
      despues: formatLogValue(after[key]),
    }));
}

function summarizeFields(changes = []) {
  const labels = changes.map((item) => item.etiqueta);
  if (!labels.length) return "";
  if (labels.length <= 3) return labels.join(", ");
  return `${labels.slice(0, 3).join(", ")} y ${labels.length - 3} más`;
}

// "el SKU 1 – X", "del SKU 1 – X", "a la línea ROW-1"...
function skuText(reference, prep = "") {
  const isSku = Boolean(reference.sku);
  const noun = isSku
    ? `SKU ${reference.sku}${reference.descripcion ? ` – ${reference.descripcion}` : ""}`
    : `línea${reference.rowId ? ` ${reference.rowId}` : ""}`;
  const article = {
    "": isSku ? "el" : "la",
    de: isSku ? "del" : "de la",
    a: isSku ? "al" : "a la",
    en: isSku ? "en el" : "en la",
  }[prep];
  return `${article} ${noun}`;
}

function quote(value, max = 80) {
  const clean = text(value).replace(/\s+/g, " ");
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function describeChange(changes, field) {
  const item = changes.find((change) => change.campo === field);
  return item ? `${item.antes} → ${item.despues}` : "";
}

/** Frase corta que explica el log: "Agregó el SKU 152832594 – Taladro". */
export function describeLog(log = {}) {
  const entity = getEntity(log);
  const action = getAction(log);
  const reference = getLogReference(log);
  const changes = getLogChanges(log);
  const { before, after } = getRows(log);
  const row = { ...before, ...after };
  const kind = KIND_LABELS[getActivityKind(log)] || { article: "la actividad" };
  const name = reference.actividadNombre ? ` «${reference.actividadNombre}»` : "";
  const isUpdate = action === "UPDATE" || action === "CAMBIO_ESTADO";

  if (!VERBS[action]) return text(log.accion) || "Acción registrada";

  if (entity === "CAMPANAS") {
    if (action === "INSERT") {
      const dates = row.fecha_inicio || row.fecha_fin ? ` (${formatLogValue(row.fecha_inicio)} a ${formatLogValue(row.fecha_fin)})` : "";
      return `Creó ${kind.article}${name}${dates}`;
    }
    if (action === "DELETE") return `Eliminó ${kind.article}${name}`;
    const estado = describeChange(changes, "estado");
    if (estado) return `Cambió el estado de ${kind.article}: ${estado}`;
    return `Editó ${kind.article}${changes.length ? `: ${summarizeFields(changes)}` : ""}`;
  }

  if (entity === "PROMOCIONES") {
    if (action === "INSERT") {
      const price = row.precio_ahora !== undefined && row.precio_ahora !== null && row.precio_ahora !== "" ? ` (precio ahora ${row.precio_ahora})` : "";
      return `Agregó ${skuText(reference)}${price}`;
    }
    if (action === "DELETE") return `Eliminó ${skuText(reference)}`;
    if (text(after.estado_registro).toUpperCase() === "ANULADO") return `Anuló ${skuText(reference)}`;
    const precio = describeChange(changes, "precio_ahora");
    if (precio && changes.length === 1) return `Cambió el precio ahora ${skuText(reference, "de")}: ${precio}`;
    return `Modificó ${skuText(reference)}${changes.length ? `: ${summarizeFields(changes)}` : ""}`;
  }

  if (entity === "PROMOCIONES_DETALLE") {
    const dato = text(row.campo) ? `«${row.campo}»` : "un dato";
    if (action === "INSERT") return `Agregó ${dato} ${skuText(reference, "a")}`;
    if (action === "DELETE") return `Quitó ${dato} ${skuText(reference, "de")}`;
    const valor = describeChange(changes, "valor");
    return `Cambió ${dato} ${skuText(reference, "de")}${valor ? `: ${valor}` : ""}`;
  }

  if (entity === "COMENTARIOS") {
    if (action === "INSERT") return `Comentó ${skuText(reference, "en")}${row.comentario ? `: «${quote(row.comentario)}»` : ""}`;
    if (action === "DELETE") return `Eliminó un comentario ${skuText(reference, "de")}`;
    if (text(after.estado).toUpperCase() === "RESUELTO") return `Resolvió un comentario ${skuText(reference, "de")}`;
    if (text(after.estado).toUpperCase() === "ABIERTO") return `Reabrió un comentario ${skuText(reference, "de")}`;
    return `Editó un comentario ${skuText(reference, "de")}`;
  }

  if (entity === "AVANCES_CATALOGO") {
    const verb = action === "INSERT" ? "Registró" : action === "DELETE" ? "Eliminó" : "Actualizó";
    return `${verb} el avance del catálogo${changes.length && isUpdate ? `: ${summarizeFields(changes)}` : ""}`;
  }

  if (DESIGN_ENTITIES[entity]) {
    const estado = describeChange(changes, "estado");
    if (isUpdate && estado) return `Cambió el estado de ${DESIGN_ENTITIES[entity]}: ${estado}`;
    return `${VERBS[action]} ${DESIGN_ENTITIES[entity]}${isUpdate && changes.length ? `: ${summarizeFields(changes)}` : ""}`;
  }

  return `${VERBS[action]} ${getFieldLabel(entity.toLowerCase()).toLowerCase()}`;
}

export function formatLogDate(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return text(value);
  return date.toLocaleString("es-NI", { dateStyle: "short", timeStyle: "short" });
}

export function formatLogUser(log = {}) {
  const role = text(log.rol);
  const label = role ? ROLE_LABELS[normalizeRole(role)] || role : "";
  return { nombre: text(log.usuario) || "Sistema", rol: label };
}

/** Log listo para la tabla. */
export function presentLog(log = {}) {
  const reference = getLogReference(log);
  return {
    id: log.log_id || log.id || `${log.fecha}-${log.accion}`,
    fecha: formatLogDate(log.fecha || log.created_at),
    usuario: formatLogUser(log),
    modulo: getLogModule(log),
    actividad: reference.actividadId,
    actividadNombre: reference.actividadNombre,
    sku: reference.sku,
    descripcionSku: reference.descripcion,
    resumen: describeLog(log),
    cambios: getLogChanges(log),
  };
}
