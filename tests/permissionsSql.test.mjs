// Optional PostgreSQL integration test. Install @electric-sql/pglite outside the app
// and set PROMO_SQL_TEST_RUNTIME to its dist/index.js. No runtime dependency added.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

test("RLS and RPC permission boundaries", { skip: !process.env.PROMO_SQL_TEST_RUNTIME }, async () => {
  const { PGlite } = await import(pathToFileURL(process.env.PROMO_SQL_TEST_RUNTIME).href);
  const db = new PGlite();
  const buyerA = "00000000-0000-0000-0000-000000000001";
  const buyerB = "00000000-0000-0000-0000-000000000002";
  const users = { BUYER: buyerA, OTHER: buyerB, OPER: "00000000-0000-0000-0000-000000000003",
    ADMIN: "00000000-0000-0000-0000-000000000004", MARK: "00000000-0000-0000-0000-000000000005",
    AUD: "00000000-0000-0000-0000-000000000006", DISENADOR: "00000000-0000-0000-0000-000000000007" };
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
      grant usage on schema public, auth to authenticated, anon;
      create table public.compradores(id uuid primary key, comprador text, correo text, activo boolean default true);
      create table public.segmentos_clientes(legacy_segmento_id text, canal text, activo boolean);
      insert into public.segmentos_clientes values ('1002', 'Comasa', true);
      create table public.usuarios_app(auth_user_id uuid, buyer_id uuid, rol text, activo boolean default true);
      create function public.current_user_role() returns text language sql stable security definer as $$
        select rol from public.usuarios_app where auth_user_id = auth.uid() and activo; $$;
      create function public.current_buyer_scope_ids() returns uuid[] language sql stable security definer as $$
        select array[buyer_id] from public.usuarios_app where auth_user_id = auth.uid() and activo; $$;
      create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
      create table public.campanas(id uuid primary key default gen_random_uuid(), legacy_actividad_id text unique not null,
        tipo_actividad text default 'ESPECIAL', nombre_actividad text, canal text, solicitante_buyer_id uuid,
        estado text, motivo_solicitud text, comprador text, responsable text default 'Responsable original', recursos_ocupados text,
        fecha_estado timestamptz, updated_at timestamptz default now(), promo_ids text default '', oferta_ids text default '',
        ${["nuevo", "aprovado", "entrabajo", "finalizado"].map(s => `fecha_${s} timestamptz, tiempo_${s}_horas numeric default 0`).join(",")},
        tiempo_total_horas numeric default 0);
      alter table public.campanas enable row level security;
      grant select, insert, update, delete on public.campanas to authenticated;
      create policy campanas_read on public.campanas for select to authenticated using (true);
      create policy campanas_write on public.campanas for all to authenticated
        using (public.current_user_role() = 'ADMIN' or solicitante_buyer_id = any(public.current_buyer_scope_ids()))
        with check (public.current_user_role() = 'ADMIN' or solicitante_buyer_id = any(public.current_buyer_scope_ids()));
      insert into public.compradores values ('${buyerA}', 'Buyer A', 'a@test', true), ('${buyerB}', 'Buyer B', 'b@test', true);
      ${Object.entries(users).map(([role,id]) => `insert into public.usuarios_app values ('${id}', ${["BUYER","OTHER"].includes(role) ? `'${id}'` : "null"}, '${role === "OTHER" ? "BUYER" : role}', true);`).join("\n")}
    `);
    await db.exec(await readFile(new URL("../docs/supabase_fidelizacion_schema.sql", import.meta.url), "utf8"));
    // Simulate the old open deployment, including an unexpected permissive policy.
    await db.exec(`grant select, insert, update, delete on public.canasto_fidelizacion, public.fidelizacion_solicitudes_detalle to anon;
      grant execute on function public.crear_solicitud_fidelizacion(jsonb,jsonb), public.finalizar_solicitud_fidelizacion(text) to public;
      create policy legacy_open on public.canasto_fidelizacion for all to anon, authenticated using (true) with check (true);
      create policy legacy_open on public.fidelizacion_solicitudes_detalle for all to anon, authenticated using (true) with check (true);`);
    const migration = await readFile(new URL("../docs/supabase_permissions_hardening.sql", import.meta.url), "utf8");
    await db.exec(migration);
    await db.exec(migration); // Safe to reapply.
    const integrity = await readFile(new URL("../docs/supabase_fidelizacion_integrity.sql", import.meta.url), "utf8");
    await db.exec(integrity);
    await db.exec(integrity);
    const orce = await readFile(new URL("../docs/supabase_fidelizacion_orce.sql", import.meta.url), "utf8");
    await db.exec(orce);
    await db.exec(orce);

    async function as(role, sql, params = []) {
      await db.exec("begin");
      try {
        await db.query("select set_config('request.jwt.claim.sub', $1, true)", [users[role] || ""]);
        await db.exec(`set local role ${role === "anon" ? "anon" : "authenticated"}`);
        const result = await db.query(sql, params);
        await db.exec("commit");
        return result.rows;
      } catch (error) { await db.exec("rollback"); throw error; }
    }
    const activity = (id, buyer = buyerA) => ({ actividad_id: id, solicitante_buyer_id: buyer, comprador: "Buyer A" });
    const detail = (sku = "SKU-A") => [{ sku, segmento_id: "1002", descuento_anterior: 0, descuento_solicitado: 20, tipo_cambio: "NUEVO" }];
    const create = (role, id, buyer = buyerA, sku = "SKU-A") => as(role,
      "select public.crear_solicitud_fidelizacion($1::jsonb, $2::jsonb)", [activity(id, buyer), detail(sku)]);

    for (const role of ["anon", "ADMIN", "MARK", "AUD", "DISENADOR"]) {
      await assert.rejects(create(role, "FID-DENIED"), { code: "42501" });
      await assert.rejects(as(role, "select public.finalizar_solicitud_fidelizacion('FID-DENIED')"), { code: "42501" });
      await assert.rejects(as(role, "insert into public.canasto_fidelizacion(canal, sku, segmento_id, descuento, comprador) values ('retail','X','S',10,'Buyer A')"), { code: "42501" });
    }
    await create("BUYER", "FID-A");
    await create("OTHER", "FID-B", buyerB, "SKU-B");
    await assert.rejects(create("BUYER", "FID-CROSS", buyerB), { code: "42501" });
    await assert.rejects(create("BUYER", "FID-B"), { code: "42501" });
    assert.equal((await as("BUYER", "select * from public.fidelizacion_solicitudes_detalle")).length, 1);
    assert.equal((await as("OPER", "select * from public.fidelizacion_solicitudes_detalle")).length, 2);
    assert.equal((await as("MARK", "select * from public.fidelizacion_solicitudes_detalle")).length, 0);
    await assert.rejects(as("anon", "select * from public.canasto_fidelizacion"), { code: "42501" });
    await assert.rejects(as("BUYER", "select public.finalizar_solicitud_fidelizacion('FID-B')"), { code: "42501" });
    await assert.rejects(as("OTHER", "select public.finalizar_solicitud_fidelizacion('FID-B')"), { code: "42501" });
    await assert.rejects(create("BUYER", "FID-A"), { code: "23505" });
    await assert.rejects(create("BUYER", "FID-OVERLAP"), /solicitud pendiente/);
    await assert.rejects(as("OPER", "select public.cambiar_estado_solicitud('FID-B','Finalizado','Nuevo','','')"), /referencia/);
    await as("OPER", "select public.cambiar_estado_solicitud('FID-B','Finalizado','Nuevo','ORCE-B','')");
    await assert.rejects(create("BUYER", "FID-STEAL", buyerA, "SKU-B"), { code: "42501" });
    await as("OPER", "select public.cambiar_estado_solicitud('FID-A','Finalizado','Nuevo','ORCE-A','')");
    assert.equal((await as("BUYER", "select * from public.canasto_fidelizacion")).length, 1);
    assert.equal((await as("OPER", "select * from public.canasto_fidelizacion")).length, 2);
    const currentOrce = async () => (await as("OPER", "select * from public.canasto_fidelizacion where sku='SKU-A' and segmento_id='1002'"))[0];
    const importRow = (revision, discount = 20, sku = "SKU-A") => ({ canal: "comasa", sku, segmento_id: "1002", descuento: discount,
      promo_id_orce: "1297", oferta_id_orce: "28920", revision_esperada: revision });
    let batch = 10;
    const reconcile = (role, rows, id = `10000000-0000-0000-0000-${String(batch++).padStart(12, '0')}`) => as(role,
      "select public.conciliar_fidelizacion_orce($1::uuid, 'reporte.xlsx', $2::jsonb) result", [id, rows]);
    for (const role of ["anon", "BUYER", "ADMIN", "MARK", "AUD", "DISENADOR"]) {
      await assert.rejects(reconcile(role, [importRow(0)]), { code: "42501" });
    }
    const importId = '10000000-0000-0000-0000-000000000001';
    const input = [importRow(0), importRow(0, 30, 'SKU-B'), importRow(0, 20, 'MISSING')];
    const [imported] = await reconcile('OPER', input, importId);
    assert.equal(imported.result.updated, 1);
    assert.deepEqual(new Set(imported.result.rows.map(r => r.status)), new Set(['ACTUALIZADO', 'DESCUENTO_DISTINTO', 'NO_ENCONTRADO']));
    assert.equal((await currentOrce()).promo_id_orce, '1297');
    assert.equal((await currentOrce()).estado_conciliacion_orce, 'CONCILIADO');
    assert.equal(Number((await currentOrce()).descuento), 20);
    const revision = (await currentOrce()).revision_orce;
    await reconcile('OPER', input, importId); // Lost-response retry is idempotent.
    assert.equal((await currentOrce()).revision_orce, revision);
    await assert.rejects(reconcile('OPER', [importRow(0, 10)], importId), /otra carga/);
    await db.exec(orce); // Reapplying never erases reconciled IDs.
    assert.equal((await currentOrce()).promo_id_orce, '1297');
    const [staleImport] = await reconcile('OPER', [importRow(0)]);
    assert.equal(staleImport.result.rows[0].status, 'CAMBIO_CONCURRENTE');
    const [sameImport] = await reconcile('OPER', [importRow(revision)]);
    assert.equal(sameImport.result.rows[0].status, 'SIN_CAMBIO');
    await assert.rejects(reconcile('OPER', [importRow(revision), { ...importRow(revision), promo_id_orce: '9' }]), /duplicadas/);
    assert.equal((await as('OPER', "select * from public.canasto_fidelizacion where sku='MISSING'")).length, 0);
    await assert.rejects(as('BUYER', "update public.canasto_fidelizacion set estatus='En proceso',promo_id_orce='999' where sku='SKU-A'"), { code: '42501' });
    await assert.rejects(as("BUYER", "update public.canasto_fidelizacion set descuento=90 where sku='SKU-A'"), { code: "42501" });
    await assert.rejects(as("BUYER", "update public.campanas set estado='Archivado' where legacy_actividad_id='FID-A'"), { code: "42501" });

    // Stale previews roll back header and details; a legitimate pending change
    // also detects changes made between creation and finalization.
    const change = (id, previous, requested, extra = []) => as("BUYER",
      "select public.crear_solicitud_fidelizacion($1::jsonb, $2::jsonb)",
      [activity(id), [{ ...detail()[0], descuento_anterior: previous, descuento_solicitado: requested, tipo_cambio: 'BAJA' }, ...extra]]);
    await assert.rejects(change("FID-STALE", 0, 10), { code: "40001" });
    assert.equal((await as("OPER", "select * from public.campanas where legacy_actividad_id='FID-STALE'")).length, 0);
    await assert.rejects(change("FID-UNCHANGED", 20, 20), /no contiene cambios/);
    await assert.rejects(change("FID-DUP", 20, 10, [{ ...detail()[0], descuento_anterior: 20, descuento_solicitado: 15 }]), /duplicadas/);
    await change("FID-CHANGE", 20, 10);
    // Historical requests may contain unchanged rows. They must not overwrite
    // a newer discount and must not be marked as applied.
    await as("OPER", "insert into public.canasto_fidelizacion(canal,sku,segmento_id,descuento,comprador) values ('comasa','SKU-A','1003',30,'Buyer A')");
    await as("OPER", "insert into public.fidelizacion_solicitudes_detalle(actividad_id,canal,sku,segmento_id,descuento_anterior,descuento_solicitado,tipo_cambio,comprador) values ('FID-CHANGE','comasa','SKU-A','1003',20,20,'SIN_CAMBIO','Buyer A')");
    assert.equal((await as("OPER", "select estatus from public.canasto_fidelizacion where sku='SKU-A'"))[0].estatus, 'En proceso');
    await as("OPER", "update public.canasto_fidelizacion set descuento=25 where sku='SKU-A' and segmento_id='1002'");
    await assert.rejects(as("OPER", "select public.cambiar_estado_solicitud('FID-CHANGE','Finalizado','Nuevo','ORCE-CHANGE','')"), { code: "40001" });
    assert.equal((await as("OPER", "select estado,promo_ids from public.campanas where legacy_actividad_id='FID-CHANGE'"))[0].estado, 'Nuevo');
    assert.equal((await as("OPER", "select estado from public.fidelizacion_solicitudes_detalle where actividad_id='FID-CHANGE'"))[0].estado, 'PENDIENTE');
    await as("OPER", "update public.canasto_fidelizacion set descuento=20 where sku='SKU-A' and segmento_id='1002'");
    await as("OPER", "select public.cambiar_estado_solicitud('FID-CHANGE','Finalizado','Nuevo','ORCE-CHANGE','')");
    assert.equal(Number((await as("OPER", "select descuento from public.canasto_fidelizacion where sku='SKU-A' and segmento_id='1002'"))[0].descuento), 10);
    assert.equal((await currentOrce()).promo_id_orce, null);
    assert.equal((await currentOrce()).oferta_id_orce, null);
    assert.equal((await currentOrce()).estado_conciliacion_orce, 'PENDIENTE');
    assert.ok((await as('OPER', "select * from public.fidelizacion_orce_historial where anterior->>'promo_id_orce'='1297'")).length > 0);
    await reconcile('OPER', [importRow((await currentOrce()).revision_orce, 10)]);
    assert.equal(Number((await as("OPER", "select descuento from public.canasto_fidelizacion where sku='SKU-A' and segmento_id='1003'"))[0].descuento), 30);
    assert.equal((await as("OPER", "select estado from public.fidelizacion_solicitudes_detalle where actividad_id='FID-CHANGE' and segmento_id='1003'"))[0].estado, 'RECHAZADO');
    await change("FID-ZERO", 10, 0);
    await as("OPER", "select public.cambiar_estado_solicitud('FID-ZERO','Finalizado','Nuevo','ORCE-ZERO','')");
    assert.equal((await as("OPER", "select estatus from public.canasto_fidelizacion where sku='SKU-A' and segmento_id='1002'"))[0].estatus, 'Inactivo');
    assert.equal((await currentOrce()).promo_id_orce, '1297');
    assert.equal((await currentOrce()).oferta_id_orce, '28920');
    assert.equal((await currentOrce()).estado_conciliacion_orce, 'NO_APLICA');
    await change('FID-REACTIVATE', 0, 15);
    await as('OPER', "select public.cambiar_estado_solicitud('FID-REACTIVATE','Finalizado','Nuevo','ORCE-REACTIVATE','')");
    assert.equal((await currentOrce()).promo_id_orce, null);
    assert.equal((await currentOrce()).estado_conciliacion_orce, 'PENDIENTE');
    assert.equal((await as('MARK', 'select * from public.fidelizacion_orce_historial')).length, 0);
    assert.equal((await as('BUYER', 'select * from public.fidelizacion_orce_importaciones')).length, 0);
    await assert.rejects(as('OPER', 'delete from public.fidelizacion_orce_historial'), { code: '42501' });
    assert.equal((await as("BUYER", "delete from public.canasto_fidelizacion where sku='SKU-B' returning *")).length, 0);
    await assert.rejects(as("BUYER", "update public.canasto_fidelizacion set comprador='Buyer B' where sku='SKU-A'"), { code: "42501" });
    // Even privileged RPCs cannot bypass the guards using another buyer's row.
    await db.exec(`create function public.test_privileged_write() returns void language sql security definer as $$
      update public.canasto_fidelizacion set descuento=99 where sku='SKU-B'; $$;`);
    await assert.rejects(as("BUYER", "select public.test_privileged_write()"), { code: "42501" });
    await assert.rejects(as("ADMIN", "select public.test_privileged_write()"), { code: "42501" });
    await db.exec("insert into public.campanas(legacy_actividad_id, estado) values ('SPECIAL-A','Nuevo')");
    for (const role of ["anon", "BUYER", "ADMIN", "MARK", "AUD", "DISENADOR"]) {
      await assert.rejects(as(role, "select public.cambiar_estado_solicitud('SPECIAL-A','Aprobado','Nuevo','','')"), { code: "42501" });
    }
    await as("OPER", "select public.cambiar_estado_solicitud('SPECIAL-A','Aprobado','Nuevo','','')");
    await assert.rejects(as("OPER", "select public.cambiar_estado_solicitud('SPECIAL-A','En trabajo','Nuevo','','')"), { code: "40001" });
    await assert.rejects(as("OPER", "select public.cambiar_estado_solicitud('SPECIAL-A','Finalizado','Aprobado','','')"));
    await as("OPER", "select public.cambiar_estado_solicitud('SPECIAL-A','Finalizado','Aprobado','PROMO','OFERTA')");
    const [saved] = await as("OPER", "select * from public.campanas where legacy_actividad_id = 'SPECIAL-A'");
    assert.equal(saved.responsable, "Responsable original");
    assert.equal(saved.promo_ids, "PROMO");
    assert.equal(saved.estado, "Finalizado");
    await as("OPER", "select public.cambiar_estado_solicitud('SPECIAL-A','Archivado','Finalizado','','')");
    assert.equal((await as("OPER", "update public.campanas set responsable='Otro' where legacy_actividad_id='SPECIAL-A' returning *")).length, 0);
    await db.exec(`update public.usuarios_app set activo=false where auth_user_id='${users.OPER}'`);
    await assert.rejects(create("OPER", "FID-INACTIVE"), { code: "42501" });
    const adminMigration = await readFile(new URL("../docs/supabase_admin_fidelizacion.sql", import.meta.url), "utf8");
    await db.exec(adminMigration);
    await db.exec(adminMigration);
    await create("BUYER", "FID-ADMIN", buyerA, "SKU-ADMIN");
    assert.ok((await as("ADMIN", "select * from public.campanas where legacy_actividad_id='FID-ADMIN'")).length);
    assert.ok((await as("ADMIN", "select * from public.fidelizacion_solicitudes_detalle where actividad_id='FID-ADMIN'")).length);
    await assert.rejects(create("ADMIN", "FID-ADMIN-CREATE"), { code: "42501" });
    await as("ADMIN", "select public.cambiar_estado_solicitud('FID-ADMIN','Aprobado','Nuevo','','')");
    await assert.rejects(as("ADMIN", "select public.cambiar_estado_solicitud('FID-ADMIN','En trabajo','Nuevo','','')"), { code: "40001" });
    await assert.rejects(as("ADMIN", "select public.cambiar_estado_solicitud('FID-ADMIN','Finalizado','Aprobado','','')"), /referencia/);
    await as("ADMIN", "select public.cambiar_estado_solicitud('FID-ADMIN','Finalizado','Aprobado','ORCE-ADMIN','')");
    assert.equal(Number((await as("ADMIN", "select descuento from public.canasto_fidelizacion where sku='SKU-ADMIN'"))[0].descuento), 20);
    await assert.rejects(as("ADMIN", "select public.cambiar_estado_solicitud('FID-ADMIN','Nuevo','Finalizado','','')"), /reabrirse/);
    await as("ADMIN", "select public.cambiar_estado_solicitud('FID-ADMIN','Archivado','Finalizado','','')");
    await db.exec("insert into public.campanas(legacy_actividad_id, estado) values ('SPECIAL-ADMIN','Nuevo')");
    await as("ADMIN", "select public.cambiar_estado_solicitud('SPECIAL-ADMIN','Aprobado','Nuevo','','')");
    assert.equal((await as("ADMIN", "select estado from public.campanas where legacy_actividad_id='SPECIAL-ADMIN'"))[0].estado, 'Aprobado');
    for (const role of ["BUYER", "MARK", "AUD", "DISENADOR", "anon"]) {
      await assert.rejects(as(role, "select public.cambiar_estado_solicitud('SPECIAL-ADMIN','En trabajo','Aprobado','','')"), { code: "42501" });
    }
    const adminOrce = await readFile(new URL("../docs/supabase_admin_orce.sql", import.meta.url), "utf8");
    await db.exec(adminOrce);
    await db.exec(adminOrce);
    const adminRow = (await as("ADMIN", "select * from public.canasto_fidelizacion where sku='SKU-ADMIN'"))[0];
    const adminInput = [importRow(adminRow.revision_orce, 20, 'SKU-ADMIN')];
    const adminBatch = '20000000-0000-0000-0000-000000000001';
    const [adminResult] = await reconcile('ADMIN', adminInput, adminBatch);
    assert.equal(adminResult.result.updated, 1);
    await reconcile('ADMIN', adminInput, adminBatch);
    assert.equal((await as("ADMIN", "select * from public.fidelizacion_orce_importaciones where id=$1", [adminBatch])).length, 1);
    assert.ok((await as("ADMIN", "select * from public.fidelizacion_orce_historial where canasto_id=$1", [adminRow.id])).length > 0);
    const [adminStale] = await reconcile('ADMIN', adminInput);
    assert.equal(adminStale.result.rows[0].status, 'CAMBIO_CONCURRENTE');
    for (const role of ['BUYER', 'MARK', 'AUD', 'DISENADOR', 'anon']) {
      await assert.rejects(reconcile(role, adminInput), { code: '42501' });
    }

    // Bulk request test: 1500 SKUs inserted atomically and rapidly
    const bulkSkus = Array.from({ length: 1500 }, (_, i) => ({
      sku: `SKU-BULK-${i}`,
      segmento_id: "1002",
      descuento_anterior: 0,
      descuento_solicitado: 15,
      tipo_cambio: "NUEVO",
    }));
    const [bulkRes] = await as("BUYER",
      "select public.crear_solicitud_fidelizacion($1::jsonb, $2::jsonb) res",
      [activity("FID-BULK"), bulkSkus]
    );
    assert.equal(bulkRes.res.rows_inserted, 1500);
    assert.equal(Number((await as("BUYER", "select count(*) count from public.fidelizacion_solicitudes_detalle where actividad_id='FID-BULK'"))[0].count), 1500);
  } finally { await db.close(); }
});
