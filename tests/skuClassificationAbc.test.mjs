import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";
import {
  ABC_CLASSIFICATIONS,
  detectSkuFileKind,
  parseAbcCode,
  parseSkuMasterRows,
} from "../src/features/skuMaster/skuMasterParser.js";

const UDA_HEADER = ["UDA_ID", "UDA_DESC", "UDA_ITEM", "UDA_VALUE"];

test("las equivalencias ABC son las acordadas con negocio", () => {
  assert.deepEqual(ABC_CLASSIFICATIONS, {
    1: "AA", 2: "C", 3: "Descontinuado", 4: "B", 5: "A", 6: "Lento Movimiento",
    7: "Temporada", 8: "Nuevo", 9: "Inventario Duro", 10: "Servicio", 11: "Quebrada",
  });
});

test("acepta código o nombre en UDA_VALUE", () => {
  assert.equal(parseAbcCode("AA"), 1);
  assert.equal(parseAbcCode("a"), 5);
  assert.equal(parseAbcCode(" Lento Movimiento "), 6);
  assert.equal(parseAbcCode("INVENTARIO DURO"), 9);
  assert.equal(parseAbcCode("Servicio"), 10);
  assert.equal(parseAbcCode("Quebrada"), 11);
  assert.equal(parseAbcCode(3), 3);
  assert.equal(parseAbcCode("11"), 11);
  assert.equal(parseAbcCode("5.0"), 5);
  assert.equal(parseAbcCode("0"), null);
  assert.equal(parseAbcCode("12"), null);
  assert.equal(parseAbcCode("Z"), null);
  assert.equal(parseAbcCode(""), null);
});

test("detecta el reporte UDA y lo distingue del maestro completo", () => {
  assert.equal(detectSkuFileKind(UDA_HEADER), "abc");
  assert.equal(detectSkuFileKind(["uda id", "uda_item", "Uda Value"]), "abc");
  assert.equal(detectSkuFileKind(["ITEM", "X", "Y", "ITEM_DESC", "DEPT"]), "full");
});

test("solo toma UDA_ID = 4, ignora otros UDA y valores inválidos; último valor gana", () => {
  const result = parseSkuMasterRows([
    UDA_HEADER,
    ["4", "SINSA Product Classification", "100369681", "3"],
    ["4", "SINSA Product Classification", "100369690", "A"],
    ["7", "Otro UDA", "100369702", "5"],
    ["4", "SINSA Product Classification", "100369711", "XYZ"],
    ["4", "SINSA Product Classification", "", "5"],
    ["", "", "", ""],
    ["4", "SINSA Product Classification", "100369681", "Nuevo"],
  ]);
  assert.equal(result.kind, "abc");
  assert.deepEqual(result.rows.map(({ sku, clasificacion_abc }) => [sku, clasificacion_abc]), [
    ["100369681", 8],
    ["100369690", 5],
  ]);
  assert.equal(result.otherUdaCount, 1);
  assert.equal(result.invalidValueCount, 1);
  assert.deepEqual(result.invalidValues, ["XYZ"]);
  assert.equal(result.invalidCount, 1);
  assert.equal(result.duplicateCount, 1);
  assert.deepEqual(result.distribution, { 5: 1, 8: 1 });
});

test("un reporte UDA sin filas del UDA 4 se rechaza", () => {
  assert.throws(() => parseSkuMasterRows([UDA_HEADER, ["7", "Otro", "1", "5"]]), /UDA_ID = 4/);
});

test("el maestro completo sigue funcionando igual", () => {
  const header = ["ITEM", "", "", "ITEM_DESC", "DEPT", "", "", "STANDARD_UOM", "", "", "SUP_NAME", "", "UNIT_RETAIL", "", "VPN"];
  const result = parseSkuMasterRows([header, ["001", "", "", "Martillo", "12", "", "", "EA", "", "", "Prov", "", "150.50", "", "V-1"]]);
  assert.equal(result.kind, "full");
  assert.equal(result.rows[0].sku, "001");
  assert.equal(result.rows[0].precio_regular, 150.5);
  assert.equal(result.rows[0].clasificacion_abc, undefined);
});

async function loadService(rpc) {
  const context = createContext({ globalThis: {}, Math });
  const http = new SyntheticModule(["callRpc", "selectAll", "supabaseRequest", "toPostgrestIn"], function () {
    this.setExport("callRpc", rpc);
    this.setExport("selectAll", async () => []);
    this.setExport("supabaseRequest", async () => []);
    this.setExport("toPostgrestIn", () => "");
  }, { context });
  const mod = new SourceTextModule(await readFile(new URL("../src/services/supabase/skuMaster.js", import.meta.url), "utf8"), { context });
  await mod.link(() => http);
  await mod.evaluate();
  return mod.namespace;
}

test("sube por lotes con el mismo id de carga y aplica al final", async () => {
  const calls = [];
  const service = await loadService(async (_, name, params) => {
    calls.push({ name, params });
    return name === "aplicar_clasificacion_abc" ? { maestro_total: 10, maestro_sin_clasificacion: 4 } : { ok: true };
  });
  const rows = Array.from({ length: 2500 }, (_, i) => ({ sku: String(i + 1), clasificacion_abc: (i % 11) + 1 }));
  rows.push({ sku: "bad", clasificacion_abc: 12 }, { sku: "", clasificacion_abc: 1 });
  const result = await service.updateSkuClassificationInSupabase({}, rows);
  assert.deepEqual(calls.map((c) => c.name), ["cargar_clasificacion_abc_lote", "cargar_clasificacion_abc_lote", "aplicar_clasificacion_abc"]);
  const ids = new Set(calls.map((c) => c.params.p_carga_id));
  assert.equal(ids.size, 1);
  assert.match([...ids][0], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(calls[0].params.p_rows.length, 2000);
  assert.equal(calls[1].params.p_rows.length, 500);
  assert.equal(result.total, 2500);
  assert.equal(result.summary.maestro_sin_clasificacion, 4);
});

test("si un lote falla no se aplica la clasificación", async () => {
  const calls = [];
  const service = await loadService(async (_, name) => {
    calls.push(name);
    if (calls.length === 2) throw new Error("timeout");
    return { ok: true };
  });
  const rows = Array.from({ length: 4500 }, (_, i) => ({ sku: String(i), clasificacion_abc: 5 }));
  await assert.rejects(() => service.updateSkuClassificationInSupabase({}, rows), /timeout/);
  assert.ok(!calls.includes("aplicar_clasificacion_abc"));
});

test("el resumen ABC devuelve null si el paso 35 no está instalado", async () => {
  const service = await loadService(async () => { throw new Error("404"); });
  assert.equal(await service.getSkuClassificationSummaryFromSupabase({}), null);
});

test("el valor por defecto para SKU sin clasificación es 8 (Nuevo)", async () => {
  const { ABC_DEFAULT_CODE, getAbcClassificationName } = await import("../src/features/skuMaster/skuMasterParser.js");
  assert.equal(ABC_DEFAULT_CODE, 8);
  assert.equal(getAbcClassificationName(ABC_DEFAULT_CODE), "Nuevo");
});
