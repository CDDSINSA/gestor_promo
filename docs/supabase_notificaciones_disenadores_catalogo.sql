-- ============================================================================
-- MIGRACION: Notificaciones en vivo dirigidas a diseñadores por catálogo
-- ============================================================================
-- Cuando un comprador agregue, modifique, anule o elimine promociones (o agregue comentarios),
-- esta función identifica a los diseñadores asignados a las páginas de dicho catálogo
-- y envía la notificación exclusivamente a ellos (url_modulo: 'catalogDesign').
--
-- FALLBACK INTELIGENTE:
-- Si el catálogo aún no tiene páginas con diseñadores asignados, la notificación
-- se mantiene dirigida a todo Mercadeo (rol 'MARK') para asegurar trazabilidad.
-- ============================================================================

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
  v_campana_id uuid;
  v_promocion_id uuid;
  v_comentario_uuid uuid;
  v_inserted integer := 0;
  v_has_catalog_designers boolean := false;
begin
  select *
    into v_actor
  from public.usuarios_app
  where auth_user_id = auth.uid()
    and activo = true
  limit 1;

  if v_actor.id is null then
    raise exception 'Usuario no autorizado para crear notificaciones en vivo.'
      using errcode = '42501';
  end if;

  if coalesce(trim(p_titulo), '') = '' or coalesce(trim(p_tipo_evento), '') = '' then
    raise exception 'tipo_evento y titulo son obligatorios.'
      using errcode = '22023';
  end if;

  if coalesce(trim(p_legacy_actividad_id), '') <> '' then
    select id
      into v_campana_id
    from public.campanas
    where legacy_actividad_id = trim(p_legacy_actividad_id)
    limit 1;
  end if;

  if v_campana_id is not null then
    perform 1
    from public.campanas
    where id = v_campana_id
      and notificaciones_envivo = true;

    if not found then
      return jsonb_build_object('inserted', 0, 'skipped', 'disabled_for_campaign');
    end if;
  end if;

  if v_campana_id is not null and coalesce(trim(p_legacy_row_id), '') <> '' then
    select id
      into v_promocion_id
    from public.promociones
    where campana_id = v_campana_id
      and legacy_row_id = trim(p_legacy_row_id)
    limit 1;
  end if;

  if coalesce(trim(p_comentario_id), '') <> '' then
    begin
      v_comentario_uuid := trim(p_comentario_id)::uuid;
    exception when invalid_text_representation then
      select id
        into v_comentario_uuid
      from public.comentarios
      where legacy_comentario_id = trim(p_comentario_id)
      limit 1;
    end;
  end if;

  -- Comprobar si hay diseñadores asignados a las páginas de este catálogo
  if (coalesce(trim(p_legacy_actividad_id), '') <> '' or v_campana_id is not null)
     and ('MARK' = any(coalesce(p_destinatario_roles, array[]::text[])))
     and (p_tipo_evento like 'PROMOCION_%' or p_tipo_evento = 'COMENTARIO_COMPRAS') then

    perform 1
    from public.catalogo_proyecto_diseno p
    join public.catalogo_paginas_diseno pag on pag.proyecto_id = p.id
    join public.usuarios_app u on u.id = pag.disenador_id
    where (
      p.catalogo_id = trim(p_legacy_actividad_id)
      or (v_campana_id is not null and (
        p.catalogo_id = v_campana_id::text
        or p.catalogo_id = (select legacy_actividad_id from public.campanas where id = v_campana_id limit 1)
      ))
    )
    and pag.disenador_id is not null
    and u.activo = true
    and u.id <> v_actor.id;

    v_has_catalog_designers := found;
  end if;

  with role_targets as (
    select
      u.id as usuario_id,
      u.rol as destinatario_rol,
      coalesce(p_url_modulo, '') as target_url_modulo
    from public.usuarios_app u
    where u.activo = true
      and u.id <> v_actor.id
      and upper(u.rol) = any(coalesce(p_destinatario_roles, array[]::text[]))
      -- Si el catálogo tiene diseñadores asignados, no se emite el broadcast general a MARK
      and not (v_has_catalog_designers = true and upper(u.rol) = 'MARK')
  ),
  catalog_designer_targets as (
    select distinct
      u.id as usuario_id,
      u.rol as destinatario_rol,
      'catalogDesign'::text as target_url_modulo
    from public.catalogo_proyecto_diseno p
    join public.catalogo_paginas_diseno pag on pag.proyecto_id = p.id
    join public.usuarios_app u on u.id = pag.disenador_id
    where (
      p.catalogo_id = trim(p_legacy_actividad_id)
      or (v_campana_id is not null and (
        p.catalogo_id = v_campana_id::text
        or p.catalogo_id = (select legacy_actividad_id from public.campanas where id = v_campana_id limit 1)
      ))
    )
    and pag.disenador_id is not null
    and u.activo = true
    and u.id <> v_actor.id
    and v_has_catalog_designers = true
  ),
  direct_targets as (
    select
      u.id as usuario_id,
      u.rol as destinatario_rol,
      coalesce(p_url_modulo, '') as target_url_modulo
    from public.usuarios_app u
    where u.activo = true
      and u.id <> v_actor.id
      and u.id = any(coalesce(p_destinatario_usuario_ids, array[]::uuid[]))
  ),
  buyer_targets as (
    select
      u.id as usuario_id,
      u.rol as destinatario_rol,
      coalesce(p_url_modulo, '') as target_url_modulo
    from public.usuarios_app u
    where u.activo = true
      and u.id <> v_actor.id
      and u.buyer_id = any(coalesce(p_destinatario_buyer_ids, array[]::uuid[]))
  ),
  targets as (
    select distinct on (usuario_id)
      usuario_id,
      destinatario_rol,
      target_url_modulo
    from (
      select * from direct_targets
      union all
      select * from buyer_targets
      union all
      select * from catalog_designer_targets
      union all
      select * from role_targets
    ) recipients
    order by usuario_id
  ),
  inserted_rows as (
    insert into public.notificaciones_envivo (
      destinatario_usuario_id,
      destinatario_rol,
      actor_usuario_id,
      actor_nombre,
      actor_rol,
      campana_id,
      promocion_id,
      comentario_id,
      tipo_evento,
      titulo,
      mensaje,
      url_modulo,
      metadata
    )
    select
      usuario_id,
      destinatario_rol,
      v_actor.id,
      v_actor.nombre,
      v_actor.rol,
      v_campana_id,
      v_promocion_id,
      v_comentario_uuid,
      trim(p_tipo_evento),
      trim(p_titulo),
      coalesce(p_mensaje, ''),
      target_url_modulo,
      coalesce(p_metadata, '{}'::jsonb)
    from targets
    returning id
  )
  select count(*) into v_inserted
  from inserted_rows;

  return jsonb_build_object('inserted', v_inserted);
end;
$$;

revoke execute on function public.create_live_notification(
  text, text, text, text, text, text, text[], uuid[], uuid[], text, jsonb
) from public;
revoke execute on function public.create_live_notification(
  text, text, text, text, text, text, text[], uuid[], uuid[], text, jsonb
) from anon;
grant execute on function public.create_live_notification(
  text, text, text, text, text, text, text[], uuid[], uuid[], text, jsonb
) to authenticated;
