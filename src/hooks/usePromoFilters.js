import { useMemo } from "react";
import { createGroupForPromoType, isComplexPromoType } from "../promoTypes/promoTypeEngine";
import { normalizeValue } from "../utils/common";
import { isActivityComment, isSegmentedRow } from "../utils/promoHelpers";

export function getPromoRowActivityId(row) {
  return row.actividadId || row.actividad_id || row.catalogo_id || "";
}

export function getPromoRowBuyer(row) {
  return row.comprador || "";
}

export function getPromoRowSegmentKey(row) {
  const segmented = isSegmentedRow(row);
  const segment = row.segmento || row.segmentoCliente || row.segmento_cliente || "";
  return segmented && normalizeValue(segment).toLowerCase() !== "todos" ? normalizeValue(segment).toLowerCase() : "todos";
}

export function usePromoFilters({
  rows = [],
  comentarios = [],
  currentActivityId = "",
  compradorSeleccionado = false,
  comprador = "",
  tipoActivo = "",
  search = "",
  segmentMode = false,
  segmentText = "",
} = {}) {
  const activityComments = useMemo(() => comentarios.filter((item) => isActivityComment(item) && (item.actividadId || item.actividad_id) === currentActivityId), [comentarios, currentActivityId]);
  const openActivityComments = activityComments.filter((item) => String(item.estado || "").toLowerCase() === "abierto");
  const latestActivityComment = activityComments[0];

  const currentSegmentKey = () => segmentMode && segmentText ? normalizeValue(segmentText).toLowerCase() : "todos";
  const rowMatchesSkuSegment = (row, sku, segmentKey = currentSegmentKey()) => normalizeValue(row.sku) === sku && getPromoRowSegmentKey(row) === segmentKey;
  const getRowsForCurrentActivity = (rowList) => currentActivityId ? rowList.filter((row) => getPromoRowActivityId(row) === currentActivityId) : rowList;
  const createGroupForCurrentActivity = (promoType, rowList = rows) => createGroupForPromoType(promoType, getRowsForCurrentActivity(rowList));
  const rowMatchesActiveScope = (row, promoType = tipoActivo) => {
    if (!compradorSeleccionado || !currentActivityId) return false;
    const matchesActivity = getPromoRowActivityId(row) === currentActivityId;
    const matchesBuyer = getPromoRowBuyer(row) === comprador;
    return matchesActivity && matchesBuyer && (row.tipoPromo || row.tipo_promo) === promoType;
  };

  const activeRows = useMemo(() => rows.filter((row) => {
    if (!compradorSeleccionado || !currentActivityId) return false;
    const rowType = row.tipoPromo || row.tipo_promo;
    const matchesActivity = getPromoRowActivityId(row) === currentActivityId;
    const matchesBuyer = getPromoRowBuyer(row) === comprador;
    return matchesActivity && matchesBuyer && rowType === tipoActivo;
  }), [rows, compradorSeleccionado, currentActivityId, comprador, tipoActivo]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const baseRows = activeRows;
    if (!term) return baseRows;
    const matchesText = (row) => `${row.sku} ${row.descripcion} ${row.numParte}`.toLowerCase().includes(term);
    if (tipoActivo !== "Combo") return baseRows.filter(matchesText);
    const isComboRow = (row) => (row.tipoPromo || row.tipo_promo) === "Combo";
    const matchingComboGroups = new Set(baseRows.filter((row) => isComboRow(row) && matchesText(row)).map((row) => row.grupoOferta || row.grupo_oferta).filter(Boolean));
    return baseRows.filter((row) => matchesText(row) || (isComboRow(row) && matchingComboGroups.has(row.grupoOferta || row.grupo_oferta)));
  }, [activeRows, search, tipoActivo]);

  const hasPromoValue = (value) => value !== undefined && value !== null && String(value).trim() !== "";
  const esCompleja = isComplexPromoType(tipoActivo);
  const missingBenefitCount = !esCompleja ? activeRows.filter((row) => normalizeValue(row.sku) && !hasPromoValue(row.precioAhora) && !hasPromoValue(row.precio_ahora) && !hasPromoValue(row.descuento)).length : 0;
  const benefitStatusText = missingBenefitCount ? `${missingBenefitCount} codigo(s) sin precio ni descuento` : activeRows.length ? "Todos los codigos tienen precio o descuento" : "Sin codigos pendientes";

  const comboGroups = useMemo(() => Array.from(new Set(rows.filter((row) => {
    if (!compradorSeleccionado || !currentActivityId) return false;
    const matchesActivity = getPromoRowActivityId(row) === currentActivityId;
    const matchesBuyer = getPromoRowBuyer(row) === comprador;
    return matchesActivity && matchesBuyer && (row.tipoPromo || row.tipo_promo) === "Combo" && (row.grupoOferta || row.grupo_oferta);
  }).map((row) => row.grupoOferta || row.grupo_oferta))).sort(), [rows, compradorSeleccionado, currentActivityId, comprador]);

  return {
    activityComments,
    openActivityComments,
    latestActivityComment,
    rowMatchesSkuSegment,
    getRowsForCurrentActivity,
    createGroupForCurrentActivity,
    rowMatchesActiveScope,
    activeRows,
    filteredRows,
    missingBenefitCount,
    benefitStatusText,
    comboGroups,
  };
}
