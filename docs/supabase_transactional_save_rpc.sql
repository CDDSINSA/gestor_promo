-- Guardado transaccional para el Sistema de Gestion de Promociones Retail.
-- Ejecutar en Supabase SQL Editor despues de:
-- 1. docs/supabase_schema.sql
-- 2. docs/supabase_delta_operativo_2026_06_22.sql
-- 3. docs/supabase_roles_permissions_mvp.sql
-- 4. docs/supabase_promociones_optimistic_concurrency.sql (si la base ya existia)
--
-- La app llama esta funcion por RPC. PostgreSQL ejecuta la funcion completa
-- dentro de una sola transaccion: si una sentencia falla, no queda guardado parcial.

create table if not exists public.save_operations (
  operation_id text not null,
  auth_user_id uuid not null,
  operation_type text not null default '',
  payload_hash text not null default '',
  status text not null default 'PROCESSING',
  response jsonb,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 minutes')
);

alter table public.save_operations add column if not exists auth_user_id uuid;
alter table public.save_operations add column if not exists operation_type text not null default '';
alter table public.save_operations add column if not exists payload_hash text not null default '';
alter table public.save_operations add column if not exists status text not null default 'PROCESSING';
alter table public.save_operations add column if not exists response jsonb;
alter table public.save_operations add column if not exists created_at timestamptz not null default now();
alter table public.save_operations add column if not exists finished_at timestamptz;
alter table public.save_operations add column if not exists expires_at timestamptz;

update public.save_operations
set auth_user_id = '00000000-0000-0000-0000-000000000000'::uuid
where auth_user_id is null;

update public.save_operations
set status = 'SUCCEEDED'
where response is not null
  and (status is null or status = '' or status = 'PROCESSING');

update public.save_operations
set status = 'PROCESSING'
where status is null or status = '';

update public.save_operations
set status = 'FAILED'
where status not in ('PROCESSING', 'SUCCEEDED', 'FAILED');

update public.save_operations
set expires_at = coalesce(finished_at, created_at, now()) + interval '7 days'
where expires_at is null;

alter table public.save_operations alter column auth_user_id set not null;
alter table public.save_operations alter column expires_at set not null;
alter table public.save_operations alter column expires_at set default (now() + interval '30 minutes');

do $$
begin
  alter table public.save_operations drop constraint if exists save_operations_pkey;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.save_operations'::regclass
      and conname = 'save_operations_status_check'
  ) then
    alter table public.save_operations
      add constraint save_operations_status_check
      check (status in ('PROCESSING', 'SUCCEEDED', 'FAILED'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.save_operations'::regclass
      and conname = 'save_operations_pkey'
  ) then
    alter table public.save_operations
      add constraint save_operations_pkey primary key (auth_user_id, operation_id);
  end if;
end $$;

create index if not exists idx_save_operations_operation_id
  on public.save_operations(operation_id);

create index if not exists idx_save_operations_expires_at
  on public.save_operations(expires_at);

alter table public.promociones
  add column if not exists usuario_crea text not null default '',
  add column if not exists usuario_edita text not null default '';

alter table public.save_operations enable row level security;
revoke all on table public.save_operations from anon;
revoke all on table public.save_operations from authenticated;

create or replace function public.cleanup_save_operations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cleaned integer := 0;
  v_count integer := 0;
begin
  update public.save_operations
  set status = 'FAILED',
      finished_at = coalesce(finished_at, now()),
      expires_at = now() + interval '7 days'
  where status = 'PROCESSING'
    and expires_at < now();

  get diagnostics v_count = row_count;
  v_cleaned := v_cleaned + v_count;

  delete from public.save_operations
  where status in ('SUCCEEDED', 'FAILED')
    and expires_at < now();

  get diagnostics v_count = row_count;
  v_cleaned := v_cleaned + v_count;

  return v_cleaned;
end;
$$;

revoke execute on function public.cleanup_save_operations() from public;
revoke execute on function public.cleanup_save_operations() from anon;
revoke execute on function public.cleanup_save_operations() from authenticated;

create or replace function public.save_catalog_transactional(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_role text := public.current_user_role();
  v_current_user_id uuid := public.current_app_user_id();
  v_current_buyer_id uuid := public.current_buyer_id();
  v_current_buyer_scope_ids uuid[] := public.current_buyer_scope_ids();
  v_is_admin boolean := v_role = 'ADMIN';
  v_is_buyer boolean := v_role = 'BUYER';
  v_can_write_operational boolean := v_role in ('ADMIN', 'BUYER');
  v_can_write_comments boolean := v_role in ('ADMIN', 'BUYER', 'MARK');

  v_promo_sync jsonb := coalesce(p_payload #> '{sync_options,promociones}', p_payload #> '{sync_options,promotions}');
  v_buyer_sync jsonb := coalesce(p_payload #> '{sync_options,compradores}', p_payload #> '{sync_options,buyers}');
  v_activity_sync jsonb := coalesce(p_payload #> '{sync_options,actividades}', p_payload #> '{sync_options,activities}');
  v_comment_sync jsonb := coalesce(p_payload #> '{sync_options,comentarios}', p_payload #> '{sync_options,comments}');
  v_avance_sync jsonb := coalesce(p_payload #> '{sync_options,avances_catalogo}', p_payload #> '{sync_options,avancesCatalogo}');
  v_responsable_sync jsonb := coalesce(p_payload #> '{sync_options,responsables_solicitudes}', p_payload #> '{sync_options,responsablesSolicitudes}');
  v_jerarquia_sync jsonb := coalesce(p_payload #> '{sync_options,jerarquia_categorias}', p_payload #> '{sync_options,jerarquiaCategorias}');
  v_segmento_sync jsonb := coalesce(p_payload #> '{sync_options,segmentos_clientes}', p_payload #> '{sync_options,segmentosClientes}');
  v_notificacion_sync jsonb := coalesce(p_payload #> '{sync_options,notificaciones}', p_payload #> '{sync_options,notifications}');
  v_operation_id text := nullif(coalesce(p_payload ->> 'operation_id', p_payload ->> 'operationId', p_payload ->> 'client_operation_id'), '');
  v_operation_type text := coalesce(p_payload ->> 'operation_type', p_payload ->> 'operationType', '');
  v_payload_hash text := md5(p_payload::text);
  v_existing_operation_type text;
  v_existing_payload_hash text;
  v_existing_operation_status text;
  v_operation_response jsonb;
  v_expected_promo_versions jsonb := coalesce(v_promo_sync -> 'expected_versions', v_promo_sync -> 'expectedVersions', '{}'::jsonb);

  v_changed_promos text[] := array(select jsonb_array_elements_text(coalesce(v_promo_sync -> 'changed_row_ids', v_promo_sync -> 'changedRowIds', '[]'::jsonb)));
  v_deleted_promos text[] := array(select jsonb_array_elements_text(coalesce(v_promo_sync -> 'deleted_row_ids', v_promo_sync -> 'deletedRowIds', '[]'::jsonb)));
  v_changed_buyers text[] := array(select jsonb_array_elements_text(coalesce(v_buyer_sync -> 'changed_ids', v_buyer_sync -> 'changedIds', '[]'::jsonb)));
  v_changed_activities text[] := array(select jsonb_array_elements_text(coalesce(v_activity_sync -> 'changed_ids', v_activity_sync -> 'changedIds', '[]'::jsonb)));
  v_changed_comments text[] := array(select jsonb_array_elements_text(coalesce(v_comment_sync -> 'changed_ids', v_comment_sync -> 'changedIds', '[]'::jsonb)));
  v_changed_avances text[] := array(select jsonb_array_elements_text(coalesce(v_avance_sync -> 'changed_ids', v_avance_sync -> 'changedIds', '[]'::jsonb)));
  v_changed_responsables text[] := array(select jsonb_array_elements_text(coalesce(v_responsable_sync -> 'changed_ids', v_responsable_sync -> 'changedIds', '[]'::jsonb)));
  v_changed_jerarquia text[] := array(select jsonb_array_elements_text(coalesce(v_jerarquia_sync -> 'changed_ids', v_jerarquia_sync -> 'changedIds', '[]'::jsonb)));
  v_changed_segmentos text[] := array(select jsonb_array_elements_text(coalesce(v_segmento_sync -> 'changed_ids', v_segmento_sync -> 'changedIds', '[]'::jsonb)));
  v_changed_notificaciones text[] := array(select jsonb_array_elements_text(coalesce(v_notificacion_sync -> 'changed_ids', v_notificacion_sync -> 'changedIds', '[]'::jsonb)));

  v_row jsonb;
  v_catalogo jsonb;
  v_id text;
  v_buyer_legacy_id text;
  v_buyer_id uuid;
  v_campana_id uuid;
  v_promo_id uuid;
  v_comentario_id uuid;
  v_alcance text;
  v_actor_name text := '';
  v_current_buyer_name text := '';
  v_current_buyer_legacy_id text := '';
  v_current_buyer_division text := '';
  v_existing_buyer_id uuid;
  v_existing_campana_id uuid;
  v_existing_actividad_id text;
  v_existing_tipo_promo text;
  v_existing_oferta_id text;
  v_existing_estado text;
  v_existing_version bigint;
  v_expected_version bigint;
  v_current_promo_row jsonb;
  v_existing_comment_promocion_id uuid;
  v_existing_comment_campana_id uuid;
  v_existing_comment_usuario_id uuid;
  v_existing_comment_usuario text;
  v_existing_comment_comentario text;
  v_existing_comment_created_at timestamptz;
  v_existing_solicitante_buyer_id uuid;
  v_target_buyer_id uuid;
  v_target_campana_id uuid;
  v_target_actividad_id text;
  v_target_solicitante_buyer_id uuid;
  v_activity_type text;
  v_requires_solicitante boolean;
  v_solicitante_text text;
  v_touched_offer_context_keys text[] := array[]::text[];
  v_invalid_offer record;
  v_count_promos integer := 0;
  v_count_comments integer := 0;
  v_count_avances integer := 0;
  v_count_logs integer := 0;
  v_saved_promotions jsonb := '[]'::jsonb;
begin
  if v_role is null then
    raise exception 'No hay usuario activo autorizado para guardar en Supabase.';
  end if;

  if v_auth_user_id is null then
    raise exception 'No hay usuario autenticado para aislar la operacion de guardado.'
      using errcode = '42501';
  end if;

  if not (v_can_write_operational or v_can_write_comments) then
    raise exception 'Su rol no tiene permisos para guardar cambios en Supabase.';
  end if;

  if jsonb_array_length(coalesce(p_payload -> 'logs', '[]'::jsonb)) > 0 then
    raise exception 'Los logs de auditoria no se aceptan desde el cliente; se generan internamente por triggers.'
      using errcode = '42501';
  end if;

  perform set_config('app.operation_id', coalesce(v_operation_id, ''), true);

  if v_is_buyer and v_current_buyer_id is null then
    raise exception 'El usuario comprador no tiene comprador asociado.'
      using errcode = '42501';
  end if;

  select coalesce(nullif(nombre, ''), nullif(email, ''), '')
  into v_actor_name
  from public.usuarios_app
  where auth_user_id = auth.uid()
    and activo = true
  limit 1;

  if v_current_buyer_id is not null then
    select coalesce(comprador, ''), coalesce(comprador_id, ''), coalesce(division, '')
    into v_current_buyer_name, v_current_buyer_legacy_id, v_current_buyer_division
    from public.compradores
    where id = v_current_buyer_id
    limit 1;
  end if;

  if v_operation_id is not null then
    perform public.cleanup_save_operations();

    insert into public.save_operations (auth_user_id, operation_id, operation_type, payload_hash, status, expires_at)
    values (
      v_auth_user_id,
      v_operation_id,
      v_operation_type,
      v_payload_hash,
      'PROCESSING',
      now() + interval '30 minutes'
    )
    on conflict (auth_user_id, operation_id) do nothing;

    if not found then
      select operation_type, payload_hash, status, response
      into v_existing_operation_type, v_existing_payload_hash, v_existing_operation_status, v_operation_response
      from public.save_operations
      where auth_user_id = v_auth_user_id
        and operation_id = v_operation_id
      limit 1;

      if v_existing_payload_hash is distinct from v_payload_hash then
        raise exception 'La operacion de guardado % ya existe para este usuario con un contenido diferente.', v_operation_id
          using errcode = '23505';
      end if;

      if v_existing_operation_type is distinct from v_operation_type then
        raise exception 'La operacion de guardado % ya existe para este usuario con un tipo diferente.', v_operation_id
          using errcode = '23505';
      end if;

      if v_existing_operation_status = 'SUCCEEDED' and v_operation_response is not null then
        return v_operation_response || jsonb_build_object('idempotent_replay', true);
      end if;

      if v_existing_operation_status = 'FAILED' then
        raise exception 'La operacion de guardado % fallo previamente. Genere un nuevo identificador para reintentar.', v_operation_id;
      end if;

      raise exception 'La operacion de guardado % ya esta en proceso. Espere a que finalice antes de intentar nuevamente.', v_operation_id;
    end if;
  end if;

  -- Compradores: solo ADMIN.
  if v_is_admin then
    for v_row in select value from jsonb_array_elements(coalesce(p_payload -> 'compradores', '[]'::jsonb)) loop
      v_id := coalesce(nullif(v_row ->> 'comprador', ''), nullif(v_row ->> 'nombre', ''));
      v_buyer_legacy_id := nullif(v_row ->> 'comprador_id', '');
      if v_id <> '' and (v_buyer_sync is null or v_id = any(v_changed_buyers) or coalesce(v_buyer_legacy_id, '') = any(v_changed_buyers)) then
        if v_buyer_legacy_id is not null then
          insert into public.compradores (comprador_id, categoria_comprador, comprador, division, correo, senior_id, activo)
          values (
            v_buyer_legacy_id,
            coalesce(nullif(v_row ->> 'categoria_comprador', ''), 'Senior'),
            v_id,
            coalesce(v_row ->> 'division', ''),
            coalesce(v_row ->> 'correo', ''),
            coalesce(v_row ->> 'senior_id', ''),
            coalesce(nullif(v_row ->> 'activo', '')::boolean, true)
          )
          on conflict (comprador_id) where comprador_id is not null and comprador_id <> '' do update set
            categoria_comprador = excluded.categoria_comprador,
            comprador = excluded.comprador,
            division = excluded.division,
            correo = excluded.correo,
            senior_id = excluded.senior_id,
            activo = excluded.activo,
            updated_at = now();
        else
          insert into public.compradores (comprador_id, categoria_comprador, comprador, division, correo, senior_id, activo)
          values (
            null,
            coalesce(nullif(v_row ->> 'categoria_comprador', ''), 'Senior'),
            v_id,
            coalesce(v_row ->> 'division', ''),
            coalesce(v_row ->> 'correo', ''),
            coalesce(v_row ->> 'senior_id', ''),
            coalesce(nullif(v_row ->> 'activo', '')::boolean, true)
          )
          on conflict (comprador) do update set
            categoria_comprador = excluded.categoria_comprador,
            division = excluded.division,
            correo = excluded.correo,
            senior_id = excluded.senior_id,
            activo = excluded.activo,
            updated_at = now();
        end if;
      end if;
    end loop;
  end if;

  -- Campanas / actividades.
  if v_can_write_operational then
    for v_row in select value from jsonb_array_elements(coalesce(p_payload -> 'actividades', '[]'::jsonb)) loop
      v_id := coalesce(nullif(v_row ->> 'actividad_id', ''), nullif(v_row ->> 'catalogo_id', ''));
      v_activity_type := upper(coalesce(nullif(v_row ->> 'tipo_actividad', ''), 'CATALOGO'));
      v_requires_solicitante := v_is_buyer or v_activity_type <> 'CATALOGO';
      if v_id = '' or (v_activity_sync is not null and not v_id = any(v_changed_activities)) then
        continue;
      end if;

      select c.id, c.solicitante_buyer_id
      into v_campana_id, v_existing_solicitante_buyer_id
      from public.campanas c
      where c.legacy_actividad_id = v_id
      for update;

      if v_is_buyer and v_campana_id is not null and not coalesce(v_existing_solicitante_buyer_id = any(v_current_buyer_scope_ids), false) then
        raise exception 'No autorizado para modificar la actividad %.', v_id
          using errcode = '42501';
      end if;

      v_solicitante_text := coalesce(nullif(v_row ->> 'solicitante', ''), nullif(v_row ->> 'comprador', ''));

      -- Resolver solicitante_buyer_id
      v_buyer_id := null;

      -- 1. Si viene solicitante_buyer_id o buyer_id en el payload (UUID o ID numérico)
      if coalesce(v_row ->> 'solicitante_buyer_id', v_row ->> 'buyer_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        select c.id into v_buyer_id
        from public.compradores c
        where c.id = (coalesce(v_row ->> 'solicitante_buyer_id', v_row ->> 'buyer_id'))::uuid
        limit 1;
      elsif coalesce(v_row ->> 'solicitante_buyer_id', v_row ->> 'buyer_id', '') <> '' then
        select c.id into v_buyer_id
        from public.compradores c
        where c.comprador_id = coalesce(v_row ->> 'solicitante_buyer_id', v_row ->> 'buyer_id')
        limit 1;
      end if;

      -- 2. Si ya existía en public.campanas, heredar el comprador previo si aún no se tiene
      if v_buyer_id is null and v_campana_id is not null then
        v_buyer_id := v_existing_solicitante_buyer_id;
      end if;

      -- 3. Búsqueda por texto (nombre de comprador o correo)
      if v_buyer_id is null and v_solicitante_text is not null then
        -- 3a. Coincidencia exacta
        select c.id into v_buyer_id
        from public.compradores c
        where c.comprador = v_solicitante_text
        limit 1;

        -- 3b. Coincidencia sin distinción de mayúsculas / espacios
        if v_buyer_id is null then
          select c.id into v_buyer_id
          from public.compradores c
          where lower(trim(c.comprador)) = lower(trim(v_solicitante_text))
             or lower(trim(c.correo)) = lower(trim(v_solicitante_text))
          limit 1;
        end if;

        -- 3c. Coincidencia ortográfica/fonética común (s/z, tildes)
        if v_buyer_id is null then
          select c.id into v_buyer_id
          from public.compradores c
          where replace(translate(lower(trim(c.comprador)), 'áéíóúàèìòùz', 'aeiouaeious'), ' ', '') =
                replace(translate(lower(trim(v_solicitante_text)), 'áéíóúàèìòùz', 'aeiouaeious'), ' ', '')
          limit 1;
        end if;

        -- 3d. Coincidencia por correo que contenga el nombre/apellido
        if v_buyer_id is null and length(v_solicitante_text) > 3 then
          select c.id into v_buyer_id
          from public.compradores c
          where c.correo ilike '%' || split_part(lower(trim(v_solicitante_text)), ' ', 1) || '%'
            and (split_part(lower(trim(v_solicitante_text)), ' ', 2) = '' or c.correo ilike '%' || split_part(lower(trim(v_solicitante_text)), ' ', 2) || '%')
          limit 1;
        end if;
      end if;

      if v_is_buyer then
        if v_buyer_id is not null and not (v_buyer_id = any(v_current_buyer_scope_ids)) then
          raise exception 'No autorizado para crear o modificar la actividad % con el comprador indicado.', v_id
            using errcode = '42501';
        end if;
        v_buyer_id := coalesce(v_buyer_id, v_current_buyer_id);
      end if;

      -- Asegurar fallback al comprador existente si aún no se resuelve
      v_buyer_id := coalesce(v_buyer_id, v_existing_solicitante_buyer_id);

      -- Solo bloquear si es NUEVA actividad y no se logró determinar ningún comprador válido
      if v_buyer_id is null and v_requires_solicitante and v_campana_id is null then
        raise exception 'Actividad % sin comprador solicitante valido (%).', v_id, coalesce(v_row ->> 'solicitante', v_row ->> 'comprador', '');
      end if;

      select value into v_catalogo
      from jsonb_array_elements(coalesce(p_payload -> 'catalogos', '[]'::jsonb))
      where coalesce(value ->> 'catalogo_id', value ->> 'id') = v_id
      limit 1;

      insert into public.campanas as c (
        legacy_actividad_id, tipo_actividad, nombre_actividad, canal, fecha_inicio, fecha_fin,
        solicitante_buyer_id, estado, motivo_solicitud, color, doc_id, token_conexion,
        notificaciones, notificaciones_envivo, correos, comprador, responsable, recursos_ocupados, fecha_estado,
        fecha_nuevo, fecha_aprovado, fecha_entrabajo, fecha_finalizado, fecha_asignado,
        fecha_trabajando, fecha_resuelto, tiempo_nuevo_horas, tiempo_aprovado_horas,
        tiempo_entrabajo_horas, tiempo_finalizado_horas, tiempo_asignado_horas,
        tiempo_trabajando_horas, tiempo_resuelto_horas, tiempo_total_horas, promo_ids,
        oferta_ids, divisiones
      )
      values (
        v_id,
        v_activity_type,
        coalesce(nullif(v_row ->> 'nombre_actividad', ''), nullif(v_row ->> 'nombre', ''), ''),
        coalesce(nullif(v_row ->> 'canal', ''), v_catalogo ->> 'canal', ''),
        nullif(coalesce(v_row ->> 'fecha_inicio', v_catalogo ->> 'vigencia_inicio'), '')::date,
        nullif(coalesce(v_row ->> 'fecha_fin', v_catalogo ->> 'vigencia_fin'), '')::date,
        v_buyer_id,
        coalesce(nullif(v_row ->> 'estado', ''), 'Borrador'),
        coalesce(v_row ->> 'motivo_solicitud', ''),
        coalesce(nullif(v_catalogo ->> 'color', ''), 'bg-emerald-700'),
        coalesce(v_catalogo ->> 'doc_id', ''),
        coalesce(v_catalogo ->> 'token_conexion', ''),
        coalesce(nullif(v_catalogo ->> 'notificaciones', '')::boolean, false),
        coalesce(nullif(v_catalogo ->> 'notificaciones_envivo', '')::boolean, true),
        coalesce(v_catalogo ->> 'correos', ''),
        case
          when v_is_buyer then coalesce(nullif(v_row ->> 'comprador', ''), nullif(v_row ->> 'solicitante', ''), v_current_buyer_name)
          else coalesce(nullif(v_row ->> 'comprador', ''), nullif(v_row ->> 'solicitante', ''), '')
        end,
        coalesce(v_row ->> 'responsable', ''),
        coalesce(v_row ->> 'recursos_ocupados', ''),
        nullif(v_row ->> 'fecha_estado', '')::timestamptz,
        nullif(v_row ->> 'fecha_nuevo', '')::timestamptz,
        nullif(v_row ->> 'fecha_aprovado', '')::timestamptz,
        nullif(v_row ->> 'fecha_entrabajo', '')::timestamptz,
        nullif(v_row ->> 'fecha_finalizado', '')::timestamptz,
        nullif(v_row ->> 'fecha_asignado', '')::timestamptz,
        nullif(v_row ->> 'fecha_trabajando', '')::timestamptz,
        nullif(v_row ->> 'fecha_resuelto', '')::timestamptz,
        coalesce(nullif(v_row ->> 'tiempo_nuevo_horas', '')::numeric, 0),
        coalesce(nullif(v_row ->> 'tiempo_aprovado_horas', '')::numeric, 0),
        coalesce(nullif(v_row ->> 'tiempo_entrabajo_horas', '')::numeric, 0),
        coalesce(nullif(v_row ->> 'tiempo_finalizado_horas', '')::numeric, 0),
        coalesce(nullif(v_row ->> 'tiempo_asignado_horas', '')::numeric, 0),
        coalesce(nullif(v_row ->> 'tiempo_trabajando_horas', '')::numeric, 0),
        coalesce(nullif(v_row ->> 'tiempo_resuelto_horas', '')::numeric, 0),
        coalesce(nullif(v_row ->> 'tiempo_total_horas', '')::numeric, 0),
        coalesce(v_row ->> 'promo_ids', ''),
        coalesce(v_row ->> 'oferta_ids', ''),
        coalesce(v_catalogo ->> 'divisiones', '')
      )
      on conflict (legacy_actividad_id) do update set
        tipo_actividad = excluded.tipo_actividad,
        nombre_actividad = excluded.nombre_actividad,
        canal = excluded.canal,
        fecha_inicio = excluded.fecha_inicio,
        fecha_fin = excluded.fecha_fin,
        solicitante_buyer_id = case
          when v_is_admin and excluded.tipo_actividad = 'CATALOGO' and excluded.solicitante_buyer_id is null then c.solicitante_buyer_id
          when v_is_admin and excluded.solicitante_buyer_id is not null then excluded.solicitante_buyer_id
          else coalesce(c.solicitante_buyer_id, excluded.solicitante_buyer_id)
        end,
        estado = excluded.estado,
        motivo_solicitud = excluded.motivo_solicitud,
        color = excluded.color,
        doc_id = excluded.doc_id,
        token_conexion = excluded.token_conexion,
        notificaciones = excluded.notificaciones,
        notificaciones_envivo = excluded.notificaciones_envivo,
        correos = excluded.correos,
        comprador = excluded.comprador,
        responsable = excluded.responsable,
        recursos_ocupados = excluded.recursos_ocupados,
        fecha_estado = excluded.fecha_estado,
        fecha_nuevo = excluded.fecha_nuevo,
        fecha_aprovado = excluded.fecha_aprovado,
        fecha_entrabajo = excluded.fecha_entrabajo,
        fecha_finalizado = excluded.fecha_finalizado,
        fecha_asignado = excluded.fecha_asignado,
        fecha_trabajando = excluded.fecha_trabajando,
        fecha_resuelto = excluded.fecha_resuelto,
        tiempo_nuevo_horas = excluded.tiempo_nuevo_horas,
        tiempo_aprovado_horas = excluded.tiempo_aprovado_horas,
        tiempo_entrabajo_horas = excluded.tiempo_entrabajo_horas,
        tiempo_finalizado_horas = excluded.tiempo_finalizado_horas,
        tiempo_asignado_horas = excluded.tiempo_asignado_horas,
        tiempo_trabajando_horas = excluded.tiempo_trabajando_horas,
        tiempo_resuelto_horas = excluded.tiempo_resuelto_horas,
        tiempo_total_horas = excluded.tiempo_total_horas,
        promo_ids = excluded.promo_ids,
        oferta_ids = excluded.oferta_ids,
        divisiones = excluded.divisiones,
        updated_at = now();
    end loop;
  end if;

  -- Catalogos auxiliares de administracion.
  if v_is_admin then
    for v_row in select value from jsonb_array_elements(coalesce(p_payload -> 'responsables_solicitudes', '[]'::jsonb)) loop
      v_id := coalesce(nullif(v_row ->> 'responsable_id', ''), nullif(v_row ->> 'id', ''));
      if v_id <> '' and (v_responsable_sync is null or v_id = any(v_changed_responsables)) then
        insert into public.responsables_solicitudes (responsable_id, nombre, area, correo, activo)
        values (v_id, coalesce(v_row ->> 'nombre', ''), coalesce(v_row ->> 'area', ''), coalesce(v_row ->> 'correo', ''), coalesce(nullif(v_row ->> 'activo', '')::boolean, true))
        on conflict (responsable_id) do update set nombre = excluded.nombre, area = excluded.area, correo = excluded.correo, activo = excluded.activo, updated_at = now();
      end if;
    end loop;

    for v_row in select value from jsonb_array_elements(coalesce(p_payload -> 'jerarquia_categorias', '[]'::jsonb)) loop
      v_id := coalesce(nullif(v_row ->> 'dep_id', ''), nullif(v_row ->> 'depId', ''));
      if v_id <> '' and (v_jerarquia_sync is null or v_id = any(v_changed_jerarquia)) then
        insert into public.jerarquia_categorias (dep_id, dep_desc, division, activo)
        values (v_id, coalesce(v_row ->> 'dep_desc', ''), coalesce(v_row ->> 'division', ''), coalesce(nullif(v_row ->> 'activo', '')::boolean, true))
        on conflict (dep_id) do update set dep_desc = excluded.dep_desc, division = excluded.division, activo = excluded.activo, updated_at = now();
      end if;
    end loop;

    for v_row in select value from jsonb_array_elements(coalesce(p_payload -> 'segmentos_clientes', '[]'::jsonb)) loop
      v_id := coalesce(nullif(v_row ->> 'segmento_id', ''), nullif(v_row ->> 'id', ''));
      if v_id <> '' and (v_segmento_sync is null or v_id = any(v_changed_segmentos)) then
        insert into public.segmentos_clientes (legacy_segmento_id, canal, nombre_segmento, activo, orden)
        values (v_id, coalesce(v_row ->> 'canal', ''), coalesce(v_row ->> 'nombre_segmento', v_row ->> 'segmento', ''), coalesce(nullif(v_row ->> 'activo', '')::boolean, true), nullif(v_row ->> 'orden', '')::integer)
        on conflict (legacy_segmento_id) do update set canal = excluded.canal, nombre_segmento = excluded.nombre_segmento, activo = excluded.activo, orden = excluded.orden, updated_at = now();
      end if;
    end loop;
  end if;

  -- Eliminaciones de promociones dentro de la misma transaccion.
  if v_can_write_operational and array_length(v_deleted_promos, 1) is not null then
    for v_id in select unnest(v_deleted_promos) loop
      select p.id, p.buyer_id, p.estado_registro, c.legacy_actividad_id, p.tipo_promo, p.oferta_id, p.version
      into v_promo_id, v_existing_buyer_id, v_existing_estado, v_existing_actividad_id, v_existing_tipo_promo, v_existing_oferta_id, v_existing_version
      from public.promociones p
      left join public.campanas c on c.id = p.campana_id
      where p.legacy_row_id = v_id
      for update of p;

      if v_promo_id is null then
        raise exception 'No existe la promocion % solicitada para eliminar.', v_id;
      end if;

      if v_is_buyer and not coalesce(v_existing_buyer_id = any(v_current_buyer_scope_ids), false) then
        raise exception 'No autorizado para eliminar la promocion %.', v_id
          using errcode = '42501';
      end if;

      if v_is_buyer and v_existing_estado <> 'BORRADOR' then
        raise exception 'No autorizado para eliminar la promocion % en estado %.', v_id, v_existing_estado
          using errcode = '42501';
      end if;

      v_expected_version := nullif(v_expected_promo_versions ->> v_id, '')::bigint;
      if v_expected_version is null or v_expected_version <> v_existing_version then
        raise exception 'PROMOTION_VERSION_CONFLICT'
          using
            errcode = 'P0001',
            detail = jsonb_build_object(
              'type', 'PROMOTION_VERSION_CONFLICT',
              'action', 'delete',
              'conflicts', jsonb_build_array(jsonb_build_object(
                'row_id', v_id,
                'expected_version', v_expected_version,
                'current_version', v_existing_version,
                'fields', '[]'::jsonb,
                'current_row', null
              ))
            )::text;
      end if;

      if coalesce(v_existing_tipo_promo, '') in ('Combo', 'Compra X lleva X', 'Megapack')
        and coalesce(v_existing_actividad_id, '') <> ''
        and coalesce(v_existing_oferta_id, '') <> '' then
        v_touched_offer_context_keys := array_append(
          v_touched_offer_context_keys,
          concat_ws('::', v_existing_actividad_id, v_existing_tipo_promo, v_existing_oferta_id)
        );
      end if;
    end loop;

    delete from public.comentarios c
    using public.promociones p
    where c.promocion_id = p.id
      and p.legacy_row_id = any(v_deleted_promos)
      and (v_is_admin or p.buyer_id = any(v_current_buyer_scope_ids));

    delete from public.promociones_detalle d
    using public.promociones p
    where d.promocion_id = p.id
      and p.legacy_row_id = any(v_deleted_promos)
      and (v_is_admin or p.buyer_id = any(v_current_buyer_scope_ids));

    delete from public.promociones p
    where p.legacy_row_id = any(v_deleted_promos)
      and (v_is_admin or p.buyer_id = any(v_current_buyer_scope_ids));
  end if;

  -- Promociones principales.
  if v_can_write_operational then
    for v_row in select value from jsonb_array_elements(coalesce(p_payload -> 'promociones', '[]'::jsonb)) loop
      v_id := coalesce(nullif(v_row ->> 'row_id', ''), nullif(v_row ->> 'id', ''));
      if v_id = '' or (v_promo_sync is not null and not v_id = any(v_changed_promos)) then
        continue;
      end if;

      select
        p.id,
        p.buyer_id,
        p.campana_id,
        p.estado_registro,
        c.legacy_actividad_id,
        p.tipo_promo,
        p.oferta_id,
        p.version,
        jsonb_build_object(
          'row_id', p.legacy_row_id,
          'actividad_id', c.legacy_actividad_id,
          'oferta_id', p.oferta_id,
          'comprador', b.comprador,
          'division', b.division,
          'tipo_promo', p.tipo_promo,
          'grupo_oferta', p.grupo_oferta,
          'tipo_sku', p.tipo_sku,
          'variante', p.variante,
          'dep_id', p.dep_id,
          'sku', p.sku,
          'num_parte', p.num_parte,
          'descripcion', p.descripcion,
          'tipo_cantidad', p.tipo_cantidad,
          'cantidad_minima', p.cantidad_minima,
          'precio_antes', p.precio_antes,
          'precio_ahora', p.precio_ahora,
          'descuento', p.descuento,
          'comentario_comprador', p.comentario_comprador,
          'aplica_segmento', p.aplica_segmento,
          'segmento_cliente', p.segmento_cliente,
          'alcance_tipo', p.alcance_tipo,
          'alcance_valor', p.alcance_valor,
          'estado_registro', p.estado_registro,
          'fecha_creacion', p.created_at,
          'fecha_modificacion', p.updated_at,
          'usuario_crea', p.usuario_crea,
          'usuario_edita', p.usuario_edita,
          'ultima_modificacion_por', p.ultima_modificacion_por,
          'version', p.version
        )
      into v_promo_id, v_existing_buyer_id, v_existing_campana_id, v_existing_estado, v_existing_actividad_id, v_existing_tipo_promo, v_existing_oferta_id, v_existing_version, v_current_promo_row
      from public.promociones p
      left join public.campanas c on c.id = p.campana_id
      left join public.compradores b on b.id = p.buyer_id
      where p.legacy_row_id = v_id
      for update of p;

      select c.id, c.solicitante_buyer_id, c.tipo_actividad
      into v_target_campana_id, v_target_solicitante_buyer_id, v_activity_type
      from public.campanas c
      where c.legacy_actividad_id = v_row ->> 'actividad_id'
      for update;

      v_target_actividad_id := coalesce(nullif(v_row ->> 'actividad_id', ''), nullif(v_row ->> 'actividadId', ''));

      if coalesce(v_existing_tipo_promo, '') in ('Combo', 'Compra X lleva X', 'Megapack')
        and coalesce(v_existing_actividad_id, '') <> ''
        and coalesce(v_existing_oferta_id, '') <> '' then
        v_touched_offer_context_keys := array_append(
          v_touched_offer_context_keys,
          concat_ws('::', v_existing_actividad_id, v_existing_tipo_promo, v_existing_oferta_id)
        );
      end if;

      if coalesce(v_row ->> 'tipo_promo', '') in ('Combo', 'Compra X lleva X', 'Megapack')
        and coalesce(v_target_actividad_id, '') <> ''
        and coalesce(v_row ->> 'oferta_id', '') <> '' then
        v_touched_offer_context_keys := array_append(
          v_touched_offer_context_keys,
          concat_ws('::', v_target_actividad_id, v_row ->> 'tipo_promo', v_row ->> 'oferta_id')
        );
      end if;

      if v_promo_id is not null and v_is_buyer and not coalesce(v_existing_buyer_id = any(v_current_buyer_scope_ids), false) then
        raise exception 'No autorizado para modificar la promocion %.', v_id
          using errcode = '42501';
      end if;

      if v_is_buyer and v_promo_id is not null and v_target_campana_id is not null and v_target_campana_id is distinct from v_existing_campana_id then
        raise exception 'No autorizado para cambiar la campana de la promocion %.', v_id
          using errcode = '42501';
      end if;

      if v_is_buyer
        and v_promo_id is null
        and v_target_campana_id is not null
        and coalesce(v_activity_type, '') <> 'CATALOGO'
        and not coalesce(v_target_solicitante_buyer_id = any(v_current_buyer_scope_ids), false) then
        raise exception 'No autorizado para crear la promocion % en la campana indicada.', v_id
          using errcode = '42501';
      end if;

      -- Resolver buyer_id de la promocion por ID primero
      v_buyer_id := null;
      if coalesce(v_row ->> 'buyer_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        select id into v_buyer_id from public.compradores where id = (v_row ->> 'buyer_id')::uuid limit 1;
      end if;
      v_buyer_id := coalesce(v_buyer_id, v_existing_buyer_id);

      if v_buyer_id is null and nullif(v_row ->> 'comprador_id', '') is not null then
        select id into v_buyer_id from public.compradores where comprador_id = v_row ->> 'comprador_id' limit 1;
      end if;

      if v_buyer_id is null and nullif(v_row ->> 'comprador', '') is not null then
        select id into v_buyer_id from public.compradores where comprador = v_row ->> 'comprador' limit 1;
        if v_buyer_id is null then
          select id into v_buyer_id from public.compradores where lower(trim(comprador)) = lower(trim(v_row ->> 'comprador')) limit 1;
        end if;
      end if;

      if v_is_buyer then
        if v_buyer_id is not null and not (v_buyer_id = any(v_current_buyer_scope_ids)) then
          raise exception 'No autorizado para crear o modificar la promocion % con el comprador indicado.', v_id
            using errcode = '42501';
        end if;
        v_buyer_id := coalesce(v_buyer_id, v_current_buyer_id);
        v_campana_id := coalesce(v_existing_campana_id, v_target_campana_id);
      else
        v_campana_id := v_target_campana_id;
      end if;

      if coalesce(nullif(v_row ->> 'actividad_id', ''), '') = '' then
        raise exception 'Promocion % sin actividad_id. SKU: %, comprador: %, campo faltante: actividad_id.',
          v_id,
          coalesce(v_row ->> 'sku', 'sin SKU'),
          coalesce(v_row ->> 'comprador', 'sin comprador');
      end if;
      if v_campana_id is null then
        raise exception 'Promocion % sin campana valida (%).', v_id, v_row ->> 'actividad_id';
      end if;
      if v_buyer_id is null then
        raise exception 'Promocion % sin comprador valido (%).', v_id, v_row ->> 'comprador';
      end if;
      if coalesce(v_row ->> 'sku', '') = '' then
        raise exception 'Promocion % sin SKU.', v_id;
      end if;

      if v_promo_id is not null then
        v_expected_version := nullif(v_expected_promo_versions ->> v_id, '')::bigint;
        if v_expected_version is null or v_expected_version <> v_existing_version then
          raise exception 'PROMOTION_VERSION_CONFLICT'
            using
              errcode = 'P0001',
              detail = jsonb_build_object(
                'type', 'PROMOTION_VERSION_CONFLICT',
                'action', 'update',
                'conflicts', jsonb_build_array(jsonb_build_object(
                  'row_id', v_id,
                  'expected_version', v_expected_version,
                  'current_version', v_existing_version,
                  'fields', (
                    select coalesce(jsonb_agg(jsonb_build_object('field', field_name, 'user', user_value, 'current', current_value)), '[]'::jsonb)
                    from (
                      values
                        ('actividad_id', coalesce(v_row ->> 'actividad_id', ''), coalesce(v_current_promo_row ->> 'actividad_id', '')),
                        ('oferta_id', coalesce(v_row ->> 'oferta_id', ''), coalesce(v_current_promo_row ->> 'oferta_id', '')),
                        ('comprador', coalesce(v_row ->> 'comprador', ''), coalesce(v_current_promo_row ->> 'comprador', '')),
                        ('tipo_promo', coalesce(v_row ->> 'tipo_promo', ''), coalesce(v_current_promo_row ->> 'tipo_promo', '')),
                        ('grupo_oferta', coalesce(v_row ->> 'grupo_oferta', ''), coalesce(v_current_promo_row ->> 'grupo_oferta', '')),
                        ('tipo_sku', coalesce(v_row ->> 'tipo_sku', ''), coalesce(v_current_promo_row ->> 'tipo_sku', '')),
                        ('variante', coalesce(v_row ->> 'variante', ''), coalesce(v_current_promo_row ->> 'variante', '')),
                        ('dep_id', coalesce(v_row ->> 'dep_id', ''), coalesce(v_current_promo_row ->> 'dep_id', '')),
                        ('sku', coalesce(v_row ->> 'sku', ''), coalesce(v_current_promo_row ->> 'sku', '')),
                        ('num_parte', coalesce(v_row ->> 'num_parte', ''), coalesce(v_current_promo_row ->> 'num_parte', '')),
                        ('descripcion', coalesce(v_row ->> 'descripcion', ''), coalesce(v_current_promo_row ->> 'descripcion', '')),
                        ('tipo_cantidad', coalesce(v_row ->> 'tipo_cantidad', ''), coalesce(v_current_promo_row ->> 'tipo_cantidad', '')),
                        ('cantidad_minima', coalesce(v_row ->> 'cantidad_minima', ''), coalesce(v_current_promo_row ->> 'cantidad_minima', '')),
                        ('precio_antes', coalesce(v_row ->> 'precio_antes', ''), coalesce(v_current_promo_row ->> 'precio_antes', '')),
                        ('precio_ahora', coalesce(v_row ->> 'precio_ahora', ''), coalesce(v_current_promo_row ->> 'precio_ahora', '')),
                        ('descuento', coalesce(v_row ->> 'descuento', ''), coalesce(v_current_promo_row ->> 'descuento', '')),
                        ('comentario_comprador', coalesce(v_row ->> 'comentario_comprador', ''), coalesce(v_current_promo_row ->> 'comentario_comprador', '')),
                        ('aplica_segmento', coalesce(v_row ->> 'aplica_segmento', ''), coalesce(v_current_promo_row ->> 'aplica_segmento', '')),
                        ('segmento_cliente', coalesce(v_row ->> 'segmento_cliente', ''), coalesce(v_current_promo_row ->> 'segmento_cliente', '')),
                        ('alcance_tipo', coalesce(v_row ->> 'alcance_tipo', ''), coalesce(v_current_promo_row ->> 'alcance_tipo', '')),
                        ('alcance_valor', coalesce(v_row ->> 'alcance_valor', ''), coalesce(v_current_promo_row ->> 'alcance_valor', '')),
                        ('estado_registro', coalesce(v_row ->> 'estado_registro', ''), coalesce(v_current_promo_row ->> 'estado_registro', ''))
                    ) as diff(field_name, user_value, current_value)
                    where user_value is distinct from current_value
                  ),
                  'user_row', v_row,
                  'current_row', v_current_promo_row
                ))
              )::text;
        end if;
      end if;

      insert into public.promociones as p (
        legacy_row_id, campana_id, oferta_id, buyer_id, tipo_promo, grupo_oferta, tipo_sku,
        variante, sku, num_parte, descripcion, tipo_cantidad, cantidad_minima, precio_antes,
        precio_ahora, descuento, comentario_comprador, aplica_segmento, segmento_cliente,
        alcance_tipo, alcance_valor, estado_registro, dep_id, usuario_crea, usuario_edita,
        ultima_modificacion_por
      )
      values (
        v_id,
        v_campana_id,
        coalesce(v_row ->> 'oferta_id', ''),
        v_buyer_id,
        coalesce(v_row ->> 'tipo_promo', ''),
        coalesce(v_row ->> 'grupo_oferta', ''),
        coalesce(nullif(v_row ->> 'tipo_sku', ''), 'simple'),
        coalesce(v_row ->> 'variante', ''),
        coalesce(v_row ->> 'sku', ''),
        coalesce(v_row ->> 'num_parte', ''),
        coalesce(v_row ->> 'descripcion', ''),
        coalesce(nullif(v_row ->> 'tipo_cantidad', ''), 'Exacta'),
        coalesce(nullif(v_row ->> 'cantidad_minima', '')::numeric, 1),
        nullif(v_row ->> 'precio_antes', '')::numeric,
        nullif(v_row ->> 'precio_ahora', '')::numeric,
        coalesce(v_row ->> 'descuento', ''),
        coalesce(v_row ->> 'comentario_comprador', ''),
        case when upper(coalesce(v_row ->> 'aplica_segmento', 'NO')) = 'SI' then 'SI' else 'NO' end,
        coalesce(v_row ->> 'segmento_cliente', ''),
        coalesce(v_row ->> 'alcance_tipo', ''),
        coalesce(v_row ->> 'alcance_valor', ''),
        coalesce(nullif(v_row ->> 'estado_registro', ''), 'BORRADOR'),
        coalesce(v_row ->> 'dep_id', ''),
        coalesce(nullif(v_row ->> 'usuario_crea', ''), v_actor_name, ''),
        coalesce(nullif(v_row ->> 'usuario_edita', ''), nullif(v_row ->> 'ultima_modificacion_por', ''), v_actor_name, ''),
        coalesce(nullif(v_row ->> 'ultima_modificacion_por', ''), nullif(v_row ->> 'usuario_edita', ''), v_actor_name, '')
      )
      on conflict (legacy_row_id) do update set
        campana_id = case
          when v_is_admin then excluded.campana_id
          else p.campana_id
        end,
        oferta_id = excluded.oferta_id,
        buyer_id = case
          when v_is_admin then excluded.buyer_id
          else p.buyer_id
        end,
        tipo_promo = excluded.tipo_promo,
        grupo_oferta = excluded.grupo_oferta,
        tipo_sku = excluded.tipo_sku,
        variante = excluded.variante,
        sku = excluded.sku,
        num_parte = excluded.num_parte,
        descripcion = excluded.descripcion,
        tipo_cantidad = excluded.tipo_cantidad,
        cantidad_minima = excluded.cantidad_minima,
        precio_antes = excluded.precio_antes,
        precio_ahora = excluded.precio_ahora,
        descuento = excluded.descuento,
        comentario_comprador = excluded.comentario_comprador,
        aplica_segmento = excluded.aplica_segmento,
        segmento_cliente = excluded.segmento_cliente,
        alcance_tipo = excluded.alcance_tipo,
        alcance_valor = excluded.alcance_valor,
        estado_registro = excluded.estado_registro,
        dep_id = excluded.dep_id,
        usuario_crea = coalesce(nullif(excluded.usuario_crea, ''), p.usuario_crea),
        usuario_edita = excluded.usuario_edita,
        ultima_modificacion_por = excluded.ultima_modificacion_por,
        version = p.version + 1,
        updated_at = now()
      returning id, version into v_promo_id, v_existing_version;

      v_saved_promotions := v_saved_promotions || jsonb_build_array(jsonb_build_object(
        'row_id', v_id,
        'version', v_existing_version
      ));

      v_count_promos := v_count_promos + 1;
    end loop;
  end if;

  -- Detalles: reemplazo completo de detalles de promociones modificadas.
  if v_can_write_operational and array_length(v_changed_promos, 1) is not null then
    for v_id in select unnest(v_changed_promos) loop
      select p.id, p.buyer_id
      into v_promo_id, v_existing_buyer_id
      from public.promociones p
      where p.legacy_row_id = v_id
      for update;

      if v_promo_id is null then
        raise exception 'No existe la promocion % solicitada para sincronizar detalles.', v_id;
      end if;

      if v_is_buyer and not coalesce(v_existing_buyer_id = any(v_current_buyer_scope_ids), false) then
        raise exception 'No autorizado para sincronizar detalles de la promocion %.', v_id
          using errcode = '42501';
      end if;
    end loop;

    delete from public.promociones_detalle d
    using public.promociones p
      where d.promocion_id = p.id
      and p.legacy_row_id = any(v_changed_promos)
      and (v_is_admin or p.buyer_id = any(v_current_buyer_scope_ids));
  end if;

  if v_can_write_operational then
    for v_row in select value from jsonb_array_elements(coalesce(p_payload -> 'promociones_detalle', '[]'::jsonb)) loop
      v_id := coalesce(nullif(v_row ->> 'row_id', ''), nullif(v_row ->> 'rowId', ''));
      if v_id = '' or (v_promo_sync is not null and not v_id = any(v_changed_promos)) then
        continue;
      end if;

      select id, buyer_id
      into v_promo_id, v_existing_buyer_id
      from public.promociones
      where legacy_row_id = v_id
      for update;

      if v_promo_id is null then
        raise exception 'No existe la promocion % solicitada para detalle.', v_id;
      end if;

      if v_is_buyer and not coalesce(v_existing_buyer_id = any(v_current_buyer_scope_ids), false) then
        raise exception 'No autorizado para modificar detalles de la promocion %.', v_id
          using errcode = '42501';
      end if;

      if coalesce(v_row ->> 'campo', '') <> '' then
        insert into public.promociones_detalle (promocion_id, campo, valor)
        values (v_promo_id, v_row ->> 'campo', coalesce(v_row ->> 'valor', ''))
        on conflict (promocion_id, campo) do update set valor = excluded.valor, updated_at = now();
      end if;
    end loop;
  end if;

  -- Invariantes de ofertas agrupadas sobre el estado final del agregado.
  if v_can_write_operational and array_length(v_touched_offer_context_keys, 1) is not null then
    for v_invalid_offer in
      with touched as (
        select distinct
          split_part(context_key, '::', 1) as actividad_id,
          split_part(context_key, '::', 2) as tipo_promo,
          split_part(context_key, '::', 3) as oferta_id
        from unnest(v_touched_offer_context_keys) as item(context_key)
      ),
      offer_rows as (
        select
          t.actividad_id,
          t.tipo_promo,
          t.oferta_id,
          p.id,
          p.legacy_row_id,
          p.buyer_id,
          p.tipo_sku,
          p.sku,
          p.cantidad_minima,
          p.estado_registro,
          c.id as campana_id
        from touched t
        join public.campanas c on c.legacy_actividad_id = t.actividad_id
        left join public.promociones p
          on p.campana_id = c.id
          and p.tipo_promo = t.tipo_promo
          and p.oferta_id = t.oferta_id
      ),
      offer_checks as (
        select
          actividad_id,
          tipo_promo,
          oferta_id,
          count(id) as line_count,
          coalesce(bool_or(lower(tipo_sku) = 'principal') filter (where id is not null), false) as has_principal,
          coalesce(bool_or(lower(tipo_sku) in ('regalia', 'regalía', 'recompensa', 'reward')) filter (where id is not null), false) as has_reward,
          count(distinct buyer_id) filter (where id is not null) as buyer_count,
          count(distinct campana_id) filter (where id is not null) as campana_count,
          bool_or(cantidad_minima is null or cantidad_minima <= 0) filter (where id is not null) as has_invalid_quantity,
          bool_or(estado_registro not in ('BORRADOR', 'REGISTRADO', 'EN_REVISION', 'APROBADO', 'RECHAZADO', 'CERRADO', 'ANULADO')) filter (where id is not null) as has_invalid_state,
          count(id) <> count(distinct lower(coalesce(tipo_sku, '')) || '::' || coalesce(sku, '')) as has_duplicate_role_sku
        from offer_rows
        group by actividad_id, tipo_promo, oferta_id
      )
      select *
      from offer_checks
      where line_count > 0
        and (
          not has_principal
          or not has_reward
          or buyer_count <> 1
          or campana_count <> 1
          or coalesce(has_invalid_quantity, false)
          or coalesce(has_invalid_state, false)
          or has_duplicate_role_sku
        )
    loop
      raise exception
        'Oferta agrupada invalida despues del delta (% / % / %): principal %, recompensa %, compradores %, campanas %, cantidad invalida %, estado invalido %, duplicados %.',
        v_invalid_offer.actividad_id,
        v_invalid_offer.tipo_promo,
        v_invalid_offer.oferta_id,
        v_invalid_offer.has_principal,
        v_invalid_offer.has_reward,
        v_invalid_offer.buyer_count,
        v_invalid_offer.campana_count,
        coalesce(v_invalid_offer.has_invalid_quantity, false),
        coalesce(v_invalid_offer.has_invalid_state, false),
        v_invalid_offer.has_duplicate_role_sku;
    end loop;
  end if;

  -- Comentarios: MARK puede escribir comentarios aunque no promociones.
  if v_can_write_comments then
    for v_row in select value from jsonb_array_elements(coalesce(p_payload -> 'comentarios', '[]'::jsonb)) loop
      v_id := coalesce(nullif(v_row ->> 'comentario_id', ''), nullif(v_row ->> 'comentarioId', ''), nullif(v_row ->> 'id', ''));
      if v_id = '' or (v_comment_sync is not null and not v_id = any(v_changed_comments)) then
        continue;
      end if;

      v_alcance := upper(coalesce(nullif(v_row ->> 'alcance_comentario', ''), case when coalesce(v_row ->> 'row_id', '') <> '' then 'LINEA' else 'ACTIVIDAD' end));
      if v_alcance in ('ACTIVITY', 'CATALOGO', 'GENERAL') then
        v_alcance := 'ACTIVIDAD';
      elsif v_alcance in ('SKU') then
        v_alcance := 'LINEA';
      end if;

      if v_alcance not in ('LINEA', 'ACTIVIDAD') then
        raise exception 'Comentario % tiene alcance invalido (%).', v_id, v_alcance;
      end if;

      v_promo_id := null;
      v_campana_id := null;

      if v_alcance = 'LINEA' then
        select id, campana_id, buyer_id into v_promo_id, v_campana_id, v_target_buyer_id
        from public.promociones
        where legacy_row_id = v_row ->> 'row_id'
        for update;

        if v_promo_id is null then
          raise exception 'Comentario % apunta a una promocion inexistente (%).', v_id, v_row ->> 'row_id';
        end if;

      else
        select id, solicitante_buyer_id into v_campana_id, v_target_solicitante_buyer_id
        from public.campanas
        where legacy_actividad_id = v_row ->> 'actividad_id'
        for update;

        if v_campana_id is null then
          raise exception 'Comentario % apunta a una actividad inexistente (%).', v_id, v_row ->> 'actividad_id';
        end if;

      end if;

      if not public.can_write_comment_scope(v_promo_id, v_campana_id) then
        raise exception 'No autorizado para comentar el recurso solicitado (%).', v_id
          using errcode = '42501';
      end if;

      if coalesce(v_row ->> 'comentario', '') = '' then
        raise exception 'Comentario % sin texto.', v_id;
      end if;

      select
        c.id,
        c.promocion_id,
        c.campana_id,
        c.usuario_id,
        c.usuario,
        c.comentario,
        c.created_at,
        p.buyer_id,
        ca.solicitante_buyer_id
      into
        v_comentario_id,
        v_existing_comment_promocion_id,
        v_existing_comment_campana_id,
        v_existing_comment_usuario_id,
        v_existing_comment_usuario,
        v_existing_comment_comentario,
        v_existing_comment_created_at,
        v_existing_buyer_id,
        v_existing_solicitante_buyer_id
      from public.comentarios c
      left join public.promociones p on p.id = c.promocion_id
      left join public.campanas ca on ca.id = c.campana_id
      where c.legacy_comentario_id = v_id
      for update of c;

      if v_comentario_id is not null then
        if not public.can_write_comment_scope(v_existing_comment_promocion_id, v_existing_comment_campana_id) then
          raise exception 'No autorizado para modificar el comentario %.', v_id
            using errcode = '42501';
        end if;

        if (
          v_existing_comment_promocion_id is distinct from v_promo_id
          or v_existing_comment_campana_id is distinct from v_campana_id
        ) and not v_is_admin then
          raise exception 'No autorizado para mover el comentario % a otro recurso.', v_id
            using errcode = '42501';
        end if;

        if public.is_comment_scope_closed(v_existing_comment_promocion_id, v_existing_comment_campana_id)
          and not v_is_admin then
          raise exception 'Los comentarios de promociones o campanas cerradas solo admiten anexos nuevos.'
            using errcode = '42501';
        end if;

        if v_existing_comment_comentario is distinct from (v_row ->> 'comentario')
          and not (
            coalesce(v_existing_comment_usuario_id = v_current_user_id, false)
            and v_existing_comment_created_at >= now() - interval '30 minutes'
          )
          and not v_is_admin then
          raise exception 'Solo el autor puede editar el texto del comentario durante los primeros 30 minutos.'
            using errcode = '42501';
        end if;
      end if;

      if v_comentario_id is null then
        insert into public.comentarios (
          legacy_comentario_id, promocion_id, campana_id, legacy_row_id, alcance_comentario,
          prioridad, usuario_id, usuario, tipo_usuario, comentario, estado, fecha, fecha_resolucion
        )
        values (
          v_id, v_promo_id, v_campana_id, coalesce(v_row ->> 'row_id', ''), v_alcance,
          coalesce(nullif(v_row ->> 'prioridad', ''), 'MEDIA'), v_current_user_id, v_actor_name,
          v_role, v_row ->> 'comentario',
          upper(coalesce(nullif(v_row ->> 'estado', ''), 'ABIERTO')),
          coalesce(nullif(v_row ->> 'fecha', '')::timestamptz, now()),
          nullif(v_row ->> 'fecha_resolucion', '')::timestamptz
        );
      else
        update public.comentarios set
          promocion_id = case when v_is_admin then v_promo_id else promocion_id end,
          campana_id = case when v_is_admin then v_campana_id else campana_id end,
          legacy_row_id = case when v_is_admin then coalesce(v_row ->> 'row_id', '') else legacy_row_id end,
          alcance_comentario = case when v_is_admin then v_alcance else alcance_comentario end,
          prioridad = coalesce(nullif(v_row ->> 'prioridad', ''), 'MEDIA'),
          comentario = case
            when v_is_admin
              or (
                coalesce(v_existing_comment_usuario_id = v_current_user_id, false)
                and v_existing_comment_created_at >= now() - interval '30 minutes'
              )
            then v_row ->> 'comentario'
            else comentario
          end,
          estado = upper(coalesce(nullif(v_row ->> 'estado', ''), 'ABIERTO')),
          fecha_resolucion = nullif(v_row ->> 'fecha_resolucion', '')::timestamptz,
          updated_at = now()
        where id = v_comentario_id;
      end if;

      v_count_comments := v_count_comments + 1;
    end loop;
  end if;

  -- Notificaciones: solo ADMIN.
  if v_is_admin then
    for v_row in select value from jsonb_array_elements(coalesce(p_payload -> 'notificaciones', '[]'::jsonb)) loop
      v_id := coalesce(nullif(v_row ->> 'notificacion_id', ''), concat(coalesce(v_row ->> 'actividad_id', v_row ->> 'catalogo_id', ''), '__', coalesce(v_row ->> 'correo', '')));
      if v_id <> '' and (v_notificacion_sync is null or v_id = any(v_changed_notificaciones)) then
        select id into v_campana_id from public.campanas where legacy_actividad_id = coalesce(v_row ->> 'actividad_id', v_row ->> 'catalogo_id') limit 1;
        if v_campana_id is not null and coalesce(v_row ->> 'correo', '') <> '' then
          insert into public.notificaciones (campana_id, correo, tipo, activo)
          values (v_campana_id, v_row ->> 'correo', 'CAMBIO_PROMOCION', coalesce(nullif(v_row ->> 'activo', '')::boolean, true))
          on conflict (campana_id, correo, tipo) do update set activo = excluded.activo, updated_at = now();
        end if;
      end if;
    end loop;
  end if;

  -- Avances.
  if v_can_write_operational then
    for v_row in select value from jsonb_array_elements(coalesce(p_payload -> 'avances_catalogo', '[]'::jsonb)) loop
      v_id := coalesce(nullif(v_row ->> 'avance_id', ''), nullif(v_row ->> 'id', ''));
      if v_id = '' or (v_avance_sync is not null and not v_id = any(v_changed_avances)) then
        continue;
      end if;

      select a.id, a.buyer_id, a.campana_id
      into v_promo_id, v_existing_buyer_id, v_existing_campana_id
      from public.avances_catalogo a
      where a.avance_id = v_id
      for update;

      select id into v_campana_id
      from public.campanas
      where legacy_actividad_id = v_row ->> 'catalogo_id'
      for update;

      if v_campana_id is null then
        raise exception 'Avance % sin catalogo valido (%).', v_id, v_row ->> 'catalogo_id';
      end if;

      if v_promo_id is not null and v_is_buyer and not coalesce(v_existing_buyer_id = any(v_current_buyer_scope_ids), false) then
        raise exception 'No autorizado para modificar el avance %.', v_id
          using errcode = '42501';
      end if;

      if v_promo_id is not null and v_is_buyer and v_existing_campana_id is distinct from v_campana_id then
        raise exception 'No autorizado para cambiar el catalogo del avance %.', v_id
          using errcode = '42501';
      end if;

      -- Resolver buyer_id del avance por ID primero
      v_buyer_id := null;
      if coalesce(v_row ->> 'buyer_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        select id into v_buyer_id from public.compradores where id = (v_row ->> 'buyer_id')::uuid limit 1;
      end if;
      v_buyer_id := coalesce(v_buyer_id, v_existing_buyer_id);

      if v_buyer_id is null and nullif(v_row ->> 'comprador_id', '') is not null then
        select id into v_buyer_id from public.compradores where comprador_id = v_row ->> 'comprador_id' limit 1;
      end if;

      if v_buyer_id is null and nullif(v_row ->> 'comprador', '') is not null then
        select id into v_buyer_id from public.compradores where comprador = v_row ->> 'comprador' limit 1;
        if v_buyer_id is null then
          select id into v_buyer_id from public.compradores where lower(trim(comprador)) = lower(trim(v_row ->> 'comprador')) limit 1;
        end if;
      end if;

      if v_is_buyer then
        if v_buyer_id is not null and not (v_buyer_id = any(v_current_buyer_scope_ids)) then
          raise exception 'No autorizado para modificar el avance % con el comprador indicado.', v_id
            using errcode = '42501';
        end if;
        v_buyer_id := coalesce(v_buyer_id, v_current_buyer_id);
      end if;

      if v_buyer_id is null then
        raise exception 'Avance % sin comprador valido (%).', v_id, v_row ->> 'comprador';
      end if;

      insert into public.avances_catalogo as a (
        avance_id, campana_id, catalogo_id, catalogo, comprador_id, buyer_id,
        comprador, division, estado, fecha_estado, usuario
      )
      values (
        v_id, v_campana_id, coalesce(v_row ->> 'catalogo_id', ''), coalesce(v_row ->> 'catalogo', ''),
        case when v_is_buyer then coalesce(v_row ->> 'comprador_id', v_current_buyer_legacy_id) else coalesce(v_row ->> 'comprador_id', '') end,
        v_buyer_id,
        case when v_is_buyer then coalesce(v_row ->> 'comprador', v_current_buyer_name) else coalesce(v_row ->> 'comprador', '') end,
        case when v_is_buyer then coalesce(v_row ->> 'division', v_current_buyer_division) else coalesce(v_row ->> 'division', '') end,
        coalesce(nullif(v_row ->> 'estado', ''), 'Pendiente'),
        coalesce(nullif(v_row ->> 'fecha_estado', '')::timestamptz, now()), v_actor_name
      )
      on conflict (avance_id) do update set
        campana_id = excluded.campana_id,
        catalogo_id = excluded.catalogo_id,
        catalogo = excluded.catalogo,
        comprador_id = excluded.comprador_id,
        buyer_id = case
          when v_is_admin then excluded.buyer_id
          else a.buyer_id
        end,
        comprador = excluded.comprador,
        division = excluded.division,
        estado = excluded.estado,
        fecha_estado = excluded.fecha_estado,
        usuario = excluded.usuario,
        updated_at = now();

      v_count_avances := v_count_avances + 1;
    end loop;
  end if;

  v_operation_response := jsonb_build_object(
    'sync_mode', 'delta',
    'saved_at', now(),
    'transactional', true,
    'operation_id', v_operation_id,
    'audit_mode', 'trigger_mandatory',
    'promociones', v_saved_promotions,
    'cambios', jsonb_build_object(
      'promociones_actualizadas', v_count_promos,
      'promociones_eliminadas', coalesce(array_length(v_deleted_promos, 1), 0),
      'comentarios_actualizados', v_count_comments,
      'avances_actualizados', v_count_avances,
      'logs_nuevos', v_count_logs
    )
  );

  if v_operation_id is not null then
    update public.save_operations
    set response = v_operation_response,
        status = 'SUCCEEDED',
        finished_at = now(),
        expires_at = now() + interval '7 days'
    where auth_user_id = v_auth_user_id
      and operation_id = v_operation_id
      and payload_hash = v_payload_hash
      and operation_type = v_operation_type;
  end if;

  return v_operation_response;
end;
$$;

revoke execute on function public.save_catalog_transactional(jsonb) from public;
revoke execute on function public.save_catalog_transactional(jsonb) from anon;
grant execute on function public.save_catalog_transactional(jsonb) to authenticated;
