import assert from "node:assert/strict";
import { test } from "node:test";
import { getMemoryActivityIds, getServerActivityIds, mergeConsultaRows } from "../src/features/consultaSku/consultaSkuSource.js";

const actividades = [
  { actividad_id: "CAT-1" },
  { actividad_id: "CAT-2" },
  { actividad_id: "ESP-1" },
];

test("memoria: actividades cargadas y las que tienen filas locales", () => {
  const rows = [{ actividad_id: "ESP-1", sku: "1" }];
  const ids = getMemoryActivityIds(rows, new Set(["CAT-1"]));
  assert.deepEqual(Array.from(ids).sort(), ["CAT-1", "ESP-1"]);
  assert.deepEqual(Array.from(getMemoryActivityIds([], null)), []);
});

test("al servidor solo se piden las actividades que no estan en memoria", () => {
  assert.deepEqual(getServerActivityIds(actividades, new Set(["CAT-1"])), ["CAT-2", "ESP-1"]);
  assert.deepEqual(getServerActivityIds(actividades, new Set(["CAT-1", "CAT-2", "ESP-1"])), []);
});

test("memoria manda: los cambios sin guardar no se pisan con lo del servidor", () => {
  const memoryIds = new Set(["CAT-1"]);
  const memoryRows = [{ actividad_id: "CAT-1", sku: "100", precio_ahora: 80 }];
  const serverRows = [
    { actividad_id: "CAT-1", sku: "100", precio_ahora: 99 },
    { actividad_id: "CAT-2", sku: "100", precio_ahora: 70 },
  ];
  const merged = mergeConsultaRows(memoryRows, serverRows, memoryIds);
  assert.deepEqual(merged.map((row) => `${row.actividad_id}:${row.precio_ahora}`), ["CAT-1:80", "CAT-2:70"]);
});
