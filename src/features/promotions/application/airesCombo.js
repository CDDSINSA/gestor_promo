// AIRES: combo de aire acondicionado.
// Un aire se factura en varias piezas (condensador, evaporador…) con SKU distintos. La
// compradora manda UN precio c/IVA por aire y la app lo reparte entre las piezas:
//   peso de la pieza = base × cantidad / Σ(base × cantidad)
//   precio de la pieza = peso × precio del aire
// La base es el costo (AV_COST, calculado en Supabase sin exponer el costo). Si alguna
// pieza no tiene costo, todo el aire se reparte por precio regular del maestro (nunca se
// mezclan fuentes). La suma de las piezas cuadra exacto con el precio del aire.
import { AIRES_COMPONENT_ROLE, AIRES_PROMO_TYPE } from "../../../constants";
import { normalizeValue } from "../../../utils/common";
import { normalizeCanal } from "../../../utils/promoHelpers";

export const AIRES_SOURCE_COST = "COSTO";
export const AIRES_SOURCE_REGULAR_PRICE = "PRECIO_REGULAR";
export const AIRES_SOURCE_LABELS = {
  [AIRES_SOURCE_COST]: "Costo",
  [AIRES_SOURCE_REGULAR_PRICE]: "Precio regular",
};

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const text = (value) => normalizeValue(value);

export function isAiresRow(row = {}) {
  return text(row.tipoPromo || row.tipo_promo) === AIRES_PROMO_TYPE;
}

// "MINI SPLIT  12000BTU" -> "MINI SPLIT 12000BTU"
export function normalizeAiresDescription(value) {
  return text(value).replace(/\s+/g, " ");
}

// Precio del aire: acepta "12999", "12,999.00", "C$ 12 999"; devuelve número o null.
export function parseAiresPrice(value) {
  const raw = text(value).replace(/[^0-9,.-]/g, "");
  if (!raw) return null;
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  let normalized = raw;
  if (lastComma > -1 && lastDot > -1) {
    const decimal = lastComma > lastDot ? "," : ".";
    normalized = raw.replace(decimal === "," ? /\./g : /,/g, "").replace(decimal, ".");
  } else if (lastComma > -1) {
    normalized = raw.length - lastComma - 1 === 3 ? raw.replace(/,/g, "") : raw.replace(",", ".");
  }
  const number = Number(normalized);
  return Number.isFinite(number) && number > 0 ? round2(number) : null;
}

// Número de parte base: lo que va antes del primer punto o guion
// (SW362H8.NRP0 -> SW362H8, AS12TW-OUT -> AS12TW); sin separador, completo.
export function getVpnBase(vpn) {
  const clean = text(vpn).toUpperCase().replace(/\s+/g, "");
  const match = clean.match(/[.\-–—]/);
  return match ? clean.slice(0, match.index) : clean;
}

const findColumn = (header, aliases, fallback = -1) => {
  const normalized = aliases.map(normalizeCanal);
  const index = (header || []).findIndex((cell) => normalized.includes(normalizeCanal(cell)));
  return index >= 0 ? index : fallback;
};

/**
 * Lee la tabla AIRES (encabezado + filas) y agrupa por número de combo.
 * Columnas: pagina, combo, SKU, descripcion, ahora c/iva, comentario.
 * Devuelve los grupos en orden de aparición; un SKU repetido en el mismo combo suma cantidad.
 */
export function parseAiresTable(rows = []) {
  const nonEmpty = (rows || []).filter((cells) => (cells || []).some((cell) => text(cell)));
  if (nonEmpty.length < 2) return [];
  const header = nonEmpty[0];
  const pageIndex = findColumn(header, ["pagina", "página", "pag", "numero_pagina", "num_pagina"]);
  const comboIndex = findColumn(header, ["combo", "aire", "grupo"], pageIndex === 0 ? 1 : 0);
  const skuIndex = findColumn(header, ["sku", "codigo", "codigo_sku"], comboIndex + 1);
  const descIndex = findColumn(header, ["descripcion", "descripción", "desc"], skuIndex + 1);
  const priceIndex = findColumn(header, ["ahora c/iva", "ahora con iva", "ahora c iva", "precio ahora", "precio_ahora", "precio"], descIndex + 1);
  const commentIndex = findColumn(header, ["comentario", "comentarios", "comment"]);

  const groups = new Map();
  let lastCombo = null;
  nonEmpty.slice(1).forEach((cells, offset) => {
    const rowNumber = offset + 2;
    const combo = text(cells[comboIndex]);
    const sku = text(cells[skuIndex]);
    const description = normalizeAiresDescription(cells[descIndex]);
    const rawPrice = text(cells[priceIndex]);
    const page = pageIndex >= 0 ? text(cells[pageIndex]) : "";
    const comment = commentIndex >= 0 ? text(cells[commentIndex]) : "";
    if (!combo && !sku && !description && !rawPrice && !comment) return;
    const key = combo || `Sin combo (fila ${rowNumber})`;
    if (!groups.has(key)) {
      groups.set(key, { combo: key, hasComboNumber: Boolean(combo), items: [], descriptions: new Set(), prices: new Set(), invalidPrices: [], pages: new Set(), comments: new Set(), rowNumbers: [], nonContiguous: false });
    } else if (lastCombo !== key) {
      groups.get(key).nonContiguous = true;
    }
    lastCombo = key;
    const group = groups.get(key);
    group.rowNumbers.push(rowNumber);
    if (description) group.descriptions.add(description);
    if (rawPrice) {
      const price = parseAiresPrice(rawPrice);
      if (price === null) group.invalidPrices.push(rawPrice);
      else group.prices.add(price);
    }
    if (page) group.pages.add(page);
    if (comment) group.comments.add(comment);
    const existing = group.items.find((item) => item.sku && item.sku === sku);
    if (existing) existing.cantidad += 1;
    else group.items.push({ sku, cantidad: 1, rowNumber });
  });
  return Array.from(groups.values());
}

/** Lo que se envía a Supabase para pedir los pesos por costo (sin costos de vuelta). */
export function getAiresWeightRequest(groups = []) {
  return groups
    .filter((group) => group.items.length >= 2 && group.items.every((item) => /^\d+$/.test(item.sku)))
    .map((group) => ({ combo: group.combo, items: group.items.map((item) => ({ sku: item.sku, cantidad: item.cantidad })) }));
}

/** Convierte la respuesta de la RPC en { combo: { sku: peso } } (solo combos con costo completo). */
export function normalizeAiresCostWeights(response) {
  const list = Array.isArray(response) ? response : Array.isArray(response?.combos) ? response.combos : [];
  const result = {};
  list.forEach((entry) => {
    if (!entry || text(entry.fuente).toUpperCase() !== AIRES_SOURCE_COST || !Array.isArray(entry.pesos)) return;
    const weights = {};
    entry.pesos.forEach((item) => {
      const weight = Number(item?.peso);
      if (item?.sku && Number.isFinite(weight) && weight > 0) weights[text(item.sku)] = weight;
    });
    if (Object.keys(weights).length) result[text(entry.combo)] = weights;
  });
  return result;
}

/**
 * Pesos de un aire. Primero costo (ya calculado por Supabase); si falta para alguna pieza,
 * precio regular del maestro para todas. null si ninguna fuente sirve.
 */
export function resolveAiresWeights(items = [], { costWeights = null, skuMaster = {} } = {}) {
  if (items.length < 2) return null;
  if (costWeights && items.every((item) => Number(costWeights[item.sku]) > 0)) {
    const total = items.reduce((sum, item) => sum + Number(costWeights[item.sku]), 0);
    return { source: AIRES_SOURCE_COST, weights: items.map((item) => Number(costWeights[item.sku]) / total) };
  }
  const bases = items.map((item) => Number(skuMaster[item.sku]?.precio) * item.cantidad);
  if (bases.every((value) => Number.isFinite(value) && value > 0)) {
    const total = bases.reduce((sum, value) => sum + value, 0);
    return { source: AIRES_SOURCE_REGULAR_PRICE, weights: bases.map((value) => value / total) };
  }
  return null;
}

/**
 * Reparte el precio del aire. weights = parte del total de cada línea (suman 1).
 * Devuelve el precio UNITARIO de cada línea (2 decimales); la línea de mayor peso con
 * cantidad 1 absorbe los centavos para que Σ(precio × cantidad) = total.
 */
export function distributeAiresPrice(total, items = [], weights = []) {
  const amount = Number(total);
  if (!Number.isFinite(amount) || amount <= 0 || !items.length || items.length !== weights.length) return null;
  const prices = items.map((item, index) => round2((amount * weights[index]) / (item.cantidad || 1)));
  const sum = round2(items.reduce((acc, item, index) => acc + prices[index] * (item.cantidad || 1), 0));
  const diff = round2(amount - sum);
  if (diff !== 0) {
    const order = items.map((item, index) => index).sort((a, b) => weights[b] - weights[a]);
    const target = order.find((index) => (items[index].cantidad || 1) === 1) ?? order[0];
    prices[target] = round2(prices[target] + diff / (items[target].cantidad || 1));
  }
  return prices;
}

/** Precio actual del aire = Σ(precio pieza × cantidad). */
export function getAiresGroupTotal(lines = []) {
  if (!lines.length) return null;
  let total = 0;
  for (const line of lines) {
    const price = Number(line.precioAhora ?? line.precio_ahora);
    if (line.precioAhora === "" || line.precio_ahora === "" || !Number.isFinite(price)) return null;
    total += price * (Number(line.cantidadMinima ?? line.cantidad_minima) || 1);
  }
  return round2(total);
}

/**
 * Nuevo precio del aire desde la grilla: conserva la proporción actual entre piezas
 * (la que se calculó al cargar). Devuelve { [rowId]: precioUnitario } o null.
 */
export function redistributeAiresGroup(lines = [], newTotal) {
  const total = parseAiresPrice(newTotal);
  if (total === null || lines.length < 2) return null;
  const items = lines.map((line) => ({ id: line.id || line.row_id, cantidad: Number(line.cantidadMinima ?? line.cantidad_minima) || 1, price: Number(line.precioAhora ?? line.precio_ahora) }));
  const bases = items.map((item) => (Number.isFinite(item.price) && item.price > 0 ? item.price * item.cantidad : 0));
  const base = bases.reduce((sum, value) => sum + value, 0);
  const weights = base > 0 ? bases.map((value) => value / base) : items.map(() => 1 / items.length);
  const prices = distributeAiresPrice(total, items, weights);
  if (!prices) return null;
  return Object.fromEntries(items.map((item, index) => [item.id, prices[index]]));
}

const skuSetKey = (skus = []) => [...skus].map(text).filter(Boolean).sort().join("+");

/** { "skuA+skuB": "aires-3" } de los aires ya cargados en la actividad (para actualizar, no duplicar). */
export function indexExistingAires(rows = []) {
  const byGroup = new Map();
  rows.filter(isAiresRow).forEach((row) => {
    const group = text(row.grupoOferta || row.grupo_oferta);
    if (!group) return;
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group).push(text(row.sku));
  });
  const index = {};
  byGroup.forEach((skus, group) => { index[skuSetKey(skus)] = group; });
  return index;
}

const blocking = (reason) => ({ warning: true, canApply: false, blocking: true, blockReason: "aires", airesReason: reason });

/**
 * Vista previa de la pestaña AIRES: una fila por pieza con su precio repartido.
 * Si un aire tiene un error, todas sus piezas quedan bloqueadas (y la carga completa).
 */
export function buildAiresBulkPreviewFromRows(rows = [], { skuMaster = {}, costWeightsByCombo = {}, existingAires = {} } = {}) {
  const groups = parseAiresTable(rows);
  const preview = [];
  if (!groups.length) {
    return [{ index: "Aviso", sku: "Sin aires", descripcion: "Use columnas: pagina, combo, SKU, descripcion, ahora c/iva, comentario.", campo: "Formato", valorActual: "", valorNuevo: "Sin filas para aplicar", warning: true, canApply: false }];
  }
  const skuCombos = new Map();
  groups.forEach((group) => group.items.forEach((item) => {
    if (!item.sku) return;
    if (!skuCombos.has(item.sku)) skuCombos.set(item.sku, new Set());
    skuCombos.get(item.sku).add(group.combo);
  }));

  groups.forEach((group) => {
    const errors = [];
    const notes = [];
    const descriptions = Array.from(group.descriptions);
    const prices = Array.from(group.prices);
    const pages = Array.from(group.pages);
    if (!group.hasComboNumber) errors.push("Fila sin número de combo");
    if (group.items.some((item) => !item.sku)) errors.push("Pieza sin SKU");
    if (group.items.some((item) => item.sku && !/^\d+$/.test(item.sku))) errors.push("SKU con caracteres no numéricos");
    if (group.items.length < 2) errors.push("El aire necesita al menos 2 piezas");
    if (group.invalidPrices.length) errors.push(`Precio inválido (${group.invalidPrices.join(", ")})`);
    if (!prices.length && !group.invalidPrices.length) errors.push("Falta ahora c/iva");
    if (prices.length > 1) errors.push(`Precios distintos en el mismo aire (${prices.join(" / ")})`);
    if (!descriptions.length) errors.push("Falta descripción del aire");
    if (descriptions.length > 1) errors.push("Descripciones distintas en el mismo aire");
    if (pages.length > 1) errors.push(`Páginas distintas en el mismo aire (${pages.join(" / ")})`);
    if (group.nonContiguous) notes.push("Filas del combo no consecutivas");

    // Número de parte: misma base (antes del primer punto o guion) en todas las piezas.
    const vpnBases = group.items.map((item) => ({ sku: item.sku, base: getVpnBase(skuMaster[item.sku]?.vpn) }));
    const withVpn = vpnBases.filter((item) => item.base);
    if (withVpn.length < vpnBases.length) notes.push(`Sin número de parte en maestro: ${vpnBases.filter((item) => !item.base).map((item) => item.sku).join(", ")}`);
    if (new Set(withVpn.map((item) => item.base)).size > 1) errors.push(`Número de parte no coincide (${withVpn.map((item) => item.base).join(" / ")})`);
    const missingMaster = group.items.filter((item) => item.sku && !skuMaster[item.sku]?.descripcion).map((item) => item.sku);
    if (missingMaster.length) notes.push(`SKU no encontrado en maestro: ${missingMaster.join(", ")}`);
    const shared = group.items.filter((item) => (skuCombos.get(item.sku)?.size || 0) > 1).map((item) => item.sku);
    if (shared.length) notes.push(`SKU en más de un aire del archivo: ${shared.join(", ")}`);

    const resolved = group.items.length >= 2 ? resolveAiresWeights(group.items, { costWeights: costWeightsByCombo[group.combo], skuMaster }) : null;
    if (group.items.length >= 2 && !resolved) errors.push("Sin costo ni precio regular para repartir el precio");
    const total = prices.length === 1 ? prices[0] : null;
    const distributed = resolved && total !== null ? distributeAiresPrice(total, group.items, resolved.weights) : null;
    const existingGroup = existingAires[skuSetKey(group.items.map((item) => item.sku))] || "";
    const sourceLabel = resolved ? AIRES_SOURCE_LABELS[resolved.source] : "";
    const description = descriptions[0] || "";
    const comment = Array.from(group.comments).join(" | ");
    const page = pages[0] || "";

    group.items.forEach((item, index) => {
      const weight = resolved ? resolved.weights[index] : null;
      const price = distributed ? distributed[index] : "";
      const summary = [
        `Aire ${group.combo}`,
        description || "Sin descripción",
        resolved ? `Reparto por ${sourceLabel.toLowerCase()} ${round2(weight * 100)}%` : "",
        item.cantidad > 1 ? `Cantidad ${item.cantidad}` : "",
        existingGroup ? `Actualiza ${existingGroup}` : "",
        ...errors,
        ...notes,
      ].filter(Boolean).join(" | ");
      preview.push({
        index: preview.length + 1,
        scenario: group.combo,
        sku: item.sku || "SKU vacio",
        descripcion: summary,
        campo: "Pieza de aire",
        valorActual: total !== null ? `Aire ${total}` : "",
        valorNuevo: price === "" ? "Sin precio" : `Precio pieza ${price}`,
        precioAhora: price,
        cantidadMinima: item.cantidad,
        aireTotal: total,
        aireDescripcion: description,
        aireFuente: resolved?.source || "",
        airePeso: weight === null ? null : round2(weight * 100),
        comentario: comment,
        numPagina: page,
        numero_pagina: page,
        existingGroup,
        warning: Boolean(errors.length || notes.length),
        canApply: !errors.length,
        ...(errors.length ? blocking(errors.join("; ")) : {}),
      });
    });
  });
  return preview;
}

/** Texto de comentario que queda en cada pieza: trazabilidad del reparto + comentario de la compradora. */
export function buildAiresLineComment(item, group) {
  const source = AIRES_SOURCE_LABELS[item.aireFuente] || "";
  const trace = `Aire ${group}${source ? `: reparto por ${source.toLowerCase()} ${item.airePeso}%` : ""}`;
  return [trace, item.comentario].filter(Boolean).join(" | ");
}

export { AIRES_COMPONENT_ROLE, AIRES_PROMO_TYPE };
