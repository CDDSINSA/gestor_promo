import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDesignReport, designExcelDate } from "../src/features/designExport/designReport.js";

const data = {
  projects: [{ id: "p1", catalogo_id: "c1", nombre_proyecto: "Diseño septiembre", estado: "en_revision", fecha_actualizacion: "2026-09-30T02:00:00Z" },
    { id: "p2", catalogo_id: "c2", nombre_proyecto: "Sin páginas", estado: "planificacion" }],
  pages: [{ id: "a", proyecto_id: "p1", numero_pagina: 2, estado: "aprobada", disenador_id: "d1", comprador_id: "b1" },
    { id: "b", proyecto_id: "p1", numero_pagina: 1, estado: "ajustes", disenador_id: "d2", comprador_id: "b2" }],
  users: [{ id: "d1", nombre: "Ana" }, { id: "d2", nombre: "Luis" }],
  buyers: [{ id: "b1", comprador: "Comprador 1" }, { id: "b2", comprador: "Comprador 2" }],
  comments: [{ id: "x", pagina_id: "a", comentario: "Corregir precio", estado: "abierto", respuestas: [{ comentario: "Revisando" }] },
    { id: "y", pagina_id: "a", comentario: "Listo", estado: "resuelto" },
    { id: "z", pagina_id: "b", comentario: "Cambiar imagen", estado: "abierto" },
    { id: "hidden", pagina_id: "otra", comentario: "No autorizado", estado: "abierto" }],
};
const catalogs = [{ id: "c1", nombre: "Catálogo septiembre" }];
const objectRow = (rows, index = 1) => Object.fromEntries(rows[0].map((header, column) => [header, rows[index][column]]));

test("summary aggregates visible pages and principal comments, independently of replies", () => {
  const result = buildDesignReport(data, catalogs, {}, { fullAccess: true });
  const summary = objectRow(result.summary);
  assert.equal(result.projectCount, 2);
  assert.equal(result.pageCount, 2);
  assert.equal(summary["Catálogo"], "Catálogo septiembre");
  assert.equal(summary["Páginas en alcance"], 2);
  assert.equal(summary["Avance (%)"], 50);
  assert.equal(summary["Comentarios totales"], 3);
  assert.equal(summary["Comentarios abiertos"], 2);
  assert.equal(summary["Comentarios resueltos"], 1);
  assert.equal(summary["Último cambio de estado"], "Sin registro");
  assert.equal(objectRow(result.detail)["Número de página"], 1);
  assert.equal(objectRow(result.detail, 2)["Texto comentarios abiertos"], "Corregir precio");
  assert.equal(objectRow(result.summary, 2)["Avance (%)"], 0);
});

test("buyer filters recompute totals and exclude projects with no matching pages", () => {
  const result = buildDesignReport(data, catalogs, { buyer: "b1" }, { fullAccess: true });
  const summary = objectRow(result.summary);
  assert.equal(result.projectCount, 1);
  assert.equal(result.pageCount, 1);
  assert.equal(summary["Comentarios abiertos"], 1);
  assert.equal(summary["Avance (%)"], 100);
  assert.equal(summary["Diseñadores"], "Ana");
  assert.equal(summary["Alcance"], "Páginas filtradas");
});

test("restricted reports omit projects without authorized pages and label partial scope", () => {
  const restricted = { ...data, pages: [data.pages[1]], users: [] };
  const result = buildDesignReport(restricted, catalogs);
  assert.equal(result.projectCount, 1);
  assert.equal(objectRow(result.summary)["Comentarios totales"], 1);
  assert.equal(objectRow(result.summary)["Alcance"], "Páginas autorizadas");
  assert.equal(objectRow(result.detail)["Diseñador"], "Usuario no disponible");
});

test("catalog, designer and project state filters combine without changing source arrays", () => {
  const result = buildDesignReport(data, catalogs, { catalog: "catalogo SEPTIEMBRE", designer: "d2", state: "en_revision" }, { fullAccess: true });
  assert.equal(result.projectCount, 1);
  assert.equal(result.pageCount, 1);
  assert.equal(objectRow(result.detail)["Comprador"], "Comprador 2");
  assert.equal(data.pages[0].numero_pagina, 2);
  assert.equal(buildDesignReport(data, catalogs, { state: "consolidado" }).projectCount, 0);
});

test("dates preserve Managua time and never substitute generic updates for state changes", () => {
  assert.equal(designExcelDate("2026-09-30T02:00:00Z").toISOString(), "2026-09-29T20:00:00.000Z");
  assert.equal(designExcelDate("2026-09-30").toISOString(), "2026-09-30T00:00:00.000Z");
  assert.equal(designExcelDate("invalid"), "Sin registro");
  const result = buildDesignReport({ ...data, projects: [{ ...data.projects[0], fecha_ultimo_estado: "2026-09-28T12:00:00Z" }] }, catalogs);
  assert.equal(objectRow(result.summary)["Último cambio de estado"].toISOString(), "2026-09-28T06:00:00.000Z");
});
