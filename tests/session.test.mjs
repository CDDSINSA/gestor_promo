import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";

// Test the production session service against a controlled SDK boundary.
// No network, accounts or real tokens are involved.
async function createService(browserStorage) {
  const context = createContext({ URL, URLSearchParams, ...(browserStorage ? { window: {
    sessionStorage: browserStorage,
    localStorage: { removeItem() {} },
    location: { href: "https://app.example.com/" },
  } } : {}) });
  const listeners = new Set();
  let sdkSession = null;
  let getSessionError = null;
  let pendingRead = null;
  let options;
  const scopes = [];
  const sdk = {
    onAuthStateChange(listener) {
      listeners.add(listener);
      return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
    },
    async getSession() {
      if (pendingRead) return pendingRead;
      return { data: { session: sdkSession }, error: getSessionError };
    },
    async signOut({ scope }) {
      scopes.push(scope);
      sdkSession = null;
      emit("SIGNED_OUT", null);
      return { error: null };
    },
    refreshSession() { assert.fail("Application must not manually resubmit captured refresh tokens"); },
  };
  function emit(event, session) {
    sdkSession = session;
    for (const listener of listeners) listener(event, session);
  }
  const stub = (values) => new SyntheticModule(Object.keys(values), function () {
    for (const [key, value] of Object.entries(values)) this.setExport(key, value);
  }, { context });
  const config = stub({
    APP_SESSION_STORAGE_KEY: "legacy",
    SUPABASE_CONNECTION_OVERRIDES_ENABLED: false,
    STORAGE_KEY: "connection",
    assertOk: async () => [],
    assertAllowedSupabaseHost: () => "https://example.supabase.co",
    cleanText: (value) => String(value || "").trim(),
    fetchWithTimeout: async () => {},
    getAnonKey: () => "public-key",
    getConfiguredAnonKey: () => "public-key",
    getConfiguredSupabaseUrl: () => "https://example.supabase.co",
    getHeaders: () => ({}),
    getEnvValue: () => "",
    getSupabaseSchema: () => "g_comercial",
    getSupabaseUrl: () => "https://example.supabase.co",
  });
  const library = stub({ createClient: (_, __, settings) => {
    options = settings;
    return { auth: sdk };
  } });
  const module = new SourceTextModule(await readFile(new URL("../src/services/supabase/session.js", import.meta.url), "utf8"), { context });
  await module.link((name) => name === "@supabase/supabase-js" ? library : config);
  await module.evaluate();
  const service = module.namespace;
  // Initialize the same client that normal authentication consumers use.
  service.subscribeAppSession({}, () => {});
  return {
    service, emit, scopes,
    get options() { return options; },
    setError: (error) => { getSessionError = error; },
    delayRead: (promise) => { pendingRead = promise; },
  };
}

function session(token, user = "buyer") {
  return {
    access_token: token, refresh_token: `refresh-${token}`,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: user, email: `${user}@example.com` },
  };
}

test("requests with old snapshots always use the latest SDK credentials", async () => {
  const h = await createService();
  const original = session("original");
  h.emit("SIGNED_IN", original);
  for (const token of ["rotation-1", "rotation-2", "rotation-3"]) {
    h.emit("TOKEN_REFRESHED", session(token));
    const results = await Promise.all(Array.from({ length: 10 }, () => h.service.ensureFreshAppSession({}, original)));
    assert.ok(results.every((result) => result.access_token === token));
    assert.equal(h.service.loadStoredAppSession().access_token, token);
  }
});

test("auth event subscriptions normalize expiry and unsubscribe cleanly", async () => {
  const h = await createService();
  const events = [];
  const unsubscribe = h.service.subscribeAppSession({}, (event, value) => events.push([event, value]));
  const next = session("next");
  h.emit("TOKEN_REFRESHED", next);
  assert.equal(events[0][1].expires_at, next.expires_at * 1000);
  unsubscribe();
  h.emit("SIGNED_OUT", null);
  assert.equal(events.length, 1);
  assert.equal(h.service.loadStoredAppSession(), null);
});

test("missing SDK session never falls back to captured credentials", async () => {
  const h = await createService();
  await assert.rejects(h.service.ensureFreshAppSession({}, session("old")), /sesion termino/);
});

test("an operation for another user cannot borrow the current user's credentials", async () => {
  const h = await createService();
  h.emit("SIGNED_IN", session("current", "other-user"));
  await assert.rejects(h.service.ensureFreshAppSession({}, session("old")), /sesion cambio/);
});

test("temporary SDK errors keep metadata and do not clear the application snapshot", async () => {
  const h = await createService();
  h.emit("SIGNED_IN", session("current"));
  const error = Object.assign(new Error("Network unavailable"), { name: "AuthRetryableFetchError", status: 503 });
  h.setError(error);
  await assert.rejects(h.service.ensureFreshAppSession({}, session("old")), (actual) => actual === error);
  assert.equal(h.service.loadStoredAppSession().access_token, "current");
  assert.equal(h.scopes.length, 0);
});

test("a delayed SDK read cannot restore a session after logout", async () => {
  const h = await createService();
  const original = session("original");
  h.emit("SIGNED_IN", original);
  let finish;
  h.delayRead(new Promise((resolve) => { finish = resolve; }));
  const read = h.service.ensureFreshAppSession({}, original);
  await h.service.signOutAppUser({}, original);
  finish({ data: { session: original }, error: null });
  await assert.rejects(read, /sesion termino/);
  assert.equal(h.service.loadStoredAppSession(), null);
  assert.deepEqual(h.scopes, ["local"]);
});

test("credentials fall back to memory when browser storage is unavailable", async () => {
  const h = await createService();
  assert.equal(h.options.auth.autoRefreshToken, true);
  const storage = h.options.auth.storage;
  storage.setItem("auth-test", "memory-value");
  assert.equal(storage.getItem("auth-test"), "memory-value");
  storage.removeItem("auth-test");
  assert.equal(storage.getItem("auth-test"), null);
});

function createStorage() {
  const entries = new Map();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
  };
}

test("latest SDK credentials survive a fresh service instance in the same tab", async () => {
  const storage = createStorage();
  const first = await createService(storage);
  const key = first.options.auth.storageKey;
  first.options.auth.storage.setItem(key, JSON.stringify(session("original")));
  first.options.auth.storage.setItem(key, JSON.stringify(session("rotated")));
  const reloaded = await createService(storage);
  assert.equal(JSON.parse(reloaded.options.auth.storage.getItem(key)).access_token, "rotated");
  const separateTab = await createService(createStorage());
  assert.equal(separateTab.options.auth.storage.getItem(key), null);
});

test("logout removes persisted credentials so a reload cannot restore them", async () => {
  const storage = createStorage();
  const first = await createService(storage);
  const key = first.options.auth.storageKey;
  first.options.auth.storage.setItem(key, JSON.stringify(session("active")));
  first.emit("SIGNED_IN", session("active"));
  await first.service.signOutAppUser({}, session("active"));
  const reloaded = await createService(storage);
  assert.equal(reloaded.options.auth.storage.getItem(key), null);
});

test("reloaded recovery sessions are not published as a normal initial session", async () => {
  const storage = createStorage();
  const first = await createService(storage);
  first.emit("PASSWORD_RECOVERY", session("recovery"));
  const reloaded = await createService(storage);
  reloaded.emit("SIGNED_IN", session("recovery"));
  const events = [];
  reloaded.service.subscribeAppSession({}, (event) => events.push(event));
  reloaded.emit("INITIAL_SESSION", session("recovery"));
  assert.equal(events.length, 0);
  const recovery = await reloaded.service.loadRecoverySessionFromUrl({});
  assert.equal(recovery.access_token, "recovery");
});
