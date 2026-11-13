import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";

// Exercise the real HTTP pagination and master mapper without a live database.
async function createLoader(request) {
  const context = createContext({ URLSearchParams });
  function stub(values) {
    return new SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context });
  }
  const config = stub({
    SELECT_PAGE_SIZE: 2,
    assertOk: async (response) => response,
    cleanText: (value) => String(value ?? "").trim(),
    fetchWithTimeout: request,
    getAnonKey: () => "anon",
    getHeaders: (_, token, extra) => ({ Authorization: `Bearer ${token}`, ...extra }),
    getSupabaseUrl: () => "https://database.example",
  });
  const session = stub({ ensureFreshAppSession: async (_, value) => value });
  const http = new SourceTextModule(await readFile(new URL("../src/services/supabase/http.js", import.meta.url), "utf8"), { context });
  await http.link((name) => name === "./config" ? config : session);
  const master = new SourceTextModule(await readFile(new URL("../src/services/supabase/skuMaster.js", import.meta.url), "utf8"), { context });
  await master.link(() => http);
  await master.evaluate();
  return master.namespace.loadSkuMasterBySkusFromSupabase;
}

const connection = { session: { access_token: "user-token" } };

test("queries only requested SKUs with pagination and all article fields", async () => {
  const calls = [];
  const load = await createLoader(async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1
      ? [{ sku: "001", descripcion: "A", precio_regular: 0, dep_id: "12", num_parte: "VPN", proveedor: "P", unidad_medida: "EA" }, { sku: "002", precio_regular: 10 }]
      : [{ sku: "003", actualizado_el: "2026-09-09" }];
  });
  const result = await load(connection, ["001", "002", "003"]);
  assert.equal(result.skuMasterCount, 3);
  assert.equal(result.skuMaster["001"].precio, 0);
  assert.equal(result.skuMaster["001"].vpn, "VPN");
  assert.equal(result.skuMaster["001"].dep_id, "12");
  assert.equal(result.skuMaster["001"].proveedor, "P");
  assert.equal(result.skuMaster["001"].unidad_medida, "EA");
  assert.deepEqual(calls.map(({ options }) => options.headers.Range), ["0-1", "2-3"]);
  assert.ok(calls.every(({ url, options }) => new URL(url).searchParams.get("sku").startsWith("in.(") && options.headers.Authorization === "Bearer user-token"));
});

test("empty requests never query and large requests remain filtered and bounded", async () => {
  const calls = [];
  const load = await createLoader(async (url) => { calls.push(url); return []; });
  await load(connection);
  assert.equal(calls.length, 0);
  await load(connection, Array.from({ length: 220 }, (_, i) => `SKU-${i}`));
  assert.equal(calls.length, 3);
  assert.ok(calls.every((url) => new URL(url).searchParams.get("sku").split(",").length <= 100));
});

test("exact SKU wins and unambiguous zero aliases retain all fields", async () => {
  const load = await createLoader(async () => [{ sku: "00001", descripcion: "Article", precio_regular: 0 }]);
  const result = await load(connection, ["1", "01"]);
  assert.equal(result.skuMaster["1"].sku, "00001");
  assert.equal(result.skuMaster["01"].precio, 0);
  let count = 0;
  const ambiguous = await createLoader(async () => ++count === 1 ? [{ sku: "00001", descripcion: "A" }, { sku: "000001", descripcion: "B" }] : []);
  const other = await ambiguous(connection, ["1", "00001"]);
  assert.equal(other.skuMaster["1"], undefined);
  assert.equal(other.skuMaster["00001"].descripcion, "A");
});

test("invalid responses and network errors propagate; auth is required", async () => {
  const invalid = await createLoader(async () => ({ error: "bad response" }));
  await assert.rejects(() => invalid(connection, ["001"]), /respuesta inválida/);
  const unavailable = await createLoader(async () => { throw new Error("BD no disponible"); });
  await assert.rejects(() => unavailable(connection, ["001"]), /BD no disponible/);
  await assert.rejects(() => unavailable({}, ["001"]), /sesión activa/);
});

test("cancellation reaches paginated filtered requests", async () => {
  const controller = new AbortController();
  let calls = 0;
  const load = await createLoader(async (_, options) => {
    calls++;
    assert.equal(options.signal, controller.signal);
    if (calls === 1) return [{ sku: "001" }, { sku: "002" }];
    return new Promise((_, reject) => {
      options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
      controller.abort();
    });
  });
  await assert.rejects(() => load(connection, ["001", "002"], { signal: controller.signal }), { name: "AbortError" });
});
