import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_MARGIN_THRESHOLDS,
  MARGIN_STATUS,
  buildMarginReport,
  classifyMargin,
  evaluateOffer,
  filterOffersByStatus,
  normalizeThresholds,
  resolveGrossUnitPrice,
} from "../src/features/margins/marginEngine.js";

const base = { actividad_id: "CAT-1", nombre_actividad: "Renueva", tipo_actividad: "CATALOGO", comprador: "Ana", division: "Ferretería", fuente_costo: "CAPTURA" };
const line = (values) => ({ ...base, ...values });

test("semáforo: verde >= 30, naranja >= 20 y < 30, amarillo >= 10 y < 20, rojo < 10", () => {
  const cases = [[45, "VERDE"], [30, "VERDE"], [29.99, "NARANJA"], [20, "NARANJA"], [19.99, "AMARILLO"], [10, "AMARILLO"], [9.99, "ROJO"], [-5, "ROJO"], [null, "ROJO"]];
  cases.forEach(([value, expected]) => assert.equal(classifyMargin(value, DEFAULT_MARGIN_THRESHOLDS), expected, String(value)));
});

test("cortes configurables inválidos vuelven a los valores por defecto", () => {
  assert.deepEqual(normalizeThresholds({ verde: 40, naranja: 25, amarillo: 12 }), { verde: 40, naranja: 25, amarillo: 12 });
  assert.deepEqual(normalizeThresholds({ verde: 10, naranja: 25, amarillo: 12 }), DEFAULT_MARGIN_THRESHOLDS);
  assert.deepEqual(normalizeThresholds(null), DEFAULT_MARGIN_THRESHOLDS);
});

test("precio: ahora, luego antes con descuento, luego regular; 100% es obsequio", () => {
  assert.equal(resolveGrossUnitPrice({ precio_ahora: 92, precio_antes: 115 }), 92);
  assert.equal(resolveGrossUnitPrice({ precio_antes: 200, descuento: "25%" }), 150);
  assert.equal(resolveGrossUnitPrice({ precio_antes: 200, descuento: "25" }), 150);
  assert.equal(resolveGrossUnitPrice({ precio_regular: 80 }), 80);
  assert.equal(resolveGrossUnitPrice({ descuento: "100%" }), 0);
  assert.equal(resolveGrossUnitPrice({ descuento: "10%" }), null);
});

test("precio fijo: se quita el IVA antes de calcular el margen", () => {
  // 115 c/IVA = 100 neto; costo 70 -> 30 %
  const offer = evaluateOffer([line({ oferta_id: "O1", tipo_promo: "Precio fijo", sku: "1", precio_ahora: 115, costo_nio: 70 })]);
  assert.equal(offer.margen, 30);
  assert.equal(offer.estado, MARGIN_STATUS.VERDE);
  assert.equal(offer.ventaNeta, 100);
});

test("descuento usa el precio antes con IVA", () => {
  // 230 c/IVA -20% = 184 c/IVA = 160 neto; costo 136 -> 15 %
  const offer = evaluateOffer([line({ oferta_id: "O2", tipo_promo: "Descuento", sku: "2", precio_antes: 230, descuento: "20%", costo_nio: 136 })]);
  assert.equal(offer.margen, 15);
  assert.equal(offer.estado, MARGIN_STATUS.AMARILLO);
});

test("combo: lo cobrado contra el costo de todo lo entregado, regalía a cero", () => {
  const offer = evaluateOffer([
    line({ oferta_id: "O3", tipo_promo: "Combo", grupo_oferta: "combo-1", tipo_sku: "principal", sku: "A", precio_ahora: 230, cantidad_minima: 1, costo_nio: 100 }),
    line({ oferta_id: "O3", tipo_promo: "Combo", grupo_oferta: "combo-1", tipo_sku: "regalia", sku: "B", precio_ahora: 0, descuento: "100%", cantidad_minima: 1, costo_nio: 50 }),
  ]);
  // venta 200 neto, costo 150 -> 25 %
  assert.equal(offer.margen, 25);
  assert.equal(offer.estado, MARGIN_STATUS.NARANJA);
  assert.equal(offer.skuCount, 2);
  assert.equal(offer.lineas[1].esObsequio, true);
});

test("compra X lleva X (V1) con fila de regalía y V2 con la variante en una sola fila", () => {
  const v1 = evaluateOffer([
    line({ oferta_id: "O4", tipo_promo: "Compra X lleva X", grupo_oferta: "g", tipo_sku: "principal", variante: "2x1", sku: "C", precio_antes: 115, cantidad_minima: 1, costo_nio: 40 }),
    line({ oferta_id: "O4", tipo_promo: "Compra X lleva X", grupo_oferta: "g", tipo_sku: "regalia", variante: "2x1", sku: "C", precio_ahora: 0, descuento: "100%", cantidad_minima: 1, costo_nio: 40 }),
  ]);
  // paga 1 (100 neto), entrega 2 (80) -> 20 %
  assert.equal(v1.margen, 20);
  const v2 = evaluateOffer([
    line({ oferta_id: "O5", tipo_promo: "Compra X Lleva X V2", grupo_oferta: "g", tipo_sku: "principal", variante: "3x2", sku: "D", precio_antes: 115, cantidad_minima: 2, costo_nio: 50 }),
  ]);
  // paga 2 (200 neto), entrega 3 (150) -> 25 %
  assert.equal(v2.lineas[0].unidadesEntregadas, 3);
  assert.equal(v2.margen, 25);
});

test("megapack: principal a precio regular y obsequios a cero", () => {
  const offer = evaluateOffer([
    line({ oferta_id: "O6", tipo_promo: "Megapack", grupo_oferta: "m", tipo_sku: "principal", sku: "E", precio_antes: 115, cantidad_minima: 10, costo_nio: 60 }),
    line({ oferta_id: "O6", tipo_promo: "Megapack", grupo_oferta: "m", tipo_sku: "regalia", sku: "F", precio_ahora: 0, descuento: "100%", cantidad_minima: 2, costo_nio: 50 }),
  ]);
  // venta 1000, costo 600 + 100 = 700 -> 30 %
  assert.equal(offer.margen, 30);
  assert.equal(offer.estado, MARGIN_STATUS.VERDE);
});

test("umbral: cada nivel por unidad y el grupo toma el peor nivel", () => {
  const offer = evaluateOffer([
    line({ oferta_id: "O7", tipo_promo: "Umbral", grupo_oferta: "u", sku: "G", tipo_cantidad: "Mínimo", cantidad_minima: 1, precio_antes: 115, descuento: "5%", costo_nio: 60 }),
    line({ oferta_id: "O7", tipo_promo: "Umbral", grupo_oferta: "u", sku: "G", tipo_cantidad: "Mínimo", cantidad_minima: 10, precio_antes: 115, descuento: "30%", costo_nio: 60 }),
  ]);
  assert.equal(offer.escenarios.length, 2);
  // nivel 10: 80.5 c/IVA = 70 neto; costo 60 -> 14.29 %
  assert.equal(offer.margen, 14.29);
  assert.equal(offer.estado, MARGIN_STATUS.AMARILLO);
});

test("sin costo o sin precio no se pintan con el semáforo", () => {
  const noCost = evaluateOffer([line({ oferta_id: "O8", tipo_promo: "Precio fijo", sku: "H", precio_ahora: 100, costo_nio: null })]);
  assert.equal(noCost.estado, MARGIN_STATUS.SIN_COSTO);
  assert.equal(noCost.margen, null);
  const noPrice = evaluateOffer([line({ oferta_id: "O9", tipo_promo: "Descuento", sku: "I", descuento: "10%", costo_nio: 10 })]);
  assert.equal(noPrice.estado, MARGIN_STATUS.SIN_PRECIO);
});

test("reporte: agrupa por oferta, ordena lo crítico primero y marca cambios de costo", () => {
  const report = buildMarginReport([
    line({ oferta_id: "OK", tipo_promo: "Precio fijo", sku: "1", precio_ahora: 115, costo_nio: 50 }),
    line({ oferta_id: "BAD", tipo_promo: "Precio fijo", sku: "2", precio_ahora: 115, costo_nio: 95, costo_vigente_nio: 99 }),
    line({ oferta_id: "C", tipo_promo: "Combo", grupo_oferta: "c", sku: "3", precio_ahora: 115, costo_nio: 60 }),
    line({ oferta_id: "C", tipo_promo: "Combo", grupo_oferta: "c", sku: "4", precio_ahora: 0, descuento: "100%", costo_nio: null }),
  ]);
  assert.equal(report.summary.ofertas, 3);
  assert.equal(report.summary.lineas, 4);
  assert.equal(report.offers[0].ofertaId, "BAD");
  assert.equal(report.offers[0].costoCambio, true);
  assert.equal(report.offers.at(-1).estado, MARGIN_STATUS.SIN_COSTO);
  assert.equal(report.summary.porEstado.VERDE, 1);
  assert.equal(filterOffersByStatus(report.offers, "ROJO").length, 1);
});
