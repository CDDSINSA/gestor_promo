import {
  ACTIVITY_TYPES,
  ALCANCE_TYPES,
  BUY_X_GET_X_PROMO_TYPE,
  BUY_X_GET_X_V2_PROMO_TYPE,
  COMBO_REWARD_ROLES,
  MEGAPACK_PROMO_TYPE,
} from "../constants";
import { isComplexPromoType } from "../promoTypes/promoTypeEngine";

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

function positiveNumber(value) {
  const number = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) && number > 0;
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
  return row.cantidad_minima || row.cantidadMinima;
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
    rowNumber: index + 2,
    tipoPromo: getTipoPromo(row),
    grupoOferta: getGrupoOferta(row),
    message,
    ...extra,
  };
}

function formatRowLabel(issue) {
  const parts = [];
  if (issue.rowNumber) parts.push(`Fila ${issue.rowNumber}`);
  if (issue.rowId) parts.push(issue.rowId);
  if (issue.sku) parts.push(`SKU ${issue.sku}`);
  return parts.length ? parts.join(" / ") : "Fila sin identificador";
}

export function formatPromotionValidationIssue(issue) {
  if (issue.groupKey && !issue.rowNumber) return `Grupo ${issue.groupKey}: ${issue.message}`;
  return `${formatRowLabel(issue)}: ${issue.message}`;
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

    if (enriched.alcanceTipo === "SEGMENTO") {
      if (enriched.aplicaSegmento !== "SI") rowErrors.push(["aplica_segmento", "alcance SEGMENTO debe aplicar segmento."]);
      if (!enriched.segmentoCliente || enriched.segmentoCliente !== enriched.alcanceValor) rowErrors.push(["segmento_cliente", "segmento_cliente debe ser igual a alcance_valor."]);
    }
    if (enriched.aplicaSegmento === "SI" && !enriched.segmentoCliente) rowErrors.push(["segmento_cliente", "promoción segmentada sin segmento_cliente."]);
    if (enriched.tipoActividad === "ESPECIAL") {
      const activity = enriched.activity;
      if (!activityMap.has(actividadId)) rowErrors.push(["actividad_id", "especial sin registro en ACTIVIDADES."]);
      if (activityMap.has(actividadId)) {
        if (!(activity.comprador || activity.solicitante)) rowErrors.push(["comprador", "especial sin comprador."]);
        if (!activity.canal) rowErrors.push(["canal", "especial sin canal."]);
        if (!activity.fecha_inicio) rowErrors.push(["fecha_inicio", "especial sin fecha_inicio."]);
        if (!activity.fecha_fin) rowErrors.push(["fecha_fin", "especial sin fecha_fin."]);
      }
    }
    if (tipoPromo && isComplexPromoType(tipoPromo)) {
      if (!grupoOferta) rowErrors.push(["grupo_oferta", "promoción compleja sin grupo_oferta."]);
      if (!tipoSku) rowErrors.push(["tipo_sku", "promoción compleja sin tipo_sku."]);
    }
    if (!isComplexPromoType(tipoPromo) && getSku(row) && !hasPriceOrDiscount(row)) {
      rowErrors.push(["beneficio", "promoción simple sin precio ahora ni descuento."]);
    }
    if (tipoPromo === "Umbral" && getSku(row) && !hasPriceOrDiscount(row)) {
      rowErrors.push(["beneficio", "Umbral sin precio ahora ni descuento."]);
    }
    if ([BUY_X_GET_X_PROMO_TYPE, BUY_X_GET_X_V2_PROMO_TYPE].includes(tipoPromo)) {
      if (!getVariante(row)) rowErrors.push(["variante", `${tipoPromo} sin variante.`]);
      if (!positiveNumber(getCantidadMinima(row))) rowErrors.push(["cantidad_minima", `${tipoPromo} sin cantidad válida.`]);
    }
    if (tipoPromo === MEGAPACK_PROMO_TYPE && !positiveNumber(getCantidadMinima(row))) {
      rowErrors.push(["cantidad_minima", "Megapack sin cantidad válida."]);
    }

    if (inScope) {
      rowErrors.forEach(([field, message]) => errors.push(createIssue("error", row, index, message, { field, code: field })));
    }

    const offerGroupKey = `${actividadId}::${tipoPromo}::${enriched.ofertaId}`;
    if (tipoPromo === "Combo" && enriched.ofertaId) registerGroup(comboGroups, offerGroupKey, row, inScope);
    if (tipoPromo === BUY_X_GET_X_PROMO_TYPE && enriched.ofertaId) registerGroup(buyXGetYGroups, offerGroupKey, row, inScope);
    if (tipoPromo === MEGAPACK_PROMO_TYPE && enriched.ofertaId) registerGroup(megapackGroups, offerGroupKey, row, inScope);
    registerSimplePricePromotion(row, index, actividadId, inScope);
  });

  simplePricePromotionGroups.forEach((group) => {
    if (!group.touched) return;
    const hasDiscount = group.rows.some((item) => item.tipoPromo === "descuento");
    const hasFixedPrice = group.rows.some((item) => item.tipoPromo === "precio fijo");
    if (!hasDiscount || !hasFixedPrice) return;
    group.rows
      .filter((item) => item.inScope)
      .forEach((item) => {
        const oppositeType = item.tipoPromo === "descuento" ? "Precio fijo" : "Descuento";
        errors.push(createIssue("error", item.row, item.index, `SKU duplicado entre Descuento y Precio fijo en la misma actividad. Ya existe en ${oppositeType}.`, {
          field: "sku",
          code: "duplicate_discount_fixed_price_sku",
          actividadId: group.actividadId,
        }));
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

  return {
    valid: errors.length === 0,
    hasErrors: errors.length > 0,
    hasWarnings: warnings.length > 0,
    errors,
    warnings,
  };
}
