import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOfferMovements } from "../src/features/fidelizacion/offerMovement.js";

const row = (overrides = {}) => ({ canal: "comasa", segmento_id: "1102", sku: "00123", descuento: 20,
  promo_id_orce: "100", oferta_id_orce: "200", estado_conciliacion_orce: "CONCILIADO", estatus: "Activo", ...overrides });
const delta = (overrides = {}) => ({ canal: "comasa", segmento_id: "1102", sku: "00123",
  descuento_anterior: 20, descuento_solicitado: 25, tipo_cambio: "SUBE", ...overrides });

test("Alza y baja usan el origen exacto del SKU y destino de otro SKU", () => {
  for (const discount of [15, 25]) {
    const [movement] = buildOfferMovements([delta({ descuento_solicitado: discount, tipo_cambio: discount > 20 ? "SUBE" : "BAJA" })],
      [row(), row({ sku: "other", descuento: discount, oferta_id_orce: "300" })]);
    assert.deepEqual(movement.oferta_origen.ids, ["200"]);
    assert.deepEqual(movement.oferta_destino.ids, ["300"]);
  }
});

test("Nuevo y reactivación no retiran; desactivación no registra; sin cambio no mueve", () => {
  const changes = [delta({ sku: "new", descuento_anterior: 0, tipo_cambio: "NUEVO" }),
    delta({ descuento_anterior: 0 }), delta({ descuento_solicitado: 0, tipo_cambio: "ELIMINA" }),
    delta({ descuento_solicitado: 20, tipo_cambio: "SIN_CAMBIO" })];
  const movements = buildOfferMovements(changes, [row(), row({ sku: "other", descuento: 25, oferta_id_orce: "300" })]);
  assert.equal(movements[0].oferta_origen.status, "NO_APLICA");
  assert.deepEqual(movements[0].oferta_destino.ids, ["300"]);
  assert.equal(movements[1].oferta_origen.status, "NO_APLICA");
  assert.deepEqual(movements[2].oferta_origen.ids, ["200"]);
  assert.equal(movements[2].oferta_destino.status, "NO_APLICA");
  assert.equal(movements[3].oferta_origen.status, "NO_APLICA");
  assert.equal(movements[3].oferta_destino.status, "NO_APLICA");
});

test("Aísla canal, segmento, porcentaje y SKU de origen sin perder ceros iniciales", () => {
  const [movement] = buildOfferMovements([delta()], [row({ sku: "123" }),
    row({ descuento: 25, canal: "retail" }), row({ descuento: 25, segmento_id: "1103" }), row({ descuento: 24.99 })]);
  assert.equal(movement.oferta_origen.status, "SIN_IDENTIFICAR");
  assert.equal(movement.oferta_destino.status, "SIN_IDENTIFICAR");
});

test("No usa IDs pendientes, retenidos a cero, inválidos o filas inactivas", () => {
  const excluded = [row({ estado_conciliacion_orce: "PENDIENTE" }), row({ estado_conciliacion_orce: "NO_APLICA" }),
    row({ oferta_id_orce: "abc" }), row({ promo_id_orce: null }), row({ estatus: "Inactivo" }), row({ descuento: 0 })];
  const [movement] = buildOfferMovements([delta()], excluded);
  assert.equal(movement.oferta_origen.status, "SIN_IDENTIFICAR");
  assert.equal(movement.oferta_destino.status, "SIN_IDENTIFICAR");
});

test("Deduplica ofertas repetidas y muestra todas las alternativas sin seleccionar", () => {
  const [movement] = buildOfferMovements([delta()], [row({ descuento: 25, oferta_id_orce: "300" }),
    row({ descuento: 25, sku: "other", oferta_id_orce: "300" }), row({ descuento: 25, oferta_id_orce: "400" })]);
  assert.deepEqual(movement.oferta_destino, { ids: ["300", "400"], status: "MULTIPLE" });
});

test("Normaliza porcentajes a centésimas; ignora vigencia y no muta datos", () => {
  const changes = [delta({ canal: " COMASA ", descuento_solicitado: "0,50" })];
  const basket = [row({ descuento: 0.5, oferta_id_orce: "300", fecha_final: "2000-01-01", estatus: "En proceso" })];
  const snapshot = JSON.stringify([changes, basket]);
  assert.deepEqual(buildOfferMovements(changes, basket)[0].oferta_destino.ids, ["300"]);
  assert.equal(JSON.stringify([changes, basket]), snapshot);
});

test("Sin conciliación o sin datos no inventa ofertas", () => {
  const [movement] = buildOfferMovements([delta()], []);
  assert.equal(movement.oferta_origen.status, "SIN_IDENTIFICAR");
  assert.equal(movement.oferta_destino.status, "SIN_IDENTIFICAR");
  assert.deepEqual(buildOfferMovements(), []);
});
