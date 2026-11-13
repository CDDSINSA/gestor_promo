import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { buildSpecialRequestHeaderUpdate } from "../src/features/promotions/application/specialRequestEdit.js";

const sql = await readFile(new URL("../docs/supabase_g_comercial_especiales_cambio_fecha_fin.sql", import.meta.url), "utf8");
const page = await readFile(new URL("../src/components/PromocionEspecialPage.jsx", import.meta.url), "utf8");

const draft = {
  nombre_actividad: "Especial A2",
  canal: "Retail",
  fecha_inicio: "2026-11-01",
  fecha_fin: "2026-11-20",
  comprador: "Marcela Torres",
  motivo_solicitud: "Competencia",
};

test("La edición parte de la versión más reciente y conserva el tablero", () => {
  const latest = {
    actividad_id: "ESP-1", estado: "Aprobado", responsable: "Ana Oper", fecha_estado: "2026-11-03T10:00:00Z",
    tiempo_nuevo_horas: 2, promo_ids: "P-1", fecha_fin: "2026-11-10",
  };
  const { activity, endDateChanged, movesToWork } = buildSpecialRequestHeaderUpdate(latest, draft);
  assert.equal(activity.estado, "Aprobado"); // lo mueve la base, con las horas
  assert.equal(activity.responsable, "Ana Oper");
  assert.equal(activity.fecha_estado, "2026-11-03T10:00:00Z");
  assert.equal(activity.tiempo_nuevo_horas, 2);
  assert.equal(activity.promo_ids, "P-1");
  assert.equal(activity.fecha_fin, "2026-11-20");
  assert.equal(activity.solicitante, "Marcela Torres");
  assert.equal(endDateChanged, true);
  assert.equal(movesToWork, true);
});

test("Solo Aprobado y Finalizado vuelven a En trabajo; FID no", () => {
  const base = { actividad_id: "ESP-1", fecha_fin: "2026-11-10" };
  for (const [estado, esperado] of [["Nuevo", false], ["En trabajo", false], ["Aprobado", true], ["Aprovado", true], ["Finalizado", true]]) {
    assert.equal(buildSpecialRequestHeaderUpdate({ ...base, estado }, draft).movesToWork, esperado, estado);
  }
  assert.equal(buildSpecialRequestHeaderUpdate({ ...base, actividad_id: "FID-1", estado: "Aprobado" }, draft).movesToWork, false);
  assert.equal(buildSpecialRequestHeaderUpdate({ ...base, estado: "Aprobado", fecha_fin: "2026-11-20" }, draft).movesToWork, false);
});

test("La pantalla ya no reinicia fecha_estado ni usa la copia de creación", () => {
  const fn = page.slice(page.indexOf("const updateExistingActivity"), page.indexOf("const cancelEditActivity"));
  assert.doesNotMatch(fn, /fecha_estado:/);
  assert.match(fn, /buildSpecialRequestHeaderUpdate\(latest, draft\)/);
  assert.doesNotMatch(page, /<span className="pill yellow">Nuevo<\/span>/);
});

test("SQL: guardia del comprador, paso a En trabajo sin reiniciar horas y aviso", () => {
  const guard = sql.slice(sql.indexOf("create or replace function g_comercial.special_request_buyer_guard()"), sql.indexOf("-- 3) Aviso"));
  assert.match(guard, /upper\(g_comercial\.current_user_role\(\)\), ''\) <> 'BUYER'/);
  for (const campo of ["estado", "responsable", "promo_ids", "oferta_ids", "fecha_estado", "tiempo_total_horas"]) {
    assert.match(guard, new RegExp(`new\\.${campo} := old\\.${campo};`), campo);
  }
  assert.match(guard, /v_estado in \('Aprobado', 'Finalizado'\)/);
  assert.match(guard, /new\.estado := 'En trabajo';/);
  assert.match(guard, /new\.tiempo_total_horas := coalesce\(old\.tiempo_total_horas, 0\) \+ v_hours;/);
  assert.match(guard, /not like 'FID-%'/);
  assert.match(sql, /create trigger special_request_buyer_guard before update on g_comercial\.campanas/);
  assert.match(sql, /create trigger notify_special_request_end_date after update of fecha_fin on g_comercial\.campanas/);
  assert.match(sql, /subscription_user_ids\('SOLICITUD_VIGENCIA', v_owner,/);
  // Suscripción inicial solo la primera vez.
  assert.match(sql, /if v_nuevo then\s+insert into g_comercial\.notificaciones_suscripciones \(tipo_evento, destino_tipo, destino_rol\)\s+values \('SOLICITUD_VIGENCIA', 'ROL', 'OPER'\);/);
  assert.match(sql, /^begin;/m);
  assert.match(sql, /^commit;/m);
});

test("Editar solicitud muestra y permite corregir la vigencia (no en Fidelización)", async () => {
  const solicitudes = await readFile(new URL("../src/components/SolicitudesEspecialesPage.jsx", import.meta.url), "utf8");
  assert.match(solicitudes, /const canEditRequestDates = canManageRequests \|\| canCreateSpecial;/);
  assert.match(solicitudes, /<span>Fecha inicio<\/span><input type="date"/);
  assert.match(solicitudes, /<span>Fecha fin<\/span><input type="date"[^>]*readOnly=\{!canEditRequestDates\}/);
  assert.match(solicitudes, /updateField\(selected, "fecha_fin", e\.target\.value\)/);
  assert.match(solicitudes, /\{!selectedIsFidelizacion && <>/);
});
