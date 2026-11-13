-- Control de concurrencia optimista para promociones.
-- Ejecutar antes de reemplazar la funcion save_catalog_transactional actualizada.

alter table public.promociones
  add column if not exists version bigint not null default 1;

alter table public.promociones
  drop constraint if exists promociones_version_positive_check;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'promociones_version_positive_check'
      and conrelid = 'public.promociones'::regclass
  ) then
    alter table public.promociones
      add constraint promociones_version_positive_check
      check (version > 0);
  end if;
end;
$$;
