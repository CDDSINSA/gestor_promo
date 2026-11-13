-- Script de migración: Versionamiento de imágenes y comentarios en Catálogo Diseño
-- Ejecutar en Supabase SQL Editor.

begin;

-- Funciones auxiliares para RLS si no estuvieran definidas en el esquema
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

create or replace function public.current_buyer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select buyer_id
  from public.usuarios_app
  where auth_user_id = auth.uid()
    and activo = true
  limit 1;
$$;

-- 1. Tabla de versiones históricas de cada página
create table if not exists public.catalogo_pagina_versiones (
  id uuid primary key default gen_random_uuid(),
  pagina_id uuid not null references public.catalogo_paginas_diseno(id) on delete cascade,
  numero_version integer not null check (numero_version > 0),
  archivo_path text not null,
  archivo_url text,
  creado_por uuid references public.usuarios_app(id) on delete set null,
  fecha_creacion timestamptz not null default now(),
  constraint catalogo_pagina_versiones_pagina_numero_unique unique (pagina_id, numero_version)
);

create index if not exists idx_catalogo_pagina_versiones_pagina on public.catalogo_pagina_versiones(pagina_id);

-- 2. Habilitar RLS en catalogo_pagina_versiones
alter table public.catalogo_pagina_versiones enable row level security;

drop policy if exists catalogo_pagina_versiones_select on public.catalogo_pagina_versiones;
create policy catalogo_pagina_versiones_select
on public.catalogo_pagina_versiones for select
to authenticated
using (true);

drop policy if exists catalogo_pagina_versiones_insert on public.catalogo_pagina_versiones;
create policy catalogo_pagina_versiones_insert
on public.catalogo_pagina_versiones for insert
to authenticated
with check (
  public.is_any_role(array['ADMIN', 'MARK', 'DISENADOR'])
  or exists (
    select 1 from public.catalogo_paginas_diseno p
    where p.id = pagina_id
      and (p.disenador_id = public.current_app_user_id() or p.comprador_id = public.current_buyer_id())
  )
);

-- 3. Agregar version_actual a catalogo_paginas_diseno si no existe
alter table public.catalogo_paginas_diseno
  add column if not exists version_actual integer default 1;

-- 4. Agregar numero_version y version_id a catalogo_pagina_comentarios si no existen
alter table public.catalogo_pagina_comentarios
  add column if not exists numero_version integer default null,
  add column if not exists version_id uuid references public.catalogo_pagina_versiones(id) on delete set null;

create index if not exists idx_catalogo_pagina_comentarios_version on public.catalogo_pagina_comentarios(pagina_id, numero_version);

-- 5. Poblar catalogo_pagina_versiones con las imágenes ya existentes (v1)
insert into public.catalogo_pagina_versiones (pagina_id, numero_version, archivo_path, archivo_url, creado_por, fecha_creacion)
select 
  id as pagina_id,
  1 as numero_version,
  archivo_path,
  archivo_url,
  actualizado_por as creado_por,
  coalesce(fecha_ultima_carga, fecha_creacion, now()) as fecha_creacion
from public.catalogo_paginas_diseno
where archivo_path is not null
on conflict (pagina_id, numero_version) do nothing;

-- 6. Asignar versión 1 a comentarios existentes en páginas que ya tengan imagen
update public.catalogo_pagina_comentarios c
set numero_version = 1
where c.numero_version is null
  and exists (
    select 1 from public.catalogo_paginas_diseno p
    where p.id = c.pagina_id and p.archivo_path is not null
  );

commit;
