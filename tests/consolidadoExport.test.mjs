import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";
import ExcelJS from "exceljs";
import { getModificationExcelDate, isModifiedPromotion, MODIFICATION_DATE_FORMAT } from "../src/features/consolidado/exportMetadata.js";
import { buildDesignReport } from "../src/features/designExport/designReport.js";

test("first versions are not highlighted; edited versions and legacy timestamps are", () => {
  const dates = { fecha_creacion: "2026-09-16T12:00:00Z", fecha_modificacion: "2026-09-17T15:30:00Z" };
  assert.equal(isModifiedPromotion({ ...dates, version: 1 }), false);
  assert.equal(isModifiedPromotion({ ...dates, version: 2 }), true);
  assert.equal(isModifiedPromotion(dates), true);
  assert.equal(isModifiedPromotion({ fecha_creacion: dates.fecha_creacion, fecha_modificacion: dates.fecha_creacion }), false);
  assert.equal(isModifiedPromotion({ fecha_modificacion: "invalid" }), false);
});

test("Excel modification dates use Managua time and preserve day changes", () => {
  assert.equal(getModificationExcelDate({ updated_at: "2026-09-17T15:30:00Z" }).toISOString(), "2026-09-17T09:30:00.000Z");
  assert.equal(getModificationExcelDate({ fecha_modificacion: "2026-09-17T02:00:00Z" }).toISOString(), "2026-09-16T20:00:00.000Z");
  assert.equal(getModificationExcelDate({}), null);
  assert.equal(getModificationExcelDate({ fecha_modificacion: "invalid" }), null);
});

test("exported cells contain sortable dates, yellow edits and red annulments; other exports stay unchanged", async () => {
  let downloaded;
  const context = createContext({ Blob, URL: { createObjectURL(blob) { downloaded = blob; return "blob:test"; }, revokeObjectURL() {} }, document: {
    body: { appendChild() {} }, createElement: () => ({ style: {}, click() {}, remove() {} }),
  } });
  const stub = async (values) => {
    const module = new SyntheticModule(Object.keys(values), function () {
      Object.entries(values).forEach(([name, value]) => this.setExport(name, value));
    }, { context });
    await module.link(() => {});
    await module.evaluate();
    return module;
  };
  const modules = {
    "../utils/promoHelpers": await stub({ normalizeCanal: (value) => value }),
    "../promoTypes/promoTypeEngine": await stub({ complexPromoTypes: ["Combo"] }),
    "../features/promotions/application/promotionAnulation": await stub({ isAnulledPromotion: (row) => row.estado_registro === "ANULADO" }),
  };
  const excel = await stub({ default: ExcelJS });
  const module = new SourceTextModule(await readFile(new URL("../src/services/excelStyleService.js", import.meta.url), "utf8"), {
    context, importModuleDynamically: async () => excel,
  });
  await module.link((name) => modules[name]);
  await module.evaluate();
  const date = getModificationExcelDate({ fecha_modificacion: "2026-09-17T15:30:00Z" });
  const options = {
    sheetName: "Consolidado", fileName: "test.xlsx", columnCount: 2,
    rows: [["SKU", "Fecha de modificación"], ["001", date], ["002", date], ["003", date]],
    dataRows: [{ version: 1 }, { version: 2, tipoPromo: "Combo" }, { version: 3, estado_registro: "ANULADO" }],
  };
  await module.namespace.exportStyledWorkbook({ ...options, isModifiedRow: isModifiedPromotion, columnFormats: [{ column: 2, numFmt: MODIFICATION_DATE_FORMAT, width: 25 }] });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await downloaded.arrayBuffer());
  const sheet = workbook.getWorksheet("Consolidado");
  assert.equal(sheet.getCell("B3").value.toISOString(), date.toISOString());
  assert.equal(sheet.getCell("B3").numFmt, MODIFICATION_DATE_FORMAT);
  assert.equal(sheet.getColumn(2).width, 25);
  assert.notEqual(sheet.getCell("A2").fill?.fgColor?.argb, "FFFFF2CC");
  for (const cell of ["A3", "B3"]) assert.equal(sheet.getCell(cell).fill.fgColor.argb, "FFFFF2CC");
  assert.equal(sheet.getCell("A4").fill.fgColor.argb, "FFFFE2E2");
  await module.namespace.exportStyledWorkbook(options);
  await workbook.xlsx.load(await downloaded.arrayBuffer());
  assert.equal(workbook.getWorksheet("Consolidado").getCell("A3").fill.fgColor.argb, "FFE2F0D9");
  assert.equal(workbook.worksheets.length, 1);

  const report = buildDesignReport({
    projects: [{ id: "p", catalogo_id: "c", nombre_proyecto: "Prueba", estado: "en_revision" }],
    pages: [{ id: "page", proyecto_id: "p", numero_pagina: 1, estado: "en_revision", fecha_ultimo_estado: "2026-09-30T02:00:00Z" }],
    comments: [{ pagina_id: "page", comentario: "=1+1", estado: "abierto" }],
  }, [], {}, { fullAccess: true });
  await module.namespace.exportStyledWorkbook({
    sheetName: "Resumen proyectos", rows: report.summary, fileName: "report.xlsx",
    additionalSheets: [{ name: "Detalle paginas", rows: report.detail, columns: report.detail[0].map((_, index) => ({ width: 25, style: index === 16 ? { numFmt: MODIFICATION_DATE_FORMAT } : {} })) }],
  });
  await workbook.xlsx.load(await downloaded.arrayBuffer());
  assert.equal(workbook.worksheets.length, 2);
  assert.equal(workbook.getWorksheet("Resumen proyectos").getCell("C2").value, "Prueba");
  // El detalle ahora incluye versión, diseñador y comprador: texto de comentarios en O, "Último cambio de estado" en Q.
  const detail = workbook.getWorksheet("Detalle paginas");
  assert.equal(detail.getCell("Q2").value.toISOString(), "2026-09-29T20:00:00.000Z");
  assert.equal(detail.getCell("Q2").numFmt, MODIFICATION_DATE_FORMAT);
  assert.equal(detail.getCell("O2").value, "=1+1");
  assert.equal(detail.getCell("O2").type, ExcelJS.ValueType.String);
  assert.equal(detail.views[0].ySplit, 1);
  assert.ok(detail.autoFilter);
});
