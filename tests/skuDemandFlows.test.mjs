import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";

async function graph(entry, react = {}) {
  const context = createContext({});
  const stub = (values) => new SyntheticModule(Object.keys(values), function () {
    for (const [key, value] of Object.entries(values)) this.setExport(key, value);
  }, { context });
  const icons = stub(Object.fromEntries(["CalendarDays", "Download", "FileSpreadsheet", "History", "Home", "Images", "ListChecks", "Percent", "Search", "Settings", "TrendingUp"].map((name) => [name, () => null])));
  const modules = new Map();
  const get = async (filename) => {
    if (!modules.has(filename)) modules.set(filename, readFile(filename, "utf8").then((source) => new SourceTextModule(source, { context, identifier: filename })));
    return modules.get(filename);
  };
  const root = await get(fileURLToPath(new URL(entry, import.meta.url)));
  await root.link(async (name, parent) => {
    if (name === "react") return stub(react);
    if (name === "lucide-react") return icons;
    const base = path.resolve(path.dirname(parent.identifier), name);
    // Acepta imports con o sin extensión ".js".
    return get([base + ".js", path.join(base, "index.js"), base].find((file) => existsSync(file) && statSync(file).isFile()));
  });
  await root.evaluate();
  return root.namespace;
}

test("bulk lookup extracts SKU columns, including all Megapack rewards, not quantities or prices", async () => {
  const bulk = await graph("../src/features/promotions/application/bulkImport.js");
  const codes = (text, type) => [...bulk.getBulkSkuCodes(text, bulk.getDefaultBulkColumnForPromoType(type) || "sku", type)];
  assert.deepEqual(codes("001\t10\n002\t20\n001\t30", "Descuento"), ["001", "002"]);
  assert.deepEqual(codes("SKU\tCant\tSKU2\tCant\tSKU3\tCant\tSKU4\tCant\tSKU5\tCant\n001\t2\t002\t1\t003\t3\t004\t4\t005\t5", "Megapack"), ["001", "002", "003", "004", "005"]);
  assert.deepEqual(codes("Rol\tSKU\tPrecio ahora\tDescuento\nprincipal\t010\t100\t\nregalia\t020\t0\t100", "Combo"), ["010", "020"]);
});

async function promos(lookup) {
  let rows = [{ id: "R1", sku: "old", descripcion: "Original", comentario: "Keep" }];
  let error = "";
  const module = await graph("../src/hooks/usePromos.js", {
    useRef: (value) => ({ current: value }),
    useState: () => [0, () => {}],
  });
  const hook = module.usePromos({
    setRows: (update) => { rows = update(rows); },
    lookupSkus: lookup,
    onLookupError: (value) => { error = value; },
    skuMaster: {}, normalizeRow: (row) => row,
    getMasterDivision: (master) => master.dep_id,
  });
  return { hook, rows: () => rows, error: () => error };
}

test("editing waits for BD and fills all master fields while keeping other edits", async () => {
  let resolve;
  const h = await promos(() => new Promise((done) => { resolve = done; }));
  const pending = h.hook.updateRow("R1", "sku", "001");
  assert.equal(h.rows()[0].sku, "old");
  await h.hook.updateRow("R1", "comentario", "New note");
  resolve({ "001": { descripcion: "BD", vpn: "VPN", dep_id: "12", precio: 0 } });
  await pending;
  assert.equal(h.rows()[0].sku, "001");
  assert.equal(h.rows()[0].descripcion, "BD");
  assert.equal(h.rows()[0].num_parte, "VPN");
  assert.equal(h.rows()[0].dep_id, "12");
  assert.equal(h.rows()[0].precio_antes, 0);
  assert.equal(h.rows()[0].comentario, "New note");
});

test("a late SKU edit cannot overwrite the newest selection", async () => {
  let resolve;
  const h = await promos((skus) => skus[0] === "001" ? new Promise((done) => { resolve = done; }) : Promise.resolve({ "002": { descripcion: "Second" } }));
  const first = h.hook.updateRow("R1", "sku", "001");
  await h.hook.updateRow("R1", "sku", "002");
  resolve({ "001": { descripcion: "First" } });
  await first;
  assert.equal(h.rows()[0].sku, "002");
  assert.equal(h.rows()[0].descripcion, "Second");
});

test("a failed lookup preserves the row and reports an error", async () => {
  const h = await promos(async () => { throw new Error("BD unavailable"); });
  await h.hook.updateRow("R1", "sku", "001");
  assert.equal(h.rows()[0].sku, "old");
  assert.equal(h.rows()[0].descripcion, "Original");
  assert.equal(h.error(), "BD unavailable");
});

test("SKU lookup adds 15 percent IVA to the master price", async () => {
  const h = await promos(async () => ({ "001": { precio: 100 } }));
  await h.hook.updateRow("R1", "sku", "001");
  assert.equal(h.rows()[0].precioAntes, 115);
  assert.equal(h.rows()[0].precio_antes, 115);
});

test("discount rows fill missing prices with IVA and preserve explicit prices", async () => {
  const { toAppRow } = await graph("../src/features/promotions/application/promoGridRows.js");
  const { priceWithIva } = await graph("../src/features/promotions/application/promoPrices.js");
  const base = { id: "R1", tipo_promo: "Descuento", precio_antes: priceWithIva(100), descuento: "20%" };
  const row = toAppRow(base);
  assert.equal(row.precioAntes, 115);
  assert.equal(row.precioAhora, 92);
  assert.equal(row.precio_ahora, 92);
  assert.equal(toAppRow(row).precioAntes, 115);
  assert.equal(toAppRow(row).precioAhora, 92);
  for (const price of [0, 80, "85.50"]) {
    assert.equal(toAppRow({ ...base, precio_ahora: price }).precioAhora, price);
  }
  assert.equal(toAppRow({ ...base, descuento: "100%" }).precioAhora, 0);
  assert.equal(toAppRow({ ...base, descuento: "0%" }).precioAhora, 115);
  assert.equal(toAppRow({ ...base, descuento: "12,5%" }).precioAhora, 100.63);
  for (const discount of ["", "invalid", "101%", "-1%"]) {
    assert.equal(toAppRow({ ...base, descuento: discount }).precioAhora, "");
  }
  assert.equal(toAppRow({ ...base, precio_antes: "" }).precioAhora, "");
  for (const tipo_promo of ["Precio fijo", "Combo", "Umbral"]) {
    assert.equal(toAppRow({ ...base, tipo_promo }).precioAhora, "");
  }
  assert.equal(priceWithIva(null), "");
  assert.equal(priceWithIva(0), 0);
  assert.equal(priceWithIva("19.99"), 22.99);
});
