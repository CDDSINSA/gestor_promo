import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createContext, SourceTextModule } from "node:vm";

async function loadSegmentScope() {
  const context = createContext({});
  const module = new SourceTextModule(
    await readFile(new URL("../src/features/promotions/application/segmentScope.js", import.meta.url), "utf8"),
    { context },
  );
  await module.link(() => { throw new Error("Unexpected dependency"); });
  await module.evaluate();
  return module.namespace;
}

// Los arreglos/objetos del módulo vienen de otro contexto vm: se copian antes de comparar.
const plain = (value) => JSON.parse(JSON.stringify(value));

const COMASA = [
  { segmento_id: "1002", segmento: "Managua", canal: "comasa", orden: 1 },
  { segmento_id: "1003", segmento: "Foraneo", canal: "comasa", orden: 2 },
  { segmento_id: "1102", segmento: "Managua 1", canal: "comasa", orden: 3 },
  { segmento_id: "1103", segmento: "Managua2", canal: "comasa", orden: 4 },
  { segmento_id: "1104", segmento: "Foraneo 1", canal: "comasa", orden: 5 },
  { segmento_id: "1105", segmento: "Foraneo 2", canal: "comasa", orden: 6 },
];

test("lista, rango, nombres y orden del maestro", async () => {
  const { resolveSegmentInput } = await loadSegmentScope();
  assert.equal(resolveSegmentInput("1003, 1002", COMASA).value, "1002 | 1003");
  assert.equal(resolveSegmentInput("1102-1104", COMASA).value, "1102 | 1103 | 1104");
  assert.equal(resolveSegmentInput("1002 | 1104 a 1105", COMASA).value, "1002 | 1104 | 1105");
  assert.equal(resolveSegmentInput("managua; foraneo 1", COMASA).value, "1002 | 1104");
  const general = resolveSegmentInput("Todos", COMASA);
  assert.equal(general.general, true);
  assert.equal(general.value, "");
  const unknown = resolveSegmentInput("1002, 9999", COMASA);
  assert.deepEqual(plain(unknown.unknown), ["9999"]);
});

test("sin maestro de segmentos acepta códigos numéricos sin verificar", async () => {
  const { resolveSegmentInput } = await loadSegmentScope();
  const result = resolveSegmentInput("1002, 1003", []);
  assert.equal(result.value, "1002 | 1003");
  assert.deepEqual(plain(result.unverified), ["1002", "1003"]);
});

test("llave y cruce de segmentos no dependen del orden", async () => {
  const { getSegmentKey, getSegmentOverlap } = await loadSegmentScope();
  assert.equal(getSegmentKey("1003 | 1002"), getSegmentKey("1002 | 1003"));
  assert.equal(getSegmentKey("Todos"), "todos");
  assert.deepEqual(plain(getSegmentOverlap({ aplica_segmento: "SI", segmento_cliente: "1002 | 1003" }, { aplica_segmento: "SI", segmento_cliente: "1003" })), ["1003"]);
  assert.deepEqual(plain(getSegmentOverlap({ aplica_segmento: "SI", segmento_cliente: "1002" }, { aplica_segmento: "SI", segmento_cliente: "1003" })), []);
  assert.deepEqual(plain(getSegmentOverlap({ aplica_segmento: "NO", segmento: "Todos" }, { aplica_segmento: "NO" })), ["todos"]);
  assert.deepEqual(plain(getSegmentOverlap({ aplica_segmento: "NO" }, { aplica_segmento: "SI", segmento_cliente: "1002" })), []);
});

test("solicitud especial vieja con alcance SEGMENTO pasa a canal con segmentos por defecto", async () => {
  const { normalizeSpecialScope, resolveRowSegment } = await loadSegmentScope();
  const legacy = normalizeSpecialScope({ alcance_tipo: "SEGMENTO", alcance_valor: "1002 | 1003", aplica_segmento: "SI", segmento_cliente: "1002 | 1003" }, "Comasa");
  assert.equal(legacy.alcance_tipo, "CANAL");
  assert.equal(legacy.alcance_valor, "Comasa");
  assert.equal(legacy.segmento_cliente, "1002 | 1003");
  // Prioridad: fila → selección → solicitud.
  assert.equal(resolveRowSegment({ explicit: "1104", selection: "1102", segmentMode: true, context: legacy }), "1104");
  assert.equal(resolveRowSegment({ explicit: "", selection: "1102", segmentMode: true, context: legacy }), "1102");
  assert.equal(resolveRowSegment({ explicit: "", selection: "", segmentMode: true, context: legacy }), "1002 | 1003");
  assert.equal(resolveRowSegment({ explicit: "Todos", selection: "1102", segmentMode: true, context: legacy }), "");
  const general = normalizeSpecialScope({ alcance_tipo: "CANAL", aplica_segmento: "NO" }, "Retail");
  assert.equal(general.alcance_valor, "Retail");
  assert.equal(resolveRowSegment({ explicit: "", selection: "", segmentMode: false, context: general }), "");
});

test("tabla SKU × segmento agrupa segmentos con el mismo beneficio", async () => {
  const { parseSegmentMatrix } = await loadSegmentScope();
  const rows = [
    ["SKU", "1002", "1003", "1102", "1103", "1104", "1105", "Página"],
    ["100531212", "5%", "6%", "4%", "5%", "3%", "3%", "12"],
    ["100539759", "5%", "5%", "4%", "4%", "4%", "", ""],
  ];
  const { entries, issues } = await parseSegmentMatrix(rows, COMASA);
  assert.deepEqual(plain(issues), []);
  const bySku = (sku) => plain(entries).filter((entry) => entry.sku === sku).map((entry) => `${entry.value}:${entry.segments.join("|")}`).sort();
  assert.deepEqual(bySku("100531212"), ["3%:1104|1105", "4%:1102", "5%:1002|1103", "6%:1003"]);
  assert.deepEqual(bySku("100539759"), ["4%:1102|1103|1104", "5%:1002|1003"]);
  assert.equal(entries.find((entry) => entry.sku === "100531212").page, "12");
});

test("tabla SKU × segmento acepta rangos en el encabezado y avisa encabezados desconocidos", async () => {
  const { parseSegmentMatrix } = await loadSegmentScope();
  const { entries, issues } = parseSegmentMatrix([["SKU", "1002-1003", "1102-1104", "XYZ"], ["1", "5%", "4%", "9%"]], COMASA);
  assert.deepEqual(plain(entries.map((entry) => `${entry.value}:${entry.segments.join("|")}`)), ["5%:1002|1003", "4%:1102|1103|1104"]);
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /XYZ/);
});

test("precio sospechoso: mayor al regular o igual a un código de segmento", async () => {
  const { checkSuspiciousPrice } = await loadSegmentScope();
  const above = checkSuspiciousPrice({ price: "1002", regularPrice: "850", options: COMASA, promoType: "Descuento" });
  assert.equal(above.blocking, true);
  assert.equal(above.looksLikeSegment, true);
  const fixed = checkSuspiciousPrice({ price: "1200", regularPrice: "999", options: COMASA, promoType: "Precio fijo" });
  assert.equal(fixed.blocking, false);
  assert.equal(fixed.aboveRegular, true);
  assert.equal(checkSuspiciousPrice({ price: "750", regularPrice: "999", options: COMASA, promoType: "Descuento" }), null);
  const coincidence = checkSuspiciousPrice({ price: "1002", regularPrice: "5000", options: COMASA, promoType: "Descuento" });
  assert.equal(coincidence.blocking, false);
  assert.equal(coincidence.looksLikeSegment, true);
});
