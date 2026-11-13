-- =====================================================================
-- supabase_g_comercial_fidelizacion_buyer_id.sql
-- Fidelización: el dueño de cada SKU del canasto se guarda por ID de comprador
-- (buyer_id -> compradores.id) en lugar del nombre.
--
-- Esquema: g_comercial.
-- Requiere: supabase_g_comercial_consolidado.sql (incluye canasto, conciliación ORCE
--           y permisos de Administrador de Fidelización).
-- Repetible: sí (si ya se aplicó, no hace nada nuevo).
-- Destructivo: SÍ. Elimina la columna de texto "comprador" de canasto_fidelizacion
--              y de fidelizacion_solicitudes_detalle después de copiarla a buyer_id.
--              Reversa: supabase_g_comercial_fidelizacion_buyer_id_rollback.sql
--              (recupera el nombre desde compradores).
-- Si se vuelve a ejecutar supabase_g_comercial_consolidado.sql o parte1/parte2,
-- ejecutar de nuevo este script: reinstalarían las funciones por nombre.
--
-- Qué cambia:
--   * Nueva columna buyer_id (uuid, FK a compradores.id) en el canasto y en el
--     detalle de solicitudes, con índice.
--   * Se llena buyer_id a partir del nombre actual (comprador o comprador_id).
--     En el detalle, si el nombre no coincide, se usa el comprador de la solicitud
--     (campanas.solicitante_buyer_id).
--   * Si queda un nombre del canasto, o de una solicitud PENDIENTE, sin comprador
--     equivalente, el script se detiene sin cambiar nada y muestra los nombres.
--   * Permisos: se compara buyer_id contra current_buyer_scope_ids() (mismo alcance
--     Senior/Junior que hoy; no se cambia la lógica de Junior ni de segmentos).
--     Las políticas evalúan el rol y el alcance una sola vez por consulta (initPlan).
--   * Se actualizan guard_fidelizacion_rows, fidelizacion_sku_allowed,
--     crear_solicitud_fidelizacion y finalizar_solicitud_fidelizacion.
--   * Se elimina fidelizacion_owner_allowed(text) (comparaba nombres).
--   * campanas.comprador (cabecera de la solicitud) NO cambia.
--
-- Revisión previa opcional (ejecutar aparte, no cambia nada):
--   select f.comprador, count(*) from g_comercial.canasto_fidelizacion f
--   where nullif(trim(f.comprador), '') is not null and not exists (
--     select 1 from g_comercial.compradores c
--     where lower(trim(c.comprador)) = lower(trim(f.comprador))
--        or lower(trim(c.comprador_id)) = lower(trim(f.comprador)))
--   group by 1 order by 1;
-- =====================================================================
begin;

do $$
begin
  if to_regclass('g_comercial.canasto_fidelizacion') is null then
    raise exception 'No existe g_comercial.canasto_fidelizacion: ejecute este script en la base de la app (Gestor Comercial).';
  end if;
end $$;

-- 1. Columnas e índices.
alter table g_comercial.canasto_fidelizacion
  add column if not exists buyer_id uuid references g_comercial.compradores(id);
alter table g_comercial.fidelizacion_solicitudes_detalle
  add column if not exists buyer_id uuid references g_comercial.compradores(id);
create index if not exists idx_canasto_fid_buyer on g_comercial.canasto_fidelizacion(buyer_id);
create index if not exists idx_fid_detalle_buyer on g_comercial.fidelizacion_solicitudes_detalle(buyer_id);

-- 2. Copiar el nombre actual a buyer_id (solo mientras exista la columna de texto).
do $$
declare
  v_pendientes text;
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'g_comercial'
      and table_name = 'canasto_fidelizacion' and column_name = 'comprador') then
    raise notice 'El canasto ya no tiene columna comprador: no hay nada que copiar.';
    return;
  end if;

  -- Los triggers de permisos usan auth.uid(); en el SQL Editor no hay usuario.
  alter table g_comercial.canasto_fidelizacion disable trigger user;
  alter table g_comercial.fidelizacion_solicitudes_detalle disable trigger user;

  execute $q$
    update g_comercial.canasto_fidelizacion f set buyer_id = c.id
    from g_comercial.compradores c
    where f.buyer_id is null and nullif(trim(f.comprador), '') is not null
      and (lower(trim(c.comprador)) = lower(trim(f.comprador))
        or lower(trim(coalesce(c.comprador_id, ''))) = lower(trim(f.comprador)))
  $q$;

  execute $q$
    update g_comercial.fidelizacion_solicitudes_detalle d set buyer_id = c.id
    from g_comercial.compradores c
    where d.buyer_id is null and nullif(trim(d.comprador), '') is not null
      and (lower(trim(c.comprador)) = lower(trim(d.comprador))
        or lower(trim(coalesce(c.comprador_id, ''))) = lower(trim(d.comprador)))
  $q$;

  update g_comercial.fidelizacion_solicitudes_detalle d set buyer_id = c.solicitante_buyer_id
  from g_comercial.campanas c
  where d.buyer_id is null and c.legacy_actividad_id = d.actividad_id and c.solicitante_buyer_id is not null;

  alter table g_comercial.canasto_fidelizacion enable trigger user;
  alter table g_comercial.fidelizacion_solicitudes_detalle enable trigger user;

  execute $q$
    select string_agg(distinct nombre, ', ') from (
      select f.comprador as nombre from g_comercial.canasto_fidelizacion f
      where f.buyer_id is null and nullif(trim(f.comprador), '') is not null
      union
      select d.comprador from g_comercial.fidelizacion_solicitudes_detalle d
      where d.buyer_id is null and d.estado = 'PENDIENTE' and nullif(trim(d.comprador), '') is not null
    ) x
  $q$ into v_pendientes;
  if v_pendientes is not null then
    raise exception 'Hay compradores del canasto sin equivalente en Compradores: %. Corrija el nombre en Ajustes > Compradores (o en el canasto) y vuelva a ejecutar. No se cambió nada.', v_pendientes;
  end if;
end $$;

-- 3. Políticas: quitar las que dependen del nombre.
drop policy if exists fidelizacion_canasto_scoped on g_comercial.canasto_fidelizacion;
drop policy if exists fidelizacion_detalle_scoped on g_comercial.fidelizacion_solicitudes_detalle;
drop policy if exists orce_historial_scope on g_comercial.fidelizacion_orce_historial;

-- 4. Funciones.
-- Un comprador no puede tomar SKU que ya pertenecen a otro comprador fuera de su alcance.
create or replace function g_comercial.fidelizacion_sku_allowed(p_sku text)
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(g_comercial.current_user_role() in ('ADMIN', 'OPER') or
  (g_comercial.current_user_role() = 'BUYER' and not exists (
    select 1 from g_comercial.canasto_fidelizacion f where f.sku = p_sku
      and (f.buyer_id is null or not (f.buyer_id = any(g_comercial.current_buyer_scope_ids())))
  )), false); $$;

CREATE OR REPLACE FUNCTION g_comercial.guard_fidelizacion_rows()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if g_comercial.current_user_role() = 'BUYER' then
    if tg_table_name = 'canasto_fidelizacion' then
      if tg_op <> 'UPDATE' then
        raise exception 'Solo Ejecutor puede aplicar descuentos al canasto.' using errcode = '42501';
      end if;
      if (new.canal, new.sku, new.segmento_id, new.descuento, new.buyer_id, new.division)
          is distinct from (old.canal, old.sku, old.segmento_id, old.descuento, old.buyer_id, old.division)
          or new.estatus <> 'En proceso' then
        raise exception 'Solo Ejecutor puede aplicar descuentos al canasto.' using errcode = '42501';
      end if;
    elsif tg_op <> 'INSERT' then
      raise exception 'El detalle enviado no puede modificarse; cree otra solicitud.' using errcode = '42501';
    elsif new.estado <> 'PENDIENTE' then
      raise exception 'Solo Ejecutor puede aplicar una solicitud.' using errcode = '42501';
    end if;
  end if;
  if tg_op <> 'INSERT' then
    if not g_comercial.fidelizacion_buyer_allowed(old.buyer_id) then
      raise exception 'Registro de Fidelizacion fuera de su alcance.' using errcode = '42501';
    end if;
    if tg_table_name = 'fidelizacion_solicitudes_detalle' then
      if not g_comercial.fidelizacion_request_allowed(old.actividad_id) then
        raise exception 'Solicitud fuera de su alcance.' using errcode = '42501';
      end if;
    end if;
  end if;
  if tg_op <> 'DELETE' then
    if not g_comercial.fidelizacion_buyer_allowed(new.buyer_id) or not g_comercial.fidelizacion_sku_allowed(new.sku) then
      raise exception 'Registro de Fidelizacion fuera de su alcance.' using errcode = '42501';
    end if;
    if tg_table_name = 'fidelizacion_solicitudes_detalle' then
      if not g_comercial.fidelizacion_request_allowed(new.actividad_id) then
        raise exception 'Solicitud fuera de su alcance.' using errcode = '42501';
      end if;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $function$;

CREATE OR REPLACE FUNCTION g_comercial.crear_solicitud_fidelizacion(p_actividad jsonb, p_detalles jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actividad_id text;
  v_canal text;
  v_nombre text;
  v_motivo text;
  v_comprador text;
  v_solicitante text;
  v_buyer_id uuid;
  v_count integer := 0;
begin
  perform set_config('statement_timeout', '60s', true);

  if coalesce(g_comercial.current_user_role(), '') not in ('BUYER', 'OPER') then
    raise exception 'Solo Comprador y Ejecutor pueden operar Fidelizacion.' using errcode = '42501';
  end if;
  v_actividad_id := coalesce(nullif(p_actividad ->> 'legacy_actividad_id', ''), nullif(p_actividad ->> 'actividad_id', ''));
  if v_actividad_id is null or v_actividad_id = '' then
    return jsonb_build_object('success', false, 'error', 'Identificador de actividad invalido.');
  end if;

  if v_actividad_id not like 'FID-%' then
    raise exception 'Fidelizacion requiere un identificador FID-.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('fidelizacion:canasto', 0));
  -- Serializa solicitudes del mismo identificador, incluida su primera creacion.
  perform pg_advisory_xact_lock(hashtextextended(v_actividad_id, 0));
  if exists (select 1 from g_comercial.campanas where legacy_actividad_id = v_actividad_id) then
    if not g_comercial.fidelizacion_request_allowed(v_actividad_id) then
      raise exception 'Solicitud fuera de su alcance.' using errcode = '42501';
    end if;
    raise exception 'El identificador de solicitud ya existe. Cree una nueva solicitud.' using errcode = '23505';
  end if;
  v_canal := coalesce(nullif(p_actividad ->> 'canal', ''), 'Comasa');
  v_nombre := coalesce(nullif(p_actividad ->> 'nombre_actividad', ''), 'Fidelizacion ' || upper(v_canal));
  v_motivo := coalesce(p_actividad ->> 'motivo_solicitud', '');
  v_comprador := coalesce(nullif(p_actividad ->> 'comprador', ''), nullif(p_actividad ->> 'solicitante', ''), '');
  v_solicitante := coalesce(nullif(p_actividad ->> 'solicitante', ''), v_comprador);

  -- 1. Obtener buyer_id del comprador si existe
  if p_actividad ->> 'solicitante_buyer_id' is not null and (p_actividad ->> 'solicitante_buyer_id') ~ '^[0-9a-fA-F-]{36}$' then
    v_buyer_id := (p_actividad ->> 'solicitante_buyer_id')::uuid;
  else
    select id into v_buyer_id
    from g_comercial.compradores
    where lower(trim(comprador)) = lower(trim(v_comprador))
       or lower(trim(comprador)) = lower(trim(v_solicitante))
       or lower(trim(correo)) = lower(trim(v_comprador))
       or lower(trim(correo)) = lower(trim(v_solicitante))
    limit 1;

    if v_buyer_id is null then
      select id into v_buyer_id
      from g_comercial.compradores
      where replace(translate(lower(trim(comprador)), 'áéíóúàèìòùz', 'aeiouaeious'), ' ', '') =
            replace(translate(lower(trim(v_comprador)), 'áéíóúàèìòùz', 'aeiouaeious'), ' ', '')
         or replace(translate(lower(trim(comprador)), 'áéíóúàèìòùz', 'aeiouaeious'), ' ', '') =
            replace(translate(lower(trim(v_solicitante)), 'áéíóúàèìòùz', 'aeiouaeious'), ' ', '')
         or (length(v_comprador) > 3 and correo ilike '%' || split_part(lower(trim(v_comprador)), ' ', 1) || '%')
      limit 1;
    end if;

    if v_buyer_id is null then
      select buyer_id into v_buyer_id
      from g_comercial.usuarios_app
      where auth_user_id = auth.uid()
      limit 1;
    end if;
  end if;

  if v_buyer_id is not null then
    select comprador into v_comprador from g_comercial.compradores where id = v_buyer_id limit 1;
  end if;

  if not g_comercial.fidelizacion_buyer_allowed(v_buyer_id) then
    raise exception 'Comprador fuera de su alcance autorizado.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_detalles) is distinct from 'array' or jsonb_array_length(p_detalles) = 0 then
    raise exception 'La solicitud debe contener cambios.';
  end if;

  -- 2. Validacion de formato numerico en el payload JSON antes de parsear
  if exists (
    select 1 from jsonb_array_elements(p_detalles) d
    where (d->>'descuento_solicitado') is null
       or trim(d->>'descuento_solicitado') = ''
       or (d->>'descuento_solicitado') !~ '^-?[0-9]+(\.[0-9]+)?$'
  ) then
    raise exception 'Descuento solicitado invalido.';
  end if;

  -- 3. Cargar detalles en tabla temporal de sesion para validaciones masivas (set-based)
  drop table if exists _tmp_fid_detalles;
  create temporary table _tmp_fid_detalles on commit drop as
  select
    trim(coalesce(d->>'sku', '')) as sku,
    trim(coalesce(d->>'segmento_id', '')) as segmento_id,
    lower(coalesce(nullif(d->>'canal', ''), lower(v_canal))) as canal,
    coalesce(d->>'division', '') as division,
    coalesce(nullif(d->>'solicitante', ''), v_solicitante) as solicitante,
    coalesce((d->>'descuento_anterior')::numeric, 0) as descuento_anterior_in,
    (d->>'descuento_solicitado')::numeric as descuento_solicitado
  from jsonb_array_elements(p_detalles) d;

  -- Validar duplicados SKU / segmento en el lote
  if exists (
    select 1 from _tmp_fid_detalles group by sku, segmento_id having count(*) > 1
  ) then
    raise exception 'Hay combinaciones SKU/segmento duplicadas.';
  end if;

  -- Validar campos obligatorios
  if exists (
    select 1 from _tmp_fid_detalles where sku = '' or segmento_id = ''
  ) then
    raise exception 'SKU y segmento son obligatorios.';
  end if;

  -- Validar canal coincidente
  if exists (
    select 1 from _tmp_fid_detalles where canal <> lower(v_canal)
  ) then
    raise exception 'El canal del detalle no coincide con la solicitud.';
  end if;

  -- Validar rango de descuentos solicitados [0, 100]
  if exists (
    select 1 from _tmp_fid_detalles
    where descuento_solicitado is null or descuento_solicitado < 0 or descuento_solicitado > 100
  ) then
    raise exception 'Descuento solicitado invalido.';
  end if;

  -- Validar alcance de SKU en masa (para BUYER: no tomar SKUs asignados a otro comprador)
  if g_comercial.current_user_role() = 'BUYER' then
    if exists (
      select 1
      from _tmp_fid_detalles t
      join g_comercial.canasto_fidelizacion f on f.sku = t.sku
      where not g_comercial.fidelizacion_buyer_allowed(f.buyer_id)
    ) then
      raise exception 'SKU fuera de su alcance de Fidelizacion.' using errcode = '42501';
    end if;
  end if;

  -- Validar existencia y vigencia activa de segmentos en masa
  if exists (
    select 1
    from _tmp_fid_detalles t
    where not exists (
      select 1
      from g_comercial.segmentos_clientes s
      where s.legacy_segmento_id = t.segmento_id
        and lower(s.canal) = lower(v_canal)
        and s.activo
    )
  ) then
    raise exception 'Segmento inexistente o inactivo para el canal.';
  end if;

  -- Bloquear en masa las filas relevantes de canasto_fidelizacion para control de concurrencia
  perform 1
  from g_comercial.canasto_fidelizacion f
  where f.canal = lower(v_canal)
    and exists (
      select 1 from _tmp_fid_detalles t
      where t.sku = f.sku and t.segmento_id = f.segmento_id
    )
  for update;

  -- Validar en masa que el canasto no haya cambiado frente a descuento_anterior reportado
  if exists (
    select 1
    from _tmp_fid_detalles t
    left join g_comercial.canasto_fidelizacion f
      on f.canal = lower(v_canal) and f.sku = t.sku and f.segmento_id = t.segmento_id
    where coalesce(f.descuento, 0) is distinct from t.descuento_anterior_in
  ) then
    raise exception 'El canasto cambio. Actualice los datos y prepare nuevamente la solicitud.' using errcode = '40001';
  end if;

  -- Descartar filas sin cambio real (solicitado == anterior)
  delete from _tmp_fid_detalles
  where descuento_solicitado = descuento_anterior_in;

  if not exists (select 1 from _tmp_fid_detalles) then
    raise exception 'La solicitud no contiene cambios.';
  end if;

  -- Validar en masa que no existan solicitudes pendientes superpuestas
  if exists (
    select 1
    from _tmp_fid_detalles t
    join g_comercial.fidelizacion_solicitudes_detalle d
      on d.canal = lower(v_canal)
     and d.sku = t.sku
     and d.segmento_id = t.segmento_id
     and d.estado = 'PENDIENTE'
     and d.tipo_cambio <> 'SIN_CAMBIO'
  ) then
    raise exception 'Ya existe una solicitud pendiente para este SKU y segmento.';
  end if;

  -- 4. Insertar o actualizar la cabecera en g_comercial.campanas
  insert into g_comercial.campanas (
    legacy_actividad_id,
    tipo_actividad,
    nombre_actividad,
    canal,
    solicitante_buyer_id,
    estado,
    motivo_solicitud,
    comprador,
    recursos_ocupados,
    fecha_nuevo,
    fecha_estado,
    updated_at
  )
  values (
    v_actividad_id,
    'ESPECIAL',
    v_nombre,
    v_canal,
    v_buyer_id,
    'Nuevo',
    v_motivo,
    v_comprador,
    'Pricing (ORCE)',
    now(),
    now(),
    now()
  );

  -- 5. Insercion masiva en fidelizacion_solicitudes_detalle
  insert into g_comercial.fidelizacion_solicitudes_detalle (
    actividad_id,
    canal,
    sku,
    division,
    segmento_id,
    descuento_anterior,
    descuento_solicitado,
    tipo_cambio,
    estado,
    solicitante,
    buyer_id,
    created_at
  )
  select
    v_actividad_id,
    t.canal,
    t.sku,
    t.division,
    t.segmento_id,
    t.descuento_anterior_in,
    t.descuento_solicitado,
    case
      when f.sku is null then 'NUEVO'
      when t.descuento_solicitado = 0 then 'ELIMINA'
      when t.descuento_solicitado > t.descuento_anterior_in then 'SUBE'
      else 'BAJA'
    end,
    'PENDIENTE',
    t.solicitante,
    v_buyer_id,
    now()
  from _tmp_fid_detalles t
  left join g_comercial.canasto_fidelizacion f
    on f.canal = lower(v_canal) and f.sku = t.sku and f.segmento_id = t.segmento_id;

  get diagnostics v_count = row_count;

  -- 6. Actualizacion masiva del estatus en canasto_fidelizacion
  update g_comercial.canasto_fidelizacion f
  set estatus = 'En proceso',
      ultima_solicitud_id = v_actividad_id
  from _tmp_fid_detalles t
  where f.canal = lower(v_canal)
    and f.sku = t.sku
    and f.segmento_id = t.segmento_id;

  return jsonb_build_object(
    'success', true,
    'actividad_id', v_actividad_id,
    'rows_inserted', v_count
  );
end;
$function$;

CREATE OR REPLACE FUNCTION g_comercial.finalizar_solicitud_fidelizacion(p_actividad_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count integer := 0;
  v_rec record;
  v_nuevo_estatus text;
  v_anterior numeric;
  v_estado text;
  v_referencia text;
begin
  if coalesce(g_comercial.current_user_role(), '') not in ('ADMIN', 'OPER') then
    raise exception 'Solo Administrador o Ejecutor puede finalizar Fidelizacion.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('fidelizacion:canasto', 0));
  perform pg_advisory_xact_lock(hashtextextended(p_actividad_id, 0));
  perform 1 from g_comercial.campanas where legacy_actividad_id = p_actividad_id for update;
  if not g_comercial.fidelizacion_request_allowed(p_actividad_id) then
    raise exception 'Sin permiso para finalizar esta solicitud de Fidelizacion.' using errcode = '42501';
  end if;
  if exists (select 1 from g_comercial.fidelizacion_solicitudes_detalle d
    where d.actividad_id = p_actividad_id and
      (not g_comercial.fidelizacion_buyer_allowed(d.buyer_id) or not g_comercial.fidelizacion_sku_allowed(d.sku))) then
    raise exception 'Detalle fuera de su alcance autorizado.' using errcode = '42501';
  end if;
  select estado, promo_ids into v_estado, v_referencia from g_comercial.campanas where legacy_actividad_id = p_actividad_id;
  if v_estado in ('Finalizado', 'Archivado') then
    return jsonb_build_object('success', true, 'rows_affected', 0);
  end if;
  if nullif(trim(v_referencia), '') is null or upper(trim(v_referencia)) = 'ORCE-CARGADO' then
    raise exception 'Registre la referencia de carga ORCE antes de finalizar.';
  end if;
  select count(*) into v_count from g_comercial.fidelizacion_solicitudes_detalle
    where actividad_id = p_actividad_id and estado = 'PENDIENTE' and tipo_cambio <> 'SIN_CAMBIO';
  if v_count = 0 then raise exception 'La solicitud no tiene cambios pendientes.'; end if;

  -- Iterar sobre los registros pendientes y aplicar cambios a canasto_fidelizacion
  for v_rec in
    select *
    from g_comercial.fidelizacion_solicitudes_detalle
    where actividad_id = p_actividad_id and estado = 'PENDIENTE' and tipo_cambio <> 'SIN_CAMBIO'
    order by canal, sku, segmento_id
  loop
    select descuento into v_anterior from g_comercial.canasto_fidelizacion
      where canal = v_rec.canal and sku = v_rec.sku and segmento_id = v_rec.segmento_id for update;
    if coalesce(v_anterior, 0) is distinct from v_rec.descuento_anterior then
      raise exception 'El canasto cambio para SKU %, segmento %. Revise la solicitud antes de cargar ORCE.', v_rec.sku, v_rec.segmento_id using errcode = '40001';
    end if;
    -- Si el descuento solicitado es 0, pasa a 'Inactivo', de lo contrario 'Activo'
    if v_rec.descuento_solicitado = 0 then
      v_nuevo_estatus := 'Inactivo';
    else
      v_nuevo_estatus := 'Activo';
    end if;

    insert into g_comercial.canasto_fidelizacion (
      canal,
      sku,
      division,
      segmento_id,
      descuento,
      estatus,
      buyer_id,
      ultima_solicitud_id,
      updated_at
    )
    values (
      v_rec.canal,
      v_rec.sku,
      v_rec.division,
      v_rec.segmento_id,
      v_rec.descuento_solicitado,
      v_nuevo_estatus,
      v_rec.buyer_id,
      p_actividad_id,
      now()
    )
    on conflict (canal, sku, segmento_id)
    do update set
      descuento = excluded.descuento,
      estatus = excluded.estatus,
      buyer_id = coalesce(excluded.buyer_id, canasto_fidelizacion.buyer_id),
      ultima_solicitud_id = excluded.ultima_solicitud_id,
      updated_at = now();

  end loop;

  -- Las solicitudes antiguas pueden incluir SIN_CAMBIO: nunca reaplicar su valor.
  update g_comercial.fidelizacion_solicitudes_detalle set estado = 'RECHAZADO'
    where actividad_id = p_actividad_id and estado = 'PENDIENTE' and tipo_cambio = 'SIN_CAMBIO';
  -- Marcar los registros de detalle como APLICADO
  update g_comercial.fidelizacion_solicitudes_detalle
  set estado = 'APLICADO',
      applied_at = now()
  where actividad_id = p_actividad_id and estado = 'PENDIENTE';

  -- Actualizar estado de la actividad en campanas a Finalizado
  update g_comercial.campanas
  set estado = 'Finalizado',
      fecha_finalizado = coalesce(fecha_finalizado, now()),
      fecha_estado = now(),
      updated_at = now()
  where legacy_actividad_id = p_actividad_id;

  return jsonb_build_object(
    'success', true,
    'message', 'Descuentos actualizados correctamente en canasto maestro.',
    'rows_affected', v_count
  );
end;
$function$;

drop function if exists g_comercial.fidelizacion_owner_allowed(text);

-- 5. Políticas por ID. (select ...) hace que rol y alcance se calculen una vez por consulta.
create policy fidelizacion_canasto_scoped on g_comercial.canasto_fidelizacion
  for all to authenticated
  using (
    (select g_comercial.current_user_role()) in ('ADMIN', 'OPER')
    or ((select g_comercial.current_user_role()) = 'BUYER'
      and buyer_id = any((select g_comercial.current_buyer_scope_ids())::uuid[]))
  )
  with check (
    ((select g_comercial.current_user_role()) in ('ADMIN', 'OPER')
      or ((select g_comercial.current_user_role()) = 'BUYER'
        and buyer_id = any((select g_comercial.current_buyer_scope_ids())::uuid[])))
    and g_comercial.fidelizacion_sku_allowed(sku)
  );

create policy fidelizacion_detalle_scoped on g_comercial.fidelizacion_solicitudes_detalle
  for all to authenticated
  using (
    g_comercial.fidelizacion_request_allowed(actividad_id)
    and ((select g_comercial.current_user_role()) in ('ADMIN', 'OPER')
      or ((select g_comercial.current_user_role()) = 'BUYER'
        and buyer_id = any((select g_comercial.current_buyer_scope_ids())::uuid[])))
  )
  with check (
    g_comercial.fidelizacion_request_allowed(actividad_id)
    and ((select g_comercial.current_user_role()) in ('ADMIN', 'OPER')
      or ((select g_comercial.current_user_role()) = 'BUYER'
        and buyer_id = any((select g_comercial.current_buyer_scope_ids())::uuid[])))
    and g_comercial.fidelizacion_sku_allowed(sku)
  );

create policy orce_historial_scope on g_comercial.fidelizacion_orce_historial
  for select to authenticated
  using (
    (select g_comercial.current_user_role()) = 'OPER'
    or exists (select 1 from g_comercial.canasto_fidelizacion c
      where c.id = canasto_id and g_comercial.fidelizacion_buyer_allowed(c.buyer_id))
  );

-- 6. Quitar el nombre guardado (ya está en buyer_id).
alter table g_comercial.canasto_fidelizacion drop column if exists comprador;
alter table g_comercial.fidelizacion_solicitudes_detalle drop column if exists comprador;

commit;

-- Verificación (ejecutar aparte):
--   select count(*) total, count(buyer_id) con_comprador from g_comercial.canasto_fidelizacion;
--   select column_name from information_schema.columns
--   where table_schema = 'g_comercial' and table_name = 'canasto_fidelizacion' and column_name in ('comprador', 'buyer_id');
--   -- Debe mostrar solo buyer_id.
