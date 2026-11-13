import assert from "node:assert/strict";
import { test } from "node:test";
import { catalogToday, getCatalogSchedules } from "../src/features/catalogSchedule/catalogSchedule.js";

const catalog = { canal: "Retail", vigencia_inicio: "2026-10-01", vigencia_fin: "2026-10-31" };
test("general and short profiles use their own deadlines, including mixed channels", () => {
  const [general, short] = getCatalogSchedules({ ...catalog, canal: "Retail;Galerón;Ferrex" }, "2026-09-01");
  assert.deepEqual(general.milestones.map(m => m.date), ["2026-09-09", "2026-09-19", "2026-09-24", "2026-10-01"]);
  assert.deepEqual(short.milestones.map(m => m.date), ["2026-09-15", "2026-09-21", "2026-09-25", "2026-10-01"]);
});
test("date transitions do not depend on catalog status or confirm deliveries", () => {
  for (const estado of ["Borrador", "Preliminar", "Precios Finales", "Activo"]) {
    assert.equal(getCatalogSchedules({ ...catalog, estado }, "2026-09-09")[0].message, "Hoy");
    assert.equal(getCatalogSchedules({ ...catalog, estado }, "2026-09-10")[0].next.label, "Precios finales");
  }
  assert.equal(getCatalogSchedules(catalog, "2026-09-25")[0].next.label, "Inicio de vigencia");
  assert.equal(getCatalogSchedules(catalog, "2026-10-02")[0].message, "Vigencia iniciada");
  assert.equal(getCatalogSchedules(catalog, "2026-11-01")[0].message, "Vigencia finalizada");
});
test("urgency boundaries and singular day", () => {
  for (const [date, tone] of [["2026-09-03", "neutral"], ["2026-09-04", "soon"], ["2026-09-06", "soon"], ["2026-09-07", "urgent"], ["2026-09-09", "urgent"]]) {
    assert.equal(getCatalogSchedules(catalog, date)[0].tone, tone);
  }
  assert.equal(getCatalogSchedules(catalog, "2026-09-08")[0].message, "Falta 1 día");
});
test("missing or invalid dates and channels never show misleading countdowns", () => {
  for (const overrides of [{ vigencia_inicio: "" }, { vigencia_inicio: "2026-02-30" }, { vigencia_fin: "2026-01-01" }, { vigencia_fin: "incorrecta" }, { canal: "" }]) {
    assert.deepEqual(getCatalogSchedules({ ...catalog, ...overrides }, "2026-09-01"), []);
  }
});
test("calendar arithmetic crosses leap years and year boundaries", () => {
  assert.equal(getCatalogSchedules({ ...catalog, vigencia_inicio: "2028-03-01", vigencia_fin: "" }, "2028-01-01")[0].milestones[0].date, "2028-02-08");
  assert.equal(getCatalogSchedules({ ...catalog, vigencia_inicio: "2027-01-01", vigencia_fin: "" }, "2026-12-01")[0].milestones[0].date, "2026-12-10");
});
test("Managua calendar day is independent of device timezone", () => {
  assert.equal(catalogToday(new Date("2026-10-01T05:59:59Z")), "2026-09-30");
  assert.equal(catalogToday(new Date("2026-10-01T06:00:00Z")), "2026-10-01");
});
