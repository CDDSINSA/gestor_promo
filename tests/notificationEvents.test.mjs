import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCatalogNotificationEvents, buildDesignNotificationEvent } from "../src/features/notifications/notificationEvents.js";
import { deliverNotifications } from "../src/features/notifications/deliverNotifications.js";

const payload = {
  promociones: [
    { row_id: "P1", actividad_id: "A1", buyer_id: "B1" },
    { row_id: "P2", actividad_id: "A2", buyer_id: "B2" },
    { row_id: "P3", actividad_id: "A1", buyer_id: "B3" },
  ],
  comentarios: [
    { comentario_id: "C1", actividad_id: "A1", row_id: "P1", estado: "ABIERTO" },
    { comentario_id: "C2", actividad_id: "A2", row_id: "P2", estado: "RESUELTO" },
  ],
  sync_options: { comentarios: { changed_ids: ["C1", "C2"] } },
};

test("marketing comments notify each responsible buyer without broadcasting to BUYER", () => {
  const events = buildCatalogNotificationEvents(payload, { actorRole: "MARK" });
  assert.deepEqual(events.map((event) => event.destinatarioBuyerIds), [["B1"], ["B2"]]);
  assert.deepEqual(events.map((event) => event.destinatarioRoles), [[], []]);
  assert.deepEqual(events.map((event) => event.actividadId), ["A1", "A2"]);
});

test("buyer comments, including resolved ones, are directed to marketing", () => {
  const events = buildCatalogNotificationEvents(payload, { actorRole: "COMPRADOR" });
  assert.ok(events.every((event) => event.tipoEvento === "COMENTARIO_COMPRAS"));
  assert.ok(events.every((event) => event.destinatarioRoles.join() === "MARK" && !event.destinatarioBuyerIds.length));
});

test("activity comment only includes buyers in that activity", () => {
  const events = buildCatalogNotificationEvents({ ...payload, comentarios: [{ ...payload.comentarios[0], row_id: "" }] }, { actorRole: "MARK" });
  assert.deepEqual(events[0].destinatarioBuyerIds, ["B1", "B3"]);
});

test("unresolved buyer never falls back to broadcasting", async () => {
  const [event] = buildCatalogNotificationEvents({ ...payload, promociones: [] }, { actorRole: "MARK" });
  assert.deepEqual(event.destinatarioRoles, []);
  assert.deepEqual(event.destinatarioBuyerIds, []);
  const warnings = await deliverNotifications([event], async () => ({ inserted: 0, skipped: "without_recipients" }));
  assert.equal(warnings.length, 1);
});

test("promotions are grouped by changed activity; settings emit no client event", () => {
  const events = buildCatalogNotificationEvents({ ...payload, sync_options: { promociones: { changed_row_ids: ["P1", "P2", "P3"] } } });
  assert.deepEqual(events.map((event) => [event.actividadId, event.metadata.promotionChanges]), [["A1", 2], ["A2", 1]]);
  const settings = buildCatalogNotificationEvents({ actividades: [{ actividad_id: "A1" }, { actividad_id: "A2" }], sync_options: { actividades: { changed_ids: ["A2"] } } }, { operationType: "settings" });
  assert.equal(settings.length, 0, "catalog changes are notified by the database");
});

const design = { page: { id: "P1", proyecto_id: "D1", numero_pagina: 3, comprador_id: "B1", disenador_id: "U1" }, project: { id: "D1", catalogo_id: "A1", nombre_proyecto: "Catalogo" } };

test("mixed saves describe additions, modifications, annulments and deletions separately", () => {
  const previousPromotions = new Map([
    ["edit", { actividad_id: "A1", estado_registro: "BORRADOR" }],
    ["annul", { actividad_id: "A1", estado_registro: "BORRADOR" }],
    ["deleted", { actividad_id: "A2" }],
  ]);
  const events = buildCatalogNotificationEvents({
    catalogos: [{ id: "A1", nombre: "Septiembre" }, { id: "A2", nombre: "Octubre" }],
    promociones: [
      { row_id: "new", actividad_id: "A1" },
      { row_id: "edit", actividad_id: "A1", estado_registro: "BORRADOR" },
      { row_id: "annul", actividad_id: "A1", estado_registro: "ANULADO" },
    ],
    sync_options: { promociones: { changed_row_ids: ["new", "edit", "annul"], deleted_row_ids: ["deleted"] } },
  }, { previousPromotions });
  assert.deepEqual(events.map((event) => event.metadata.changeType), ["added", "modified", "annulled", "deleted"]);
  assert.match(events[0].mensaje, /Se agregó 1 promoción en el catálogo «Septiembre»/);
  assert.match(events[1].mensaje, /Se modificó 1 promoción/);
  assert.match(events[2].mensaje, /Se anuló 1 promoción/);
  assert.match(events[3].mensaje, /Se eliminó 1 promoción en el catálogo «Octubre»/);
  assert.equal(events[3].actividadId, "A2");
  assert.equal(events[3].rowId, undefined); // Deleted rows cannot be resolved through a live FK.
});

test("persisted rows without versions are modified; previously annulled rows are not announced as new annulments", () => {
  const previousPromotions = new Map([["P1", { estado_registro: "ANULADO" }], ["P2", { version: null }]]);
  const events = buildCatalogNotificationEvents({
    promociones: [{ row_id: "P1", actividad_id: "A1", estado_registro: "ANULADO" }, { row_id: "P2", actividad_id: "A1" }],
    sync_options: { promociones: { changed_row_ids: ["P1", "P2"] } },
  }, { previousPromotions });
  assert.equal(events.length, 1);
  assert.match(events[0].mensaje, /Se modificaron 2 promociones/);
  assert.equal(events[0].metadata.changeType, "modified");
});
test("design review targets marketing and assigned designer, not unrelated buyers", () => {
  const event = buildDesignNotificationEvent({ ...design, actorRole: "BUYER", action: "review", state: "aprobada", commentId: "DC1" });
  assert.deepEqual(event.destinatarioRoles, ["MARK"]);
  assert.deepEqual(event.destinatarioUsuarioIds, ["U1"]);
  assert.deepEqual(event.destinatarioBuyerIds, []);
  assert.equal(event.urlModulo, "catalogDesign");
  assert.equal(event.comentarioId, undefined);
  assert.equal(event.metadata.comentarioDisenoId, "DC1");
});

test("marketing design comments target assigned buyer and designer", () => {
  const event = buildDesignNotificationEvent({ ...design, actorRole: "MARK", action: "comment" });
  assert.deepEqual(event.destinatarioRoles, []);
  assert.deepEqual(event.destinatarioBuyerIds, ["B1"]);
  assert.deepEqual(event.destinatarioUsuarioIds, ["U1"]);
  assert.equal(event.actividadId, "A1");
});

test("notification failures preserve successful operations and do not stop other recipients", async () => {
  let calls = 0;
  const warnings = await deliverNotifications([{ titulo: "Uno" }, { titulo: "Dos" }, { titulo: "Tres" }, null], async () => {
    calls++;
    if (calls === 1) throw new Error("RPC unavailable");
    if (calls === 2) return { inserted: 0, skipped: "disabled_for_campaign" };
    return { inserted: 1 };
  });
  assert.equal(calls, 3);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /RPC unavailable/);
});

test("promotion changes route to assigned catalog designers when provided", () => {
  const events = buildCatalogNotificationEvents({
    promociones: [{ row_id: "P1", actividad_id: "CAT1" }],
    sync_options: { promociones: { changed_row_ids: ["P1"] } },
  }, {
    catalogDesigners: { CAT1: ["DES-01", "DES-02"] },
  });
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].destinatarioUsuarioIds, ["DES-01", "DES-02"]);
  assert.deepEqual(events[0].destinatarioRoles, []);
  assert.equal(events[0].urlModulo, "catalogDesign");
});

test("buyer comments route to assigned catalog designers when provided", () => {
  const events = buildCatalogNotificationEvents({
    promociones: [{ row_id: "P1", actividad_id: "CAT1", buyer_id: "B1" }],
    comentarios: [{ comentario_id: "C1", actividad_id: "CAT1", row_id: "P1", estado: "ABIERTO" }],
    sync_options: { comentarios: { changed_ids: ["C1"] } },
  }, {
    actorRole: "COMPRADOR",
    catalogDesigners: { CAT1: ["DES-01"] },
  });
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].destinatarioUsuarioIds, ["DES-01"]);
  assert.deepEqual(events[0].destinatarioRoles, []);
  assert.equal(events[0].urlModulo, "catalogDesign");
});

test("promotion changes fall back to marketing when no catalog designers are assigned", () => {
  const events = buildCatalogNotificationEvents({
    promociones: [{ row_id: "P1", actividad_id: "CAT1" }],
    sync_options: { promociones: { changed_row_ids: ["P1"] } },
  }, {
    catalogDesigners: {},
  });
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].destinatarioUsuarioIds, []);
  assert.deepEqual(events[0].destinatarioRoles, ["MARK"]);
  assert.equal(events[0].urlModulo, "consolidado");
});

