import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const sql = await readFile(new URL("../docs/supabase_g_comercial_notificaciones_responsable.sql", import.meta.url), "utf8");
const ui = await readFile(new URL("../src/features/notifications/NotificationRoutingSettings.jsx", import.meta.url), "utf8");
const service = await readFile(new URL("../src/services/supabase/notificationRouting.js", import.meta.url), "utf8");

test("El responsable asignado es un destino configurable de los cambios de estado", () => {
  assert.match(sql, /destino_tipo in \('ROL', 'GRUPO', 'DUENO', 'RESPONSABLE'\)/);
  assert.match(sql, /set admite_responsable = \(tipo_evento in \('SOLICITUD_ESTADO', 'FIDELIZACION_ESTADO'\)\)/);
  assert.match(sql, /s\.destino_tipo = 'RESPONSABLE' and u\.id = any\(coalesce\(p_responsable_ids/);
  // Solo ADMIN u OPER activos, comparando por nombre.
  assert.match(sql, /u\.rol in \('ADMIN', 'OPER'\)\s+and lower\(btrim\(u\.nombre\)\) = lower\(btrim\(p_responsable\)\)/);
  // El trigger también reacciona a la reasignación.
  assert.match(sql, /after update of estado, responsable on g_comercial\.campanas/);
  // Un fallo del aviso no revierte la operación.
  assert.match(sql, /exception when others then[\s\S]*return new;/);
  assert.match(sql, /^begin;/m);
  assert.match(sql, /^commit;/m);
});

test("Ajustes guarda la casilla y es compatible sin el script", () => {
  assert.match(sql, /p_correo boolean default null, p_responsable boolean default null/);
  assert.match(sql, /v_responsable := coalesce\(p_responsable, exists/);
  assert.match(ui, /Responsable asignado/);
  assert.match(ui, /evento\.admite_responsable && \(/);
  assert.match(service, /typeof responsable === "boolean" \? \{ p_responsable: responsable \} : \{\}/);
});
