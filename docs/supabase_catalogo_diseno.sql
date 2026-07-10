-- Modulo Diseño de Catalogos.
-- Ejecutar en Supabase SQL Editor despues de docs/supabase_roles_permissions_mvp.sql.

begin;

-- Permite integrar diseñadores sin romper los roles actuales del MVP.
alter table public.usuarios_app
  drop constraint if exists usuarios_app_rol_check;

update public.usuarios_app
set rol = case upper(trim(rol))
  when 'COMPRADOR' then 'BUYER'
  when 'COMP' then 'BUYER'
  when 'MERCADEO' then 'MARK'
  when 'MARKETING' then 'MARK'
  when 'PRICING' then 'OPER'
  when 'PRICE' then 'OPER'
  when 'PLANIMETRIA' then 'OPER'
  when 'AUT' then 'AUD'
  when 'CDD' then 'DISENADOR'
  when 'DISEÑADOR' then 'DISENADOR'
  else upper(trim(rol))
end;

alter table public.usuarios_app
  add constraint usuarios_app_rol_check
  check (rol in ('ADMIN', 'BUYER', 'MARK', 'OPER', 'AUD', 'DISENADOR'));

drop policy if exists usuarios_select_self_or_admin on public.usuarios_app;
create policy usuarios_select_self_admin_mark
on public.usuarios_app for select
to authenticated
using (auth_user_id = auth.uid() or public.is_any_role(array['ADMIN', 'MARK']));

create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.usuarios_app
  where auth_user_id = auth.uid()
    and activo = true
  limit 1;
$$;

create table if not exists public.catalogo_proyecto_diseno (
  id uuid primary key default gen_random_uuid(),
  catalogo_id text not null,
  nombre_proyecto text not null,
  estado text not null default 'planificacion',
  fecha_inicio date,
  fecha_entrega date,
  creado_por uuid references public.usuarios_app(id) on delete set null,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalogo_proyecto_diseno_estado_check
    check (estado in ('planificacion', 'en_diseno', 'en_revision', 'aprobado', 'consolidado', 'cancelado'))
);

create table if not exists public.catalogo_paginas_diseno (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.catalogo_proyecto_diseno(id) on delete cascade,
  numero_pagina integer not null check (numero_pagina > 0),
  titulo_pagina text,
  disenador_id uuid references public.usuarios_app(id) on delete set null,
  comprador_id uuid references public.compradores(id) on delete set null,
  estado text not null default 'pendiente',
  archivo_path text,
  archivo_url text,
  fecha_ultima_carga timestamptz,
  actualizado_por uuid references public.usuarios_app(id) on delete set null,
  observacion_actual text,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalogo_paginas_diseno_estado_check
    check (estado in ('pendiente', 'en_diseno', 'en_revision', 'ajustes', 'aprobada', 'rechazada', 'lista_consolidar')),
  constraint catalogo_paginas_diseno_numero_unique unique (proyecto_id, numero_pagina)
);

create table if not exists public.catalogo_pagina_comentarios (
  id uuid primary key default gen_random_uuid(),
  pagina_id uuid not null references public.catalogo_paginas_diseno(id) on delete cascade,
  usuario_id uuid references public.usuarios_app(id) on delete set null,
  comentario text not null,
  tipo text not null default 'comentario',
  fecha_creacion timestamptz not null default now(),
  constraint catalogo_pagina_comentarios_tipo_check
    check (tipo in ('comentario', 'observacion', 'aprobacion', 'rechazo', 'ajuste'))
);

create table if not exists public.catalogo_consolidado_final (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.catalogo_proyecto_diseno(id) on delete cascade,
  pdf_path text,
  pdf_url text,
  estado text not null default 'pendiente',
  consolidado_por uuid references public.usuarios_app(id) on delete set null,
  fecha_consolidacion timestamptz,
  fecha_creacion timestamptz not null default now(),
  constraint catalogo_consolidado_final_estado_check
    check (estado in ('pendiente', 'consolidado', 'cancelado')),
  constraint catalogo_consolidado_final_proyecto_unique unique (proyecto_id)
);

create index if not exists idx_catalogo_proyecto_diseno_catalogo on public.catalogo_proyecto_diseno(catalogo_id);
create index if not exists idx_catalogo_paginas_diseno_proyecto on public.catalogo_paginas_diseno(proyecto_id);
create index if not exists idx_catalogo_paginas_diseno_disenador on public.catalogo_paginas_diseno(disenador_id);
create index if not exists idx_catalogo_paginas_diseno_comprador on public.catalogo_paginas_diseno(comprador_id);
create index if not exists idx_catalogo_pagina_comentarios_pagina on public.catalogo_pagina_comentarios(pagina_id);

alter table public.catalogo_proyecto_diseno
  add column if not exists updated_at timestamptz not null default now();

alter table public.catalogo_paginas_diseno
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_fecha_actualizacion()
returns trigger
language plpgsql
as $$
begin
  new.fecha_actualizacion = now();
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists catalogo_proyecto_diseno_set_updated_at on public.catalogo_proyecto_diseno;
drop trigger if exists catalogo_proyecto_diseno_set_fecha_actualizacion on public.catalogo_proyecto_diseno;
create trigger catalogo_proyecto_diseno_set_fecha_actualizacion
before update on public.catalogo_proyecto_diseno
for each row execute function public.set_fecha_actualizacion();

drop trigger if exists catalogo_paginas_diseno_set_updated_at on public.catalogo_paginas_diseno;
drop trigger if exists catalogo_paginas_diseno_set_fecha_actualizacion on public.catalogo_paginas_diseno;
create trigger catalogo_paginas_diseno_set_fecha_actualizacion
before update on public.catalogo_paginas_diseno
for each row execute function public.set_fecha_actualizacion();

create or replace function public.catalogo_paginas_diseno_guard_restricted_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  role_name text := public.current_user_role();
begin
  if public.is_any_role(array['ADMIN', 'MARK']) then
    return new;
  end if;

  if role_name = 'DISENADOR' then
    if old.disenador_id is distinct from public.current_app_user_id()
      or new.disenador_id is distinct from old.disenador_id
      or new.comprador_id is distinct from old.comprador_id
      or new.proyecto_id is distinct from old.proyecto_id
      or new.numero_pagina is distinct from old.numero_pagina
      or new.estado not in ('en_diseno', 'en_revision') then
      raise exception 'El diseñador solo puede actualizar la imagen de sus paginas asignadas.';
    end if;
    return new;
  end if;

  if role_name = 'BUYER' then
    if old.comprador_id is distinct from public.current_buyer_id()
      or new.comprador_id is distinct from old.comprador_id
      or new.disenador_id is distinct from old.disenador_id
      or new.proyecto_id is distinct from old.proyecto_id
      or new.numero_pagina is distinct from old.numero_pagina
      or new.estado not in ('aprobada', 'ajustes', 'rechazada') then
      raise exception 'El comprador solo puede aprobar o solicitar ajustes en sus paginas asignadas.';
    end if;
    return new;
  end if;

  raise exception 'Rol no autorizado para actualizar paginas de diseño.';
end;
$$;

drop trigger if exists catalogo_paginas_diseno_restricted_update on public.catalogo_paginas_diseno;
create trigger catalogo_paginas_diseno_restricted_update
before update on public.catalogo_paginas_diseno
for each row execute function public.catalogo_paginas_diseno_guard_restricted_update();

alter table public.catalogo_proyecto_diseno enable row level security;
alter table public.catalogo_paginas_diseno enable row level security;
alter table public.catalogo_pagina_comentarios enable row level security;
alter table public.catalogo_consolidado_final enable row level security;

grant select, insert, update, delete on
  public.catalogo_proyecto_diseno,
  public.catalogo_paginas_diseno,
  public.catalogo_pagina_comentarios,
  public.catalogo_consolidado_final
to authenticated;

drop policy if exists catalogo_proyecto_diseno_select_roles on public.catalogo_proyecto_diseno;
create policy catalogo_proyecto_diseno_select_roles
on public.catalogo_proyecto_diseno for select
to authenticated
using (public.current_user_role() is not null);

drop policy if exists catalogo_proyecto_diseno_manage_admin_mark on public.catalogo_proyecto_diseno;
create policy catalogo_proyecto_diseno_manage_admin_mark
on public.catalogo_proyecto_diseno for all
to authenticated
using (public.is_any_role(array['ADMIN', 'MARK']))
with check (public.is_any_role(array['ADMIN', 'MARK']));

drop policy if exists catalogo_paginas_diseno_select_scoped on public.catalogo_paginas_diseno;
create policy catalogo_paginas_diseno_select_scoped
on public.catalogo_paginas_diseno for select
to authenticated
using (
  public.is_any_role(array['ADMIN', 'MARK', 'AUD'])
  or (public.is_role('DISENADOR') and disenador_id = public.current_app_user_id())
  or (public.is_role('BUYER') and comprador_id = public.current_buyer_id())
);

drop policy if exists catalogo_paginas_diseno_insert_admin_mark on public.catalogo_paginas_diseno;
create policy catalogo_paginas_diseno_insert_admin_mark
on public.catalogo_paginas_diseno for insert
to authenticated
with check (public.is_any_role(array['ADMIN', 'MARK']));

drop policy if exists catalogo_paginas_diseno_update_scoped on public.catalogo_paginas_diseno;
create policy catalogo_paginas_diseno_update_scoped
on public.catalogo_paginas_diseno for update
to authenticated
using (
  public.is_any_role(array['ADMIN', 'MARK'])
  or (public.is_role('DISENADOR') and disenador_id = public.current_app_user_id())
  or (public.is_role('BUYER') and comprador_id = public.current_buyer_id())
)
with check (
  public.is_any_role(array['ADMIN', 'MARK'])
  or (public.is_role('DISENADOR') and disenador_id = public.current_app_user_id())
  or (public.is_role('BUYER') and comprador_id = public.current_buyer_id())
);

drop policy if exists catalogo_paginas_diseno_delete_admin_mark on public.catalogo_paginas_diseno;
create policy catalogo_paginas_diseno_delete_admin_mark
on public.catalogo_paginas_diseno for delete
to authenticated
using (public.is_any_role(array['ADMIN', 'MARK']));

drop policy if exists catalogo_pagina_comentarios_select_scoped on public.catalogo_pagina_comentarios;
create policy catalogo_pagina_comentarios_select_scoped
on public.catalogo_pagina_comentarios for select
to authenticated
using (
  exists (
    select 1
    from public.catalogo_paginas_diseno p
    where p.id = pagina_id
  )
);

drop policy if exists catalogo_pagina_comentarios_insert_scoped on public.catalogo_pagina_comentarios;
create policy catalogo_pagina_comentarios_insert_scoped
on public.catalogo_pagina_comentarios for insert
to authenticated
with check (
  usuario_id = public.current_app_user_id()
  and exists (
    select 1
    from public.catalogo_paginas_diseno p
    where p.id = pagina_id
      and (
        public.is_any_role(array['ADMIN', 'MARK'])
        or (public.is_role('DISENADOR') and p.disenador_id = public.current_app_user_id())
        or (public.is_role('BUYER') and p.comprador_id = public.current_buyer_id())
      )
  )
);

drop policy if exists catalogo_consolidado_final_select_roles on public.catalogo_consolidado_final;
create policy catalogo_consolidado_final_select_roles
on public.catalogo_consolidado_final for select
to authenticated
using (public.current_user_role() is not null);

drop policy if exists catalogo_consolidado_final_manage_admin_mark on public.catalogo_consolidado_final;
create policy catalogo_consolidado_final_manage_admin_mark
on public.catalogo_consolidado_final for all
to authenticated
using (public.is_any_role(array['ADMIN', 'MARK']))
with check (public.is_any_role(array['ADMIN', 'MARK']));

-- Buckets privados. El frontend genera signed URLs para visualizar.
insert into storage.buckets (id, name, public)
values
  ('sns_app_promo', 'sns_app_promo', false),
  ('catalogo_final', 'catalogo_final', false)
on conflict (id) do update set public = false;

drop policy if exists catalog_design_work_storage_read on storage.objects;
create policy catalog_design_work_storage_read
on storage.objects for select
to authenticated
using (
  bucket_id = 'sns_app_promo'
  and (
    public.is_any_role(array['ADMIN', 'MARK', 'AUD'])
    or exists (
      select 1
      from public.catalogo_paginas_diseno p
      join public.catalogo_proyecto_diseno pr on pr.id = p.proyecto_id
      where (
        p.archivo_path = name
        or name like 'catalogos/' || pr.catalogo_id || '/paginas/pagina_' || p.numero_pagina || '.%'
      )
      and (
        (public.is_role('DISENADOR') and p.disenador_id = public.current_app_user_id())
        or (public.is_role('BUYER') and p.comprador_id = public.current_buyer_id())
      )
    )
  )
);

drop policy if exists catalog_design_work_storage_write on storage.objects;
create policy catalog_design_work_storage_write
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'sns_app_promo'
  and (
    public.is_any_role(array['ADMIN', 'MARK'])
    or exists (
      select 1
      from public.catalogo_paginas_diseno p
      join public.catalogo_proyecto_diseno pr on pr.id = p.proyecto_id
      where name like 'catalogos/' || pr.catalogo_id || '/paginas/pagina_' || p.numero_pagina || '.%'
        and public.is_role('DISENADOR')
        and p.disenador_id = public.current_app_user_id()
    )
  )
);

drop policy if exists catalog_design_work_storage_update on storage.objects;
create policy catalog_design_work_storage_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'sns_app_promo'
  and (
    public.is_any_role(array['ADMIN', 'MARK'])
    or exists (
      select 1
      from public.catalogo_paginas_diseno p
      where p.archivo_path = name
        and public.is_role('DISENADOR')
        and p.disenador_id = public.current_app_user_id()
    )
  )
)
with check (bucket_id = 'sns_app_promo');

drop policy if exists catalog_design_final_storage_read on storage.objects;
create policy catalog_design_final_storage_read
on storage.objects for select
to authenticated
using (
  bucket_id = 'catalogo_final'
  and public.current_user_role() is not null
);

drop policy if exists catalog_design_final_storage_write on storage.objects;
create policy catalog_design_final_storage_write
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'catalogo_final'
  and public.is_any_role(array['ADMIN', 'MARK'])
);

drop policy if exists catalog_design_final_storage_update on storage.objects;
create policy catalog_design_final_storage_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'catalogo_final'
  and public.is_any_role(array['ADMIN', 'MARK'])
)
with check (
  bucket_id = 'catalogo_final'
  and public.is_any_role(array['ADMIN', 'MARK'])
);

commit;
