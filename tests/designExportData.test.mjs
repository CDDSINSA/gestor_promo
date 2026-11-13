import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";

test("export loads only comments from authorized pages, omits unrelated projects and requests no storage files", async () => {
  const calls = [];
  const fixtures = {
    catalogo_proyecto_diseno: [{ id: "authorized" }, { id: "other" }],
    catalogo_paginas_diseno: [{ id: "page", proyecto_id: "authorized" }],
    usuarios_app: [], compradores: [], catalogo_pagina_versiones: [],
  };
  const context = createContext();
  const http = new SyntheticModule(["selectAll", "selectRowsByValues"], function () {
    this.setExport("selectAll", async (_, table) => { calls.push(table); return fixtures[table]; });
    this.setExport("selectRowsByValues", async (_, table, field, ids) => {
      assert.equal(table, "catalogo_pagina_comentarios");
      assert.equal(field, "pagina_id");
      assert.equal(Array.from(ids).join(), "page");
      return [{ pagina_id: "page" }];
    });
  }, { context });
  await http.link(() => {});
  await http.evaluate();
  const module = new SourceTextModule(await readFile(new URL("../src/services/supabase/designExport.js", import.meta.url), "utf8"), { context });
  await module.link(() => http);
  await module.evaluate();
  const scoped = await module.namespace.loadDesignExportData({});
  assert.equal(scoped.projects.length, 1);
  assert.equal(scoped.projects[0].id, "authorized");
  assert.equal(scoped.comments.length, 1);
  // Proyectos, páginas, usuarios, compradores y versiones (agregadas al reporte); ningún archivo de storage.
  assert.deepEqual(calls.sort(), ["catalogo_pagina_versiones", "catalogo_paginas_diseno", "catalogo_proyecto_diseno", "compradores", "usuarios_app"]);
  const full = await module.namespace.loadDesignExportData({}, { fullAccess: true });
  assert.equal(full.projects.length, 2);
});
