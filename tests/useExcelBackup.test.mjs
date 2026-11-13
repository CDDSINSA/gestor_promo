import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";

// Test orchestration with file IO replaced; workbook generation stays in excelService.
async function createBackup(services, callbacks) {
  const context = createContext({});
  const stub = (values) => new SyntheticModule(Object.keys(values), function () {
    for (const [key, value] of Object.entries(values)) this.setExport(key, value);
  }, { context });
  const react = stub({ useRef: (current) => ({ current }) });
  const excel = stub({ loadCatalogFromExcel: async () => ({}), saveCatalogToExcel: async () => {}, ...services });
  const module = new SourceTextModule(await readFile(new URL("../src/hooks/useExcelBackup.js", import.meta.url), "utf8"), { context });
  await module.link((name) => name === "react" ? react : excel);
  await module.evaluate();
  return module.namespace.useExcelBackup(callbacks);
}

test("export uses current data and announces success only after generation", async () => {
  const calls = [];
  const data = { promociones: [{ row_id: "P1" }] };
  const backup = await createBackup({ saveCatalogToExcel: async (value) => {
    assert.equal(value, data);
    calls.push("generated");
  } }, {
    buildCatalogPayload: () => data,
    setSupabaseStatus: (status) => calls.push(status.type),
    showSuccessToast: () => calls.push("toast"),
  });
  await backup.onSaveExcel();
  assert.deepEqual(calls, ["generated", "ready", "toast"]);
});

test("invalid export reports the validation error without a success toast", async () => {
  let status;
  const backup = await createBackup({ saveCatalogToExcel: async () => { throw new Error("SKU obligatorio"); } }, {
    buildCatalogPayload: () => ({}),
    setSupabaseStatus: (value) => { status = value; },
    showSuccessToast: () => assert.fail("Unexpected success toast"),
  });
  await backup.onSaveExcel();
  assert.equal(status.type, "error");
  assert.equal(status.message, "SKU obligatorio");
});

test("import applies data before resetting sync state and clears the file input", async () => {
  const calls = [];
  const data = { promociones: [] };
  const file = { name: "respaldo.xlsx" };
  const event = { target: { files: [file], value: "respaldo.xlsx" } };
  const backup = await createBackup({ loadCatalogFromExcel: async (value) => {
    assert.equal(value, file);
    return data;
  } }, {
    applyCatalogData: (value) => { assert.equal(value, data); calls.push("applied"); },
    resetSyncedState: () => calls.push("reset"),
    setSupabaseStatus: (status) => calls.push(status.type),
  });
  await backup.onLoadExcel(event);
  assert.deepEqual(calls, ["applied", "reset", "ready"]);
  assert.equal(event.target.value, "");
});

test("invalid import preserves application data and clears the file input", async () => {
  let status;
  const event = { target: { files: [{ name: "incorrecto.xlsx" }], value: "incorrecto.xlsx" } };
  const backup = await createBackup({ loadCatalogFromExcel: async () => { throw new Error("Faltan hojas obligatorias"); } }, {
    applyCatalogData: () => assert.fail("Should not replace application data"),
    resetSyncedState: () => assert.fail("Should not reset sync state"),
    setSupabaseStatus: (value) => { status = value; },
  });
  await backup.onLoadExcel(event);
  assert.equal(status.type, "error");
  assert.equal(event.target.value, "");
});
