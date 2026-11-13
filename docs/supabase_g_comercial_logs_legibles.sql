-- =====================================================================
-- supabase_g_comercial_logs_legibles.sql
-- Auditoría más clara y más liviana para la pestaña Logs.
--
-- Esquema: g_comercial.
-- Requiere: supabase_g_comercial_consolidado.sql (pasos 1–41): tabla logs,
--           insert_audit_log, triggers *_audit_row_change, current_user_role,
--           is_any_role.
-- Repetible: sí. Destructivo: no. No modifica ni borra logs existentes
--           (los logs son append-only); solo cambia cómo se escriben los nuevos.
-- Si se vuelve a ejecutar el consolidado o la parte 1, ejecutar de nuevo este
-- script: reinstalarían la versión anterior del trigger.
--
-- Cambios:
--   1. audit_business_row_change (mismos triggers, misma firma):
--      * UPDATE guarda solo los campos que cambiaron (antes y después) y su
--        lista en `campo`. Antes guardaba la fila completa dos veces y además
--        repetida en `contexto`.
--      * UPDATE que solo toca updated_at/version/updated_by/usuario_edita no
--        genera log (re-guardados sin cambios reales).
--      * INSERT guarda la fila nueva; DELETE la fila eliminada; `contexto` ya no
--        repite old/new y lleva `ref` (SKU, descripción, actividad) para que el
--        log sea legible aunque la fila se borre después.
--      * DELETE de una línea o campaña (o en cascada) ya no apunta a la fila
--        borrada: evita el error de llave foránea logs_*_id_fkey.
--      * Cambio de estado de una solicitud especial o de Fidelización
--        (campanas.estado, tipo ESPECIAL) se registra con accion = 'CAMBIO_ESTADO'.
--   2. RPC consultar_logs (solo ADMIN y AUD): devuelve los logs con el código,
--      nombre y tipo de la actividad, y el SKU/descripción de la línea, sin dar
--      a AUD lectura de campanas, detalle ni comentarios.
-- =====================================================================
begin;

create or replace function g_comercial.audit_business_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_noise text[] := array['updated_at', 'version', 'updated_by', 'usuario_edita', 'fecha_actualizacion'];
  v_ref_keys text[] := array['legacy_row_id', 'legacy_actividad_id', 'nombre_actividad', 'tipo_actividad',
    'sku', 'descripcion', 'oferta_id', 'tipo_promo', 'campo', 'estado', 'estado_registro', 'catalogo_id',
    'numero_pagina', 'titulo_pagina'];
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  v_row jsonb := coalesce(v_new, v_old);
  v_entidad text := upper(tg_table_name);
  v_entidad_id uuid := nullif(v_row ->> 'id', '')::uuid;
  v_registro text := coalesce(nullif(v_row ->> 'legacy_row_id', ''), nullif(v_row ->> 'legacy_actividad_id', ''), nullif(v_row ->> 'avance_id', ''), nullif(v_row ->> 'catalogo_id', ''), nullif(v_row ->> 'campo', ''), v_entidad_id::text, '');
  v_accion text := tg_op;
  v_campo text := '*';
  v_antes jsonb;
  v_despues jsonb;
  v_ref jsonb;
  v_parent record;
  v_campana_id uuid;
  v_promocion_id uuid;
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    select
      coalesce(jsonb_object_agg(k, v_old -> k), '{}'::jsonb),
      coalesce(jsonb_object_agg(k, v_new -> k), '{}'::jsonb),
      string_agg(k, ',' order by k)
    into v_antes, v_despues, v_campo
    from jsonb_object_keys(v_new) as k
    where k <> all(v_noise)
      and (v_old -> k) is distinct from (v_new -> k);

    -- Sin cambios de negocio: no se audita.
    if v_campo is null then
      return new;
    end if;

    if tg_table_name = 'campanas'
       and v_despues ? 'estado'
       and coalesce(v_new ->> 'tipo_actividad', '') = 'ESPECIAL' then
      v_accion := 'CAMBIO_ESTADO';
    end if;
  elsif tg_op = 'INSERT' then
    v_despues := v_new;
  else
    v_antes := v_old;
  end if;

  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  into v_ref
  from jsonb_each(v_row)
  where key = any(v_ref_keys)
    and value <> 'null'::jsonb
    and value <> '""'::jsonb;

  v_campana_id := nullif(v_row ->> 'campana_id', '')::uuid;
  v_promocion_id := nullif(v_row ->> 'promocion_id', '')::uuid;

  if tg_table_name = 'campanas' then
    v_campana_id := v_entidad_id;
  elsif tg_table_name = 'promociones' then
    v_promocion_id := v_entidad_id;
    v_campana_id := nullif(v_row ->> 'campana_id', '')::uuid;
  elsif tg_table_name in ('promociones_detalle', 'comentarios') and v_promocion_id is not null then
    select p.campana_id, p.sku, p.descripcion, p.legacy_row_id
    into v_parent
    from g_comercial.promociones p
    where p.id = v_promocion_id;
    if found then
      v_campana_id := v_parent.campana_id;
      v_ref := v_ref || jsonb_strip_nulls(jsonb_build_object(
        'sku', nullif(v_parent.sku, ''),
        'descripcion', nullif(v_parent.descripcion, ''),
        'legacy_row_id', nullif(v_parent.legacy_row_id, '')
      ));
    end if;
  end if;

  -- En un DELETE (incluido el borrado en cascada) la campaña o la línea ya no
  -- existe: se guarda su id en ref y se deja la referencia vacía para no violar
  -- las llaves foráneas de logs.
  if tg_op = 'DELETE' then
    if v_promocion_id is not null
       and not exists (select 1 from g_comercial.promociones where id = v_promocion_id) then
      v_ref := v_ref || jsonb_build_object('promocion_id', v_promocion_id);
      v_promocion_id := null;
    end if;
    if v_campana_id is not null
       and not exists (select 1 from g_comercial.campanas where id = v_campana_id) then
      v_ref := v_ref || jsonb_build_object('campana_id', v_campana_id);
      v_campana_id := null;
    end if;
  end if;

  perform g_comercial.insert_audit_log(
    p_entidad => v_entidad,
    p_accion => v_accion,
    p_entidad_id => v_entidad_id,
    p_registro => v_registro,
    p_campo => v_campo,
    p_valor_anterior => coalesce(v_antes::text, ''),
    p_valor_nuevo => coalesce(v_despues::text, ''),
    p_campana_id => v_campana_id,
    p_promocion_id => v_promocion_id,
    p_operation_id => coalesce(current_setting('app.operation_id', true), ''),
    p_origen => 'trigger',
    p_contexto => jsonb_build_object(
      'schema', tg_table_schema,
      'table', tg_table_name,
      'operation', tg_op,
      'formato', 2,
      'ref', v_ref
    )
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Consulta paginada de auditoría para ADMIN y AUD.
-- Devuelve { page, page_size, has_next_page, logs: [...] }.
create or replace function g_comercial.consultar_logs(
  p_page integer default 1,
  p_page_size integer default 25,
  p_desde timestamptz default null,
  p_hasta timestamptz default null,
  p_usuario text default null,
  p_actividad text default null,
  p_entidad text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_size integer := least(100, greatest(10, coalesce(p_page_size, 25)));
  v_page integer := greatest(1, coalesce(p_page, 1));
  v_rows jsonb;
  v_count integer;
begin
  if not coalesce(g_comercial.is_any_role(array['ADMIN', 'AUD']), false) then
    raise exception 'Solo Administrador o Auditor puede consultar los logs.' using errcode = '42501';
  end if;

  with base as (
    select l.*, coalesce(l.campana_id, p.campana_id) as actividad_uuid,
           p.legacy_row_id as promo_row_id, p.sku as promo_sku, p.descripcion as promo_descripcion
    from g_comercial.logs l
    left join g_comercial.promociones p on p.id = l.promocion_id
    where (p_desde is null or l.created_at >= p_desde)
      and (p_hasta is null or l.created_at < p_hasta)
      and (nullif(trim(p_usuario), '') is null or l.usuario ilike '%' || trim(p_usuario) || '%')
      and (nullif(trim(p_entidad), '') is null or l.entidad = upper(trim(p_entidad)))
  ),
  page_rows as (
    select b.*, c.legacy_actividad_id, c.nombre_actividad, c.tipo_actividad
    from base b
    left join g_comercial.campanas c on c.id = b.actividad_uuid
    where nullif(trim(p_actividad), '') is null
       or c.legacy_actividad_id ilike '%' || trim(p_actividad) || '%'
       or c.nombre_actividad ilike '%' || trim(p_actividad) || '%'
    order by b.created_at desc, b.id desc
    limit v_size + 1
    offset (v_page - 1) * v_size
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id,
      'created_at', r.created_at,
      'usuario', r.usuario,
      'rol', r.rol,
      'entidad', r.entidad,
      'entidad_id', r.entidad_id,
      'registro', r.registro,
      'accion', r.accion,
      'campo', r.campo,
      'valor_anterior', r.valor_anterior,
      'valor_nuevo', r.valor_nuevo,
      'operation_id', r.operation_id,
      'origen', r.origen,
      -- Los logs anteriores repetían la fila completa en contexto.old/new.
      'contexto', r.contexto - 'old' - 'new',
      'actividad_id', coalesce(r.legacy_actividad_id, ''),
      'actividad_nombre', coalesce(r.nombre_actividad, ''),
      'actividad_tipo', coalesce(r.tipo_actividad, ''),
      'row_id', coalesce(r.promo_row_id, ''),
      'sku', coalesce(r.promo_sku, ''),
      'descripcion', coalesce(r.promo_descripcion, '')
    ) order by r.created_at desc, r.id desc), '[]'::jsonb),
    count(*)
  into v_rows, v_count
  from page_rows r;

  if v_count > v_size then
    v_rows := v_rows - v_size;
  end if;

  return jsonb_build_object(
    'page', v_page,
    'page_size', v_size,
    'has_next_page', v_count > v_size,
    'logs', v_rows
  );
end;
$$;

revoke all on function g_comercial.consultar_logs(integer, integer, timestamptz, timestamptz, text, text, text) from public, anon;
grant execute on function g_comercial.consultar_logs(integer, integer, timestamptz, timestamptz, text, text, text) to authenticated;

commit;

-- Verificación (ejecutar aparte, como ADMIN desde la app o revisando la tabla):
-- select created_at, usuario, accion, entidad, campo, valor_anterior, valor_nuevo, contexto -> 'ref'
--   from g_comercial.logs order by created_at desc limit 20;
