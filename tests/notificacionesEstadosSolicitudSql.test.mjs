import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const sql = await readFile(new URL("../docs/supabase_g_comercial_notificaciones_estados_solicitud.sql", import.meta.url), "utf8");
const settings = await readFile(new URL("../src/features/notifications/NotificationRoutingSettings.jsx", import.meta.url), "utf8");

test("La lista inicial es Aprobado y Finalizado, solo la primera vez", () => {
  const first = sql.slice(sql.indexOf("if not exists ("), sql.indexOf("end if;"));
  assert.match(first, /column_name = 'estados_aviso'/);
  assert.match(first, /set estados_aviso = array\['Aprobado', 'Finalizado'\]/);
  assert.match(first, /tipo_evento in \('SOLICITUD_ESTADO', 'FIDELIZACION_ESTADO'\)/);
});

test("El aviso de estado se filtra y la asignación no se pierde", () => {
  const fn = sql.slice(sql.indexOf("create or replace function g_comercial.notify_special_request_change()"), sql.indexOf("-- 4) Guardado"));
  assert.match(fn, /v_estado_anterior <> v_estado\s+and g_comercial\.special_request_state_notifies\(v_tipo, v_estado\)/);
  // La rama de reasignación sigue después del filtro (elsif), así que también cubre un cambio a un estado que no avisa.
  assert.ok(fn.indexOf("special_request_state_notifies") < fn.indexOf("elsif v_responsable is not null"));
  // La creación de la solicitud sigue avisando siempre.
  assert.match(fn, /v_tipo := case when v_fid then 'FIDELIZACION_NUEVA' else 'SOLICITUD_NUEVA' end;/);
});

test("Solo ADMIN guarda los estados y solo en eventos que lo admiten", () => {
  const fn = sql.slice(sql.indexOf("create or replace function g_comercial.set_notification_event_states"));
  assert.match(fn, /perform g_comercial\.assert_admin\(\);/);
  assert.match(fn, /and admite_estados\)/);
  assert.match(sql, /grant execute on function g_comercial\.set_notification_event_states\(text, text\[\]\) to authenticated;/);
  assert.match(sql, /^begin;/m);
  assert.match(sql, /^commit;/m);
});

test("Ajustes muestra los estados solo si el servidor los admite", () => {
  assert.match(settings, /evento\.admite_estados && \(/);
  assert.match(settings, /if \(evento\.admite_estados\) \{\s+await saveNotificationEventStates/);
});
