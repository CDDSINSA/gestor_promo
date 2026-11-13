import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";

// Isolate the hook's asynchronous callbacks; this does not test DOM rendering.
async function createHarness(load) {
  const context = createContext({ AbortController });
  const slots = [];
  const cleanups = [];
  let cursor = 0;
  function stub(values) {
    return new SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context });
  }
  const react = stub({
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (next) => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useCallback: (callback) => callback,
    useEffect(effect) {
      const index = cursor++;
      if (!(index in slots)) {
        slots[index] = true;
        cleanups.push(effect());
      }
    },
  });
  const service = stub({
    hasSupabaseConnection: () => true,
    loadSkuMasterBySkusFromSupabase: load,
  });
  const module = new SourceTextModule(await readFile(new URL("../src/hooks/useSkuMaster.js", import.meta.url), "utf8"), { context });
  await module.link((name) => name === "react" ? react : service);
  await module.evaluate();
  return {
    render() {
      cursor = 0;
      return module.namespace.useSkuMaster({ session: { access_token: "user-token" } });
    },
    unmount() { cleanups.forEach((cleanup) => cleanup?.()); },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

const result = { skuMaster: { "001": { sku: "001", descripcion: "Artículo BD" } }, skuMasterCount: 1 };

test("opening with no SKUs makes no request; cache stores hits and misses", async () => {
  const calls = [];
  const h = await createHarness(async (_, skus) => { calls.push([...skus]); return result; });
  await h.render().ensureSkuMasterLoaded();
  assert.equal(calls.length, 0);
  await h.render().ensureSkuMasterLoaded(["001", "999", "001"]);
  await h.render().ensureSkuMasterLoaded(["001", "999"]);
  assert.deepEqual(calls, [["001", "999"]]);
  assert.equal(h.render().skuMasterCount, 1);
});

test("overlapping requests share pending SKUs and merge results", async () => {
  const pending = deferred();
  const calls = [];
  const h = await createHarness(async (_, skus) => {
    calls.push([...skus]);
    return skus.includes("001") ? pending.promise : { skuMaster: { "002": { sku: "002" } } };
  });
  const first = h.render().ensureSkuMasterLoaded(["001"]);
  const second = h.render().ensureSkuMasterLoaded(["001", "002"]);
  pending.resolve(result);
  await Promise.all([first, second]);
  assert.deepEqual(calls, [["001"], ["002"]]);
  assert.equal(h.render().skuMasterCount, 2);
});

test("cancel/reset reject late responses without leaking previous session data", async () => {
  const pending = deferred();
  let signal;
  let calls = 0;
  const h = await createHarness(async (_, skus, options) => {
    signal = options.signal;
    return ++calls === 1 ? pending.promise : result;
  });
  const loading = h.render().ensureSkuMasterLoaded(["001"]);
  const rejected = assert.rejects(loading, /cancelada/);
  h.render().resetSkuMaster();
  assert.equal(signal.aborted, true);
  pending.resolve(result);
  await rejected;
  assert.equal(h.render().skuMasterCount, 0);
  await h.render().ensureSkuMasterLoaded(["001"]);
  assert.equal(h.render().skuMasterCount, 1);
  h.unmount();
});

test("a failed lookup is retryable and preserves other cached articles", async () => {
  let failed = false;
  const h = await createHarness(async (_, skus) => {
    if (skus.includes("002") && !failed) { failed = true; throw new Error("BD no disponible"); }
    return skus.includes("001") ? result : { skuMaster: { "002": { sku: "002" } } };
  });
  await h.render().ensureSkuMasterLoaded(["001"]);
  await assert.rejects(h.render().ensureSkuMasterLoaded(["002"]), /BD no disponible/);
  assert.equal(h.render().skuMasterCount, 1);
  assert.equal(h.render().skuMasterStatus.type, "error");
  await h.render().ensureSkuMasterLoaded(["002"]);
  assert.equal(h.render().skuMasterCount, 2);
  assert.equal(h.render().skuMasterStatus.type, "ready");
});

test("admin refresh reloads requested codes including negative cache only", async () => {
  const calls = [];
  const h = await createHarness(async (_, skus) => { calls.push([...skus]); return result; });
  await h.render().ensureSkuMasterLoaded(["001", "999"]);
  await h.render().loadSkuMasterFromRemote();
  assert.deepEqual(calls, [["001", "999"], ["001", "999"]]);
});
