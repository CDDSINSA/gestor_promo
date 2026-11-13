import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeCatalogSaveResponses, splitCatalogSavePayload } from "../src/services/supabase/saveChunks.js";

const simple = (index) => ({ row_id: `S${index}`, actividad_id: "C1", tipo_promo: "Descuento", sku: `SKU${index}` });
const combo = (id, oferta, tipoSku) => ({ row_id: id, actividad_id: "C1", tipo_promo: "Combo", oferta_id: oferta, tipo_sku: tipoSku, sku: id });

function buildPayload(rows, extra = {}) {
  return {
    operation_id: "save-catalog-op",
    promociones: rows,
    promociones_detalle: rows.map((row) => ({ row_id: row.row_id, campo: "nota", valor: "x" })),
    actividades: [{ actividad_id: "C1" }],
    comentarios: [{ comentario_id: "K1" }],
    logs: [],
    sync_options: {
      actividades: { changed_ids: ["C1"] },
      comentarios: { changed_ids: ["K1"] },
      promociones: {
        changed_row_ids: rows.map((row) => row.row_id),
        deleted_row_ids: ["D1"],
        expected_versions: { S0: 2, D1: 5 },
        touched_context_keys: ["C1::Combo::OF1"],
        ...extra,
      },
    },
  };
}

test("un guardado pequeño se envía en una sola llamada sin cambios", () => {
  const payload = buildPayload([simple(0), simple(1)]);
  const chunks = splitCatalogSavePayload(payload, 5);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0], payload);
});

test("6.000 SKU se dividen en partes y cada fila viaja una sola vez", () => {
  const rows = Array.from({ length: 6000 }, (_, index) => simple(index));
  const chunks = splitCatalogSavePayload(buildPayload(rows), 500);
  assert.equal(chunks.length, 12);
  const sent = chunks.flatMap((chunk) => chunk.sync_options.promociones.changed_row_ids);
  assert.equal(sent.length, 6000);
  assert.equal(new Set(sent).size, 6000);
  chunks.forEach((chunk) => {
    const ids = new Set(chunk.sync_options.promociones.changed_row_ids);
    assert.ok(ids.size <= 500);
    assert.ok(chunk.promociones.every((row) => ids.has(row.row_id)));
    assert.ok(chunk.promociones_detalle.every((row) => ids.has(row.row_id)));
    assert.deepEqual(chunk.logs, []);
  });
  // Eliminaciones, versiones y ajustes solo en la primera parte; comentarios en la última.
  assert.deepEqual(chunks[0].sync_options.promociones.deleted_row_ids, ["D1"]);
  assert.deepEqual(chunks[0].sync_options.promociones.expected_versions, { S0: 2, D1: 5 });
  assert.equal(chunks[0].actividades.length, 1);
  assert.equal(chunks[0].comentarios.length, 0);
  assert.deepEqual(chunks[1].sync_options.promociones.deleted_row_ids, []);
  assert.equal(chunks[1].actividades.length, 0);
  assert.equal(chunks[11].comentarios.length, 1);
});

test("las ofertas agrupadas quedan completas en la primera parte", () => {
  const rows = [
    ...Array.from({ length: 9 }, (_, index) => simple(index)),
    combo("CB1", "OF1", "principal"),
    combo("CB2", "OF1", "regalia"),
    combo("CB3", "OF2", "principal"),
  ];
  // CB3 no cambió, pero se envía como contexto de la oferta.
  const payload = buildPayload(rows, { changed_row_ids: rows.filter((row) => row.row_id !== "CB3").map((row) => row.row_id) });
  const chunks = splitCatalogSavePayload(payload, 4);
  const first = chunks[0];
  assert.deepEqual(first.sync_options.promociones.changed_row_ids.slice(0, 2), ["CB1", "CB2"]);
  assert.ok(first.promociones.some((row) => row.row_id === "CB3"));
  assert.ok(chunks.slice(1).every((chunk) => chunk.promociones.every((row) => row.tipo_promo !== "Combo")));
  assert.deepEqual(first.sync_options.promociones.touched_context_keys, ["C1::Combo::OF1"]);
  assert.deepEqual(chunks[1].sync_options.promociones.touched_context_keys, []);
});

test("mergeCatalogSaveResponses junta versiones y suma conteos", () => {
  const merged = mergeCatalogSaveResponses([
    { sync_mode: "delta", promociones: [{ row_id: "A", version: 1 }], cambios: { promociones_actualizadas: 1, promociones_eliminadas: 1 } },
    { sync_mode: "delta", promociones: [{ row_id: "B", version: 2 }], cambios: { promociones_actualizadas: 1, promociones_eliminadas: 0 } },
  ]);
  assert.deepEqual(merged.promociones.map((row) => row.row_id), ["A", "B"]);
  assert.deepEqual(merged.cambios, { promociones_actualizadas: 2, promociones_eliminadas: 1 });
  assert.equal(merged.partes, 2);
  assert.equal(merged.idempotent_replay, false);
});
