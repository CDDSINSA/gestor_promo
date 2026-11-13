// Optional isolated PostgreSQL runtime; no application dependency.
// Set PROMO_SQL_TEST_RUNTIME to @electric-sql/pglite/dist/index.js.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

test("broadcast authorization, delivery, private reads, retry and catalog state migration", { skip: !process.env.PROMO_SQL_TEST_RUNTIME }, async () => {
  const { PGlite } = await import(pathToFileURL(process.env.PROMO_SQL_TEST_RUNTIME).href);
  const db = new PGlite();
  const ids = Array.from({ length: 7 }, (_, index) => `00000000-0000-0000-0000-00000000000${index + 1}`);
  const request = "10000000-0000-0000-0000-000000000001";
  const asUser = async (id) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    await db.exec("set role authenticated");
  };
  const send = (title = "Corte preliminar", message = "Recordatorio de fechas") => db.query(
    "select public.send_admin_broadcast($1, $2, $3) as result", [title, message, request]);
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
      grant usage on schema public, auth to authenticated, anon;
      create table usuarios_app(id uuid primary key, auth_user_id uuid, nombre text, rol text, activo boolean, buyer_id uuid);
      create table campanas(id uuid primary key default gen_random_uuid(), legacy_actividad_id text, tipo_actividad text, estado text,
        constraint campanas_estado_operativo_check check (estado in ('Borrador', 'Preliminar', 'Activo', 'Cerrado', 'En trabajo')));
      create table promociones(id uuid primary key, campana_id uuid, legacy_row_id text);
      create table comentarios(id uuid primary key, legacy_comentario_id text);
      create table catalogo_proyecto_diseno(id uuid primary key, catalogo_id text);
      create table catalogo_paginas_diseno(id uuid primary key, proyecto_id uuid, disenador_id uuid);
    `);
    for (const [index, role] of ["ADMIN", "BUYER", "MARK", "OPER", "AUD", "DISENADOR", "BUYER"].entries()) {
      await db.query("insert into usuarios_app values ($1, $1, $2, $2, $3, null)", [ids[index], role, index !== 6]);
    }
    const notifications = await readFile(new URL("../docs/supabase_live_notifications.sql", import.meta.url), "utf8");
    // Realtime publication is infrastructure outside this isolated database.
    await db.exec(notifications.slice(0, notifications.lastIndexOf("do $$")));
    const migration = await readFile(new URL("../docs/supabase_catalog_deadlines_broadcasts.sql", import.meta.url), "utf8");
    await db.exec(migration);
    await db.exec(migration); // Safe to install twice.

    await asUser(ids[1]);
    await assert.rejects(send, /Solo el administrador/);
    await assert.rejects(db.query("select create_live_notification('ADMIN_DIFUSION', 'Falso', 'Texto', p_destinatario_roles => array['MARK'])"), /Solo el administrador/);
    await asUser(ids[0]);
    await assert.rejects(() => send(" "), /obligatorios/);
    await assert.rejects(() => send("Asunto", "x".repeat(1001)), /obligatorios/);
    assert.equal((await send()).rows[0].result.inserted, 3);
    assert.equal((await send()).rows[0].result.replayed, true);
    await assert.rejects(() => send("Otro asunto"), /otro mensaje/);

    await asUser(ids[1]);
    let own = await db.query("select * from notificaciones_envivo");
    assert.equal(own.rows.length, 1);
    assert.equal(own.rows[0].destinatario_usuario_id, ids[1]);
    await db.exec("update notificaciones_envivo set leida = true");
    await asUser(ids[2]);
    own = await db.query("select * from notificaciones_envivo");
    assert.equal(own.rows.length, 1);
    assert.equal(own.rows[0].leida, false);
    await asUser(ids[4]);
    assert.equal((await db.query("select * from notificaciones_envivo")).rows.length, 0);
    await db.exec("reset role");
    assert.equal((await db.query("select count(*)::int as total from notificaciones_envivo")).rows[0].total, 3);
    await db.query("insert into campanas (tipo_actividad, estado) values ('CATALOGO', 'Precios Finales'), ('ESPECIAL', 'En trabajo')");
    await assert.rejects(db.query("insert into campanas (tipo_actividad, estado) values ('CATALOGO', 'Inventado')"), /check/);
    await assert.rejects(db.query("insert into campanas (tipo_actividad, estado) values ('ESPECIAL', 'Precios Finales')"), /check/);
    await db.exec("set role anon");
    await assert.rejects(send, /permission denied/);
  } finally { await db.close(); }
});
