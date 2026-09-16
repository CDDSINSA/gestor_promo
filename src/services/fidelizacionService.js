import { canastoFidelizacionInicial, segmentosClientesIniciales } from "../constants/seedData";
import { loadXlsx } from "./excelService";
import { formatDateKey } from "../utils/promoHelpers";
import { hasSupabaseConnection } from "./supabase";

const LOCAL_STORAGE_CANASTO_KEY = "sinsa_canasto_fidelizacion_v1";
const LOCAL_STORAGE_DETALLES_KEY = "sinsa_fidelizacion_detalles_v1";

function getStoredLocalCanasto() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_CANASTO_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("No se pudo leer canasto local:", e);
  }
  return [...canastoFidelizacionInicial];
}

function saveStoredLocalCanasto(data) {
  try {
    localStorage.setItem(LOCAL_STORAGE_CANASTO_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("No se pudo guardar canasto local:", e);
  }
}

function getStoredLocalDetalles() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_DETALLES_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("No se pudo leer detalles locales:", e);
  }
  return [];
}

function saveStoredLocalDetalles(data) {
  try {
    localStorage.setItem(LOCAL_STORAGE_DETALLES_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("No se pudo guardar detalles locales:", e);
  }
}

export function cleanDiscountValue(val) {
  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "number") {
    // Si viene en decimal tipo 0.20, convertir a 20%
    if (val > 0 && val < 1) return Number((val * 100).toFixed(2));
    return Number(val.toFixed(2));
  }
  const str = String(val).trim().replace("%", "").replace(",", ".");
  const num = parseFloat(str);
  if (isNaN(num)) return 0;
  if (num > 0 && num < 1 && String(val).includes("0.")) return Number((num * 100).toFixed(2));
  return Number(num.toFixed(2));
}

/**
 * Carga los registros del canasto de fidelizacion
 */
export async function loadCanastoFidelizacion(connection, { canal = "comasa", skuList = [], division = "", estatus = "" } = {}) {
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
        limit: 15000,
      });

      if (Array.isArray(data)) {
        if (skuList && skuList.length > 0) {
          const skuSet = new Set(skuList.map((s) => String(s).trim().toLowerCase()));
          return data.filter((item) => skuSet.has(String(item.sku).trim().toLowerCase()));
        }
        return data;
      }
    } catch (err) {
      console.warn("Error al cargar canasto de Supabase, usando respaldo local:", err);
    }
  }

  // Respaldo local/demo
  let localData = getStoredLocalCanasto().filter((item) => String(item.canal).toLowerCase() === normCanal);
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
async function extractRowsFromExcel(fileOrBuffer) {
  const buffer = fileOrBuffer instanceof ArrayBuffer ? fileOrBuffer : await fileOrBuffer.arrayBuffer();

  // Método 1: SheetJS (xlsx)
  try {
    const xlsxModule = await loadXlsx();
    const workbook = xlsxModule.read(buffer, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    if (firstSheetName) {
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = xlsxModule.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
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
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const rowVals = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const val = cell.text !== undefined && cell.text !== "" ? cell.text : cell.value;
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
  headers.forEach((header, index) => {
    if (index === skuColIndex || index === descColIndex || isMetadataHeader(header)) return;
    const cleanHeader = header.replace(/[^0-9a-zA-Z_-]/g, "");
    if (cleanHeader) {
      segmentColumns.push({ index, segmento_id: cleanHeader, rawHeader: header });
    }
  });

  if (segmentColumns.length === 0) {
    throw new Error("No se encontraron columnas de segmentos válidas en la cabecera (ej. 1002, 1102, 1003).");
  }

  const parsedItems = [];
  for (let r = 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    const sku = String(row[skuColIndex] || "").trim();
    if (!sku) continue;

    const descripcion = descColIndex !== -1 ? String(row[descColIndex] || "").trim() : "";

    const segmentsMap = {};
    segmentColumns.forEach(({ index, segmento_id }) => {
      const rawVal = row[index];
      segmentsMap[segmento_id] = cleanDiscountValue(rawVal);
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
    nuevosCount,
    subenCount,
    bajanCount,
    eliminanCount,
    sinCambioCount,
    totalSkus: processedSkus.size,
    deltas,
  };
}

/**
 * Genera el próximo ID de actividad con prefijo FID-YYYYMMDD-XXX
 */
export function createFidelizacionActivityId(actividades = []) {
  const dateKey = formatDateKey();
  const prefix = `FID-${dateKey}-`;
  const maxSeq = (actividades || []).reduce((max, act) => {
    const id = act.actividad_id || act.actividadId || "";
    if (!id.startsWith(prefix)) return max;
    const seq = Number(id.slice(prefix.length));
    return Number.isNaN(seq) ? max : Math.max(max, seq);
  }, 0);
  return `${prefix}${String(maxSeq + 1).padStart(3, "0")}`;
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
    let savedInSupabase = false;
    let lastError = null;

    // Intento 1: RPC transaccional optimizado (crear_solicitud_fidelizacion)
    try {
      const { callRpc } = await import("./supabase/http");
      const rpcResult = await callRpc(connection, "crear_solicitud_fidelizacion", {
        p_actividad: actividadObj,
        p_detalles: stagingDbPayload,
      });
      if (rpcResult?.success || rpcResult?.actividad_id) {
        savedInSupabase = true;
      } else if (rpcResult?.error) {
        throw new Error(rpcResult.error);
      }
    } catch (rpcErr) {
      console.warn("RPC crear_solicitud_fidelizacion no disponible, usando fallback directo:", rpcErr);
      lastError = rpcErr;
    }

    // Intento 2: Inserción directa REST sanitizada
    if (!savedInSupabase) {
      try {
        const { upsertRows } = await import("./supabase/http");

        // 1. Inserción sanitizada en public.campanas (solo columnas existentes en el modelo)
        const campanaDbPayload = {
          legacy_actividad_id: actividadId,
          tipo_actividad: "ESPECIAL",
          nombre_actividad: actividadObj.nombre_actividad,
          canal: normCanal,
          estado: "Nuevo",
          comprador: actividadObj.comprador,
          motivo_solicitud: motivo,
          recursos_ocupados: "Pricing (ORCE)",
          fecha_nuevo: nowIso,
          fecha_estado: nowIso,
        };
        if (actividadObj.solicitante_buyer_id) {
          campanaDbPayload.solicitante_buyer_id = actividadObj.solicitante_buyer_id;
        }

        await upsertRows(connection, "campanas", [campanaDbPayload], "legacy_actividad_id");

        // 2. Inserción sanitizada en public.fidelizacion_solicitudes_detalle (sin descripcion)
        await upsertRows(connection, "fidelizacion_solicitudes_detalle", stagingDbPayload);
        savedInSupabase = true;
      } catch (directErr) {
        console.error("Fallo guardado directo en Supabase:", directErr);
        lastError = directErr;
      }
    }

    if (!savedInSupabase) {
      throw new Error(`No se pudo guardar la solicitud en Supabase: ${lastError?.message || lastError || "Error de conexión o permisos"}. Verifique que el script docs/supabase_fidelizacion_schema.sql haya sido ejecutado en Supabase.`);
    }
  }

  // Guardar en respaldo local
  const currentDetalles = getStoredLocalDetalles();
  saveStoredLocalDetalles([...stagingRecords, ...currentDetalles]);

  // Actualizar estatus local en canasto a 'En proceso'
  const affectedSkus = new Set(deltas.map((d) => d.sku));
  const currentCanasto = getStoredLocalCanasto();
  const updatedCanasto = currentCanasto.map((item) => {
    if (String(item.canal).toLowerCase() === canal.toLowerCase() && affectedSkus.has(item.sku)) {
      return { ...item, estatus: "En proceso", ultima_solicitud_id: actividadId };
    }
    return item;
  });
  saveStoredLocalCanasto(updatedCanasto);

  return {
    actividad: actividadObj,
    stagingRecords,
  };
}

/**
 * Carga el detalle de una solicitud de fidelización
 */
export async function loadSolicitudFidelizacionDetalle(connection, actividadId) {
  if (!actividadId) return [];

  if (hasSupabaseConnection(connection)) {
    try {
      const { selectAll } = await import("./supabase/http");
      const rows = await selectAll(connection, "fidelizacion_solicitudes_detalle", {
        actividad_id: `eq.${actividadId}`,
        order: "sku.asc,segmento_id.asc",
        limit: 10000,
      });
      if (Array.isArray(rows) && rows.length > 0) return rows;
    } catch (e) {
      console.warn("Error al cargar detalles de Supabase:", e);
    }
  }

  const locales = getStoredLocalDetalles();
  return locales.filter((item) => item.actividad_id === actividadId);
}

/**
 * Finaliza la solicitud y aplica cambios al canasto maestro
 */
export async function finalizarSolicitudFidelizacion(connection, actividadId) {
  if (hasSupabaseConnection(connection)) {
    try {
      const { callRpc } = await import("./supabase/http");
      const res = await callRpc(connection, "finalizar_solicitud_fidelizacion", {
        p_actividad_id: actividadId,
      });
      return res;
    } catch (err) {
      console.warn("RPC no disponible o error, ejecutando aplicacion en fallback local:", err);
    }
  }

  // Fallback local: promover deltas de detalles a canasto
  const locales = getStoredLocalDetalles();
  const deltas = locales.filter((item) => item.actividad_id === actividadId && item.estado === "PENDIENTE");
  if (!deltas.length) return { success: true, rows_affected: 0 };

  const currentCanasto = getStoredLocalCanasto();
  const canastoMap = new Map();
  currentCanasto.forEach((item) => {
    const key = `${item.canal}|${item.sku}|${item.segmento_id}`;
    canastoMap.set(key, item);
  });

  deltas.forEach((d) => {
    const key = `${d.canal}|${d.sku}|${d.segmento_id}`;
    const nuevoEstatus = d.descuento_solicitado === 0 ? "Inactivo" : "Activo";
    canastoMap.set(key, {
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
    });
  });

  // Marcar detalles como APLICADO
  const updatedDetalles = locales.map((item) => {
    if (item.actividad_id === actividadId && item.estado === "PENDIENTE") {
      return { ...item, estado: "APLICADO", applied_at: new Date().toISOString() };
    }
    return item;
  });

  saveStoredLocalCanasto(Array.from(canastoMap.values()));
  saveStoredLocalDetalles(updatedDetalles);

  return { success: true, rows_affected: deltas.length };
}

/**
 * Exporta los datos en formato plano para ORCE en archivo Excel
 */
export async function exportFidelizacionOrce(items = [], filename = "Export_Fidelizacion_ORCE.xlsx") {
  if (!items || !items.length) {
    console.warn("No hay registros para exportar a ORCE.");
    return false;
  }

  const exportRows = items.map((item) => ({
    "SKU": item.sku,
    "ID_SEGMENTO": item.segmento_id,
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
