-- Ejecutar DESPUES de supabase_fidelizacion_integrity.sql.
-- IDs por combinación existente. No crea ni elimina filas del canasto.
begin;

alter table public.canasto_fidelizacion
  add column if not exists promo_id_orce text,
  add column if not exists oferta_id_orce text,
  add column if not exists estado_conciliacion_orce text not null default 'PENDIENTE',
  add column if not exists revision_orce bigint not null default 0,
  add column if not exists fecha_conciliacion_orce timestamptz,
  add column if not exists lote_conciliacion_orce uuid;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.canasto_fidelizacion'::regclass and conname = 'canasto_orce_estado_check') then
    alter table public.canasto_fidelizacion add constraint canasto_orce_estado_check
      check (estado_conciliacion_orce in ('PENDIENTE', 'CONCILIADO', 'NO_APLICA'));
    alter table public.canasto_fidelizacion add constraint canasto_orce_ids_check
      check ((promo_id_orce is null and oferta_id_orce is null) or
        (nullif(trim(promo_id_orce), '') is not null and nullif(trim(oferta_id_orce), '') is not null));
  end if;
end $$;

create table if not exists public.fidelizacion_orce_importaciones (
  id uuid primary key,
  archivo text not null,
  actor uuid,
  created_at timestamptz not null default now(),
  entrada jsonb not null,
  resultado jsonb not null default '{}'::jsonb
);
create table if not exists public.fidelizacion_orce_historial (
  id uuid primary key default gen_random_uuid(),
  canasto_id uuid not null,
  actividad_id text,
  actor uuid,
  created_at timestamptz not null default now(),
  anterior jsonb,
  nuevo jsonb not null
);
create index if not exists fidelizacion_orce_historial_canasto on public.fidelizacion_orce_historial(canasto_id, created_at);

-- Este trigger complementa la finalización existente, en la misma transacción.
-- Se protege también contra escrituras que eviten la RPC de finalización.
create or replace function public.prepare_fidelizacion_orce()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_changed boolean;
begin
  if tg_op = 'INSERT' then
    if public.current_user_role() = 'BUYER' and (new.promo_id_orce is not null or new.oferta_id_orce is not null) then
      raise exception 'Solo Ejecutor puede conciliar IDs ORCE.' using errcode = '42501';
    end if;
    new.revision_orce := 0;
    new.estado_conciliacion_orce := case when new.descuento = 0 then 'NO_APLICA'
      when new.promo_id_orce is not null and new.oferta_id_orce is not null then 'CONCILIADO' else 'PENDIENTE' end;
    return new;
  end if;
  if public.current_user_role() = 'BUYER' and
    (new.promo_id_orce, new.oferta_id_orce, new.estado_conciliacion_orce, new.fecha_conciliacion_orce, new.lote_conciliacion_orce, new.revision_orce)
    is distinct from
    (old.promo_id_orce, old.oferta_id_orce, old.estado_conciliacion_orce, old.fecha_conciliacion_orce, old.lote_conciliacion_orce, old.revision_orce) then
    raise exception 'Solo Ejecutor puede conciliar IDs ORCE.' using errcode = '42501';
  end if;
  if new.descuento is distinct from old.descuento then
    if new.descuento = 0 then
      new.promo_id_orce := old.promo_id_orce;
      new.oferta_id_orce := old.oferta_id_orce;
      new.fecha_conciliacion_orce := old.fecha_conciliacion_orce;
      new.lote_conciliacion_orce := old.lote_conciliacion_orce;
      new.estado_conciliacion_orce := 'NO_APLICA';
    else
      new.promo_id_orce := null;
      new.oferta_id_orce := null;
      new.fecha_conciliacion_orce := null;
      new.lote_conciliacion_orce := null;
      new.estado_conciliacion_orce := 'PENDIENTE';
    end if;
  end if;
  v_changed := (new.descuento, new.promo_id_orce, new.oferta_id_orce, new.estado_conciliacion_orce,
    new.fecha_conciliacion_orce, new.lote_conciliacion_orce) is distinct from
    (old.descuento, old.promo_id_orce, old.oferta_id_orce, old.estado_conciliacion_orce,
    old.fecha_conciliacion_orce, old.lote_conciliacion_orce);
  new.revision_orce := old.revision_orce + case when v_changed then 1 else 0 end;
  return new;
end $$;

create or replace function public.audit_fidelizacion_orce()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  if tg_op = 'INSERT' then
    if new.promo_id_orce is null and new.oferta_id_orce is null then return new; end if;
    insert into public.fidelizacion_orce_historial(canasto_id, actividad_id, actor, nuevo)
      values (new.id, new.ultima_solicitud_id, auth.uid(), to_jsonb(new));
  elsif new.revision_orce is distinct from old.revision_orce then
    insert into public.fidelizacion_orce_historial(canasto_id, actividad_id, actor, anterior, nuevo)
      values (new.id, new.ultima_solicitud_id, auth.uid(), to_jsonb(old), to_jsonb(new));
  end if;
  return new;
end $$;

drop trigger if exists orce_prepare on public.canasto_fidelizacion;
create trigger orce_prepare before insert or update on public.canasto_fidelizacion
  for each row execute function public.prepare_fidelizacion_orce();
drop trigger if exists orce_audit on public.canasto_fidelizacion;
create trigger orce_audit after insert or update on public.canasto_fidelizacion
  for each row execute function public.audit_fidelizacion_orce();

create or replace function public.conciliar_fidelizacion_orce(p_lote uuid, p_archivo text, p_filas jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_item record;
  v_current public.canasto_fidelizacion%rowtype;
  v_lote public.fidelizacion_orce_importaciones%rowtype;
  v_status text;
  v_rows jsonb := '[]'::jsonb;
  v_updated integer := 0;
  v_result jsonb;
begin
  if public.current_user_role() is distinct from 'OPER' then
    raise exception 'Solo Ejecutor puede conciliar IDs ORCE.' using errcode = '42501';
  end if;
  if p_lote is null or nullif(trim(p_archivo), '') is null or jsonb_typeof(p_filas) is distinct from 'array' then
    raise exception 'Lote, archivo y filas son obligatorios.';
  end if;
  if jsonb_array_length(p_filas) = 0 then raise exception 'No hay filas para conciliar.'; end if;
  -- Mismo orden de bloqueo que creación/finalización. Reintentos no duplican el lote.
  perform pg_advisory_xact_lock(hashtextextended('fidelizacion:canasto', 0));
  select * into v_lote from public.fidelizacion_orce_importaciones where id = p_lote;
  if found then
    if v_lote.actor is distinct from auth.uid() or v_lote.archivo <> p_archivo or v_lote.entrada <> p_filas then
      raise exception 'El identificador del lote pertenece a otra carga.';
    end if;
    return v_lote.resultado;
  end if;
  if exists (select 1 from jsonb_array_elements(p_filas) r
    group by r->>'canal', r->>'sku', r->>'segmento_id' having count(*) > 1) then
    raise exception 'Hay combinaciones duplicadas o contradictorias en el lote.';
  end if;
  for v_item in select * from jsonb_to_recordset(p_filas) as r(canal text, sku text, segmento_id text,
    descuento numeric, promo_id_orce text, oferta_id_orce text, revision_esperada bigint)
    order by canal, sku, segmento_id
  loop
    v_status := null;
    if v_item.canal is null or v_item.canal not in ('comasa','retail') or nullif(trim(v_item.sku), '') is null
      or nullif(trim(v_item.segmento_id), '') is null or v_item.descuento is null
      or v_item.descuento < 0 or v_item.descuento > 100 or round(v_item.descuento, 2) <> v_item.descuento
      or v_item.promo_id_orce is null or v_item.promo_id_orce !~ '^[0-9]+$'
      or v_item.oferta_id_orce is null or v_item.oferta_id_orce !~ '^[0-9]+$' then
      v_status := 'INVALIDO';
    elsif (select count(distinct lower(s.canal)) from public.segmentos_clientes s
      where s.legacy_segmento_id = v_item.segmento_id and s.activo) <> 1
      or not exists (select 1 from public.segmentos_clientes s where s.legacy_segmento_id = v_item.segmento_id
        and lower(s.canal) = v_item.canal and s.activo) then
      v_status := 'INVALIDO';
    else
      select * into v_current from public.canasto_fidelizacion
        where canal = v_item.canal and sku = v_item.sku and segmento_id = v_item.segmento_id for update;
      if not found then v_status := 'NO_ENCONTRADO';
      elsif v_current.descuento <> v_item.descuento then v_status := 'DESCUENTO_DISTINTO';
      elsif v_item.revision_esperada is null or v_current.revision_orce <> v_item.revision_esperada then v_status := 'CAMBIO_CONCURRENTE';
      elsif v_current.promo_id_orce = v_item.promo_id_orce and v_current.oferta_id_orce = v_item.oferta_id_orce
        and v_current.estado_conciliacion_orce = (case when v_current.descuento = 0 then 'NO_APLICA' else 'CONCILIADO' end) then
        v_status := 'SIN_CAMBIO';
      else
        update public.canasto_fidelizacion set promo_id_orce = v_item.promo_id_orce,
          oferta_id_orce = v_item.oferta_id_orce,
          estado_conciliacion_orce = case when descuento = 0 then 'NO_APLICA' else 'CONCILIADO' end,
          fecha_conciliacion_orce = now(), lote_conciliacion_orce = p_lote where id = v_current.id;
        v_status := 'ACTUALIZADO';
        v_updated := v_updated + 1;
      end if;
    end if;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object('canal', v_item.canal, 'sku', v_item.sku,
      'segmento_id', v_item.segmento_id, 'status', v_status));
  end loop;
  v_result := jsonb_build_object('lote', p_lote, 'updated', v_updated, 'rows', v_rows);
  insert into public.fidelizacion_orce_importaciones(id, archivo, actor, entrada, resultado)
    values (p_lote, p_archivo, auth.uid(), p_filas, v_result);
  return v_result;
end $$;

alter table public.fidelizacion_orce_historial enable row level security;
alter table public.fidelizacion_orce_importaciones enable row level security;
revoke all on public.fidelizacion_orce_historial, public.fidelizacion_orce_importaciones from public, anon, authenticated;
grant select on public.fidelizacion_orce_historial, public.fidelizacion_orce_importaciones to authenticated;
drop policy if exists orce_historial_scope on public.fidelizacion_orce_historial;
create policy orce_historial_scope on public.fidelizacion_orce_historial for select to authenticated
  using (public.current_user_role() = 'OPER' or exists (select 1 from public.canasto_fidelizacion c
    where c.id = canasto_id and public.fidelizacion_owner_allowed(c.comprador)));
drop policy if exists orce_importaciones_scope on public.fidelizacion_orce_importaciones;
create policy orce_importaciones_scope on public.fidelizacion_orce_importaciones for select to authenticated
  using (public.current_user_role() = 'OPER');
revoke all on function public.conciliar_fidelizacion_orce(uuid, text, jsonb) from public, anon;
grant execute on function public.conciliar_fidelizacion_orce(uuid, text, jsonb) to authenticated;
revoke all on function public.prepare_fidelizacion_orce(), public.audit_fidelizacion_orce() from public, anon;

commit;
