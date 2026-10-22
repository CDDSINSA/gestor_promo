/**
 * Análisis de márgenes por clasificación ABC (puro, sin React ni Supabase).
 *
 * Unidad de análisis: la línea de promoción (un SKU dentro de una oferta).
 * - "SKU" = códigos únicos.
 * - Margen de la línea = margen unitario (precio neto sin IVA vs costo guardado).
 * - Margen promedio = promedio simple de las líneas con margen calculable.
 * - Los obsequios (precio 0) no entran al margen; las líneas sin costo o sin precio
 *   se cuentan aparte ("Sin dato").
 */
import { classifyMargin, MARGIN_STATUS } from "./marginEngine.js";
import { ABC_CLASSIFICATIONS } from "../skuMaster/skuMasterParser.js";

// Orden de lectura para negocio: de mayor a menor rotación, luego estados de ciclo de vida.
export const ABC_DISPLAY_ORDER = Object.freeze([1, 5, 4, 2, 8, 7, 6, 9, 11, 10, 3]);
export const ABC_TOP_CODES = Object.freeze([1, 5]);
const DISCONTINUED = 3;
// Mínimo de líneas con margen para colorear o comparar un cruce (evita conclusiones con 1–2 datos).
export const MIN_COMPARABLE_LINES = 3;
export const NO_DIVISION = "Sin división";

// Grupos de la barra de composición (máximo 6 segmentos legibles).
export const ABC_GROUPS = Object.freeze([
  { id: "aa", label: "AA", codes: [1] },
  { id: "a", label: "A", codes: [5] },
  { id: "b", label: "B", codes: [4] },
  { id: "c", label: "C", codes: [2] },
  { id: "desc", label: "Descontinuado", codes: [3] },
  { id: "otras", label: "Otras", codes: [8, 7, 6, 9, 11, 10] },
]);

export const ABC_GROUP_BY_CODE = Object.freeze(Object.fromEntries(
  ABC_GROUPS.flatMap((group) => group.codes.map((code) => [code, group.id])),
));

export const ABC_FILTER_OPTIONS = Object.freeze([
  { value: "Todos", label: "Todas las clasificaciones" },
  ...ABC_DISPLAY_ORDER.map((code) => ({ value: String(code), label: `${code} · ${ABC_CLASSIFICATIONS[code]}` })),
]);

// Estados del desglose, en orden de lectura de peor a mejor.
export const ABC_BREAKDOWN_STATUSES = Object.freeze([
  MARGIN_STATUS.ROJO, MARGIN_STATUS.AMARILLO, MARGIN_STATUS.NARANJA, MARGIN_STATUS.VERDE, "SIN_DATO",
]);

/** Ofertas con al menos un SKU de la clasificación elegida. */
export function filterOffersByAbc(offers = [], abc = "Todos") {
  if (!abc || abc === "Todos") return offers;
  const code = Number(abc);
  return offers.filter((offer) => (offer.lineas || []).some((line) => line.clasificacion_abc === code));
}

function emptyBreakdown() {
  return Object.fromEntries(ABC_BREAKDOWN_STATUSES.map((status) => [status, 0]));
}

function lineStatus(line, thresholds) {
  if (line.costoUnit === null || line.costoUnit === undefined) return "SIN_DATO";
  if (line.margenUnit === null || line.margenUnit === undefined || !Number.isFinite(Number(line.margenUnit))) return "SIN_DATO";
  return classifyMargin(Number(line.margenUnit), thresholds);
}

const round1 = (value) => (value === null ? null : Math.round(value * 10) / 10);
const pct = (part, total) => (total ? (part / total) * 100 : 0);

function newBucket() {
  return { skus: new Set(), lineas: 0, margins: [], criticas: 0 };
}

function addToBucket(bucket, line, status) {
  bucket.skus.add(line.sku);
  bucket.lineas += 1;
  if (status && status !== "SIN_DATO") bucket.margins.push(Number(line.margenUnit));
  if (status === MARGIN_STATUS.ROJO) bucket.criticas += 1;
}

function closeBucket(bucket, thresholds) {
  const avg = bucket.margins.length ? bucket.margins.reduce((sum, value) => sum + value, 0) / bucket.margins.length : null;
  return {
    skus: bucket.skus.size,
    lineas: bucket.lineas,
    conMargen: bucket.margins.length,
    criticas: bucket.criticas,
    margenPromedio: round1(avg),
    estado: avg === null ? "SIN_DATO" : classifyMargin(avg, thresholds),
    comparable: bucket.margins.length >= MIN_COMPARABLE_LINES,
  };
}

/**
 * Cruce División × grupo de clasificación (mismos grupos de la barra de composición).
 * Filas ordenadas de menor a mayor margen promedio (lo que requiere atención primero);
 * las divisiones sin margen calculable van al final.
 */
export function buildDivisionMatrix(lines = [], thresholds) {
  const rows = new Map();
  const columns = new Map();
  for (const line of lines) {
    if (line.clasificacion_abc === null || line.clasificacion_abc === undefined || line.esObsequio) continue;
    const division = String(line.division || "").trim() || NO_DIVISION;
    const group = ABC_GROUP_BY_CODE[line.clasificacion_abc];
    const status = lineStatus(line, thresholds);
    if (!rows.has(division)) rows.set(division, { total: newBucket(), cells: new Map() });
    const row = rows.get(division);
    if (!row.cells.has(group)) row.cells.set(group, newBucket());
    if (!columns.has(group)) columns.set(group, newBucket());
    addToBucket(row.total, line, status);
    addToBucket(row.cells.get(group), line, status);
    addToBucket(columns.get(group), line, status);
  }
  const groupOrder = ABC_GROUPS.map((group) => group.id).filter((id) => columns.has(id));
  const matrixRows = Array.from(rows.entries()).map(([division, row]) => ({
    division,
    ...closeBucket(row.total, thresholds),
    cells: Object.fromEntries(groupOrder.filter((id) => row.cells.has(id)).map((id) => [id, closeBucket(row.cells.get(id), thresholds)])),
  })).sort((a, b) => {
    if (a.margenPromedio === null) return 1;
    if (b.margenPromedio === null) return -1;
    return a.margenPromedio - b.margenPromedio || a.division.localeCompare(b.division, "es");
  });
  return {
    columns: ABC_GROUPS.filter((group) => columns.has(group.id)),
    rows: matrixRows,
    totals: Object.fromEntries(groupOrder.map((id) => [id, closeBucket(columns.get(id), thresholds)])),
  };
}

/** Cruce División × clasificación con más margen perdido (brecha a la meta × líneas). */
export function findWeakestCell(matrix, thresholds) {
  const meta = thresholds.verde;
  let worst = null;
  for (const row of matrix.rows) {
    for (const [groupId, cell] of Object.entries(row.cells)) {
      if (!cell.comparable || cell.margenPromedio === null || cell.margenPromedio >= meta) continue;
      const impact = (meta - cell.margenPromedio) * cell.conMargen;
      if (!worst || impact > worst.impact) worst = { division: row.division, groupId, ...cell, impact };
    }
  }
  return worst;
}

/**
 * @param offers  ofertas visibles (ya filtradas en pantalla)
 * @param thresholds  cortes del semáforo normalizados
 * @param abc  filtro de clasificación ("Todos" o código); limita también las líneas
 */
export function buildAbcAnalysis(offers = [], thresholds, abc = "Todos") {
  const code = abc && abc !== "Todos" ? Number(abc) : null;
  const allLines = offers.flatMap((offer) => offer.lineas || []);
  const lines = code === null ? allLines : allLines.filter((line) => line.clasificacion_abc === code);
  const available = lines.some((line) => line.clasificacion_abc !== null && line.clasificacion_abc !== undefined);
  if (!available) return { available: false, lineas: lines.length };

  const classes = new Map();
  const skus = new Set();
  const overall = { margins: [], breakdown: emptyBreakdown(), obsequios: 0 };

  for (const line of lines) {
    const cls = line.clasificacion_abc;
    if (cls === null || cls === undefined) continue;
    if (!classes.has(cls)) classes.set(cls, { skus: new Set(), lineas: 0, margins: [], breakdown: emptyBreakdown(), obsequios: 0 });
    const entry = classes.get(cls);
    entry.skus.add(line.sku);
    skus.add(line.sku);
    entry.lineas += 1;
    if (line.esObsequio) {
      entry.obsequios += 1;
      overall.obsequios += 1;
      continue;
    }
    const status = lineStatus(line, thresholds);
    entry.breakdown[status] += 1;
    overall.breakdown[status] += 1;
    if (status !== "SIN_DATO") {
      entry.margins.push(Number(line.margenUnit));
      overall.margins.push(Number(line.margenUnit));
    }
  }

  const average = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);
  const totalSkus = skus.size;

  const rows = ABC_DISPLAY_ORDER.filter((cls) => classes.has(cls)).map((cls) => {
    const entry = classes.get(cls);
    const avg = average(entry.margins);
    const evaluated = ABC_BREAKDOWN_STATUSES.reduce((sum, status) => sum + entry.breakdown[status], 0);
    return {
      codigo: cls,
      nombre: ABC_CLASSIFICATIONS[cls],
      grupo: ABC_GROUP_BY_CODE[cls],
      skus: entry.skus.size,
      pctSkus: pct(entry.skus.size, totalSkus),
      lineas: entry.lineas,
      conMargen: entry.margins.length,
      obsequios: entry.obsequios,
      margenPromedio: round1(avg),
      estadoPromedio: avg === null ? "SIN_DATO" : classifyMargin(avg, thresholds),
      margenMin: entry.margins.length ? round1(Math.min(...entry.margins)) : null,
      margenMax: entry.margins.length ? round1(Math.max(...entry.margins)) : null,
      desglose: entry.breakdown,
      evaluadas: evaluated,
    };
  });

  const composition = ABC_GROUPS.map((group) => {
    const groupRows = rows.filter((row) => group.codes.includes(row.codigo));
    const count = groupRows.reduce((sum, row) => sum + row.skus, 0);
    return { ...group, skus: count, pct: pct(count, totalSkus), detalle: groupRows.map((row) => row.nombre) };
  }).filter((group) => group.skus > 0);

  const overallAvg = average(overall.margins);
  const topSkus = rows.filter((row) => ABC_TOP_CODES.includes(row.codigo)).reduce((sum, row) => sum + row.skus, 0);
  const summary = {
    skus: totalSkus,
    lineas: lines.length,
    conMargen: overall.margins.length,
    obsequios: overall.obsequios,
    sinDato: overall.breakdown.SIN_DATO,
    margenPromedio: round1(overallAvg),
    estadoPromedio: overallAvg === null ? "SIN_DATO" : classifyMargin(overallAvg, thresholds),
    pctTop: pct(topSkus, totalSkus),
    criticas: overall.breakdown[MARGIN_STATUS.ROJO],
    desglose: overall.breakdown,
  };

  const divisiones = buildDivisionMatrix(lines, thresholds);

  return {
    available: true,
    filtro: code,
    divisiones,
    thresholds,
    summary,
    rows,
    composition,
    insights: buildInsights(rows, summary, thresholds, { filtered: code !== null, matrix: divisiones }),
  };
}

const fmt1 = (value) => new Intl.NumberFormat("es-NI", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
const fmt0 = (value) => new Intl.NumberFormat("es-NI", { maximumFractionDigits: 0 }).format(value);

/**
 * Hallazgos en lenguaje de negocio. Solo afirmaciones que los datos sostienen; una
 * clasificación entra en comparaciones de margen con al menos 3 líneas evaluadas.
 */
export function buildInsights(rows = [], summary = {}, thresholds = {}, { filtered = false, matrix = null } = {}) {
  const meta = thresholds.verde;
  const comparable = rows.filter((row) => row.conMargen >= 3 && row.margenPromedio !== null);
  const insights = [];

  let headline;
  if (summary.margenPromedio === null) {
    headline = "Ninguna línea tiene costo y precio para calcular margen.";
  } else if (comparable.length >= 2) {
    // Titular = dónde más pesa el margen bajo: brecha a la meta × líneas evaluadas.
    const below = comparable.filter((row) => row.margenPromedio < meta);
    const lowest = [...comparable].sort((a, b) => a.margenPromedio - b.margenPromedio)[0];
    if (below.length) {
      const impact = (row) => (meta - row.margenPromedio) * row.conMargen;
      const focus = [...below].sort((a, b) => impact(b) - impact(a))[0];
      headline = `${focus.nombre} es donde más pesa el margen bajo: ${fmt0(focus.skus)} SKU con ${fmt1(focus.margenPromedio)}% promedio, ${fmt1(meta - focus.margenPromedio)} pts bajo la meta de ${fmt0(meta)}%.`;
      if (lowest.codigo !== focus.codigo) {
        insights.push({ id: "lowest", codigo: lowest.codigo, text: `El promedio más bajo es ${lowest.nombre}: ${fmt1(lowest.margenPromedio)}% en ${fmt0(lowest.skus)} SKU.` });
      }
    } else {
      headline = `Todas las clasificaciones superan la meta de ${fmt0(meta)}%; la más baja es ${lowest.nombre} con ${fmt1(lowest.margenPromedio)}%.`;
    }
  } else {
    const gap = summary.margenPromedio - meta;
    const scope = filtered && rows.length === 1 ? `${rows[0].nombre}: m` : "M";
    headline = `${scope}argen promedio de ${fmt1(summary.margenPromedio)}% en ${fmt0(summary.skus)} SKU, ${gap < 0 ? `${fmt1(-gap)} pts bajo` : `${fmt1(gap)} pts sobre`} la meta de ${fmt0(meta)}%.`;
  }

  if (matrix && matrix.rows.length > 1) {
    const cell = findWeakestCell(matrix, thresholds);
    if (cell) {
      const label = ABC_GROUPS.find((group) => group.id === cell.groupId)?.label || cell.groupId;
      insights.push({
        id: "division",
        text: `Por división, el cruce más débil es ${cell.division} · ${label}: ${fmt1(cell.margenPromedio)}% promedio en ${fmt0(cell.conMargen)} líneas.`,
      });
    }
  }

  if (summary.skus > 0 && !filtered) {
    insights.push({ id: "top", text: `${fmt0(summary.pctTop)}% de los SKU en promoción son AA o A (los de mayor rotación).` });
  }

  const totalCriticas = summary.criticas || 0;
  if (totalCriticas > 0) {
    const leader = [...rows].sort((a, b) => b.desglose[MARGIN_STATUS.ROJO] - a.desglose[MARGIN_STATUS.ROJO])[0];
    const share = leader.desglose[MARGIN_STATUS.ROJO];
    insights.push({
      id: "criticas",
      codigo: leader.codigo,
      text: `${leader.nombre} concentra ${fmt0(share)} de las ${fmt0(totalCriticas)} líneas con margen crítico (menos de ${fmt0(thresholds.amarillo)}%).`,
    });
  }

  const desc = rows.find((row) => row.codigo === DISCONTINUED);
  if (desc && desc.skus > 0) {
    insights.push({
      id: "descontinuado",
      codigo: DISCONTINUED,
      text: `${fmt0(desc.skus)} SKU descontinuados participan en promociones${desc.margenPromedio !== null ? `, con ${fmt1(desc.margenPromedio)}% de margen promedio` : ""}.`,
    });
  }

  return { headline, items: insights.slice(0, 3) };
}
