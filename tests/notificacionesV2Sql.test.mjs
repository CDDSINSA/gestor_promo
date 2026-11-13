// Optional isolated PostgreSQL runtime; no application dependency.
// Set PROMO_SQL_TEST_RUNTIME to @electric-sql/pglite/dist/index.js.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const U = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const USERS = {
  admin: U(1), buyerPint: U(2), buyerHerr: U(3), mark1: U(4), mark2: U(5), designer1: U(6), designer2: U(7), oper: U(8), aud: U(9),
};
const BUYERS = { pint: U(101), herr: U(102) };

async function setup() {
  const { PGlite } = await import(pathToFileURL(process.env.PROMO_SQL_TEST_RUNTIME).href);
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
    grant usage on schema public, auth to authenticated, anon;
    create table compradores(id uuid primary key, comprador text, division text, activo boolean default true);
    create table usuarios_app(id uuid primary key, auth_user_id uuid, nombre text, email text, rol text, activo boolean, buyer_id uuid);
    create table campanas(id uuid primary key default gen_random_uuid(), legacy_actividad_id text, tipo_actividad text, estado text,
      nombre_actividad text, canal text, divisiones text not null default '', fecha_inicio date, fecha_fin date,
      solicitante_buyer_id uuid, fecha_estado timestamptz, updated_at timestamptz default now(),
      constraint campanas_estado_operativo_check check (estado in ('Borrador', 'Preliminar', 'Activo', 'Cerrado', 'En trabajo')));
    create table promociones(id uuid primary key default gen_random_uuid(), campana_id uuid, legacy_row_id text, buyer_id uuid, numero_pagina integer);
    create table comentarios(id uuid primary key default gen_random_uuid(), legacy_comentario_id text, promocion_id uuid,
      campana_id uuid, usuario_id uuid, alcance_comentario text default 'LINEA');
    create function current_app_user_id() returns uuid language sql stable security definer as $$
      select id from usuarios_app where auth_user_id = auth.uid() and activo limit 1; $$;
    create table catalogo_proyecto_diseno(id uuid primary key default gen_random_uuid(), catalogo_id text, nombre_proyecto text, estado text default 'en_diseno');
    create table catalogo_paginas_diseno(id uuid primary key default gen_random_uuid(), proyecto_id uuid, numero_pagina integer,
      disenador_id uuid, comprador_id uuid);
    create table catalogo_pagina_comentarios(id uuid primary key default gen_random_uuid(), pagina_id uuid, usuario_id uuid, comentario text);
    create table catalogo_pagina_respuestas(id uuid primary key default gen_random_uuid(), comentario_id uuid, numero smallint,
      comentario text, usuario_id uuid default current_app_user_id());
    grant select, insert, update on all tables in schema public to authenticated;
  `);
  await db.query("insert into compradores values ($1, 'Pinturas', 'Pinturas', true), ($2, 'Herramientas', 'Herramientas', true)", [BUYERS.pint, BUYERS.herr]);
  const rows = [
    [USERS.admin, "ADMIN", null], [USERS.buyerPint, "BUYER", BUYERS.pint], [USERS.buyerHerr, "BUYER", BUYERS.herr],
    [USERS.mark1, "MARK", null], [USERS.mark2, "MARK", null], [USERS.designer1, "DISENADOR", null],
    [USERS.designer2, "DISENADOR", null], [USERS.oper, "OPER", null], [USERS.aud, "AUD", null],
  ];
  for (const [id, rol, buyer] of rows) {
    await db.query("insert into usuarios_app values ($1, $1, $2, $3, $2, true, $4)", [id, rol, `${rol.toLowerCase()}@sinsa.com.ni`, buyer]);
  }
  const live = await readFile(new URL("../docs/supabase_live_notifications.sql", import.meta.url), "utf8");
  await db.exec(live.slice(0, live.lastIndexOf("do $$")));
  await db.exec(await readFile(new URL("../docs/supabase_catalog_deadlines_broadcasts.sql", import.meta.url), "utf8"));
  const v2 = await readFile(new URL("../docs/supabase_notificaciones_v2.sql", import.meta.url), "utf8");
  await db.exec(v2);
  await db.exec(v2); // Repetible.
  return db;
}

const asUser = async (db, id) => {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id || ""]);
  if (id) await db.exec("set role authenticated");
};
const inbox = async (db) => {
  await asUser(db, null);
  return (await db.query("select destinatario_usuario_id as u, tipo_evento as t, titulo, mensaje, metadata from notificaciones_envivo order by created_at, destinatario_usuario_id")).rows;
};
const recipients = (rows, type) => rows.filter((row) => row.t === type).map((row) => row.u).sort();
const clear = async (db) => { await asUser(db, null); await db.exec("delete from notificaciones_envivo"); };

test("calendar moves states forward, turns notifications on once and sends a single cut notice", { skip: !process.env.PROMO_SQL_TEST_RUNTIME }, async () => {
  const db = await setup();
  try {
    await db.query(`insert into campanas (id, legacy_actividad_id, tipo_actividad, estado, nombre_actividad, canal, divisiones, fecha_inicio, fecha_fin, notificaciones_envivo)
      values ($1, 'cat-pint', 'CATALOGO', 'Borrador', 'Pinturas', 'Retail', 'Pinturas', '2026-11-11', '2026-11-30', false)`, [U(500)]);
    const run = async (day) => { await asUser(db, null); return (await db.query("select run_catalog_daily_jobs($1::date) as r", [day])).rows[0].r; };
    const estado = async () => (await db.query("select estado, notificaciones_envivo from campanas where id = $1", [U(500)])).rows[0];

    assert.deepEqual(await run("2026-10-19"), { fecha: "2026-10-19", estados: 0, avisos: 0 });
    assert.deepEqual(await estado(), { estado: "Borrador", notificaciones_envivo: false });

    const day = await run("2026-10-20");
    assert.equal(day.estados, 1);
    assert.equal(day.avisos, 1);
    assert.deepEqual(await estado(), { estado: "Preliminar", notificaciones_envivo: true });
    let rows = await inbox(db);
    const expected = [USERS.buyerPint, USERS.mark1, USERS.mark2].sort();
    assert.deepEqual(recipients(rows, "CATALOGO_ESTADO"), expected, "buyers of the catalog division and Mercadeo");
    assert.deepEqual(recipients(rows, "AVISO_CORTE"), expected);
    assert.match(rows.find((row) => row.t === "CATALOGO_ESTADO").mensaje, /Borrador a Preliminar.*automático/);
    assert.equal(rows.find((row) => row.t === "AVISO_CORTE").metadata.importante, true);

    assert.deepEqual(await run("2026-10-20"), { fecha: "2026-10-20", estados: 0, avisos: 0 }, "same day is idempotent");
    assert.equal((await inbox(db)).length, rows.length);

    // The admin turns notifications off after the automatic change: they stay off.
    await clear(db);
    await db.query("update campanas set notificaciones_envivo = false where id = $1", [U(500)]);
    assert.deepEqual(await run("2026-10-30"), { fecha: "2026-10-30", estados: 1, avisos: 0 });
    assert.deepEqual(await estado(), { estado: "Precios Finales", notificaciones_envivo: false });
    assert.equal((await inbox(db)).length, 0, "no notices while notifications are off");

    // Never moves backwards nor after the start of the validity period.
    await db.query("update campanas set estado = 'Preliminar' where id = $1", [U(500)]);
    assert.equal((await run("2026-11-11")).estados, 0);
  } finally { await db.close(); }
});

test("mixed channels use the earliest cut for states and notify each cut date once", { skip: !process.env.PROMO_SQL_TEST_RUNTIME }, async () => {
  const db = await setup();
  try {
    const milestones = (await db.query("select perfil, hito, fecha::text from catalog_milestones('Retail, Ferrex', '2026-10-01') order by fecha")).rows;
    assert.equal(milestones.length, 6);
    assert.deepEqual(milestones.filter((m) => m.hito === "preliminar").map((m) => m.fecha), ["2026-09-09", "2026-09-15"]);
    await db.query(`insert into campanas (id, legacy_actividad_id, tipo_actividad, estado, nombre_actividad, canal, fecha_inicio, notificaciones_envivo)
      values ($1, 'cat-mix', 'CATALOGO', 'Borrador', 'Mixto', 'Retail, Galerón', '2026-10-01', false)`, [U(501)]);
    await asUser(db, null);
    const result = (await db.query("select run_catalog_daily_jobs('2026-09-09') as r")).rows[0].r;
    assert.equal(result.estados, 1);
    assert.equal(result.avisos, 1);
    const rows = await inbox(db);
    assert.deepEqual(recipients(rows, "CATALOGO_ESTADO"), [USERS.buyerPint, USERS.buyerHerr, USERS.mark1, USERS.mark2].sort(), "empty divisions = all buyers");
    assert.equal((await db.query("select run_catalog_daily_jobs('2026-09-15') as r")).rows[0].r.avisos, 1, "short-profile cut notice");
  } finally { await db.close(); }
});

test("manual state and validity changes notify, excluding the author", { skip: !process.env.PROMO_SQL_TEST_RUNTIME }, async () => {
  const db = await setup();
  try {
    await db.query(`insert into campanas (id, legacy_actividad_id, tipo_actividad, estado, nombre_actividad, canal, divisiones, fecha_inicio, notificaciones_envivo)
      values ($1, 'cat-pint', 'CATALOGO', 'Preliminar', 'Pinturas', 'Retail', 'Pinturas', '2026-11-11', true)`, [U(500)]);
    await asUser(db, USERS.mark1);
    await db.query("update campanas set estado = 'Activo', fecha_inicio = '2026-11-12' where id = $1", [U(500)]);
    const rows = await inbox(db);
    assert.deepEqual(recipients(rows, "CATALOGO_ESTADO"), [USERS.buyerPint, USERS.mark2].sort());
    assert.deepEqual(recipients(rows, "CATALOGO_VIGENCIA"), [USERS.buyerPint, USERS.mark2].sort());
    assert.doesNotMatch(rows.find((row) => row.t === "CATALOGO_ESTADO").mensaje, /automático/);
  } finally { await db.close(); }
});

test("design assignments notify the buyers involved and replies notify participants", { skip: !process.env.PROMO_SQL_TEST_RUNTIME }, async () => {
  const db = await setup();
  try {
    await db.query(`insert into campanas (id, legacy_actividad_id, tipo_actividad, estado, nombre_actividad, notificaciones_envivo)
      values ($1, 'cat-pint', 'CATALOGO', 'Preliminar', 'Pinturas', true)`, [U(500)]);
    await db.query("insert into catalogo_proyecto_diseno (id, catalogo_id, nombre_proyecto) values ($1, 'cat-pint', 'Pinturas Nov')", [U(600)]);
    await db.query("insert into catalogo_paginas_diseno (id, proyecto_id, numero_pagina) values ($1, $2, 4)", [U(700), U(600)]);

    await asUser(db, USERS.mark1);
    await db.query("update catalogo_paginas_diseno set comprador_id = $1, disenador_id = $2 where id = $3", [BUYERS.pint, USERS.designer1, U(700)]);
    let rows = await inbox(db);
    assert.deepEqual(recipients(rows, "DISENO_ASIGNACION"), [USERS.buyerPint]);
    assert.match(rows[0].mensaje, /Página 4\. Diseñador: DISENADOR\./);

    await clear(db);
    await asUser(db, USERS.mark1);
    await db.query("update catalogo_paginas_diseno set disenador_id = $1 where id = $2", [USERS.designer2, U(700)]);
    await db.query("update catalogo_paginas_diseno set comprador_id = $1 where id = $2", [BUYERS.herr, U(700)]);
    rows = await inbox(db);
    assert.deepEqual(recipients(rows, "DISENO_ASIGNACION"), [USERS.buyerPint, USERS.buyerPint, USERS.buyerHerr].sort());

    await clear(db);
    await db.query("insert into catalogo_pagina_comentarios (id, pagina_id, usuario_id, comentario) values ($1, $2, $3, 'Cambiar foto')", [U(800), U(700), USERS.mark2]);
    await asUser(db, USERS.designer2);
    await db.query("insert into catalogo_pagina_respuestas (comentario_id, numero, comentario) values ($1, 1, 'Listo')", [U(800)]);
    rows = await inbox(db);
    assert.deepEqual(recipients(rows, "DISENO_RESPUESTA"), [USERS.buyerHerr, USERS.mark2].sort(), "author + page buyer, without the replier");
  } finally { await db.close(); }
});

test("promotion changes go to the page designer, not to all Mercadeo", { skip: !process.env.PROMO_SQL_TEST_RUNTIME }, async () => {
  const db = await setup();
  try {
    await db.query(`insert into campanas (id, legacy_actividad_id, tipo_actividad, estado, nombre_actividad, notificaciones_envivo)
      values ($1, 'cat-pint', 'CATALOGO', 'Preliminar', 'Pinturas', true), ($2, 'cat-sin', 'CATALOGO', 'Preliminar', 'Sin diseño', true)`, [U(500), U(501)]);
    await db.query("insert into catalogo_proyecto_diseno (id, catalogo_id, nombre_proyecto) values ($1, 'cat-pint', 'Pinturas Nov')", [U(600)]);
    await db.query("insert into catalogo_paginas_diseno (proyecto_id, numero_pagina, disenador_id) values ($1, 3, $2), ($1, 5, $3)", [U(600), USERS.designer1, USERS.designer2]);
    await db.query(`insert into promociones (campana_id, legacy_row_id, buyer_id, numero_pagina) values
      ($1, 'r-p3', $2, 3), ($1, 'r-none', $2, null), ($3, 'r-x', $2, 1)`, [U(500), BUYERS.pint, U(501)]);
    const notify = (type, catalog, rowIds, extra = {}) => db.query(
      "select create_live_notification($1, 'Titulo', 'Mensaje', $2, p_metadata => $3::jsonb, p_destinatario_roles => array['MARK'], p_destinatario_buyer_ids => $4::uuid[]) as r",
      [type, catalog, JSON.stringify({ rowIds, ...extra }), extra.buyers || []]);

    await asUser(db, USERS.buyerPint);
    assert.equal((await notify("PROMOCION_ACTUALIZADA", "cat-pint", ["r-p3"])).rows[0].r.inserted, 1);
    let rows = await inbox(db);
    assert.deepEqual(recipients(rows, "PROMOCION_ACTUALIZADA"), [USERS.designer1]);

    await clear(db); await asUser(db, USERS.buyerPint);
    await notify("PROMOCION_AGREGADA", "cat-pint", ["r-none"]);
    assert.deepEqual(recipients(await inbox(db), "PROMOCION_AGREGADA"), [USERS.designer1, USERS.designer2].sort(), "no page: catalog designers");

    await clear(db); await asUser(db, USERS.buyerPint);
    await notify("PROMOCION_ANULADA", "cat-sin", ["r-x"]);
    assert.deepEqual(recipients(await inbox(db), "PROMOCION_ANULADA"), [USERS.mark1, USERS.mark2].sort(), "no designers: Mercadeo");

    await asUser(db, USERS.mark1);
    await assert.rejects(notify("PROMOCION_ACTUALIZADA", "cat-pint", ["r-p3"]), /no permitido/);
    await assert.rejects(notify("ADMIN_DIFUSION", "cat-pint", []), /no permitido/);
    await assert.rejects(notify("CATALOGO_ESTADO", "cat-pint", []), /no permitido/);

    // Mercadeo comments only reach buyers with promotions in the activity.
    await clear(db); await asUser(db, USERS.mark1);
    await notify("COMENTARIO_MERCADEO", "cat-pint", [], { buyers: [BUYERS.pint, BUYERS.herr] });
    assert.deepEqual(recipients(await inbox(db), "COMENTARIO_MERCADEO"), [USERS.buyerPint]);

    await asUser(db, USERS.buyerPint);
    await assert.rejects(db.query("select notify_users(array[$1]::uuid[], 'X', 'Y', 'Z')", [USERS.mark1]), /permission denied/);
    await assert.rejects(db.query("select run_catalog_daily_jobs()"), /permission denied/);
  } finally { await db.close(); }
});

test("cleanup removes read notifications after 30 days and unread after 90", { skip: !process.env.PROMO_SQL_TEST_RUNTIME }, async () => {
  const db = await setup();
  try {
    await db.query(`insert into notificaciones_envivo (destinatario_usuario_id, tipo_evento, titulo, leida, leida_en, created_at) values
      ($1, 'T', 'leido viejo', true, now() - interval '31 days', now() - interval '40 days'),
      ($1, 'T', 'leido reciente', true, now() - interval '5 days', now() - interval '40 days'),
      ($1, 'T', 'pendiente viejo', false, null, now() - interval '91 days'),
      ($1, 'T', 'pendiente', false, null, now() - interval '60 days')`, [USERS.mark1]);
    assert.equal((await db.query("select cleanup_live_notifications() as n")).rows[0].n, 2);
    assert.deepEqual((await db.query("select titulo from notificaciones_envivo order by titulo")).rows.map((r) => r.titulo), ["leido reciente", "pendiente"]);
  } finally { await db.close(); }
});

test("design events and Compras comments compute recipients on the server", { skip: !process.env.PROMO_SQL_TEST_RUNTIME }, async () => {
  const db = await setup();
  try {
    await db.query(`insert into campanas (id, legacy_actividad_id, tipo_actividad, estado, nombre_actividad, notificaciones_envivo)
      values ($1, 'cat-pint', 'CATALOGO', 'Preliminar', 'Pinturas', true)`, [U(500)]);
    await db.query("insert into catalogo_proyecto_diseno (id, catalogo_id, nombre_proyecto) values ($1, 'cat-pint', 'Pinturas Nov')", [U(600)]);
    await db.query("insert into catalogo_paginas_diseno (id, proyecto_id, numero_pagina, disenador_id, comprador_id) values ($1, $2, 3, $3, $4)", [U(700), U(600), USERS.designer1, BUYERS.pint]);
    await db.query("insert into promociones (id, campana_id, legacy_row_id, buyer_id, numero_pagina) values ($1, $2, 'r-p3', $3, 3)", [U(900), U(500), BUYERS.pint]);
    await db.query("insert into comentarios (promocion_id, campana_id, usuario_id) values ($1, $2, $3)", [U(900), U(500), USERS.mark2]);
    const design = (type, meta, users = []) => db.query(
      "select create_live_notification($1, 'T', 'M', 'cat-pint', p_metadata => $2::jsonb, p_destinatario_usuario_ids => $3::uuid[]) as r",
      [type, JSON.stringify(meta), users]);

    await asUser(db, USERS.mark1);
    await design("DISENO_COMMENT", { paginaId: U(700) }, [USERS.aud]);
    assert.deepEqual(recipients(await inbox(db), "DISENO_COMMENT"), [USERS.buyerPint, USERS.designer1].sort(), "client recipients are ignored");

    await clear(db); await asUser(db, USERS.buyerPint);
    await design("DISENO_REVIEW", { paginaId: U(700) });
    assert.deepEqual(recipients(await inbox(db), "DISENO_REVIEW"), [USERS.mark1, USERS.mark2, USERS.designer1].sort());
    await asUser(db, USERS.buyerPint);
    await assert.rejects(design("DISENO_STATE", {}), /página válida/);

    await clear(db); await asUser(db, USERS.buyerPint);
    await db.query("select create_live_notification('COMENTARIO_COMPRAS', 'T', 'M', 'cat-pint', 'r-p3') as r");
    assert.deepEqual(recipients(await inbox(db), "COMENTARIO_COMPRAS"), [USERS.mark2, USERS.designer1].sort(), "page designer + Mercadeo in the thread");
  } finally { await db.close(); }
});
