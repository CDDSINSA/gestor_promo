import {
  AIRES_PROMO_TYPE,
  ACTIVITY_TYPES,
  ALCANCE_TYPES,
  BUY_X_GET_X_PROMO_TYPE,
  BUY_X_GET_X_V2_PROMO_TYPE,
  COMBO_REWARD_ROLES,
  MEGAPACK_PROMO_TYPE,
} from "../constants";
import { isComplexPromoType } from "../promoTypes/promoTypeEngine";
import { isAnulledPromotion } from "../features/promotions/application/promotionAnulation";
import { getSegmentOverlap } from "../features/promotions/application/segmentScope";

function text(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function hasValue(value) {
  return value !== undefined && value !== null && text(value) !== "";
}

function hasPriceOrDiscount(row) {
  return hasValue(row.precioAhora) || hasValue(row.precio_ahora) || hasValue(row.descuento);
}

function discountOverLimit(value) {
  const match = text(value).replace(/\s+/g, "").match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return false;
  const percent = Math.abs(Number(match[0].replace(",", ".")));
  return Number.isFinite(percent) && percent > 100;
}

function positiveNumber(value) {
  const number = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) && number > 0;
}

function parseNumber(value) {
  const raw = text(value).replace(/\s+/g, "");
  if (!raw) return null;
  const number = Number(raw.replace(/[^0-9.,-]/g, "").replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

// Beneficio de un escalón de Umbral: { kind: "descuento" | "precio", value } o null.
function getUmbralBenefit(row) {
  const descuento = text(row.descuento);
  if (descuento) {
    const value = parseNumber(descuento);
    return value === null ? null : { kind: "descuento", value: Math.abs(value) };
  }
  const value = parseNumber(row.precio_ahora ?? row.precioAhora);
  return value === null ? null : { kind: "precio", value };
}

function formatQuantity(value) {
  return Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
}

function getRowId(row) {
  return text(row.row_id || row.rowId || row.id);
}

function getSku(row) {
  return text(row.sku);
}

function getTipoPromo(row) {
  return text(row.tipo_promo || row.tipoPromo);
}

function getNormalizedTipoPromo(row) {
  return lower(getTipoPromo(row));
}

function getGrupoOferta(row) {
  return text(row.grupo_oferta || row.grupoOferta);
}

function getTipoSku(row) {
  return text(row.tipo_sku || row.tipoSku);
}

function getActividadId(row) {
  return text(row.actividad_id || row.actividadId || row.catalogo_id || row.catalogoId);
}

function getOfertaId(row) {
  return text(row.oferta_id || row.ofertaId);
}

function getComprador(row) {
  return text(row.comprador);
}

function getCantidadMinima(row) {
  return row.cantidad_minima ?? row.cantidadMinima;
}

function getVariante(row) {
  return text(row.variante);
}

function normalizeAplicaSegmento(row) {
  const aplica = text(row.aplica_segmento || row.aplicaSegmento).toUpperCase();
  const segmento = text(row.segmento_cliente || row.segmentoCliente || row.segmento);
  if (aplica === "SI" || aplica === "SÍ" || aplica === "TRUE" || aplica === "1") return "SI";
  if (aplica === "NO" || aplica === "FALSE" || aplica === "0") return "NO";
  return segmento && lower(segmento) !== "todos" ? "SI" : "NO";
}

function buildActivityMap(actividades = []) {
  const map = new Map();
  actividades.forEach((item) => {
    const id = text(item.actividad_id || item.actividadId || item.catalogo_id || item.catalogoId || item.id);
    if (!id) return;
    map.set(id, item);
  });
  return map;
}

function buildBuyerSet(compradores = []) {
  return new Set((compradores || []).map((item) => getComprador(item) || text(item.nombre)).filter(Boolean));
}

/**
 * Solicitudes de Fidelización: se guardan como ESPECIAL (ID "FID-…", subtipo FIDELIZACION)
 * pero cambian el canasto por segmento sin vigencia, así que no llevan fecha_inicio/fecha_fin.
 * El subtipo no se guarda en `campanas`; al cargar desde Supabase solo queda el prefijo del ID.
 */
export function isFidelizacionActivity(activity = {}) {
  const id = String(activity.actividad_id || activity.actividadId || activity.legacy_actividad_id || "").trim().toUpperCase();
  return id.startsWith("FID-") || String(activity.subtipo || "").trim().toUpperCase() === "FIDELIZACION";
}

function getActivity(row, activityMap) {
  return activityMap.get(getActividadId(row)) || {};
}

function enrichRow(row, activityMap) {
  const activity = getActivity(row, activityMap);
  const actividadId = getActividadId(row);
  const tipoActividad = text(row.tipo_actividad || row.tipoActividad || activity.tipo_actividad || activity.tipoActividad || "CATALOGO");
  const alcanceTipo = text(row.alcance_tipo || row.alcanceTipo || activity.alcance_tipo || activity.alcanceTipo || "CANAL");
  const alcanceValor = text(row.alcance_valor || row.alcanceValor || activity.alcance_valor || activity.alcanceValor || activity.canal);
  const segmentoCliente = text(row.segmento_cliente || row.segmentoCliente || row.segmento);
  return {
    activity,
    actividadId,
    ofertaId: getOfertaId(row),
    tipoActividad,
    alcanceTipo,
    alcanceValor,
    aplicaSegmento: normalizeAplicaSegmento(row),
    segmentoCliente: normalizeAplicaSegmento(row) === "SI" ? segmentoCliente : "",
  };
}

function createIssue(type, row, index, message, extra = {}) {
  return {
    type,
    severity: type,
    rowId: getRowId(row),
    sku: getSku(row),
    comprador: getComprador(row),
    actividadId: getActividadId(row),
    rowNumber: index + 2,
    tipoPromo: getTipoPromo(row),
    grupoOferta: getGrupoOferta(row),
    message,
    ...extra,
  };
}

function getFieldLabel(field) {
  const labels = {
    actividad_id: "actividad_id",
    sku: "SKU",
    comprador: "comprador",
    tipo_promo: "tipo_promo",
    grupo_oferta: "grupo_oferta",
    tipo_sku: "tipo_sku",
    oferta_id: "oferta_id",
  };
  return labels[field] || field;
}

function formatIssueContext(issue) {
  const parts = [];
  parts.push(`Promocion ${issue.tipoPromo || issue.grupoOferta || issue.rowId || "sin tipo"}`);
  if (issue.rowNumber) parts.push(`Fila ${issue.rowNumber}`);
  if (issue.rowId) parts.push(`Registro ${issue.rowId}`);
  if (issue.sku) parts.push(`SKU ${issue.sku}`);
  parts.push(`Comprador ${issue.comprador || "sin comprador"}`);
  if (issue.field) parts.push(`Campo ${getFieldLabel(issue.field)}`);
  return parts.join(" / ");
}

export function formatPromotionValidationIssue(issue) {
  if (issue.groupKey && !issue.rowNumber) return `Grupo ${issue.groupKey}: ${issue.message}`;
  return `${formatIssueContext(issue)}: ${issue.message}`;
}

export function formatPromotionValidationErrors(result) {
  return (result?.errors || []).map(formatPromotionValidationIssue);
}

export function validatePromotions(promociones = [], options = {}) {
  const {
    actividades = [],
    compradores = [],
    scopeRowIds = null,
    campanaByLegacy = null,
    compradorByName = null,
  } = options;
  const scope = scopeRowIds ? new Set(Array.from(scopeRowIds).map(text).filter(Boolean)) : null;
  const activityMap = buildActivityMap(actividades);
  const buyerSet = buildBuyerSet(compradores);
  const errors = [];
  const warnings = [];
  const comboGroups = new Map();
  const buyXGetYGroups = new Map();
  const megapackGroups = new Map();
  const airesGroups = new Map();
  const umbralGroups = new Map();
  const simplePricePromotionGroups = new Map();

  const rowInScope = (row) => !scope || scope.has(getRowId(row));
  const registerGroup = (map, key, row, inScope) => {
    const current = map.get(key) || { key, items: [], touched: false };
    current.items.push(row);
    current.touched = current.touched || inScope;
    map.set(key, current);
  };
  const registerSimplePricePromotion = (row, index, actividadId, inScope) => {
    const sku = getSku(row);
    const tipoPromo = getNormalizedTipoPromo(row);
    if (!actividadId || !sku || !["descuento", "precio fijo"].includes(tipoPromo)) return;
    const key = `${actividadId}::${sku}`;
    const current = simplePricePromotionGroups.get(key) || { key, actividadId, sku, rows: [], touched: false };
    current.rows.push({ row, index, tipoPromo, inScope });
    current.touched = current.touched || inScope;
    simplePricePromotionGroups.set(key, current);
  };

  promociones.forEach((row, index) => {
    if (isAnulledPromotion(row)) return;
    const inScope = rowInScope(row);
    const enriched = enrichRow(row, activityMap);
    const tipoPromo = getTipoPromo(row);
    const tipoSku = lower(getTipoSku(row));
    const grupoOferta = getGrupoOferta(row);
    const actividadId = enriched.actividadId;
    const comprador = getComprador(row);
    const rowErrors = [];

    if (!getSku(row)) rowErrors.push(["sku", "SKU vacío."]);
    if (!tipoPromo) rowErrors.push(["tipo_promo", "tipo_promo vacío."]);
    if (!comprador) rowErrors.push(["comprador", "comprador vacío."]);
    if (!actividadId) rowErrors.push(["actividad_id", "actividad_id vacío."]);
    if (!enriched.ofertaId) rowErrors.push(["oferta_id", "oferta_id vacío."]);
    if (enriched.tipoActividad && !ACTIVITY_TYPES.includes(enriched.tipoActividad)) rowErrors.push(["tipo_actividad", "tipo_actividad inválido."]);
    if (enriched.alcanceTipo && !ALCANCE_TYPES.includes(enriched.alcanceTipo)) rowErrors.push(["alcance_tipo", "alcance_tipo inválido."]);
    if (buyerSet.size && comprador && !buyerSet.has(comprador)) rowErrors.push(["comprador", "comprador no existe en el maestro de compradores."]);
    if (campanaByLegacy && actividadId && !campanaByLegacy[actividadId]) rowErrors.push(["actividad_id", "actividad_id no existe en Supabase."]);
    if (compradorByName && comprador && !compradorByName[comprador]) rowErrors.push(["comprador", "comprador no existe en Supabase."]);

    // Alcance SEGMENTO (solicitudes especiales viejas): cada SKU puede tener sus propios
    // segmentos, pero la fila debe seguir segmentada.
    if (enriched.alcanceTipo === "SEGMENTO") {
      if (enriched.aplicaSegmento !== "SI") rowErrors.push(["aplica_segmento", "alcance SEGMENTO debe aplicar segmento."]);
      if (!enriched.segmentoCliente) rowErrors.push(["segmento_cliente", "promoción segmentada sin segmento_cliente."]);
    }
    if (enriched.aplicaSegmento === "SI" && !enriched.segmentoCliente) rowErrors.push(["segmento_cliente", "promoción segmentada sin segmento_cliente."]);
    if (enriched.tipoActividad === "ESPECIAL") {
      const activity = enriched.activity;
      if (!activityMap.has(actividadId)) rowErrors.push(["actividad_id", "especial sin registro en ACTIVIDADES."]);
      if (activityMap.has(actividadId)) {
        if (!(activity.comprador || activity.solicitante)) rowErrors.push(["comprador", "especial sin comprador."]);
        if (!activity.canal) rowErrors.push(["canal", "especial sin canal."]);
        if (!isFidelizacionActivity(activity)) {
          if (!activity.fecha_inicio) rowErrors.push(["fecha_inicio", "especial sin fecha_inicio."]);
          if (!activity.fecha_fin) rowErrors.push(["fecha_fin", "especial sin fecha_fin."]);
        }
      }
    }
    if (tipoPromo && isComplexPromoType(tipoPromo)) {
      if (!grupoOferta) rowErrors.push(["grupo_oferta", "promoción compleja sin grupo_oferta."]);
      if (!tipoSku) rowErrors.push(["tipo_sku", "promoción compleja sin tipo_sku."]);
    }
    if (!isComplexPromoType(tipoPromo) && getSku(row) && !hasPriceOrDiscount(row)) {
      rowErrors.push(["beneficio", "promoción simple sin precio ahora ni descuento."]);
    }
    if (hasValue(row.descuento) && discountOverLimit(row.descuento)) {
      rowErrors.push(["descuento", "descuento mayor a 100%."]);
    }
    if (tipoPromo === "Precio fijo" && getSku(row) && !positiveNumber(row.precio_ahora ?? row.precioAhora)) {
      rowErrors.push(["precio_ahora", "Precio fijo sin Ahora c/iva valido."]);
    }
    if (tipoPromo === "Umbral" && getSku(row) && !hasPriceOrDiscount(row)) {
      rowErrors.push(["beneficio", "Umbral sin precio ahora ni descuento."]);
    }
    if (tipoPromo === "Umbral" && getSku(row) && !positiveNumber(getCantidadMinima(row))) {
      rowErrors.push(["cantidad_minima", "Umbral sin cantidad mínima válida."]);
    }
    if ([BUY_X_GET_X_PROMO_TYPE, BUY_X_GET_X_V2_PROMO_TYPE].includes(tipoPromo)) {
      if (!getVariante(row)) rowErrors.push(["variante", `${tipoPromo} sin variante.`]);
      if (!positiveNumber(getCantidadMinima(row))) rowErrors.push(["cantidad_minima", `${tipoPromo} sin cantidad válida.`]);
    }
    if (tipoPromo === MEGAPACK_PROMO_TYPE && !positiveNumber(getCantidadMinima(row))) {
      rowErrors.push(["cantidad_minima", "Megapack sin cantidad válida."]);
    }
    if (tipoPromo === AIRES_PROMO_TYPE) {
      // Regalía del aire: precio 0 (100 %) o un precio propio; nunca se reparte.
      const isAiresReward = COMBO_REWARD_ROLES.includes(lower(getTipoSku(row)));
      const airesPrice = Number(text(row.precio_ahora ?? row.precioAhora));
      if (isAiresReward) {
        if (getSku(row) && (text(row.precio_ahora ?? row.precioAhora) === "" || !Number.isFinite(airesPrice) || airesPrice < 0)) rowErrors.push(["precio_ahora", "Regalía de aire sin precio válido (0 para regalía al 100 %)."]);
        if (!positiveNumber(getCantidadMinima(row))) rowErrors.push(["cantidad_minima", "Regalía de aire sin cantidad válida."]);
      } else {
        if (getSku(row) && !positiveNumber(row.precio_ahora ?? row.precioAhora)) rowErrors.push(["precio_ahora", "Pieza de aire sin precio (vuelva a cargar el precio del aire)."]);
        if (!positiveNumber(getCantidadMinima(row))) rowErrors.push(["cantidad_minima", "Pieza de aire sin cantidad válida."]);
      }
    }

    if (inScope) {
      rowErrors.forEach(([field, message]) => errors.push(createIssue("error", row, index, message, { field, code: field })));
    }

    const offerGroupKey = `${actividadId}::${tipoPromo}::${enriched.ofertaId}`;
    if (tipoPromo === "Combo" && enriched.ofertaId) registerGroup(comboGroups, offerGroupKey, row, inScope);
    if (tipoPromo === BUY_X_GET_X_PROMO_TYPE && enriched.ofertaId) registerGroup(buyXGetYGroups, offerGroupKey, row, inScope);
    if (tipoPromo === MEGAPACK_PROMO_TYPE && enriched.ofertaId) registerGroup(megapackGroups, offerGroupKey, row, inScope);
    if (tipoPromo === AIRES_PROMO_TYPE && enriched.ofertaId) registerGroup(airesGroups, offerGroupKey, row, inScope);
    if (tipoPromo === "Umbral" && enriched.ofertaId) {
      const current = umbralGroups.get(offerGroupKey) || { key: offerGroupKey, entries: [], touched: false };
      current.entries.push({ row, index, inScope });
      current.touched = current.touched || inScope;
      umbralGroups.set(offerGroupKey, current);
    }
    registerSimplePricePromotion(row, index, actividadId, inScope);
  });

  // Mismo SKU en la actividad: dos filas chocan solo si comparten segmento (o si ambas son
  // para público general). Descuento y Precio fijo pueden convivir con segmentos distintos.
  const formatOverlap = (overlap) => (overlap.length === 1 && overlap[0] === "todos" ? "público general" : `segmento ${overlap.join(", ")}`);
  simplePricePromotionGroups.forEach((group) => {
    if (!group.touched || group.rows.length < 2) return;
    const reported = new Set();
    group.rows.forEach((item, position) => {
      group.rows.slice(position + 1).forEach((other) => {
        if (!item.inScope && !other.inScope) return;
        const overlap = getSegmentOverlap(item.row, other.row);
        if (!overlap.length) return;
        const mixedTypes = item.tipoPromo !== other.tipoPromo;
        // Mismo tipo: solo cuenta dentro del mismo comprador (otro comprador puede cargar el mismo SKU).
        if (!mixedTypes && getComprador(item.row) !== getComprador(other.row)) return;
        [[item, other], [other, item]].forEach(([target, counterpart]) => {
          if (!target.inScope || reported.has(target.index)) return;
          reported.add(target.index);
          const oppositeType = counterpart.tipoPromo === "descuento" ? "Descuento" : "Precio fijo";
          const message = mixedTypes
            ? `SKU duplicado entre Descuento y Precio fijo para ${formatOverlap(overlap)} en la misma actividad. Ya existe en ${oppositeType}.`
            : `SKU repetido en ${oppositeType} para ${formatOverlap(overlap)}: el mismo segmento no puede tener dos beneficios.`;
          errors.push(createIssue("error", target.row, target.index, message, {
            field: "sku",
            code: mixedTypes ? "duplicate_discount_fixed_price_sku" : "duplicate_segment_benefit_sku",
            actividadId: group.actividadId,
          }));
        });
      });
    });
  });

  const validateRoleGroup = (map, label, missingPrincipalMessage, missingRewardMessage) => {
    map.forEach((group) => {
      if (!group.touched) return;
      const hasPrincipal = group.items.some((item) => lower(getTipoSku(item)) === "principal");
      const hasReward = group.items.some((item) => COMBO_REWARD_ROLES.includes(lower(getTipoSku(item))));
      const rowIds = group.items.map(getRowId).filter(Boolean);
      if (!hasPrincipal) errors.push({ type: "error", severity: "error", groupKey: group.key, rowIds, tipoPromo: label, message: missingPrincipalMessage, code: "missing_principal" });
      if (!hasReward) errors.push({ type: "error", severity: "error", groupKey: group.key, rowIds, tipoPromo: label, message: missingRewardMessage, code: "missing_reward" });
    });
  };

  validateRoleGroup(comboGroups, "Combo", "combo sin SKU principal.", "combo sin regalía.");
  validateRoleGroup(buyXGetYGroups, BUY_X_GET_X_PROMO_TYPE, "Compra X lleva X sin principal.", "Compra X lleva X sin regalía.");
  validateRoleGroup(megapackGroups, MEGAPACK_PROMO_TYPE, "Megapack sin SKU principal.", "Megapack sin regalía.");

  // AIRES: un aire tiene al menos 2 piezas distintas, una sola página y una sola descripción
  // entre sus piezas. Las regalías (rol regalia) no cuentan como piezas.
  airesGroups.forEach((group) => {
    if (!group.touched) return;
    const rowIds = group.items.map(getRowId).filter(Boolean);
    const base = { groupKey: group.key, rowIds, tipoPromo: AIRES_PROMO_TYPE };
    const pieces = group.items.filter((item) => !COMBO_REWARD_ROLES.includes(lower(getTipoSku(item))));
    const rewardSkus = group.items.filter((item) => COMBO_REWARD_ROLES.includes(lower(getTipoSku(item)))).map((item) => text(getSku(item)));
    const skus = pieces.map((item) => text(getSku(item)));
    if (new Set(rewardSkus).size !== rewardSkus.length) errors.push({ type: "error", severity: "error", ...base, message: "aire con la misma regalía repetida; use la cantidad.", code: "aires_duplicate_reward" });
    if (pieces.length < 2) errors.push({ type: "error", severity: "error", ...base, message: "aire con una sola pieza (necesita condensador y evaporador).", code: "aires_single_piece" });
    if (new Set(skus).size !== skus.length) errors.push({ type: "error", severity: "error", ...base, message: "aire con SKU repetido; use la cantidad.", code: "aires_duplicate_sku" });
    const pages = new Set(group.items.map((item) => text(item.numPagina ?? item.numero_pagina ?? item.num_pagina)).filter(Boolean));
    if (pages.size > 1) errors.push({ type: "error", severity: "error", ...base, message: `aire con páginas distintas (${Array.from(pages).join(" / ")}).`, code: "aires_pages" });
    const descriptions = new Set(pieces.map((item) => text(item.descripcion)).filter(Boolean));
    if (descriptions.size > 1) warnings.push({ type: "warning", severity: "warning", ...base, message: "aire con descripciones distintas entre piezas.", code: "aires_descriptions" });
  });

  // Umbral: una oferta = un solo SKU con escalones por cantidad mínima (hasta 6).
  umbralGroups.forEach((group) => {
    if (!group.touched) return;
    const entries = group.entries.filter((entry) => getSku(entry.row));
    if (!entries.length) return;
    const offerLabel = getGrupoOferta(entries[0].row) || getOfertaId(entries[0].row);
    const pushIssue = (list, type, entry, message, field, code) => {
      if (!entry.inScope) return;
      list.push(createIssue(type, entry.row, entry.index, message, { field, code, groupKey: group.key }));
    };

    const skus = Array.from(new Set(entries.map((entry) => getSku(entry.row))));
    if (skus.length > 1) {
      entries.forEach((entry) => pushIssue(errors, "error", entry, `oferta Umbral ${offerLabel} con ${skus.length} SKU distintos (${skus.join(", ")}). Cada SKU debe ir en su propia oferta.`, "sku", "umbral_multiple_skus"));
      return;
    }

    const levels = entries
      .map((entry) => ({ entry, quantity: parseNumber(getCantidadMinima(entry.row)), benefit: getUmbralBenefit(entry.row) }))
      .filter((level) => level.quantity !== null && level.quantity > 0);

    const byQuantity = new Map();
    levels.forEach((level) => byQuantity.set(level.quantity, [...(byQuantity.get(level.quantity) || []), level]));
    let hasDuplicates = false;
    byQuantity.forEach((sameQuantity, quantity) => {
      if (sameQuantity.length < 2) return;
      hasDuplicates = true;
      sameQuantity.forEach((level) => pushIssue(errors, "error", level.entry, `oferta Umbral ${offerLabel} con dos escalones de cantidad mínima ${formatQuantity(quantity)}.`, "cantidad_minima", "umbral_duplicate_quantity"));
    });
    if (hasDuplicates) return;

    if (entries.length === 1) {
      const entry = entries[0];
      const quantity = parseNumber(getCantidadMinima(entry.row));
      const message = quantity !== null && quantity <= 1
        ? `oferta Umbral ${offerLabel} con un solo escalón desde 1 unidad: funciona como un descuento simple. Revise si faltan escalones o si debe ser Descuento/Precio fijo.`
        : `oferta Umbral ${offerLabel} con un solo escalón. Revise si faltan escalones.`;
      pushIssue(warnings, "warning", entry, message, "cantidad_minima", "umbral_single_level");
      return;
    }

    const sorted = levels.filter((level) => level.benefit).sort((a, b) => a.quantity - b.quantity);
    const kinds = new Set(sorted.map((level) => level.benefit.kind));
    if (kinds.size !== 1) return;
    for (let i = 1; i < sorted.length; i += 1) {
      const previous = sorted[i - 1];
      const current = sorted[i];
      const improves = current.benefit.kind === "descuento"
        ? current.benefit.value > previous.benefit.value
        : current.benefit.value < previous.benefit.value;
      if (improves) continue;
      const shown = (level) => level.benefit.kind === "descuento" ? `${formatQuantity(level.benefit.value)}%` : formatQuantity(level.benefit.value);
      pushIssue(warnings, "warning", current.entry, `oferta Umbral ${offerLabel}: el escalón de ${formatQuantity(current.quantity)} (${shown(current)}) no mejora el de ${formatQuantity(previous.quantity)} (${shown(previous)}).`, "beneficio", "umbral_benefit_not_improving");
    }
  });

  return {
    valid: errors.length === 0,
    hasErrors: errors.length > 0,
    hasWarnings: warnings.length > 0,
    errors,
    warnings,
  };
}
