import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";

async function service(currentPage = { id: "page", version_actual: 2, archivo_path: "v2.png" }) {
  const writes = [];
  const context = createContext({ console, crypto: { randomUUID } });
  const stub = (values) => new SyntheticModule(Object.keys(values), function () {
    for (const [key, value] of Object.entries(values)) this.setExport(key, value);
  }, { context });
  const modules = {
    "./config": stub({ cleanText: (value) => String(value ?? "").trim(), assertOk() {}, fetchWithTimeout() {}, getHeaders() {}, getSupabaseUrl() {} }),
    "./session": stub({ ensureFreshAppSession() {} }),
    "./http": stub({
      // catalogDesign.js carga el directorio de usuarios con callRpc (no cuenta como escritura).
      callRpc: async () => [],
      selectAll: async () => currentPage ? [currentPage] : [],
      patchRowById: async (_, table, id, row) => { writes.push({ table, id, row }); return row; },
      supabaseRequest: async (_, path, options) => { const row = JSON.parse(options.body); writes.push({ path, row }); return [row]; },
      deleteRowsByValues() {}, upsertRows() {},
    }),
  };
  const module = new SourceTextModule(await readFile(new URL("../src/services/supabase/catalogDesign.js", import.meta.url), "utf8"), { context });
  await module.link((name) => modules[name]);
  await module.evaluate();
  return { api: module.namespace, writes };
}

test("all visible observation categories persist unchanged and remain open", async () => {
  const { api, writes } = await service();
  for (const category of ["precio", "imagen", "general", "ajuste"]) {
    await api.addCatalogDesignPageComment({}, "page", "Revisar", category, "user", [], 2, "version");
    assert.equal(writes.at(-1).row.tipo, category);
    assert.equal(writes.at(-1).row.estado, "abierto");
    assert.equal(writes.at(-1).row.numero_version, 2);
  }
});

test("review sends one atomic RPC with the expected image and version, ignoring category", async () => {
  const { api, writes } = await service();
  await api.reviewCatalogDesignPage({}, { id: "page", archivo_path: "v2.png" }, "aprobada", "", "ajuste", "user", [], 2, "version-id");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].path, "/rest/v1/rpc/review_catalog_design_page");
  assert.equal(writes[0].row.p_status, "aprobada");
  assert.equal(writes[0].row.p_version_number, 2);
  assert.equal(writes[0].row.p_version_id, "version-id");
  assert.equal(writes[0].row.p_image_path, "v2.png");
  assert.ok(writes[0].row.p_operation_id);
  assert.equal(writes[0].row.tipo, undefined);
});

test("invalid review states cannot produce requests", async () => {
  const { api, writes } = await service();
  await assert.rejects(api.reviewCatalogDesignPage({}, { id: "page" }, "pendiente", "", "ajuste", "user", [], 2), /Seleccione aprobar/);
  assert.equal(writes.length, 0);
});

test("project save sends metadata and page titles together", async () => {
  const { api, writes } = await service();
  await api.saveCatalogDesignProjectWithPages({}, { catalogo_id: "CAT", nombre_proyecto: "Name", estado: "planificacion" }, ["P1", "P2"], ["CAT"]);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].path, "/rest/v1/rpc/save_catalog_design_project");
  assert.deepEqual(writes[0].row.p_titles, ["P1", "P2"]);
  assert.equal(writes[0].row.p_project_id, null);
});
