import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";

// Exercise state transitions and effect cleanup with mocked auth services, not a live account.
async function createAuth(overrides = {}) {
  const timers = new Map();
  let nextTimer = 0;
  let authListener = () => {};
  const context = createContext({
    setTimeout: (callback) => { timers.set(++nextTimer, callback); return nextTimer; },
    clearTimeout: (id) => timers.delete(id),
  });
  const slots = [];
  let cursor = 0;
  let effects = [];
  let dirty = true;
  let value;
  let settings = { url: "https://database.example" };
  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((item, index) => Object.is(item, b[index]));
  const stub = (values) => new SyntheticModule(Object.keys(values), function () {
    for (const [key, item] of Object.entries(values)) this.setExport(key, item);
  }, { context });
  const react = stub({
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === "function" ? initial() : initial };
      const slot = slots[index];
      slot.set ??= (next) => {
        const updated = typeof next === "function" ? next(slot.value) : next;
        if (!Object.is(updated, slot.value)) { slot.value = updated; dirty = true; }
      };
      return [slot.value, slot.set];
    },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!sameDeps(slots[index]?.deps, deps)) slots[index] = { deps, value: callback };
      return slots[index].value;
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (sameDeps(slots[index]?.deps, deps)) return;
      const previous = slots[index];
      slots[index] = { deps };
      effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = effect(); });
    },
  });
  const service = stub({
    loadStoredAppSession: () => null,
    loadRecoverySessionFromUrl: async () => null,
    loadAuthUserFromSession: async () => ({ id: "recovery-user" }),
    loadAppUserProfile: async (_, session) => ({ id: session.access_token, activo: true }),
    saveStoredSupabaseConnection: (connection) => connection,
    signInAppUser: async () => ({ access_token: "user-A" }),
    signOutAppUser: async () => {},
    abortActiveSupabaseRequests: () => {},
    requestPasswordRecovery: async () => {},
    updateRecoveredPassword: async () => {},
    hasSupabaseConnection: () => true,
    subscribeAppSession: (_, listener) => {
      authListener = listener;
      return () => { authListener = () => {}; };
    },
    ...overrides,
  });
  const helpers = stub({ clearAuthTokensFromUrl: () => {} });
  const module = new SourceTextModule(await readFile(new URL("../src/hooks/useAuthSession.js", import.meta.url), "utf8"), { context });
  await module.link((name) => name === "react" ? react : name.includes("supabaseService") ? service : helpers);
  await module.evaluate();
  function render() {
    cursor = 0;
    dirty = false;
    value = module.namespace.useAuthSession({ supabaseSettings: settings, setSupabaseSettings: (next) => { settings = next; dirty = true; } });
    const pending = effects;
    effects = [];
    pending.forEach((effect) => effect());
    return value;
  }
  const harness = {
    emit: (event, session) => authListener(event, session),
    async retry() {
      const pending = [...timers.values()];
      timers.clear();
      pending.forEach((callback) => callback());
      return harness.settle();
    },
    current: () => dirty ? render() : value,
    async settle() {
      for (let i = 0; i < 20; i++) {
        if (dirty) render();
        await nextTurn();
        if (!dirty) return value;
      }
      assert.fail("Auth state did not settle");
    },
  };
  await harness.settle();
  return harness;
}

test("login loads the profile and exposes an authenticated session", async () => {
  const auth = await createAuth();
  await auth.current().onLogin("buyer@example.com", "password");
  const state = await auth.settle();
  assert.equal(state.appSession.access_token, "user-A");
  assert.equal(state.appUser.id, "user-A");
  assert.equal(state.authStatus.type, "ready");
});

test("failed login keeps the session empty and reports the error", async () => {
  const auth = await createAuth({ signInAppUser: async () => { throw new Error("Credenciales inválidas"); } });
  await auth.current().onLogin("buyer@example.com", "wrong");
  const state = await auth.settle();
  assert.equal(state.appSession, null);
  assert.equal(state.appUser, null);
  assert.equal(state.loginStatus.message, "Credenciales inválidas");
});

test("logout clears local authentication even when remote signout fails", async () => {
  let aborted = false;
  const auth = await createAuth({
    loadStoredAppSession: () => ({ access_token: "user-A" }),
    signOutAppUser: async () => { throw new Error("Sin red"); },
    abortActiveSupabaseRequests: () => { aborted = true; },
  });
  await auth.current().onLogout();
  const state = await auth.settle();
  assert.equal(state.appSession, null);
  assert.equal(state.appUser, null);
  assert.equal(state.recoverySession, null);
  assert.equal(state.authScreen, "login");
  assert.equal(aborted, true);
  assert.match(state.loginStatus.message, /Sin red/);
});

test("recovery validates the link and only updates matching passwords", async () => {
  let updates = 0;
  const auth = await createAuth({
    loadRecoverySessionFromUrl: async () => ({ access_token: "recovery" }),
    updateRecoveredPassword: async () => { updates++; },
  });
  assert.equal(auth.current().authScreen, "reset");
  assert.equal(auth.current().recoveryUser.id, "recovery-user");
  await auth.current().onResetPassword("new-password", "different");
  await auth.settle();
  assert.equal(updates, 0);
  await auth.current().onResetPassword("new-password", "new-password");
  const state = await auth.settle();
  assert.equal(updates, 1);
  assert.equal(state.recoverySession, null);
  assert.equal(state.appSession, null);
  assert.equal(state.authScreen, "login");
});

test("invalid recovery links display an error", async () => {
  const auth = await createAuth({ loadRecoverySessionFromUrl: async () => { throw new Error("Enlace vencido"); } });
  assert.equal(auth.current().authScreen, "reset");
  assert.equal(auth.current().recoveryStatus.message, "Enlace vencido");
});

test("a delayed profile from the previous session cannot replace the current user", async () => {
  let finishOldProfile;
  const pending = new Promise((resolve) => { finishOldProfile = resolve; });
  const auth = await createAuth({
    loadStoredAppSession: () => ({ access_token: "user-A" }),
    loadAppUserProfile: async (_, session) => session.access_token === "user-A" ? pending : { id: "user-B", activo: true },
  });
  auth.current().handleSessionRefresh({ access_token: "user-B" });
  await auth.settle();
  finishOldProfile({ id: "user-A", activo: true });
  const state = await auth.settle();
  assert.equal(state.appUser.id, "user-B");
});

test("profile errors invalidate the session", async () => {
  const auth = await createAuth({
    loadStoredAppSession: () => ({ access_token: "user-A" }),
    loadAppUserProfile: async () => { throw new Error("Usuario inactivo"); },
  });
  assert.equal(auth.current().appSession, null);
  assert.equal(auth.current().appUser, null);
  assert.equal(auth.current().loginStatus.message, "Usuario inactivo");
});

test("automatic token rotations update React and keep the authenticated user", async () => {
  const auth = await createAuth({
    loadStoredAppSession: () => ({ access_token: "old" }),
    loadAppUserProfile: async () => ({ id: "buyer", activo: true }),
  });
  for (const token of ["rotated-1", "rotated-2", "rotated-3"]) {
    auth.emit("TOKEN_REFRESHED", { access_token: token });
    const state = await auth.settle();
    assert.equal(state.appSession.access_token, token);
    assert.equal(state.appUser.id, "buyer");
  }
});

test("refreshing recovery credentials never authenticates the application", async () => {
  const auth = await createAuth({
    loadRecoverySessionFromUrl: async () => ({ access_token: "recovery" }),
  });
  auth.emit("TOKEN_REFRESHED", { access_token: "new-recovery" });
  const state = await auth.settle();
  assert.equal(state.appSession, null);
  assert.equal(state.recoverySession.access_token, "new-recovery");
  assert.equal(state.authScreen, "reset");
});

test("remote signout clears React and aborts requests; late refresh cannot restore it", async () => {
  let aborted = false;
  const auth = await createAuth({
    loadStoredAppSession: () => ({ access_token: "active" }),
    abortActiveSupabaseRequests: () => { aborted = true; },
  });
  auth.emit("SIGNED_OUT", null);
  await auth.settle();
  auth.emit("TOKEN_REFRESHED", { access_token: "late" });
  const state = await auth.settle();
  assert.equal(state.appSession, null);
  assert.equal(state.appUser, null);
  assert.equal(aborted, true);
  assert.match(state.loginStatus.message, /sesion termino/);
});

test("temporary permission failures retain the session and retry successfully", async () => {
  let fail = false;
  let signouts = 0;
  const auth = await createAuth({
    loadStoredAppSession: () => ({ access_token: "old" }),
    loadAppUserProfile: async () => {
      if (fail) throw Object.assign(new Error("Unavailable"), { status: 503 });
      return { id: "buyer", activo: true };
    },
    signOutAppUser: async () => { signouts++; },
  });
  fail = true;
  auth.emit("TOKEN_REFRESHED", { access_token: "new" });
  let state = await auth.settle();
  assert.equal(state.appSession.access_token, "new");
  assert.equal(state.appUser.id, "buyer");
  assert.equal(signouts, 0);
  fail = false;
  state = await auth.retry();
  assert.equal(state.authStatus.type, "ready");
});

test("explicit logout uses only the current session scope", async () => {
  let scope;
  const auth = await createAuth({
    loadStoredAppSession: () => ({ access_token: "active" }),
    signOutAppUser: async (_, __, options) => { scope = options.scope; },
  });
  await auth.current().onLogout();
  assert.equal(scope, "local");
});

test("initial SDK session restores authentication and verifies permissions after reload", async () => {
  let profiles = 0;
  const auth = await createAuth({
    loadAppUserProfile: async () => { profiles++; return { id: "buyer", activo: true }; },
  });
  assert.equal(auth.current().appSession, null);
  auth.emit("INITIAL_SESSION", { access_token: "restored" });
  const state = await auth.settle();
  assert.equal(state.appSession.access_token, "restored");
  assert.equal(state.appUser.id, "buyer");
  assert.equal(profiles, 1);
});

test("empty initial SDK session leaves the login available", async () => {
  const auth = await createAuth();
  auth.emit("INITIAL_SESSION", null);
  assert.equal((await auth.settle()).appSession, null);
});
