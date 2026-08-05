-- Refuerzo de integridad para impedir campanas sin actividad_id legada.
-- Ejecutar en Supabase SQL Editor antes o junto con docs/supabase_transactional_save_rpc.sql.

do $$
begin
  if exists (
    select 1
    from public.campanas
    where legacy_actividad_id is null
       or length(trim(legacy_actividad_id)) = 0
  ) then
    raise exception 'No se puede activar la restriccion: existen campanas con legacy_actividad_id vacio.';
  end if;
end $$;

alter table public.campanas
  alter column legacy_actividad_id set not null;

alter table public.campanas
  drop constraint if exists campanas_legacy_actividad_id_required;

alter table public.campanas
  add constraint campanas_legacy_actividad_id_required
  check (length(trim(legacy_actividad_id)) > 0);

-- La relacion obligatoria de promociones hacia campanas ya existe en el esquema:
-- public.promociones.campana_id uuid not null references public.campanas(id).
