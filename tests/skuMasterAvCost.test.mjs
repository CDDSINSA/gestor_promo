import assert from "node:assert/strict";
import { test } from "node:test";
import { detectColumnIndices, parseSkuMasterRows } from "../src/features/skuMaster/skuMasterParser.js";
import { describeCostOrigin } from "../src/features/margins/marginPresentation.js";

const HEADER = ["ITEM", "B", "C", "ITEM_DESC", "DEPT", "F", "G", "STANDARD_UOM", "I", "J", "SUP_NAME", "L", "UNIT_RETAIL", "N", "VPN", "UNIT_COST", "ORIGIN_COUNTRY_ID", "AV_COST"];

test("el costo sale de AV_COST, no de UNIT_COST", () => {
  const cols = detectColumnIndices(HEADER);
  assert.equal(cols.av_cost, 17);
  assert.equal("unit_cost" in cols, false);
  assert.equal("origin_country_id" in cols, false);
});

test("AV_COST se guarda tal cual en C$ (sin conversión ni origen)", () => {
  const row = ["123", "", "", "Taladro", "10", "", "", "EA", "", "", "Prov", "", "1150", "", "VPN1", "999", "CN", "650.5"];
  const result = parseSkuMasterRows([HEADER, row]);
  assert.equal(result.hasCostColumn, true);
  assert.equal(result.costCount, 1);
  assert.equal(result.rows[0].av_cost, 650.5);
  assert.equal("unit_cost" in result.rows[0], false);
  assert.equal("origin_country_id" in result.rows[0], false);
});

test("sin columna AV_COST no toma otra columna de costo", () => {
  const header = HEADER.slice(0, 17);
  const row = ["123", "", "", "Taladro", "10", "", "", "EA", "", "", "Prov", "", "1150", "", "VPN1", "999", "NI"];
  const result = parseSkuMasterRows([header, row]);
  assert.equal(result.hasCostColumn, false);
  assert.equal(result.costCount, 0);
  assert.equal(result.rows[0].av_cost, null);
});

test("encabezado alterno 'Costo promedio' también se reconoce", () => {
  assert.equal(detectColumnIndices(["SKU", "Costo promedio"]).av_cost, 1);
});

test("el origen del costo ya no menciona dólares ni tasa", () => {
  assert.equal(describeCostOrigin({ costoUnit: 10, fuente_costo: "CAPTURA" }), "AV_COST al crear");
  assert.equal(describeCostOrigin({ costoUnit: 10, fuente_costo: "COMPLETADO" }), "AV_COST en carga del maestro");
  assert.equal(describeCostOrigin({ costoUnit: null }), "Sin costo");
});

