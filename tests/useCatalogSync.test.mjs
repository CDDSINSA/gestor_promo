import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";

const root = fileURLToPath(new URL("../", import.meta.url));
const promo = { row_id: "P1", actividad_id: "C1", comprador: "A", tipo_promo: "Descuento", sku: "001", descuento: 10, version: 3 };

// Use real payload builders and mappers; replace only remote writes and UI callbacks.
async function createSync({ service = {}, overrides = {}, promotions = [promo] } = {}) {
  let sequence = 0;
  const context = createContext({ window: { crypto: { randomUUID: () => `operation-${++sequence}` } } });
  const calls = [];
  const stub = (values) => new SyntheticModule(Object.keys(values), function () {
    for (const [key, value] of Object.entries(values)) this.setExport(key, value);
  }, { context });
  const remote = stub({
    createLiveNotification: async () => ({ inserted: 1 }),
    hasSupabaseConnection: () => true,
    saveStoredSupabaseConnection: (value) => value,
    loadSavedPromotionsFromSupabase: async () => [],
    saveCatalogToSupabase: async (_, payload) => { calls.push(payload); return { sync_mode: "delta", promociones: [{ row_id: "P1", version: 4 }] }; },
    saveSettingsToSupabase: async (_, payload) => { calls.push(payload); return { sync_mode: "delta", promociones: [] }; },
    ...service,
  });
  const icons = stub(Object.fromEntries(["CalendarDays", "Download", "FileSpreadsheet", "History", "Home", "Images", "ListChecks", "Percent", "Search", "Settings", "TrendingUp"].map((name) => [name, () => null])));
  const modules = new Map();
  async function getModule(filename) {
    if (!modules.has(filename)) modules.set(filename, readFile(filename, "utf8").then((source) => new SourceTextModule(source, { context, identifier: filename })));
    return modules.get(filename);
  }
  async function link(name, parent) {
    if (name === "lucide-react") return icons;
    assert.ok(name.startsWith("."), `Unexpected dependency: ${name}`);
    const base = path.resolve(path.dirname(parent.identifier), name);
    const filename = [base, base + ".js", path.join(base, "index.js")].find((candidate) => candidate.endsWith(".js") && existsSync(candidate));
    assert.ok(filename, `Missing module: ${name}`);
    if (filename === path.join(root, "src/services/supabaseService.js")) return remote;
    return getModule(filename);
  }
  const module = await getModule(path.join(root, "src/hooks/useCatalogSync.js"));
  await module.link(link);
  await module.evaluate();
  const sync = (await getModule(path.join(root, "src/app/sync/syncOptions.js"))).namespace;
  const payloadHelpers = (await getModule(path.join(root, "src/app/sync/savePayload.js"))).namespace;
  const state = { rows: promotions, status: {}, save: "idle", pending: null, conflict: null, snapshots: 0, toasts: 0 };
  const update = (key) => (next) => { state[key] = typeof next === "function" ? next(state[key]) : next; };
  const payload = Object.fromEntries(["config", "catalogos", "actividades", "compradores", "comentarios", "avances_catalogo", "responsables_solicitudes", "jerarquia_categorias", "segmentos_clientes", "notificaciones", "promociones_detalle", "logs"].map((key) => [key, []]));
  payload.promociones = promotions;
  const options = {
    dataState: { status: "ready" }, config: [], catalogos: [], compradores: [],
    supabaseSettings: {}, supabaseConnection: {}, isSyncing: false,
    pendingSaveAction: null, promotionConflict: null,
    setConfig: () => {}, setCatalogos: () => {}, setCompradores: () => {}, setActividades: () => {}, setSupabaseSettings: () => {},
    setRows: update("rows"), setSupabaseStatus: update("status"), setSaveSupabaseStatus: update("save"), setPendingSaveAction: update("pending"), setPromotionConflict: update("conflict"),
    saveOperationInFlightRef: { current: false }, pendingSaveConfirmRef: { current: false },
    buildCatalogPayload: (changes) => ({ ...payload, ...changes }),
    runSupabaseOperation: async (_, operation) => {
      try { return await operation(); }
      catch (error) { state.status = { type: "error", message: error.message }; return null; }
    },
    applyCatalogData: () => { state.applied = true; },
    rememberSyncedPromotions: (rows) => { state.snapshots++; state.synced = rows; },
    rememberSyncedSettings: () => {}, rememberSyncedOperations: () => {},
    showSuccessToast: () => { state.toasts++; },
    onLoadSupabase: async () => ({ promociones: [] }),
  };
  for (const name of ["Promotion", "Buyer", "Activity", "Comment", "Avance", "Responsable", "Jerarquia", "Segmento", "Notificacion"]) options[`synced${name}StateRef`] = { current: new Map() };
  Object.assign(options, overrides);
  return { hook: () => module.namespace.useCatalogSync(options), options, state, calls, payload, sync, payloadHelpers };
}

test("delta save sends changed rows, expected versions and no client audit logs", async () => {
  const untouched = { ...promo, row_id: "P2", actividad_id: "C2" };
  const h = await createSync({ promotions: [{ ...promo, descuento: 20 }, untouched] });
  h.options.syncedPromotionStateRef.current = h.sync.buildPromotionSyncState([promo, untouched]);
  h.payload.logs = [{ accion: "local" }];
  await h.hook().onSaveSupabase();
  assert.equal(h.calls.length, 1);
  const sent = JSON.parse(JSON.stringify(h.calls[0]));
  assert.deepEqual(sent.promociones.map((row) => row.row_id), ["P1"]);
  assert.equal(sent.sync_options.promociones.expected_versions.P1, 3);
  assert.deepEqual(sent.logs, []);
  assert.equal(sent.__full_sync_payload, undefined);
  assert.equal(h.payloadHelpers.getFullSyncPayload(h.calls[0]).promociones.length, 2);
  assert.equal(h.state.rows[0].version, 4);
  assert.equal(h.state.rows[1].version, 3);
  assert.equal(h.state.snapshots, 1);
  assert.equal(h.state.save, "success");
});

test("an unchanged catalog does not write to Supabase", async () => {
  const h = await createSync();
  h.options.syncedPromotionStateRef.current = h.sync.buildPromotionSyncState([promo]);
  await h.hook().onSaveSupabase();
  assert.equal(h.calls.length, 0);
  assert.equal(h.state.save, "success");
  assert.equal(h.options.saveOperationInFlightRef.current, false);
});

test("save failures preserve local rows and do not mark them synchronized", async () => {
  const h = await createSync({ service: { saveCatalogToSupabase: async () => { throw new Error("PROMOTION_VERSION_CONFLICT"); } } });
  await h.hook().onSaveSupabase();
  assert.equal(h.state.save, "error");
  assert.equal(h.state.rows[0].version, 3);
  assert.equal(h.state.snapshots, 0);
  assert.equal(h.state.toasts, 0);
  assert.equal(h.options.saveOperationInFlightRef.current, false);
});

test("only one save can run at a time", async () => {
  let finish;
  let writes = 0;
  const pending = new Promise((resolve) => { finish = resolve; });
  const h = await createSync({ service: { saveCatalogToSupabase: async () => { writes++; return pending; } } });
  const first = h.hook().onSaveSupabase();
  await h.hook().onSaveSupabase();
  assert.equal(writes, 1);
  finish({ sync_mode: "delta", promociones: [] });
  await first;
  assert.equal(h.options.saveOperationInFlightRef.current, false);
});

test("confirmation does not write until its action is executed", async () => {
  const h = await createSync();
  h.hook().onRequestSaveSupabase();
  const first = h.state.pending;
  h.hook().onRequestSaveSupabase();
  assert.equal(h.state.pending, first);
  assert.equal(h.calls.length, 0);
  h.options.pendingSaveAction = first;
  await h.hook().executePendingSaveAction();
  assert.equal(h.calls.length, 1);
  assert.equal(h.state.pending, null);
});

test("data still loading blocks confirmation and direct saves", async () => {
  const h = await createSync({ overrides: { dataState: { status: "loading" } } });
  h.hook().onRequestSaveSupabase();
  await h.hook().onSaveSupabase();
  assert.equal(h.state.pending, null);
  assert.equal(h.calls.length, 0);
});

test("keeping a conflict preserves local data; discarding replaces only its row", async () => {
  const other = { ...promo, row_id: "P2" };
  const h = await createSync({ promotions: [promo, other], overrides: { promotionConflict: { row_id: "P1", current_row: { ...promo, version: 8, descuento: 30 } } } });
  h.hook().keepLocalPromotionConflict();
  assert.equal(h.state.rows[0], promo);
  h.hook().discardLocalPromotionConflict();
  assert.equal(h.state.rows[0].version, 8);
  assert.equal(h.state.rows[1], other);
  assert.equal(h.options.syncedPromotionStateRef.current.get("P1").version, 8);
});

test("settings use their save endpoint and full responses update sync snapshots", async () => {
  let writes = 0;
  const h = await createSync({ service: { saveSettingsToSupabase: async () => { writes++; return { promociones: [promo], actividades: [] }; } } });
  h.hook().onRequestSaveCatalogSettings({ compradores: [] });
  await h.state.pending.action();
  assert.equal(writes, 1);
  assert.equal(h.state.applied, true);
  assert.equal(h.state.snapshots, 1);
  assert.equal(h.state.save, "success");
});

test("deleted promotions retain their expected version in the compact payload", async () => {
  const notices = [];
  const h = await createSync({ promotions: [], service: { createLiveNotification: async (_, event) => { notices.push(event); return { inserted: 1 }; } } });
  h.options.syncedPromotionStateRef.current = h.sync.buildPromotionSyncState([promo]);
  await h.hook().onSaveSupabase();
  const sent = JSON.parse(JSON.stringify(h.calls[0]));
  assert.deepEqual(sent.sync_options.promociones.deleted_row_ids, ["P1"]);
  assert.equal(sent.sync_options.promociones.expected_versions.P1, 3);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].tipoEvento, "PROMOCION_ELIMINADA");
  assert.equal(notices[0].actividadId, "C1");
  assert.match(notices[0].mensaje, /Se eliminó 1 promoción/);
});

test("classification keeps the previous snapshot even when save refreshes it", async () => {
  const notices = [];
  const h = await createSync({ promotions: [{ ...promo, estado_registro: "ANULADO" }], service: {
    createLiveNotification: async (_, event) => { notices.push(event); return { inserted: 1 }; },
  } });
  h.options.syncedPromotionStateRef.current = h.sync.buildPromotionSyncState([{ ...promo, estado_registro: "BORRADOR" }]);
  h.options.rememberSyncedPromotions = (rows) => { h.options.syncedPromotionStateRef.current = h.sync.buildPromotionSyncState(rows); };
  await h.hook().onSaveSupabase();
  assert.equal(notices[0].tipoEvento, "PROMOCION_ANULADA");
});

test("a notification RPC failure keeps the save successful and exposes the reason", async () => {
  const h = await createSync({ service: { createLiveNotification: async () => { throw new Error("RPC missing"); } } });
  await h.hook().onSaveSupabase();
  assert.equal(h.state.save, "success");
  assert.equal(h.state.rows[0].version, 4);
  assert.match(h.state.status.message, /Cambios guardados.*RPC missing/);
});

test("zero recipients are reported; replaying a save does not send duplicate notifications", async () => {
  const h = await createSync({ service: { createLiveNotification: async () => ({ inserted: 0 }) } });
  await h.hook().onSaveSupabase();
  assert.match(h.state.status.message, /no hay destinatarios/);
  let notifications = 0;
  const replay = await createSync({ service: {
    saveCatalogToSupabase: async () => ({ sync_mode: "delta", promociones: [], idempotent_replay: true }),
    createLiveNotification: async () => { notifications++; return { inserted: 1 }; },
  } });
  await replay.hook().onSaveSupabase();
  assert.equal(notifications, 0);
});

test("guardado por partes: si una parte falla, lo ya guardado queda sincronizado y el reintento envía solo lo pendiente", async () => {
  const rows = [
    { ...promo, row_id: "N1", version: undefined },
    { ...promo, row_id: "N2", version: undefined },
  ];
  const h = await createSync({
    promotions: rows,
    service: {
      saveCatalogToSupabase: async (_, payload, options) => {
        h.calls.push(payload);
        options?.onProgress?.({ part: 2, total: 2 });
        const error = new Error("canceling statement due to statement timeout");
        error.partialSave = { promociones: [{ row_id: "N1", version: 1 }], deletedRowIds: [], completedParts: 1, totalParts: 2 };
        throw error;
      },
    },
  });
  await h.hook().onSaveSupabase();
  assert.equal(h.state.save, "error");
  assert.equal(h.state.rows.find((row) => row.row_id === "N1").version, 1);
  assert.equal(h.state.rows.find((row) => row.row_id === "N2").version, undefined);
  assert.equal(h.options.syncedPromotionStateRef.current.get("N1")?.version, 1);
  assert.equal(h.options.syncedPromotionStateRef.current.has("N2"), false);

  // Reintento: la fila N1 ya no figura como cambio; N2 sí.
  h.payload.promociones = h.state.rows;
  const retryOptions = h.sync.buildPromotionSyncOptions(h.state.rows, h.options.syncedPromotionStateRef.current);
  assert.deepEqual([...retryOptions.changed_row_ids], ["N2"]);
});

function buildCatalogRows(count, actividadId = "C1", prefix = "R") {
  return Array.from({ length: count }, (_, index) => ({ ...promo, row_id: `${prefix}${index + 1}`, actividad_id: actividadId, sku: String(1000 + index), version: 1 }));
}

test("borrado masivo: se detiene, pide confirmacion y solo guarda con la aprobacion del mismo conjunto", async () => {
  const synced = buildCatalogRows(40);
  const options = [];
  const h = await createSync({
    promotions: synced.slice(0, 10),
    service: { saveCatalogToSupabase: async (_, payload, saveOptions) => { h.calls.push(payload); options.push(saveOptions); return { sync_mode: "delta", promociones: [] }; } },
  });
  h.options.syncedPromotionStateRef.current = h.sync.buildPromotionSyncState(synced);

  await h.hook().onSaveSupabase({ nativeEvent: {}, preventDefault() {} });
  assert.equal(h.calls.length, 0, "no debe escribir sin confirmacion");
  assert.ok(h.state.pending, "debe pedir confirmacion");
  assert.equal(h.state.pending.tone, "danger");
  assert.match(h.state.pending.description, /30 promociones/);
  assert.ok(h.state.pending.requireAck);
  assert.equal(h.options.saveOperationInFlightRef.current, false);

  h.options.pendingSaveAction = h.state.pending;
  await h.hook().executePendingSaveAction();
  assert.equal(h.calls.length, 1);
  assert.equal(options[0].allowBulkDelete, true);
  assert.equal(h.calls[0].sync_options.promociones.deleted_row_ids.length, 30);
});

test("borrado masivo: una aprobacion no sirve para un conjunto distinto de borrados", async () => {
  const synced = buildCatalogRows(40);
  const h = await createSync({ promotions: synced.slice(0, 10) });
  h.options.syncedPromotionStateRef.current = h.sync.buildPromotionSyncState(synced);
  await h.hook().onSaveSupabase({}, { allowBulkDelete: true, deleteApprovalKey: "R1|R2" });
  assert.equal(h.calls.length, 0);
  assert.ok(h.state.pending);
});

test("borrados pequenos de un catalogo grande no piden confirmacion extra", async () => {
  const synced = buildCatalogRows(700);
  const options = [];
  const h = await createSync({
    promotions: synced.slice(25),
    service: { saveCatalogToSupabase: async (_, payload, saveOptions) => { h.calls.push(payload); options.push(saveOptions); return { sync_mode: "delta", promociones: [] }; } },
  });
  h.options.syncedPromotionStateRef.current = h.sync.buildPromotionSyncState(synced);
  await h.hook().onSaveSupabase();
  assert.equal(h.calls.length, 1);
  assert.equal(h.state.pending, null);
  assert.equal(options[0].allowBulkDelete, false);
  assert.equal(h.calls[0].sync_options.promociones.deleted_row_ids.length, 25);
});

test("ajustes: un borrado masivo arrastrado tambien se detiene", async () => {
  const synced = buildCatalogRows(30, "ESP-1");
  const h = await createSync({ promotions: [] });
  h.options.syncedPromotionStateRef.current = h.sync.buildPromotionSyncState(synced);
  await h.hook().onRequestSaveCatalogSettings({});
  h.options.pendingSaveAction = h.state.pending;
  await h.hook().executePendingSaveAction();
  assert.equal(h.calls.length, 0);
  assert.equal(h.state.pending.tone, "danger");
});

test("si Supabase bloquea un borrado masivo que la app no detecto, se pide confirmacion y el reintento lo autoriza", async () => {
  const synced = buildCatalogRows(700);
  const options = [];
  let attempt = 0;
  const h = await createSync({
    promotions: synced.slice(25),
    service: {
      saveCatalogToSupabase: async (_, payload, saveOptions) => {
        attempt++;
        options.push(saveOptions);
        if (attempt === 1) {
          const error = new Error("Supabase bloqueo el borrado masivo");
          error.code = "PROMO_BULK_DELETE_BLOCKED";
          error.details = { actividad_id: "C1", eliminadas: 25, total: 30 };
          throw error;
        }
        h.calls.push(payload);
        return { sync_mode: "delta", promociones: [] };
      },
    },
  });
  h.options.syncedPromotionStateRef.current = h.sync.buildPromotionSyncState(synced);
  await h.hook().onSaveSupabase();
  assert.equal(h.calls.length, 0);
  assert.equal(h.state.pending.tone, "danger");
  assert.match(h.state.pending.note, /C1: 25 de 30/);
  assert.equal(h.state.snapshots, 0);
  h.options.pendingSaveAction = h.state.pending;
  await h.hook().executePendingSaveAction();
  assert.equal(options[1].allowBulkDelete, true);
  assert.equal(h.calls.length, 1);
});

test("conflicto en lineas nuevas ya guardadas (respuesta perdida): se reconocen y se reintenta solo lo pendiente", async () => {
  const nueva = (id, extra = {}) => ({ row_id: id, actividad_id: "C1", comprador: "A", tipo_promo: "Descuento", sku: id, cantidad_minima: 1, precio_antes: 1244, precio_ahora: 808.6, descuento: 0.35, ...extra });
  const rows = [nueva("N1"), nueva("N2"), nueva("N3", { precio_ahora: 700 })];
  const saveCalls = [];
  const h = await createSync({
    promotions: rows,
    service: {
      // Supabase ya tiene N1 y N2 (formato numerico distinto) y N3 con otro precio.
      loadSavedPromotionsFromSupabase: async (_, ids) => {
        assert.deepEqual(Array.from(ids), ["C1"]);
        return [
          { ...nueva("N1"), cantidad_minima: "1.00", precio_antes: "1244.00", precio_ahora: "808.60", version: 1 },
          { ...nueva("N2"), version: 1 },
          { ...nueva("N3"), precio_ahora: "650.00", version: 1 },
        ];
      },
      saveCatalogToSupabase: async (_, payload) => {
        saveCalls.push(payload);
        if (saveCalls.length === 1) {
          const error = new Error("La promocion cambio en Supabase desde que fue abierta.");
          error.code = "PROMOTION_VERSION_CONFLICT";
          error.conflict = { type: "PROMOTION_VERSION_CONFLICT", action: "update", conflicts: [{ row_id: "N1", expected_version: null, current_version: 1 }] };
          throw error;
        }
        return { sync_mode: "delta", promociones: [{ row_id: "N3", version: 1 }] };
      },
    },
  });
  await h.hook().onSaveSupabase();
  assert.equal(saveCalls.length, 2);
  assert.deepEqual(Array.from(saveCalls[0].sync_options.promociones.changed_row_ids).sort(), ["N1", "N2", "N3"]);
  // El reintento ya no envia N1 ni N2; N3 sigue pendiente (su contenido difiere).
  assert.deepEqual(Array.from(saveCalls[1].sync_options.promociones.changed_row_ids), ["N3"]);
  assert.equal(h.state.rows.find((row) => row.row_id === "N1").version, 1);
  assert.equal(h.state.rows.find((row) => row.row_id === "N2").version, 1);
  assert.equal(h.state.conflict, null);
  assert.equal(h.state.save, "success");
});

test("el reconocimiento se intenta una sola vez: si vuelve el conflicto, se muestra", async () => {
  const row = (id) => ({ row_id: id, actividad_id: "C1", comprador: "A", tipo_promo: "Descuento", sku: id, precio_ahora: 10 });
  let calls = 0;
  let loads = 0;
  const h = await createSync({
    promotions: [row("N1"), row("N2")],
    service: {
      // N1 ya esta guardada; N2 no aparece en Supabase, pero el servidor sigue rechazando.
      loadSavedPromotionsFromSupabase: async () => { loads += 1; return [{ ...row("N1"), version: 1 }]; },
      saveCatalogToSupabase: async () => {
        calls += 1;
        const error = new Error("conflicto");
        error.code = "PROMOTION_VERSION_CONFLICT";
        error.conflict = { conflicts: [{ row_id: "N2", expected_version: null, current_version: 2 }] };
        throw error;
      },
    },
  });
  await h.hook().onSaveSupabase();
  assert.equal(calls, 2);
  assert.equal(loads, 1);
  assert.equal(h.state.save, "error");
});

test("reconocimiento: formato numerico distinto no es diferencia; el aviso oculta esas diferencias", async () => {
  const { sync, payloadHelpers } = await createSync();
  const base = { row_id: "R1", actividad_id: "C1", tipo_promo: "Descuento", sku: "100392291", cantidad_minima: 1, precio_antes: 1244, precio_ahora: 808.6, descuento: 0.35 };
  assert.equal(sync.isSamePromotionFieldValue("1", "1.00"), true);
  assert.equal(sync.isSamePromotionFieldValue("808.6", "808.60"), true);
  assert.equal(sync.isSamePromotionFieldValue("808.6", "808.65"), false);
  assert.equal(sync.isSamePromotionFieldValue("", "0"), false);
  assert.equal(sync.isSamePromotionContent(base, { ...base, cantidad_minima: "1.00", precio_antes: "1244.00", precio_ahora: "808.60" }), true);
  assert.equal(sync.isSamePromotionContent(base, { ...base, precio_ahora: "700.00" }), false);
  const found = sync.findUnconfirmedSavedPromotions(
    [base, { ...base, row_id: "R2" }, { ...base, row_id: "R3" }],
    [{ ...base, precio_ahora: "808.60", version: 1 }, { ...base, row_id: "R2", precio_ahora: 1, version: 1 }],
  );
  assert.deepEqual(JSON.parse(JSON.stringify(found)), [{ row_id: "R1", version: 1 }]);
  const conflict = payloadHelpers.normalizePromotionConflict({ conflicts: [{ row_id: "R1", expected_version: null, current_version: 1, fields: [
    { field: "cantidad_minima", user: "1", current: "1.00" },
    { field: "precio_ahora", user: "808.6", current: "700.00" },
  ] }] });
  assert.deepEqual(conflict.fields.map((item) => item.field), ["precio_ahora"]);
});

test("reconocimiento: una linea guardada sin comprador en el mapeo no se confunde (estado distinto)", async () => {
  const { sync } = await createSync();
  const local = { row_id: "R1", actividad_id: "C1", comprador: "Ana", tipo_promo: "Descuento", sku: "100392291", tipo_cantidad: "Exacta", cantidad_minima: 1, precio_antes: 243.44, precio_ahora: 158.24, descuento: 0.35, aplica_segmento: "NO" };
  assert.equal(sync.getPromotionContentDifference(local, { ...local, comprador: "" }), "estado_registro");
  assert.equal(sync.getPromotionContentDifference(local, { ...local, cantidad_minima: "1.00", precio_antes: "243.44", precio_ahora: "158.24" }), "");
});
