import assert from "node:assert/strict";
import { test } from "node:test";
import {
  describeLog, getLogChanges, getLogModule, parseLogJson, presentLog,
} from "../src/features/logs/logPresentation.js";

const especial = { actividad_id: "ESP-20261027-001", actividad_nombre: "Liquidación taladros", actividad_tipo: "ESPECIAL" };

test("creación de solicitud especial y de catálogo", () => {
  const log = { ...especial, entidad: "CAMPANAS", accion: "INSERT", valor_nuevo: JSON.stringify({ nombre_actividad: "Liquidación taladros", fecha_inicio: "2026-11-01", fecha_fin: "2026-11-30" }) };
  assert.equal(getLogModule(log), "Solicitud especial");
  assert.equal(describeLog(log), "Creó la solicitud especial «Liquidación taladros» (2026-11-01 a 2026-11-30)");
  const catalogo = { entidad: "CAMPANAS", accion: "INSERT", actividad_id: "cat-1", actividad_tipo: "CATALOGO", actividad_nombre: "Noviembre" };
  assert.equal(describeLog(catalogo), "Creó el catálogo «Noviembre»");
});

test("cambio de estado de solicitud especial muestra antes y después", () => {
  const log = { ...especial, entidad: "CAMPANAS", accion: "CAMBIO_ESTADO", campo: "estado,fecha_estado,tiempo_total_horas",
    valor_anterior: JSON.stringify({ estado: "Nuevo", fecha_estado: null, tiempo_total_horas: 0 }),
    valor_nuevo: JSON.stringify({ estado: "Aprobado", fecha_estado: "2026-10-27T17:00:00Z", tiempo_total_horas: 1.5 }) };
  assert.equal(describeLog(log), "Cambió el estado de la solicitud especial: Nuevo → Aprobado");
  assert.deepEqual(getLogChanges(log).map((item) => item.campo), ["estado"]);
});

test("línea agregada y precio cambiado, formato nuevo con ref", () => {
  const ref = { sku: "152832594", descripcion: "Taladro 1/2", legacy_row_id: "ROW-1" };
  const insert = { ...especial, entidad: "PROMOCIONES", accion: "INSERT", contexto: { ref }, valor_nuevo: JSON.stringify({ sku: "152832594", descripcion: "Taladro 1/2", precio_ahora: 120 }) };
  assert.equal(describeLog(insert), "Agregó el SKU 152832594 – Taladro 1/2 (precio ahora 120)");
  const update = { ...especial, entidad: "PROMOCIONES", accion: "UPDATE", contexto: { ref }, valor_anterior: '{"precio_ahora": 120}', valor_nuevo: '{"precio_ahora": 99}' };
  assert.equal(describeLog(update), "Cambió el precio ahora del SKU 152832594 – Taladro 1/2: 120 → 99");
  assert.equal(presentLog(update).sku, "152832594");
});

test("formato anterior con fila completa: solo muestra lo que cambió", () => {
  const before = { id: "a", sku: "1", descripcion: "X", precio_ahora: 10, version: 1, updated_at: "t1", estado_registro: "BORRADOR" };
  const after = { ...before, precio_ahora: 8, version: 2, updated_at: "t2", estado_registro: "ANULADO" };
  const log = { entidad: "PROMOCIONES", accion: "UPDATE", campo: "*", valor_anterior: JSON.stringify(before), valor_nuevo: JSON.stringify(after), row_id: "ROW-9" };
  assert.deepEqual(getLogChanges(log).map((item) => item.campo), ["precio_ahora", "estado_registro"]);
  assert.equal(describeLog(log), "Anuló el SKU 1 – X");
});

test("comentarios, textos no JSON y acciones antiguas", () => {
  const ref = { sku: "1", descripcion: "X" };
  assert.equal(describeLog({ entidad: "COMENTARIOS", accion: "INSERT", contexto: { ref }, valor_nuevo: '{"comentario":"Revisar precio"}' }), "Comentó en el SKU 1 – X: «Revisar precio»");
  assert.equal(describeLog({ entidad: "COMENTARIOS", accion: "UPDATE", contexto: { ref }, valor_anterior: '{"estado":"ABIERTO"}', valor_nuevo: '{"estado":"RESUELTO"}' }), "Resolvió un comentario del SKU 1 – X");
  assert.equal(describeLog({ entidad: "PROMOCIONES", accion: "DELETE", row_id: "ROW-7" }), "Eliminó la línea ROW-7");
  assert.equal(parseLogJson("texto plano"), null);
  assert.equal(describeLog({ accion: "Sincronizacion importada a Supabase" }), "Sincronizacion importada a Supabase");
  assert.equal(getLogModule({ entidad: "PROMOCIONES", actividad_id: "FID-2026-01" }), "Fidelización");
});
