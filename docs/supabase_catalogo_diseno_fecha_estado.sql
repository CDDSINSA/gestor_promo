-- Seguimiento exacto de cambios de estado, sin alterar las fechas de actualización.
-- Aplicar en Supabase SQL Editor. Los registros anteriores conservan NULL hasta
-- su siguiente cambio de estado: no se inventa una fecha histórica.
begin;
alter table public.catalogo_proyecto_diseno add column if not exists fecha_ultimo_estado timestamptz;
alter table public.catalogo_paginas_diseno add column if not exists fecha_ultimo_estado timestamptz;

create or replace function public.catalogo_diseno_set_fecha_estado()
returns trigger language plpgsql set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    new.fecha_ultimo_estado := clock_timestamp();
  elsif new.estado is distinct from old.estado then
    new.fecha_ultimo_estado := clock_timestamp();
  else
    new.fecha_ultimo_estado := old.fecha_ultimo_estado;
  end if;
  return new;
end;
$$;

drop trigger if exists catalogo_proyecto_diseno_fecha_estado on public.catalogo_proyecto_diseno;
create trigger catalogo_proyecto_diseno_fecha_estado before insert or update on public.catalogo_proyecto_diseno
for each row execute function public.catalogo_diseno_set_fecha_estado();
drop trigger if exists catalogo_paginas_diseno_fecha_estado on public.catalogo_paginas_diseno;
create trigger catalogo_paginas_diseno_fecha_estado before insert or update on public.catalogo_paginas_diseno
for each row execute function public.catalogo_diseno_set_fecha_estado();
commit;
