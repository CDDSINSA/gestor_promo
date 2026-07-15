-- Guardado transaccional para el Sistema de Gestion de Promociones Retail.
-- Ejecutar en Supabase SQL Editor despues de:
-- 1. docs/supabase_schema.sql
-- 2. docs/supabase_delta_operativo_2026_06_22.sql
-- 3. docs/supabase_roles_permissions_mvp.sql
--
-- La app llama esta funcion por RPC. PostgreSQL ejecuta la funcion completa
-- dentro de una sola transaccion: si una sentencia falla, no queda guardado parcial.

create table if not exists public.save_operations (
  operation_id text primary key,
  auth_user_id uuid,
  operation_type text not null default '',
  payload_hash text not null default '',
  response jsonb,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create or replace function public.save_catalog_transactional(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.current_user_role();
  v_current_buyer_id uuid := public.current_buyer_id();
  v_is_admin boolean := v_role = 'ADMIN';
  v_is_buyer boolean := v_role = 'BUYER';
  v_can_write_operational boolean := v_role in ('ADMIN', 'BUYER');
  v_can_write_comments boolean := v_role in ('ADMIN', 'BUYER', 'MARK');

  v_promo_sync jsonb := coalesce(p_payload #> '{sync_options,promociones}', p_payload #> '{sync_options,promotions}');
  v_buyer_sync jsonb := coalesce(p_payload #> '{sync_options,compradores}', p_payload #> '{sync_options,buyers}');
  v_activity_sync jsonb := coalesce(p_payload #> '{sync_options,actividades}', p_payload #> '{sync_options,activities}');
  v_comment_sync jsonb := coalesce(p_payload #> '{sync_options,comentarios}', p_payload #> '{sync_options,comments}');
  v_log_sync jsonb := p_payload #> '{sync_options,logs}';
  v_avance_sync jsonb := coalesce(p_payload #> '{sync_options,avances_catalogo}', p_payload #> '{sync_options,avancesCatalogo}');
  v_responsable_sync jsonb := coalesce(p_payload #> '{sync_options,responsables_solicitudes}', p_payload #> '{sync_options,responsablesSolicitudes}');
  v_jerarquia_sync jsonb := coalesce(p_payload #> '{sync_options,jerarquia_categorias}', p_payload #> '{sync_options,jerarquiaCategorias}');
  v_segmento_sync jsonb := coalesce(p_payload #> '{sync_options,segmentos_clientes}', p_payload #> '{sync_options,segmentosClientes}');
  v_notificacion_sync jsonb := coalesce(p_payload #> '{sync_options,notificaciones}', p_payload #> '{sync_options,notifications}');
  v_operation_id text := nullif(coalesce(p_payload ->> 'operation_id', p_payload ->> 'operationId', p_payload ->> 'client_operation_id'), '');
  v_operation_response jsonb;

  v_changed_promos text[] := array(select jsonb_array_elements_text(coalesce(v_promo_sync -> 'changed_row_ids', v_promo_sync -> 'changedRowIds', '[]'::jsonb)));
  v_deleted_promos text[] := array(select jsonb_array_elements_text(coalesce(v_promo_sync -> 'deleted_row_ids', v_promo_sync -> 'deletedRowIds', '[]'::jsonb)));
  v_changed_buyers text[] := array(select jsonb_array_elements_text(coalesce(v_buyer_sync -> 'changed_ids', v_buyer_sync -> 'changedIds', '[]'::jsonb)));
  v_changed_activities text[] := array(select jsonb_array_elements_text(coalesce(v_activity_sync -> 'changed_ids', v_activity_sync -> 'changedIds', '[]'::jsonb)));
  v_changed_comments text[] := array(select jsonb_array_elements_text(coalesce(v_comment_sync -> 'changed_ids', v_comment_sync -> 'changedIds', '[]'::jsonb)));
  v_changed_logs text[] := array(select jsonb_array_elements_text(coalesce(v_log_sync -> 'changed_ids', v_log_sync -> 'changedIds', '[]'::jsonb)));
  v_changed_avances text[] := array(select jsonb_array_elements_text(coalesce(v_avance_sync -> 'changed_ids', v_avance_sync -> 'changedIds', '[]'::jsonb)));
  v_changed_responsables text[] := array(select jsonb_array_elements_text(coalesce(v_responsable_sync -> 'changed_ids', v_responsable_sync -> 'changedIds', '[]'::jsonb)));
  v_changed_jerarquia text[] := array(select jsonb_array_elements_text(coalesce(v_jerarquia_sync -> 'changed_ids', v_jerarquia_sync -> 'changedIds', '[]'::jsonb)));
  v_changed_segmentos text[] := array(select jsonb_array_elements_text(coalesce(v_segmento_sync -> 'changed_ids', v_segmento_sync -> 'changedIds', '[]'::jsonb)));
  v_changed_notificaciones text[] := array(select jsonb_array_elements_text(coalesce(v_notificacion_sync -> 'changed_ids', v_notificacion_sync -> 'changedIds', '[]'::jsonb)));

  v_row jsonb;
  v_catalogo jsonb;
  v_id text;
  v_buyer_id uuid;
  v_campana_id uuid;
  v_promo_id uuid;
  v_comentario_id uuid;
  v_alcance text;
  v_count_promos integer := 0;
  v_count_comments integer := 0;
  v_count_avances integer := 0;
  v_count_logs integer := 0;
begin
  if v_role is null then
    raise exception 'No hay usuario activo autorizado para guardar en Supabase.';
  end if;

  if not (v_can_write_operational or v_can_write_comments) then
    raise exception 'Su rol no tiene permisos para guardar cambios en Supabase.';
  end if;

  if v_operation_id is not null then
    insert into public.save_operations (operation_id, auth_user_id, operation_type, payload_hash)
    values (
      v_operation_id,
      auth.uid(),
      coalesce(p_payload ->> 'operation_type', ''),
      md5(p_payload::text)
    )
    on conflict (operation_id) do nothing;

    if not found then
      select response into v_operation_response
      from public.save_operations
      where operation_id = v_operation_id
      limit 1;

      if v_operation_response is not null then
        return v_operation_response || jsonb_build_object('idempotent_replay', true);
      end if;

      raise exception 'La operacion de guardado % ya esta en proceso. Espere a que finalice antes de intentar nuevamente.', v_operation_id;
    end if;
  end if;

  -- Compradores: solo ADMIN.
  if v_is_admin then
    for v_row in select value from jsonb_array_elements(coalesce(p_payload -> 'compradores', '[]'::jsonb)) loop
      v_id := coalesce(nullif(v_row ->> 'comprador', ''), nullif(v_row ->> 'nombre', ''));
      if v_id <> '' and (v_buyer_sync is null or v_id = any(v_changed_buyers)) then
        insert into public.compradores (comprador_id, categoria_comprador, comprador, division, correo, senior_id, activo)
        values (
          nullif(v_row ->> 'comprador_id', ''),
          coalesce(nullif(v_row ->> 'categoria_comprador', ''), 'Senior'),
          v_id,
          coalesce(v_row ->> 'division', ''),
          coalesce(v_row ->> 'correo', ''),
          coalesce(v_row ->> 'senior_id', ''),
          coalesce(nullif(v_row ->> 'activo', '')::boolean, true)
        )
        on conflict (comprador) do update set
          comprador_id = excluded.comprador_id,
          categoria_comprador = excluded.categoria_comprador,
          division = excluded.division,
          correo = excluded.correo,
          senior_id = excluded.senior_id,
          activo = excluded.activo,
          updated_at = now();
      end if;
    end loop;
  end if;

  -- Campanas / actividades.
  if v_can_write_operational then
    for v_row in select value from jsonb_array_elements(coalesce(p_payload -> 'actividades', '[]'::jsonb)) loop
      v_id := coalesce(nullif(v_row ->> 'actividad_id', ''), nullif(v_row ->> 'catalogo_id', ''));
      if v_id = '' or (v_activity_sync is not null and not v_id = any(v_changed_activities)) then
        continue;
      end if;

      select c.id into v_buyer_id
      from public.compradores c
      where c.comprador = coalesce(nullif(v_row ->> 'solicitante', ''), nullif(v_row ->> 'comprador', ''))
      limit 1;

      if v_is_buyer and v_buyer_id is distinct from v_current_buyer_id then
        continue;
      end if;

      select value into v_catalogo
      from jsonb_array_elements(coalesce(p_payload -> 'catalogos', '[]'::jsonb))
      where coalesce(value ->> 'catalogo_id', value ->> 'id') = v_id
      limit 1;

      insert into public.campanas (
        legacy_actividad_id, tipo_actividad, nombre_actividad, canal, fecha_inicio, fecha_fin,
        solicitante_buyer_id, estado, motivo_solicitud, color, doc_id, token_conexion,
        notificaciones, correos, comprador, responsable, recursos_ocupados, fecha_estado,
        fecha_nuevo, fecha_aprovado, fecha_entrabajo, fecha_finalizado, fecha_asignado,
        fecha_trabajando, fecha_resuelto, tiempo_nuevo_horas, tiempo_aprovado_horas,
        tiempo_entrabajo_horas, tiempo_finalizado_horas, tiempo_asignado_horas,
        tiempo_trabajando_horas, tiempo_resuelto_horas, tiempo_total_horas, promo_ids,
        oferta_ids, divisiones
      )
      values (
        v_id,
        coalesce(nullif(v_row ->> 'tipo_actividad', ''), 'CATALOGO'),
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
        coalesce(v_catalogo ->> 'correos', ''),
        coalesce(nullif(v_row ->> 'comprador', ''), nullif(v_row ->> 'solicitante', ''), ''),
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
        solicitante_buyer_id = excluded.solicitante_buyer_id,
        estado = excluded.estado,
        motivo_solicitud = excluded.motivo_solicitud,
        color = excluded.color,
        doc_id = excluded.doc_id,
        token_conexion = excluded.token_conexion,
        notificaciones = excluded.notificaciones,
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
    delete from public.comentarios c
    using public.promociones p
    where c.promocion_id = p.id and p.legacy_row_id = any(v_deleted_promos);

    delete from public.promociones_detalle d
    using public.promociones p
    where d.promocion_id = p.id and p.legacy_row_id = any(v_deleted_promos);

    delete from public.promociones p
    where p.legacy_row_id = any(v_deleted_promos)
      and (v_is_admin or p.buyer_id = v_current_buyer_id);
  end if;

  -- Promociones principales.
  if v_can_write_operational then
    for v_row in select value from jsonb_array_elements(coalesce(p_payload -> 'promociones', '[]'::jsonb)) loop
      v_id := coalesce(nullif(v_row ->> 'row_id', ''), nullif(v_row ->> 'id', ''));
      if v_id = '' or (v_promo_sync is not null and not v_id = any(v_changed_promos)) then
        continue;
      end if;

      select id into v_campana_id from public.campanas where legacy_actividad_id = v_row ->> 'actividad_id' limit 1;
      select id into v_buyer_id from public.compradores where comprador = v_row ->> 'comprador' limit 1;

      if v_campana_id is null then
        raise exception 'Promocion % sin campana valida (%).', v_id, v_row ->> 'actividad_id';
      end if;
      if v_buyer_id is null then
        raise exception 'Promocion % sin comprador valido (%).', v_id, v_row ->> 'comprador';
      end if;
      if v_is_buyer and v_buyer_id is distinct from v_current_buyer_id then
        continue;
      end if;
      if coalesce(v_row ->> 'sku', '') = '' then
        raise exception 'Promocion % sin SKU.', v_id;
      end if;

      insert into public.promociones (
        legacy_row_id, campana_id, oferta_id, buyer_id, tipo_promo, grupo_oferta, tipo_sku,
        variante, sku, num_parte, descripcion, tipo_cantidad, cantidad_minima, precio_antes,
        precio_ahora, descuento, comentario_comprador, aplica_segmento, segmento_cliente,
        alcance_tipo, alcance_valor, estado_registro, dep_id, ultima_modificacion_por
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
        coalesce(v_row ->> 'ultima_modificacion_por', '')
      )
      on conflict (legacy_row_id) do update set
        campana_id = excluded.campana_id,
        oferta_id = excluded.oferta_id,
        buyer_id = excluded.buyer_id,
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
        ultima_modificacion_por = excluded.ultima_modificacion_por,
        updated_at = now();

      v_count_promos := v_count_promos + 1;
    end loop;
  end if;

  -- Detalles: reemplazo completo de detalles de promociones modificadas.
  if v_can_write_operational and array_length(v_changed_promos, 1) is not null then
    delete from public.promociones_detalle d
    using public.promociones p
    where d.promocion_id = p.id and p.legacy_row_id = any(v_changed_promos);
  end if;

  if v_can_write_operational then
    for v_row in select value from jsonb_array_elements(coalesce(p_payload -> 'promociones_detalle', '[]'::jsonb)) loop
      v_id := coalesce(nullif(v_row ->> 'row_id', ''), nullif(v_row ->> 'rowId', ''));
      if v_id = '' or (v_promo_sync is not null and not v_id = any(v_changed_promos)) then
        continue;
      end if;

      select id into v_promo_id from public.promociones where legacy_row_id = v_id limit 1;
      if v_promo_id is not null and coalesce(v_row ->> 'campo', '') <> '' then
        insert into public.promociones_detalle (promocion_id, campo, valor)
        values (v_promo_id, v_row ->> 'campo', coalesce(v_row ->> 'valor', ''))
        on conflict (promocion_id, campo) do update set valor = excluded.valor, updated_at = now();
      end if;
    end loop;
  end if;

  -- Comentarios: MARK puede escribir comentarios aunque no promociones.
  if v_can_write_comments then
    for v_row in select value from jsonb_array_elements(coalesce(p_payload -> 'comentarios', '[]'::jsonb)) loop
      v_id := coalesce(nullif(v_row ->> 'comentario_id', ''), nullif(v_row ->> 'comentarioId', ''), nullif(v_row ->> 'id', ''));
      if v_id = '' or (v_comment_sync is not null and not v_id = any(v_changed_comments)) then
        continue;
      end if;

      v_alcance := coalesce(nullif(v_row ->> 'alcance_comentario', ''), case when coalesce(v_row ->> 'row_id', '') <> '' then 'LINEA' else 'ACTIVIDAD' end);
      v_promo_id := null;
      v_campana_id := null;

      if v_alcance = 'LINEA' then
        select id, campana_id into v_promo_id, v_campana_id
        from public.promociones
        where legacy_row_id = v_row ->> 'row_id'
        limit 1;
      else
        select id into v_campana_id
        from public.campanas
        where legacy_actividad_id = v_row ->> 'actividad_id'
        limit 1;
      end if;

      if coalesce(v_row ->> 'comentario', '') = '' or (v_promo_id is null and v_campana_id is null) then
        continue;
      end if;

      select id into v_comentario_id
      from public.comentarios
      where legacy_comentario_id = v_id
      limit 1;

      if v_comentario_id is null then
        insert into public.comentarios (
          legacy_comentario_id, promocion_id, campana_id, legacy_row_id, alcance_comentario,
          prioridad, usuario, tipo_usuario, comentario, estado, fecha, fecha_resolucion
        )
        values (
          v_id, v_promo_id, v_campana_id, coalesce(v_row ->> 'row_id', ''), v_alcance,
          coalesce(nullif(v_row ->> 'prioridad', ''), 'MEDIA'), coalesce(v_row ->> 'usuario', ''),
          coalesce(v_row ->> 'tipo_usuario', ''), v_row ->> 'comentario',
          upper(coalesce(nullif(v_row ->> 'estado', ''), 'ABIERTO')),
          coalesce(nullif(v_row ->> 'fecha', '')::timestamptz, now()),
          nullif(v_row ->> 'fecha_resolucion', '')::timestamptz
        );
      else
        update public.comentarios set
          promocion_id = v_promo_id,
          campana_id = v_campana_id,
          legacy_row_id = coalesce(v_row ->> 'row_id', ''),
          alcance_comentario = v_alcance,
          prioridad = coalesce(nullif(v_row ->> 'prioridad', ''), 'MEDIA'),
          usuario = coalesce(v_row ->> 'usuario', ''),
          tipo_usuario = coalesce(v_row ->> 'tipo_usuario', ''),
          comentario = v_row ->> 'comentario',
          estado = upper(coalesce(nullif(v_row ->> 'estado', ''), 'ABIERTO')),
          fecha = coalesce(nullif(v_row ->> 'fecha', '')::timestamptz, fecha),
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

      select id into v_campana_id from public.campanas where legacy_actividad_id = v_row ->> 'catalogo_id' limit 1;
      select id into v_buyer_id from public.compradores where comprador = v_row ->> 'comprador' limit 1;
      if v_is_buyer and v_buyer_id is distinct from v_current_buyer_id then
        continue;
      end if;

      insert into public.avances_catalogo (
        avance_id, campana_id, catalogo_id, catalogo, comprador_id, buyer_id,
        comprador, division, estado, fecha_estado, usuario
      )
      values (
        v_id, v_campana_id, coalesce(v_row ->> 'catalogo_id', ''), coalesce(v_row ->> 'catalogo', ''),
        coalesce(v_row ->> 'comprador_id', ''), v_buyer_id, coalesce(v_row ->> 'comprador', ''),
        coalesce(v_row ->> 'division', ''), coalesce(nullif(v_row ->> 'estado', ''), 'Pendiente'),
        coalesce(nullif(v_row ->> 'fecha_estado', '')::timestamptz, now()), coalesce(v_row ->> 'usuario', '')
      )
      on conflict (avance_id) do update set
        campana_id = excluded.campana_id,
        catalogo_id = excluded.catalogo_id,
        catalogo = excluded.catalogo,
        comprador_id = excluded.comprador_id,
        buyer_id = excluded.buyer_id,
        comprador = excluded.comprador,
        division = excluded.division,
        estado = excluded.estado,
        fecha_estado = excluded.fecha_estado,
        usuario = excluded.usuario,
        updated_at = now();

      v_count_avances := v_count_avances + 1;
    end loop;
  end if;

  -- Logs no deben impedir guardado.
  if v_can_write_operational then
    begin
      for v_row in select value from jsonb_array_elements(coalesce(p_payload -> 'logs', '[]'::jsonb)) loop
        v_id := coalesce(nullif(v_row ->> 'log_id', ''), nullif(v_row ->> 'id', ''));
        if v_id = '' or (v_log_sync is not null and not v_id = any(v_changed_logs)) then
          continue;
        end if;
        if exists (select 1 from public.logs where request_id = v_id) then
          continue;
        end if;

        v_promo_id := null;
        v_campana_id := null;
        select id, campana_id into v_promo_id, v_campana_id
        from public.promociones
        where legacy_row_id = v_row ->> 'row_id'
        limit 1;
        if v_campana_id is null then
          select id into v_campana_id from public.campanas where legacy_actividad_id = v_row ->> 'catalogo' limit 1;
        end if;

        if coalesce(v_row ->> 'accion', '') <> '' then
          insert into public.logs (
            usuario, entidad, campana_id, promocion_id, accion, campo,
            valor_anterior, valor_nuevo, request_id, created_at, fecha_cierre
          )
          values (
            coalesce(v_row ->> 'usuario', ''), 'PROMOCIONES', v_campana_id, v_promo_id,
            v_row ->> 'accion', coalesce(v_row ->> 'campo', ''), coalesce(v_row ->> 'valor_anterior', ''),
            coalesce(v_row ->> 'valor_nuevo', ''), v_id, coalesce(nullif(v_row ->> 'fecha', '')::timestamptz, now()),
            nullif(v_row ->> 'fecha_cierre', '')::timestamptz
          );
          v_count_logs := v_count_logs + 1;
        end if;
      end loop;
    exception when others then
      null;
    end;
  end if;

  v_operation_response := jsonb_build_object(
    'sync_mode', 'delta',
    'saved_at', now(),
    'transactional', true,
    'operation_id', v_operation_id,
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
        finished_at = now()
    where operation_id = v_operation_id;
  end if;

  return v_operation_response;
end;
$$;

grant execute on function public.save_catalog_transactional(jsonb) to authenticated;
