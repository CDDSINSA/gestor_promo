import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const sql = await readFile(new URL("../docs/supabase_g_comercial_especiales_visibilidad.sql", import.meta.url), "utf8");

test("Solicitudes especiales: lectura restringida en campanas, promociones y comentarios", () => {
  for (const table of ["campanas", "promociones", "comentarios"]) {
    assert.match(sql, new RegExp(`create policy ${table}_especiales_scope on g_comercial\\.${table} as restrictive for select`));
  }
  assert.match(sql, /tipo_actividad <> 'ESPECIAL'/);
  assert.match(sql, /is_any_role\(array\['ADMIN', 'OPER'\]\)/);
  assert.match(sql, /solicitante_buyer_id = any\(\(select g_comercial\.current_buyer_scope_ids\(\)\)::uuid\[\]\)/);
  assert.doesNotMatch(sql, /is_any_role\(array\['ADMIN', 'OPER', 'BUYER', 'MARK'/);
  assert.match(sql, /^begin;/m);
  assert.match(sql, /^commit;/m);
});
