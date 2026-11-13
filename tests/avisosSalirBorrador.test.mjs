import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { catalogStatusChangeFields } from "../src/features/catalogSettings/catalogStatus.js";

const sql = await readFile(new URL("../docs/supabase_g_comercial_avisos_al_salir_de_borrador.sql", import.meta.url), "utf8");

test("Salir de Borrador a un estado de trabajo enciende las notificaciones en pantalla", () => {
  for (const estado of ["Preliminar", "Precios Finales", "Activo"]) {
    assert.deepEqual(catalogStatusChangeFields("Borrador", estado), {
      estado, notificacionesEnvivo: true, notificaciones_envivo: true,
    });
  }
});

test("Otros cambios de estado no tocan el interruptor", () => {
  assert.deepEqual(catalogStatusChangeFields("Borrador", "Cerrado"), { estado: "Cerrado" });
  assert.deepEqual(catalogStatusChangeFields("Preliminar", "Precios Finales"), { estado: "Precios Finales" });
  assert.deepEqual(catalogStatusChangeFields("Preliminar", "Borrador"), { estado: "Borrador" });
});

test("El trigger es BEFORE UPDATE, solo para catálogos que salen de Borrador", () => {
  assert.match(sql, /before update of estado on g_comercial\.campanas/);
  assert.match(sql, /when \(old\.estado = 'Borrador' and new\.estado is distinct from old\.estado\)/);
  assert.match(sql, /new\.tipo_actividad = 'CATALOGO'/);
  assert.match(sql, /new\.estado in \('Preliminar', 'Precios Finales', 'Activo'\)/);
  assert.match(sql, /drop trigger if exists catalog_enable_notifications_on_leave_draft/);
  assert.match(sql, /^begin;/m);
  assert.match(sql, /^commit;/m);
});
