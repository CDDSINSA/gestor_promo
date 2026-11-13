import assert from "node:assert/strict";
import { test } from "node:test";
import {
  analyzePromotionDeletes,
  getDeleteApprovalKey,
  isBulkDeleteGroup,
  pruneSyncedIds,
  pruneSyncedPromotionsForActivities,
} from "../src/app/sync/deleteGuard.js";

const snapshot = (actividad_id) => ({ signature: "x", actividad_id });

function syncedState(entries) {
  return new Map(entries.map(([rowId, actividad]) => [rowId, snapshot(actividad)]));
}

test("regla de borrado masivo: mas de 20 y mas del 10 % de la actividad", () => {
  assert.equal(isBulkDeleteGroup({ eliminadas: 20, total: 20 }), false);
  assert.equal(isBulkDeleteGroup({ eliminadas: 21, total: 21 }), true);
  assert.equal(isBulkDeleteGroup({ eliminadas: 25, total: 700 }), false);
  assert.equal(isBulkDeleteGroup({ eliminadas: 71, total: 700 }), true);
});

test("analiza borrados por actividad usando la copia sincronizada", () => {
  const state = syncedState([
    ...Array.from({ length: 30 }, (_, i) => [`A${i}`, "CAT-1"]),
    ...Array.from({ length: 700 }, (_, i) => [`B${i}`, "CAT-2"]),
  ]);
  const deleted = [...Array.from({ length: 25 }, (_, i) => `A${i}`), "B1", "B2", "B2"];
  const review = analyzePromotionDeletes(deleted, state);
  assert.equal(review.total, 27);
  assert.equal(review.isBulk, true);
  assert.deepEqual(review.bulkGroups.map((g) => [g.actividadId, g.eliminadas, g.total]), [["CAT-1", 25, 30]]);
});

test("la clave de aprobacion no depende del orden ni de duplicados", () => {
  assert.equal(getDeleteApprovalKey(["b", "a", "a"]), getDeleteApprovalKey(["a", "b"]));
  assert.notEqual(getDeleteApprovalKey(["a"]), getDeleteApprovalKey(["a", "b"]));
});

test("refresco parcial: las lineas que no llegaron salen de la copia y no se borran al guardar", () => {
  const state = syncedState([["E1", "ESP-1"], ["E2", "ESP-1"], ["E3", "ESP-1"], ["C1", "CAT-1"]]);
  const removed = pruneSyncedPromotionsForActivities(state, new Set(["ESP-1"]), ["E1"]);
  assert.deepEqual(removed.sort(), ["E2", "E3"]);
  assert.deepEqual(Array.from(state.keys()).sort(), ["C1", "E1"]);
});

test("pruneSyncedIds quita solo candidatos que no llegaron", () => {
  const state = new Map([["m1", "s"], ["m2", "s"], ["m3", "s"]]);
  assert.deepEqual(pruneSyncedIds(state, ["m1", "m2"], ["m1"]), ["m2"]);
  assert.deepEqual(Array.from(state.keys()), ["m1", "m3"]);
});
