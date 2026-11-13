import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";
import * as XLSX from "xlsx";
import * as permissions from "../src/constants/permissions.js";

async function service({ remoteRows = [], excelFallback = false, local = false } = {}) {
  const queries = [];
  const downloads = [];
  const storage = new Map();
  const context = createContext({ console, ArrayBuffer, crypto: { randomUUID }, localStorage: {
    getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value),
  } });
  const stub = async (exports) => {
    const m = new SyntheticModule(Object.keys(exports), function () {
      for (const [k, v] of Object.entries(exports)) this.setExport(k, v);
    }, { context });
    await m.link(() => {}); await m.evaluate(); return m;
  };
  const http = new SourceTextModule(await readFile(new URL("../src/services/supabase/http.js", import.meta.url), "utf8"), { context });
  context.URLSearchParams = URLSearchParams;
  await http.link((name) => name.includes("session")
    ? stub({ ensureFreshAppSession: async () => ({ access_token: "test" }) })
    : stub({ SELECT_PAGE_SIZE: 1000, assertOk: (x) => x, cleanText: String,
      getAnonKey: () => "test", getHeaders: (_c, _t, h) => h, getSupabaseUrl: () => "https://example.test",
      fetchWithTimeout: async (url, options) => {
        queries.push({ url, options });
        const [start, end] = (options.headers.Range || `0-${new URL(url).searchParams.get("limit") - 1}`).split("-").map(Number);
        return remoteRows.slice(start, end + 1);
      },
    }));
  await http.evaluate();
  const m = new SourceTextModule(await readFile(new URL("../src/services/fidelizacionService.js", import.meta.url), "utf8"), {
    context,
    importModuleDynamically: async (name) => name === "exceljs" ? stub({ default: (await import("exceljs")).default }) : http,
  });
  await m.link((name) => {
    if (name.includes("permissions")) return stub(permissions);
    if (name.includes("seedData")) return stub({ canastoFidelizacionInicial: [], segmentosClientesIniciales: [] });
    if (name.includes("excelService")) return stub({ loadXlsx: async () => {
      if (excelFallback) throw new Error("Test fallback");
      return { ...XLSX, writeFile: (workbook) => downloads.push(workbook) };
    } });
    if (name.includes("promoHelpers")) return stub({ formatDateKey: () => "20261001" });
    if (name === "./supabase") return stub({ hasSupabaseConnection: () => !local });
    throw new Error(name);
  });
  await m.evaluate();
  return { api: m.namespace, queries, downloads };
}

function workbook(rows, percentCells = []) {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  // Display precision must not turn the underlying 0.5% into 1%.
  percentCells.forEach((cell) => { sheet[cell].z = '0%'; });
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Plantilla");
  const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" });
  return { arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) };
}

test("Percentages are normalized once; blank means unchanged and invalid values fail", async () => {
  const { api } = await service();
  for (const v of [0.5, "0.5", "0.5%", "0,5%", "0,5"]) assert.equal(api.cleanDiscountValue(v), 0.5);
  assert.equal(api.cleanDiscountValue(1), 1);
  assert.equal(api.cleanDiscountValue("100%"), 100);
  for (const v of [null, undefined, "", " "]) assert.equal(api.cleanDiscountValue(v), null);
  for (const v of ["abc", "20foo", "101", -1, Infinity, "1%2"]) assert.throws(() => api.cleanDiscountValue(v));
});

for (const excelFallback of [false, true]) test(`Excel preserves 0.5% and 100%, blanks, and SKU text (fallback=${excelFallback})`, async () => {
  const { api } = await service({ excelFallback });
  const parsed = await api.parseFidelizacionExcel(workbook([
    ["Sku", "1002", "1003", "1004"], ["00123", 0.005, 1, ""], ["456", "0,5%", 0, 20],
  ], ["B2", "C2"]), ["1002", "1003", "1004"]);
  assert.equal(parsed.items[0].sku, "00123");
  assert.equal(parsed.items[0].segments["1002"], 0.5);
  assert.equal(parsed.items[0].segments["1003"], 100);
  assert.equal("1004" in parsed.items[0].segments, false);
  const deltas = api.calculateFidelizacionDeltas({ parsedItems: parsed.items });
  assert.equal(deltas.deltas.find((d) => d.sku === "00123" && d.segmento_id === "1002").descuento_solicitado, 0.5);
});

test("Excel rejects unknown segments, duplicate SKUs/segments and invalid discounts", async () => {
  const { api } = await service();
  for (const rows of [
    [["Sku", "9999"], ["A", 20]],
    [["Sku", "1002", "1002"], ["A", 20, 30]],
    [["Sku", "1002"], ["A", 20], ["A", 30]],
    [["Sku", "1002"], ["A", "abc"]],
    [["Sku", "1002"], ["A", 101]],
  ]) await assert.rejects(api.parseFidelizacionExcel(workbook(rows), ["1002"]));
});

test("Only actual changes are staged; explicit zero removes, omitted values preserve", async () => {
  const { api } = await service();
  const currentCanasto = [1, 2, 3, 4].map((segmento_id) => ({ sku: "A", segmento_id, descuento: 20 }));
  const result = api.calculateFidelizacionDeltas({ currentCanasto,
    parsedItems: [{ sku: "A", segments: { 1: "", 2: 20, 3: 0, 4: 0.5 } }],
  });
  assert.equal(result.deltas.length, 2);
  assert.equal(result.deltas[0].tipo_cambio, "ELIMINA");
  assert.equal(result.deltas[1].descuento_solicitado, 0.5);
  assert.equal(result.deltas[1].tipo_cambio, "BAJA");
});

test("Canasto and request details load beyond old limits through real HTTP pagination", async () => {
  const remoteRows = Array.from({ length: 16001 }, (_, n) => ({ sku: String(n), segmento_id: "1002" }));
  const { api, queries } = await service({ remoteRows });
  const connection = { appUser: { rol: "BUYER" } };
  assert.equal((await api.loadCanastoFidelizacion(connection)).length, 16001);
  assert.equal((await api.loadSolicitudFidelizacionDetalle(connection, "FID-A")).length, 16001);
  assert.ok(queries.length > 30);
  assert.ok(queries.every((q) => !new URL(q.url).searchParams.has("limit")));
});

test("Independent sessions generate different request IDs and unchanged rows are not exported", async () => {
  const { api, downloads } = await service();
  assert.notEqual(api.createFidelizacionActivityId([]), api.createFidelizacionActivityId([]));
  await api.exportFidelizacionOrce([
    { sku: "A", segmento_id: "1002", descuento_solicitado: 0.5, tipo_cambio: "BAJA", promo_id_orce: "1234", oferta_id_orce: "5678" },
    { sku: "B", tipo_cambio: "SIN_CAMBIO" },
  ]);
  const rows = XLSX.utils.sheet_to_json(downloads[0].Sheets.CARGA_ORCE);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]["VALOR_NUMERICO"], 0.005);
  assert.equal(rows[0]["ID_PROMO"], "1234");
  assert.equal(rows[0]["ID_OFERTA"], "5678");
});

test("Stale pending requests cannot be exported to ORCE", async () => {
  const { api } = await service({ remoteRows: [{ sku: "A", segmento_id: "1002", canal: "comasa",
    descuento: 25, descuento_anterior: 20, descuento_solicitado: 10, tipo_cambio: "BAJA", estado: "PENDIENTE" }] });
  await assert.rejects(api.loadFidelizacionExport({ appUser: { rol: "BUYER" } }, "FID-A"), /canasto cambió/);
});

test("Local request storage is isolated by user and refuses duplicate or empty requests", async () => {
  const { api } = await service({ local: true });
  const a = { appUser: { rol: "BUYER", id: "buyer-a" } };
  const b = { appUser: { rol: "BUYER", id: "buyer-b" } };
  const request = { actividadId: "FID-A", deltas: [{ sku: "A", segmento_id: "1002", descuento_anterior: 0, descuento_solicitado: 0.5, tipo_cambio: "NUEVO" }] };
  await api.createSolicitudFidelizacion(a, request);
  assert.equal((await api.loadSolicitudFidelizacionDetalle(a, "FID-A")).length, 1);
  assert.equal((await api.loadSolicitudFidelizacionDetalle(b, "FID-A")).length, 0);
  await assert.rejects(api.createSolicitudFidelizacion(a, request), /ya existe/);
  await assert.rejects(api.createSolicitudFidelizacion(a, { ...request, actividadId: "FID-B" }), /pendiente/);
  await assert.rejects(api.createSolicitudFidelizacion(a, { ...request, deltas: [] }), /no contiene cambios/);
});
