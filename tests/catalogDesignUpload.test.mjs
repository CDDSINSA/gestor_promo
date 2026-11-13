import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";

async function service({ rpcError, historyError, failOnce } = {}) {
  const uploads = [], requests = [];
  let version = 0;
  const context = createContext({ crypto: { randomUUID }, console });
  const stub = (values) => new SyntheticModule(Object.keys(values), function () {
    for (const [key,value] of Object.entries(values)) this.setExport(key,value);
  }, { context });
  const modules = {
    "./config": stub({ cleanText: (v) => String(v ?? "").trim(), assertOk: (r) => r,
      fetchWithTimeout: async (url, options) => { uploads.push({ url, ...options }); return {}; },
      getHeaders: (_, token, headers) => headers, getSupabaseUrl: () => "https://storage.example" }),
    "./session": stub({ ensureFreshAppSession: (_, session) => session }),
    "./http": stub({
      // catalogDesign.js carga el directorio de usuarios con callRpc (no cuenta como escritura).
      callRpc: async () => [],
      selectAll: async (_, table) => { if(historyError && table === "catalogo_pagina_versiones") throw historyError; return []; },
      supabaseRequest: async (_, path, options) => {
        requests.push({ path, ...options }); if(rpcError) throw rpcError;
        if(failOnce && requests.length === 1) throw new Error("Response lost");
        return { versionNumber: ++version, newVersionRecord: { numero_version: version }, updatedPage: { version_actual: version } };
      },
      patchRowById: () => { throw new Error("Unexpected direct write"); }, deleteRowsByValues() {}, upsertRows() {},
    }),
  };
  const module = new SourceTextModule(await readFile(new URL("../src/services/supabase/catalogDesign.js", import.meta.url),"utf8"),{ context });
  await module.link((name) => modules[name]); await module.evaluate();
  return { api: module.namespace, uploads, requests };
}
const connection = { session: { access_token: "test-token" } };
const page = { id: "page", version_actual: 7 };
const project = { catalogo_id: "CAT" };
const file = { name: "image.png", type: "image/png", size: 100 };

test("two stale clients upload separate objects and use only server-assigned versions", async () => {
  const { api, uploads, requests } = await service();
  const results = await Promise.all([1,2].map(() => api.uploadCatalogDesignPageImage(connection,page,project,file)));
  assert.notEqual(uploads[0].url, uploads[1].url);
  assert.ok(uploads.every((upload) => upload.headers["x-upsert"] === "false"));
  assert.ok(requests.every((request) => request.path === "/rest/v1/rpc/register_catalog_design_version"));
  assert.deepEqual(results.map((r) => r.versionNumber),[1,2]);
  assert.deepEqual(Object.keys(JSON.parse(requests[0].body)).sort(),["p_page_id","p_path"]);
});

test("failed confirmation surfaces an actionable error without falling back to direct writes", async () => {
  const { api, uploads, requests } = await service({ rpcError: new Error("timeout") });
  await assert.rejects(api.uploadCatalogDesignPageImage(connection,page,project,file), /Actualice el módulo/);
  assert.equal(uploads.length,1); assert.equal(requests.length,2);
  assert.equal(requests[0].body, requests[1].body);
});

test("invalid images are rejected before upload and history load failures propagate", async () => {
  const { api, uploads } = await service({ historyError: new Error("history unavailable") });
  await assert.rejects(api.uploadCatalogDesignPageImage(connection,page,project,{ ...file,type:"application/pdf" }), /Solo se permiten/);
  assert.equal(uploads.length,0);
  await assert.rejects(api.loadCatalogDesignData(connection), /history unavailable/);
});

test("comment insert errors do not retry without the version association", async () => {
  const { api, requests } = await service({ rpcError: new Error("version rejected") });
  await assert.rejects(api.addCatalogDesignPageComment(connection,"page","Text","precio","user",[],2,"version-id"), /version rejected/);
  assert.equal(requests.length,1);
  assert.equal(JSON.parse(requests[0].body).version_id,"version-id");
});


test("unconfirmed project retries reuse the same operation ID, including a later user retry", async () => {
  const { api, requests } = await service({ rpcError: new Error("timeout") });
  const connection = {};
  const project = { catalogo_id: "CAT", nombre_proyecto: "Project" };
  await assert.rejects(api.saveCatalogDesignProjectWithPages(connection, project, ["P1"]), /confirmar/);
  await assert.rejects(api.saveCatalogDesignProjectWithPages(connection, project, ["P1"]), /confirmar/);
  assert.equal(requests.length, 4);
  assert.equal(new Set(requests.map((r) => JSON.parse(r.body).p_operation_id)).size, 1);
});

test("a lost confirmation retries the same operation and returns the confirmed result", async () => {
  const { api, requests } = await service({ failOnce: true });
  const result = await api.saveCatalogDesignProjectWithPages({}, { catalogo_id: "CAT", nombre_proyecto: "Project" }, ["P1"]);
  assert.ok(result);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].body, requests[1].body);
});

test("an explicit database rejection is not reported as an uncertain save", async () => {
  const error = Object.assign(new Error("Cannot remove pages with images"), { status: 400 });
  const { api, requests } = await service({ rpcError: error });
  await assert.rejects(api.saveCatalogDesignProjectWithPages({}, { catalogo_id: "CAT", nombre_proyecto: "Project" }, ["P1"]), /No se guardaron cambios/);
  assert.equal(requests.length, 1);
});
