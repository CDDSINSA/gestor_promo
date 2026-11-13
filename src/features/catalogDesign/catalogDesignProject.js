// Utilidades puras del proyecto de diseño de catálogo (extraídas de CatalogDesignPage).
import { normalizeValue } from "../../utils/common.js";

export function getCatalogoId(catalogo) {
  return String(catalogo?.id || catalogo?.catalogo_id || "").trim();
}

export function isCatalogoTrabajable(catalogo) {
  return Boolean(getCatalogoId(catalogo)) && String(catalogo?.estado || "").toLowerCase() !== "cerrado";
}

export function normalizeTextKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getMonthCode(value) {
  const text = normalizeTextKey(value);
  const months = [
    ["ENERO", "ENE"],
    ["FEBRERO", "FEB"],
    ["MARZO", "MAR"],
    ["ABRIL", "ABR"],
    ["MAYO", "MAY"],
    ["JUNIO", "JUN"],
    ["JULIO", "JUL"],
    ["AGOSTO", "AGO"],
    ["SEPTIEMBRE", "SEP"],
    ["SETIEMBRE", "SEP"],
    ["OCTUBRE", "OCT"],
    ["NOVIEMBRE", "NOV"],
    ["DICIEMBRE", "DIC"],
  ];
  return months.find(([month]) => text.includes(month))?.[1] || "";
}

export function getYearCode(value) {
  const match = String(value || "").match(/\b(20\d{2}|\d{2})\b/);
  return match ? match[1].slice(-2) : "";
}

export function getCatalogDesignSuffix(catalogo) {
  const name = normalizeTextKey(catalogo?.nombre || catalogo?.nombre_actividad || catalogo?.catalogo_id || catalogo?.id);
  const words = name.split(" ").filter(Boolean);
  const prefix = words.find((word) => word.startsWith("BIF")) ? "BIF" : (words[0] || "CAT").slice(0, 3);
  const dateText = `${catalogo?.nombre || ""} ${catalogo?.vigencia_inicio || ""} ${catalogo?.fecha_inicio || ""}`;
  const monthFromDate = catalogo?.vigencia_inicio ? new Date(catalogo.vigencia_inicio).toLocaleString("es-NI", { month: "short" }).slice(0, 3).toUpperCase() : "";
  const month = getMonthCode(dateText) || normalizeTextKey(monthFromDate).slice(0, 3) || "MES";
  const year = getYearCode(`${catalogo?.nombre || ""} ${catalogo?.vigencia_inicio || ""} ${catalogo?.fecha_inicio || ""}`) || "00";
  return `${prefix}_${month}_${year}`;
}

export function buildPageTitle(pageNumber, catalogo) {
  return `Pag-${pageNumber}_${getCatalogDesignSuffix(catalogo)}`;
}

export function buildInitialProject(catalogos = []) {
  const first = catalogos.find(isCatalogoTrabajable);
  return {
    catalogo_id: getCatalogoId(first),
    nombre_proyecto: first?.nombre ? `Diseño ${first.nombre}` : "",
    estado: "planificacion",
    fecha_inicio: "",
    fecha_entrega: "",
    cantidad_paginas: 1,
  };
}

export const MIN_ZOOM = 25;
export const MAX_ZOOM = 220;
export const ZOOM_STEP = 15;
export const clampZoom = (value) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(value)));

export function getPromoField(row = {}, ...fields) {
  for (const field of fields) {
    const value = normalizeValue(row[field]);
    if (value) return value;
  }
  return "";
}

export function formatSkuInfoValue(value) {
  return normalizeValue(value) || "Sin dato";
}
