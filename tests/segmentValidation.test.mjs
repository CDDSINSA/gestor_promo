import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";

// Carga módulos con imports sin extensión (igual que airesCombo.test.mjs).
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
  const root = await get(fileURLToPath(new URL(entry, import.meta.url)));
  await root.link(async (name, parent) => {
    if (name === "react") return stub({ createContext: () => ({}), useContext: () => null });
    if (name === "lucide-react") return stub(Object.fromEntries(["CalendarDays", "Download", "FileSpreadsheet", "History", "Home", "Images", "ListChecks", "Percent", "Search", "Settings", "TrendingUp"].map((icon) => [icon, () => null])));
    const base = path.resolve(path.dirname(parent.identifier), name);
    return get([base + ".js", path.join(base, "index.js"), base].find((file) => existsSync(file) && statSync(file).isFile()));
  });
  await root.evaluate();
  return root.namespace;
}

const { validatePromotions } = await load("../src/services/promotionValidationService.js");
const bulk = await load("../src/features/promotions/application/bulkImport.js");
const codes = (issues) => Array.from(issues, (issue) => issue.code);

let seq = 0;
function promo({ tipo = "Descuento", sku = "100531212", segmento = "", comprador = "Marcela Torres", alcance = "CANAL", alcanceValor = "Comasa", descuento = "5%", precio = "" } = {}) {
  seq += 1;
  return {
    id: `ROW-${seq}`,
    actividad_id: "ESP-20261027-001",
    comprador,
    tipo_promo: tipo,
    tipo_sku: "simple",
    oferta_id: `OFE-${seq}`,
    sku,
    descuento: tipo === "Descuento" ? descuento : "",
    precio_ahora: tipo === "Precio fijo" ? precio || "250" : "",
    aplica_segmento: segmento ? "SI" : "NO",
    segmento_cliente: segmento,
    alcance_tipo: alcance,
    alcance_valor: alcanceValor,
  };
}

test("mismo SKU con beneficios distintos por segmento: válido", () => {
  const result = validatePromotions([
    promo({ segmento: "1002 | 1103", descuento: "5%" }),
    promo({ segmento: "1003", descuento: "6%" }),
    promo({ segmento: "1102", descuento: "4%" }),
    promo({ segmento: "1104 | 1105", descuento: "3%" }),
  ]);
  assert.deepEqual(codes(result.errors), []);
});

test("mismo SKU con dos beneficios para un mismo segmento: error en ambas filas", () => {
  const result = validatePromotions([
    promo({ segmento: "1002 | 1003", descuento: "5%" }),
    promo({ segmento: "1003", descuento: "6%" }),
  ]);
  assert.deepEqual(codes(result.errors), ["duplicate_segment_benefit_sku", "duplicate_segment_benefit_sku"]);
  assert.match(result.errors[0].message, /segmento 1003/);
});

test("Descuento y Precio fijo del mismo SKU: permitido con segmentos distintos, error si se cruzan", () => {
  const ok = validatePromotions([promo({ tipo: "Descuento", segmento: "1002" }), promo({ tipo: "Precio fijo", segmento: "1003" })]);
  assert.deepEqual(codes(ok.errors), []);
  const clash = validatePromotions([promo({ tipo: "Descuento", segmento: "1002 | 1003" }), promo({ tipo: "Precio fijo", segmento: "1003" })]);
  assert.deepEqual(codes(clash.errors), ["duplicate_discount_fixed_price_sku", "duplicate_discount_fixed_price_sku"]);
  const general = validatePromotions([promo({ tipo: "Descuento" }), promo({ tipo: "Precio fijo" })]);
  assert.deepEqual(codes(general.errors), ["duplicate_discount_fixed_price_sku", "duplicate_discount_fixed_price_sku"]);
});

test("general y segmentado del mismo SKU no chocan", () => {
  const result = validatePromotions([promo({ descuento: "5%" }), promo({ segmento: "1002", descuento: "8%" })]);
  assert.deepEqual(codes(result.errors), []);
});

test("mismo SKU general en dos compradores distintos no es error", () => {
  const result = validatePromotions([promo({ comprador: "A" }), promo({ comprador: "B" })]);
  assert.deepEqual(codes(result.errors), []);
});

test("alcance SEGMENTO viejo: el segmento de la fila puede ser distinto al de la solicitud", () => {
  const result = validatePromotions([promo({ alcance: "SEGMENTO", alcanceValor: "1002 | 1003", segmento: "1102" })]);
  assert.deepEqual(codes(result.errors), []);
  const empty = validatePromotions([{ ...promo({ alcance: "SEGMENTO", alcanceValor: "1002", segmento: "" }), aplica_segmento: "SI" }]);
  assert.ok(codes(empty.errors).includes("segmento_cliente"));
});

test("pegado con encabezado: la columna Segmento no se lee como precio", () => {
  const withSegment = bulk.getSimplePasteLayout(["SKU", "Descuento", "Segmento"], "descuento");
  assert.equal(withSegment.segment, 2);
  assert.equal(withSegment.optional, -1);
  const full = bulk.getSimplePasteLayout(["sku", "descuento", "Ahora c/iva", "Comentario", "Página", "Segmento"], "descuento");
  assert.deepEqual([full.sku, full.value, full.optional, full.comment, full.page, full.segment], [0, 1, 2, 3, 4, 5]);
  const fixed = bulk.getSimplePasteLayout(["Codigo", "Ahora c/IVA", "Segmentos"], "precioAhora");
  assert.deepEqual([fixed.sku, fixed.value, fixed.optional, fixed.segment], [0, 1, -1, 2]);
  const legacy = bulk.getSimplePasteLayout(["100531212", "5%", "1002"], "descuento");
  assert.equal(legacy.hasHeader, false);
  assert.equal(legacy.optional, 2);
  assert.equal(legacy.segment, -1);
});

test("aviso de carga bloqueada por precio sobre el regular o segmento inexistente", () => {
  const preview = bulk.withDiscountLimitNotice([
    { index: 1, sku: "1", blocking: true, blockReason: "precio_regular" },
    { index: 2, sku: "2", blocking: true, blockReason: "segmento" },
  ]);
  assert.equal(preview[0].index, "Aviso");
  assert.match(preview[0].descripcion, /mayor al precio regular/);
  assert.match(preview[0].descripcion, /segmentos que no existen/);
});
