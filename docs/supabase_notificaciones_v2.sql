-- =============================================================================
-- Notificaciones v2: calendario automático de catálogos, avisos generados en el
-- servidor y limpieza programada.
-- =============================================================================
-- Requiere: supabase_add_catalog_status_preliminar.sql, supabase_add_numero_pagina.sql,
-- supabase_live_notifications.sql, supabase_catalog_deadlines_broadcasts.sql,
-- supabase_catalogo_diseno.sql y supabase_catalogo_respuestas.sql.
-- Reemplaza create_live_notification: no volver a ejecutar después
-- supabase_live_notifications.sql ni supabase_notificaciones_disenadores_catalogo.sql.
--
-- Repetible. No borra datos de negocio. No modifica hojas ni columnas Excel.
-- Las tareas programadas necesitan la extensión pg_cron (Supabase: Database >
-- Extensions > pg_cron). Si no está habilitada, el script instala todo lo demás
-- y avisa con un NOTICE; se puede volver a ejecutar después de habilitarla.
--
-- Qué hace:
--  1. Calendario de cortes por canal (igual que src/features/catalogSchedule).
--  2. Tarea diaria 00:05 America/Managua:
--     - Borrador -> Preliminar el día del corte preliminar (enciende avisos).
--     - Borrador/Preliminar -> Precios Finales el día del corte de precios.
--     - Aviso único "importante" el mismo día de cada corte.
--  3. Avisos por triggers: cambio de estado o de vigencia del catálogo,
--     asignación de comprador/diseñador a una página y respuestas a observaciones.
--  4. create_live_notification calcula destinatarios en el servidor y valida
--     el rol del autor por tipo de evento.
--  5. Limpieza diaria: leídos > 30 días y no leídos > 90 días.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Registro de ejecuciones del calendario (idempotencia).
-- -----------------------------------------------------------------------------
create table if not exists public.catalogo_eventos_programados (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.campanas(id) on delete cascade,
  tipo text not null check (tipo in ('ESTADO_AUTO', 'AVISO_CORTE')),
  hito text not null,
  fecha date not null,
  creado_en timestamptz not null default now(),
  constraint catalogo_eventos_programados_unique unique (campana_id, tipo, hito, fecha)
);

alter table public.catalogo_eventos_programados enable row level security;
revoke all on public.catalogo_eventos_programados from anon, authenticated;

create index if not exists idx_notificaciones_envivo_limpieza
  on public.notificaciones_envivo (leida, created_at);

-- -----------------------------------------------------------------------------
-- 1. Calendario de cortes.
-- -----------------------------------------------------------------------------
create or replace function public.catalog_milestones(p_canal text, p_fecha_inicio date)
returns table (perfil text, hito text, etiqueta text, fecha date)
language sql
immutable
set search_path = public
as $$
  with canales as (
    select translate(lower(btrim(value)), 'áéíóúñ', 'aeioun') as canal
    from regexp_split_to_table(coalesce(p_canal, ''), '[;|,]') as value
    where btrim(value) <> ''
  ),
  perfiles as (
    select distinct case when canal in ('galeron', 'galerones', 'ferrex') then 'short' else 'general' end as perfil
    from canales
    union
    select 'general' where not exists (select 1 from canales)
  ),
  offsets(perfil, hito, etiqueta, dias) as (
    values
      ('general', 'preliminar', 'Preliminar', 22),
      ('general', 'precios_finales', 'Precios finales', 12),
      ('general', 'imprenta', 'Entrega a imprenta', 7),
      ('short', 'preliminar', 'Preliminar', 16),
      ('short', 'precios_finales', 'Precios finales', 10),
      ('short', 'imprenta', 'Entrega a imprenta', 6)
  )
  select o.perfil, o.hito, o.etiqueta, p_fecha_inicio - o.dias
  from offsets o
  join perfiles p using (perfil)
  where p_fecha_inicio is not null;
$$;

-- -----------------------------------------------------------------------------
-- 2. Resolución de destinatarios.
-- -----------------------------------------------------------------------------
create or replace function public.notif_norm(p_value text)
returns text
language sql
immutable
as $$
  select translate(lower(btrim(coalesce(p_value, ''))), 'áéíóúñ', 'aeioun');
$$;

-- Usuarios BUYER activos de las divisiones del catálogo (divisiones vacías = todas).
create or replace function public.catalog_buyer_user_ids(p_campana_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  with catalogo as (
    select coalesce(divisiones, '') as divisiones from public.campanas where id = p_campana_id
  ),
  divisiones as (
    select public.notif_norm(value) as division
    from catalogo, regexp_split_to_table(catalogo.divisiones, ';') as value
    where btrim(value) <> ''
  )
  select coalesce(array_agg(distinct u.id), array[]::uuid[])
  from public.usuarios_app u
  join public.compradores c on c.id = u.buyer_id and c.activo = true
  where u.activo = true
    and upper(u.rol) = 'BUYER'
    and (
      not exists (select 1 from divisiones)
      or public.notif_norm(c.division) in (select division from divisiones)
    );
$$;

create or replace function public.role_user_ids(p_roles text[])
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(id), array[]::uuid[])
  from public.usuarios_app
  where activo = true and upper(rol) = any(p_roles);
$$;

create or replace function public.buyer_user_ids(p_buyer_ids uuid[])
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(id), array[]::uuid[])
  from public.usuarios_app
  where activo = true and buyer_id = any(coalesce(p_buyer_ids, array[]::uuid[]));
$$;

-- Diseñadores activos asignados a cualquier página del catálogo.
create or replace function public.catalog_designer_user_ids(p_campana_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct pag.disenador_id), array[]::uuid[])
  from public.campanas c
  join public.catalogo_proyecto_diseno p on p.catalogo_id in (c.legacy_actividad_id, c.id::text)
  join public.catalogo_paginas_diseno pag on pag.proyecto_id = p.id
  join public.usuarios_app u on u.id = pag.disenador_id and u.activo = true
  where c.id = p_campana_id
    and coalesce(p.estado, '') <> 'cancelado';
$$;

-- Inserción central. Uso interno: no se concede a usuarios.
create or replace function public.notify_users(
  p_user_ids uuid[],
  p_tipo_evento text,
  p_titulo text,
  p_mensaje text,
  p_campana_id uuid default null,
  p_url_modulo text default '',
  p_metadata jsonb default '{}'::jsonb,
  p_promocion_id uuid default null,
  p_comentario_id uuid default null,
  p_respect_campaign_flag boolean default true
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.usuarios_app%rowtype;
  v_count integer := 0;
begin
  if p_respect_campaign_flag and p_campana_id is not null and not exists (
    select 1 from public.campanas where id = p_campana_id and notificaciones_envivo = true
  ) then
    return 0;
  end if;

  select * into v_actor from public.usuarios_app
  where auth_user_id = auth.uid() and activo = true
  limit 1;

  insert into public.notificaciones_envivo (
    destinatario_usuario_id, destinatario_rol, actor_usuario_id, actor_nombre, actor_rol,
    campana_id, promocion_id, comentario_id, tipo_evento, titulo, mensaje, url_modulo, metadata
  )
  select u.id, u.rol, v_actor.id,
    coalesce(v_actor.nombre, 'Sistema'), coalesce(v_actor.rol, 'SISTEMA'),
    p_campana_id, p_promocion_id, p_comentario_id,
    p_tipo_evento, left(btrim(p_titulo), 120), left(coalesce(p_mensaje, ''), 500),
    coalesce(p_url_modulo, ''), coalesce(p_metadata, '{}'::jsonb)
  from public.usuarios_app u
  where u.id = any(coalesce(p_user_ids, array[]::uuid[]))
    and u.activo = true
    and u.id is distinct from v_actor.id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.catalog_label(p_campana_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(btrim(nombre_actividad), ''), legacy_actividad_id, 'sin nombre')
  from public.campanas where id = p_campana_id;
$$;

create or replace function public.campana_id_for_catalog(p_catalogo_id text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.campanas
  where legacy_actividad_id = btrim(p_catalogo_id) or id::text = btrim(p_catalogo_id)
  order by (legacy_actividad_id = btrim(p_catalogo_id)) desc
  limit 1;
$$;

-- -----------------------------------------------------------------------------
-- 3. Trigger: cambio de estado o de vigencia del catálogo.
-- -----------------------------------------------------------------------------
create or replace function public.notify_catalog_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auto boolean := coalesce(current_setting('app.cambio_automatico', true), '') = 'on';
  v_recipients uuid[];
  v_nombre text := coalesce(nullif(btrim(new.nombre_actividad), ''), new.legacy_actividad_id);
begin
  if new.tipo_actividad <> 'CATALOGO' then
    return new;
  end if;

  v_recipients := public.catalog_buyer_user_ids(new.id) || public.role_user_ids(array['MARK']);

  if old.estado is distinct from new.estado then
    perform public.notify_users(
      v_recipients,
      'CATALOGO_ESTADO',
      'Estado del catálogo actualizado',
      format('El catálogo «%s» pasó de %s a %s.%s', v_nombre, coalesce(old.estado, '—'), new.estado,
        case when v_auto then ' Cambio automático según el calendario de cortes.' else '' end),
      new.id, 'home',
      jsonb_build_object('estadoAnterior', old.estado, 'estado', new.estado, 'automatico', v_auto)
    );
  end if;

  if old.fecha_inicio is distinct from new.fecha_inicio or old.fecha_fin is distinct from new.fecha_fin then
    perform public.notify_users(
      v_recipients,
      'CATALOGO_VIGENCIA',
      'Vigencia del catálogo actualizada',
      format('El catálogo «%s» ahora tiene vigencia del %s al %s. Revise las fechas de corte.', v_nombre,
        coalesce(to_char(new.fecha_inicio, 'DD/MM/YYYY'), 'sin fecha'),
        coalesce(to_char(new.fecha_fin, 'DD/MM/YYYY'), 'sin fecha')),
      new.id, 'home',
      jsonb_build_object('fechaInicio', new.fecha_inicio, 'fechaFin', new.fecha_fin)
    );
  end if;

  return new;
exception when others then
  -- Un fallo del aviso nunca debe revertir la operación de negocio.
  raise warning '%: %', 'notify_catalog_change', sqlerrm;
  return new;
end;
$$;

drop trigger if exists notify_catalog_change on public.campanas;
create trigger notify_catalog_change
  after update of estado, fecha_inicio, fecha_fin on public.campanas
  for each row
  when (old.estado is distinct from new.estado
    or old.fecha_inicio is distinct from new.fecha_inicio
    or old.fecha_fin is distinct from new.fecha_fin)
  execute function public.notify_catalog_change();

-- -----------------------------------------------------------------------------
-- 4. Trigger: asignación de comprador o diseñador a una página de Diseño.
--    Se avisa al comprador involucrado (el nuevo y, si cambió, el anterior).
-- -----------------------------------------------------------------------------
create or replace function public.notify_design_page_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.catalogo_proyecto_diseno%rowtype;
  v_campana_id uuid;
  v_label text;
  v_designer text;
  v_meta jsonb;
begin
  select * into v_project from public.catalogo_proyecto_diseno where id = new.proyecto_id;
  v_campana_id := public.campana_id_for_catalog(v_project.catalogo_id);
  v_label := format('%s · Página %s', coalesce(v_project.nombre_proyecto, v_project.catalogo_id), new.numero_pagina);
  select coalesce(nullif(btrim(nombre), ''), email) into v_designer from public.usuarios_app where id = new.disenador_id;
  v_meta := jsonb_build_object('proyectoId', new.proyecto_id, 'paginaId', new.id, 'numeroPagina', new.numero_pagina);

  if new.comprador_id is distinct from old.comprador_id then
    if new.comprador_id is not null then
      perform public.notify_users(
        public.buyer_user_ids(array[new.comprador_id]),
        'DISENO_ASIGNACION', 'Página de catálogo asignada',
        format('Se le asignó %s.%s', v_label,
          case when v_designer is not null then format(' Diseñador: %s.', v_designer) else ' Aún sin diseñador.' end),
        v_campana_id, 'catalogDesign', v_meta || jsonb_build_object('cambio', 'comprador_asignado')
      );
    end if;
    if old.comprador_id is not null then
      perform public.notify_users(
        public.buyer_user_ids(array[old.comprador_id]),
        'DISENO_ASIGNACION', 'Página de catálogo reasignada',
        format('%s ya no está asignada a usted.', v_label),
        v_campana_id, 'catalogDesign', v_meta || jsonb_build_object('cambio', 'comprador_retirado')
      );
    end if;
  elsif new.disenador_id is distinct from old.disenador_id and new.comprador_id is not null then
    perform public.notify_users(
      public.buyer_user_ids(array[new.comprador_id]),
      'DISENO_ASIGNACION', 'Diseñador asignado a su página',
      case when v_designer is not null
        then format('%s ahora la trabaja %s.', v_label, v_designer)
        else format('%s quedó sin diseñador asignado.', v_label) end,
      v_campana_id, 'catalogDesign', v_meta || jsonb_build_object('cambio', 'disenador')
    );
  end if;

  return new;
exception when others then
  -- Un fallo del aviso nunca debe revertir la operación de negocio.
  raise warning '%: %', 'notify_design_page_assignment', sqlerrm;
  return new;
end;
$$;

drop trigger if exists notify_design_page_assignment on public.catalogo_paginas_diseno;
create trigger notify_design_page_assignment
  after update of comprador_id, disenador_id on public.catalogo_paginas_diseno
  for each row
  when (old.comprador_id is distinct from new.comprador_id or old.disenador_id is distinct from new.disenador_id)
  execute function public.notify_design_page_assignment();

-- -----------------------------------------------------------------------------
-- 5. Trigger: respuesta a una observación de Diseño.
--    Destinatarios: autor de la observación, quien respondió antes, diseñador y
--    comprador de la página. Se excluye a quien responde.
-- -----------------------------------------------------------------------------
create or replace function public.notify_design_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comment public.catalogo_pagina_comentarios%rowtype;
  v_page public.catalogo_paginas_diseno%rowtype;
  v_project public.catalogo_proyecto_diseno%rowtype;
  v_recipients uuid[];
begin
  select * into v_comment from public.catalogo_pagina_comentarios where id = new.comentario_id;
  select * into v_page from public.catalogo_paginas_diseno where id = v_comment.pagina_id;
  select * into v_project from public.catalogo_proyecto_diseno where id = v_page.proyecto_id;

  v_recipients := array_remove(array[v_comment.usuario_id, v_page.disenador_id], null)
    || public.buyer_user_ids(array_remove(array[v_page.comprador_id], null))
    || coalesce((select array_agg(usuario_id) from public.catalogo_pagina_respuestas
       where comentario_id = new.comentario_id and id <> new.id and usuario_id is not null), array[]::uuid[]);

  perform public.notify_users(
    v_recipients,
    'DISENO_RESPUESTA', 'Nueva respuesta a una observación',
    format('%s · Página %s: %s', coalesce(v_project.nombre_proyecto, v_project.catalogo_id), v_page.numero_pagina, left(new.comentario, 160)),
    public.campana_id_for_catalog(v_project.catalogo_id), 'catalogDesign',
    jsonb_build_object('proyectoId', v_project.id, 'paginaId', v_page.id, 'comentarioDisenoId', new.comentario_id)
  );
  return new;
exception when others then
  -- Un fallo del aviso nunca debe revertir la operación de negocio.
  raise warning '%: %', 'notify_design_reply', sqlerrm;
  return new;
end;
$$;

drop trigger if exists notify_design_reply on public.catalogo_pagina_respuestas;
create trigger notify_design_reply
  after insert on public.catalogo_pagina_respuestas
  for each row execute function public.notify_design_reply();

-- -----------------------------------------------------------------------------
-- 6. create_live_notification: destinatarios calculados en el servidor.
--    Misma firma que la versión anterior, compatible con el frontend.
-- -----------------------------------------------------------------------------
create or replace function public.create_live_notification(
  p_tipo_evento text,
  p_titulo text,
  p_mensaje text default '',
  p_legacy_actividad_id text default null,
  p_legacy_row_id text default null,
  p_comentario_id text default null,
  p_destinatario_roles text[] default array[]::text[],
  p_destinatario_usuario_ids uuid[] default array[]::uuid[],
  p_destinatario_buyer_ids uuid[] default array[]::uuid[],
  p_url_modulo text default '',
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.usuarios_app%rowtype;
  v_role text;
  v_tipo text := upper(btrim(coalesce(p_tipo_evento, '')));
  v_campana_id uuid;
  v_promocion_id uuid;
  v_comentario_uuid uuid;
  v_row_ids text[];
  v_recipients uuid[] := array[]::uuid[];
  v_page public.catalogo_paginas_diseno%rowtype;
  v_url text := coalesce(p_url_modulo, '');
  v_inserted integer;
begin
  select * into v_actor from public.usuarios_app
  where auth_user_id = auth.uid() and activo = true
  limit 1;
  if v_actor.id is null then
    raise exception 'Usuario no autorizado para crear notificaciones en vivo.' using errcode = '42501';
  end if;
  v_role := upper(v_actor.rol);

  if coalesce(btrim(p_titulo), '') = '' or v_tipo = '' then
    raise exception 'tipo_evento y titulo son obligatorios.' using errcode = '22023';
  end if;

  -- Tipos permitidos desde la app y rol autorizado para cada uno.
  if not (
    (v_tipo in ('PROMOCION_AGREGADA', 'PROMOCION_ACTUALIZADA', 'PROMOCION_ANULADA', 'PROMOCION_ELIMINADA') and v_role in ('BUYER', 'ADMIN'))
    or (v_tipo = 'COMENTARIO_COMPRAS' and v_role = 'BUYER')
    or (v_tipo = 'COMENTARIO_MERCADEO' and v_role in ('MARK', 'ADMIN'))
    or (v_tipo in ('DISENO_COMMENT', 'DISENO_REVIEW', 'DISENO_RESOLVED', 'DISENO_REOPENED', 'DISENO_IMAGE', 'DISENO_STATE')
        and v_role in ('ADMIN', 'MARK', 'BUYER', 'DISENADOR'))
  ) then
    raise exception 'Tipo de notificación no permitido para su rol: %', v_tipo using errcode = '42501';
  end if;

  v_campana_id := public.campana_id_for_catalog(p_legacy_actividad_id);
  if v_campana_id is not null and not exists (
    select 1 from public.campanas where id = v_campana_id and notificaciones_envivo = true
  ) then
    return jsonb_build_object('inserted', 0, 'skipped', 'disabled_for_campaign');
  end if;

  if v_campana_id is not null and coalesce(btrim(p_legacy_row_id), '') <> '' then
    select id into v_promocion_id from public.promociones
    where campana_id = v_campana_id and legacy_row_id = btrim(p_legacy_row_id)
    limit 1;
  end if;

  if v_tipo like 'COMENTARIO_%' and coalesce(btrim(p_comentario_id), '') <> '' then
    begin
      v_comentario_uuid := btrim(p_comentario_id)::uuid;
    exception when invalid_text_representation then
      select id into v_comentario_uuid from public.comentarios
      where legacy_comentario_id = btrim(p_comentario_id) limit 1;
    end;
  end if;

  if v_tipo like 'PROMOCION_%' or v_tipo = 'COMENTARIO_COMPRAS' then
    -- Diseñador de la página de cada promoción; si falta, diseñadores del
    -- catálogo; si el catálogo no tiene diseñadores, Mercadeo.
    v_row_ids := array(
      select jsonb_array_elements_text(case when jsonb_typeof(p_metadata -> 'rowIds') = 'array' then p_metadata -> 'rowIds' else '[]'::jsonb end)
      union select btrim(p_legacy_row_id) where coalesce(btrim(p_legacy_row_id), '') <> ''
    );

    if v_campana_id is not null then
      select coalesce(array_agg(distinct pag.disenador_id), array[]::uuid[]) into v_recipients
      from public.promociones pr
      join public.campanas c on c.id = pr.campana_id
      join public.catalogo_proyecto_diseno p on p.catalogo_id in (c.legacy_actividad_id, c.id::text) and coalesce(p.estado, '') <> 'cancelado'
      join public.catalogo_paginas_diseno pag on pag.proyecto_id = p.id and pag.numero_pagina = pr.numero_pagina
      join public.usuarios_app u on u.id = pag.disenador_id and u.activo = true
      where pr.campana_id = v_campana_id
        and pr.legacy_row_id = any(v_row_ids);

      if cardinality(v_row_ids) = 0 or exists (
        select 1 from unnest(v_row_ids) as rid(legacy_row_id)
        where not exists (
          select 1
          from public.promociones pr
          join public.campanas c on c.id = pr.campana_id
          join public.catalogo_proyecto_diseno p on p.catalogo_id in (c.legacy_actividad_id, c.id::text) and coalesce(p.estado, '') <> 'cancelado'
          join public.catalogo_paginas_diseno pag on pag.proyecto_id = p.id and pag.numero_pagina = pr.numero_pagina
          join public.usuarios_app u on u.id = pag.disenador_id and u.activo = true
          where pr.campana_id = v_campana_id and pr.legacy_row_id = rid.legacy_row_id
        )
      ) then
        v_recipients := v_recipients || public.catalog_designer_user_ids(v_campana_id);
      end if;
    end if;

    v_url := 'catalogDesign';

    -- Comentario de Compras: además, Mercadeo que ya participa en esa
    -- conversación (misma promoción o comentario general de la actividad).
    if v_tipo = 'COMENTARIO_COMPRAS' and v_campana_id is not null then
      v_recipients := v_recipients || coalesce((
        select array_agg(distinct co.usuario_id)
        from public.comentarios co
        join public.usuarios_app u on u.id = co.usuario_id and u.activo = true and upper(u.rol) in ('MARK', 'ADMIN')
        where co.campana_id = v_campana_id
          and (
            (v_promocion_id is not null and co.promocion_id = v_promocion_id)
            or (v_promocion_id is null and co.alcance_comentario = 'ACTIVIDAD')
          )
      ), array[]::uuid[]);
      v_url := 'consolidado';
    end if;

    if cardinality(v_recipients) = 0 then
      v_recipients := public.role_user_ids(array['MARK']);
      v_url := 'consolidado';
    end if;

  elsif v_tipo = 'COMENTARIO_MERCADEO' then
    -- Solo compradores con promociones en la actividad o el solicitante.
    v_recipients := public.buyer_user_ids(array(
      select b from unnest(coalesce(p_destinatario_buyer_ids, array[]::uuid[])) as b
      where v_campana_id is not null and (
        exists (select 1 from public.promociones pr where pr.campana_id = v_campana_id and pr.buyer_id = b)
        or exists (select 1 from public.campanas c where c.id = v_campana_id and c.solicitante_buyer_id = b)
      )
    ));
    v_url := 'consolidado';

  else
    -- DISENO_*: participantes de la página indicada en metadata.paginaId.
    begin
      select * into v_page from public.catalogo_paginas_diseno
      where id = nullif(p_metadata ->> 'paginaId', '')::uuid;
    exception when invalid_text_representation then
      v_page := null;
    end;
    if v_page.id is null then
      raise exception 'La notificación de Diseño requiere una página válida.' using errcode = '22023';
    end if;
    v_recipients := array_remove(array[v_page.disenador_id], null);
    if v_role <> 'BUYER' and v_page.comprador_id is not null then
      v_recipients := v_recipients || public.buyer_user_ids(array[v_page.comprador_id]);
    end if;
    if v_role in ('BUYER', 'DISENADOR') then
      v_recipients := v_recipients || public.role_user_ids(array['MARK']);
    end if;
    v_url := 'catalogDesign';
  end if;

  v_inserted := public.notify_users(
    v_recipients, v_tipo, p_titulo, p_mensaje, v_campana_id, v_url,
    coalesce(p_metadata, '{}'::jsonb), v_promocion_id, v_comentario_uuid, false
  );
  return jsonb_build_object('inserted', v_inserted);
end;
$$;

revoke execute on function public.create_live_notification(
  text, text, text, text, text, text, text[], uuid[], uuid[], text, jsonb
) from public, anon;
grant execute on function public.create_live_notification(
  text, text, text, text, text, text, text[], uuid[], uuid[], text, jsonb
) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Tarea diaria: estados automáticos y aviso único de corte.
-- -----------------------------------------------------------------------------
create or replace function public.run_catalog_daily_jobs(p_today date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := coalesce(p_today, (now() at time zone 'America/Managua')::date);
  v_cat record;
  v_ms record;
  v_prelim date;
  v_precios date;
  v_target text;
  v_estados integer := 0;
  v_avisos integer := 0;
  v_inserted uuid;
begin
  perform set_config('app.cambio_automatico', 'on', true);

  -- 7.1 Estados: solo avanzan, y solo antes del inicio de vigencia.
  for v_cat in
    select * from public.campanas
    where tipo_actividad = 'CATALOGO'
      and estado in ('Borrador', 'Preliminar')
      and fecha_inicio is not null
      and v_today < fecha_inicio
    for update
  loop
    select min(fecha) filter (where hito = 'preliminar'), min(fecha) filter (where hito = 'precios_finales')
      into v_prelim, v_precios
    from public.catalog_milestones(v_cat.canal, v_cat.fecha_inicio);

    v_target := case
      when v_today >= v_precios then 'Precios Finales'
      when v_today >= v_prelim and v_cat.estado = 'Borrador' then 'Preliminar'
    end;
    if v_target is null or v_target = v_cat.estado then
      continue;
    end if;

    -- Los avisos se encienden solo al salir de Borrador; si el admin los
    -- apaga después, este proceso no los vuelve a encender.
    update public.campanas
      set estado = v_target,
          notificaciones_envivo = case when v_cat.estado = 'Borrador' then true else notificaciones_envivo end,
          fecha_estado = now(),
          updated_at = now()
      where id = v_cat.id;

    insert into public.catalogo_eventos_programados (campana_id, tipo, hito, fecha)
    values (v_cat.id, 'ESTADO_AUTO', v_target, v_today)
    on conflict do nothing;
    v_estados := v_estados + 1;
  end loop;

  -- 7.2 Aviso único el mismo día de cada corte.
  for v_cat in
    select * from public.campanas
    where tipo_actividad = 'CATALOGO'
      and fecha_inicio is not null
      and estado not in ('Cerrado', 'Borrador')
      and notificaciones_envivo = true
  loop
    for v_ms in
      select hito, min(etiqueta) as etiqueta, fecha
      from public.catalog_milestones(v_cat.canal, v_cat.fecha_inicio)
      where fecha = v_today
      group by hito, fecha
    loop
      v_inserted := null;
      insert into public.catalogo_eventos_programados (campana_id, tipo, hito, fecha)
      values (v_cat.id, 'AVISO_CORTE', v_ms.hito, v_ms.fecha)
      on conflict do nothing
      returning id into v_inserted;
      if v_inserted is null then
        continue;
      end if;

      perform public.notify_users(
        public.catalog_buyer_user_ids(v_cat.id) || public.role_user_ids(array['MARK']),
        'AVISO_CORTE',
        format('Importante: hoy es el corte de %s', lower(v_ms.etiqueta)),
        format('Catálogo «%s»: hoy %s vence el corte de %s. Inicio de vigencia: %s.',
          coalesce(nullif(btrim(v_cat.nombre_actividad), ''), v_cat.legacy_actividad_id),
          to_char(v_ms.fecha, 'DD/MM/YYYY'), lower(v_ms.etiqueta), to_char(v_cat.fecha_inicio, 'DD/MM/YYYY')),
        v_cat.id, 'home',
        jsonb_build_object('importante', true, 'hito', v_ms.hito, 'fecha', v_ms.fecha)
      );
      v_avisos := v_avisos + 1;
    end loop;
  end loop;

  perform set_config('app.cambio_automatico', '', true);
  return jsonb_build_object('fecha', v_today, 'estados', v_estados, 'avisos', v_avisos);
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. Limpieza: leídos > 30 días, no leídos > 90 días.
-- -----------------------------------------------------------------------------
create or replace function public.cleanup_live_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  delete from public.notificaciones_envivo
  where (leida and coalesce(leida_en, created_at) < now() - interval '30 days')
     or (not leida and created_at < now() - interval '90 days');
  get diagnostics v_count = row_count;

  delete from public.catalogo_eventos_programados where fecha < current_date - 400;
  return v_count;
end;
$$;

-- Funciones internas: sin acceso para usuarios de la app.
revoke all on function public.notify_users(uuid[], text, text, text, uuid, text, jsonb, uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.run_catalog_daily_jobs(date) from public, anon, authenticated;
revoke all on function public.cleanup_live_notifications() from public, anon, authenticated;
revoke all on function public.catalog_buyer_user_ids(uuid) from public, anon, authenticated;
revoke all on function public.catalog_designer_user_ids(uuid) from public, anon, authenticated;
revoke all on function public.role_user_ids(text[]) from public, anon, authenticated;
revoke all on function public.buyer_user_ids(uuid[]) from public, anon, authenticated;
revoke all on function public.catalog_label(uuid) from public, anon, authenticated;
revoke all on function public.campana_id_for_catalog(text) from public, anon, authenticated;
revoke all on function public.notify_catalog_change() from public, anon, authenticated;
revoke all on function public.notify_design_page_assignment() from public, anon, authenticated;
revoke all on function public.notify_design_reply() from public, anon, authenticated;

commit;

-- -----------------------------------------------------------------------------
-- 9. Programación con pg_cron (06:05 UTC = 00:05 America/Managua, UTC-6 fijo).
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron no está habilitado. Habilítelo en Database > Extensions y vuelva a ejecutar este script para programar las tareas.';
    return;
  end if;
  perform cron.unschedule(jobid) from cron.job where jobname in ('catalogos-calendario-diario', 'notificaciones-limpieza-diaria');
  perform cron.schedule('catalogos-calendario-diario', '5 6 * * *', 'select public.run_catalog_daily_jobs()');
  perform cron.schedule('notificaciones-limpieza-diaria', '20 8 * * *', 'select public.cleanup_live_notifications()');
end;
$$;

-- Verificación manual (no modifica nada si se ejecuta con una fecha pasada ya procesada):
--   select public.run_catalog_daily_jobs(current_date);
--   select jobname, schedule, active from cron.job;
--   select * from public.catalogo_eventos_programados order by creado_en desc limit 20;
