import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createContext, SourceTextModule } from "node:vm";

async function loadModule(path, context, deps = {}) {
  const module = new SourceTextModule(await readFile(new URL(path, import.meta.url), "utf8"), { context });
  await module.link((name) => {
    if (deps[name]) return deps[name];
    throw new Error(`Unexpected dependency: ${name}`);
  });
  await module.evaluate();
  return module;
}

async function loadValidation() {
  const context = createContext({});
  const engine = await loadModule("../src/promoTypes/promoTypeEngine.js", context);
  const constants = await loadModule("../src/constants/promoConstants.js", context);
  const anulation = await loadModule("../src/features/promotions/application/promotionAnulation.js", context, { "../../../promoTypes/promoTypeEngine": engine });
  const segmentScope = await loadModule("../src/features/promotions/application/segmentScope.js", context);
  const service = await loadModule("../src/services/promotionValidationService.js", context, {
    "../constants": constants,
    "../promoTypes/promoTypeEngine": engine,
    "../features/promotions/application/promotionAnulation": anulation,
    "../features/promotions/application/segmentScope": segmentScope,
  });
  return service.namespace;
}

let seq = 0;
function umbral({ grupo = "umbral-1", sku = "100531212", cantidad = 1, descuento = "", precio = "" } = {}) {
  seq += 1;
  return {
    id: `ROW-${seq}`,
    actividad_id: "cat-1",
    comprador: "Emanuel Andino",
    tipo_promo: "Umbral",
    grupo_oferta: grupo,
    tipo_sku: "principal",
    oferta_id: `OFE-cat-1-umbral-12-${grupo.replace("-", "")}`,
    sku,
    cantidad_minima: cantidad,
    descuento,
    precio_ahora: precio,
  };
}

// Array.from: los arreglos del módulo vienen de otro contexto vm.
const codes = (issues) => Array.from(issues, (issue) => issue.code);

test("Umbral bien armado: un SKU con escalones crecientes no da errores ni avisos", async () => {
  const { validatePromotions } = await loadValidation();
  const result = validatePromotions([
    umbral({ cantidad: 1, descuento: "10%" }),
    umbral({ cantidad: 20, descuento: "15%" }),
    umbral({ cantidad: 30, descuento: "20%" }),
  ]);
  assert.deepEqual(codes(result.errors), []);
  assert.deepEqual(codes(result.warnings), []);
});

test("Umbral con 2 SKU distintos en la misma oferta bloquea el guardado", async () => {
  const { validatePromotions } = await loadValidation();
  const result = validatePromotions([
    umbral({ sku: "100531212", cantidad: 1, descuento: "10%" }),
    umbral({ sku: "100539759", cantidad: 20, descuento: "15%" }),
  ]);
  assert.deepEqual(codes(result.errors), ["umbral_multiple_skus", "umbral_multiple_skus"]);
  assert.equal(result.errors[0].field, "sku");
});

test("Umbral con cantidad mínima repetida bloquea el guardado", async () => {
  const { validatePromotions } = await loadValidation();
  const result = validatePromotions([
    umbral({ cantidad: 10, descuento: "10%" }),
    umbral({ cantidad: 10, descuento: "15%" }),
  ]);
  assert.deepEqual(codes(result.errors), ["umbral_duplicate_quantity", "umbral_duplicate_quantity"]);
});

test("Umbral sin cantidad mínima válida bloquea el guardado", async () => {
  const { validatePromotions } = await loadValidation();
  const result = validatePromotions([umbral({ cantidad: 0, descuento: "10%" }), umbral({ cantidad: 20, descuento: "15%" })]);
  assert.ok(codes(result.errors).includes("cantidad_minima"));
});

test("Caso real: 3 ofertas de un solo escalón desde 1 unidad dan aviso, no error", async () => {
  const { validatePromotions } = await loadValidation();
  const result = validatePromotions([
    umbral({ grupo: "umbral-1", sku: "100531212", cantidad: 1, descuento: "20%" }),
    umbral({ grupo: "umbral-2", sku: "100539759", cantidad: 1, descuento: "25%" }),
    umbral({ grupo: "umbral-3", sku: "100541648", cantidad: 1, descuento: "30%" }),
  ]);
  assert.deepEqual(codes(result.errors), []);
  assert.deepEqual(codes(result.warnings), ["umbral_single_level", "umbral_single_level", "umbral_single_level"]);
  assert.match(result.warnings[0].message, /descuento simple/);
});

test("Escalón que no mejora el beneficio da aviso (descuento y precio fijo)", async () => {
  const { validatePromotions } = await loadValidation();
  const byDiscount = validatePromotions([
    umbral({ cantidad: 1, descuento: "15%" }),
    umbral({ cantidad: 20, descuento: "10%" }),
  ]);
  assert.deepEqual(codes(byDiscount.warnings), ["umbral_benefit_not_improving"]);
  const byPrice = validatePromotions([
    umbral({ grupo: "umbral-2", cantidad: 1, precio: 250 }),
    umbral({ grupo: "umbral-2", cantidad: 12, precio: 260 }),
  ]);
  assert.deepEqual(codes(byPrice.warnings), ["umbral_benefit_not_improving"]);
  assert.deepEqual(codes(byPrice.errors), []);
});

test("Solo valida las filas dentro del alcance del guardado", async () => {
  const { validatePromotions } = await loadValidation();
  const rows = [umbral({ sku: "1", cantidad: 1, descuento: "10%" }), umbral({ sku: "2", cantidad: 20, descuento: "15%" })];
  const result = validatePromotions(rows, { scopeRowIds: [rows[0].id] });
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].rowId, rows[0].id);
});
