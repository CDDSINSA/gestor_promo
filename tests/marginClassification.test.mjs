import assert from "node:assert/strict";
import { test } from "node:test";
import { attachAbcClassification, describeOfferAbc, formatAbcCode, marginSkuKey } from "../src/features/margins/marginClassification.js";

const map = { bySku: new Map([["00123", 5], ["777", 11]]), byKey: new Map([["123", 5], ["777", 11]]) };

test("clave de SKU igual a margen_sku_key", () => {
  assert.equal(marginSkuKey(" 00123 "), "123");
  assert.equal(marginSkuKey("000"), "0");
  assert.equal(marginSkuKey("AB-01"), "AB-01");
});

test("asigna clasificación exacta, por clave sin ceros y 8 (Nuevo) por defecto", () => {
  const lines = attachAbcClassification([{ sku: "00123" }, { sku: "123" }, { sku: "777" }, { sku: "999" }], map);
  assert.deepEqual(lines.map((line) => line.clasificacion_abc), [5, 5, 11, 8]);
});

test("sin tabla de clasificación no inventa una clasificación", () => {
  const [line] = attachAbcClassification([{ sku: "1" }], null);
  assert.equal(line.clasificacion_abc, null);
  assert.equal(formatAbcCode(null), "—");
});

test("resumen por oferta: una o varias clasificaciones", () => {
  assert.deepEqual(describeOfferAbc({ lineas: [{ clasificacion_abc: 5 }, { clasificacion_abc: 5 }] }), { label: "5 · A", detail: "" });
  assert.deepEqual(describeOfferAbc({ lineas: [{ clasificacion_abc: 4 }, { clasificacion_abc: 1 }, { clasificacion_abc: 3 }] }), { label: "Varias", detail: "AA, Descontinuado, B" });
  assert.deepEqual(describeOfferAbc({ lineas: [{ clasificacion_abc: null }] }), { label: "—", detail: "" });
});

test("etiqueta de departamento con nombre de jerarquía o código", async () => {
  const { attachDepartmentNames, departmentLabel } = await import("../src/features/margins/marginClassification.js");
  const names = new Map([["131", "Cocina"], ["140", "140-Pinturas"]]);
  assert.equal(departmentLabel("131", names), "131-Cocina");
  assert.equal(departmentLabel("140", names), "140-Pinturas");
  assert.equal(departmentLabel("999", names), "Depto. 999");
  assert.equal(departmentLabel("", names), "");
  assert.equal(departmentLabel("131", null), "Depto. 131");
  assert.deepEqual(attachDepartmentNames([{ sku: "1", dep_id: "131" }], names), [{ sku: "1", dep_id: "131", departamento: "131-Cocina" }]);
});
