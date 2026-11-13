import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMarginReport, DEFAULT_MARGIN_THRESHOLDS } from "../src/features/margins/marginEngine.js";
import { buildAbcAnalysis, filterOffersByAbc } from "../src/features/margins/abcMarginAnalysis.js";

const base = { actividad_id: "CAT-1", nombre_actividad: "Renueva", tipo_actividad: "CATALOGO", tipo_promo: "Precio fijo", fuente_costo: "CAPTURA" };
let n = 0;
// precio_ahora con IVA; neto = precio / 1.15. costo 70 -> margen (100-70)/100 = 30 %.
const line = (sku, abc, precio, costo, extra = {}) => ({ ...base, row_id: `r${++n}`, sku, clasificacion_abc: abc, precio_ahora: precio, costo_nio: costo, ...extra });

const lines = [
  line("1", 1, 115, 70),     // AA 30 %  verde
  line("2", 1, 115, 50),     // AA 50 %  verde
  line("3", 1, 115, 95),     // AA 5 %   rojo
  line("4", 5, 115, 85),     // A 15 %   amarillo
  line("5", 5, 115, 85),
  line("6", 5, 115, 85),
  line("7", 3, 115, null),   // Desc sin costo
  line("8", 3, 115, 75),     // Desc 25 % naranja
  line("1", 1, 115, 60),     // mismo SKU en otra oferta: 40 %
];
const report = buildMarginReport(lines, DEFAULT_MARGIN_THRESHOLDS);

test("cuenta SKU únicos, promedios y desglose por clasificación", () => {
  const analysis = buildAbcAnalysis(report.offers, report.thresholds);
  assert.equal(analysis.available, true);
  const aa = analysis.rows.find((row) => row.codigo === 1);
  assert.equal(aa.skus, 3);
  assert.equal(aa.lineas, 4);
  assert.equal(aa.margenPromedio, 31.3); // (30+50+5+40)/4
  assert.deepEqual([aa.desglose.VERDE, aa.desglose.ROJO], [3, 1]);
  const desc = analysis.rows.find((row) => row.codigo === 3);
  assert.equal(desc.desglose.SIN_DATO, 1);
  assert.equal(desc.margenPromedio, 25);
  assert.deepEqual(analysis.rows.map((row) => row.codigo), [1, 5, 3]);
  assert.equal(analysis.summary.skus, 8);
  assert.equal(Math.round(analysis.summary.pctTop), 75);
  assert.deepEqual(analysis.composition.map((group) => group.id), ["aa", "a", "desc"]);
});

test("titular y hallazgos salen de los datos", () => {
  const { insights } = buildAbcAnalysis(report.offers, report.thresholds);
  assert.match(insights.headline, /^A es donde más pesa el margen bajo: 3 SKU con 15[.,]0% promedio, 15[.,]0 pts bajo la meta de 30%\.$/);
  assert.ok(insights.items.some((item) => /AA concentra 1 de las 1 líneas/.test(item.text)));
});

test("filtro ABC: ofertas con algún SKU de la clase y análisis solo de esa clase", () => {
  assert.equal(filterOffersByAbc(report.offers, "5").length, 3);
  assert.equal(filterOffersByAbc(report.offers, "Todos").length, report.offers.length);
  const only = buildAbcAnalysis(filterOffersByAbc(report.offers, "5"), report.thresholds, "5");
  assert.deepEqual(only.rows.map((row) => row.codigo), [5]);
});

test("sin clasificación disponible no se inventa el análisis", () => {
  const plain = buildMarginReport([{ ...base, row_id: "x", sku: "1", precio_ahora: 115, costo_nio: 70, clasificacion_abc: null }]);
  assert.equal(buildAbcAnalysis(plain.offers, plain.thresholds).available, false);
});

test("los obsequios no entran al margen", () => {
  const withGift = buildMarginReport([line("9", 4, 115, 70), line("10", 4, 0, 20)]);
  const b = buildAbcAnalysis(withGift.offers, withGift.thresholds).rows[0];
  assert.equal(b.obsequios, 1);
  assert.equal(b.conMargen, 1);
});

test("con filtro de una clase, el titular compara con la meta y no repite obviedades", () => {
  const only = buildAbcAnalysis(filterOffersByAbc(report.offers, "5"), report.thresholds, "5");
  assert.match(only.insights.headline, /^A: margen promedio de 15[.,]0% en 3 SKU, 15[.,]0 pts bajo la meta de 30%\.$/);
  assert.ok(!only.insights.items.some((item) => item.id === "top"));
});

test("cruce División × clasificación: ordena por margen, marca pocas líneas y encuentra el cruce más débil", async () => {
  const { buildDivisionMatrix, findWeakestCell } = await import("../src/features/margins/abcMarginAnalysis.js");
  const mk = (sku, abc, costo, division) => line(sku, abc, 115, costo, { division });
  const r = buildMarginReport([
    mk("1", 1, 90, "Ferretería"), mk("2", 1, 90, "Ferretería"), mk("3", 1, 90, "Ferretería"), // AA 10 %
    mk("4", 5, 60, "Ferretería"),                                                             // A 40 % (1 línea)
    mk("5", 1, 60, "Hogar"), mk("6", 1, 60, "Hogar"), mk("7", 1, 60, "Hogar"),                // AA 40 %
    mk("8", 4, 80, ""),                                                                       // sin división
  ]);
  const lines = r.offers.flatMap((offer) => offer.lineas);
  const m = buildDivisionMatrix(lines, r.thresholds);
  assert.deepEqual(m.rows.map((row) => row.division), ["Ferretería", "Sin división", "Hogar"]);
  assert.deepEqual(m.columns.map((c) => c.id), ["aa", "a", "b"]);
  const fer = m.rows.find((row) => row.division === "Ferretería");
  assert.equal(fer.cells.aa.margenPromedio, 10);
  assert.equal(fer.cells.aa.comparable, true);
  assert.equal(fer.cells.a.comparable, false);
  assert.equal(m.totals.aa.conMargen, 6);
  const weakest = findWeakestCell(m, r.thresholds);
  assert.deepEqual([weakest.division, weakest.groupId], ["Ferretería", "aa"]);
  const analysis = buildAbcAnalysis(r.offers, r.thresholds);
  assert.ok(analysis.insights.items.some((item) => item.id === "division" && /Ferretería · AA: 10[.,]0%/.test(item.text)));
});

test("matriz por división trae sus departamentos con el mismo cálculo y orden", () => {
  const withDepts = buildMarginReport([
    line("d1", 1, 115, 70, { division: "13-Hogar", departamento: "131-Cocina" }),   // 30 %
    line("d2", 1, 115, 95, { division: "13-Hogar", departamento: "132-Baño" }),     // 5 %
    line("d3", 5, 115, 85, { division: "13-Hogar", departamento: "132-Baño" }),     // 15 %
    line("d4", 4, 115, 50, { division: "2-Telecom" }),                               // 50 %, sin depto
  ]);
  const { divisiones } = buildAbcAnalysis(withDepts.offers, withDepts.thresholds);
  const hogar = divisiones.rows.find((row) => row.division === "13-Hogar");
  assert.deepEqual(hogar.departamentos.map((dept) => dept.departamento), ["132-Baño", "131-Cocina"]);
  const bano = hogar.departamentos[0];
  assert.equal(bano.skus, 2);
  assert.equal(bano.margenPromedio, 10);
  assert.equal(bano.cells.aa.margenPromedio, 5);
  assert.equal(bano.cells.a.margenPromedio, 15);
  assert.equal(hogar.departamentos.reduce((sum, dept) => sum + dept.lineas, 0), hogar.lineas);
  const telecom = divisiones.rows.find((row) => row.division === "2-Telecom");
  assert.deepEqual(telecom.departamentos.map((dept) => dept.departamento), ["Sin departamento"]);
});
