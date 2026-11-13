import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

test("atomic project and review RPCs roll back failures and deduplicate retries", { skip: !process.env.PROMO_SQL_TEST_RUNTIME }, async () => {
  const { PGlite } = await import(pathToFileURL(process.env.PROMO_SQL_TEST_RUNTIME).href);
  const db = new PGlite();
  const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12,"0")}`;
  const read = (file) => readFile(new URL(`../docs/${file}`, import.meta.url), "utf8");
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth; create schema storage;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table public.usuarios_app(id uuid primary key,auth_user_id uuid,buyer_id uuid,rol text,activo boolean default true);
      create table public.compradores(id uuid primary key);
      create function public.current_user_role() returns text language sql stable security definer as $$ select rol from public.usuarios_app where auth_user_id=auth.uid() and activo $$;
      create function public.is_role(r text) returns boolean language sql stable as $$ select public.current_user_role()=r $$;
      create function public.is_any_role(r text[]) returns boolean language sql stable as $$ select public.current_user_role()=any(r) $$;
      create table storage.buckets(id text primary key,public boolean);
      create table storage.objects(bucket_id text,name text,owner_id text);
      grant usage on schema public,auth to authenticated;
      insert into public.compradores values('${id(30)}'),('${id(31)}');
      insert into public.usuarios_app values
        ('${id(1)}','${id(1)}',null,'ADMIN',true),
        ('${id(2)}','${id(2)}','${id(30)}','BUYER',true),
        ('${id(3)}','${id(3)}','${id(31)}','BUYER',true),
        ('${id(4)}','${id(4)}',null,'DISENADOR',true);
    `);
    const base = await read("supabase_catalogo_diseno.sql");
    await db.exec(base.slice(base.indexOf("create table if not exists public.catalogo_proyecto_diseno"),base.indexOf("create index if not exists idx_catalogo_proyecto_diseno")));
    await db.exec(await read("supabase_catalogo_diseno_versiones.sql"));
    await db.exec(base.slice(base.indexOf("create or replace function public.set_fecha_actualizacion()"),base.indexOf("create or replace function public.catalogo_pagina_comentarios_guard_status_update()")));
    await db.exec(await read("supabase_catalogo_diseno_versiones_seguras.sql"));
    const migration = await read("supabase_catalogo_diseno_operaciones_atomicas.sql");
    await db.exec(migration); await db.exec(migration);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(1)]);
    async function as(user, sql, params) {
      await db.exec("begin");
      try {
        await db.query("select set_config('request.jwt.claim.sub',$1,true)",[id(user)]);
        await db.exec("set local role authenticated");
        const result = await db.query(sql,params);
        await db.exec("commit"); return result.rows[0]?.result;
      } catch (error) { await db.exec("rollback"); throw error; }
    }
    const values = {catalogo_id:"CAT",nombre_proyecto:"Original",estado:"planificacion"};
    const save = (op,project,titles,changes = {},user = 1) => as(user,
      "select public.save_catalog_design_project($1,$2,$3,$4,$5) as result",
      [id(op),project?.id || null,{...values,...changes},titles,project?.fecha_actualizacion || null]);
    // Failure creating the second page rolls back the project and first page.
    await db.exec("create function fail_page() returns trigger language plpgsql as $$ begin if new.numero_pagina=2 then raise exception 'page failure'; end if; return new; end $$; create trigger test_fail_page before insert on public.catalogo_paginas_diseno for each row execute function fail_page();");
    await assert.rejects(save(100,null,["P1","P2"]),/page failure/);
    assert.equal((await db.query("select count(*)::int as n from public.catalogo_proyecto_diseno")).rows[0].n,0);
    assert.equal((await db.query("select count(*)::int as n from public.catalogo_diseno_operaciones")).rows[0].n,0);
    await db.exec("drop trigger test_fail_page on public.catalogo_paginas_diseno");
    const project = await save(100,null,["P1","P2","P3"]);
    assert.equal((await save(100,null,["P1","P2","P3"])).id,project.id);
    assert.equal((await db.query("select count(*)::int as n from public.catalogo_paginas_diseno")).rows[0].n,3);
    await assert.rejects(save(100,null,["different"]),/otra operación/);
    await assert.rejects(save(101,null,["P1"],{},2),/administrar/);
    const pages = (await db.query("select * from public.catalogo_paginas_diseno order by numero_pagina")).rows;
    await db.query("update public.catalogo_paginas_diseno set archivo_path='art.png' where id=$1",[pages[2].id]);
    await assert.rejects(save(102,project,["P1"],{nombre_proyecto:"Should not persist"}),/No se puede reducir/);
    assert.equal((await db.query("select nombre_proyecto from public.catalogo_proyecto_diseno")).rows[0].nombre_proyecto,"Original");
    await db.query("update public.catalogo_paginas_diseno set archivo_path=null where id=$1",[pages[2].id]);
    const reduced = await save(103,project,["P1"]);
    assert.equal((await db.query("select count(*)::int as n from public.catalogo_paginas_diseno")).rows[0].n,1);
    await assert.rejects(save(104,project,["P1","P2"]),/Otro usuario/);
    // Growth failure must roll back metadata too.
    await db.exec("create trigger test_fail_page before insert on public.catalogo_paginas_diseno for each row execute function fail_page();");
    await assert.rejects(save(105,reduced,["P1","P2"],{nombre_proyecto:"Failed grow"}),/page failure/);
    assert.equal((await db.query("select nombre_proyecto from public.catalogo_proyecto_diseno")).rows[0].nombre_proyecto,"Original");
    await db.exec("drop trigger test_fail_page on public.catalogo_paginas_diseno");
    const page = pages[0];
    await db.query("update public.catalogo_paginas_diseno set comprador_id=$1,archivo_path='v2.png',version_actual=2,estado='en_revision' where id=$2",[id(30),page.id]);
    await db.query("insert into public.catalogo_pagina_versiones(pagina_id,numero_version,archivo_path) values($1,2,'v2.png')",[page.id]);
    const review = (op,user=2,state="aprobada",version=2,path="v2.png") => as(user,
      "select public.review_catalog_design_page($1,$2,$3,$4,$5,$6,$7,$8) as result",[id(op),page.id,state,"",[],version,null,path]);
    await assert.rejects(review(110,3),/sin asignación/);
    await assert.rejects(review(111,4),/No puede revisar/);
    await assert.rejects(review(112,2,"aprobada",1),/vigente/);
    await assert.rejects(review(113,2,"aprobada",2,"old.png"),/vigente/);
    // A comment insertion failure must roll back the page state.
    await db.exec("create function fail_comment() returns trigger language plpgsql as $$ begin raise exception 'comment failure'; end $$; create trigger test_fail_comment before insert on public.catalogo_pagina_comentarios for each row execute function fail_comment();");
    await assert.rejects(review(114),/comment failure/);
    assert.equal((await db.query("select estado from public.catalogo_paginas_diseno where id=$1",[page.id])).rows[0].estado,"en_revision");
    await db.exec("drop trigger test_fail_comment on public.catalogo_pagina_comentarios");
    await review(114); await review(114);
    const comments = (await db.query("select * from public.catalogo_pagina_comentarios")).rows;
    assert.equal(comments.length,1); assert.equal(comments[0].tipo,"aprobacion"); assert.equal(comments[0].estado,"resuelto");
    await review(115,2,"ajustes");
    assert.equal((await db.query("select count(*)::int as n from public.catalogo_pagina_comentarios where tipo='rechazo' and estado='abierto'")).rows[0].n,1);
    // Open observations do not block approval.
    assert.equal((await review(116)).estado,"aprobada");
  } finally { await db.close(); }
});
