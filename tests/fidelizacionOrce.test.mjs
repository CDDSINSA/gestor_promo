import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOrceReportRows, buildOrcePreview } from "../src/features/fidelizacion/orceReconciliation.js";

const segments = [{ segmento_id: "1102", canal: "Comasa", activo: true }, { segmento_id: "1001", canal: "Retail", activo: true }];
const headers = ["Id de oferta", "Id de promo", "Descripción", "Fecha inicial", "Fecha final", "Ubicación", "Articulo", "Descripción de articulo", "Tipo Oferta", "Cantidad", "Selling unit retail", "Detail change amount", "Detail change percent", "Tipo de Descuento", "Atributo promoción", "Segmento"];
const data = (sku = "001009", discount = "17.5", promo = "1857", offer = "38236", seg = "45 - Segmento COMASA 1102") =>
  [offer, promo, "COM temp", "2026-08-17T00:00:00.000+00:00", "2027-01-31T00:00:00.000+00:00", "5", sku, "Artículo", "LINE_ITEM_DISCOUNT", "", "", "", discount, "PERCENT_OFF", "", seg];
const parse = (rows, catalog = segments) => parseOrceReportRows([[], [" "], headers, Array(16).fill(""), ...rows], catalog, "2026-10-01");

test("ORCE report locates header at row 3 and reads IDs, SKU, points and segment", () => {
  const report = parse([data()]);
  assert.equal(report.rows[0].source_row, 5);
  assert.equal(report.rows[0].sku, "001009");
  assert.equal(report.rows[0].segmento_id, "1102");
  assert.equal(report.rows[0].canal, "comasa");
  assert.equal(report.rows[0].oferta_id_orce, "38236");
  assert.equal(report.rows[0].promo_id_orce, "1857");
  assert.equal(report.rows[0].descuento, 17.5);
  assert.equal(report.rows[0].status, "LISTO");
});

test("Identical combinations deduplicate independent of location; different SKU can share IDs", () => {
  const otherLocation = data(); otherLocation[5] = "19";
  const report = parse([data(), otherLocation, data("002008")]);
  assert.equal(report.sourceRows, 3); assert.equal(report.duplicateCount, 1); assert.equal(report.rows.length, 2);
  assert.ok(report.rows.every((r) => r.status === "LISTO"));
});

test("Contradictory discounts or ID pairs block the entire combination, including invalid duplicates", () => {
  for (const other of [data("001009", "25"), data("001009", "17.5", "9"), data("001009", "17.5", "1857", "7"), data("001009", "abc")]) {
    const report = parse([data(), other]);
    assert.equal(report.rows.length, 1); assert.equal(report.rows[0].status, "CONFLICTO");
  }
});

test("Dates are informational, channel comes from catalog, malformed data never matches", () => {
  const future = data(); future[3] = "2030-01-01";
  const expired = data("2"); expired[4] = "2020-01-01";
  const report = parse([future, expired, data("3", "0,5", "1", "2", "Segmento RETAIL 1001")]);
  assert.ok(report.rows.every((r) => r.status === "LISTO"));
  assert.deepEqual(report.rows[0].warnings, ["Vigencia futura"]);
  assert.deepEqual(report.rows[1].warnings, ["Vigencia vencida"]);
  assert.equal(report.rows[2].canal, "retail"); assert.equal(report.rows[2].descuento, 0.5);
  for (const row of [data("", "20"), data("1", "101"), data("1", ""), data("1", "20", "abc"), data("1", "20", "1", "2", "Segmento 9999"), data("1", "20", "1", "2", "Retail 1102")]) {
    assert.equal(parse([row]).rows[0].status, "INVALIDO");
  }
  const money = data(); money[13] = "AMOUNT_OFF";
  assert.equal(parse([money]).rows[0].status, "INVALIDO");
});

test("Preview only updates existing exact discounts; snapshots revision and preserves absent records", () => {
  const report = parse([data(), data("2", "20"), data("3", "0"), data("4", "25")]);
  const canasto = [
    { sku: "001009", canal: "comasa", segmento_id: "1102", descuento: 17.5, revision_orce: 4 },
    { sku: "2", canal: "comasa", segmento_id: "1102", descuento: 15, revision_orce: 0 },
    { sku: "3", canal: "comasa", segmento_id: "1102", descuento: 0, revision_orce: 2, promo_id_orce: "1857", oferta_id_orce: "38236", estado_conciliacion_orce: "NO_APLICA" },
    { sku: "not-in-file", canal: "comasa", segmento_id: "1102", descuento: 20 },
  ];
  const snapshot = JSON.stringify(canasto);
  const preview = buildOrcePreview(report, canasto);
  assert.deepEqual(preview.rows.map((r) => r.status), ["LISTO", "DESCUENTO_DISTINTO", "SIN_CAMBIO", "NO_ENCONTRADO"]);
  assert.equal(preview.rows[0].revision_esperada, 4);
  assert.equal(JSON.stringify(canasto), snapshot);
});
