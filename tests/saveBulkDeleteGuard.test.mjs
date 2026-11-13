import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";

const root = fileURLToPath(new URL("../", import.meta.url));
const ICON_NAMES = ["CalendarDays", "Download", "FileSpreadsheet", "History", "Home", "Images", "ListChecks", "Percent", "Search", "Settings", "TrendingUp"];

// Carga save.js real; solo se reemplaza la llamada HTTP a Supabase.
async function loadSave(callRpc) {
  const context = createContext({});
  const modules = new Map();
  const httpStub = new SyntheticModule(["callRpc"], function () { this.setExport("callRpc", callRpc); }, { context });
  async function getModule(filename) {
    if (!modules.has(filename)) modules.set(filename, readFile(filename, "utf8").then((source) => new SourceTextModule(source, { context, identifier: filename })));
    return modules.get(filename);
  }
  const icons = new SyntheticModule(ICON_NAMES, function () { ICON_NAMES.forEach((name) => this.setExport(name, () => null)); }, { context });
  async function link(name, parent) {
    if (name === "lucide-react") return icons;
    const base = path.resolve(path.dirname(parent.identifier), name);
    const filename = [base, base + ".js", path.join(base, "index.js")].find((candidate) => candidate.endsWith(".js") && existsSync(candidate));
    assert.ok(filename, `Missing module: ${name}`);
    if (filename === path.join(root, "src/services/supabase/http.js")) return httpStub;
    return getModule(filename);
  }
  const module = await getModule(path.join(root, "src/services/supabase/save.js"));
  await module.link(link);
  await module.evaluate();
  return module.namespace;
}

const connection = { appUser: { rol: "ADMIN" } };
const payload = {
  operation_id: "save-op",
  promociones: [],
  actividades: [],
  compradores: [],
  sync_options: { promociones: { changed_row_ids: [], deleted_row_ids: ["D1"], expected_versions: { D1: 1 } } },
};

test("sin confirmacion no se envia el encabezado de borrado masivo", async () => {
  const calls = [];
  const save = await loadSave(async (...args) => { calls.push(args); return { sync_mode: "delta", promociones: [] }; });
  await save.saveCatalogToSupabase(connection, payload);
  assert.equal(calls[0][3], undefined);
});

test("con confirmacion se envia x-promo-allow-bulk-delete", async () => {
  const calls = [];
  const save = await loadSave(async (...args) => { calls.push(args); return { sync_mode: "delta", promociones: [] }; });
  await save.saveCatalogToSupabase(connection, payload, { allowBulkDelete: true });
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0][3])), { headers: { "x-promo-allow-bulk-delete": "true" } });
});

test("el bloqueo de Supabase se traduce a un error claro con detalle", async () => {
  const save = await loadSave(async () => {
    const error = new Error("No se pudo completar la operacion en Supabase.: PROMO_BULK_DELETE_BLOCKED [P0001]");
    error.supabaseError = { code: "P0001", message: "PROMO_BULK_DELETE_BLOCKED", details: JSON.stringify({ type: "PROMO_BULK_DELETE_BLOCKED", actividad_id: "CAT-40", eliminadas: 30, total: 40 }) };
    throw error;
  });
  await assert.rejects(save.saveCatalogToSupabase(connection, payload), (error) => {
    assert.equal(error.code, "PROMO_BULK_DELETE_BLOCKED");
    assert.equal(error.details.actividad_id, "CAT-40");
    assert.match(error.message, /CAT-40 \(30 de 40 promociones\)/);
    return true;
  });
});
