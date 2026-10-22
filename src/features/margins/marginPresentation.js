import { MARGIN_STATUS, MARGIN_STATUS_LABELS } from "./marginEngine.js";

export const MARGIN_STATUS_CLASS = Object.freeze({
  VERDE: "verde",
  NARANJA: "naranja",
  AMARILLO: "amarillo",
  ROJO: "rojo",
  SIN_COSTO: "sin-costo",
  SIN_PRECIO: "sin-costo",
});

export const MARGIN_STATUS_FILTER_OPTIONS = [
  { value: "Todos", label: "Todos los estados" },
  { value: MARGIN_STATUS.ROJO, label: MARGIN_STATUS_LABELS.ROJO },
  { value: MARGIN_STATUS.AMARILLO, label: MARGIN_STATUS_LABELS.AMARILLO },
  { value: MARGIN_STATUS.NARANJA, label: MARGIN_STATUS_LABELS.NARANJA },
  { value: MARGIN_STATUS.VERDE, label: MARGIN_STATUS_LABELS.VERDE },
  { value: MARGIN_STATUS.SIN_COSTO, label: MARGIN_STATUS_LABELS.SIN_COSTO },
  { value: MARGIN_STATUS.SIN_PRECIO, label: MARGIN_STATUS_LABELS.SIN_PRECIO },
];

const moneyFormatter = new Intl.NumberFormat("es-NI", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pctFormatter = new Intl.NumberFormat("es-NI", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatMoney(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value)) ? "—" : moneyFormatter.format(Number(value));
}

export function formatPct(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value)) ? "—" : `${pctFormatter.format(Number(value))}%`;
}

export function formatQty(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.round(number * 100) / 100) : "—";
}

export function describeThresholds(thresholds) {
  return {
    VERDE: `${thresholds.verde}% o más`,
    NARANJA: `${thresholds.naranja}% a menos de ${thresholds.verde}%`,
    AMARILLO: `${thresholds.amarillo}% a menos de ${thresholds.naranja}%`,
    ROJO: `Menos de ${thresholds.amarillo}%`,
    SIN_COSTO: "Líneas sin costo guardado",
    SIN_PRECIO: "Sin precio para calcular",
  };
}

const COST_SOURCE_LABELS = Object.freeze({
  CAPTURA: "AV_COST al crear",
  COMPLETADO: "AV_COST en carga del maestro",
});

/** El costo siempre es AV_COST en C$; se indica cuándo se guardó. */
export function describeCostOrigin(line = {}) {
  if (line.costoUnit === null || line.costoUnit === undefined) return "Sin costo";
  return COST_SOURCE_LABELS[line.fuente_costo] || "AV_COST";
}

export function describeLineRole(line = {}) {
  const role = String(line.tipo_sku || "").toLowerCase();
  if (role.startsWith("regal")) return "Regalía";
  if (role === "principal") return "Principal";
  return "";
}
