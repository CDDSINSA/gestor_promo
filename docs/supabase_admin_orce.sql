-- Aplicar despues de supabase_admin_fidelizacion.sql y supabase_fidelizacion_orce.sql.
-- Habilita conciliacion ORCE para ADMIN. Repetible; conserva datos y validaciones.
begin;

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
  if coalesce(public.current_user_role(), '') not in ('ADMIN', 'OPER') then
    raise exception 'Solo Ejecutor o Administrador puede conciliar IDs ORCE.' using errcode = '42501';
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


drop policy if exists orce_importaciones_scope on public.fidelizacion_orce_importaciones;
create policy orce_importaciones_scope on public.fidelizacion_orce_importaciones for select to authenticated
  using (public.current_user_role() in ('ADMIN', 'OPER'));

revoke all on function public.conciliar_fidelizacion_orce(uuid, text, jsonb) from public, anon;
grant execute on function public.conciliar_fidelizacion_orce(uuid, text, jsonb) to authenticated;
commit;
