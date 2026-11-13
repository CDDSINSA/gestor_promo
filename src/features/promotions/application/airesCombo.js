// AIRES: combo de aire acondicionado.
// Un aire se factura en varias piezas (condensador, evaporador…) con SKU distintos. La
// compradora manda UN precio c/IVA por aire y la app lo reparte entre las piezas:
//   peso de la pieza = base × cantidad / Σ(base × cantidad)
//   precio de la pieza = peso × precio del aire
// La base es el costo (AV_COST, calculado en Supabase sin exponer el costo). Si alguna
// pieza no tiene costo, todo el aire se reparte por precio regular del maestro (nunca se
// mezclan fuentes). La suma de las piezas cuadra exacto con el precio del aire.
// Regalías: el combo puede traer artículos adicionales (no son piezas del aire). No se
// marcan: son los SKU cuyo número de parte no pertenece al paquete. Tienen su propio
// precio (vacío = regalía al 100 %) y su cantidad, no entran al reparto y se comportan
// como las regalías de Combo / Megapack. El margen del aire las incluye.
import { AIRES_COMPONENT_ROLE, AIRES_PROMO_TYPE, COMBO_REWARD_ROLES } from "../../../constants";
import { normalizeValue } from "../../../utils/common";
import { normalizeCanal } from "../../../utils/promoHelpers";

export const AIRES_REWARD_ROLE = "regalia";
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

// Cantidad de la fila: vacía = 1; entero mayor a 0; cualquier otro valor es inválido (null).
export function parseAiresQuantity(value) {
  const raw = text(value);
  if (!raw) return 1;
  const number = Number(raw.replace(",", "."));
  return Number.isInteger(number) && number > 0 ? number : null;
}

// Precio de una regalía: vacío = 0 (regalía al 100 %); "0" es válido; inválido = null.
export function parseAiresRewardPrice(value) {
  const raw = text(value);
  if (!raw) return 0;
  const digits = raw.replace(/[^0-9,.-]/g, "");
  if (digits && /^[0.,]+$/.test(digits)) return 0;
  return parseAiresPrice(raw);
}

// Regalía dentro de un aire: rol regalia/regalía/recompensa/reward (igual que en Combo).
export function isAiresRewardRow(row = {}) {
  return COMBO_REWARD_ROLES.includes(text(row.tipoSku ?? row.tipo_sku).toLowerCase());
}

/**
 * Lee la tabla AIRES (encabezado + filas) y agrupa por número de combo.
 * Columnas: pagina, combo, SKU, descripcion, ahora c/iva, comentario y cantidad (opcional).
 * Devuelve los grupos en orden de aparición. Cada grupo trae sus filas (lines) y los SKU
 * agrupados (items): un SKU repetido en el mismo combo suma su cantidad (vacía = 1).
 * Qué SKU son piezas y cuáles regalías se decide después con el maestro (classifyAiresGroup).
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
  const quantityIndex = findColumn(header, ["cantidad", "cant", "qty", "cantidad minima", "cantidad_minima"]);

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
    const rawQuantity = quantityIndex >= 0 ? text(cells[quantityIndex]) : "";
    if (!combo && !sku && !description && !rawPrice && !comment) return;
    const key = combo || `Sin combo (fila ${rowNumber})`;
    if (!groups.has(key)) {
      groups.set(key, { combo: key, hasComboNumber: Boolean(combo), lines: [], items: [], pages: new Set(), rowNumbers: [], nonContiguous: false });
    } else if (lastCombo !== key) {
      groups.get(key).nonContiguous = true;
    }
    lastCombo = key;
    const group = groups.get(key);
    const cantidad = parseAiresQuantity(rawQuantity);
    const line = { sku, cantidad, rawQuantity, rawPrice, description, comment, page, rowNumber };
    group.lines.push(line);
    group.rowNumbers.push(rowNumber);
    if (page) group.pages.add(page);
    const existing = group.items.find((item) => item.sku && item.sku === sku);
    if (existing) {
      existing.cantidad += cantidad || 1;
      existing.lines.push(line);
    } else {
      group.items.push({ sku, cantidad: cantidad || 1, rowNumber, lines: [line] });
    }
  });
  return Array.from(groups.values());
}

/**
 * Separa piezas y regalías de un aire con el número de parte (VPN) del maestro.
 * - Las piezas son los SKU cuyo VPN base se repite (2 o más SKU con la misma base).
 * - Todo lo demás del combo es regalía (la compradora no la marca).
 * - Si ninguna base se repite (aire sin VPN en el maestro, por ejemplo), todo el combo se
 *   toma como piezas, igual que antes de existir regalías.
 * - Si dos bases se repiten, hay dos aires en el mismo combo (multipleBases).
 */
export function classifyAiresGroup(group = {}, skuMaster = {}) {
  const items = group.items || [];
  const bases = items.map((item) => getVpnBase(skuMaster[item.sku]?.vpn));
  const counts = new Map();
  bases.forEach((base) => { if (base) counts.set(base, (counts.get(base) || 0) + 1); });
  const repeated = Array.from(counts.entries()).filter(([, count]) => count >= 2).map(([base]) => base);
  if (repeated.length === 1) {
    const [base] = repeated;
    return {
      base,
      pieces: items.filter((item, index) => bases[index] === base),
      rewards: items.filter((item, index) => bases[index] !== base),
      bases,
      multipleBases: [],
    };
  }
  return { base: "", pieces: items, rewards: [], bases, multipleBases: repeated.length > 1 ? repeated : [] };
}

/** Lo que se envía a Supabase para pedir los pesos por costo (sin costos de vuelta). */
export function getAiresWeightRequest(groups = [], skuMaster = {}) {
  return groups
    .map((group) => ({ combo: group.combo, pieces: classifyAiresGroup(group, skuMaster).pieces }))
    .filter((group) => group.pieces.length >= 2 && group.pieces.every((item) => /^\d+$/.test(item.sku)))
    .map((group) => ({ combo: group.combo, items: group.pieces.map((item) => ({ sku: item.sku, cantidad: item.cantidad })) }));
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

/** Precio actual del aire = Σ(precio pieza × cantidad). Las regalías no cuentan. */
export function getAiresGroupTotal(allLines = []) {
  const lines = allLines.filter((line) => !isAiresRewardRow(line));
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
 * (la que se calculó al cargar). Las regalías no se tocan. Devuelve { [rowId]: precioUnitario } o null.
 */
export function redistributeAiresGroup(allLines = [], newTotal) {
  const lines = allLines.filter((line) => !isAiresRewardRow(line));
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

/** { "skuA+skuB": "aires-3" } de los aires ya cargados (solo piezas; agregar o quitar regalías actualiza el mismo aire). */
export function indexExistingAires(rows = []) {
  const byGroup = new Map();
  rows.filter((row) => isAiresRow(row) && !isAiresRewardRow(row)).forEach((row) => {
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

const uniqueValues = (values) => Array.from(new Set(values.filter((value) => value !== "" && value !== null && value !== undefined)));

/**
 * Vista previa de la pestaña AIRES: una fila por pieza (precio repartido) y una por regalía.
 * Si un aire tiene un error, todas sus filas quedan bloqueadas (y la carga completa).
 */
export function buildAiresBulkPreviewFromRows(rows = [], { skuMaster = {}, costWeightsByCombo = {}, existingAires = {} } = {}) {
  const groups = parseAiresTable(rows);
  const preview = [];
  if (!groups.length) {
    return [{ index: "Aviso", sku: "Sin aires", descripcion: "Use columnas: pagina, combo, SKU, descripcion, ahora c/iva, comentario, cantidad.", campo: "Formato", valorActual: "", valorNuevo: "Sin filas para aplicar", warning: true, canApply: false }];
  }
  const classified = groups.map((group) => ({ group, ...classifyAiresGroup(group, skuMaster) }));
  // Solo las piezas cuentan para "SKU en más de un aire": una regalía puede repetirse.
  const skuCombos = new Map();
  classified.forEach(({ group, pieces }) => pieces.forEach((item) => {
    if (!item.sku) return;
    if (!skuCombos.has(item.sku)) skuCombos.set(item.sku, new Set());
    skuCombos.get(item.sku).add(group.combo);
  }));

  classified.forEach(({ group, pieces, rewards, bases, multipleBases, base }) => {
    const errors = [];
    const notes = [];
    const pieceSkus = new Set(pieces.map((item) => item.sku));
    const pieceLines = group.lines.filter((line) => pieceSkus.has(line.sku));
    const invalidPrices = uniqueValues(pieceLines.filter((line) => line.rawPrice && parseAiresPrice(line.rawPrice) === null).map((line) => line.rawPrice));
    const prices = uniqueValues(pieceLines.map((line) => (line.rawPrice ? parseAiresPrice(line.rawPrice) : null)));
    const descriptions = uniqueValues(pieceLines.map((line) => line.description));
    const pages = Array.from(group.pages);
    const invalidQuantities = uniqueValues(group.lines.filter((line) => line.cantidad === null).map((line) => line.rawQuantity));

    if (!group.hasComboNumber) errors.push("Fila sin número de combo");
    if (group.items.some((item) => !item.sku)) errors.push("Fila sin SKU");
    if (group.items.some((item) => item.sku && !/^\d+$/.test(item.sku))) errors.push("SKU con caracteres no numéricos");
    if (invalidQuantities.length) errors.push(`Cantidad inválida (${invalidQuantities.join(", ")}): use un entero mayor a 0`);
    if (multipleBases.length) errors.push(`Dos aires en el mismo combo (número de parte ${multipleBases.join(" / ")}): sepárelos en combos distintos`);
    if (pieces.length < 2) errors.push("El aire necesita al menos 2 piezas");
    if (invalidPrices.length) errors.push(`Precio inválido (${invalidPrices.join(", ")})`);
    if (!prices.length && !invalidPrices.length) errors.push("Falta ahora c/iva");
    if (prices.length > 1) errors.push(`Precios distintos en el mismo aire (${prices.join(" / ")})`);
    if (!descriptions.length) errors.push("Falta descripción del aire");
    if (descriptions.length > 1) errors.push("Descripciones distintas en el mismo aire");
    if (pages.length > 1) errors.push(`Páginas distintas en el mismo aire (${pages.join(" / ")})`);
    if (group.nonContiguous) notes.push("Filas del combo no consecutivas");

    // Número de parte. Con base repetida, las piezas ya comparten base; sin ella (modo
    // anterior) todas las filas son piezas y deben coincidir.
    const itemBases = new Map(group.items.map((item, index) => [item.sku, bases[index]]));
    if (!base && !multipleBases.length) {
      const withVpn = pieces.filter((item) => itemBases.get(item.sku));
      if (withVpn.length < pieces.length) notes.push(`Sin número de parte en maestro: ${pieces.filter((item) => !itemBases.get(item.sku)).map((item) => item.sku).join(", ")}`);
      if (new Set(withVpn.map((item) => itemBases.get(item.sku))).size > 1) errors.push(`Número de parte no coincide (${withVpn.map((item) => itemBases.get(item.sku)).join(" / ")})`);
    }
    const rewardsWithoutVpn = rewards.filter((item) => !itemBases.get(item.sku)).map((item) => item.sku);
    if (rewardsWithoutVpn.length) notes.push(`Regalía sin número de parte en maestro (verifique que no sea pieza del aire): ${rewardsWithoutVpn.join(", ")}`);
    const missingMaster = group.items.filter((item) => item.sku && !skuMaster[item.sku]?.descripcion).map((item) => item.sku);
    if (missingMaster.length) notes.push(`SKU no encontrado en maestro: ${missingMaster.join(", ")}`);
    const shared = pieces.filter((item) => (skuCombos.get(item.sku)?.size || 0) > 1).map((item) => item.sku);
    if (shared.length) notes.push(`SKU en más de un aire del archivo: ${shared.join(", ")}`);

    const total = prices.length === 1 ? prices[0] : null;

    // Regalías: precio propio (vacío = 100 %), cantidad y descripción de su fila.
    const rewardEntries = rewards.map((item) => {
      const rawPrices = uniqueValues(item.lines.map((line) => line.rawPrice));
      const parsed = rawPrices.map(parseAiresRewardPrice);
      const invalid = rawPrices.filter((raw, index) => parsed[index] === null);
      const values = uniqueValues(parsed.filter((value) => value !== null));
      if (invalid.length) errors.push(`Precio de regalía ${item.sku} inválido (${invalid.join(", ")})`);
      if (values.length > 1) errors.push(`Precios distintos para la regalía ${item.sku} (${values.join(" / ")})`);
      const price = values.length === 1 ? values[0] : rawPrices.length ? null : 0;
      if (price !== null && total !== null && price > 0 && price === total) errors.push(`La regalía ${item.sku} tiene el mismo precio del aire: revise si es una pieza del aire (número de parte del maestro)`);
      return {
        item,
        price,
        description: uniqueValues(item.lines.map((line) => line.description))[0] || "",
        comment: uniqueValues(item.lines.map((line) => line.comment)).join(" | "),
      };
    });
    if (rewardEntries.length) notes.push(`${rewardEntries.length} regalía(s): ${rewardEntries.map((entry) => entry.item.sku).join(", ")}`);

    const resolved = pieces.length >= 2 ? resolveAiresWeights(pieces, { costWeights: costWeightsByCombo[group.combo], skuMaster }) : null;
    if (pieces.length >= 2 && !resolved) errors.push("Sin costo ni precio regular para repartir el precio");
    const distributed = resolved && total !== null ? distributeAiresPrice(total, pieces, resolved.weights) : null;
    const existingGroup = existingAires[skuSetKey(pieces.map((item) => item.sku))] || "";
    const sourceLabel = resolved ? AIRES_SOURCE_LABELS[resolved.source] : "";
    const description = descriptions[0] || "";
    const pieceComment = uniqueValues(pieceLines.map((line) => line.comment)).join(" | ");
    const page = pages[0] || "";
    const common = { scenario: group.combo, aireTotal: total, aireDescripcion: description, numPagina: page, numero_pagina: page, existingGroup };
    const finish = (entry) => ({
      ...entry,
      warning: Boolean(errors.length || notes.length),
      canApply: !errors.length,
      ...(errors.length ? blocking(errors.join("; ")) : {}),
    });

    pieces.forEach((item, index) => {
      const weight = resolved ? resolved.weights[index] : null;
      const price = distributed ? distributed[index] : "";
      const summary = [
        `Aire ${group.combo}`,
        description || "Sin descripción",
        "Pieza",
        resolved ? `Reparto por ${sourceLabel.toLowerCase()} ${round2(weight * 100)}%` : "",
        item.cantidad > 1 ? `Cantidad ${item.cantidad}` : "",
        existingGroup ? `Actualiza ${existingGroup}` : "",
        ...errors,
        ...notes,
      ].filter(Boolean).join(" | ");
      preview.push(finish({
        ...common,
        index: preview.length + 1,
        sku: item.sku || "SKU vacio",
        descripcion: summary,
        campo: "Pieza de aire",
        valorActual: total !== null ? `Aire ${total}` : "",
        valorNuevo: price === "" ? "Sin precio" : `Precio pieza ${price}`,
        precioAhora: price,
        descuento: "",
        cantidadMinima: item.cantidad,
        airesRol: AIRES_COMPONENT_ROLE,
        aireFuente: resolved?.source || "",
        airePeso: weight === null ? null : round2(weight * 100),
        comentario: pieceComment,
      }));
    });

    rewardEntries.forEach(({ item, price, description: rewardDescription, comment }) => {
      const free = price === 0;
      const summary = [
        `Aire ${group.combo}`,
        rewardDescription || skuMaster[item.sku]?.descripcion || "Sin descripción",
        free ? "Regalía 100%" : price === null ? "Regalía" : `Regalía con precio ${price}`,
        item.cantidad > 1 ? `Cantidad ${item.cantidad}` : "",
        existingGroup ? `Actualiza ${existingGroup}` : "",
        ...errors,
        ...notes,
      ].filter(Boolean).join(" | ");
      preview.push(finish({
        ...common,
        index: preview.length + 1,
        sku: item.sku || "SKU vacio",
        descripcion: summary,
        campo: "Regalía de aire",
        valorActual: total !== null ? `Aire ${total}` : "",
        valorNuevo: price === null ? "Sin precio" : free ? "Regalía 100%" : `Precio regalía ${price}`,
        precioAhora: price === null ? "" : price,
        descuento: free ? "100%" : "",
        cantidadMinima: item.cantidad,
        airesRol: AIRES_REWARD_ROLE,
        regaliaDescripcion: rewardDescription,
        aireFuente: "",
        airePeso: null,
        comentario: comment,
      }));
    });
  });
  return preview;
}

/** Texto de comentario que queda en cada línea: trazabilidad del aire + comentario de la compradora. */
export function buildAiresLineComment(item, group) {
  if (item.airesRol === AIRES_REWARD_ROLE) {
    const trace = `Aire ${group}: regalía${Number(item.precioAhora) === 0 ? " 100%" : ""}`;
    return [trace, item.comentario].filter(Boolean).join(" | ");
  }
  const source = AIRES_SOURCE_LABELS[item.aireFuente] || "";
  const trace = `Aire ${group}${source ? `: reparto por ${source.toLowerCase()} ${item.airePeso}%` : ""}`;
  return [trace, item.comentario].filter(Boolean).join(" | ");
}

export { AIRES_COMPONENT_ROLE, AIRES_PROMO_TYPE };
