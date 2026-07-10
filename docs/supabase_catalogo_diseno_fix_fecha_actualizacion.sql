-- Correccion para instalaciones existentes del modulo Diseño de Catalogos.
-- Soluciona: record "new" has no field "updated_at" [42703]

begin;

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

do $$
declare
  trigger_item record;
begin
  for trigger_item in
    select n.nspname as schema_name, c.relname as table_name, t.tgname as trigger_name
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal
      and n.nspname = 'public'
      and c.relname in ('catalogo_proyecto_diseno', 'catalogo_paginas_diseno')
      and (
        pg_get_triggerdef(t.oid) ilike '%set_updated_at%'
        or pg_get_triggerdef(t.oid) ilike '%set_fecha_actualizacion%'
      )
  loop
    execute format(
      'drop trigger if exists %I on %I.%I',
      trigger_item.trigger_name,
      trigger_item.schema_name,
      trigger_item.table_name
    );
  end loop;
end;
$$;

create trigger catalogo_proyecto_diseno_set_fecha_actualizacion
before update on public.catalogo_proyecto_diseno
for each row execute function public.set_fecha_actualizacion();

create trigger catalogo_paginas_diseno_set_fecha_actualizacion
before update on public.catalogo_paginas_diseno
for each row execute function public.set_fecha_actualizacion();

drop policy if exists catalogo_paginas_diseno_delete_admin_mark on public.catalogo_paginas_diseno;
create policy catalogo_paginas_diseno_delete_admin_mark
on public.catalogo_paginas_diseno for delete
to authenticated
using (public.is_any_role(array['ADMIN', 'MARK']));

commit;
