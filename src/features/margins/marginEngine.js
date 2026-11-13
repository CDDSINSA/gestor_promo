/**
 * Motor de márgenes por tipo de promoción (puro, sin React ni Supabase).
 *
 * Reglas:
 * - Precios guardados con IVA: el precio neto es precio / 1.15.
 * - El costo es el guardado en la promoción (promociones_costo.costo_nio, en C$).
 * - Margen = (venta neta - costo) / venta neta.
 * - Se evalúa por grupo de oferta (oferta_id). Tipos simples: cada línea es su oferta.
 * - Semáforo: verde >= 30, naranja >= 20, amarillo >= 10, rojo < 10 (configurable).
 */
import { BUY_X_GET_X_V2_PROMO_TYPE } from "../../constants/promoConstants.js";

export const IVA_RATE = 0.15;
export const DEFAULT_MARGIN_THRESHOLDS = Object.freeze({ verde: 30, naranja: 20, amarillo: 10 });
export const COST_CHANGE_TOLERANCE = 0.005;

export const MARGIN_STATUS = Object.freeze({
  VERDE: "VERDE",
  NARANJA: "NARANJA",
  AMARILLO: "AMARILLO",
  ROJO: "ROJO",
  SIN_COSTO: "SIN_COSTO",
  SIN_PRECIO: "SIN_PRECIO",
});

export const MARGIN_STATUS_LABELS = Object.freeze({
  VERDE: "Margen sano",
  NARANJA: "Aceptable",
  AMARILLO: "Bajo",
  ROJO: "Crítico",
  SIN_COSTO: "Sin costo",
  SIN_PRECIO: "Sin precio",
});

// Orden de severidad para listar primero lo que requiere atención.
const STATUS_ORDER = ["ROJO", "AMARILLO", "NARANJA", "VERDE", "SIN_PRECIO", "SIN_COSTO"];

const SIMPLE_TYPES = new Set(["precio fijo", "descuento"]);

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

export function toNumber(value) {
  if (!hasValue(value)) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value, decimals = 2) {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function normalizeType(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

export function parsePercent(value) {
  if (!hasValue(value)) return null;
  const parsed = toNumber(String(value).replace(/%/g, ""));
  if (parsed === null || parsed < 0 || parsed > 100) return null;
  return parsed;
}

export function normalizeThresholds(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const pick = (key) => {
    const parsed = toNumber(source[key]);
    return parsed === null ? DEFAULT_MARGIN_THRESHOLDS[key] : parsed;
  };
  const thresholds = { verde: pick("verde"), naranja: pick("naranja"), amarillo: pick("amarillo") };
  if (!(thresholds.verde > thresholds.naranja && thresholds.naranja > thresholds.amarillo)) {
    return { ...DEFAULT_MARGIN_THRESHOLDS };
  }
  return thresholds;
}

export function classifyMargin(marginPct, thresholds = DEFAULT_MARGIN_THRESHOLDS) {
  if (marginPct === null || marginPct === undefined || !Number.isFinite(marginPct)) return MARGIN_STATUS.ROJO;
  if (marginPct >= thresholds.verde) return MARGIN_STATUS.VERDE;
  if (marginPct >= thresholds.naranja) return MARGIN_STATUS.NARANJA;
  if (marginPct >= thresholds.amarillo) return MARGIN_STATUS.AMARILLO;
  return MARGIN_STATUS.ROJO;
}

export function isRewardLine(line = {}) {
  const role = normalizeType(line.tipo_sku);
  return ["regalia", "recompensa", "reward"].includes(role);
}

/**
 * Precio unitario con IVA que paga el cliente por la línea.
 * Precio ahora > precio antes con descuento > precio antes / precio regular sin descuento.
 */
export function resolveGrossUnitPrice(line = {}) {
  const now = toNumber(line.precio_ahora);
  if (now !== null) return now;
  const base = toNumber(line.precio_antes) ?? toNumber(line.precio_regular);
  const discount = parsePercent(line.descuento);
  if (discount !== null && discount >= 100) return 0;
  if (base === null) return null;
  if (discount !== null) return round(base * (1 - discount / 100), 4);
  return base;
}

export function netPrice(grossPrice) {
  if (grossPrice === null || grossPrice === undefined) return null;
  return grossPrice / (1 + IVA_RATE);
}

export function lineQuantity(line = {}) {
  const qty = toNumber(line.cantidad_minima);
  return qty !== null && qty > 0 ? qty : 1;
}

/** Unidades gratis adicionales de Compra X Lleva X V2 (una sola fila con la variante). */
export function buyXGetXV2FreeUnits(line = {}) {
  const match = String(line.variante || "").toLowerCase().replace(/\s+/g, "").match(/^(\d+)x(\d+)$/);
  if (!match) return 0;
  const first = Number(match[1]);
  const second = Number(match[2]);
  if (!first || !second || first === second) return 0;
  return Math.abs(first - second);
}

export function marginPercent(netSales, cost) {
  if (netSales === null || cost === null || !(netSales > 0)) return null;
  return ((netSales - cost) / netSales) * 100;
}

export function hasCostChanged(line = {}) {
  const saved = toNumber(line.costo_nio);
  const current = toNumber(line.costo_vigente_nio);
  if (saved === null || current === null) return false;
  if (saved === 0) return current !== 0;
  return Math.abs(current - saved) / saved > COST_CHANGE_TOLERANCE;
}

export function getOfferKey(line = {}) {
  const activity = line.actividad_id || "";
  if (line.oferta_id) return `${activity}::${line.oferta_id}`;
  if (SIMPLE_TYPES.has(normalizeType(line.tipo_promo)) || !line.grupo_oferta) {
    return `${activity}::${line.row_id || line.promocion_id || line.sku}`;
  }
  return `${activity}::${line.tipo_promo}::${line.buyer_id || ""}::${line.grupo_oferta}`;
}

/** Calcula los importes de una línea (por las cantidades de la oferta). */
export function evaluateLine(line = {}) {
  const grossPrice = resolveGrossUnitPrice(line);
  const unitNet = netPrice(grossPrice);
  const unitCost = toNumber(line.costo_nio);
  const qty = lineQuantity(line);
  const isV2 = normalizeType(line.tipo_promo) === normalizeType(BUY_X_GET_X_V2_PROMO_TYPE) && !isRewardLine(line);
  const freeUnits = isV2 ? buyXGetXV2FreeUnits(line) : 0;
  const deliveredUnits = qty + freeUnits;
  const netSales = unitNet === null ? null : unitNet * qty;
  const cost = unitCost === null ? null : unitCost * deliveredUnits;
  const isFree = grossPrice === 0;
  return {
    ...line,
    precioBrutoUnit: grossPrice,
    precioNetoUnit: unitNet === null ? null : round(unitNet, 4),
    costoUnit: unitCost,
    cantidad: qty,
    unidadesGratis: freeUnits,
    unidadesEntregadas: deliveredUnits,
    ventaNeta: netSales,
    costoTotal: cost,
    esObsequio: isFree,
    margenUnit: isFree ? null : marginPercent(unitNet, unitCost),
    costoCambio: hasCostChanged(line),
  };
}

function summarizeScenario(lines, thresholds) {
  const missingCost = lines.some((item) => item.costoUnit === null);
  const missingPrice = lines.some((item) => item.precioBrutoUnit === null);
  const ventaNeta = missingPrice ? null : lines.reduce((sum, item) => sum + item.ventaNeta, 0);
  const costoTotal = missingCost ? null : lines.reduce((sum, item) => sum + item.costoTotal, 0);
  const margen = marginPercent(ventaNeta, costoTotal);
  let estado;
  if (missingCost) estado = MARGIN_STATUS.SIN_COSTO;
  else if (missingPrice) estado = MARGIN_STATUS.SIN_PRECIO;
  else estado = classifyMargin(margen, thresholds);
  return {
    ventaNeta: ventaNeta === null ? null : round(ventaNeta),
    costoTotal: costoTotal === null ? null : round(costoTotal),
    margen: margen === null ? null : round(margen, 2),
    estado,
  };
}

function compareScenario(a, b) {
  const rank = (item) => STATUS_ORDER.indexOf(item.estado);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  return (a.margen ?? Infinity) - (b.margen ?? Infinity);
}

/**
 * Evalúa un grupo de oferta.
 * - Umbral: cada línea es un nivel; el grupo toma el peor nivel.
 * - Resto: el grupo completo es un escenario (lo que se cobra contra todo lo entregado).
 */
export function evaluateOffer(lines = [], thresholds = DEFAULT_MARGIN_THRESHOLDS) {
  const evaluated = lines.map(evaluateLine);
  const first = evaluated[0] || {};
  const type = normalizeType(first.tipo_promo);
  let scenarios;
  if (type === "umbral") {
    scenarios = evaluated.map((item) => ({
      nivel: item.cantidad,
      sku: item.sku,
      ...summarizeScenario([{ ...item, ventaNeta: item.precioNetoUnit, costoTotal: item.costoUnit }], thresholds),
    }));
  } else {
    scenarios = [summarizeScenario(evaluated, thresholds)];
  }
  const worst = [...scenarios].sort(compareScenario)[0] || { ventaNeta: null, costoTotal: null, margen: null, estado: MARGIN_STATUS.SIN_PRECIO };
  return {
    key: getOfferKey(first),
    actividadId: first.actividad_id || "",
    nombreActividad: first.nombre_actividad || "",
    tipoActividad: first.tipo_actividad || "",
    comprador: first.comprador || "",
    division: first.division || "",
    ofertaId: first.oferta_id || "",
    tipoPromo: first.tipo_promo || "",
    grupoOferta: first.grupo_oferta || "",
    lineas: evaluated,
    skuCount: new Set(evaluated.map((item) => item.sku)).size,
    escenarios: type === "umbral" ? scenarios : [],
    ventaNeta: worst.ventaNeta,
    costoTotal: worst.costoTotal,
    margen: worst.margen,
    estado: worst.estado,
    sinCosto: evaluated.filter((item) => item.costoUnit === null).length,
    costoCambio: evaluated.some((item) => item.costoCambio),
    costoEstimado: evaluated.some((item) => item.fuente_costo === "COMPLETADO"),
  };
}

export function groupLinesByOffer(lines = []) {
  const groups = new Map();
  lines.forEach((line) => {
    const key = getOfferKey(line);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(line);
  });
  return groups;
}

export function compareOffers(a, b) {
  const scenario = compareScenario(a, b);
  if (scenario !== 0) return scenario;
  return `${a.actividadId}${a.ofertaId}`.localeCompare(`${b.actividadId}${b.ofertaId}`);
}

export function buildMarginReport(lines = [], thresholds = DEFAULT_MARGIN_THRESHOLDS) {
  const normalizedThresholds = normalizeThresholds(thresholds);
  const offers = Array.from(groupLinesByOffer(lines).values())
    .map((group) => evaluateOffer(group, normalizedThresholds))
    .sort(compareOffers);
  const byStatus = Object.fromEntries(Object.values(MARGIN_STATUS).map((status) => [status, 0]));
  offers.forEach((offer) => { byStatus[offer.estado] += 1; });
  return {
    thresholds: normalizedThresholds,
    offers,
    summary: {
      ofertas: offers.length,
      lineas: lines.length,
      skus: new Set(lines.map((line) => line.sku)).size,
      actividades: new Set(lines.map((line) => line.actividad_id)).size,
      porEstado: byStatus,
      costoCambio: offers.filter((offer) => offer.costoCambio).length,
    },
  };
}

export function filterOffersByStatus(offers = [], status = "") {
  if (!status || status === "Todos") return offers;
  return offers.filter((offer) => offer.estado === status);
}
