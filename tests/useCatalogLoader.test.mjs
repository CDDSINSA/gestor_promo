import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";

// Verify query coordination separately from the shared data-merge callbacks.
async function createLoader(services = {}, overrides = {}) {
  const context = createContext({});
  const calls = [];
  const stub = (values) => new SyntheticModule(Object.keys(values), function () {
    for (const [key, value] of Object.entries(values)) this.setExport(key, value);
  }, { context });
  const react = stub({ useCallback: (callback) => callback });
  const service = stub({
    hasSupabaseConnection: () => true,
    loadCatalogFromSupabase: async () => { calls.push("query"); return { promociones: [] }; },
    loadSpecialRequestsFromSupabase: async () => ({}),
    loadPromotionScopeFromSupabase: async () => ({}),
    ...services,
  });
  const helpers = new SourceTextModule(await readFile(new URL("../src/app/session/sessionHelpers.js", import.meta.url), "utf8"), { context });
  const module = new SourceTextModule(await readFile(new URL("../src/hooks/useCatalogLoader.js", import.meta.url), "utf8"), { context });
  await module.link((name) => name === "react" ? react : name.includes("supabaseService") ? service : helpers);
  await module.evaluate();
  let dataState = { status: "idle", error: null };
  let refreshStatus;
  const options = {
    appSession: { access_token: "token" },
    appUser: { auth_user_id: "user-A", activo: true },
    supabaseSettings: { url: "https://database.example" },
    supabaseConnection: {},
    supabaseStatus: {},
    initialLoadSessionRef: { current: "" },
    dataOwnerRef: { current: "" },
    specialRequestsRefreshRef: { current: false },
    promotionScopeRefreshRef: { current: "" },
    setSupabaseStatus: (status) => calls.push(status.type),
    setDataState: (next) => { dataState = typeof next === "function" ? next(dataState) : next; },
    setSpecialRequestsRefreshStatus: (status) => { refreshStatus = status; },
    setPromotionScopeRefreshStatus: (status) => { refreshStatus = status; },
    resetDomainState: () => { calls.push("reset"); options.initialLoadSessionRef.current = ""; },
    runSupabaseOperation: async (_, operation) => { try { return await operation(); } catch { return null; } },
    applyCatalogData: () => calls.push("apply"),
    rememberSyncedPromotions: () => calls.push("promotions"),
    rememberSyncedSettings: () => calls.push("settings"),
    rememberSyncedOperations: () => calls.push("operations"),
    applySpecialRequestsData: () => ({ count: 1 }),
    rememberSyncedOperationalRows: () => calls.push("special-snapshot"),
    applyPromotionScopeData: () => ({ count: 1, skipped: false }),
    ...overrides,
  };
  return {
    loader: module.namespace.useCatalogLoader(options),
    options,
    calls,
    state: () => dataState,
    refresh: () => refreshStatus,
  };
}

test("initial load resets the owner, applies data and records sync snapshots once", async () => {
  const h = await createLoader();
  await h.loader.bootstrapData();
  await h.loader.bootstrapData();
  assert.deepEqual(h.calls, ["reset", "query", "apply", "promotions", "settings", "operations"]);
  assert.equal(h.state().status, "ready");
  await h.loader.bootstrapData({ force: true });
  assert.equal(h.calls.filter((call) => call === "query").length, 2);
});

test("a failed initial load can be retried", async () => {
  let attempts = 0;
  const h = await createLoader({ loadCatalogFromSupabase: async () => {
    if (++attempts === 1) throw new Error("Network failure");
    return { promociones: [] };
  } });
  await h.loader.bootstrapData();
  assert.equal(h.state().status, "error");
  assert.equal(h.state().error, "Network failure");
  assert.equal(h.options.initialLoadSessionRef.current, "");
  assert.equal(h.calls.includes("apply"), false);
  await h.loader.bootstrapData();
  assert.equal(h.state().status, "ready");
  assert.equal(h.state().error, null);
});

test("initial load reports the current failure instead of stale configuration status", async () => {
  const h = await createLoader({
    loadCatalogFromSupabase: async () => { throw new Error("permission denied for table compradores"); },
  }, { supabaseStatus: { type: "idle", message: "Configure Supabase para sincronizar datos." } });
  await h.loader.bootstrapData();
  assert.equal(h.state().error, "permission denied for table compradores");
  assert.equal(h.calls.includes("apply"), false);
});

test("a new owner clears previous data before loading", async () => {
  const h = await createLoader({}, { dataOwnerRef: { current: "previous-user" } });
  await h.loader.bootstrapData();
  assert.equal(h.calls[0], "reset");
  assert.equal(h.options.dataOwnerRef.current, "user-A");
});

test("missing session or connection does not query the database", async () => {
  const loggedOut = await createLoader({}, { appSession: null });
  await loggedOut.loader.bootstrapData();
  assert.equal(loggedOut.calls.length, 0);
  const disconnected = await createLoader({ hasSupabaseConnection: () => false });
  await disconnected.loader.bootstrapData();
  assert.equal(disconnected.calls.includes("query"), false);
  assert.equal(disconnected.state().status, "error");
});

test("a scope skipped by the unsaved-change check reports the existing warning", async () => {
  const h = await createLoader({}, { applyPromotionScopeData: () => ({ skipped: true, count: 2 }) });
  await h.loader.refreshPromotionScopeFromSupabase({ actividadId: "CAT1", comprador: "Buyer", tipoPromo: "Descuento" });
  assert.equal(h.refresh().type, "error");
  assert.match(h.refresh().message, /cambios locales sin guardar/);
});

test("a late response for a previous scope is ignored", async () => {
  let resolveFirst;
  const pending = new Promise((resolve) => { resolveFirst = resolve; });
  const applied = [];
  const h = await createLoader({ loadPromotionScopeFromSupabase: async (_, scope) => scope.actividadId === "CAT1" ? pending : {} }, {
    applyPromotionScopeData: (scope) => { applied.push(scope.actividadId); return { skipped: false, count: 1 }; },
  });
  const first = h.loader.refreshPromotionScopeFromSupabase({ actividadId: "CAT1", comprador: "Buyer", tipoPromo: "Descuento" });
  await h.loader.refreshPromotionScopeFromSupabase({ actividadId: "CAT2", comprador: "Buyer", tipoPromo: "Descuento" });
  resolveFirst({});
  await first;
  assert.deepEqual(applied, ["CAT2"]);
});

test("special-request refresh prevents duplicate loads and releases its flag on failure", async () => {
  let rejectQuery;
  let calls = 0;
  const pending = new Promise((_, reject) => { rejectQuery = reject; });
  const h = await createLoader({ loadSpecialRequestsFromSupabase: async () => { calls++; return pending; } });
  const first = h.loader.refreshSpecialRequestsFromSupabase();
  await h.loader.refreshSpecialRequestsFromSupabase();
  assert.equal(calls, 1);
  rejectQuery(new Error("Network failure"));
  await first;
  assert.equal(h.refresh().type, "error");
  assert.equal(h.options.specialRequestsRefreshRef.current, false);
});

test("carga por campaña: el inicio pide los datos sin promociones; apagada, pide todo", async () => {
  const seen = [];
  const service = { loadCatalogFromSupabase: async (_, options) => { seen.push(options); return { promociones: [] }; } };
  const lazy = await createLoader(service, { campaignLoadingEnabled: true });
  await lazy.loader.bootstrapData();
  const eager = await createLoader(service);
  await eager.loader.bootstrapData();
  assert.deepEqual(JSON.parse(JSON.stringify(seen)), [{ includePromotions: false }, { includePromotions: true }]);
});
