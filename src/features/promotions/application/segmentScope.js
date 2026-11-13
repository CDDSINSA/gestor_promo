// Segmentos de clientes por fila de promoción.
// Una fila guarda sus segmentos como códigos unidos por " | " (ej. "1002 | 1003").
// Este módulo no depende de otros archivos para poder probarlo aislado.

export const SEGMENT_SEPARATOR = " | ";
const GENERAL_WORDS = new Set(["todos", "todas", "general", "publicogeneral", "ninguno", "na", "n/a", "-"]);

function text(value) {
  return String(value ?? "").trim();
}

function normalizeKey(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9/-]/g, "");
}

function optionId(option) {
  return text(option?.segmento_id || option?.segmento);
}

function optionName(option) {
  return text(option?.segmento || option?.nombre_segmento);
}

function isNumeric(value) {
  return /^\d+$/.test(text(value));
}

export function isGeneralSegmentText(value) {
  const key = normalizeKey(value);
  return !key || GENERAL_WORDS.has(key);
}

// Parte un texto en piezas: "1002, 1003", "1002 | 1003", "1002;1003", "1102-1104" (rango).
export function splitSegmentTokens(value) {
  return text(value)
    .split(/[|,;\n]+/)
    .map(text)
    .filter(Boolean);
}

// Resuelve lo que escribió el usuario contra los segmentos del canal.
// Devuelve los códigos en el orden del maestro de segmentos y lo que no se reconoció.
export function resolveSegmentInput(rawValue, options = []) {
  const raw = text(rawValue);
  if (isGeneralSegmentText(raw)) return { raw, general: true, segments: [], unknown: [], unverified: [], value: "" };
  const list = (options || []).filter((option) => optionId(option));
  const byId = new Map(list.map((option) => [normalizeKey(optionId(option)), optionId(option)]));
  const byName = new Map(list.map((option) => [normalizeKey(optionName(option)), optionId(option)]));
  const found = new Set();
  const unknown = [];
  const unverified = [];
  splitSegmentTokens(raw).forEach((token) => {
    const direct = byId.get(normalizeKey(token)) || byName.get(normalizeKey(token));
    if (direct) { found.add(direct); return; }
    const range = token.match(/^(\d+)\s*(?:-|a|al|hasta)\s*(\d+)$/i);
    if (range) {
      const start = Math.min(Number(range[1]), Number(range[2]));
      const end = Math.max(Number(range[1]), Number(range[2]));
      const inRange = list.filter((option) => isNumeric(optionId(option)) && Number(optionId(option)) >= start && Number(optionId(option)) <= end).map(optionId);
      if (inRange.length) { inRange.forEach((id) => found.add(id)); return; }
    }
    // Sin maestro de segmentos para el canal: se acepta un código numérico tal cual (sin verificar).
    if (!list.length && isNumeric(token)) { found.add(token); unverified.push(token); return; }
    unknown.push(token);
  });
  const segments = orderSegments(Array.from(found), list);
  return { raw, general: false, segments, unknown, unverified, value: formatSegmentValue(segments) };
}

export function orderSegments(ids = [], options = []) {
  const order = new Map((options || []).map((option, index) => [optionId(option), index]));
  return Array.from(new Set((ids || []).map(text).filter(Boolean))).sort((a, b) => {
    const ia = order.has(a) ? order.get(a) : Number.MAX_SAFE_INTEGER;
    const ib = order.has(b) ? order.get(b) : Number.MAX_SAFE_INTEGER;
    if (ia !== ib) return ia - ib;
    return a.localeCompare(b, "es", { numeric: true });
  });
}

export function formatSegmentValue(ids = []) {
  return (ids || []).map(text).filter(Boolean).join(SEGMENT_SEPARATOR);
}

// Códigos guardados en una fila ("1002 | 1003" → ["1002", "1003"]). "Todos" o vacío → [].
export function getRowSegmentList(row = {}) {
  const aplica = text(row.aplicaSegmento || row.aplica_segmento).toUpperCase();
  const value = text(row.segmentoCliente || row.segmento_cliente || row.segmento);
  if (aplica === "NO" && (!value || isGeneralSegmentText(value))) return [];
  if (isGeneralSegmentText(value)) return [];
  return splitSegmentTokens(value);
}

// Llave estable para comparar filas: no depende del orden ni de mayúsculas.
export function getSegmentKey(value) {
  const list = Array.isArray(value) ? value : splitSegmentTokens(value);
  const clean = list.map((item) => normalizeKey(item)).filter((item) => item && !GENERAL_WORDS.has(item));
  if (!clean.length) return "todos";
  return Array.from(new Set(clean)).sort((a, b) => a.localeCompare(b, "es", { numeric: true })).join("|");
}

export function getRowSegmentKey(row = {}) {
  return getSegmentKey(getRowSegmentList(row));
}

// Segmentos en común entre dos filas. Dos filas "generales" también chocan (["todos"]).
export function getSegmentOverlap(rowA = {}, rowB = {}) {
  const a = getRowSegmentList(rowA).map(normalizeKey);
  const b = getRowSegmentList(rowB).map(normalizeKey);
  if (!a.length && !b.length) return ["todos"];
  if (!a.length || !b.length) return [];
  const setB = new Set(b);
  return Array.from(new Set(a.filter((item) => setB.has(item))));
}

// Campos de segmento consistentes para una fila (todas las variantes de nombre).
export function segmentFields(value) {
  const segment = isGeneralSegmentText(value) ? "" : text(value);
  const aplica = segment ? "SI" : "NO";
  return {
    aplicaSegmento: aplica,
    aplica_segmento: aplica,
    segmento: segment || "Todos",
    segmentoCliente: segment,
    segmento_cliente: segment,
  };
}

// Contexto de una solicitud especial. El alcance "SEGMENTO" ya no se usa para filas nuevas:
// el alcance es canal o tiendas y los segmentos se eligen por SKU. Una solicitud vieja con
// alcance SEGMENTO pasa a canal y sus segmentos quedan como valor por defecto.
export function normalizeSpecialScope(context = null, canal = "") {
  if (!context) return null;
  const tipo = text(context.alcance_tipo || context.alcanceTipo).toUpperCase() || "CANAL";
  const valor = text(context.alcance_valor || context.alcanceValor);
  const segmentoCliente = text(context.segmento_cliente || context.segmentoCliente);
  const aplica = text(context.aplica_segmento || context.aplicaSegmento).toUpperCase() === "SI";
  if (tipo === "SEGMENTO") {
    return {
      ...context,
      alcance_tipo: "CANAL",
      alcance_valor: text(canal || context.canal),
      aplica_segmento: "SI",
      segmento_cliente: segmentoCliente || valor,
      legacy_segment_scope: true,
    };
  }
  return {
    ...context,
    alcance_tipo: tipo,
    alcance_valor: valor || (tipo === "CANAL" ? text(canal || context.canal) : ""),
    aplica_segmento: aplica ? "SI" : "NO",
    segmento_cliente: aplica ? segmentoCliente : "",
  };
}

// Segmento de una fila nueva. Prioridad: valor de la fila (columna / modal) → selección de la
// ventana de carga → valor por defecto de la solicitud especial.
export function resolveRowSegment({ explicit, selection = "", segmentMode = false, context = null } = {}) {
  if (explicit !== undefined && explicit !== null && text(explicit) !== "") {
    return isGeneralSegmentText(explicit) ? "" : text(explicit);
  }
  if (segmentMode && text(selection)) return text(selection);
  if (context && text(context.aplica_segmento).toUpperCase() === "SI") return text(context.segmento_cliente);
  return "";
}

// Si la solicitud aplica a segmentos y la fila no tiene ninguno, queda marcada como segmentada
// y vacía para que la validación la señale (en vez de guardarla como pública general).
export function rowSegmentFieldsFor({ segment = "", requireSegment = false } = {}) {
  if (segment) return segmentFields(segment);
  if (requireSegment) return { aplicaSegmento: "SI", aplica_segmento: "SI", segmento: "", segmentoCliente: "", segmento_cliente: "" };
  return segmentFields("");
}

// ---- Tabla SKU × segmento -------------------------------------------------------------------
// Encabezado: SKU | 1002 | 1003 | 1102-1104 | ... (+ columnas opcionales página / comentario).
// Cada celda trae el beneficio de ese segmento; los segmentos con el mismo valor se agrupan.
const SKU_HEADERS = new Set(["sku", "codigo", "codigosku", "codsku"]);
const PAGE_HEADERS = new Set(["pagina", "numeropagina", "numpagina", "pag"]);
const COMMENT_HEADERS = new Set(["comentario", "comentarios", "comment"]);

export function parseSegmentMatrix(rows = [], options = [], { normalizeValueCell = text } = {}) {
  const issues = [];
  const header = rows[0] || [];
  const headerKeys = header.map(normalizeKey);
  let skuIndex = headerKeys.findIndex((key) => SKU_HEADERS.has(key));
  if (skuIndex < 0) {
    issues.push({ type: "format", message: "La primera fila debe ser encabezado: SKU y los códigos de segmento (ej. SKU | 1002 | 1003)." });
    skuIndex = 0;
  }
  const pageIndex = headerKeys.findIndex((key) => PAGE_HEADERS.has(key));
  const commentIndex = headerKeys.findIndex((key) => COMMENT_HEADERS.has(key));
  const segmentColumns = [];
  header.forEach((cell, index) => {
    if (index === skuIndex || index === pageIndex || index === commentIndex || !text(cell)) return;
    const resolved = resolveSegmentInput(cell, options);
    if (resolved.general || !resolved.segments.length || resolved.unknown.length) {
      issues.push({ type: "header", message: `Encabezado "${text(cell)}" no es un segmento del canal.` });
      return;
    }
    segmentColumns.push({ index, label: text(cell), segments: resolved.segments });
  });
  if (!segmentColumns.length) issues.push({ type: "format", message: "No se encontraron columnas de segmento en el encabezado." });

  const entries = [];
  rows.slice(1).forEach((cells, rowIndex) => {
    const sku = text(cells[skuIndex]);
    if (!sku) return;
    const byValue = new Map();
    const repeated = [];
    const seen = new Set();
    segmentColumns.forEach((column) => {
      const rawCell = text(cells[column.index]);
      if (!rawCell) return;
      const value = normalizeValueCell(rawCell);
      column.segments.forEach((segment) => {
        if (seen.has(segment)) repeated.push(segment);
        seen.add(segment);
      });
      const key = text(value);
      const current = byValue.get(key) || { value, segments: [] };
      current.segments.push(...column.segments);
      byValue.set(key, current);
    });
    byValue.forEach((group) => {
      entries.push({
        line: rowIndex + 2,
        sku,
        value: group.value,
        segments: orderSegments(group.segments, options),
        page: pageIndex >= 0 ? text(cells[pageIndex]) : "",
        comment: commentIndex >= 0 ? text(cells[commentIndex]) : "",
        repeatedSegments: Array.from(new Set(repeated)),
      });
    });
  });
  return { entries, issues, segmentColumns };
}

// ¿Parece un precio que en realidad es un código de segmento o un precio fuera de lugar?
export function checkSuspiciousPrice({ price, regularPrice, options = [], promoType = "" } = {}) {
  const value = Number(String(price ?? "").replace(/,/g, ""));
  if (!Number.isFinite(value) || text(price) === "") return null;
  const looksLikeSegment = (options || []).some((option) => isNumeric(optionId(option)) && Number(optionId(option)) === value);
  const regular = Number(String(regularPrice ?? "").replace(/,/g, ""));
  const aboveRegular = Number.isFinite(regular) && regular > 0 && value > regular + 0.005;
  if (!looksLikeSegment && !aboveRegular) return null;
  const parts = [];
  if (looksLikeSegment) parts.push(`${text(price)} coincide con un código de segmento: la columna Segmento debe llevar encabezado "Segmento"`);
  if (aboveRegular) parts.push(`Ahora c/IVA ${text(price)} es mayor que el precio regular ${regular.toFixed(2)}`);
  // Un descuento nunca puede dejar el precio arriba del regular: esa fila no se aplica.
  const blocking = promoType === "Descuento" && aboveRegular;
  return { message: parts.join(". "), blocking, looksLikeSegment, aboveRegular };
}
