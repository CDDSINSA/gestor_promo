import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";

// Carga módulos con imports sin extensión (igual que skuDemandFlows.test.mjs).
async function load(entry) {
  const context = createContext({});
  const modules = new Map();
  const get = async (filename) => {
    if (!modules.has(filename)) modules.set(filename, readFile(filename, "utf8").then((source) => new SourceTextModule(source, { context, identifier: filename })));
    return modules.get(filename);
  };
  const stub = (values) => new SyntheticModule(Object.keys(values), function () {
    for (const [key, value] of Object.entries(values)) this.setExport(key, value);
  }, { context });
  const icons = stub(Object.fromEntries(["CalendarDays", "Download", "FileSpreadsheet", "History", "Home", "Images", "ListChecks", "Percent", "Search", "Settings", "TrendingUp"].map((icon) => [icon, () => null])));
  const root = await get(fileURLToPath(new URL(entry, import.meta.url)));
  await root.link(async (name, parent) => {
    if (name === "react") return stub({ createContext: () => ({}), useContext: () => null });
    if (name === "lucide-react") return icons;
    const base = path.resolve(path.dirname(parent.identifier), name);
    return get([base + ".js", path.join(base, "index.js"), base].find((file) => existsSync(file) && statSync(file).isFile()));
  });
  await root.evaluate();
  return root.namespace;
}

const aires = await load("../src/features/promotions/application/airesCombo.js");
const bulk = await load("../src/features/promotions/application/bulkImport.js");
const engine = await load("../src/promoTypes/promoTypeEngine.js");
const chunks = await load("../src/services/supabase/saveChunks.js");
const validation = await load("../src/services/promotionValidationService.js");
const design = await load("../src/features/catalogDesign/designPromotions.js");

// Tabla del ejemplo de la compradora (pestaña AIRES).
const TEMPLATE = [
  ["pagina", "combo", "SKU", "descripcion", "ahora c/iva", "comentario"],
  ["", "1", "157638037", "MINI SPLIT 12000BTU 220V SEER 18 HISENSE", "12999", ""],
  ["", "1", "157638070", "", "", ""],
  ["", "2", "157638029", "MINI SPLIT  12000BTU 110V SEER 18 HISENSE", "13999", ""],
  ["", "2", "157638061", "", "", ""],
];
// Los objetos vienen de otro contexto vm: se comparan como datos planos.
const plain = (value) => JSON.parse(JSON.stringify(value));
const toText = (rows) => rows.map((row) => row.join("\t")).join("\n");
const MASTER = {
  157638037: { descripcion: "CONDENSADOR 12K 220V", vpn: "AS12TW.OUT", precio: 8000 },
  157638070: { descripcion: "EVAPORADOR 12K 220V", vpn: "AS12TW.IN", precio: 4000 },
  157638029: { descripcion: "CONDENSADOR 12K 110V", vpn: "AS12UV.OUT", precio: 9000 },
  157638061: { descripcion: "EVAPORADOR 12K 110V", vpn: "AS12UV.IN", precio: 3000 },
};
const pieceSum = (pieces) => Math.round(pieces.reduce((sum, item) => sum + item.precioAhora * item.cantidadMinima, 0) * 100) / 100;

test("número de parte base: antes del primer punto o guion; sin separador, completo", () => {
  assert.equal(aires.getVpnBase("SW362H8.NRP0"), "SW362H8");
  assert.equal(aires.getVpnBase(" sw362h8.usp0 "), "SW362H8");
  assert.equal(aires.getVpnBase("SW362H8-NRP0"), "SW362H8");
  assert.equal(aires.getVpnBase("as12tw-out.v1"), "AS12TW");
  assert.equal(aires.getVpnBase("AS12TW–IN"), "AS12TW");
  assert.equal(aires.getVpnBase("AB123"), "AB123");
  assert.equal(aires.getVpnBase(""), "");
});

test("reparto exacto: la suma de piezas cuadra al centavo con el precio del aire", () => {
  for (const [total, weights] of [[12999, [8000 / 13500, 5500 / 13500]], [13999, [1 / 3, 1 / 3, 1 / 3]], [100.01, [0.5, 0.5]], [24999.99, [0.61234, 0.38766]]]) {
    const items = weights.map(() => ({ cantidad: 1 }));
    const prices = aires.distributeAiresPrice(total, items, weights);
    assert.equal(Math.round(prices.reduce((a, b) => a + b, 0) * 100) / 100, total);
    prices.forEach((price) => assert.equal(Math.round(price * 100) / 100, price));
  }
  // Ejemplo de la conversación: costos 8,000 y 5,500 -> 7,703.11 + 5,295.89.
  assert.deepEqual(plain(aires.distributeAiresPrice(12999, [{ cantidad: 1 }, { cantidad: 1 }], [8000 / 13500, 5500 / 13500])), [7703.11, 5295.89]);
});

test("pesos: costo primero; si falta en una pieza, precio regular para todo el aire", () => {
  const items = [{ sku: "1", cantidad: 1 }, { sku: "2", cantidad: 2 }];
  const master = { 1: { precio: 600 }, 2: { precio: 200 } };
  const byCost = aires.resolveAiresWeights(items, { costWeights: { 1: 0.7, 2: 0.3 }, skuMaster: master });
  assert.equal(byCost.source, "COSTO");
  assert.deepEqual(plain(byCost.weights.map((w) => Math.round(w * 100))), [70, 30]);
  const byPrice = aires.resolveAiresWeights(items, { costWeights: { 1: 0.7 }, skuMaster: master });
  assert.equal(byPrice.source, "PRECIO_REGULAR");
  assert.deepEqual(plain(byPrice.weights.map((w) => Math.round(w * 100))), [60, 40]);
  assert.equal(aires.resolveAiresWeights(items, { skuMaster: { 1: { precio: 600 } } }), null);
});

test("respuesta de la RPC: solo combos con fuente COSTO", () => {
  const weights = aires.normalizeAiresCostWeights([
    { combo: "1", fuente: "COSTO", pesos: [{ sku: "157638037", peso: 0.6 }, { sku: "157638070", peso: 0.4 }] },
    { combo: "2", fuente: "SIN_COSTO", pesos: null },
  ]);
  assert.deepEqual(plain(Object.keys(weights)), ["1"]);
  assert.equal(weights["1"]["157638070"], 0.4);
});

test("plantilla de la compradora: agrupa por combo, copia descripción y reparte el precio", () => {
  const preview = aires.buildAiresBulkPreviewFromRows(TEMPLATE, {
    skuMaster: MASTER,
    costWeightsByCombo: { 1: { 157638037: 0.6, 157638070: 0.4 } },
  });
  assert.equal(preview.length, 4);
  assert.ok(preview.every((item) => item.canApply && !item.blocking));
  const combo1 = preview.filter((item) => item.scenario === "1");
  const combo2 = preview.filter((item) => item.scenario === "2");
  assert.deepEqual(plain(combo1.map((item) => item.precioAhora)), [7799.4, 5199.6]);
  assert.equal(combo1[0].aireFuente, "COSTO");
  assert.equal(pieceSum(combo1), 12999);
  // Combo 2 sin costo: precio regular 9,000 / 3,000 -> 75 % / 25 %.
  assert.equal(combo2[0].aireFuente, "PRECIO_REGULAR");
  assert.deepEqual(plain(combo2.map((item) => item.precioAhora)), [10499.25, 3499.75]);
  // La descripción de la plantilla (sin doble espacio) va a ambas piezas.
  assert.ok(combo2.every((item) => item.aireDescripcion === "MINI SPLIT 12000BTU 110V SEER 18 HISENSE"));
});

test("bloqueos: sin precio, precios distintos, una pieza, páginas distintas, número de parte distinto", () => {
  const cases = [
    [[["combo", "SKU", "descripcion", "ahora c/iva"], ["1", "157638037", "AIRE", ""], ["1", "157638070", "", ""]], /Falta ahora c\/iva/],
    [[["combo", "SKU", "descripcion", "ahora c/iva"], ["1", "157638037", "AIRE", "100"], ["1", "157638070", "", "200"]], /Precios distintos/],
    [[["combo", "SKU", "descripcion", "ahora c/iva"], ["1", "157638037", "AIRE", "100"]], /al menos 2 piezas/],
    [[["pagina", "combo", "SKU", "descripcion", "ahora c/iva"], ["3", "1", "157638037", "AIRE", "100"], ["4", "1", "157638070", "", ""]], /Páginas distintas/],
    [[["combo", "SKU", "descripcion", "ahora c/iva"], ["1", "157638037", "AIRE", "100"], ["1", "157638061", "", ""]], /Número de parte no coincide/],
    [[["combo", "SKU", "descripcion", "ahora c/iva"], ["1", "157638037", "AIRE", "100"], ["1", "999", "", ""]], /Sin costo ni precio regular/],
  ];
  for (const [rows, reason] of cases) {
    const preview = aires.buildAiresBulkPreviewFromRows(rows, { skuMaster: MASTER });
    assert.ok(preview.every((item) => item.blocking && !item.canApply), String(reason));
    assert.match(preview[0].descripcion, reason);
  }
  // Sin número de parte en el maestro: solo aviso, no bloquea.
  const noVpn = aires.buildAiresBulkPreviewFromRows([["combo", "SKU", "descripcion", "ahora c/iva"], ["1", "1", "AIRE", "100"], ["1", "2", "", ""]], { skuMaster: { 1: { descripcion: "A", precio: 50 }, 2: { descripcion: "B", precio: 50 } } });
  assert.ok(noVpn.every((item) => item.canApply && item.warning));
  assert.match(noVpn[0].descripcion, /Sin número de parte/);
});

test("SKU repetido en el aire se junta con cantidad y la suma considera la cantidad", () => {
  const rows = [["combo", "SKU", "descripcion", "ahora c/iva"], ["1", "10", "MULTI SPLIT", "30000"], ["1", "20", "", ""], ["1", "20", "", ""]];
  const preview = aires.buildAiresBulkPreviewFromRows(rows, { skuMaster: { 10: { descripcion: "C", vpn: "MS.A", precio: 1000 }, 20: { descripcion: "E", vpn: "MS.B", precio: 500 } } });
  assert.equal(preview.length, 2);
  assert.equal(preview[1].cantidadMinima, 2);
  assert.equal(pieceSum(preview), 30000);
});

test("aire ya cargado con los mismos SKU se actualiza en lugar de duplicarse", () => {
  const existing = aires.indexExistingAires([
    { tipo_promo: "AIRES", grupo_oferta: "aires-4", sku: "157638070" },
    { tipo_promo: "AIRES", grupo_oferta: "aires-4", sku: "157638037" },
    { tipo_promo: "Combo", grupo_oferta: "combo-1", sku: "157638029" },
  ]);
  const preview = aires.buildAiresBulkPreviewFromRows(TEMPLATE, { skuMaster: MASTER, existingAires: existing });
  assert.ok(preview.filter((item) => item.scenario === "1").every((item) => item.existingGroup === "aires-4"));
  assert.ok(preview.filter((item) => item.scenario === "2").every((item) => item.existingGroup === ""));
});

test("cambiar el precio del aire en la grilla conserva la proporción entre piezas", () => {
  const lines = [{ id: "a", precioAhora: 7799.4, cantidadMinima: 1 }, { id: "b", precioAhora: 5199.6, cantidadMinima: 1 }];
  assert.equal(aires.getAiresGroupTotal(lines), 12999);
  const prices = aires.redistributeAiresGroup(lines, "11,999.00");
  assert.deepEqual(plain(prices), { a: 7199.4, b: 4799.6 });
  assert.equal(aires.redistributeAiresGroup(lines, "abc"), null);
  assert.equal(aires.redistributeAiresGroup(lines, "0"), null);
});

test("integración: tipo AIRES, plantilla, lectura de SKU y guardado por partes", () => {
  assert.ok(engine.complexPromoTypes.includes("AIRES"));
  assert.ok(engine.getColumnsForPromoType("AIRES").includes("precioAire"));
  assert.equal(engine.promoLabels.precioAire, "Precio aire c/IVA");
  assert.equal(bulk.getDefaultBulkColumnForPromoType("AIRES"), "tablaAires");
  assert.deepEqual(plain([...bulk.getBulkSkuCodes(toText(TEMPLATE), "tablaAires", "AIRES")]), ["157638037", "157638070", "157638029", "157638061"]);
  const blocked = bulk.withDiscountLimitNotice(bulk.buildAiresBulkPreview(toText(TEMPLATE.slice(0, 2)), MASTER));
  assert.equal(blocked[0].index, "Aviso");
  assert.match(blocked[0].descripcion, /1 aire\(s\) con errores/);

  // Un aire nunca se parte entre dos llamadas de guardado.
  const promociones = Array.from({ length: 7 }, (_, index) => ({ row_id: `s${index}`, tipo_promo: "Descuento" }));
  promociones.push({ row_id: "a1", tipo_promo: "AIRES", oferta_id: "X" }, { row_id: "a2", tipo_promo: "AIRES", oferta_id: "X" });
  const parts = chunks.splitCatalogSavePayload({ promociones, sync_options: { promociones: { changed_row_ids: promociones.map((row) => row.row_id) } } }, 3);
  assert.ok(parts.length > 1);
  const withAires = parts.filter((part) => part.promociones.some((row) => row.tipo_promo === "AIRES"));
  assert.equal(withAires.length, 1);
  assert.equal(withAires[0].promociones.filter((row) => row.tipo_promo === "AIRES").length, 2);
});

test("validación: aire de una pieza o con páginas distintas no se guarda", () => {
  const base = { actividad_id: "CAT-1", comprador: "Ana", tipo_promo: "AIRES", tipo_sku: "componente", grupo_oferta: "aires-1", oferta_id: "CAT-1-AIRES-1", precio_ahora: 100, cantidad_minima: 1 };
  const single = validation.validatePromotions([{ ...base, row_id: "r1", sku: "1" }]);
  assert.ok(single.errors.some((issue) => issue.code === "aires_single_piece"));
  const pages = validation.validatePromotions([{ ...base, row_id: "r1", sku: "1", numero_pagina: 3 }, { ...base, row_id: "r2", sku: "2", numero_pagina: 4 }]);
  assert.ok(pages.errors.some((issue) => issue.code === "aires_pages"));
  const ok = validation.validatePromotions([{ ...base, row_id: "r1", sku: "1" }, { ...base, row_id: "r2", sku: "2" }]);
  assert.ok(!ok.errors.some((issue) => String(issue.code).startsWith("aires")));
});

test("Diseño: la card del aire muestra el precio y el antes del aire completo", () => {
  const rows = [
    { id: "a", tipo_promo: "AIRES", grupo_oferta: "aires-1", oferta_id: "O1", comprador: "Ana", sku: "1", descripcion: "MINI SPLIT", precio_ahora: "7799.4", precio_antes: "9200", cantidad_minima: 1 },
    { id: "b", tipo_promo: "AIRES", grupo_oferta: "aires-1", oferta_id: "O1", comprador: "Ana", sku: "2", descripcion: "MINI SPLIT", precio_ahora: "5199.6", precio_antes: "4600", cantidad_minima: 1 },
  ];
  const { offers } = design.buildDesignOffers(rows);
  assert.equal(offers.length, 1);
  assert.deepEqual(plain(offers[0].aire), { description: "MINI SPLIT", total: 12999, before: 13800 });
  assert.equal(offers[0].label, "AIRES 1");
});

// ---------------------------------------------------------------------------
// Regalías dentro del aire (2026-11-03): los SKU del combo cuyo número de parte no es el
// del paquete son regalía. Precio propio (vacío = 100 %), columna cantidad (vacía = 1).
// ---------------------------------------------------------------------------
const margins = await load("../src/features/margins/marginEngine.js");
const MASTER_REWARDS = {
  ...MASTER,
  500: { descripcion: "KIT INSTALACION", vpn: "KIT-01", precio: 1500 },
  600: { descripcion: "CONTROL UNIVERSAL", vpn: "CTRL.9", precio: 400 },
  700: { descripcion: "ESTABILIZADOR", precio: 900 },
};
const REWARD_TEMPLATE = [
  ["pagina", "combo", "SKU", "descripcion", "ahora c/iva", "comentario", "cantidad"],
  ["5", "1", "157638037", "MINI SPLIT 12000BTU 220V", "12999", "", ""],
  ["5", "1", "157638070", "", "", "", ""],
  ["5", "1", "500", "", "", "Kit gratis", ""],
  ["5", "1", "600", "", "200", "", "2"],
];

test("regalías: se identifican por número de parte y no entran al reparto del aire", () => {
  const preview = aires.buildAiresBulkPreviewFromRows(REWARD_TEMPLATE, { skuMaster: MASTER_REWARDS, costWeightsByCombo: { 1: { 157638037: 0.6, 157638070: 0.4 } } });
  assert.equal(preview.length, 4);
  assert.ok(preview.every((item) => item.canApply && !item.blocking));
  const pieces = preview.filter((item) => item.airesRol === "componente");
  const rewards = preview.filter((item) => item.airesRol === "regalia");
  assert.deepEqual(plain(pieces.map((item) => item.sku)), ["157638037", "157638070"]);
  assert.deepEqual(plain(pieces.map((item) => item.precioAhora)), [7799.4, 5199.6]);
  assert.equal(pieceSum(pieces), 12999);
  // Regalía sin precio = 100 %; con precio = su precio; cantidad de la columna nueva.
  const [kit, control] = rewards;
  assert.deepEqual(plain([kit.sku, kit.precioAhora, kit.descuento, kit.cantidadMinima, kit.campo]), ["500", 0, "100%", 1, "Regalía de aire"]);
  assert.deepEqual(plain([control.sku, control.precioAhora, control.descuento, control.cantidadMinima]), ["600", 200, "", 2]);
  assert.equal(kit.comentario, "Kit gratis");
  assert.equal(aires.buildAiresLineComment(kit, "aires-2"), "Aire aires-2: regalía 100% | Kit gratis");
  // La página del aire aplica también a sus regalías.
  assert.ok(rewards.every((item) => item.numPagina === "5"));
  // El pedido de pesos por costo solo lleva piezas.
  const request = aires.getAiresWeightRequest(aires.parseAiresTable(REWARD_TEMPLATE), MASTER_REWARDS);
  assert.deepEqual(plain(request), [{ combo: "1", items: [{ sku: "157638037", cantidad: 1 }, { sku: "157638070", cantidad: 1 }] }]);
});

test("regalías: protecciones contra piezas mal clasificadas", () => {
  const header = ["combo", "SKU", "descripcion", "ahora c/iva", "cantidad"];
  const block = (rows, reason) => {
    const preview = aires.buildAiresBulkPreviewFromRows([header, ...rows], { skuMaster: MASTER_REWARDS });
    assert.ok(preview.every((item) => item.blocking && !item.canApply), String(reason));
    assert.match(preview[0].descripcion, reason);
  };
  // Regalía con el mismo precio del aire: casi seguro una pieza con VPN mal cargado.
  block([["1", "157638037", "AIRE", "12999", ""], ["1", "157638070", "", "", ""], ["1", "500", "", "12999", ""]], /mismo precio del aire/);
  // Dos paquetes en el mismo combo.
  block([["1", "157638037", "AIRE", "100", ""], ["1", "157638070", "", "", ""], ["1", "157638029", "", "", ""], ["1", "157638061", "", "", ""]], /Dos aires en el mismo combo/);
  // Cantidad inválida.
  block([["1", "157638037", "AIRE", "100", ""], ["1", "157638070", "", "", ""], ["1", "500", "", "", "0"]], /Cantidad inválida/);
  block([["1", "157638037", "AIRE", "100", ""], ["1", "157638070", "", "", ""], ["1", "500", "", "", "1.5"]], /Cantidad inválida/);
  // Precio de regalía inválido.
  block([["1", "157638037", "AIRE", "100", ""], ["1", "157638070", "", "", ""], ["1", "500", "", "abc", ""]], /Precio de regalía 500 inválido/);
  // Regalía sin VPN en el maestro: se carga, pero con aviso.
  const noVpn = aires.buildAiresBulkPreviewFromRows([header, ["1", "157638037", "AIRE", "100", ""], ["1", "157638070", "", "", ""], ["1", "700", "", "", ""]], { skuMaster: MASTER_REWARDS });
  assert.ok(noVpn.every((item) => item.canApply && item.warning));
  assert.match(noVpn[0].descripcion, /Regalía sin número de parte en maestro .*700/);
  // "0" explícito también es regalía al 100 %.
  assert.equal(aires.parseAiresRewardPrice("0"), 0);
  assert.equal(aires.parseAiresRewardPrice("0.00"), 0);
  assert.equal(aires.parseAiresRewardPrice(""), 0);
  assert.equal(aires.parseAiresRewardPrice("1,250.50"), 1250.5);
  assert.equal(aires.parseAiresRewardPrice("-5"), null);
});

test("cantidad: vacía = 1 y las filas repetidas suman su cantidad", () => {
  assert.equal(aires.parseAiresQuantity(""), 1);
  assert.equal(aires.parseAiresQuantity("3"), 3);
  assert.equal(aires.parseAiresQuantity("0"), null);
  const rows = [["combo", "SKU", "descripcion", "ahora c/iva", "cantidad"], ["1", "10", "MULTI", "30000", ""], ["1", "20", "", "", "2"], ["1", "20", "", "", ""], ["1", "500", "", "", "3"]];
  const preview = aires.buildAiresBulkPreviewFromRows(rows, { skuMaster: { 10: { descripcion: "C", vpn: "MS.A", precio: 1000 }, 20: { descripcion: "E", vpn: "MS.B", precio: 500 }, 500: { descripcion: "KIT", vpn: "KIT-01", precio: 100 } } });
  assert.deepEqual(plain(preview.map((item) => [item.sku, item.airesRol, item.cantidadMinima])), [["10", "componente", 1], ["20", "componente", 3], ["500", "regalia", 3]]);
  assert.equal(pieceSum(preview.filter((item) => item.airesRol === "componente")), 30000);
});

test("regalías: el aire existente se reconoce solo por sus piezas", () => {
  const existing = aires.indexExistingAires([
    { tipo_promo: "AIRES", grupo_oferta: "aires-4", tipo_sku: "componente", sku: "157638070" },
    { tipo_promo: "AIRES", grupo_oferta: "aires-4", tipo_sku: "componente", sku: "157638037" },
    { tipo_promo: "AIRES", grupo_oferta: "aires-4", tipo_sku: "regalia", sku: "999" },
  ]);
  assert.deepEqual(plain(existing), { "157638037+157638070": "aires-4" });
  const preview = aires.buildAiresBulkPreviewFromRows(REWARD_TEMPLATE, { skuMaster: MASTER_REWARDS, existingAires: existing });
  assert.ok(preview.every((item) => item.existingGroup === "aires-4"));
});

test("regalías en la grilla: no suman al precio del aire ni se reparten", () => {
  const lines = [
    { id: "a", tipoSku: "componente", precioAhora: 7799.4, cantidadMinima: 1 },
    { id: "b", tipoSku: "componente", precioAhora: 5199.6, cantidadMinima: 1 },
    { id: "r", tipoSku: "regalia", precioAhora: 200, cantidadMinima: 2 },
  ];
  assert.equal(aires.getAiresGroupTotal(lines), 12999);
  assert.deepEqual(plain(aires.redistributeAiresGroup(lines, "11999")), { a: 7199.4, b: 4799.6 });
  assert.ok(engine.getColumnsForPromoType("AIRES").includes("tipoSku"));
  assert.ok(engine.getColumnsForPromoType("AIRES").includes("descuento"));
});

test("regalías al guardar: precio 0 válido, sin contar como pieza", () => {
  const base = { actividad_id: "CAT-1", comprador: "Ana", tipo_promo: "AIRES", grupo_oferta: "aires-1", oferta_id: "CAT-1-AIRES-1", cantidad_minima: 1 };
  const pieces = [{ ...base, row_id: "r1", sku: "1", tipo_sku: "componente", precio_ahora: 100 }, { ...base, row_id: "r2", sku: "2", tipo_sku: "componente", precio_ahora: 50 }];
  const ok = validation.validatePromotions([...pieces, { ...base, row_id: "r3", sku: "3", tipo_sku: "regalia", precio_ahora: 0, descuento: "100%", descripcion: "KIT" }]);
  assert.ok(!ok.errors.some((issue) => String(issue.code).startsWith("aires") || issue.field === "precio_ahora"), JSON.stringify(plain(ok.errors)));
  // Una pieza + una regalía no es un aire.
  const single = validation.validatePromotions([pieces[0], { ...base, row_id: "r3", sku: "3", tipo_sku: "regalia", precio_ahora: 0 }]);
  assert.ok(single.errors.some((issue) => issue.code === "aires_single_piece"));
  // Regalía sin precio (vacío) no se guarda.
  const noPrice = validation.validatePromotions([...pieces, { ...base, row_id: "r3", sku: "3", tipo_sku: "regalia", precio_ahora: "" }]);
  assert.ok(noPrice.errors.some((issue) => /Regalía de aire sin precio/.test(issue.message)));
});

test("regalías en Diseño y Márgenes", () => {
  const rows = [
    { id: "a", tipo_promo: "AIRES", tipo_sku: "componente", grupo_oferta: "aires-1", oferta_id: "O1", comprador: "Ana", sku: "1", descripcion: "MINI SPLIT", precio_ahora: "7799.4", precio_antes: "9200", cantidad_minima: 1 },
    { id: "r", tipo_promo: "AIRES", tipo_sku: "regalia", grupo_oferta: "aires-1", oferta_id: "O1", comprador: "Ana", sku: "9", descripcion: "KIT", precio_ahora: "0", descuento: "100%", precio_antes: "1500", cantidad_minima: 1 },
    { id: "b", tipo_promo: "AIRES", tipo_sku: "componente", grupo_oferta: "aires-1", oferta_id: "O1", comprador: "Ana", sku: "2", descripcion: "MINI SPLIT", precio_ahora: "5199.6", precio_antes: "4600", cantidad_minima: 1 },
  ];
  const { offers } = design.buildDesignOffers(rows);
  assert.deepEqual(plain(offers[0].aire), { description: "MINI SPLIT", total: 12999, before: 13800 });
  assert.deepEqual(plain(offers[0].lines.map((row) => row.id)), ["a", "b", "r"]);
  assert.equal(design.getDesignRoleLabel(rows[1]), "Regalía");
  assert.equal(design.getDesignRoleLabel(rows[0]), "Pieza");
  assert.equal(design.getDesignLineBenefit(rows[1]).kind, "regalia");

  // Margen del aire: lo cobrado (piezas + regalías con precio) contra el costo de todo lo entregado.
  const offer = margins.evaluateOffer([
    { actividad_id: "C", oferta_id: "O1", tipo_promo: "AIRES", tipo_sku: "componente", sku: "1", precio_ahora: 7799.4, cantidad_minima: 1, costo_nio: 5000 },
    { actividad_id: "C", oferta_id: "O1", tipo_promo: "AIRES", tipo_sku: "componente", sku: "2", precio_ahora: 5199.6, cantidad_minima: 1, costo_nio: 3000 },
    { actividad_id: "C", oferta_id: "O1", tipo_promo: "AIRES", tipo_sku: "regalia", sku: "9", precio_ahora: 0, descuento: "100%", cantidad_minima: 2, costo_nio: 500 },
  ]);
  assert.equal(offer.costoTotal, 9000);
  assert.equal(offer.ventaNeta, Math.round((12999 / 1.15) * 100) / 100);
});
