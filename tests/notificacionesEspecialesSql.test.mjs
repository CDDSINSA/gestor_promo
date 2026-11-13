import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const sql = await readFile(new URL("../docs/supabase_g_comercial_notificaciones_especiales.sql", import.meta.url), "utf8");

test("Cargar promociones a una solicitud especial no genera aviso", () => {
  const promos = sql.slice(sql.indexOf("if v_es_especial and v_tipo like 'PROMOCION_%' then"), sql.indexOf("if v_es_especial and v_tipo = 'COMENTARIO_COMPRAS' then"));
  assert.match(promos, /return jsonb_build_object\('inserted', 0, 'skipped', 'special_request_promotions'\);/);
});

test("Comentarios de Compras en solicitudes especiales notifican a OPER y ADMIN, no a Mercadeo", () => {
  const especial = sql.slice(sql.indexOf("if v_es_especial and v_tipo = 'COMENTARIO_COMPRAS' then"), sql.indexOf("elsif v_tipo like 'PROMOCION_%'"));
  assert.match(especial, /role_user_ids\(array\['OPER', 'ADMIN'\]\)/);
  assert.doesNotMatch(especial, /MARK/);
  assert.match(sql, /c\.tipo_actividad = 'ESPECIAL'/);
  // Catálogos conservan el respaldo a Mercadeo.
  assert.match(sql, /v_recipients := g_comercial\.role_user_ids\(array\['MARK'\]\);/);
  assert.match(sql, /^begin;/m);
  assert.match(sql, /^commit;/m);
});
