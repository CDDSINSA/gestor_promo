import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { buildBuyerNameMap, resolveBuyerName, withBuyerName } from "../src/features/fidelizacion/buyerNames.js";

const sql = await readFile(new URL("../docs/supabase_g_comercial_fidelizacion_buyer_id.sql", import.meta.url), "utf8");
const rollback = await readFile(new URL("../docs/supabase_g_comercial_fidelizacion_buyer_id_rollback.sql", import.meta.url), "utf8");

const compradores = [
  { id: "uuid-ana", comprador: "Ana Pérez", comprador_id: "C01" },
  { id: "uuid-beto", nombre: "Beto Ruiz" },
  { id: "", comprador: "Sin ID" },
];

test("Fidelización: el nombre del comprador se resuelve por buyer_id", () => {
  const names = buildBuyerNameMap(compradores);
  assert.equal(names.size, 2);
  assert.equal(resolveBuyerName({ buyer_id: "uuid-ana" }, names), "Ana Pérez");
  assert.equal(resolveBuyerName({ buyer_id: "uuid-beto" }, names), "Beto Ruiz");
  assert.equal(resolveBuyerName({ buyer_id: "uuid-desconocido" }, names), "");
  assert.equal(resolveBuyerName({ buyer_id: null }, names), "");
});

test("Fidelización: datos locales antiguos con nombre siguen mostrándose", () => {
  const names = buildBuyerNameMap(compradores);
  assert.equal(resolveBuyerName({ comprador: "Juan Perez" }, names), "Juan Perez");
  assert.deepEqual(withBuyerName({ sku: "1", buyer_id: "uuid-ana" }, names), { sku: "1", buyer_id: "uuid-ana", comprador: "Ana Pérez" });
});

test("SQL: canasto y detalle guardan buyer_id y ya no el nombre", () => {
  assert.match(sql, /^begin;/m);
  assert.match(sql, /^commit;/m);
  assert.match(sql, /add column if not exists buyer_id uuid references g_comercial\.compradores\(id\)/);
  assert.match(sql, /alter table g_comercial\.canasto_fidelizacion drop column if exists comprador;/);
  assert.match(sql, /alter table g_comercial\.fidelizacion_solicitudes_detalle drop column if exists comprador;/);
  assert.match(sql, /drop function if exists g_comercial\.fidelizacion_owner_allowed\(text\);/);
  assert.doesNotMatch(sql, /fidelizacion_owner_allowed\((new|old|f|d|c)\.comprador\)/);
  assert.match(sql, /raise exception 'Hay compradores del canasto sin equivalente/);
});

test("SQL: alcance Senior/Junior sin cambios y evaluado una vez por consulta", () => {
  assert.match(sql, /buyer_id = any\(\(select g_comercial\.current_buyer_scope_ids\(\)\)::uuid\[\]\)/);
  assert.doesNotMatch(sql, /create or replace function g_comercial\.current_buyer_scope_ids/);
  assert.match(sql, /fidelizacion_buyer_allowed\(f\.buyer_id\)/);
  assert.match(sql, /buyer_id = coalesce\(excluded\.buyer_id, canasto_fidelizacion\.buyer_id\)/);
});

test("SQL rollback: recupera el nombre antes de quitar buyer_id", () => {
  const fill = rollback.indexOf("set comprador = c.comprador");
  const drop = rollback.indexOf("drop column if exists buyer_id");
  assert.ok(fill > 0 && drop > fill);
  assert.match(rollback, /create or replace function g_comercial\.fidelizacion_owner_allowed\(p_comprador text\)/i);
});
