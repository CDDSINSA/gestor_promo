import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";
import React from "react";
import { transformWithOxc } from "vite";
import { MODULE_PERMISSIONS } from "../src/constants/permissions.js";

// Render the selection component without loading the actual pages or a database.
const source = await readFile(new URL("../src/app/shell/AppContent.jsx", import.meta.url), "utf8");
const { code } = await transformWithOxc(source, "AppContent.jsx", { jsx: { runtime: "classic" } });
const context = createContext({});
const stub = (values) => new SyntheticModule(Object.keys(values), function () {
  for (const [key, value] of Object.entries(values)) this.setExport(key, value);
}, { context });
const pageStub = (name) => Object.assign(() => null, { pageName: name });
const react = stub({ default: { ...React, lazy: (load) => pageStub(load.toString()) }, Suspense: React.Suspense });
const protectedRoute = pageStub("ProtectedRoute");
const module = new SourceTextModule(code, { context });
await module.link((name) => {
  if (name === "react") return react;
  if (name.endsWith("/permissions")) return stub({ MODULE_PERMISSIONS });
  return stub({ default: name.endsWith("/ProtectedRoute") ? protectedRoute : pageStub(name) });
});
await module.evaluate();
const AppContent = module.namespace.default;

function setup(active, overrides = {}) {
  const calls = [];
  const values = new Map(Object.entries({ rows: [], consultedLogs: [], logsPage: 2, ...overrides }));
  const group = new Proxy({}, { get: (_, key) => {
    if (!values.has(key)) values.set(key, (...args) => calls.push([key, ...args]));
    return values.get(key);
  } });
  const tree = AppContent({ active, catalogData: group, promotionData: group, masterData: group, connectionData: group, logsData: group, navigation: group, actions: group });
  const selected = React.Children.toArray(tree.props.children.props.children);
  return { tree, selected, values, calls };
}

test("all 13 modules select exactly one page with their original permission", () => {
  const pages = {
    home: "HomePage", fidelizacion: "FidelizacionPage", avances: "GestionAvancesPage",
    ajustes: "AjustesPage", promos: "PromosPage", consulta: "ConsultaSkuPage",
    especial: "PromocionEspecialPage", solicitudes: "SolicitudesEspecialesPage",
    seguimiento: "SeguimientoGanttPage", catalogDesign: "CatalogDesignPage",
    logs: "LogsPage", consolidado: "ConsolidadoPage", export: "ExportPageV2",
  };
  for (const [id, page] of Object.entries(pages)) {
    const { selected } = setup(id);
    assert.equal(selected.length, 1, id);
    assert.equal(selected[0].type, protectedRoute, id);
    assert.equal(selected[0].props.permission, MODULE_PERMISSIONS[id], id);
    assert.ok(selected[0].props.children.type.pageName.includes(page), id);
  }
});

test("administration keeps the Excel download and database master refresh connected", () => {
  const { selected, values } = setup("ajustes");
  const props = selected[0].props.children.props;
  assert.equal(props.onSaveExcel, values.get("onSaveExcel"));
  assert.equal(props.onSkuMasterUpdated, values.get("loadSkuMasterFromRemote"));
  assert.equal(props.onSaveCatalogSettings, values.get("onRequestSaveCatalogSettings"));
});

test("logs pagination and error recovery retain their navigation callbacks", () => {
  const { selected, tree, calls } = setup("logs");
  const props = selected[0].props.children.props;
  props.onPrevious();
  props.onNext();
  tree.props.onNavigateHome();
  assert.deepEqual(calls, [["onConsultLogs", 1], ["onConsultLogs", 3], ["navigate", "home"]]);
});

test("Promociones exige una campaña elegida en Inicio y ofrece volver", () => {
  const { selected, calls } = setup("promos", { catalogoActivo: null });
  assert.equal(selected[0].props.permission, MODULE_PERMISSIONS.promos);
  const guard = selected[0].props.children;
  assert.ok(guard.type.pageName.includes("PromosCampaignRequired"));
  guard.props.onGoHome();
  assert.deepEqual(calls, [["navigate", "home"]]);
});
