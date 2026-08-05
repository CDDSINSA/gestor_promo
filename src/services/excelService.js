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
import { formatPromotionValidationErrors, validatePromotions } from "./promotionValidationService";

let xlsxModule;
let skuMasterWorker;

const DEFAULT_SKU_MASTER_IMPORT_LIMITS = {
  maxBytes: 50 * 1024 * 1024,
  maxRows: 170000,
  maxColumns: 50,
  fetchTimeoutMs: 30000,
  workerTimeoutMs: 30000,
};

function getPositiveEnvNumber(name, fallback) {
  const value = Number(import.meta.env?.[name] || 0);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const SKU_MASTER_IMPORT_LIMITS = {
  maxBytes: getPositiveEnvNumber("VITE_SKU_MASTER_MAX_BYTES", DEFAULT_SKU_MASTER_IMPORT_LIMITS.maxBytes),
  maxRows: getPositiveEnvNumber("VITE_SKU_MASTER_MAX_ROWS", DEFAULT_SKU_MASTER_IMPORT_LIMITS.maxRows),
  maxColumns: getPositiveEnvNumber("VITE_SKU_MASTER_MAX_COLUMNS", DEFAULT_SKU_MASTER_IMPORT_LIMITS.maxColumns),
  fetchTimeoutMs: getPositiveEnvNumber("VITE_SKU_MASTER_FETCH_TIMEOUT_MS", DEFAULT_SKU_MASTER_IMPORT_LIMITS.fetchTimeoutMs),
  workerTimeoutMs: getPositiveEnvNumber("VITE_SKU_MASTER_WORKER_TIMEOUT_MS", DEFAULT_SKU_MASTER_IMPORT_LIMITS.workerTimeoutMs),
};

const SKU_MASTER_DB_NAME = "promo-sku-master";
const SKU_MASTER_DB_VERSION = 1;
const SKU_MASTER_STORE = "files";
const SKU_MASTER_CACHE_KEY = "erp-publicado";

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
  return text === "TRUE" || text === "SI" || text === "SÍ" || text === "ACTIVO";
}

function normalizeAplicaSegmento(value, segmento) {
  const text = String(value || "").trim().toUpperCase();
  if (text === "SI" || text === "SÍ" || text === "TRUE" || text === "1" || text === "APLICA") return "SI";
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
  if (["aprovado", "aprovada", "aprobado", "aprobada", "asignado", "asignada"].includes(text)) return "Aprobado";
  if (["entrabajo", "trabajando", "enproceso", "proceso", "activo", "activa"].includes(text)) return "En trabajo";
  if (["finalizado", "finalizada", "resuelto", "resuelta", "cerrado", "cerrada"].includes(text)) return "Finalizado";
  if (["archivado", "archivada"].includes(text)) return "Archivado";
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

function valueOrDefault(value, fallback) {
  return value === "" || value === null || value === undefined ? fallback : value;
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
  if (["ACTIVIDAD", "CATALOGO", "CATÁLOGO", "GENERAL"].includes(explicit)) return COMMENT_SCOPE_ACTIVITY;
  if (["LINEA", "LÍNEA", "SKU"].includes(explicit)) return COMMENT_SCOPE_LINE;
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

function buildSkuMasterIndex(items = []) {
  return items.reduce((acc, item) => {
    acc[item.sku] = item;
    return acc;
  }, {});
}

function openSkuMasterDb() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SKU_MASTER_DB_NAME, SKU_MASTER_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SKU_MASTER_STORE)) db.createObjectStore(SKU_MASTER_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readCachedSkuMaster() {
  const db = await openSkuMasterDb();
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SKU_MASTER_STORE, "readonly");
    const store = transaction.objectStore(SKU_MASTER_STORE);
    const request = store.get(SKU_MASTER_CACHE_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

async function writeCachedSkuMaster(data) {
  const db = await openSkuMasterDb();
  if (!db) return;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SKU_MASTER_STORE, "readwrite");
    const store = transaction.objectStore(SKU_MASTER_STORE);
    store.put({ ...data, cachedAt: new Date().toISOString() }, SKU_MASTER_CACHE_KEY);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

export async function clearCachedSkuMaster() {
  const db = await openSkuMasterDb();
  if (!db) return;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SKU_MASTER_STORE, "readwrite");
    const store = transaction.objectStore(SKU_MASTER_STORE);
    store.delete(SKU_MASTER_CACHE_KEY);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

function getSkuMasterWorker() {
  if (!skuMasterWorker) {
    skuMasterWorker = new Worker(new URL("../workers/skuMasterCsvWorker.js", import.meta.url), { type: "module" });
  }
  return skuMasterWorker;
}

function createAbortError(message = "Carga ERP cancelada.") {
  try {
    return new DOMException(message, "AbortError");
  } catch {
    const error = new Error(message);
    error.name = "AbortError";
    return error;
  }
}

function isAbortError(error) {
  return error?.name === "AbortError";
}

function assertNotAborted(signal) {
  if (signal?.aborted) throw createAbortError();
}

function parseSkuMasterCsvInWorker(buffer, { limits = SKU_MASTER_IMPORT_LIMITS, signal } = {}) {
  return new Promise((resolve, reject) => {
    assertNotAborted(signal);
    const worker = getSkuMasterWorker();
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let timeoutId;
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
    };
    const onMessage = (event) => {
      if (event.data?.id !== id) return;
      cleanup();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.result);
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onAbort = () => {
      cleanup();
      worker.terminate();
      skuMasterWorker = null;
      reject(createAbortError());
    };
    timeoutId = window.setTimeout(() => {
      cleanup();
      worker.terminate();
      skuMasterWorker = null;
      reject(new Error("El archivo ERP excedio el tiempo maximo de procesamiento."));
    }, limits.workerTimeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.postMessage({ id, buffer, limits }, [buffer]);
  });
}

async function readResponseBuffer(response, onProgress, { limits = SKU_MASTER_IMPORT_LIMITS, signal } = {}) {
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > limits.maxBytes) throw new Error(`El archivo ERP supera el limite permitido (${Math.round(limits.maxBytes / 1024 / 1024)} MB).`);
  if (!response.body) {
    assertNotAborted(signal);
    onProgress?.(70);
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > limits.maxBytes) throw new Error(`El archivo ERP supera el limite permitido (${Math.round(limits.maxBytes / 1024 / 1024)} MB).`);
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  let done = false;
  while (!done) {
    if (signal?.aborted) {
      await reader.cancel().catch(() => undefined);
      throw createAbortError();
    }
    const result = await reader.read();
    done = result.done;
    if (result.value) {
      chunks.push(result.value);
      received += result.value.length;
      if (received > limits.maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error(`El archivo ERP supera el limite permitido (${Math.round(limits.maxBytes / 1024 / 1024)} MB).`);
      }
      if (contentLength > 0) onProgress?.(Math.min(70, 25 + Math.round((received / contentLength) * 45)));
    }
  }
  if (contentLength <= 0) onProgress?.(70);
  const bytes = new Uint8Array(received);
  let offset = 0;
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.length;
  });
  return bytes.buffer;
}

function getRemoteSkuMasterHeaders(cached) {
  const headers = {};
  if (cached?.etag) headers["If-None-Match"] = cached.etag;
  if (cached?.lastModified) headers["If-Modified-Since"] = cached.lastModified;
  return headers;
}

function toCachedSkuMasterResult(cached, cacheReason = "") {
  return {
    skuMaster: cached.skuMaster || {},
    skuMasterCount: cached.skuMasterCount || 0,
    sheetName: cached.sheetName || "CSV",
    etag: cached.etag || "",
    lastModified: cached.lastModified || "",
    cachedAt: cached.cachedAt || "",
    cacheReason,
    fromCache: true,
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
    cantidad_minima: normalizeNumber(valueOrDefault(row.cantidad_minima, 1)),
    precio_antes: normalizeNumber(row.precio_antes),
    precio_ahora: normalizeNumber(row.precio_ahora),
    descuento: valueOrDefault(row.descuento, ""),
    comentario_comprador: row.comentario_comprador || "",
    aplica_segmento: aplicaSegmento,
    segmento: aplicaSegmento === "SI" ? segmentoCliente || "" : "Todos",
    segmento_cliente: aplicaSegmento === "SI" ? segmentoCliente || "" : "",
    alcance_tipo: normalizeAlcanceType(row.alcance_tipo || row.alcanceTipo),
    alcance_valor: row.alcance_valor || row.alcanceValor || "",
    estado_registro: row.estado_registro || "BORRADOR",
    fecha_creacion: row.fecha_creacion || new Date().toISOString(),
    fecha_modificacion: row.fecha_modificacion || "",
    usuario_crea: row.usuario_crea || row.usuarioCrea || "",
    usuario_edita: row.usuario_edita || row.usuarioEdita || row.ultima_modificacion_por || "",
    ultima_modificacion_por: row.ultima_modificacion_por || row.usuario_edita || row.usuarioEdita || "",
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
  const skuMaster = buildSkuMasterIndex(items);
  return { skuMaster, skuMasterCount: items.length, sheetName: firstSheetName };
}

export async function loadSkuMasterFromCsvUrl(url, onProgress, { signal, limits = SKU_MASTER_IMPORT_LIMITS } = {}) {
  const cached = await readCachedSkuMaster().catch(() => null);
  const headers = getRemoteSkuMasterHeaders(cached);
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, limits.fetchTimeoutMs);
  const abortCurrentRequest = () => controller.abort();
  signal?.addEventListener("abort", abortCurrentRequest, { once: true });
  const requestOptions = { cache: "no-cache", headers, signal: controller.signal };
  try {
    onProgress?.(10);
    let response;
    try {
      assertNotAborted(signal);
      response = await fetch(url, requestOptions);
    } catch (error) {
      if (signal?.aborted) throw createAbortError();
      if (timedOut && cached?.skuMaster) return toCachedSkuMasterResult(cached);
      if (!Object.keys(headers).length) {
        if (cached?.skuMaster) return toCachedSkuMasterResult(cached);
        throw timedOut ? new Error("La descarga del archivo ERP excedio el tiempo maximo permitido.") : error;
      }
      response = await fetch(url, { cache: "no-cache", signal: controller.signal }).catch((retryError) => {
        if (signal?.aborted) throw createAbortError();
        if (cached?.skuMaster) return null;
        throw retryError;
      });
      if (!response) return toCachedSkuMasterResult(cached);
    }
    if (response.status === 304 && cached?.skuMaster) {
      onProgress?.(100);
      return toCachedSkuMasterResult(cached);
    }
    if (!response.ok) {
      if (cached?.skuMaster) return toCachedSkuMasterResult(cached);
      throw new Error(`No se pudo descargar el archivo ERP (${response.status}).`);
    }
    onProgress?.(25);
    const buffer = await readResponseBuffer(response, onProgress, { limits, signal: controller.signal });
    onProgress?.(85);
    const parsed = await parseSkuMasterCsvInWorker(buffer, { limits, signal: controller.signal });
    if (!parsed.skuMasterCount) throw new Error("No se encontraron SKU en el archivo ERP.");
    const data = {
      ...parsed,
      etag: response.headers.get("etag") || "",
      lastModified: response.headers.get("last-modified") || "",
    };
    await writeCachedSkuMaster(data).catch(() => undefined);
    onProgress?.(100);
    return data;
  } catch (error) {
    if (signal?.aborted) throw createAbortError();
    if (timedOut && cached?.skuMaster) return toCachedSkuMasterResult(cached, "La descarga excedio el tiempo maximo permitido.");
    if (isAbortError(error) && cached?.skuMaster) return toCachedSkuMasterResult(cached, error.message || "La descarga fue interrumpida.");
    if (cached?.skuMaster) return toCachedSkuMasterResult(cached, error.message || "No se pudo validar el origen ERP.");
    throw timedOut ? new Error("La descarga del archivo ERP excedio el tiempo maximo permitido.") : error;
  } finally {
    window.clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortCurrentRequest);
  }
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
      usuario_crea: promo.usuario_crea,
      usuario_edita: promo.usuario_edita,
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
  return formatPromotionValidationErrors(validatePromotions(promociones, { actividades }));
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

