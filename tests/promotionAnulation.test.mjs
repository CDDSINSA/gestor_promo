import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createContext, SourceTextModule } from "node:vm";

async function loadPromotionAnulation() {
  const context = createContext({});
  const promoTypeEngine = new SourceTextModule(
    await readFile(new URL("../src/promoTypes/promoTypeEngine.js", import.meta.url), "utf8"),
    { context },
  );
  await promoTypeEngine.link(() => {
    throw new Error("Unexpected dependency");
  });
  await promoTypeEngine.evaluate();

  const module = new SourceTextModule(
    await readFile(new URL("../src/features/promotions/application/promotionAnulation.js", import.meta.url), "utf8"),
    { context },
  );
  await module.link((name) => {
    if (name === "../../../promoTypes/promoTypeEngine") return promoTypeEngine;
    throw new Error(`Unexpected dependency: ${name}`);
  });
  await module.evaluate();
  return module.namespace;
}

test("complex saved promotions are anulled as a complete offer", async () => {
  const { applyPromotionAnulation, getPromotionAnulationScope, isAnulledPromotion } = await loadPromotionAnulation();
  const rows = [
    { id: "r1", actividad_id: "CAT-1", tipo_promo: "Compra X lleva X", oferta_id: "OFE-1", sku: "100", version: 1 },
    { id: "r2", actividad_id: "CAT-1", tipo_promo: "Compra X lleva X", oferta_id: "OFE-1", sku: "200", version: 1 },
    { id: "r3", actividad_id: "CAT-1", tipo_promo: "Descuento", oferta_id: "OFE-2", sku: "300", version: 1 },
  ];

  const scope = getPromotionAnulationScope(rows[0], rows);
  const result = applyPromotionAnulation(rows, scope, (row) => row);

  assert.deepEqual(scope.map((row) => row.id), ["r1", "r2"]);
  assert.equal(result.length, 3);
  assert.equal(isAnulledPromotion(result[0]), true);
  assert.equal(isAnulledPromotion(result[1]), true);
  assert.equal(isAnulledPromotion(result[2]), false);
});

test("local unsaved rows are removed instead of anulled", async () => {
  const { applyPromotionAnulation, getPromotionAnulationScope } = await loadPromotionAnulation();
  const rows = [
    { id: "r1", actividad_id: "CAT-1", tipo_promo: "Combo", oferta_id: "OFE-1", sku: "100", version: 3 },
    { id: "r2", actividad_id: "CAT-1", tipo_promo: "Combo", oferta_id: "OFE-1", sku: "200" },
  ];

  const scope = getPromotionAnulationScope(rows[1], rows);
  const result = applyPromotionAnulation(rows, scope, (row) => row);

  assert.deepEqual(result.map((row) => row.id), ["r1"]);
  assert.equal(result[0].estado_registro, "ANULADO");
});
