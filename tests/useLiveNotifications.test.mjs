import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";

async function harness(load = async () => [], count = async () => 0) {
  const calls = [];
  const listeners = new Map();
  const surface = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name) => listeners.delete(name) };
  const context = createContext({ window: surface, document: { ...surface, visibilityState: "visible" } });
  const slots = [];
  let cursor = 0;
  let effects = [];
  let dirty = false;
  let result;
  let loads = 0;
  let removed = 0;
  const channels = [];
  const toasts = [];
  const props = { connection: { url: "test", session: { access_token: "token" } }, currentUserId: "A", onIncoming: (item) => toasts.push(item) };
  const same = (a, b) => a && b && a.length === b.length && a.every((x, i) => x === b[i]);
  const stub = (values) => new SyntheticModule(Object.keys(values), function () {
    Object.entries(values).forEach(([key, value]) => this.setExport(key, value));
  }, { context });
  const react = stub({
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: initial };
      return [slots[index].value, (next) => {
        slots[index].value = typeof next === "function" ? next(slots[index].value) : next;
        dirty = true;
      }];
    },
    useRef(initial) { const index = cursor++; slots[index] ??= { current: initial }; return slots[index]; },
    useMemo(fn) { cursor++; return fn(); },
    useEffect(fn, deps) {
      const index = cursor++;
      if (same(slots[index]?.deps, deps)) return;
      const old = slots[index];
      slots[index] = { deps };
      effects.push(() => { old?.cleanup?.(); slots[index].cleanup = fn(); });
    },
  });
  const service = stub({
    getSupabaseSchema: () => "g_comercial",
    loadLiveNotifications: async (...args) => { loads++; calls.push(args[1]); return load(...args); },
    countUnreadLiveNotifications: async () => count(),
    mapRealtimeNotification: (row) => ({ ...row, createdAt: row.created_at }),
    markLiveNotificationRead: async (_, id) => ({ id, leida: true }),
    markAllLiveNotificationsRead: async () => [],
    createNotificationsRealtimeClient: () => ({
      channel() {
        const channel = { handlers: {}, on(_, filter, fn) { this.handlers[filter.event] = fn; return this; }, subscribe(fn) { this.status = fn; return this; } };
        channels.push(channel);
        return channel;
      },
      removeChannel() { removed++; },
    }),
  });
  const module = new SourceTextModule(await readFile(new URL("../src/hooks/useLiveNotifications.js", import.meta.url), "utf8"), { context });
  await module.link((name) => name === "react" ? react : service);
  await module.evaluate();
  const render = () => {
    cursor = 0; dirty = false;
    result = module.namespace.useLiveNotifications(props);
    const pending = effects; effects = []; pending.forEach((fn) => fn());
  };
  const flush = async () => {
    for (let i = 0; i < 8; i++) { await Promise.resolve(); if (dirty) render(); }
  };
  render();
  await flush();
  return { props, calls, channels, toasts, listeners, render, flush, get value() { return result; }, get loads() { return loads; }, get removed() { return removed; } };
}

const row = (id, user = "A") => ({ id, destinatario_usuario_id: user, created_at: "2026-09-17T12:00:00Z", leida: false });
test("reconnect and returning to the tab recover saved notifications", async () => {
  const h = await harness(async () => [row("N1")]);
  h.channels[0].status("SUBSCRIBED");
  await h.flush();
  assert.equal(h.loads, 2);
  h.listeners.get("visibilitychange")();
  await h.flush();
  assert.equal(h.loads, 3);
  assert.equal(h.value.items.length, 1);
  assert.equal(h.toasts.length, 0);
});

test("updates synchronize read state without a toast; foreign recipients are ignored", async () => {
  const h = await harness();
  const channel = h.channels[0];
  channel.handlers.INSERT({ new: row("N1"), eventType: "INSERT" });
  await h.flush();
  assert.equal(h.value.unreadCount, 1);
  channel.handlers.UPDATE({ new: { ...row("N1"), leida: true }, eventType: "UPDATE" });
  channel.handlers.INSERT({ new: row("N2", "B"), eventType: "INSERT" });
  await h.flush();
  assert.equal(h.value.unreadCount, 0);
  assert.equal(h.value.items.length, 0, "the unread view hides read notifications");
  assert.equal(h.toasts.length, 1);
});

test("an incoming event is preserved when an older HTTP snapshot completes", async () => {
  let finish;
  const h = await harness(() => new Promise((resolve) => { finish = resolve; }));
  h.channels[0].handlers.INSERT({ new: row("N1"), eventType: "INSERT" });
  finish([]);
  await h.flush();
  assert.equal(h.value.items[0].id, "N1");
});

test("late responses and old channels cannot leak notifications after account change", async () => {
  let finish;
  let calls = 0;
  const h = await harness(() => ++calls === 1 ? new Promise((resolve) => { finish = resolve; }) : Promise.resolve([]));
  h.props.currentUserId = "B";
  h.render();
  finish([row("N1")]);
  h.channels[0].handlers.INSERT({ new: row("N2"), eventType: "INSERT" });
  await h.flush();
  assert.equal(h.value.items.length, 0);
  assert.equal(h.removed, 1);
});

test("a successful subscription does not hide a failed HTTP load", async () => {
  const h = await harness(async () => { throw new Error("Permission denied"); });
  h.channels[0].status("SUBSCRIBED");
  await h.flush();
  assert.equal(h.value.status.type, "error");
  assert.equal(h.value.status.message, "Permission denied");
});

const page = (prefix, size, read = false) => Array.from({ length: size }, (_, i) => ({
  ...row(`${prefix}${i}`), leida: read, createdAt: `2026-09-17T12:${String(59 - i).padStart(2, "0")}:00Z`,
}));

test("opens on unread notifications, pages by 20 and continues from the oldest loaded item", async () => {
  const h = await harness(async (_, options) => options.before ? page("B", 3) : page("A", 20), async () => 23);
  assert.equal(h.calls[0].unreadOnly, true);
  assert.equal(h.calls[0].limit, 20);
  assert.equal(h.value.items.length, 20);
  assert.equal(h.value.hasMore, true);
  assert.equal(h.value.unreadCount, 23, "badge uses the server count");
  await h.value.loadMore();
  await h.flush();
  assert.equal(h.calls.at(-1).before, "2026-09-17T12:40:00Z");
  assert.equal(h.value.items.length, 23);
  assert.equal(h.value.hasMore, false);
});

test("switching to all notifications reloads read items too", async () => {
  const h = await harness(async (_, options) => options.unreadOnly ? page("U", 2) : [...page("U", 2), ...page("R", 2, true)]);
  h.value.setView("all");
  await h.flush();
  assert.equal(h.calls.at(-1).unreadOnly, false);
  assert.equal(h.value.view, "all");
  assert.equal(h.value.items.length, 4);
  await h.value.markRead(h.value.items[0].id);
  await h.flush();
  assert.equal(h.value.items.length, 4, "the full view keeps read items");
});
