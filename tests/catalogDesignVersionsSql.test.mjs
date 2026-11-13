import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

test("design version RPC and RLS protect history and register immutable uploads", { skip: !process.env.PROMO_SQL_TEST_RUNTIME }, async () => {
  const { PGlite } = await import(pathToFileURL(process.env.PROMO_SQL_TEST_RUNTIME).href);
  const db = new PGlite();
  const uuid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
  const page = uuid(10), otherPage = uuid(11), project = uuid(20);
  const path = (n, pageId = page) => `catalogos/CAT/paginas/${pageId}/${uuid(n)}.png`;
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema storage;
      create table storage.buckets(id text primary key,public boolean);
      insert into storage.buckets values('sns_app_promo',true);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table public.usuarios_app(id uuid primary key,auth_user_id uuid,buyer_id uuid,rol text,activo boolean default true);
      create function public.current_user_role() returns text language sql stable security definer as $$ select rol from public.usuarios_app where auth_user_id=auth.uid() and activo $$;
      create function public.is_role(r text) returns boolean language sql stable as $$ select public.current_user_role()=r $$;
      create function public.is_any_role(r text[]) returns boolean language sql stable as $$ select public.current_user_role()=any(r) $$;
      create table public.catalogo_proyecto_diseno(id uuid primary key,catalogo_id text);
      create table public.catalogo_paginas_diseno(id uuid primary key,proyecto_id uuid,numero_pagina integer,
        titulo_pagina text,disenador_id uuid,comprador_id uuid,estado text,observacion_actual text,actualizado_por uuid,
        fecha_actualizacion timestamptz,fecha_ultima_carga timestamptz,fecha_creacion timestamptz default now(),archivo_path text,archivo_url text);
      create table public.catalogo_pagina_comentarios(id uuid primary key,pagina_id uuid);
      create table storage.objects(bucket_id text,name text,owner_id text,primary key(bucket_id,name));
      alter table public.catalogo_paginas_diseno enable row level security;
      alter table storage.objects enable row level security;
      grant usage on schema public,auth,storage to authenticated;
      grant select,insert,update,delete on public.catalogo_paginas_diseno,storage.objects to authenticated;
      create policy pages_fixture on public.catalogo_paginas_diseno for all to authenticated using(true) with check(true);
      -- Even an unrelated permissive Storage policy must not bypass the migration.
      create policy storage_legacy_open on storage.objects for all to authenticated using(true) with check(true);
      insert into public.usuarios_app values
        ('${uuid(1)}','${uuid(1)}',null,'DISENADOR',true),
        ('${uuid(2)}','${uuid(2)}',null,'DISENADOR',true),
        ('${uuid(3)}','${uuid(3)}','${uuid(30)}','BUYER',true),
        ('${uuid(4)}','${uuid(4)}',null,'ADMIN',true),
        ('${uuid(5)}','${uuid(5)}',null,'AUD',true);
      insert into public.catalogo_proyecto_diseno values('${project}','CAT');
      insert into public.catalogo_paginas_diseno(id,proyecto_id,numero_pagina,disenador_id,comprador_id)
        values('${page}','${project}',1,'${uuid(1)}','${uuid(30)}'),('${otherPage}','${project}',2,'${uuid(2)}',null);
    `);
    await db.exec(await readFile(new URL("../docs/supabase_catalogo_diseno_versiones.sql", import.meta.url), "utf8"));
    const baseSchema = await readFile(new URL("../docs/supabase_catalogo_diseno.sql", import.meta.url), "utf8");
    await db.exec(baseSchema.slice(baseSchema.indexOf("create or replace function public.catalogo_paginas_diseno_guard_restricted_update()"), baseSchema.indexOf("create or replace function public.catalogo_pagina_comentarios_guard_status_update()")));
    const migration = await readFile(new URL("../docs/supabase_catalogo_diseno_versiones_seguras.sql", import.meta.url), "utf8");
    await db.exec(migration);
    await db.exec(migration);
    async function as(user, sql, params = []) {
      await db.exec("begin");
      try {
        await db.query("select set_config('request.jwt.claim.sub',$1,true)", [uuid(user)]);
        await db.exec("set local role authenticated");
        const result = await db.query(sql, params);
        await db.exec("commit");
        return result.rows;
      } catch (error) { await db.exec("rollback"); throw error; }
    }
    const upload = (user, n, pageId = page) => as(user, "insert into storage.objects values('sns_app_promo',$1,$2)", [path(n,pageId), uuid(user)]);
    const register = async (user, n, pageId = page) => (await as(user, "select public.register_catalog_design_version($1,$2) as result", [pageId,path(n,pageId)]))[0].result;
    await upload(1,100);
    await upload(1,101);
    assert.equal((await register(1,100)).versionNumber, 1);
    assert.equal((await register(1,101)).versionNumber, 2);
    assert.equal((await register(1,100)).versionNumber, 1); // idempotent retry
    assert.equal((await db.query("select version_actual from public.catalogo_paginas_diseno where id=$1",[page])).rows[0].version_actual,2);
    await assert.rejects(upload(1,100)); // never overwrite an existing object
    await assert.rejects(upload(2,102)); // other designer
    await assert.rejects(upload(3,102)); // buyer cannot upload
    await assert.rejects(register(2,100));
    await assert.rejects(register(3,100));
    await assert.rejects(register(1,999)); // file must exist
    await assert.rejects(register(4,100)); // cannot claim another user's object
    await upload(2,103,otherPage);
    await register(2,103,otherPage);
    assert.equal((await as(1,"select * from public.catalogo_pagina_versiones")).length,2);
    assert.equal((await as(2,"select * from public.catalogo_pagina_versiones")).length,1);
    assert.equal((await as(3,"select * from public.catalogo_pagina_versiones")).length,2);
    assert.equal((await as(5,"select * from public.catalogo_pagina_versiones")).length,3);
    assert.equal((await as(1,"select * from storage.objects")).length,2);
    assert.equal((await as(2,"select * from storage.objects")).length,1);
    assert.equal((await as(3,"select * from storage.objects")).length,2);
    assert.equal((await as(1,"update storage.objects set owner_id='changed' returning *")).length,0);
    assert.equal((await as(4,"delete from storage.objects returning *")).length,0);
    await assert.rejects(as(1,"update public.catalogo_paginas_diseno set version_actual=99 where id=$1",[page]));
    await assert.rejects(as(4,"insert into public.catalogo_pagina_versiones(pagina_id,numero_version,archivo_path) values($1,9,'fake')",[page]));
    // Old names remain readable through historical records, not a filename wildcard.
    await db.query("insert into storage.objects values('sns_app_promo','catalogos/CAT/paginas/pagina_1_v0.jpg',$1)",[uuid(1)]);
    await db.query("insert into public.catalogo_pagina_versiones(pagina_id,numero_version,archivo_path) values($1,3,'catalogos/CAT/paginas/pagina_1_v0.jpg')",[page]);
    assert.equal((await as(3,"select * from storage.objects")).length,3);
    // Failure of page update rolls back the inserted version.
    await upload(1,104);
    await db.exec("create function fail_update() returns trigger language plpgsql as $$ begin raise exception 'simulated failure'; end $$; create trigger fail before update on public.catalogo_paginas_diseno for each row execute function fail_update();");
    await assert.rejects(register(1,104), /simulated failure/);
    assert.equal((await db.query("select * from public.catalogo_pagina_versiones where archivo_path=$1",[path(104)])).rows.length,0);
  } finally { await db.close(); }
});
