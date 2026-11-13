-- =====================================================================
-- supabase_g_comercial_notificaciones_especiales.sql
-- Avisos de promociones en solicitudes especiales: van a Ejecutor y Admin.
--
-- Problema: al crear una solicitud especial o cargarle promociones, la app
-- pide el aviso PROMOCION_* ("Nuevas promociones"). create_live_notification
-- busca el diseñador de la página y, como las especiales no tienen diseño,
-- caía al respaldo: todo Mercadeo (MARK). Mercadeo ya no ve especiales.
--
-- Cambio: si la actividad es tipo ESPECIAL (incluye Fidelización FID-...),
-- los avisos COMENTARIO_COMPRAS van a los usuarios activos con rol OPER y
-- ADMIN (sin el autor) y abren el módulo Solicitudes.
-- Actualización 03-11-2026: cargar, editar, anular o eliminar promociones de
-- una solicitud especial o de Fidelización (PROMOCION_*) ya no genera aviso
-- ni correo. En solicitudes se avisa por cambio de estado (ver
-- supabase_g_comercial_notificaciones_estados_solicitud.sql).
-- Catálogos: sin cambios (diseñador de la página → diseñadores → Mercadeo).
-- Diseño: sin cambios; sigue respetando "Notificaciones en vivo" del catálogo.
-- El aviso "Nueva solicitud especial" (SOLICITUD_NUEVA, configurable en
-- Ajustes > Notificaciones) no cambia.
--
-- Esquema: g_comercial.
-- Requiere: supabase_g_comercial_consolidado.sql (notificaciones v2, paso 24+).
-- Reemplaza: g_comercial.create_live_notification (misma firma y permisos).
-- Repetible: sí. Destructivo: no (solo reemplaza una función; no borra datos ni avisos).
-- Si se vuelve a ejecutar el consolidado, ejecutar de nuevo este script.
-- =====================================================================
begin;

create or replace function g_comercial.create_live_notification(
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
  v_actor g_comercial.usuarios_app%rowtype;
  v_role text;
  v_tipo text := upper(btrim(coalesce(p_tipo_evento, '')));
  v_campana_id uuid;
  v_promocion_id uuid;
  v_comentario_uuid uuid;
  v_row_ids text[];
  v_recipients uuid[] := array[]::uuid[];
  v_page g_comercial.catalogo_paginas_diseno%rowtype;
  v_url text := coalesce(p_url_modulo, '');
  v_inserted integer;
  v_es_especial boolean := false;
begin
  select * into v_actor from g_comercial.usuarios_app
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

  v_campana_id := g_comercial.campana_id_for_catalog(p_legacy_actividad_id);
  if v_campana_id is not null and not exists (
    select 1 from g_comercial.campanas where id = v_campana_id and notificaciones_envivo = true
  ) then
    return jsonb_build_object('inserted', 0, 'skipped', 'disabled_for_campaign');
  end if;

  if v_campana_id is not null and coalesce(btrim(p_legacy_row_id), '') <> '' then
    select id into v_promocion_id from g_comercial.promociones
    where campana_id = v_campana_id and legacy_row_id = btrim(p_legacy_row_id)
    limit 1;
  end if;

  if v_tipo like 'COMENTARIO_%' and coalesce(btrim(p_comentario_id), '') <> '' then
    begin
      v_comentario_uuid := btrim(p_comentario_id)::uuid;
    exception when invalid_text_representation then
      select id into v_comentario_uuid from g_comercial.comentarios
      where legacy_comentario_id = btrim(p_comentario_id) limit 1;
    end;
  end if;

  if v_campana_id is not null then
    select c.tipo_actividad = 'ESPECIAL' into v_es_especial
    from g_comercial.campanas c where c.id = v_campana_id;
    v_es_especial := coalesce(v_es_especial, false);
  end if;

  if v_es_especial and v_tipo like 'PROMOCION_%' then
    -- Solicitudes especiales (y Fidelización): cargar o editar promociones no
    -- avisa; los avisos de solicitudes son por cambio de estado.
    return jsonb_build_object('inserted', 0, 'skipped', 'special_request_promotions');
  end if;

  if v_es_especial and v_tipo = 'COMENTARIO_COMPRAS' then
    -- Solicitudes especiales (y Fidelización): no tienen diseñador ni las ve
    -- Mercadeo. El aviso va a Ejecutor (OPER) y Administración.
    v_recipients := g_comercial.role_user_ids(array['OPER', 'ADMIN']);
    v_url := 'solicitudes';

  elsif v_tipo like 'PROMOCION_%' or v_tipo = 'COMENTARIO_COMPRAS' then
    -- Diseñador de la página de cada promoción; si falta, diseñadores del
    -- catálogo; si el catálogo no tiene diseñadores, Mercadeo.
    v_row_ids := array(
      select jsonb_array_elements_text(case when jsonb_typeof(p_metadata -> 'rowIds') = 'array' then p_metadata -> 'rowIds' else '[]'::jsonb end)
      union select btrim(p_legacy_row_id) where coalesce(btrim(p_legacy_row_id), '') <> ''
    );

    if v_campana_id is not null then
      select coalesce(array_agg(distinct pag.disenador_id), array[]::uuid[]) into v_recipients
      from g_comercial.promociones pr
      join g_comercial.campanas c on c.id = pr.campana_id
      join g_comercial.catalogo_proyecto_diseno p on p.catalogo_id in (c.legacy_actividad_id, c.id::text) and coalesce(p.estado, '') <> 'cancelado'
      join g_comercial.catalogo_paginas_diseno pag on pag.proyecto_id = p.id and pag.numero_pagina = pr.numero_pagina
      join g_comercial.usuarios_app u on u.id = pag.disenador_id and u.activo = true
      where pr.campana_id = v_campana_id
        and pr.legacy_row_id = any(v_row_ids);

      if cardinality(v_row_ids) = 0 or exists (
        select 1 from unnest(v_row_ids) as rid(legacy_row_id)
        where not exists (
          select 1
          from g_comercial.promociones pr
          join g_comercial.campanas c on c.id = pr.campana_id
          join g_comercial.catalogo_proyecto_diseno p on p.catalogo_id in (c.legacy_actividad_id, c.id::text) and coalesce(p.estado, '') <> 'cancelado'
          join g_comercial.catalogo_paginas_diseno pag on pag.proyecto_id = p.id and pag.numero_pagina = pr.numero_pagina
          join g_comercial.usuarios_app u on u.id = pag.disenador_id and u.activo = true
          where pr.campana_id = v_campana_id and pr.legacy_row_id = rid.legacy_row_id
        )
      ) then
        v_recipients := v_recipients || g_comercial.catalog_designer_user_ids(v_campana_id);
      end if;
    end if;

    v_url := 'catalogDesign';

    -- Comentario de Compras: además, Mercadeo que ya participa en esa
    -- conversación (misma promoción o comentario general de la actividad).
    if v_tipo = 'COMENTARIO_COMPRAS' and v_campana_id is not null then
      v_recipients := v_recipients || coalesce((
        select array_agg(distinct co.usuario_id)
        from g_comercial.comentarios co
        join g_comercial.usuarios_app u on u.id = co.usuario_id and u.activo = true and upper(u.rol) in ('MARK', 'ADMIN')
        where co.campana_id = v_campana_id
          and (
            (v_promocion_id is not null and co.promocion_id = v_promocion_id)
            or (v_promocion_id is null and co.alcance_comentario = 'ACTIVIDAD')
          )
      ), array[]::uuid[]);
      v_url := 'consolidado';
    end if;

    if cardinality(v_recipients) = 0 then
      v_recipients := g_comercial.role_user_ids(array['MARK']);
      v_url := 'consolidado';
    end if;

  elsif v_tipo = 'COMENTARIO_MERCADEO' then
    -- Solo compradores con promociones en la actividad o el solicitante.
    v_recipients := g_comercial.buyer_user_ids(array(
      select b from unnest(coalesce(p_destinatario_buyer_ids, array[]::uuid[])) as b
      where v_campana_id is not null and (
        exists (select 1 from g_comercial.promociones pr where pr.campana_id = v_campana_id and pr.buyer_id = b)
        or exists (select 1 from g_comercial.campanas c where c.id = v_campana_id and c.solicitante_buyer_id = b)
      )
    ));
    v_url := 'consolidado';

  else
    -- DISENO_*: participantes de la página indicada en metadata.paginaId.
    begin
      select * into v_page from g_comercial.catalogo_paginas_diseno
      where id = nullif(p_metadata ->> 'paginaId', '')::uuid;
    exception when invalid_text_representation then
      v_page := null;
    end;
    if v_page.id is null then
      raise exception 'La notificación de Diseño requiere una página válida.' using errcode = '22023';
    end if;
    v_recipients := array_remove(array[v_page.disenador_id], null);
    if v_role <> 'BUYER' and v_page.comprador_id is not null then
      v_recipients := v_recipients || g_comercial.buyer_user_ids(array[v_page.comprador_id]);
    end if;
    if v_role in ('BUYER', 'DISENADOR') then
      v_recipients := v_recipients || g_comercial.role_user_ids(array['MARK']);
    end if;
    v_url := 'catalogDesign';
  end if;

  v_inserted := g_comercial.notify_users(
    v_recipients, v_tipo, p_titulo, p_mensaje, v_campana_id, v_url,
    coalesce(p_metadata, '{}'::jsonb), v_promocion_id, v_comentario_uuid, false
  );
  return jsonb_build_object('inserted', v_inserted);
end;
$$;

revoke execute on function g_comercial.create_live_notification(
  text, text, text, text, text, text, text[], uuid[], uuid[], text, jsonb
) from public, anon;
grant execute on function g_comercial.create_live_notification(
  text, text, text, text, text, text, text[], uuid[], uuid[], text, jsonb
) to authenticated;

commit;

-- Verificación (ejecutar aparte): debe devolver true.
-- select pg_get_functiondef('g_comercial.create_live_notification(text, text, text, text, text, text, text[], uuid[], uuid[], text, jsonb)'::regprocedure)
--        like '%v_es_especial%';
