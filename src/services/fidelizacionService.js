import { roleHasPermission, PERMISSIONS } from "../constants/permissions";
import { canastoFidelizacionInicial, segmentosClientesIniciales } from "../constants/seedData";
import { loadXlsx } from "./excelService";
import { formatDateKey } from "../utils/promoHelpers";
import { hasSupabaseConnection } from "./supabase";


function assertFidelizacionAccess(connection, permission = PERMISSIONS.VIEW_FIDELIZACION) {
  if (!roleHasPermission(connection?.appUser?.rol || connection?.appUser?.role, permission)) {
    throw new Error("Fidelización está disponible únicamente para roles autorizados.");
  }
}

const LOCAL_STORAGE_CANASTO_KEY = "sinsa_canasto_fidelizacion_v1";
const LOCAL_STORAGE_DETALLES_KEY = "sinsa_fidelizacion_detalles_v1";

function localKey(base, connection) {
  const user = connection?.appUser || {};
  const identity = user.auth_user_id || user.id || user.buyer_id || user.email;
  if (!identity) throw new Error("La sesión no identifica al propietario de los datos locales.");
  return `${base}:${identity}`;
}

function getStoredLocalCanasto(connection) {
  const key = localKey(LOCAL_STORAGE_CANASTO_KEY, connection);
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("No se pudo leer canasto local:", e);
  }
  return [...canastoFidelizacionInicial];
}

function saveStoredLocalCanasto(data, connection) {
  localStorage.setItem(localKey(LOCAL_STORAGE_CANASTO_KEY, connection), JSON.stringify(data));
}

function getStoredLocalDetalles(connection) {
  const key = localKey(LOCAL_STORAGE_DETALLES_KEY, connection);
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("No se pudo leer detalles locales:", e);
  }
  return [];
}

function saveStoredLocalDetalles(data, connection) {
  localStorage.setItem(localKey(LOCAL_STORAGE_DETALLES_KEY, connection), JSON.stringify(data));
}

export function cleanDiscountValue(val) {
  // Internamente siempre usamos puntos porcentuales. El formato Excel se
  // interpreta al leer la celda, nunca por el tamaño del número.
  if (val == null || String(val).trim() === "") return null;
  const str = String(val).trim().replace(/%$/, "").trim().replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(str)) throw new Error(`Descuento inválido: ${val}.`);
  const num = Number(str);
  if (!Number.isFinite(num) || num < 0 || num > 100) throw new Error("El descuento debe estar entre 0 y 100%.");
  return Number(num.toFixed(2));
}

/**
 * Carga los registros del canasto de fidelizacion
 */
export async function loadCanastoFidelizacion(connection, { canal = "comasa", skuList = [], division = "", estatus = "" } = {}) {
  assertFidelizacionAccess(connection);
  const normCanal = String(canal || "comasa").toLowerCase();

  // Si hay conexión Supabase activa
  if (hasSupabaseConnection(connection)) {
    try {
      const { selectAll } = await import("./supabase/http");
      const filters = { canal: `eq.${normCanal}` };
      if (division && division !== "Todas") {
        filters.division = `eq.${division}`;
      }
      if (estatus && estatus !== "Todos") {
        filters.estatus = `eq.${estatus}`;
      }
      const data = await selectAll(connection, "canasto_fidelizacion", {
        ...filters,
        order: "sku.asc,segmento_id.asc",
      });

      if (Array.isArray(data)) {
        if (skuList && skuList.length > 0) {
          const skuSet = new Set(skuList.map((s) => String(s).trim().toLowerCase()));
          return data.filter((item) => skuSet.has(String(item.sku).trim().toLowerCase()));
        }
        return data;
      }
      throw new Error("Respuesta inválida al cargar el canasto.");
    } catch (err) {
      throw err;
    }
  }

  // Respaldo local/demo
  let localData = getStoredLocalCanasto(connection).filter((item) => String(item.canal).toLowerCase() === normCanal);
  if (division && division !== "Todas") {
    localData = localData.filter((item) => item.division === division);
  }
  if (estatus && estatus !== "Todos") {
    localData = localData.filter((item) => item.estatus === estatus);
  }
  if (skuList && skuList.length > 0) {
    const skuSet = new Set(skuList.map((s) => String(s).trim().toLowerCase()));
    localData = localData.filter((item) => skuSet.has(String(item.sku).trim().toLowerCase()));
  }
  return localData;
}

/**
 * Descarga en el navegador un buffer binario como archivo Excel
 */
function triggerDownloadBlob(buffer, filename) {
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Extrae las filas de una hoja de cálculo usando XLSX o fallback transparente con ExcelJS
 */
export async function extractRowsFromExcel(fileOrBuffer) {
  const buffer = fileOrBuffer instanceof ArrayBuffer ? fileOrBuffer : await fileOrBuffer.arrayBuffer();

  // Método 1: SheetJS (xlsx)
  try {
    const xlsxModule = await loadXlsx();
    const workbook = xlsxModule.read(buffer, { type: "array", cellNF: true });
    const firstSheetName = workbook.SheetNames[0];
    if (firstSheetName) {
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = xlsxModule.utils.sheet_to_json(worksheet, { header: 1, defval: "", raw: false });
      const start = xlsxModule.utils.decode_range(worksheet["!ref"] || "A1").s;
      rows.forEach((row, r) => row.forEach((_value, c) => {
        const cell = worksheet[xlsxModule.utils.encode_cell({ r: start.r + r, c: start.c + c })];
        if (cell?.t === "n" && /%/.test(cell.z || "")) row[c] = `${Number((cell.v * 100).toFixed(2))}%`;
      }));
      if (rows && rows.length > 0) return rows;
    }
  } catch (errXlsx) {
    console.warn("SheetJS no disponible en este entorno, usando motor secundario ExcelJS:", errXlsx);
  }

  // Método 2: ExcelJS (fallback transparente)
  try {
    const mod = await import("exceljs");
    const ExcelJS = mod.default || mod;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new Error("El archivo Excel no contiene hojas de datos.");

    const rawRows = [];
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      const rowVals = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const raw = cell.value?.result ?? cell.value;
        const val = typeof raw === "number" && /%/.test(cell.numFmt || "")
          ? `${Number((raw * 100).toFixed(2))}%`
          : (cell.text !== undefined && cell.text !== "" ? cell.text : raw);
        rowVals[colNumber - 1] = val !== null && val !== undefined ? String(val).trim() : "";
      });
      rawRows.push(rowVals);
    });
    return rawRows;
  } catch (errExcelJS) {
    console.error("Error al procesar con ExcelJS:", errExcelJS);
    throw new Error("No se pudo leer el archivo Excel con ningún motor disponible.");
  }
}

/**
 * Parsea archivo Excel de plantilla de fidelización
 * Columnas esperadas: Sku (col 0) y los IDs de segmentos en las siguientes columnas (ej. 1002, 1102, etc.)
 */
/**
 * Parsea archivo Excel de plantilla de fidelización
 * Columnas esperadas: Sku/Codigo (obligatorio), Descripcion (opcional), y columnas de segmentos (ej. 1002, 1102, etc.)
 */
export async function parseFidelizacionExcel(fileOrBuffer, expectedSegments = []) {
  const rawRows = await extractRowsFromExcel(fileOrBuffer);

  if (!rawRows || rawRows.length < 2) {
    throw new Error("El archivo Excel está vacío o no contiene filas de datos.");
  }

  // Detectar fila de cabecera
  const headers = rawRows[0].map((h) => String(h || "").trim());
  const skuColIndex = headers.findIndex((h) => /^(sku|codigo|codigosku|codigo_sku)$/i.test(h));
  if (skuColIndex === -1) {
    throw new Error("No se encontró la columna 'Sku' o 'Codigo' en la primera fila de la plantilla.");
  }

  // Detectar columna de descripción si viene en la plantilla
  const descColIndex = headers.findIndex((h) => /^(descripcion|descripción|desc|articulo|artículo|nombre|detalle|producto)$/i.test(h));

  const isMetadataHeader = (h) => {
    return /^(sku|codigo|codigosku|codigo_sku|descripcion|descripción|desc|articulo|artículo|nombre|detalle|producto|division|división|departamento|depto|comprador|buyer|precio|costo|marca|proveedor|estatus|estado|canal)$/i.test(h);
  };

  // Mapear columnas de segmentos ignorando columnas de metadatos
  const segmentColumns = [];
  const allowedSegments = new Set(expectedSegments.map((s) => String(s.segmento_id || s.segmento || s).trim()));
  headers.forEach((header, index) => {
    if (index === skuColIndex || index === descColIndex || isMetadataHeader(header)) return;
    const cleanHeader = header.replace(/[^0-9a-zA-Z_-]/g, "");
    if (cleanHeader) {
      if (allowedSegments.size && !allowedSegments.has(cleanHeader)) throw new Error(`Segmento desconocido: ${header}. Descargue la plantilla del canal.`);
      if (segmentColumns.some((c) => c.segmento_id === cleanHeader)) throw new Error(`Segmento duplicado: ${header}.`);
      segmentColumns.push({ index, segmento_id: cleanHeader, rawHeader: header });
    }
  });

  if (segmentColumns.length === 0) {
    throw new Error("No se encontraron columnas de segmentos válidas en la cabecera (ej. 1002, 1102, 1003).");
  }

  const parsedItems = [];
  const seenSkus = new Set();
  for (let r = 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    const sku = String(row[skuColIndex] || "").trim();
    if (!sku) continue;
    if (seenSkus.has(sku)) throw new Error(`SKU duplicado en la fila ${r + 1}: ${sku}.`);
    seenSkus.add(sku);

    const descripcion = descColIndex !== -1 ? String(row[descColIndex] || "").trim() : "";

    const segmentsMap = {};
    segmentColumns.forEach(({ index, segmento_id }) => {
      const rawVal = row[index];
      try {
        const discount = cleanDiscountValue(rawVal);
        if (discount !== null) segmentsMap[segmento_id] = discount;
      } catch (error) {
        throw new Error(`Fila ${r + 1}, SKU ${sku}, segmento ${segmento_id}: ${error.message}`);
      }
    });

    parsedItems.push({
      sku,
      descripcion,
      segments: segmentsMap,
    });
  }

  return {
    headers: segmentColumns.map((c) => c.segmento_id),
    items: parsedItems,
  };
}

/**
 * Consulta en Supabase las descripciones de SKUs no encontrados en memoria
 */
export async function fetchMissingSkuDescriptions(connection, skus = []) {
  const { loadSkuMasterBySkusFromSupabase } = await import("./supabase/skuMaster");
  const { skuMaster } = await loadSkuMasterBySkusFromSupabase(connection, skus);
  return new Map(Object.entries(skuMaster).map(([key, item]) => [key, {
    ...item, division: item.dep_id || "",
  }]));
}

/**
 * Compara los datos propuestos contra el canasto actual y calcula los deltas
 */
export function calculateFidelizacionDeltas({
  parsedItems,
  currentCanasto = [],
  canal = "comasa",
  skuMaster = {},
  catalogMap = null,
  defaultDivision = "",
}) {
  // Mapa de canasto actual por clave: `${sku}|${segmento_id}`
  const currentMap = new Map();
  const currentSkusSet = new Set();
  const canastoSkuInfo = new Map();

  currentCanasto.forEach((item) => {
    const s = String(item.sku).trim();
    const seg = String(item.segmento_id).trim();
    const key = `${s}|${seg}`;
    currentMap.set(key, item);
    currentSkusSet.add(s);
    if (!canastoSkuInfo.has(s)) {
      canastoSkuInfo.set(s, item);
    }
  });

  let nuevosCount = 0;
  let subenCount = 0;
  let bajanCount = 0;
  let eliminanCount = 0;
  let sinCambioCount = 0;

  const deltas = [];
  const processedSkus = new Set();

  parsedItems.forEach(({ sku, descripcion: itemDesc, segments }) => {
    const isSkuNewToCanasto = !currentSkusSet.has(sku);
    if (isSkuNewToCanasto && !processedSkus.has(sku)) {
      nuevosCount++;
    }
    processedSkus.add(sku);

    const sKey = sku.toLowerCase();
    let catInfo = null;
    if (catalogMap) {
      if (typeof catalogMap.get === "function") {
        catInfo = catalogMap.get(sKey) || catalogMap.get(sku);
        if (!catInfo && !Number.isNaN(Number(sku))) {
          catInfo = catalogMap.get(String(Number(sku)));
        }
      } else {
        catInfo = catalogMap[sKey] || catalogMap[sku];
        if (!catInfo && !Number.isNaN(Number(sku))) {
          catInfo = catalogMap[String(Number(sku))];
        }
      }
    }

    const skuNum = Number(sku);
    const masterInfo =
      skuMaster[sku] ||
      skuMaster[sKey] ||
      (!Number.isNaN(skuNum) ? (skuMaster[String(skuNum)] || skuMaster[String(skuNum).padStart(6, "0")]) : null) ||
      {};
    const existingInCanasto =
      canastoSkuInfo.get(sku) ||
      canastoSkuInfo.get(sKey) ||
      (!Number.isNaN(skuNum) ? canastoSkuInfo.get(String(skuNum)) : null);

    const resolvedDesc =
      itemDesc ||
      catInfo?.descripcion ||
      masterInfo.descripcion ||
      existingInCanasto?.descripcion ||
      "";

    const division =
      catInfo?.division ||
      masterInfo.dep_id ||
      masterInfo.division ||
      masterInfo.departamento ||
      existingInCanasto?.division ||
      defaultDivision ||
      "";

    Object.entries(segments).forEach(([segmento_id, requestedDiscount]) => {
      const key = `${sku}|${segmento_id}`;
      const existing = currentMap.get(key);
      const anteriorDiscount = existing ? Number(existing.descuento || 0) : 0;
      const requestedNum = cleanDiscountValue(requestedDiscount);
      if (requestedNum === null) return;

      let tipo_cambio = "SIN_CAMBIO";
      if (!existing) {
        tipo_cambio = requestedNum > 0 ? "NUEVO" : "SIN_CAMBIO";
      } else if (requestedNum === 0 && anteriorDiscount > 0) {
        tipo_cambio = "ELIMINA";
        eliminanCount++;
      } else if (requestedNum > anteriorDiscount) {
        tipo_cambio = "SUBE";
        subenCount++;
      } else if (requestedNum < anteriorDiscount) {
        tipo_cambio = "BAJA";
        bajanCount++;
      } else {
        tipo_cambio = "SIN_CAMBIO";
        sinCambioCount++;
      }

      if (tipo_cambio === "SIN_CAMBIO") return;
      deltas.push({
        canal: canal.toLowerCase(),
        sku,
        division,
        segmento_id,
        descuento_anterior: anteriorDiscount,
        descuento_solicitado: requestedNum,
        tipo_cambio,
        descripcion: resolvedDesc,
      });
    });
  });

  return {
    nuevosCount: new Set(deltas.filter((d) => d.tipo_cambio === "NUEVO").map((d) => d.sku)).size,
    subenCount,
    bajanCount,
    eliminanCount,
    sinCambioCount,
    totalSkus: processedSkus.size,
    deltas,
  };
}

/**
 * El sufijo único evita colisiones entre compradores y sesiones.
 */
export function createFidelizacionActivityId(actividades = []) {
  return `FID-${formatDateKey()}-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

/**
 * Registra una nueva solicitud de actualización de canasto
 */
export async function createSolicitudFidelizacion(connection, {
  actividadId,
  canal = "comasa",
  motivo = "",
  solicitante = "",
  comprador = "",
  buyerId = null,
  deltas = [],
}) {
  assertFidelizacionAccess(connection, PERMISSIONS.MANAGE_FIDELIZACION);
  deltas = deltas.filter((d) => d.tipo_cambio !== "SIN_CAMBIO").map((d) => ({
    ...d, descuento_solicitado: cleanDiscountValue(d.descuento_solicitado),
  }));
  if (!deltas.length) throw new Error("La solicitud no contiene cambios.");
  const seen = new Set();
  deltas.forEach((d) => {
    const key = `${String(d.sku).trim()}|${String(d.segmento_id).trim()}`;
    if (!d.sku || !d.segmento_id || seen.has(key)) throw new Error("SKU/segmento vacío o duplicado.");
    seen.add(key);
    if (cleanDiscountValue(d.descuento_solicitado) === null) throw new Error("El descuento solicitado es obligatorio.");
  });
  const nowIso = new Date().toISOString();
  const normCanal = canal.toLowerCase() === "comasa" ? "Comasa" : "Retail";
  const normCanalLower = normCanal.toLowerCase();

  const actividadObj = {
    actividad_id: actividadId,
    legacy_actividad_id: actividadId,
    tipo_actividad: "ESPECIAL",
    nombre_actividad: `Fidelización ${normCanal.toUpperCase()} - ${motivo || 'Actualización de Canasto'}`,
    canal: normCanal,
    estado: "Nuevo",
    comprador: comprador || solicitante,
    solicitante: solicitante || comprador,
    solicitante_buyer_id: buyerId || connection?.appUser?.buyer_id || null,
    motivo_solicitud: motivo,
    recursos_ocupados: "Pricing (ORCE)",
    fecha_creacion: nowIso,
    fecha_nuevo: nowIso,
    fecha_estado: nowIso,
    subtipo: "FIDELIZACION",
    skus_count: new Set(deltas.map((d) => d.sku)).size,
  };

  const stagingRecords = deltas.map((d) => ({
    actividad_id: actividadId,
    canal: String(d.canal || normCanalLower).toLowerCase(),
    sku: String(d.sku).trim(),
    descripcion: d.descripcion || "",
    division: d.division || "",
    segmento_id: String(d.segmento_id).trim(),
    descuento_anterior: Number(d.descuento_anterior || 0),
    descuento_solicitado: Number(d.descuento_solicitado || 0),
    tipo_cambio: d.tipo_cambio || "NUEVO",
    estado: "PENDIENTE",
    solicitante: solicitante || comprador,
    comprador: comprador || solicitante,
    created_at: nowIso,
  }));

  // Registros limpios para Supabase (sin descripcion, el SKU se relaciona con sku_master)
  const stagingDbPayload = deltas.map((d) => ({
    actividad_id: actividadId,
    canal: String(d.canal || normCanalLower).toLowerCase(),
    sku: String(d.sku).trim(),
    division: d.division || "",
    segmento_id: String(d.segmento_id).trim(),
    descuento_anterior: Number(d.descuento_anterior || 0),
    descuento_solicitado: Number(d.descuento_solicitado || 0),
    tipo_cambio: d.tipo_cambio || "NUEVO",
    estado: "PENDIENTE",
    solicitante: solicitante || comprador,
    comprador: comprador || solicitante,
    created_at: nowIso,
  }));

  // Si hay conexión con Supabase configurada
  if (hasSupabaseConnection(connection)) {
    const { callRpc } = await import("./supabase/http");
    const result = await callRpc(connection, "crear_solicitud_fidelizacion", {
      p_actividad: actividadObj,
      p_detalles: stagingDbPayload,
    });
    if (!result?.success) throw new Error(result?.error || "No se pudo guardar la solicitud.");
    return { actividad: actividadObj, stagingRecords, success: true };
  }

  // Guardar en respaldo local
  const currentDetalles = getStoredLocalDetalles(connection);
  if (currentDetalles.some((d) => d.actividad_id === actividadId)) throw new Error("El identificador de solicitud ya existe.");
  if (currentDetalles.some((d) => d.estado === "PENDIENTE" && d.canal === normCanalLower && seen.has(`${d.sku}|${d.segmento_id}`))) {
    throw new Error("Ya existe una solicitud pendiente para este SKU y segmento.");
  }
  // Actualizar estatus local en canasto a 'En proceso'
  const currentCanasto = getStoredLocalCanasto(connection);
  const currentMap = new Map(currentCanasto.filter((d) => d.canal === normCanalLower).map((d) => [`${d.sku}|${d.segmento_id}`, Number(d.descuento)]));
  if (deltas.some((d) => (currentMap.get(`${d.sku}|${d.segmento_id}`) ?? 0) !== Number(d.descuento_anterior))) {
    throw new Error("El canasto cambió. Actualice los datos y prepare nuevamente la solicitud.");
  }
  const updatedCanasto = currentCanasto.map((item) => {
    if (String(item.canal).toLowerCase() === canal.toLowerCase() && seen.has(`${item.sku}|${item.segmento_id}`)) {
      return { ...item, estatus: "En proceso", ultima_solicitud_id: actividadId };
    }
    return item;
  });
  saveStoredLocalDetalles([...stagingRecords, ...currentDetalles], connection);
  saveStoredLocalCanasto(updatedCanasto, connection);

  return {
    actividad: actividadObj,
    stagingRecords,
  };
}

/**
 * Carga el detalle de una solicitud de fidelización
 */
export async function loadSolicitudFidelizacionDetalle(connection, actividadId) {
  assertFidelizacionAccess(connection);
  if (!actividadId) return [];

  if (hasSupabaseConnection(connection)) {
    try {
      const { selectAll } = await import("./supabase/http");
      const rows = await selectAll(connection, "fidelizacion_solicitudes_detalle", {
        actividad_id: `eq.${actividadId}`,
        order: "sku.asc,segmento_id.asc,id.asc",
      });
      return Array.isArray(rows) ? rows : [];
    } catch (e) {
      throw e;
    }
  }

  const locales = getStoredLocalDetalles(connection);
  return locales.filter((item) => item.actividad_id === actividadId);
}

// Refresca exclusivamente las cabeceras de Fidelización y sus conteos reales.
export async function loadFidelizacionRequests(connection, canal) {
  assertFidelizacionAccess(connection);
  if (!hasSupabaseConnection(connection)) return null;
  const { selectAll, toPostgrestIn } = await import("./supabase/http");
  const { toActividad } = await import("./supabase/mappers");
  const requests = await selectAll(connection, "campanas", {
    legacy_actividad_id: "like.FID-*", canal: `ilike.${canal}`, order: "created_at.desc,id.asc",
  });
  const counts = new Map();
  for (let offset = 0; offset < requests.length; offset += 100) {
    const details = await selectAll(connection, "fidelizacion_solicitudes_detalle", {
      select: "id,actividad_id,sku", order: "id.asc",
      actividad_id: toPostgrestIn(requests.slice(offset, offset + 100).map((r) => r.legacy_actividad_id)),
    });
    details.forEach((d) => {
      if (!counts.has(d.actividad_id)) counts.set(d.actividad_id, new Set());
      counts.get(d.actividad_id).add(d.sku);
    });
  }
  return requests.map((r) => ({ ...toActividad(r), subtipo: "FIDELIZACION", skus_count: counts.get(r.legacy_actividad_id)?.size || 0 }));
}

// Valida la base antes de generar un archivo que se utilizará fuera del sistema.
export async function loadFidelizacionExport(connection, actividadId) {
  const details = (await loadSolicitudFidelizacionDetalle(connection, actividadId))
    .filter((d) => d.tipo_cambio !== "SIN_CAMBIO" && d.estado !== "RECHAZADO");
  const pending = details.filter((d) => d.estado === "PENDIENTE");
  for (const canal of new Set(pending.map((d) => d.canal))) {
    const canasto = await loadCanastoFidelizacion(connection, { canal });
    const current = new Map(canasto.map((d) => [`${d.sku}|${d.segmento_id}`, d]));
    if (pending.some((d) => d.canal === canal && (Number(current.get(`${d.sku}|${d.segmento_id}`)?.descuento) ?? 0) !== Number(d.descuento_anterior))) {
      throw new Error("El canasto cambió. Revise la solicitud antes de exportarla para ORCE.");
    }
    details.forEach((d) => {
      if (d.canal === canal) {
        const canastoRow = current.get(`${d.sku}|${d.segmento_id}`);
        if (canastoRow) {
          d.promo_id_orce = d.promo_id_orce || canastoRow.promo_id_orce || "";
          d.oferta_id_orce = d.oferta_id_orce || canastoRow.oferta_id_orce || "";
        }
      }
    });
  }
  return details;
}

/**
 * Finaliza la solicitud y aplica cambios al canasto maestro
 */
export async function finalizarSolicitudFidelizacion(connection, actividadId, referenciaOrce = "") {
  assertFidelizacionAccess(connection);
  if (!roleHasPermission(connection?.appUser?.rol || connection?.appUser?.role, PERMISSIONS.CHANGE_REQUEST_STATUS)) {
    throw new Error("Solo Ejecutor o Administrador puede finalizar Fidelización.");
  }
  if (hasSupabaseConnection(connection)) {
    try {
      const { callRpc } = await import("./supabase/http");
      const res = await callRpc(connection, "finalizar_solicitud_fidelizacion", {
        p_actividad_id: actividadId,
      });
      return res;
    } catch (err) {
      throw err;
    }
  }

  // Fallback local: promover deltas de detalles a canasto
  if (!referenciaOrce.trim() || referenciaOrce.trim().toUpperCase() === "ORCE-CARGADO") {
    throw new Error("Registre la referencia de carga ORCE antes de finalizar.");
  }
  const locales = getStoredLocalDetalles(connection);
  const deltas = locales.filter((item) => item.actividad_id === actividadId && item.estado === "PENDIENTE" && item.tipo_cambio !== "SIN_CAMBIO");
  if (!deltas.length) return { success: true, rows_affected: 0 };

  const currentCanasto = getStoredLocalCanasto(connection);
  const canastoMap = new Map();
  currentCanasto.forEach((item) => {
    const key = `${item.canal}|${item.sku}|${item.segmento_id}`;
    canastoMap.set(key, item);
  });
  if (deltas.some((d) => Number(canastoMap.get(`${d.canal}|${d.sku}|${d.segmento_id}`)?.descuento || 0) !== Number(d.descuento_anterior))) {
    throw new Error("El canasto cambió. Revise la solicitud antes de finalizar.");
  }

  deltas.forEach((d) => {
    const key = `${d.canal}|${d.sku}|${d.segmento_id}`;
    const nuevoEstatus = d.descuento_solicitado === 0 ? "Inactivo" : "Activo";
    canastoMap.set(key, {
      ...canastoMap.get(key),
      canal: d.canal,
      sku: d.sku,
      descripcion: d.descripcion || "",
      division: d.division || "",
      segmento_id: d.segmento_id,
      descuento: d.descuento_solicitado,
      estatus: nuevoEstatus,
      comprador: d.comprador || d.solicitante,
      ultima_solicitud_id: actividadId,
      updated_at: new Date().toISOString(),
      promo_id_orce: d.descuento_solicitado === 0 ? canastoMap.get(key)?.promo_id_orce ?? null : null,
      oferta_id_orce: d.descuento_solicitado === 0 ? canastoMap.get(key)?.oferta_id_orce ?? null : null,
      estado_conciliacion_orce: d.descuento_solicitado === 0 ? "NO_APLICA" : "PENDIENTE",
      fecha_conciliacion_orce: d.descuento_solicitado === 0 ? canastoMap.get(key)?.fecha_conciliacion_orce ?? null : null,
      lote_conciliacion_orce: d.descuento_solicitado === 0 ? canastoMap.get(key)?.lote_conciliacion_orce ?? null : null,
      revision_orce: (canastoMap.get(key)?.revision_orce || 0) + 1,
    });
  });

  // Marcar detalles como APLICADO
  const updatedDetalles = locales.map((item) => {
    if (item.actividad_id === actividadId && item.estado === "PENDIENTE") {
      if (item.tipo_cambio === "SIN_CAMBIO") return { ...item, estado: "RECHAZADO" };
      return { ...item, estado: "APLICADO", applied_at: new Date().toISOString() };
    }
    return item;
  });

  saveStoredLocalCanasto(Array.from(canastoMap.values()), connection);
  saveStoredLocalDetalles(updatedDetalles, connection);

  return { success: true, rows_affected: deltas.length };
}

/**
 * Exporta los datos en formato plano para ORCE en archivo Excel
 */
export async function exportFidelizacionOrce(items = [], filename = "Export_Fidelizacion_ORCE.xlsx") {
  items = (items || []).filter((item) => item.tipo_cambio !== "SIN_CAMBIO" && item.estado !== "RECHAZADO");
  if (!items || !items.length) {
    console.warn("No hay registros para exportar a ORCE.");
    return false;
  }

  const exportRows = items.map((item) => ({
    "SKU": item.sku,
    "ID_SEGMENTO": item.segmento_id,
    "ID_PROMO": item.promo_id_orce || item.promo_ids || item.promo_id || "",
    "ID_OFERTA": item.oferta_id_orce || item.oferta_ids || item.oferta_id || "",
    "DESCUENTO_%": `${item.descuento ?? item.descuento_solicitado ?? 0}%`,
    "VALOR_NUMERICO": (item.descuento ?? item.descuento_solicitado ?? 0) / 100,
    "CANAL": String(item.canal || "").toUpperCase(),
    "DIVISION": item.division || "",
    "COMPRADOR": item.comprador || item.solicitante || "",
    "ESTATUS": item.estatus || item.estado || "Activo",
    "SOLICITUD": item.ultima_solicitud_id || item.actividad_id || "",
    "FECHA_ACTUALIZACION": item.updated_at || item.created_at || new Date().toISOString().slice(0, 10),
  }));

  // Intento 1: SheetJS
  try {
    const xlsxModule = await loadXlsx();
    const worksheet = xlsxModule.utils.json_to_sheet(exportRows);
    const workbook = xlsxModule.utils.book_new();
    xlsxModule.utils.book_append_sheet(workbook, worksheet, "CARGA_ORCE");
    xlsxModule.writeFile(workbook, filename);
    return;
  } catch (errXlsx) {
    console.warn("SheetJS fallo para exportación ORCE, usando fallback ExcelJS:", errXlsx);
  }

  // Intento 2: ExcelJS
  const mod = await import("exceljs");
  const ExcelJS = mod.default || mod;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("CARGA_ORCE");
  if (exportRows.length > 0) {
    const cols = Object.keys(exportRows[0]);
    worksheet.addRow(cols);
    exportRows.forEach((r) => {
      worksheet.addRow(cols.map((c) => r[c]));
    });
  }
  const buffer = await workbook.xlsx.writeBuffer();
  triggerDownloadBlob(buffer, filename);
}

/**
 * Descarga plantilla modelo vacía con encabezados de segmentos
 */
export async function downloadPlantillaFidelizacion(segmentos = [], canal = "comasa") {
  const filename = `plantilla_fidelizacion_${canal}.xlsx`;
  const headers = ["Sku", "Descripcion", ...segmentos.map((s) => s.segmento_id || s.segmento || String(s))];
  const exampleRow = {
    "Sku": "1009",
    "Descripcion": "Articulo de ejemplo",
  };
  segmentos.forEach((s) => {
    const id = s.segmento_id || s.segmento || String(s);
    exampleRow[id] = "20%";
  });

  // Intento 1: SheetJS
  try {
    const xlsxModule = await loadXlsx();
    const worksheet = xlsxModule.utils.json_to_sheet([exampleRow], { header: headers });
    const workbook = xlsxModule.utils.book_new();
    xlsxModule.utils.book_append_sheet(workbook, worksheet, "Plantilla");
    xlsxModule.writeFile(workbook, filename);
    return;
  } catch (errXlsx) {
    console.warn("SheetJS fallo para descarga de plantilla, usando fallback ExcelJS:", errXlsx);
  }

  // Intento 2: ExcelJS
  const mod = await import("exceljs");
  const ExcelJS = mod.default || mod;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Plantilla");
  worksheet.addRow(headers);
  worksheet.addRow(headers.map((h) => exampleRow[h] || ""));
  const buffer = await workbook.xlsx.writeBuffer();
  triggerDownloadBlob(buffer, filename);
}
