-- =====================================================================
-- ESQUEMA g_comercial: Despliegue Parte 1 (Pasos 1 al 21)
-- Crea tablas núcleo, usuarios_app, catálogos base, módulo de diseño y storage.
-- Dependencias: Proyecto Supabase con extension pgcrypto. Esquema g_comercial expuesto en Data API.
-- Repetible: Si (usa drop if exists, create or replace function/view, create table if not exists).
-- Destructivo: No sobre public ni sobre datos de otras aplicaciones.
-- =====================================================================

create schema if not exists g_comercial;
set search_path to g_comercial, public;

-- Extensiones necesarias (a nivel de base de datos)
create extension if not exists pgcrypto;



-- =====================================================================
-- STEP: supabase_schema.sql
-- =====================================================================

-- Supabase schema for Sistema de Gestion de Promociones Retail.
-- Ejecutar desde Supabase SQL Editor en un proyecto nuevo.
-- Este modelo conserva PROMOCIONES como tabla principal y deja CONSOLIDADO/EXPORT_* como vistas.

create extension if not exists pgcrypto;

-- =========================================================
-- Helpers
-- =========================================================

create or replace function g_comercial.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================
-- Catalogos base
-- =========================================================

create table if not exists g_comercial.compradores (
  id uuid primary key default gen_random_uuid(),
  comprador text not null,
  division text not null default '',
  correo text not null default '',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint compradores_comprador_unique unique (comprador)
);

create table if not exists g_comercial.usuarios_app (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  nombre text not null default '',
  email text not null unique,
  rol text not null check (rol in ('ADMIN', 'COMPRADOR', 'MERCADEO', 'PRICING', 'PLANIMETRIA')),
  buyer_id uuid references g_comercial.compradores(id),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint usuarios_app_buyer_required check (
    rol <> 'COMPRADOR' or buyer_id is not null
  )
);

create table if not exists g_comercial.configuracion (
  clave text primary key,
  valor jsonb not null default '{}'::jsonb,
  categoria text not null default 'GENERAL',
  descripcion text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references g_comercial.usuarios_app(id)
);

create table if not exists g_comercial.campanas (
  id uuid primary key default gen_random_uuid(),
  legacy_actividad_id text not null unique check (length(trim(legacy_actividad_id)) > 0),
  tipo_actividad text not null default 'CATALOGO' check (tipo_actividad in ('CATALOGO', 'ESPECIAL')),
  nombre_actividad text not null,
  canal text not null default '',
  fecha_inicio date,
  fecha_fin date,
  solicitante_buyer_id uuid references g_comercial.compradores(id),
  estado text not null default 'BORRADOR' check (estado in ('BORRADOR', 'ACTIVO', 'CERRADO', 'CANCELADO')),
  motivo_solicitud text not null default '',
  color text not null default 'bg-emerald-700',
  doc_id text not null default '',
  token_conexion text not null default '',
  notificaciones boolean not null default false,
  notificaciones_envivo boolean not null default true,
  correos text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campanas_fechas_validas check (
    fecha_inicio is null or fecha_fin is null or fecha_fin >= fecha_inicio
  )
);

create table if not exists g_comercial.segmentos_clientes (
  id uuid primary key default gen_random_uuid(),
  legacy_segmento_id text unique,
  canal text not null default '',
  nombre_segmento text not null,
  activo boolean not null default true,
  orden integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint segmentos_clientes_unique unique (canal, nombre_segmento)
);

create table if not exists g_comercial.sku_master (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid references g_comercial.compradores(id),
  sku text not null,
  vpn text not null default '',
  descripcion text not null default '',
  precio numeric(14, 2),
  activo boolean not null default true,
  fuente text not null default 'ERP_EXCEL',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sku_master_unique unique (buyer_id, sku)
);

-- =========================================================
-- Promociones
-- =========================================================

create table if not exists g_comercial.promociones (
  id uuid primary key default gen_random_uuid(),
  legacy_row_id text unique,
  campana_id uuid not null references g_comercial.campanas(id) on delete cascade,
  oferta_id text not null,
  buyer_id uuid not null references g_comercial.compradores(id),
  tipo_promo text not null,
  grupo_oferta text not null default '',
  tipo_sku text not null default 'simple',
  variante text not null default '',
  sku text not null,
  numero_pagina integer default null,
  num_parte text not null default '',
  descripcion text not null default '',
  tipo_cantidad text not null default 'Exacta',
  cantidad_minima numeric(14, 2) not null default 1,
  precio_antes numeric(14, 2),
  precio_ahora numeric(14, 2),
  descuento text not null default '',
  comentario_comprador text not null default '',
  aplica_segmento text not null default 'NO' check (aplica_segmento in ('SI', 'NO')),
  segmento_cliente text not null default '',
  alcance_tipo text not null default '' check (alcance_tipo in ('', 'CANAL', 'SEGMENTO', 'TIENDA', 'MULTI_TIENDA')),
  alcance_valor text not null default '',
  estado_registro text not null default 'BORRADOR' check (estado_registro in ('BORRADOR', 'REGISTRADO', 'EN_REVISION', 'APROBADO', 'RECHAZADO', 'CERRADO', 'ANULADO')),
  usuario_crea text not null default '',
  usuario_edita text not null default '',
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references g_comercial.usuarios_app(id),
  constraint promociones_sku_required check (length(trim(sku)) > 0),
  constraint promociones_tipo_required check (length(trim(tipo_promo)) > 0),
  constraint promociones_complejas_required check (
    tipo_promo not in ('Combo', 'Umbral', 'Compra X lleva X', 'Compra X Lleva X V2')
    or (length(trim(grupo_oferta)) > 0 and length(trim(tipo_sku)) > 0)
  ),
  constraint promociones_segmento_required check (
    aplica_segmento = 'NO' or length(trim(segmento_cliente)) > 0
  ),
  constraint promociones_alcance_segmento check (
    alcance_tipo <> 'SEGMENTO'
    or (aplica_segmento = 'SI' and segmento_cliente = alcance_valor)
  )
);

create table if not exists g_comercial.promociones_detalle (
  id uuid primary key default gen_random_uuid(),
  promocion_id uuid not null references g_comercial.promociones(id) on delete cascade,
  campo text not null,
  valor text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promociones_detalle_unique unique (promocion_id, campo)
);

create table if not exists g_comercial.comentarios (
  id uuid primary key default gen_random_uuid(),
  promocion_id uuid not null references g_comercial.promociones(id) on delete cascade,
  prioridad text not null default 'MEDIA' check (prioridad in ('BAJA', 'MEDIA', 'ALTA')),
  usuario_id uuid references g_comercial.usuarios_app(id),
  usuario text not null default '',
  tipo_usuario text not null default '',
  comentario text not null,
  estado text not null default 'ABIERTO' check (estado in ('ABIERTO', 'RESUELTO')),
  resuelto_por uuid references g_comercial.usuarios_app(id),
  fecha_resolucion timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comentarios_texto_required check (length(trim(comentario)) > 0)
);

create table if not exists g_comercial.logs (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references g_comercial.usuarios_app(id),
  actor_auth_user_id uuid,
  usuario text not null default '',
  rol text not null default '',
  entidad text not null default 'PROMOCIONES',
  entidad_id uuid,
  registro text not null default '',
  campana_id uuid references g_comercial.campanas(id) on delete set null,
  promocion_id uuid references g_comercial.promociones(id) on delete set null,
  accion text not null,
  campo text not null default '',
  valor_anterior text not null default '',
  valor_nuevo text not null default '',
  request_id text not null default '',
  operation_id text not null default '',
  origen text not null default 'db',
  contexto jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  fecha_cierre timestamptz
);

create table if not exists g_comercial.notificaciones (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid references g_comercial.campanas(id) on delete cascade,
  correo text not null,
  tipo text not null default 'CAMBIO_PROMOCION',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notificaciones_unique unique (campana_id, correo, tipo)
);

-- =========================================================
-- Alineacion de columnas para bases de datos existentes
-- =========================================================

alter table g_comercial.compradores
  add column if not exists comprador_id text,
  add column if not exists categoria_comprador text not null default 'Senior',
  add column if not exists senior_id text not null default '';

alter table g_comercial.usuarios_app
  add column if not exists auth_user_id uuid,
  add column if not exists nombre text not null default '',
  add column if not exists email text,
  add column if not exists rol text,
  add column if not exists buyer_id uuid references g_comercial.compradores(id),
  add column if not exists activo boolean not null default true;

alter table g_comercial.campanas
  add column if not exists solicitante_buyer_id uuid references g_comercial.compradores(id),
  add column if not exists comprador text not null default '',
  add column if not exists responsable text not null default '',
  add column if not exists recursos_ocupados text not null default '',
  add column if not exists promo_ids text not null default '',
  add column if not exists oferta_ids text not null default '',
  add column if not exists divisiones text not null default '';

alter table g_comercial.sku_master
  add column if not exists buyer_id uuid references g_comercial.compradores(id),
  add column if not exists vpn text not null default '',
  add column if not exists descripcion text not null default '',
  add column if not exists precio numeric(14, 2),
  add column if not exists activo boolean not null default true,
  add column if not exists fuente text not null default 'ERP_EXCEL';

alter table g_comercial.promociones
  add column if not exists campana_id uuid references g_comercial.campanas(id) on delete cascade,
  add column if not exists oferta_id text,
  add column if not exists buyer_id uuid references g_comercial.compradores(id),
  add column if not exists tipo_promo text,
  add column if not exists grupo_oferta text not null default '',
  add column if not exists tipo_sku text not null default 'simple',
  add column if not exists variante text not null default '',
  add column if not exists sku text,
  add column if not exists numero_pagina integer default null,
  add column if not exists num_parte text not null default '',
  add column if not exists descripcion text not null default '',
  add column if not exists tipo_cantidad text not null default 'Exacta',
  add column if not exists cantidad_minima numeric(14, 2) not null default 1,
  add column if not exists precio_antes numeric(14, 2),
  add column if not exists precio_ahora numeric(14, 2),
  add column if not exists descuento text not null default '',
  add column if not exists comentario_comprador text not null default '',
  add column if not exists aplica_segmento text not null default 'NO',
  add column if not exists segmento_cliente text not null default '',
  add column if not exists alcance_tipo text not null default '',
  add column if not exists alcance_valor text not null default '',
  add column if not exists estado_registro text not null default 'BORRADOR',
  add column if not exists dep_id text not null default '',
  add column if not exists usuario_crea text not null default '',
  add column if not exists usuario_edita text not null default '',
  add column if not exists ultima_modificacion_por text not null default '',
  add column if not exists version bigint not null default 1;

alter table g_comercial.comentarios
  add column if not exists campana_id uuid references g_comercial.campanas(id) on delete cascade,
  add column if not exists alcance_comentario text not null default 'LINEA',
  add column if not exists fecha timestamptz not null default now();

alter table g_comercial.logs
  add column if not exists actor_auth_user_id uuid,
  add column if not exists usuario_id uuid references g_comercial.usuarios_app(id),
  add column if not exists request_id text not null default '',
  add column if not exists operation_id text not null default '',
  add column if not exists origen text not null default 'db',
  add column if not exists contexto jsonb not null default '{}'::jsonb;

-- =========================================================
-- Helpers de seguridad y roles normalizados
-- =========================================================

create or replace function g_comercial.normalize_role(p_role text)
returns text language sql immutable as $$
  select case upper(trim(coalesce(p_role, '')))
    when 'ADMINISTRADOR' then 'ADMIN'
    when 'COMPRADOR' then 'BUYER'
    when 'COMP' then 'BUYER'
    when 'MERCADEO' then 'MARK'
    when 'MARKETING' then 'MARK'
    when 'PRICING' then 'OPER'
    when 'PRICE' then 'OPER'
    when 'PLANIMETRIA' then 'OPER'
    when 'EJECUTOR' then 'OPER'
    when 'AUDITOR' then 'AUD'
    when 'AUT' then 'AUD'
    when 'CDD' then 'DISENADOR'
    when 'DISEÑADOR' then 'DISENADOR'
    when 'DISEÃ‘ADOR' then 'DISENADOR'
    when 'DESIGNER' then 'DISENADOR'
    else upper(trim(coalesce(p_role, '')))
  end;
$$;

create or replace function g_comercial.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select g_comercial.normalize_role(rol)
  from g_comercial.usuarios_app
  where auth_user_id = auth.uid()
    and activo = true
  limit 1;
$$;

create or replace function g_comercial.current_buyer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select buyer_id
  from g_comercial.usuarios_app
  where auth_user_id = auth.uid()
    and activo = true
  limit 1;
$$;

create or replace function g_comercial.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from g_comercial.usuarios_app
  where auth_user_id = auth.uid()
    and activo = true
  limit 1;
$$;

create or replace function g_comercial.is_role(required_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select g_comercial.normalize_role(g_comercial.current_user_role()) = g_comercial.normalize_role(required_role);
$$;

create or replace function g_comercial.is_any_role(required_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from unnest(required_roles) as r
    where g_comercial.normalize_role(r) = g_comercial.normalize_role(g_comercial.current_user_role())
  );
$$;

create or replace function g_comercial.current_buyer_scope_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  with current_buyer as (
    select c.*
    from g_comercial.compradores c
    where c.id = g_comercial.current_buyer_id()
      and c.activo = true
    limit 1
  ),
  buyer_scope as (
    select c.id
    from g_comercial.compradores c
    cross join current_buyer cb
    where c.activo = true
      and (
        c.id = cb.id
        or exists (
          select 1
          from regexp_split_to_table(coalesce(c.senior_id, ''), '[;,|]+') as ref(value)
          where btrim(ref.value) in (cb.id::text, cb.comprador_id, cb.comprador, cb.correo)
        )
        or exists (
          select 1
          from regexp_split_to_table(coalesce(cb.senior_id, ''), '[;,|]+') as ref(value)
          where btrim(ref.value) in (c.id::text, c.comprador_id, c.comprador, c.correo)
        )
      )
  )
  select coalesce(array_agg(distinct id), array[]::uuid[])
  from buyer_scope;
$$;

-- =========================================================
-- Auditoria confiable
-- =========================================================

create or replace function g_comercial.insert_audit_log(
  p_entidad text,
  p_accion text,
  p_entidad_id uuid default null,
  p_registro text default '',
  p_campo text default '',
  p_valor_anterior text default '',
  p_valor_nuevo text default '',
  p_campana_id uuid default null,
  p_promocion_id uuid default null,
  p_request_id text default '',
  p_operation_id text default '',
  p_origen text default 'db',
  p_contexto jsonb default '{}'::jsonb,
  p_fecha_cierre timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log_id uuid;
  v_usuario_id uuid;
  v_usuario text := '';
  v_rol text := '';
begin
  select id, coalesce(nullif(nombre, ''), nullif(email, ''), ''), rol
  into v_usuario_id, v_usuario, v_rol
  from g_comercial.usuarios_app
  where auth_user_id = auth.uid()
    and activo = true
  limit 1;

  if v_usuario_id is null or nullif(v_rol, '') is null then
    raise exception 'No hay usuario activo autorizado para registrar auditoria.'
      using errcode = '42501';
  end if;

  if nullif(p_entidad, '') is null or nullif(p_accion, '') is null then
    raise exception 'La auditoria requiere entidad y accion.';
  end if;

  insert into g_comercial.logs (
    usuario_id, actor_auth_user_id, usuario, rol, entidad, entidad_id, registro,
    campana_id, promocion_id, accion, campo, valor_anterior, valor_nuevo,
    request_id, operation_id, origen, contexto, created_at, fecha_cierre
  )
  values (
    v_usuario_id, auth.uid(), v_usuario, v_rol, p_entidad, p_entidad_id, coalesce(p_registro, ''),
    p_campana_id, p_promocion_id, p_accion, coalesce(p_campo, ''), coalesce(p_valor_anterior, ''),
    coalesce(p_valor_nuevo, ''), coalesce(nullif(p_request_id, ''), gen_random_uuid()::text),
    coalesce(p_operation_id, ''), coalesce(nullif(p_origen, ''), 'db'), coalesce(p_contexto, '{}'::jsonb),
    clock_timestamp(), p_fecha_cierre
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$;

revoke execute on function g_comercial.insert_audit_log(text, text, uuid, text, text, text, text, uuid, uuid, text, text, text, jsonb, timestamptz) from public, authenticated, anon;

create or replace function g_comercial.logs_prevent_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Los logs de auditoria son append-only y no pueden modificarse ni eliminarse.'
    using errcode = '42501';
end;
$$;

create or replace function g_comercial.audit_business_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  v_row jsonb := coalesce(v_new, v_old);
  v_entidad text := upper(tg_table_name);
  v_entidad_id uuid := nullif(v_row ->> 'id', '')::uuid;
  v_registro text := coalesce(nullif(v_row ->> 'legacy_row_id', ''), nullif(v_row ->> 'legacy_actividad_id', ''), nullif(v_row ->> 'avance_id', ''), nullif(v_row ->> 'catalogo_id', ''), nullif(v_row ->> 'campo', ''), v_entidad_id::text, '');
  v_campana_id uuid;
  v_promocion_id uuid;
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and v_old = v_new then
    return new;
  end if;

  v_campana_id := nullif(v_row ->> 'campana_id', '')::uuid;
  v_promocion_id := nullif(v_row ->> 'promocion_id', '')::uuid;

  if tg_table_name = 'campanas' then
    v_campana_id := v_entidad_id;
  elsif tg_table_name = 'promociones' then
    v_promocion_id := v_entidad_id;
    v_campana_id := nullif(v_row ->> 'campana_id', '')::uuid;
  elsif tg_table_name = 'promociones_detalle' then
    v_promocion_id := nullif(v_row ->> 'promocion_id', '')::uuid;
    select campana_id into v_campana_id from g_comercial.promociones where id = v_promocion_id;
  elsif tg_table_name = 'comentarios' then
    v_promocion_id := nullif(v_row ->> 'promocion_id', '')::uuid;
    select campana_id into v_campana_id from g_comercial.promociones where id = v_promocion_id;
  end if;

  perform g_comercial.insert_audit_log(
    p_entidad => v_entidad,
    p_accion => tg_op,
    p_entidad_id => v_entidad_id,
    p_registro => v_registro,
    p_campo => '*',
    p_valor_anterior => coalesce(v_old::text, ''),
    p_valor_nuevo => coalesce(v_new::text, ''),
    p_campana_id => v_campana_id,
    p_promocion_id => v_promocion_id,
    p_operation_id => coalesce(current_setting('app.operation_id', true), ''),
    p_origen => 'trigger',
    p_contexto => jsonb_build_object(
      'schema', tg_table_schema,
      'table', tg_table_name,
      'operation', tg_op,
      'old', v_old,
      'new', v_new
    )
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- =========================================================
-- Triggers updated_at
-- =========================================================

drop trigger if exists compradores_set_updated_at on g_comercial.compradores;
create trigger compradores_set_updated_at before update on g_comercial.compradores
for each row execute function g_comercial.set_updated_at();

drop trigger if exists usuarios_app_set_updated_at on g_comercial.usuarios_app;
create trigger usuarios_app_set_updated_at before update on g_comercial.usuarios_app
for each row execute function g_comercial.set_updated_at();

drop trigger if exists campanas_set_updated_at on g_comercial.campanas;
create trigger campanas_set_updated_at before update on g_comercial.campanas
for each row execute function g_comercial.set_updated_at();

drop trigger if exists segmentos_clientes_set_updated_at on g_comercial.segmentos_clientes;
create trigger segmentos_clientes_set_updated_at before update on g_comercial.segmentos_clientes
for each row execute function g_comercial.set_updated_at();

drop trigger if exists sku_master_set_updated_at on g_comercial.sku_master;
create trigger sku_master_set_updated_at before update on g_comercial.sku_master
for each row execute function g_comercial.set_updated_at();

drop trigger if exists promociones_set_updated_at on g_comercial.promociones;
create trigger promociones_set_updated_at before update on g_comercial.promociones
for each row execute function g_comercial.set_updated_at();

drop trigger if exists promociones_detalle_set_updated_at on g_comercial.promociones_detalle;
create trigger promociones_detalle_set_updated_at before update on g_comercial.promociones_detalle
for each row execute function g_comercial.set_updated_at();

drop trigger if exists comentarios_set_updated_at on g_comercial.comentarios;
create trigger comentarios_set_updated_at before update on g_comercial.comentarios
for each row execute function g_comercial.set_updated_at();

drop trigger if exists campanas_audit_row_change on g_comercial.campanas;
create trigger campanas_audit_row_change after insert or update or delete on g_comercial.campanas
for each row execute function g_comercial.audit_business_row_change();

drop trigger if exists promociones_audit_row_change on g_comercial.promociones;
create trigger promociones_audit_row_change after insert or update or delete on g_comercial.promociones
for each row execute function g_comercial.audit_business_row_change();

drop trigger if exists promociones_detalle_audit_row_change on g_comercial.promociones_detalle;
create trigger promociones_detalle_audit_row_change after insert or update or delete on g_comercial.promociones_detalle
for each row execute function g_comercial.audit_business_row_change();

drop trigger if exists comentarios_audit_row_change on g_comercial.comentarios;
create trigger comentarios_audit_row_change after insert or update or delete on g_comercial.comentarios
for each row execute function g_comercial.audit_business_row_change();

drop trigger if exists logs_prevent_update on g_comercial.logs;
create trigger logs_prevent_update before update on g_comercial.logs
for each row execute function g_comercial.logs_prevent_mutation();

drop trigger if exists logs_prevent_delete on g_comercial.logs;
create trigger logs_prevent_delete before delete on g_comercial.logs
for each row execute function g_comercial.logs_prevent_mutation();

drop trigger if exists notificaciones_set_updated_at on g_comercial.notificaciones;
create trigger notificaciones_set_updated_at before update on g_comercial.notificaciones
for each row execute function g_comercial.set_updated_at();

-- =========================================================
-- Vistas generadas
-- =========================================================

drop view if exists g_comercial.export_planimetria cascade;
drop view if exists g_comercial.export_mercadeo cascade;
drop view if exists g_comercial.export_pricing cascade;
drop view if exists g_comercial.consolidado cascade;

create or replace view g_comercial.consolidado
with (security_invoker = true) as
with comentarios_actividad as (
  select
    campana_id,
    string_agg(estado || ': ' || comentario, ' | ' order by fecha) as comentarios_actividad,
    count(*) filter (where estado = 'ABIERTO') as comentarios_actividad_abiertos
  from g_comercial.comentarios
  where alcance_comentario = 'ACTIVIDAD'
  group by campana_id
)
select
  c.legacy_actividad_id as actividad_id,
  p.oferta_id,
  c.tipo_actividad,
  c.canal,
  p.alcance_tipo,
  p.alcance_valor,
  b.comprador,
  b.division,
  p.tipo_promo,
  p.grupo_oferta,
  p.tipo_sku,
  p.variante,
  p.sku,
  p.numero_pagina,
  p.num_parte,
  p.descripcion,
  p.tipo_cantidad,
  p.cantidad_minima,
  p.precio_antes,
  p.precio_ahora,
  p.descuento,
  p.comentario_comprador,
  p.aplica_segmento,
  p.segmento_cliente,
  case when p.aplica_segmento = 'SI' then p.segmento_cliente else 'Todos' end as segmento,
  p.estado_registro,
  count(cm.id) filter (where cm.estado = 'ABIERTO') as comentarios_abiertos,
  count(cm.id) as total_comentarios,
  coalesce(ca.comentarios_actividad, '') as comentarios_actividad,
  coalesce(ca.comentarios_actividad_abiertos, 0) as comentarios_actividad_abiertos,
  p.usuario_crea,
  p.usuario_edita,
  p.updated_at as fecha_modificacion,
  p.ultima_modificacion_por
from g_comercial.promociones p
join g_comercial.campanas c on c.id = p.campana_id
join g_comercial.compradores b on b.id = p.buyer_id
left join g_comercial.comentarios cm
  on cm.promocion_id = p.id
  and cm.alcance_comentario = 'LINEA'
left join comentarios_actividad ca on ca.campana_id = p.campana_id
group by c.legacy_actividad_id, p.oferta_id, c.tipo_actividad, c.canal, p.alcance_tipo,
  p.alcance_valor, b.comprador, b.division, p.tipo_promo, p.grupo_oferta, p.tipo_sku,
  p.variante, p.sku, p.numero_pagina, p.num_parte, p.descripcion, p.tipo_cantidad, p.cantidad_minima,
  p.precio_antes, p.precio_ahora, p.descuento, p.comentario_comprador, p.aplica_segmento,
  p.segmento_cliente, p.estado_registro, ca.comentarios_actividad,
  ca.comentarios_actividad_abiertos, p.usuario_crea, p.usuario_edita, p.updated_at, p.ultima_modificacion_por;

create or replace view g_comercial.export_pricing
with (security_invoker = true) as
with comentarios_actividad as (
  select
    campana_id,
    string_agg(estado || ': ' || comentario, ' | ' order by fecha) as comentarios_actividad
  from g_comercial.comentarios
  where alcance_comentario = 'ACTIVIDAD'
  group by campana_id
)
select
  c.legacy_actividad_id as actividad_id,
  p.oferta_id,
  c.tipo_actividad,
  c.canal,
  p.alcance_tipo,
  p.alcance_valor,
  b.comprador,
  p.tipo_promo,
  p.grupo_oferta,
  p.tipo_sku,
  p.variante,
  p.sku,
  p.tipo_cantidad,
  p.cantidad_minima,
  p.precio_antes,
  p.precio_ahora,
  p.descuento,
  p.aplica_segmento,
  p.segmento_cliente,
  case when p.aplica_segmento = 'SI' then p.segmento_cliente else 'Todos' end as segmento,
  p.estado_registro,
  coalesce(ca.comentarios_actividad, '') as comentarios_actividad
from g_comercial.promociones p
join g_comercial.campanas c on c.id = p.campana_id
join g_comercial.compradores b on b.id = p.buyer_id
left join comentarios_actividad ca on ca.campana_id = p.campana_id;

create or replace view g_comercial.export_mercadeo
with (security_invoker = true) as
with comentarios_actividad as (
  select
    campana_id,
    string_agg(estado || ': ' || comentario, ' | ' order by fecha) as comentarios_actividad
  from g_comercial.comentarios
  where alcance_comentario = 'ACTIVIDAD'
  group by campana_id
)
select
  c.legacy_actividad_id as actividad_id,
  p.oferta_id,
  c.tipo_actividad,
  c.canal,
  p.alcance_tipo,
  p.alcance_valor,
  b.comprador,
  p.tipo_promo,
  p.grupo_oferta,
  p.variante,
  p.sku,
  p.numero_pagina,
  p.num_parte,
  p.descripcion,
  p.precio_antes,
  p.precio_ahora,
  p.descuento,
  p.comentario_comprador,
  p.aplica_segmento,
  p.segmento_cliente,
  case when p.aplica_segmento = 'SI' then p.segmento_cliente else 'Todos' end as segmento,
  coalesce(ca.comentarios_actividad, '') as comentarios_actividad,
  string_agg(cm.comentario, ' | ' order by cm.fecha) filter (where cm.estado = 'ABIERTO') as comentarios_abiertos_mercadeo
from g_comercial.promociones p
join g_comercial.campanas c on c.id = p.campana_id
join g_comercial.compradores b on b.id = p.buyer_id
left join g_comercial.comentarios cm
  on cm.promocion_id = p.id
  and cm.alcance_comentario = 'LINEA'
left join comentarios_actividad ca on ca.campana_id = p.campana_id
group by c.legacy_actividad_id, p.oferta_id, c.tipo_actividad, c.canal, p.alcance_tipo,
  p.alcance_valor, b.comprador, p.tipo_promo, p.grupo_oferta, p.variante, p.sku,
  p.numero_pagina, p.num_parte, p.descripcion, p.precio_antes, p.precio_ahora, p.descuento,
  p.comentario_comprador, p.aplica_segmento, p.segmento_cliente, ca.comentarios_actividad;

create or replace view g_comercial.export_planimetria
with (security_invoker = true) as
with comentarios_actividad as (
  select
    campana_id,
    string_agg(estado || ': ' || comentario, ' | ' order by fecha) as comentarios_actividad
  from g_comercial.comentarios
  where alcance_comentario = 'ACTIVIDAD'
  group by campana_id
)
select
  c.legacy_actividad_id as actividad_id,
  p.oferta_id,
  c.tipo_actividad,
  c.canal,
  p.alcance_tipo,
  p.alcance_valor,
  b.comprador,
  b.division,
  p.tipo_promo,
  p.grupo_oferta,
  p.variante,
  p.sku,
  p.descripcion,
  p.precio_antes,
  p.precio_ahora,
  p.descuento,
  p.aplica_segmento,
  p.segmento_cliente,
  case when p.aplica_segmento = 'SI' then p.segmento_cliente else 'Todos' end as segmento,
  p.estado_registro,
  coalesce(ca.comentarios_actividad, '') as comentarios_actividad
from g_comercial.promociones p
join g_comercial.campanas c on c.id = p.campana_id
join g_comercial.compradores b on b.id = p.buyer_id
left join comentarios_actividad ca on ca.campana_id = p.campana_id;

-- =========================================================
-- Indices
-- =========================================================

create index if not exists idx_usuarios_app_auth_user_id on g_comercial.usuarios_app(auth_user_id);
create index if not exists idx_usuarios_app_rol on g_comercial.usuarios_app(rol);
create index if not exists idx_campanas_estado on g_comercial.campanas(estado);
create index if not exists idx_campanas_fechas on g_comercial.campanas(fecha_inicio, fecha_fin);
create index if not exists idx_segmentos_canal on g_comercial.segmentos_clientes(canal);
create index if not exists idx_sku_master_sku on g_comercial.sku_master(sku);
create index if not exists idx_promociones_campana on g_comercial.promociones(campana_id);
create index if not exists idx_promociones_buyer on g_comercial.promociones(buyer_id);
create index if not exists idx_promociones_sku on g_comercial.promociones(sku);
create index if not exists idx_promociones_tipo_promo on g_comercial.promociones(tipo_promo);
create index if not exists idx_promociones_estado on g_comercial.promociones(estado_registro);
create index if not exists idx_promociones_oferta on g_comercial.promociones(oferta_id);
create index if not exists idx_comentarios_promocion on g_comercial.comentarios(promocion_id);
create index if not exists idx_comentarios_estado on g_comercial.comentarios(estado);
create index if not exists idx_logs_promocion on g_comercial.logs(promocion_id);
create index if not exists idx_logs_created_at on g_comercial.logs(created_at);
create index if not exists idx_logs_request_id on g_comercial.logs(request_id);
create index if not exists idx_logs_operation_id on g_comercial.logs(operation_id);
create index if not exists idx_notificaciones_campana on g_comercial.notificaciones(campana_id);

-- =========================================================
-- Grants para Supabase API
-- =========================================================

grant usage on schema public to authenticated;
grant select, insert, update, delete on
  g_comercial.compradores,
  g_comercial.usuarios_app,
  g_comercial.configuracion,
  g_comercial.campanas,
  g_comercial.segmentos_clientes,
  g_comercial.sku_master,
  g_comercial.promociones,
  g_comercial.promociones_detalle,
  g_comercial.comentarios,
  g_comercial.notificaciones
to authenticated;

grant select on g_comercial.logs to authenticated;
revoke insert, update, delete on g_comercial.logs from authenticated;

grant select on
  g_comercial.consolidado,
  g_comercial.export_pricing,
  g_comercial.export_mercadeo,
  g_comercial.export_planimetria
to authenticated;

-- =========================================================

-- =====================================================================
-- Columnas y Funciones auxiliares para RLS (adelantadas para resolver dependencias)
-- =====================================================================

alter table g_comercial.compradores
  add column if not exists comprador_id text,
  add column if not exists categoria_comprador text not null default 'Senior',
  add column if not exists senior_id text not null default '';

alter table g_comercial.usuarios_app
  drop constraint if exists usuarios_app_rol_check;

alter table g_comercial.usuarios_app
  drop constraint if exists usuarios_app_buyer_required;

alter table g_comercial.usuarios_app drop constraint if exists usuarios_app_rol_check;
alter table g_comercial.usuarios_app add constraint usuarios_app_rol_check
  check (rol in ('ADMIN', 'BUYER', 'MARK', 'OPER', 'AUD', 'DISENADOR', 'COMPRADOR', 'MERCADEO', 'PRICING', 'PLANIMETRIA'));

alter table g_comercial.usuarios_app drop constraint if exists usuarios_app_buyer_required;
alter table g_comercial.usuarios_app add constraint usuarios_app_buyer_required
  check (rol not in ('BUYER', 'COMPRADOR') or buyer_id is not null);

create or replace function g_comercial.current_user_role()
returns text
language sql
stable
security definer
set search_path = g_comercial, public, auth
as $$
  select rol
  from g_comercial.usuarios_app
  where auth_user_id = auth.uid()
    and activo = true
  limit 1;
$$;

create or replace function g_comercial.current_buyer_id()
returns uuid
language sql
stable
security definer
set search_path = g_comercial, public, auth
as $$
  select buyer_id
  from g_comercial.usuarios_app
  where auth_user_id = auth.uid()
    and activo = true
  limit 1;
$$;

create or replace function g_comercial.current_buyer_scope_ids()
returns uuid[]
language sql
stable
security definer
set search_path = g_comercial, public, auth
as $$
  with current_buyer as (
    select c.*
    from g_comercial.compradores c
    where c.id = g_comercial.current_buyer_id()
      and c.activo = true
    limit 1
  ),
  buyer_scope as (
    select c.id
    from g_comercial.compradores c
    cross join current_buyer cb
    where c.activo = true
      and (
        c.id = cb.id
        or exists (
          select 1
          from regexp_split_to_table(coalesce(c.senior_id, ''), '[;,|]+') as ref(value)
          where btrim(ref.value) in (cb.id::text, cb.comprador_id, cb.comprador, cb.correo)
        )
        or exists (
          select 1
          from regexp_split_to_table(coalesce(cb.senior_id, ''), '[;,|]+') as ref(value)
          where btrim(ref.value) in (c.id::text, c.comprador_id, c.comprador, c.correo)
        )
      )
  )
  select coalesce(array_agg(distinct id), array[]::uuid[])
  from buyer_scope;
$$;

create or replace function g_comercial.is_role(required_role text)
returns boolean
language sql
stable
security definer
set search_path = g_comercial, public, auth
as $$
  select g_comercial.current_user_role() = required_role;
$$;

create or replace function g_comercial.is_any_role(required_roles text[])
returns boolean
language sql
stable
security definer
set search_path = g_comercial, public, auth
as $$
  select g_comercial.current_user_role() = any(required_roles);
$$;

create or replace function g_comercial.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = g_comercial, public, auth
as $$
  select id
  from g_comercial.usuarios_app
  where auth_user_id = auth.uid()
    and activo = true
  limit 1;
$$;

create or replace function g_comercial.current_user_label()
returns text
language sql
stable
security definer
set search_path = g_comercial, public, auth
as $$
  select coalesce(nullif(nombre, ''), nullif(email, ''), '')
  from g_comercial.usuarios_app
  where auth_user_id = auth.uid()
    and activo = true
  limit 1;
$$;

create or replace function g_comercial.is_comment_scope_closed(
  p_promocion_id uuid,
  p_campana_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = g_comercial, public, auth
as $$
  with target as (
    select
      p.estado_registro as promocion_estado,
      coalesce(cp.estado, ca.estado) as campana_estado
    from (select 1) seed
    left join g_comercial.promociones p on p.id = p_promocion_id
    left join g_comercial.campanas cp on cp.id = p.campana_id
    left join g_comercial.campanas ca on ca.id = p_campana_id
  )
  select coalesce(bool_or(
    upper(coalesce(promocion_estado, '')) in ('CERRADO', 'ANULADO')
    or upper(coalesce(campana_estado, '')) in ('CERRADO', 'CANCELADO', 'FINALIZADO', 'ARCHIVADO')
  ), false)
  from target;
$$;

create or replace function g_comercial.can_write_comment_scope(
  p_promocion_id uuid,
  p_campana_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = g_comercial, public, auth
as $$
  with current_user_data as (
    select
      id,
      buyer_id,
      rol,
      lower(trim(coalesce(nombre, ''))) as nombre,
      lower(trim(coalesce(email, ''))) as email
    from g_comercial.usuarios_app
    where auth_user_id = auth.uid()
      and activo = true
    limit 1
  ),
  target as (
    select
      p.id as promocion_id,
      p.buyer_id as promocion_buyer_id,
      coalesce(cp.id, ca.id) as campana_id,
      coalesce(cp.solicitante_buyer_id, ca.solicitante_buyer_id) as solicitante_buyer_id,
      coalesce(cp.tipo_actividad, ca.tipo_actividad, '') as tipo_actividad,
      lower(trim(coalesce(cp.responsable, ca.responsable, ''))) as responsable
    from (select 1) seed
    left join g_comercial.promociones p on p.id = p_promocion_id
    left join g_comercial.campanas cp on cp.id = p.campana_id
    left join g_comercial.campanas ca on ca.id = p_campana_id
  )
  select coalesce((
    select
      u.rol = 'ADMIN'
      or (
        u.rol in ('BUYER', 'COMPRADOR')
        and (
          t.promocion_buyer_id = any(g_comercial.current_buyer_scope_ids())
          or t.solicitante_buyer_id = any(g_comercial.current_buyer_scope_ids())
        )
      )
      or (
        u.rol in ('MARK', 'MERCADEO')
        and t.campana_id is not null
        and (
          t.tipo_actividad = 'CATALOGO'
          or nullif(t.responsable, '') is null
          or t.responsable in (u.nombre, u.email)
        )
      )
    from current_user_data u
    cross join target t
  ), false);
$$;


-- Row Level Security
-- =========================================================

alter table g_comercial.compradores enable row level security;
alter table g_comercial.usuarios_app enable row level security;
alter table g_comercial.configuracion enable row level security;
alter table g_comercial.campanas enable row level security;
alter table g_comercial.segmentos_clientes enable row level security;
alter table g_comercial.sku_master enable row level security;
alter table g_comercial.promociones enable row level security;
alter table g_comercial.promociones_detalle enable row level security;
alter table g_comercial.comentarios enable row level security;
alter table g_comercial.logs enable row level security;
alter table g_comercial.notificaciones enable row level security;

drop policy if exists compradores_select_authenticated on g_comercial.compradores;
create policy compradores_select_authenticated on g_comercial.compradores for select
to authenticated
using (true);

drop policy if exists compradores_admin_all on g_comercial.compradores;
create policy compradores_admin_all on g_comercial.compradores for all
to authenticated
using (g_comercial.is_role('ADMIN'))
with check (g_comercial.is_role('ADMIN'));

drop policy if exists usuarios_select_self_admin_mark on g_comercial.usuarios_app;
create policy usuarios_select_self_admin_mark on g_comercial.usuarios_app for select
to authenticated
using (g_comercial.current_user_role() is not null);

drop policy if exists usuarios_admin_all on g_comercial.usuarios_app;
create policy usuarios_admin_all on g_comercial.usuarios_app for all
to authenticated
using (g_comercial.is_role('ADMIN'))
with check (g_comercial.is_role('ADMIN'));

drop policy if exists configuracion_admin_all on g_comercial.configuracion;
create policy configuracion_admin_all on g_comercial.configuracion for all
to authenticated
using (g_comercial.is_role('ADMIN'))
with check (g_comercial.is_role('ADMIN'));

drop policy if exists configuracion_read_authenticated on g_comercial.configuracion;
create policy configuracion_read_authenticated on g_comercial.configuracion for select
to authenticated
using (true);

drop policy if exists campanas_select_roles on g_comercial.campanas;
create policy campanas_select_roles on g_comercial.campanas for select
to authenticated
using (g_comercial.is_any_role(array['ADMIN', 'BUYER', 'MARK', 'OPER', 'DISENADOR', 'AUD']));

drop policy if exists campanas_write_admin_buyer on g_comercial.campanas;
drop policy if exists campanas_write_admin_mercadeo_comprador on g_comercial.campanas;
drop policy if exists campanas_write_admin_buyer on g_comercial.campanas;
create policy campanas_write_admin_buyer on g_comercial.campanas for insert
to authenticated
with check (
  g_comercial.is_any_role(array['ADMIN', 'MARK'])
  or (g_comercial.is_role('BUYER') and solicitante_buyer_id = any(g_comercial.current_buyer_scope_ids()))
);

drop policy if exists campanas_update_admin_buyer on g_comercial.campanas;
drop policy if exists campanas_update_admin_mercadeo_comprador on g_comercial.campanas;
drop policy if exists campanas_update_admin_buyer on g_comercial.campanas;
create policy campanas_update_admin_buyer on g_comercial.campanas for update
to authenticated
using (
  g_comercial.is_any_role(array['ADMIN', 'MARK'])
  or (g_comercial.is_role('BUYER') and solicitante_buyer_id = any(g_comercial.current_buyer_scope_ids()))
)
with check (
  g_comercial.is_any_role(array['ADMIN', 'MARK'])
  or (g_comercial.is_role('BUYER') and solicitante_buyer_id = any(g_comercial.current_buyer_scope_ids()))
);

drop policy if exists segmentos_read_authenticated on g_comercial.segmentos_clientes;
create policy segmentos_read_authenticated on g_comercial.segmentos_clientes for select
to authenticated
using (g_comercial.current_user_role() is not null);

drop policy if exists segmentos_admin_all on g_comercial.segmentos_clientes;
create policy segmentos_admin_all on g_comercial.segmentos_clientes for all
to authenticated
using (g_comercial.is_role('ADMIN'))
with check (g_comercial.is_role('ADMIN'));

drop policy if exists sku_master_select_roles on g_comercial.sku_master;
create policy sku_master_select_roles on g_comercial.sku_master for select
to authenticated
using (
  g_comercial.is_any_role(array['ADMIN', 'MARK', 'OPER', 'DISENADOR'])
  or (g_comercial.is_role('BUYER') and buyer_id = any(g_comercial.current_buyer_scope_ids()))
);

drop policy if exists sku_master_write_owner_or_admin on g_comercial.sku_master;
create policy sku_master_write_owner_or_admin on g_comercial.sku_master for all
to authenticated
using (
  g_comercial.is_role('ADMIN')
  or (g_comercial.is_role('BUYER') and buyer_id = any(g_comercial.current_buyer_scope_ids()))
)
with check (
  g_comercial.is_role('ADMIN')
  or (g_comercial.is_role('BUYER') and buyer_id = any(g_comercial.current_buyer_scope_ids()))
);

drop policy if exists promociones_select_roles on g_comercial.promociones;
create policy promociones_select_roles on g_comercial.promociones for select
to authenticated
using (
  g_comercial.is_any_role(array['ADMIN', 'MARK', 'OPER', 'DISENADOR', 'AUD'])
  or (g_comercial.is_role('BUYER') and buyer_id = any(g_comercial.current_buyer_scope_ids()))
);

drop policy if exists promociones_insert_buyer_admin on g_comercial.promociones;
create policy promociones_insert_buyer_admin on g_comercial.promociones for insert
to authenticated
with check (
  g_comercial.is_role('ADMIN')
  or (g_comercial.is_role('BUYER') and buyer_id = any(g_comercial.current_buyer_scope_ids()))
);

drop policy if exists promociones_update_buyer_admin on g_comercial.promociones;
drop policy if exists promociones_update_buyer_admin_mercadeo on g_comercial.promociones;
drop policy if exists promociones_update_buyer_admin on g_comercial.promociones;
create policy promociones_update_buyer_admin on g_comercial.promociones for update
to authenticated
using (
  g_comercial.is_role('ADMIN')
  or (g_comercial.is_role('BUYER') and buyer_id = any(g_comercial.current_buyer_scope_ids()))
)
with check (
  g_comercial.is_role('ADMIN')
  or (g_comercial.is_role('BUYER') and buyer_id = any(g_comercial.current_buyer_scope_ids()))
);

drop policy if exists promociones_delete_admin_owner on g_comercial.promociones;
create policy promociones_delete_admin_owner on g_comercial.promociones for delete
to authenticated
using (
  g_comercial.is_role('ADMIN')
  or (g_comercial.is_role('BUYER') and buyer_id = any(g_comercial.current_buyer_scope_ids()) and estado_registro = 'BORRADOR')
);

drop policy if exists promociones_detalle_select_roles on g_comercial.promociones_detalle;
create policy promociones_detalle_select_roles on g_comercial.promociones_detalle for select
to authenticated
using (
  exists (
    select 1
    from g_comercial.promociones p
    where p.id = promocion_id
      and (
        g_comercial.is_any_role(array['ADMIN', 'MARK', 'OPER', 'DISENADOR', 'AUD'])
        or (g_comercial.is_role('BUYER') and p.buyer_id = any(g_comercial.current_buyer_scope_ids()))
      )
  )
);

drop policy if exists promociones_detalle_write_owner_admin on g_comercial.promociones_detalle;
create policy promociones_detalle_write_owner_admin on g_comercial.promociones_detalle for all
to authenticated
using (
  g_comercial.is_role('ADMIN')
  or exists (
    select 1
    from g_comercial.promociones p
    where p.id = promocion_id
      and g_comercial.is_role('BUYER')
      and p.buyer_id = any(g_comercial.current_buyer_scope_ids())
  )
)
with check (
  g_comercial.is_role('ADMIN')
  or exists (
    select 1
    from g_comercial.promociones p
    where p.id = promocion_id
      and g_comercial.is_role('BUYER')
      and p.buyer_id = any(g_comercial.current_buyer_scope_ids())
  )
);

drop policy if exists comentarios_select_roles on g_comercial.comentarios;
create policy comentarios_select_roles on g_comercial.comentarios for select
to authenticated
using (
  g_comercial.is_any_role(array['ADMIN', 'MARK', 'OPER', 'DISENADOR', 'AUD'])
  or exists (
    select 1 from g_comercial.promociones p
    where p.id = promocion_id
      and g_comercial.is_role('BUYER')
      and p.buyer_id = any(g_comercial.current_buyer_scope_ids())
  )
  or exists (
    select 1 from g_comercial.campanas c
    where c.id = campana_id
      and g_comercial.is_role('BUYER')
      and c.solicitante_buyer_id = any(g_comercial.current_buyer_scope_ids())
  )
);

drop policy if exists comentarios_insert_mark_buyer_admin on g_comercial.comentarios;
create policy comentarios_insert_mark_buyer_admin on g_comercial.comentarios for insert
to authenticated
with check (
  g_comercial.can_write_comment_scope(promocion_id, campana_id)
  and usuario_id = g_comercial.current_app_user_id()
);

drop policy if exists comentarios_update_mark_buyer_admin on g_comercial.comentarios;
create policy comentarios_update_mark_buyer_admin on g_comercial.comentarios for update
to authenticated
using (g_comercial.can_write_comment_scope(promocion_id, campana_id))
with check (g_comercial.can_write_comment_scope(promocion_id, campana_id));

drop policy if exists logs_select_roles on g_comercial.logs;
create policy logs_select_roles on g_comercial.logs for select
to authenticated
using (g_comercial.is_any_role(array['ADMIN', 'AUD']));

drop policy if exists notificaciones_select_roles on g_comercial.notificaciones;
create policy notificaciones_select_roles on g_comercial.notificaciones for select
to authenticated
using (g_comercial.is_role('ADMIN'));

drop policy if exists notificaciones_admin_all on g_comercial.notificaciones;
create policy notificaciones_admin_all on g_comercial.notificaciones for all
to authenticated
using (g_comercial.is_role('ADMIN'))
with check (g_comercial.is_role('ADMIN'));

-- Nota de arranque:
-- 1. Crear usuarios en Supabase Auth.
-- 2. Insertar al menos un registro ADMIN en g_comercial.usuarios_app desde SQL Editor.
-- 3. Luego administrar compradores, roles y permisos desde la app o desde Supabase.



-- =====================================================================
-- STEP: supabase_delta_operativo_2026_06_22.sql
-- =====================================================================

-- Ajuste operativo Supabase - 2026-06-22
-- Sistema de Gestion de Promociones Retail
--
-- Ejecutar despues de docs/supabase_schema.sql si la base ya fue creada.
-- Este ajuste NO carga ni modela master_sku. El maestro de SKU se mantiene fuera de Supabase
-- por ser informacion delicada/confidencial del negocio.

-- =========================================================
-- 1. Compradores Senior/Junior
-- =========================================================

alter table g_comercial.compradores
  add column if not exists comprador_id text,
  add column if not exists categoria_comprador text not null default 'Senior',
  add column if not exists senior_id text not null default '';

create unique index if not exists compradores_comprador_id_unique
on g_comercial.compradores (comprador_id)
where comprador_id is not null and comprador_id <> '';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'compradores_categoria_comprador_check'
      and conrelid = 'g_comercial.compradores'::regclass
  ) then
    alter table g_comercial.compradores drop constraint if exists compradores_categoria_comprador_check;
alter table g_comercial.compradores add constraint compradores_categoria_comprador_check
      check (categoria_comprador in ('Senior', 'Junior'));
  end if;
end;
$$;

-- =========================================================
-- 2. Campanas / Actividades / Solicitudes especiales
-- =========================================================

alter table g_comercial.campanas
  add column if not exists comprador text not null default '',
  add column if not exists responsable text not null default '',
  add column if not exists recursos_ocupados text not null default '',
  add column if not exists fecha_estado timestamptz,
  add column if not exists fecha_nuevo timestamptz,
  add column if not exists fecha_aprovado timestamptz,
  add column if not exists fecha_entrabajo timestamptz,
  add column if not exists fecha_finalizado timestamptz,
  add column if not exists fecha_asignado timestamptz,
  add column if not exists fecha_trabajando timestamptz,
  add column if not exists fecha_resuelto timestamptz,
  add column if not exists tiempo_nuevo_horas numeric(14, 2) not null default 0,
  add column if not exists tiempo_aprovado_horas numeric(14, 2) not null default 0,
  add column if not exists tiempo_entrabajo_horas numeric(14, 2) not null default 0,
  add column if not exists tiempo_finalizado_horas numeric(14, 2) not null default 0,
  add column if not exists tiempo_asignado_horas numeric(14, 2) not null default 0,
  add column if not exists tiempo_trabajando_horas numeric(14, 2) not null default 0,
  add column if not exists tiempo_resuelto_horas numeric(14, 2) not null default 0,
  add column if not exists tiempo_total_horas numeric(14, 2) not null default 0,
  add column if not exists promo_ids text not null default '',
  add column if not exists oferta_ids text not null default '',
  add column if not exists divisiones text not null default '';

alter table g_comercial.campanas
  drop constraint if exists campanas_estado_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'campanas_estado_operativo_check'
      and conrelid = 'g_comercial.campanas'::regclass
  ) then
    alter table g_comercial.campanas drop constraint if exists campanas_estado_operativo_check;
alter table g_comercial.campanas add constraint campanas_estado_operativo_check
      check (estado in (
        'Borrador', 'Activo', 'Cerrado',
        'BORRADOR', 'ACTIVO', 'CERRADO', 'CANCELADO',
        'Nuevo', 'Aprobado', 'Aprovado', 'En trabajo', 'Finalizado', 'Archivado'
      ));
  end if;
end;
$$;

-- =========================================================
-- 3. Promociones sin master_sku
-- =========================================================

alter table g_comercial.promociones
  add column if not exists dep_id text not null default '',
  add column if not exists usuario_crea text not null default '',
  add column if not exists usuario_edita text not null default '',
  add column if not exists ultima_modificacion_por text not null default '',
  add column if not exists version bigint not null default 1;

alter table g_comercial.promociones
  drop constraint if exists promociones_version_positive_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'promociones_version_positive_check'
      and conrelid = 'g_comercial.promociones'::regclass
  ) then
    alter table g_comercial.promociones drop constraint if exists promociones_version_positive_check;
alter table g_comercial.promociones add constraint promociones_version_positive_check
      check (version > 0);
  end if;
end;
$$;

alter table g_comercial.promociones
  drop constraint if exists promociones_estado_registro_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'promociones_estado_registro_operativo_check'
      and conrelid = 'g_comercial.promociones'::regclass
  ) then
    alter table g_comercial.promociones drop constraint if exists promociones_estado_registro_operativo_check;
alter table g_comercial.promociones add constraint promociones_estado_registro_operativo_check
      check (estado_registro in (
        'BORRADOR', 'REGISTRADO', 'EN_REVISION', 'APROBADO', 'RECHAZADO', 'CERRADO', 'ANULADO'
      ));
  end if;
end;
$$;

create index if not exists idx_promociones_dep_id on g_comercial.promociones(dep_id);

-- =========================================================
-- 4. Comentarios por linea y por actividad
-- =========================================================

alter table g_comercial.comentarios
  alter column promocion_id drop not null;

alter table g_comercial.comentarios
  add column if not exists legacy_comentario_id text,
  add column if not exists campana_id uuid references g_comercial.campanas(id) on delete cascade,
  add column if not exists legacy_row_id text not null default '',
  add column if not exists alcance_comentario text not null default 'LINEA',
  add column if not exists fecha timestamptz not null default now();

create unique index if not exists comentarios_legacy_comentario_id_unique
on g_comercial.comentarios (legacy_comentario_id)
where legacy_comentario_id is not null and legacy_comentario_id <> '';

alter table g_comercial.comentarios
  drop constraint if exists comentarios_alcance_comentario_check,
  drop constraint if exists comentarios_scope_reference_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'comentarios_alcance_comentario_check'
      and conrelid = 'g_comercial.comentarios'::regclass
  ) then
    alter table g_comercial.comentarios drop constraint if exists comentarios_alcance_comentario_check;
alter table g_comercial.comentarios add constraint comentarios_alcance_comentario_check
      check (alcance_comentario in ('LINEA', 'ACTIVIDAD'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'comentarios_scope_reference_check'
      and conrelid = 'g_comercial.comentarios'::regclass
  ) then
    alter table g_comercial.comentarios drop constraint if exists comentarios_scope_reference_check;
alter table g_comercial.comentarios add constraint comentarios_scope_reference_check
      check (
        (alcance_comentario = 'LINEA' and promocion_id is not null)
        or
        (alcance_comentario = 'ACTIVIDAD' and campana_id is not null)
      );
  end if;
end;
$$;

create index if not exists idx_comentarios_campana on g_comercial.comentarios(campana_id);
create index if not exists idx_comentarios_alcance on g_comercial.comentarios(alcance_comentario);
create index if not exists idx_comentarios_legacy_row_id on g_comercial.comentarios(legacy_row_id);

-- =========================================================
-- 5. Nuevas tablas operativas
-- =========================================================

create table if not exists g_comercial.responsables_solicitudes (
  id uuid primary key default gen_random_uuid(),
  responsable_id text not null unique,
  nombre text not null,
  area text not null default '',
  correo text not null default '',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint responsables_solicitudes_nombre_required check (length(trim(nombre)) > 0)
);

create table if not exists g_comercial.jerarquia_categorias (
  dep_id text primary key,
  dep_desc text not null default '',
  division text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jerarquia_categorias_division_required check (length(trim(division)) > 0)
);

create table if not exists g_comercial.avances_catalogo (
  id uuid primary key default gen_random_uuid(),
  avance_id text not null unique,
  campana_id uuid references g_comercial.campanas(id) on delete cascade,
  catalogo_id text not null default '',
  catalogo text not null default '',
  comprador_id text not null default '',
  buyer_id uuid references g_comercial.compradores(id) on delete set null,
  comprador text not null default '',
  division text not null default '',
  estado text not null default 'Pendiente' check (estado in ('Pendiente', 'Terminado')),
  fecha_estado timestamptz not null default now(),
  usuario text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists responsables_solicitudes_set_updated_at on g_comercial.responsables_solicitudes;
create trigger responsables_solicitudes_set_updated_at before update on g_comercial.responsables_solicitudes
for each row execute function g_comercial.set_updated_at();

drop trigger if exists jerarquia_categorias_set_updated_at on g_comercial.jerarquia_categorias;
create trigger jerarquia_categorias_set_updated_at before update on g_comercial.jerarquia_categorias
for each row execute function g_comercial.set_updated_at();

drop trigger if exists avances_catalogo_set_updated_at on g_comercial.avances_catalogo;
create trigger avances_catalogo_set_updated_at before update on g_comercial.avances_catalogo
for each row execute function g_comercial.set_updated_at();

drop trigger if exists avances_catalogo_audit_row_change on g_comercial.avances_catalogo;
create trigger avances_catalogo_audit_row_change after insert or update or delete on g_comercial.avances_catalogo
for each row execute function g_comercial.audit_business_row_change();

create index if not exists idx_responsables_solicitudes_activo on g_comercial.responsables_solicitudes(activo);
create index if not exists idx_jerarquia_categorias_division on g_comercial.jerarquia_categorias(division);
create index if not exists idx_avances_catalogo_campana on g_comercial.avances_catalogo(campana_id);
create index if not exists idx_avances_catalogo_catalogo_id on g_comercial.avances_catalogo(catalogo_id);
create index if not exists idx_avances_catalogo_buyer on g_comercial.avances_catalogo(buyer_id);
create index if not exists idx_avances_catalogo_estado on g_comercial.avances_catalogo(estado);

-- =========================================================
-- 6. Vistas actualizadas
-- =========================================================

drop view if exists g_comercial.consolidado;
drop view if exists g_comercial.export_pricing;
drop view if exists g_comercial.export_mercadeo;
drop view if exists g_comercial.export_planimetria;

create or replace view g_comercial.consolidado
with (security_invoker = true) as
with comentarios_actividad as (
  select
    campana_id,
    string_agg(estado || ': ' || comentario, ' | ' order by fecha) as comentarios_actividad,
    count(*) filter (where estado = 'ABIERTO') as comentarios_actividad_abiertos
  from g_comercial.comentarios
  where alcance_comentario = 'ACTIVIDAD'
  group by campana_id
)
select
  c.legacy_actividad_id as actividad_id,
  p.oferta_id,
  c.tipo_actividad,
  c.canal,
  p.alcance_tipo,
  p.alcance_valor,
  b.comprador,
  b.division,
  p.tipo_promo,
  p.grupo_oferta,
  p.tipo_sku,
  p.variante,
  p.sku,
  p.num_parte,
  p.descripcion,
  p.tipo_cantidad,
  p.cantidad_minima,
  p.precio_antes,
  p.precio_ahora,
  p.descuento,
  p.comentario_comprador,
  p.aplica_segmento,
  p.segmento_cliente,
  case when p.aplica_segmento = 'SI' then p.segmento_cliente else 'Todos' end as segmento,
  p.estado_registro,
  count(cm.id) filter (where cm.estado = 'ABIERTO') as comentarios_abiertos,
  count(cm.id) as total_comentarios,
  coalesce(ca.comentarios_actividad, '') as comentarios_actividad,
  coalesce(ca.comentarios_actividad_abiertos, 0) as comentarios_actividad_abiertos,
  p.usuario_crea,
  p.usuario_edita,
  p.updated_at as fecha_modificacion,
  p.ultima_modificacion_por
from g_comercial.promociones p
join g_comercial.campanas c on c.id = p.campana_id
join g_comercial.compradores b on b.id = p.buyer_id
left join g_comercial.comentarios cm
  on cm.promocion_id = p.id
  and cm.alcance_comentario = 'LINEA'
left join comentarios_actividad ca on ca.campana_id = p.campana_id
group by c.legacy_actividad_id, p.oferta_id, c.tipo_actividad, c.canal, p.alcance_tipo,
  p.alcance_valor, b.comprador, b.division, p.tipo_promo, p.grupo_oferta, p.tipo_sku,
  p.variante, p.sku, p.num_parte, p.descripcion, p.tipo_cantidad, p.cantidad_minima,
  p.precio_antes, p.precio_ahora, p.descuento, p.comentario_comprador, p.aplica_segmento,
  p.segmento_cliente, p.estado_registro, ca.comentarios_actividad,
  ca.comentarios_actividad_abiertos, p.usuario_crea, p.usuario_edita, p.updated_at, p.ultima_modificacion_por;

create or replace view g_comercial.export_pricing
with (security_invoker = true) as
with comentarios_actividad as (
  select
    campana_id,
    string_agg(estado || ': ' || comentario, ' | ' order by fecha) as comentarios_actividad
  from g_comercial.comentarios
  where alcance_comentario = 'ACTIVIDAD'
  group by campana_id
)
select
  c.legacy_actividad_id as actividad_id,
  p.oferta_id,
  c.tipo_actividad,
  c.canal,
  p.alcance_tipo,
  p.alcance_valor,
  b.comprador,
  p.tipo_promo,
  p.grupo_oferta,
  p.tipo_sku,
  p.variante,
  p.sku,
  p.tipo_cantidad,
  p.cantidad_minima,
  p.precio_antes,
  p.precio_ahora,
  p.descuento,
  p.aplica_segmento,
  p.segmento_cliente,
  case when p.aplica_segmento = 'SI' then p.segmento_cliente else 'Todos' end as segmento,
  p.estado_registro,
  coalesce(ca.comentarios_actividad, '') as comentarios_actividad
from g_comercial.promociones p
join g_comercial.campanas c on c.id = p.campana_id
join g_comercial.compradores b on b.id = p.buyer_id
left join comentarios_actividad ca on ca.campana_id = p.campana_id;

create or replace view g_comercial.export_mercadeo
with (security_invoker = true) as
with comentarios_actividad as (
  select
    campana_id,
    string_agg(estado || ': ' || comentario, ' | ' order by fecha) as comentarios_actividad
  from g_comercial.comentarios
  where alcance_comentario = 'ACTIVIDAD'
  group by campana_id
)
select
  c.legacy_actividad_id as actividad_id,
  p.oferta_id,
  c.tipo_actividad,
  c.canal,
  p.alcance_tipo,
  p.alcance_valor,
  b.comprador,
  p.tipo_promo,
  p.grupo_oferta,
  p.variante,
  p.sku,
  p.num_parte,
  p.descripcion,
  p.precio_antes,
  p.precio_ahora,
  p.descuento,
  p.comentario_comprador,
  p.aplica_segmento,
  p.segmento_cliente,
  case when p.aplica_segmento = 'SI' then p.segmento_cliente else 'Todos' end as segmento,
  coalesce(ca.comentarios_actividad, '') as comentarios_actividad,
  string_agg(cm.comentario, ' | ' order by cm.fecha) filter (where cm.estado = 'ABIERTO') as comentarios_abiertos_mercadeo
from g_comercial.promociones p
join g_comercial.campanas c on c.id = p.campana_id
join g_comercial.compradores b on b.id = p.buyer_id
left join g_comercial.comentarios cm
  on cm.promocion_id = p.id
  and cm.alcance_comentario = 'LINEA'
left join comentarios_actividad ca on ca.campana_id = p.campana_id
group by c.legacy_actividad_id, p.oferta_id, c.tipo_actividad, c.canal, p.alcance_tipo,
  p.alcance_valor, b.comprador, p.tipo_promo, p.grupo_oferta, p.variante, p.sku,
  p.num_parte, p.descripcion, p.precio_antes, p.precio_ahora, p.descuento,
  p.comentario_comprador, p.aplica_segmento, p.segmento_cliente, ca.comentarios_actividad;

create or replace view g_comercial.export_planimetria
with (security_invoker = true) as
with comentarios_actividad as (
  select
    campana_id,
    string_agg(estado || ': ' || comentario, ' | ' order by fecha) as comentarios_actividad
  from g_comercial.comentarios
  where alcance_comentario = 'ACTIVIDAD'
  group by campana_id
)
select
  c.legacy_actividad_id as actividad_id,
  p.oferta_id,
  c.tipo_actividad,
  c.canal,
  p.alcance_tipo,
  p.alcance_valor,
  b.comprador,
  b.division,
  p.tipo_promo,
  p.grupo_oferta,
  p.variante,
  p.sku,
  p.descripcion,
  p.precio_antes,
  p.precio_ahora,
  p.descuento,
  p.aplica_segmento,
  p.segmento_cliente,
  case when p.aplica_segmento = 'SI' then p.segmento_cliente else 'Todos' end as segmento,
  coalesce(ca.comentarios_actividad, '') as comentarios_actividad
from g_comercial.promociones p
join g_comercial.campanas c on c.id = p.campana_id
join g_comercial.compradores b on b.id = p.buyer_id
left join comentarios_actividad ca on ca.campana_id = p.campana_id;

-- =========================================================
-- 7. Grants y RLS para nuevas tablas
-- =========================================================

grant select, insert, update, delete on
  g_comercial.responsables_solicitudes,
  g_comercial.jerarquia_categorias,
  g_comercial.avances_catalogo
to authenticated;

grant select on
  g_comercial.consolidado,
  g_comercial.export_pricing,
  g_comercial.export_mercadeo,
  g_comercial.export_planimetria
to authenticated;

alter table g_comercial.responsables_solicitudes enable row level security;
alter table g_comercial.jerarquia_categorias enable row level security;
alter table g_comercial.avances_catalogo enable row level security;

drop policy if exists responsables_solicitudes_select_roles on g_comercial.responsables_solicitudes;
create policy responsables_solicitudes_select_roles on g_comercial.responsables_solicitudes for select
to authenticated
using (g_comercial.current_user_role() is not null);

drop policy if exists responsables_solicitudes_admin_mercadeo_all on g_comercial.responsables_solicitudes;
create policy responsables_solicitudes_admin_mercadeo_all on g_comercial.responsables_solicitudes for all
to authenticated
using (g_comercial.is_any_role(array['ADMIN', 'MERCADEO']))
with check (g_comercial.is_any_role(array['ADMIN', 'MERCADEO']));

drop policy if exists jerarquia_categorias_select_roles on g_comercial.jerarquia_categorias;
create policy jerarquia_categorias_select_roles on g_comercial.jerarquia_categorias for select
to authenticated
using (g_comercial.current_user_role() is not null);

drop policy if exists jerarquia_categorias_admin_all on g_comercial.jerarquia_categorias;
create policy jerarquia_categorias_admin_all on g_comercial.jerarquia_categorias for all
to authenticated
using (g_comercial.is_role('ADMIN'))
with check (g_comercial.is_role('ADMIN'));

drop policy if exists avances_catalogo_select_roles on g_comercial.avances_catalogo;
create policy avances_catalogo_select_roles on g_comercial.avances_catalogo for select
to authenticated
using (
  g_comercial.is_any_role(array['ADMIN', 'MERCADEO', 'PRICING', 'PLANIMETRIA'])
  or buyer_id = g_comercial.current_buyer_id()
);

drop policy if exists avances_catalogo_write_owner_admin_mercadeo on g_comercial.avances_catalogo;
create policy avances_catalogo_write_owner_admin_mercadeo on g_comercial.avances_catalogo for all
to authenticated
using (
  g_comercial.is_any_role(array['ADMIN', 'MERCADEO'])
  or buyer_id = g_comercial.current_buyer_id()
)
with check (
  g_comercial.is_any_role(array['ADMIN', 'MERCADEO'])
  or buyer_id = g_comercial.current_buyer_id()
);

-- =========================================================
-- 8. Ajuste de politicas para comentarios de actividad
-- =========================================================

drop policy if exists comentarios_select_roles on g_comercial.comentarios;
create policy comentarios_select_roles on g_comercial.comentarios for select
to authenticated
using (
  g_comercial.is_any_role(array['ADMIN', 'MERCADEO', 'PRICING', 'PLANIMETRIA'])
  or exists (
    select 1
    from g_comercial.promociones p
    where p.id = promocion_id
      and p.buyer_id = g_comercial.current_buyer_id()
  )
  or exists (
    select 1
    from g_comercial.campanas c
    where c.id = campana_id
      and c.solicitante_buyer_id = g_comercial.current_buyer_id()
  )
);

drop policy if exists comentarios_insert_mercadeo_admin on g_comercial.comentarios;
create policy comentarios_insert_mercadeo_admin on g_comercial.comentarios for insert
to authenticated
with check (g_comercial.is_any_role(array['ADMIN', 'MERCADEO']));

drop policy if exists comentarios_update_mercadeo_admin on g_comercial.comentarios;
create policy comentarios_update_mercadeo_admin on g_comercial.comentarios for update
to authenticated
using (g_comercial.is_any_role(array['ADMIN', 'MERCADEO']))
with check (g_comercial.is_any_role(array['ADMIN', 'MERCADEO']));

-- =========================================================
-- 9. Opcional: retirar sku_master de Supabase
-- =========================================================
-- Si ejecutaste el esquema anterior, esta linea bloquea el uso de sku_master desde la API autenticada.
-- La tabla queda inaccesible para la app aunque exista en la base.
do $$
begin
  if to_regclass('g_comercial.sku_master') is not null then
    revoke all on table g_comercial.sku_master from authenticated;
  end if;
end;
$$;

-- Si ademas quieres eliminar la tabla, ejecuta manualmente esta linea despues de confirmar
-- que no tiene datos ni dependencias:
-- drop table if exists g_comercial.sku_master;
--
-- Recomendacion operativa:
-- mantener el maestro SKU fuera de Supabase y cargarlo temporalmente desde archivo ERP en la sesion
-- de trabajo del comprador, como hace actualmente la app.



-- =====================================================================
-- STEP: supabase_roles_permissions_mvp.sql
-- =====================================================================

-- Roles y politicas RLS para el MVP de Gestion de Promociones.
-- Ejecutar en Supabase SQL Editor despues de crear los usuarios en Authentication.

begin;

-- 1) Actualizar catalogo de roles en g_comercial.usuarios_app.
alter table g_comercial.usuarios_app
  drop constraint if exists usuarios_app_rol_check;

alter table g_comercial.usuarios_app
  drop constraint if exists usuarios_app_buyer_required;

update g_comercial.usuarios_app
set rol = case upper(trim(rol))
  when 'ADMINISTRADOR' then 'ADMIN'
  when 'COMPRADOR' then 'BUYER'
  when 'COMP' then 'BUYER'
  when 'MERCADEO' then 'MARK'
  when 'MARKETING' then 'MARK'
  when 'PRICING' then 'OPER'
  when 'PRICE' then 'OPER'
  when 'PLANIMETRIA' then 'OPER'
  when 'EJECUTOR' then 'OPER'
  when 'AUDITOR' then 'AUD'
  when 'AUT' then 'AUD'
  when 'CDD' then 'DISENADOR'
  when 'DISEÃ‘ADOR' then 'DISENADOR'
  when 'DISEÑADOR' then 'DISENADOR'
  when 'DESIGNER' then 'DISENADOR'
  else upper(trim(rol))
end;

do $$
declare
  v_invalid_roles text;
begin
  select string_agg(distinct rol, ', ' order by rol)
  into v_invalid_roles
  from g_comercial.usuarios_app
  where rol not in ('ADMIN', 'BUYER', 'MARK', 'OPER', 'AUD', 'DISENADOR');

  if v_invalid_roles is not null then
    raise exception 'Roles no reconocidos en g_comercial.usuarios_app: %. Actualice el bloque de normalizacion antes de crear usuarios_app_rol_check.', v_invalid_roles;
  end if;
end;
$$;

alter table g_comercial.usuarios_app drop constraint if exists usuarios_app_rol_check;
alter table g_comercial.usuarios_app add constraint usuarios_app_rol_check
  check (rol in ('ADMIN', 'BUYER', 'MARK', 'OPER', 'AUD', 'DISENADOR'));

alter table g_comercial.usuarios_app drop constraint if exists usuarios_app_buyer_required;
alter table g_comercial.usuarios_app add constraint usuarios_app_buyer_required
  check (rol <> 'BUYER' or buyer_id is not null);

alter table g_comercial.compradores
  add column if not exists comprador_id text,
  add column if not exists categoria_comprador text not null default 'Senior',
  add column if not exists senior_id text not null default '';

-- 2) Funciones auxiliares usadas por RLS.
create or replace function g_comercial.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select rol
  from g_comercial.usuarios_app
  where auth_user_id = auth.uid()
    and activo = true
  limit 1;
$$;

create or replace function g_comercial.current_buyer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select buyer_id
  from g_comercial.usuarios_app
  where auth_user_id = auth.uid()
    and activo = true
  limit 1;
$$;

create or replace function g_comercial.current_buyer_scope_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  with current_buyer as (
    select c.*
    from g_comercial.compradores c
    where c.id = g_comercial.current_buyer_id()
      and c.activo = true
    limit 1
  ),
  buyer_scope as (
    select c.id
    from g_comercial.compradores c
    cross join current_buyer cb
    where c.activo = true
      and (
        c.id = cb.id
        or exists (
          select 1
          from regexp_split_to_table(coalesce(c.senior_id, ''), '[;,|]+') as ref(value)
          where btrim(ref.value) in (cb.id::text, cb.comprador_id, cb.comprador, cb.correo)
        )
        or exists (
          select 1
          from regexp_split_to_table(coalesce(cb.senior_id, ''), '[;,|]+') as ref(value)
          where btrim(ref.value) in (c.id::text, c.comprador_id, c.comprador, c.correo)
        )
      )
  )
  select coalesce(array_agg(distinct id), array[]::uuid[])
  from buyer_scope;
$$;

create or replace function g_comercial.is_role(required_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select g_comercial.current_user_role() = required_role;
$$;

create or replace function g_comercial.is_any_role(required_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select g_comercial.current_user_role() = any(required_roles);
$$;

create or replace function g_comercial.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from g_comercial.usuarios_app
  where auth_user_id = auth.uid()
    and activo = true
  limit 1;
$$;

create or replace function g_comercial.current_user_label()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(nombre, ''), nullif(email, ''), '')
  from g_comercial.usuarios_app
  where auth_user_id = auth.uid()
    and activo = true
  limit 1;
$$;

create or replace function g_comercial.is_comment_scope_closed(
  p_promocion_id uuid,
  p_campana_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select
      p.estado_registro as promocion_estado,
      coalesce(cp.estado, ca.estado) as campana_estado
    from (select 1) seed
    left join g_comercial.promociones p on p.id = p_promocion_id
    left join g_comercial.campanas cp on cp.id = p.campana_id
    left join g_comercial.campanas ca on ca.id = p_campana_id
  )
  select coalesce(bool_or(
    upper(coalesce(promocion_estado, '')) in ('CERRADO', 'ANULADO')
    or upper(coalesce(campana_estado, '')) in ('CERRADO', 'CANCELADO', 'FINALIZADO', 'ARCHIVADO')
  ), false)
  from target;
$$;

create or replace function g_comercial.can_write_comment_scope(
  p_promocion_id uuid,
  p_campana_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with current_user_data as (
    select
      id,
      buyer_id,
      rol,
      lower(trim(coalesce(nombre, ''))) as nombre,
      lower(trim(coalesce(email, ''))) as email
    from g_comercial.usuarios_app
    where auth_user_id = auth.uid()
      and activo = true
    limit 1
  ),
  target as (
    select
      p.id as promocion_id,
      p.buyer_id as promocion_buyer_id,
      coalesce(cp.id, ca.id) as campana_id,
      coalesce(cp.solicitante_buyer_id, ca.solicitante_buyer_id) as solicitante_buyer_id,
      coalesce(cp.tipo_actividad, ca.tipo_actividad, '') as tipo_actividad,
      lower(trim(coalesce(cp.responsable, ca.responsable, ''))) as responsable
    from (select 1) seed
    left join g_comercial.promociones p on p.id = p_promocion_id
    left join g_comercial.campanas cp on cp.id = p.campana_id
    left join g_comercial.campanas ca on ca.id = p_campana_id
  )
  select coalesce((
    select
      u.rol = 'ADMIN'
      or (
        u.rol = 'BUYER'
        and (
          t.promocion_buyer_id = any(g_comercial.current_buyer_scope_ids())
          or t.solicitante_buyer_id = any(g_comercial.current_buyer_scope_ids())
        )
      )
      or (
        u.rol = 'MARK'
        and t.campana_id is not null
        -- Compatibilidad MVP: sin responsable explicito, Mercadeo opera como flujo general.
        and (
          t.tipo_actividad = 'CATALOGO'
          or nullif(t.responsable, '') is null
          or t.responsable in (u.nombre, u.email)
        )
      )
    from current_user_data u
    cross join target t
  ), false);
$$;

create or replace function g_comercial.enforce_comentarios_update_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean := g_comercial.is_role('ADMIN');
  v_current_user_id uuid := g_comercial.current_app_user_id();
  v_current_label text := lower(trim(g_comercial.current_user_label()));
  v_is_author boolean := false;
  v_in_author_window boolean := false;
begin
  if v_is_admin then
    return new;
  end if;

  if g_comercial.is_comment_scope_closed(old.promocion_id, old.campana_id)
    or g_comercial.is_comment_scope_closed(new.promocion_id, new.campana_id) then
    raise exception 'Los comentarios de promociones o campanas cerradas solo admiten anexos nuevos.'
      using errcode = '42501';
  end if;

  if old.promocion_id is distinct from new.promocion_id
    or old.campana_id is distinct from new.campana_id
    or old.legacy_row_id is distinct from new.legacy_row_id
    or old.alcance_comentario is distinct from new.alcance_comentario
    or old.legacy_comentario_id is distinct from new.legacy_comentario_id
    or old.usuario_id is distinct from new.usuario_id
    or old.usuario is distinct from new.usuario
    or old.tipo_usuario is distinct from new.tipo_usuario
    or old.fecha is distinct from new.fecha
    or old.created_at is distinct from new.created_at then
    raise exception 'No autorizado para reasignar, reautorizar o mover comentarios existentes.'
      using errcode = '42501';
  end if;

  if old.comentario is distinct from new.comentario then
    v_is_author := old.usuario_id = v_current_user_id
      or (
        old.usuario_id is null
        and nullif(v_current_label, '') is not null
        and lower(trim(old.usuario)) = v_current_label
      );
    v_in_author_window := old.created_at >= now() - interval '30 minutes';

    if not (v_is_author and v_in_author_window) then
      raise exception 'Solo el autor puede editar el texto del comentario durante los primeros 30 minutos.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists comentarios_enforce_update_rules on g_comercial.comentarios;
create trigger comentarios_enforce_update_rules before update on g_comercial.comentarios
for each row execute function g_comercial.enforce_comentarios_update_rules();

create or replace function g_comercial.insert_audit_log(
  p_entidad text,
  p_accion text,
  p_entidad_id uuid default null,
  p_registro text default '',
  p_campo text default '',
  p_valor_anterior text default '',
  p_valor_nuevo text default '',
  p_campana_id uuid default null,
  p_promocion_id uuid default null,
  p_request_id text default '',
  p_operation_id text default '',
  p_origen text default 'db',
  p_contexto jsonb default '{}'::jsonb,
  p_fecha_cierre timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log_id uuid;
  v_usuario_id uuid;
  v_usuario text := '';
  v_rol text := '';
begin
  select id, coalesce(nullif(nombre, ''), nullif(email, ''), ''), rol
  into v_usuario_id, v_usuario, v_rol
  from g_comercial.usuarios_app
  where auth_user_id = auth.uid()
    and activo = true
  limit 1;

  if v_usuario_id is null or nullif(v_rol, '') is null then
    raise exception 'No hay usuario activo autorizado para registrar auditoria.'
      using errcode = '42501';
  end if;

  if nullif(p_entidad, '') is null or nullif(p_accion, '') is null then
    raise exception 'La auditoria requiere entidad y accion.';
  end if;

  insert into g_comercial.logs (
    usuario_id, actor_auth_user_id, usuario, rol, entidad, entidad_id, registro,
    campana_id, promocion_id, accion, campo, valor_anterior, valor_nuevo,
    request_id, operation_id, origen, contexto, created_at, fecha_cierre
  )
  values (
    v_usuario_id, auth.uid(), v_usuario, v_rol, p_entidad, p_entidad_id, coalesce(p_registro, ''),
    p_campana_id, p_promocion_id, p_accion, coalesce(p_campo, ''), coalesce(p_valor_anterior, ''),
    coalesce(p_valor_nuevo, ''), coalesce(nullif(p_request_id, ''), gen_random_uuid()::text),
    coalesce(p_operation_id, ''), coalesce(nullif(p_origen, ''), 'db'), coalesce(p_contexto, '{}'::jsonb),
    clock_timestamp(), p_fecha_cierre
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$;

revoke execute on function g_comercial.insert_audit_log(text, text, uuid, text, text, text, text, uuid, uuid, text, text, text, jsonb, timestamptz) from public, authenticated, anon;

create or replace function g_comercial.logs_prevent_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Los logs de auditoria son append-only y no pueden modificarse ni eliminarse.'
    using errcode = '42501';
end;
$$;

create or replace function g_comercial.audit_business_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  v_row jsonb := coalesce(v_new, v_old);
  v_entidad text := upper(tg_table_name);
  v_entidad_id uuid := nullif(v_row ->> 'id', '')::uuid;
  v_registro text := coalesce(nullif(v_row ->> 'legacy_row_id', ''), nullif(v_row ->> 'legacy_actividad_id', ''), nullif(v_row ->> 'avance_id', ''), nullif(v_row ->> 'catalogo_id', ''), nullif(v_row ->> 'campo', ''), v_entidad_id::text, '');
  v_campana_id uuid;
  v_promocion_id uuid;
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and v_old = v_new then
    return new;
  end if;

  v_campana_id := nullif(v_row ->> 'campana_id', '')::uuid;
  v_promocion_id := nullif(v_row ->> 'promocion_id', '')::uuid;

  if tg_table_name = 'campanas' then
    v_campana_id := v_entidad_id;
  elsif tg_table_name = 'promociones' then
    v_promocion_id := v_entidad_id;
    v_campana_id := nullif(v_row ->> 'campana_id', '')::uuid;
  elsif tg_table_name = 'promociones_detalle' then
    v_promocion_id := nullif(v_row ->> 'promocion_id', '')::uuid;
    select campana_id into v_campana_id from g_comercial.promociones where id = v_promocion_id;
  elsif tg_table_name = 'comentarios' then
    v_promocion_id := nullif(v_row ->> 'promocion_id', '')::uuid;
    if v_promocion_id is not null then
      select campana_id into v_campana_id from g_comercial.promociones where id = v_promocion_id;
    end if;
  end if;

  perform g_comercial.insert_audit_log(
    p_entidad => v_entidad,
    p_accion => tg_op,
    p_entidad_id => v_entidad_id,
    p_registro => v_registro,
    p_campo => '*',
    p_valor_anterior => coalesce(v_old::text, ''),
    p_valor_nuevo => coalesce(v_new::text, ''),
    p_campana_id => v_campana_id,
    p_promocion_id => v_promocion_id,
    p_operation_id => coalesce(current_setting('app.operation_id', true), ''),
    p_origen => 'trigger',
    p_contexto => jsonb_build_object(
      'schema', tg_table_schema,
      'table', tg_table_name,
      'operation', tg_op,
      'old', v_old,
      'new', v_new
    )
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- 3) RLS basico por roles nuevos.
alter table g_comercial.compradores enable row level security;
alter table g_comercial.usuarios_app enable row level security;
alter table g_comercial.configuracion enable row level security;
alter table g_comercial.campanas enable row level security;
alter table g_comercial.segmentos_clientes enable row level security;
alter table g_comercial.sku_master enable row level security;
alter table g_comercial.promociones enable row level security;
alter table g_comercial.promociones_detalle enable row level security;
alter table g_comercial.comentarios enable row level security;
alter table g_comercial.logs enable row level security;
alter table g_comercial.notificaciones enable row level security;
alter table if exists g_comercial.responsables_solicitudes enable row level security;
alter table if exists g_comercial.jerarquia_categorias enable row level security;
alter table if exists g_comercial.avances_catalogo enable row level security;

alter table g_comercial.logs
  add column if not exists actor_auth_user_id uuid,
  add column if not exists rol text not null default '',
  add column if not exists registro text not null default '',
  add column if not exists operation_id text not null default '',
  add column if not exists origen text not null default 'db',
  add column if not exists contexto jsonb not null default '{}'::jsonb;

grant select, insert, update, delete on
  g_comercial.compradores,
  g_comercial.usuarios_app,
  g_comercial.configuracion,
  g_comercial.campanas,
  g_comercial.segmentos_clientes,
  g_comercial.promociones,
  g_comercial.promociones_detalle,
  g_comercial.comentarios,
  g_comercial.notificaciones
to authenticated;

grant select on g_comercial.logs to authenticated;
revoke insert, update, delete on g_comercial.logs from authenticated;

grant select, insert, update, delete on
  g_comercial.responsables_solicitudes,
  g_comercial.jerarquia_categorias,
  g_comercial.avances_catalogo
to authenticated;

drop trigger if exists logs_prevent_update on g_comercial.logs;
create trigger logs_prevent_update before update on g_comercial.logs
for each row execute function g_comercial.logs_prevent_mutation();

drop trigger if exists logs_prevent_delete on g_comercial.logs;
create trigger logs_prevent_delete before delete on g_comercial.logs
for each row execute function g_comercial.logs_prevent_mutation();

drop trigger if exists campanas_audit_row_change on g_comercial.campanas;
create trigger campanas_audit_row_change after insert or update or delete on g_comercial.campanas
for each row execute function g_comercial.audit_business_row_change();

drop trigger if exists promociones_audit_row_change on g_comercial.promociones;
create trigger promociones_audit_row_change after insert or update or delete on g_comercial.promociones
for each row execute function g_comercial.audit_business_row_change();

drop trigger if exists promociones_detalle_audit_row_change on g_comercial.promociones_detalle;
create trigger promociones_detalle_audit_row_change after insert or update or delete on g_comercial.promociones_detalle
for each row execute function g_comercial.audit_business_row_change();

drop trigger if exists comentarios_audit_row_change on g_comercial.comentarios;
create trigger comentarios_audit_row_change after insert or update or delete on g_comercial.comentarios
for each row execute function g_comercial.audit_business_row_change();

drop trigger if exists avances_catalogo_audit_row_change on g_comercial.avances_catalogo;
create trigger avances_catalogo_audit_row_change after insert or update or delete on g_comercial.avances_catalogo
for each row execute function g_comercial.audit_business_row_change();

drop policy if exists compradores_select_authenticated on g_comercial.compradores;
create policy compradores_select_authenticated on g_comercial.compradores for select
to authenticated
using (g_comercial.current_user_role() is not null);

drop policy if exists compradores_admin_all on g_comercial.compradores;
create policy compradores_admin_all on g_comercial.compradores for all
to authenticated
using (g_comercial.is_role('ADMIN'))
with check (g_comercial.is_role('ADMIN'));

drop policy if exists usuarios_select_self_or_admin on g_comercial.usuarios_app;
create policy usuarios_select_self_or_admin on g_comercial.usuarios_app for select
to authenticated
using (auth_user_id = auth.uid() or g_comercial.is_role('ADMIN'));

drop policy if exists usuarios_admin_all on g_comercial.usuarios_app;
create policy usuarios_admin_all on g_comercial.usuarios_app for all
to authenticated
using (g_comercial.is_role('ADMIN'))
with check (g_comercial.is_role('ADMIN'));

drop policy if exists configuracion_read_authenticated on g_comercial.configuracion;
create policy configuracion_read_authenticated on g_comercial.configuracion for select
to authenticated
using (g_comercial.current_user_role() is not null);

drop policy if exists configuracion_admin_all on g_comercial.configuracion;
create policy configuracion_admin_all on g_comercial.configuracion for all
to authenticated
using (g_comercial.is_role('ADMIN'))
with check (g_comercial.is_role('ADMIN'));

drop policy if exists campanas_select_roles on g_comercial.campanas;
create policy campanas_select_roles on g_comercial.campanas for select
to authenticated
using (g_comercial.is_any_role(array['ADMIN', 'BUYER', 'MARK', 'OPER']));

drop policy if exists campanas_write_admin_buyer on g_comercial.campanas;
drop policy if exists campanas_write_admin_mercadeo_comprador on g_comercial.campanas;
drop policy if exists campanas_write_admin_buyer on g_comercial.campanas;
create policy campanas_write_admin_buyer on g_comercial.campanas for insert
to authenticated
with check (
  g_comercial.is_role('ADMIN')
  or (g_comercial.is_role('BUYER') and solicitante_buyer_id = any(g_comercial.current_buyer_scope_ids()))
);

drop policy if exists campanas_update_admin_buyer on g_comercial.campanas;
drop policy if exists campanas_update_admin_mercadeo_comprador on g_comercial.campanas;
drop policy if exists campanas_update_admin_buyer on g_comercial.campanas;
create policy campanas_update_admin_buyer on g_comercial.campanas for update
to authenticated
using (
  g_comercial.is_role('ADMIN')
  or (g_comercial.is_role('BUYER') and solicitante_buyer_id = any(g_comercial.current_buyer_scope_ids()))
)
with check (
  g_comercial.is_role('ADMIN')
  or (g_comercial.is_role('BUYER') and solicitante_buyer_id = any(g_comercial.current_buyer_scope_ids()))
);

drop policy if exists segmentos_read_authenticated on g_comercial.segmentos_clientes;
create policy segmentos_read_authenticated on g_comercial.segmentos_clientes for select
to authenticated
using (g_comercial.current_user_role() is not null);

drop policy if exists segmentos_admin_all on g_comercial.segmentos_clientes;
create policy segmentos_admin_all on g_comercial.segmentos_clientes for all
to authenticated
using (g_comercial.is_role('ADMIN'))
with check (g_comercial.is_role('ADMIN'));

drop policy if exists responsables_solicitudes_select_roles on g_comercial.responsables_solicitudes;
create policy responsables_solicitudes_select_roles on g_comercial.responsables_solicitudes for select
to authenticated
using (g_comercial.current_user_role() is not null);

drop policy if exists responsables_solicitudes_admin_all on g_comercial.responsables_solicitudes;
create policy responsables_solicitudes_admin_all on g_comercial.responsables_solicitudes for all
to authenticated
using (g_comercial.is_role('ADMIN'))
with check (g_comercial.is_role('ADMIN'));

drop policy if exists jerarquia_categorias_select_roles on g_comercial.jerarquia_categorias;
create policy jerarquia_categorias_select_roles on g_comercial.jerarquia_categorias for select
to authenticated
using (g_comercial.current_user_role() is not null);

drop policy if exists jerarquia_categorias_admin_all on g_comercial.jerarquia_categorias;
create policy jerarquia_categorias_admin_all on g_comercial.jerarquia_categorias for all
to authenticated
using (g_comercial.is_role('ADMIN'))
with check (g_comercial.is_role('ADMIN'));

drop policy if exists sku_master_select_roles on g_comercial.sku_master;
create policy sku_master_select_roles on g_comercial.sku_master for select
to authenticated
using (
  g_comercial.is_any_role(array['ADMIN', 'MARK', 'OPER'])
  or (g_comercial.is_role('BUYER') and buyer_id = g_comercial.current_buyer_id())
);

drop policy if exists sku_master_write_owner_or_admin on g_comercial.sku_master;
create policy sku_master_write_owner_or_admin on g_comercial.sku_master for all
to authenticated
using (g_comercial.is_role('ADMIN') or (g_comercial.is_role('BUYER') and buyer_id = g_comercial.current_buyer_id()))
with check (g_comercial.is_role('ADMIN') or (g_comercial.is_role('BUYER') and buyer_id = g_comercial.current_buyer_id()));

drop policy if exists promociones_select_roles on g_comercial.promociones;
create policy promociones_select_roles on g_comercial.promociones for select
to authenticated
using (
  g_comercial.is_any_role(array['ADMIN', 'MARK', 'OPER'])
  or (g_comercial.is_role('BUYER') and buyer_id = any(g_comercial.current_buyer_scope_ids()))
);

drop policy if exists promociones_insert_buyer_admin on g_comercial.promociones;
create policy promociones_insert_buyer_admin on g_comercial.promociones for insert
to authenticated
with check (
  g_comercial.is_role('ADMIN')
  or (g_comercial.is_role('BUYER') and buyer_id = any(g_comercial.current_buyer_scope_ids()))
);

drop policy if exists promociones_update_buyer_admin on g_comercial.promociones;
create policy promociones_update_buyer_admin on g_comercial.promociones for update
to authenticated
using (
  g_comercial.is_role('ADMIN')
  or (g_comercial.is_role('BUYER') and buyer_id = any(g_comercial.current_buyer_scope_ids()))
)
with check (
  g_comercial.is_role('ADMIN')
  or (g_comercial.is_role('BUYER') and buyer_id = any(g_comercial.current_buyer_scope_ids()))
);

drop policy if exists promociones_delete_admin_owner on g_comercial.promociones;
create policy promociones_delete_admin_owner on g_comercial.promociones for delete
to authenticated
using (
  g_comercial.is_role('ADMIN')
  or (g_comercial.is_role('BUYER') and buyer_id = any(g_comercial.current_buyer_scope_ids()) and estado_registro = 'BORRADOR')
);

drop policy if exists promociones_detalle_select_roles on g_comercial.promociones_detalle;
create policy promociones_detalle_select_roles on g_comercial.promociones_detalle for select
to authenticated
using (
  exists (
    select 1
    from g_comercial.promociones p
    where p.id = promocion_id
      and (
        g_comercial.is_any_role(array['ADMIN', 'MARK', 'OPER'])
        or (g_comercial.is_role('BUYER') and p.buyer_id = any(g_comercial.current_buyer_scope_ids()))
      )
  )
);

drop policy if exists promociones_detalle_write_owner_admin on g_comercial.promociones_detalle;
create policy promociones_detalle_write_owner_admin on g_comercial.promociones_detalle for all
to authenticated
using (
  g_comercial.is_role('ADMIN')
  or exists (
    select 1
    from g_comercial.promociones p
    where p.id = promocion_id
      and g_comercial.is_role('BUYER')
      and p.buyer_id = any(g_comercial.current_buyer_scope_ids())
  )
)
with check (
  g_comercial.is_role('ADMIN')
  or exists (
    select 1
    from g_comercial.promociones p
    where p.id = promocion_id
      and g_comercial.is_role('BUYER')
      and p.buyer_id = any(g_comercial.current_buyer_scope_ids())
  )
);

drop policy if exists avances_catalogo_select_roles on g_comercial.avances_catalogo;
create policy avances_catalogo_select_roles on g_comercial.avances_catalogo for select
to authenticated
using (
  g_comercial.is_any_role(array['ADMIN', 'MARK', 'OPER'])
  or (g_comercial.is_role('BUYER') and buyer_id = any(g_comercial.current_buyer_scope_ids()))
);

drop policy if exists avances_catalogo_write_owner_admin on g_comercial.avances_catalogo;
create policy avances_catalogo_write_owner_admin on g_comercial.avances_catalogo for all
to authenticated
using (
  g_comercial.is_role('ADMIN')
  or (g_comercial.is_role('BUYER') and buyer_id = any(g_comercial.current_buyer_scope_ids()))
)
with check (
  g_comercial.is_role('ADMIN')
  or (g_comercial.is_role('BUYER') and buyer_id = any(g_comercial.current_buyer_scope_ids()))
);

drop policy if exists comentarios_select_roles on g_comercial.comentarios;
create policy comentarios_select_roles on g_comercial.comentarios for select
to authenticated
using (
  g_comercial.is_any_role(array['ADMIN', 'MARK', 'OPER'])
  or exists (
    select 1 from g_comercial.promociones p
    where p.id = promocion_id
      and g_comercial.is_role('BUYER')
      and p.buyer_id = any(g_comercial.current_buyer_scope_ids())
  )
  or exists (
    select 1 from g_comercial.campanas c
    where c.id = campana_id
      and g_comercial.is_role('BUYER')
      and c.solicitante_buyer_id = any(g_comercial.current_buyer_scope_ids())
  )
);

drop policy if exists comentarios_insert_mark_buyer_admin on g_comercial.comentarios;
create policy comentarios_insert_mark_buyer_admin on g_comercial.comentarios for insert
to authenticated
with check (
  g_comercial.can_write_comment_scope(promocion_id, campana_id)
  and usuario_id = g_comercial.current_app_user_id()
);

drop policy if exists comentarios_update_mark_buyer_admin on g_comercial.comentarios;
create policy comentarios_update_mark_buyer_admin on g_comercial.comentarios for update
to authenticated
using (g_comercial.can_write_comment_scope(promocion_id, campana_id))
with check (g_comercial.can_write_comment_scope(promocion_id, campana_id));

drop policy if exists logs_select_roles on g_comercial.logs;
create policy logs_select_roles on g_comercial.logs for select
to authenticated
using (g_comercial.is_any_role(array['ADMIN', 'AUD']));

drop policy if exists notificaciones_select_roles on g_comercial.notificaciones;
create policy notificaciones_select_roles on g_comercial.notificaciones for select
to authenticated
using (g_comercial.is_role('ADMIN'));

drop policy if exists notificaciones_admin_all on g_comercial.notificaciones;
create policy notificaciones_admin_all on g_comercial.notificaciones for all
to authenticated
using (g_comercial.is_role('ADMIN'))
with check (g_comercial.is_role('ADMIN'));

commit;

-- 4) Ejemplo para asociar un usuario Auth a la app:
-- insert into g_comercial.usuarios_app (auth_user_id, nombre, email, rol, buyer_id, activo)
-- values ('UUID_DE_AUTH_USERS', 'Nombre Apellido', 'correo@sinsa.com', 'BUYER', 'UUID_DE_COMPRADOR', true);



-- =====================================================================
-- STEP: supabase_special_request_status_cleanup.sql
-- =====================================================================

-- Corrige estados de solicitudes especiales y permite archivar.
-- Ejecutar en Supabase SQL Editor antes de guardar solicitudes con estado Archivado.

alter table g_comercial.campanas
  drop constraint if exists campanas_estado_operativo_check;

alter table g_comercial.campanas
  drop constraint if exists campanas_estado_check;

alter table g_comercial.campanas drop constraint if exists campanas_estado_operativo_check;
alter table g_comercial.campanas add constraint campanas_estado_operativo_check
  check (estado in (
    'Preliminar', 'Borrador', 'Activo', 'Cerrado',
    'PRELIMINAR', 'BORRADOR', 'ACTIVO', 'CERRADO', 'CANCELADO',
    'Nuevo', 'Aprobado', 'Aprovado', 'En trabajo', 'Finalizado', 'Archivado'
  ));

update g_comercial.campanas
set estado = 'Aprobado'
where estado = 'Aprovado';



-- =====================================================================
-- STEP: supabase_add_catalog_status_preliminar.sql
-- =====================================================================

-- Permite usar el estado "Preliminar" en catalogos/campanas.
-- Ejecutar en Supabase SQL Editor solo si al guardar un catalogo con estado
-- Preliminar aparece un error de restriccion/check sobre campanas.estado.

alter table g_comercial.campanas
  drop constraint if exists campanas_estado_operativo_check;

alter table g_comercial.campanas
  drop constraint if exists campanas_estado_check;

alter table g_comercial.campanas drop constraint if exists campanas_estado_operativo_check;
alter table g_comercial.campanas add constraint campanas_estado_operativo_check
  check (estado in (
    'Preliminar', 'Borrador', 'Activo', 'Cerrado',
    'PRELIMINAR', 'BORRADOR', 'ACTIVO', 'CERRADO', 'CANCELADO',
    'Nuevo', 'Aprobado', 'Aprovado', 'En trabajo', 'Finalizado', 'Archivado'
  ));



-- =====================================================================
-- STEP: supabase_promociones_optimistic_concurrency.sql
-- =====================================================================

-- Control de concurrencia optimista para promociones.
-- Ejecutar antes de reemplazar la funcion save_catalog_transactional actualizada.

alter table g_comercial.promociones
  add column if not exists version bigint not null default 1;

alter table g_comercial.promociones
  drop constraint if exists promociones_version_positive_check;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'promociones_version_positive_check'
      and conrelid = 'g_comercial.promociones'::regclass
  ) then
    alter table g_comercial.promociones drop constraint if exists promociones_version_positive_check;
alter table g_comercial.promociones add constraint promociones_version_positive_check
      check (version > 0);
  end if;
end;
$$;



-- =====================================================================
-- STEP: supabase_require_activity_id.sql
-- =====================================================================

-- Refuerzo de integridad para impedir campanas sin actividad_id legada.
-- Ejecutar en Supabase SQL Editor antes o junto con docs/supabase_transactional_save_rpc.sql.

do $$
begin
  if exists (
    select 1
    from g_comercial.campanas
    where legacy_actividad_id is null
       or length(trim(legacy_actividad_id)) = 0
  ) then
    raise exception 'No se puede activar la restriccion: existen campanas con legacy_actividad_id vacio.';
  end if;
end $$;

alter table g_comercial.campanas
  alter column legacy_actividad_id set not null;

alter table g_comercial.campanas
  drop constraint if exists campanas_legacy_actividad_id_required;

alter table g_comercial.campanas drop constraint if exists campanas_legacy_actividad_id_required;
alter table g_comercial.campanas add constraint campanas_legacy_actividad_id_required
  check (length(trim(legacy_actividad_id)) > 0);

-- La relacion obligatoria de promociones hacia campanas ya existe en el esquema:
-- g_comercial.promociones.campana_id uuid not null references g_comercial.campanas(id).



-- =====================================================================
-- STEP: supabase_transactional_save_rpc.sql
-- =====================================================================

-- Guardado transaccional para el Sistema de Gestion de Promociones Retail.
-- Ejecutar en Supabase SQL Editor despues de:
-- 1. docs/supabase_schema.sql
-- 2. docs/supabase_delta_operativo_2026_06_22.sql
-- 3. docs/supabase_roles_permissions_mvp.sql
-- 4. docs/supabase_promociones_optimistic_concurrency.sql (si la base ya existia)
--
-- La app llama esta funcion por RPC. PostgreSQL ejecuta la funcion completa
-- dentro de una sola transaccion: si una sentencia falla, no queda guardado parcial.

create table if not exists g_comercial.save_operations (
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

alter table g_comercial.save_operations add column if not exists auth_user_id uuid;
alter table g_comercial.save_operations add column if not exists operation_type text not null default '';
alter table g_comercial.save_operations add column if not exists payload_hash text not null default '';
alter table g_comercial.save_operations add column if not exists status text not null default 'PROCESSING';
alter table g_comercial.save_operations add column if not exists response jsonb;
alter table g_comercial.save_operations add column if not exists created_at timestamptz not null default now();
alter table g_comercial.save_operations add column if not exists finished_at timestamptz;
alter table g_comercial.save_operations add column if not exists expires_at timestamptz;

update g_comercial.save_operations
set auth_user_id = '00000000-0000-0000-0000-000000000000'::uuid
where auth_user_id is null;

update g_comercial.save_operations
set status = 'SUCCEEDED'
where response is not null
  and (status is null or status = '' or status = 'PROCESSING');

update g_comercial.save_operations
set status = 'PROCESSING'
where status is null or status = '';

update g_comercial.save_operations
set status = 'FAILED'
where status not in ('PROCESSING', 'SUCCEEDED', 'FAILED');

update g_comercial.save_operations
set expires_at = coalesce(finished_at, created_at, now()) + interval '7 days'
where expires_at is null;

alter table g_comercial.save_operations alter column auth_user_id set not null;
alter table g_comercial.save_operations alter column expires_at set not null;
alter table g_comercial.save_operations alter column expires_at set default (now() + interval '30 minutes');

do $$
begin
  alter table g_comercial.save_operations drop constraint if exists save_operations_pkey;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'g_comercial.save_operations'::regclass
      and conname = 'save_operations_status_check'
  ) then
    alter table g_comercial.save_operations drop constraint if exists save_operations_status_check;
alter table g_comercial.save_operations add constraint save_operations_status_check
      check (status in ('PROCESSING', 'SUCCEEDED', 'FAILED'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'g_comercial.save_operations'::regclass
      and conname = 'save_operations_pkey'
  ) then
    alter table g_comercial.save_operations drop constraint if exists save_operations_pkey;
alter table g_comercial.save_operations add constraint save_operations_pkey primary key (auth_user_id, operation_id);
  end if;
end $$;

create index if not exists idx_save_operations_operation_id
  on g_comercial.save_operations(operation_id);

create index if not exists idx_save_operations_expires_at
  on g_comercial.save_operations(expires_at);

alter table g_comercial.promociones
  add column if not exists usuario_crea text not null default '',
  add column if not exists usuario_edita text not null default '',
  add column if not exists numero_pagina integer default null;

alter table g_comercial.save_operations enable row level security;
revoke all on table g_comercial.save_operations from anon;
revoke all on table g_comercial.save_operations from authenticated;

create or replace function g_comercial.cleanup_save_operations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cleaned integer := 0;
  v_count integer := 0;
begin
  update g_comercial.save_operations
  set status = 'FAILED',
      finished_at = coalesce(finished_at, now()),
      expires_at = now() + interval '7 days'
  where status = 'PROCESSING'
    and expires_at < now();

  get diagnostics v_count = row_count;
  v_cleaned := v_cleaned + v_count;

  delete from g_comercial.save_operations
  where status in ('SUCCEEDED', 'FAILED')
    and expires_at < now();

  get diagnostics v_count = row_count;
  v_cleaned := v_cleaned + v_count;

  return v_cleaned;
end;
$$;

revoke execute on function g_comercial.cleanup_save_operations() from public;
revoke execute on function g_comercial.cleanup_save_operations() from anon;
revoke execute on function g_comercial.cleanup_save_operations() from authenticated;

create or replace function g_comercial.save_catalog_transactional(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_role text := g_comercial.current_user_role();
  v_current_user_id uuid := g_comercial.current_app_user_id();
  v_current_buyer_id uuid := g_comercial.current_buyer_id();
  v_current_buyer_scope_ids uuid[] := g_comercial.current_buyer_scope_ids();
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
  from g_comercial.usuarios_app
  where auth_user_id = auth.uid()
    and activo = true
  limit 1;

  if v_current_buyer_id is not null then
    select coalesce(comprador, ''), coalesce(comprador_id, ''), coalesce(division, '')
    into v_current_buyer_name, v_current_buyer_legacy_id, v_current_buyer_division
    from g_comercial.compradores
    where id = v_current_buyer_id
    limit 1;
  end if;

  if v_operation_id is not null then
    perform g_comercial.cleanup_save_operations();

    insert into g_comercial.save_operations (auth_user_id, operation_id, operation_type, payload_hash, status, expires_at)
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
      from g_comercial.save_operations
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
          insert into g_comercial.compradores (comprador_id, categoria_comprador, comprador, division, correo, senior_id, activo)
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
          insert into g_comercial.compradores (comprador_id, categoria_comprador, comprador, division, correo, senior_id, activo)
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
      from g_comercial.campanas c
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
        from g_comercial.compradores c
        where c.id = (coalesce(v_row ->> 'solicitante_buyer_id', v_row ->> 'buyer_id'))::uuid
        limit 1;
      elsif coalesce(v_row ->> 'solicitante_buyer_id', v_row ->> 'buyer_id', '') <> '' then
        select c.id into v_buyer_id
        from g_comercial.compradores c
        where c.comprador_id = coalesce(v_row ->> 'solicitante_buyer_id', v_row ->> 'buyer_id')
        limit 1;
      end if;

      -- 2. Si ya existía en g_comercial.campanas, heredar el comprador previo si aún no se tiene
      if v_buyer_id is null and v_campana_id is not null then
        v_buyer_id := v_existing_solicitante_buyer_id;
      end if;

      -- 3. Búsqueda por texto (nombre de comprador o correo)
      if v_buyer_id is null and v_solicitante_text is not null then
        -- 3a. Coincidencia exacta
        select c.id into v_buyer_id
        from g_comercial.compradores c
        where c.comprador = v_solicitante_text
        limit 1;

        -- 3b. Coincidencia sin distinción de mayúsculas / espacios
        if v_buyer_id is null then
          select c.id into v_buyer_id
          from g_comercial.compradores c
          where lower(trim(c.comprador)) = lower(trim(v_solicitante_text))
             or lower(trim(c.correo)) = lower(trim(v_solicitante_text))
          limit 1;
        end if;

        -- 3c. Coincidencia ortográfica/fonética común (s/z, tildes)
        if v_buyer_id is null then
          select c.id into v_buyer_id
          from g_comercial.compradores c
          where replace(translate(lower(trim(c.comprador)), 'áéíóúàèìòùz', 'aeiouaeious'), ' ', '') =
                replace(translate(lower(trim(v_solicitante_text)), 'áéíóúàèìòùz', 'aeiouaeious'), ' ', '')
          limit 1;
        end if;

        -- 3d. Coincidencia por correo que contenga el nombre/apellido
        if v_buyer_id is null and length(v_solicitante_text) > 3 then
          select c.id into v_buyer_id
          from g_comercial.compradores c
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

      insert into g_comercial.campanas as c (
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
        insert into g_comercial.responsables_solicitudes (responsable_id, nombre, area, correo, activo)
        values (v_id, coalesce(v_row ->> 'nombre', ''), coalesce(v_row ->> 'area', ''), coalesce(v_row ->> 'correo', ''), coalesce(nullif(v_row ->> 'activo', '')::boolean, true))
        on conflict (responsable_id) do update set nombre = excluded.nombre, area = excluded.area, correo = excluded.correo, activo = excluded.activo, updated_at = now();
      end if;
    end loop;

    for v_row in select value from jsonb_array_elements(coalesce(p_payload -> 'jerarquia_categorias', '[]'::jsonb)) loop
      v_id := coalesce(nullif(v_row ->> 'dep_id', ''), nullif(v_row ->> 'depId', ''));
      if v_id <> '' and (v_jerarquia_sync is null or v_id = any(v_changed_jerarquia)) then
        insert into g_comercial.jerarquia_categorias (dep_id, dep_desc, division, activo)
        values (v_id, coalesce(v_row ->> 'dep_desc', ''), coalesce(v_row ->> 'division', ''), coalesce(nullif(v_row ->> 'activo', '')::boolean, true))
        on conflict (dep_id) do update set dep_desc = excluded.dep_desc, division = excluded.division, activo = excluded.activo, updated_at = now();
      end if;
    end loop;

    for v_row in select value from jsonb_array_elements(coalesce(p_payload -> 'segmentos_clientes', '[]'::jsonb)) loop
      v_id := coalesce(nullif(v_row ->> 'segmento_id', ''), nullif(v_row ->> 'id', ''));
      if v_id <> '' and (v_segmento_sync is null or v_id = any(v_changed_segmentos)) then
        insert into g_comercial.segmentos_clientes (legacy_segmento_id, canal, nombre_segmento, activo, orden)
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
      from g_comercial.promociones p
      left join g_comercial.campanas c on c.id = p.campana_id
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

    delete from g_comercial.comentarios c
    using g_comercial.promociones p
    where c.promocion_id = p.id
      and p.legacy_row_id = any(v_deleted_promos)
      and (v_is_admin or p.buyer_id = any(v_current_buyer_scope_ids));

    delete from g_comercial.promociones_detalle d
    using g_comercial.promociones p
    where d.promocion_id = p.id
      and p.legacy_row_id = any(v_deleted_promos)
      and (v_is_admin or p.buyer_id = any(v_current_buyer_scope_ids));

    delete from g_comercial.promociones p
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
          'numero_pagina', p.numero_pagina,
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
      from g_comercial.promociones p
      left join g_comercial.campanas c on c.id = p.campana_id
      left join g_comercial.compradores b on b.id = p.buyer_id
      where p.legacy_row_id = v_id
      for update of p;

      select c.id, c.solicitante_buyer_id, c.tipo_actividad
      into v_target_campana_id, v_target_solicitante_buyer_id, v_activity_type
      from g_comercial.campanas c
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
        select id into v_buyer_id from g_comercial.compradores where id = (v_row ->> 'buyer_id')::uuid limit 1;
      end if;
      v_buyer_id := coalesce(v_buyer_id, v_existing_buyer_id);

      if v_buyer_id is null and nullif(v_row ->> 'comprador_id', '') is not null then
        select id into v_buyer_id from g_comercial.compradores where comprador_id = v_row ->> 'comprador_id' limit 1;
      end if;

      if v_buyer_id is null and nullif(v_row ->> 'comprador', '') is not null then
        select id into v_buyer_id from g_comercial.compradores where comprador = v_row ->> 'comprador' limit 1;
        if v_buyer_id is null then
          select id into v_buyer_id from g_comercial.compradores where lower(trim(comprador)) = lower(trim(v_row ->> 'comprador')) limit 1;
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

      insert into g_comercial.promociones as p (
        legacy_row_id, campana_id, oferta_id, buyer_id, tipo_promo, grupo_oferta, tipo_sku,
        variante, sku, numero_pagina, num_parte, descripcion, tipo_cantidad, cantidad_minima, precio_antes,
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
        nullif(v_row ->> 'numero_pagina', '')::integer,
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
        numero_pagina = excluded.numero_pagina,
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
      from g_comercial.promociones p
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

    delete from g_comercial.promociones_detalle d
    using g_comercial.promociones p
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
      from g_comercial.promociones
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
        insert into g_comercial.promociones_detalle (promocion_id, campo, valor)
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
        join g_comercial.campanas c on c.legacy_actividad_id = t.actividad_id
        left join g_comercial.promociones p
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
        from g_comercial.promociones
        where legacy_row_id = v_row ->> 'row_id'
        for update;

        if v_promo_id is null then
          raise exception 'Comentario % apunta a una promocion inexistente (%).', v_id, v_row ->> 'row_id';
        end if;

      else
        select id, solicitante_buyer_id into v_campana_id, v_target_solicitante_buyer_id
        from g_comercial.campanas
        where legacy_actividad_id = v_row ->> 'actividad_id'
        for update;

        if v_campana_id is null then
          raise exception 'Comentario % apunta a una actividad inexistente (%).', v_id, v_row ->> 'actividad_id';
        end if;

      end if;

      if not g_comercial.can_write_comment_scope(v_promo_id, v_campana_id) then
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
      from g_comercial.comentarios c
      left join g_comercial.promociones p on p.id = c.promocion_id
      left join g_comercial.campanas ca on ca.id = c.campana_id
      where c.legacy_comentario_id = v_id
      for update of c;

      if v_comentario_id is not null then
        if not g_comercial.can_write_comment_scope(v_existing_comment_promocion_id, v_existing_comment_campana_id) then
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

        if g_comercial.is_comment_scope_closed(v_existing_comment_promocion_id, v_existing_comment_campana_id)
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
        insert into g_comercial.comentarios (
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
        update g_comercial.comentarios set
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
        select id into v_campana_id from g_comercial.campanas where legacy_actividad_id = coalesce(v_row ->> 'actividad_id', v_row ->> 'catalogo_id') limit 1;
        if v_campana_id is not null and coalesce(v_row ->> 'correo', '') <> '' then
          insert into g_comercial.notificaciones (campana_id, correo, tipo, activo)
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
      from g_comercial.avances_catalogo a
      where a.avance_id = v_id
      for update;

      select id into v_campana_id
      from g_comercial.campanas
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
        select id into v_buyer_id from g_comercial.compradores where id = (v_row ->> 'buyer_id')::uuid limit 1;
      end if;
      v_buyer_id := coalesce(v_buyer_id, v_existing_buyer_id);

      if v_buyer_id is null and nullif(v_row ->> 'comprador_id', '') is not null then
        select id into v_buyer_id from g_comercial.compradores where comprador_id = v_row ->> 'comprador_id' limit 1;
      end if;

      if v_buyer_id is null and nullif(v_row ->> 'comprador', '') is not null then
        select id into v_buyer_id from g_comercial.compradores where comprador = v_row ->> 'comprador' limit 1;
        if v_buyer_id is null then
          select id into v_buyer_id from g_comercial.compradores where lower(trim(comprador)) = lower(trim(v_row ->> 'comprador')) limit 1;
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

      insert into g_comercial.avances_catalogo as a (
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
    update g_comercial.save_operations
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

revoke execute on function g_comercial.save_catalog_transactional(jsonb) from public;
revoke execute on function g_comercial.save_catalog_transactional(jsonb) from anon;
grant execute on function g_comercial.save_catalog_transactional(jsonb) to authenticated;



-- =====================================================================
-- STEP: supabase_lazy_loading_promotions.sql
-- =====================================================================

-- Carga bajo demanda de promociones.
-- Ejecutar en Supabase SQL Editor despues de los scripts base del proyecto.
--
-- Objetivo:
-- 1. Evitar que el inicio de sesion descargue promociones historicas o no usadas.
-- 2. Mantener catalogos/actividades operativas disponibles para navegar.
-- 3. Dar conteos livianos para Inicio y Avances sin traer detalle de promociones.

create index if not exists idx_campanas_bootstrap_estado_tipo
on g_comercial.campanas(tipo_actividad, estado, created_at);

create index if not exists idx_promociones_scope
on g_comercial.promociones(campana_id, buyer_id, tipo_promo, created_at);

create index if not exists idx_promociones_scope_sku
on g_comercial.promociones(campana_id, buyer_id, tipo_promo, sku);

create index if not exists idx_comentarios_promocion_fecha
on g_comercial.comentarios(promocion_id, fecha);

create index if not exists idx_comentarios_campana_alcance_fecha
on g_comercial.comentarios(campana_id, alcance_comentario, fecha);

create index if not exists idx_avances_catalogo_scope
on g_comercial.avances_catalogo(campana_id, buyer_id, estado);

create or replace view g_comercial.v_catalogos_operativos
with (security_invoker = true) as
select c.*
from g_comercial.campanas c
where coalesce(c.estado, '') not in (
  'Archivado', 'Archivada', 'ARCHIVADO', 'ARCHIVADA',
  'Cancelado', 'Cancelada', 'CANCELADO', 'CANCELADA',
  'Cerrado', 'Cerrada', 'CERRADO', 'CERRADA',
  'Finalizado', 'Finalizada', 'FINALIZADO', 'FINALIZADA',
  'Resuelto', 'Resuelta', 'RESUELTO', 'RESUELTA'
);

create or replace view g_comercial.v_catalogo_resumen
with (security_invoker = true) as
select
  c.id as campana_id,
  c.legacy_actividad_id as actividad_id,
  c.tipo_actividad,
  c.estado,
  p.buyer_id,
  b.comprador_id,
  coalesce(b.comprador, '') as comprador,
  coalesce(j.division, b.division, '') as division,
  count(p.id)::integer as promociones_count,
  count(distinct p.oferta_id)::integer as ofertas_count,
  count(distinct p.sku)::integer as skus_count,
  count(cm.id) filter (where cm.estado = 'ABIERTO')::integer as comentarios_abiertos_count
from g_comercial.v_catalogos_operativos c
left join g_comercial.promociones p on p.campana_id = c.id
left join g_comercial.compradores b on b.id = p.buyer_id
left join g_comercial.jerarquia_categorias j on j.dep_id = p.dep_id
left join g_comercial.comentarios cm
  on cm.promocion_id = p.id
  and cm.alcance_comentario = 'LINEA'
group by
  c.id,
  c.legacy_actividad_id,
  c.tipo_actividad,
  c.estado,
  p.buyer_id,
  b.comprador_id,
  b.comprador,
  coalesce(j.division, b.division, '');

grant select on
  g_comercial.v_catalogos_operativos,
  g_comercial.v_catalogo_resumen
to authenticated;



-- =====================================================================
-- STEP: supabase_add_numero_pagina.sql
-- =====================================================================

-- =============================================================================
-- Migración Supabase: Agregar columna "numero_pagina" a g_comercial.promociones
-- =============================================================================
-- Propósito:
-- Permite al equipo de Compras comunicar a Mercadeo en qué página de catálogo
-- solicitan o sugieren que aparezcan los SKUs cargados.
-- Es un campo opcional (puede ser NULL o vacío).
-- =============================================================================

-- 1. Asegurar columnas requeridas en usuarios_app y promociones si la base ya existía
ALTER TABLE g_comercial.usuarios_app
  ADD COLUMN IF NOT EXISTS buyer_id uuid REFERENCES g_comercial.compradores(id);

ALTER TABLE g_comercial.promociones
  ADD COLUMN IF NOT EXISTS buyer_id uuid REFERENCES g_comercial.compradores(id);

ALTER TABLE g_comercial.promociones
  ADD COLUMN IF NOT EXISTS numero_pagina INTEGER DEFAULT NULL;

COMMENT ON COLUMN g_comercial.promociones.numero_pagina IS 'Número de página de catálogo sugerido u ordenado por el comprador para Mercadeo/Diseño.';

-- 2. Eliminar vistas previas con CASCADE para evitar el error 42P16 (cannot drop columns from view)
DROP VIEW IF EXISTS g_comercial.export_planimetria CASCADE;
DROP VIEW IF EXISTS g_comercial.export_mercadeo CASCADE;
DROP VIEW IF EXISTS g_comercial.export_pricing CASCADE;
DROP VIEW IF EXISTS g_comercial.consolidado CASCADE;

-- 3. Recrear las vistas incluyendo numero_pagina y comentarios de actividad
CREATE OR REPLACE VIEW g_comercial.consolidado
WITH (security_invoker = true) AS
WITH comentarios_actividad AS (
  SELECT
    campana_id,
    string_agg(estado || ': ' || comentario, ' | ' ORDER BY fecha) AS comentarios_actividad,
    count(*) FILTER (WHERE estado = 'ABIERTO') AS comentarios_actividad_abiertos
  FROM g_comercial.comentarios
  WHERE alcance_comentario = 'ACTIVIDAD'
  GROUP BY campana_id
)
SELECT
  c.legacy_actividad_id AS actividad_id,
  p.oferta_id,
  c.tipo_actividad,
  c.canal,
  p.alcance_tipo,
  p.alcance_valor,
  b.comprador,
  b.division,
  p.tipo_promo,
  p.grupo_oferta,
  p.tipo_sku,
  p.variante,
  p.sku,
  p.numero_pagina,
  p.num_parte,
  p.descripcion,
  p.tipo_cantidad,
  p.cantidad_minima,
  p.precio_antes,
  p.precio_ahora,
  p.descuento,
  p.comentario_comprador,
  p.aplica_segmento,
  p.segmento_cliente,
  CASE WHEN p.aplica_segmento = 'SI' THEN p.segmento_cliente ELSE 'Todos' END AS segmento,
  p.estado_registro,
  count(cm.id) FILTER (WHERE cm.estado = 'ABIERTO') AS comentarios_abiertos,
  count(cm.id) AS total_comentarios,
  coalesce(ca.comentarios_actividad, '') AS comentarios_actividad,
  coalesce(ca.comentarios_actividad_abiertos, 0) AS comentarios_actividad_abiertos,
  p.usuario_crea,
  p.usuario_edita,
  p.updated_at AS fecha_modificacion,
  p.ultima_modificacion_por
FROM g_comercial.promociones p
JOIN g_comercial.campanas c ON c.id = p.campana_id
JOIN g_comercial.compradores b ON b.id = p.buyer_id
LEFT JOIN g_comercial.comentarios cm
  ON cm.promocion_id = p.id
  AND cm.alcance_comentario = 'LINEA'
LEFT JOIN comentarios_actividad ca ON ca.campana_id = p.campana_id
GROUP BY c.legacy_actividad_id, p.oferta_id, c.tipo_actividad, c.canal, p.alcance_tipo,
  p.alcance_valor, b.comprador, b.division, p.tipo_promo, p.grupo_oferta, p.tipo_sku,
  p.variante, p.sku, p.numero_pagina, p.num_parte, p.descripcion, p.tipo_cantidad, p.cantidad_minima,
  p.precio_antes, p.precio_ahora, p.descuento, p.comentario_comprador, p.aplica_segmento,
  p.segmento_cliente, p.estado_registro, ca.comentarios_actividad,
  ca.comentarios_actividad_abiertos, p.usuario_crea, p.usuario_edita, p.updated_at, p.ultima_modificacion_por;

CREATE OR REPLACE VIEW g_comercial.export_pricing
WITH (security_invoker = true) AS
WITH comentarios_actividad AS (
  SELECT
    campana_id,
    string_agg(estado || ': ' || comentario, ' | ' ORDER BY fecha) AS comentarios_actividad
  FROM g_comercial.comentarios
  WHERE alcance_comentario = 'ACTIVIDAD'
  GROUP BY campana_id
)
SELECT
  c.legacy_actividad_id AS actividad_id,
  p.oferta_id,
  c.tipo_actividad,
  c.canal,
  p.alcance_tipo,
  p.alcance_valor,
  b.comprador,
  p.tipo_promo,
  p.grupo_oferta,
  p.tipo_sku,
  p.variante,
  p.sku,
  p.tipo_cantidad,
  p.cantidad_minima,
  p.precio_antes,
  p.precio_ahora,
  p.descuento,
  p.aplica_segmento,
  p.segmento_cliente,
  CASE WHEN p.aplica_segmento = 'SI' THEN p.segmento_cliente ELSE 'Todos' END AS segmento,
  p.estado_registro,
  coalesce(ca.comentarios_actividad, '') AS comentarios_actividad
FROM g_comercial.promociones p
JOIN g_comercial.campanas c ON c.id = p.campana_id
JOIN g_comercial.compradores b ON b.id = p.buyer_id
LEFT JOIN comentarios_actividad ca ON ca.campana_id = p.campana_id;

CREATE OR REPLACE VIEW g_comercial.export_mercadeo
WITH (security_invoker = true) AS
WITH comentarios_actividad AS (
  SELECT
    campana_id,
    string_agg(estado || ': ' || comentario, ' | ' ORDER BY fecha) AS comentarios_actividad
  FROM g_comercial.comentarios
  WHERE alcance_comentario = 'ACTIVIDAD'
  GROUP BY campana_id
)
SELECT
  c.legacy_actividad_id AS actividad_id,
  p.oferta_id,
  c.tipo_actividad,
  c.canal,
  p.alcance_tipo,
  p.alcance_valor,
  b.comprador,
  p.tipo_promo,
  p.grupo_oferta,
  p.variante,
  p.sku,
  p.numero_pagina,
  p.num_parte,
  p.descripcion,
  p.precio_antes,
  p.precio_ahora,
  p.descuento,
  p.comentario_comprador,
  p.aplica_segmento,
  p.segmento_cliente,
  CASE WHEN p.aplica_segmento = 'SI' THEN p.segmento_cliente ELSE 'Todos' END AS segmento,
  coalesce(ca.comentarios_actividad, '') AS comentarios_actividad,
  string_agg(cm.comentario, ' | ' ORDER BY cm.fecha) FILTER (WHERE cm.estado = 'ABIERTO') AS comentarios_abiertos_mercadeo
FROM g_comercial.promociones p
JOIN g_comercial.campanas c ON c.id = p.campana_id
JOIN g_comercial.compradores b ON b.id = p.buyer_id
LEFT JOIN g_comercial.comentarios cm
  ON cm.promocion_id = p.id
  AND cm.alcance_comentario = 'LINEA'
LEFT JOIN comentarios_actividad ca ON ca.campana_id = p.campana_id
GROUP BY c.legacy_actividad_id, p.oferta_id, c.tipo_actividad, c.canal, p.alcance_tipo,
  p.alcance_valor, b.comprador, p.tipo_promo, p.grupo_oferta, p.variante, p.sku,
  p.numero_pagina, p.num_parte, p.descripcion, p.precio_antes, p.precio_ahora, p.descuento,
  p.comentario_comprador, p.aplica_segmento, p.segmento_cliente, ca.comentarios_actividad;

CREATE OR REPLACE VIEW g_comercial.export_planimetria
WITH (security_invoker = true) AS
WITH comentarios_actividad AS (
  SELECT
    campana_id,
    string_agg(estado || ': ' || comentario, ' | ' ORDER BY fecha) AS comentarios_actividad
  FROM g_comercial.comentarios
  WHERE alcance_comentario = 'ACTIVIDAD'
  GROUP BY campana_id
)
SELECT
  c.legacy_actividad_id AS actividad_id,
  p.oferta_id,
  c.tipo_actividad,
  c.canal,
  p.alcance_tipo,
  p.alcance_valor,
  b.comprador,
  b.division,
  p.tipo_promo,
  p.grupo_oferta,
  p.variante,
  p.sku,
  p.descripcion,
  p.precio_antes,
  p.precio_ahora,
  p.descuento,
  p.aplica_segmento,
  p.segmento_cliente,
  CASE WHEN p.aplica_segmento = 'SI' THEN p.segmento_cliente ELSE 'Todos' END AS segmento,
  p.estado_registro,
  coalesce(ca.comentarios_actividad, '') AS comentarios_actividad
FROM g_comercial.promociones p
JOIN g_comercial.campanas c ON c.id = p.campana_id
JOIN g_comercial.compradores b ON b.id = p.buyer_id
LEFT JOIN comentarios_actividad ca ON ca.campana_id = p.campana_id;

-- 4. Grants de permisos sobre las vistas actualizadas
GRANT SELECT ON
  g_comercial.consolidado,
  g_comercial.export_pricing,
  g_comercial.export_mercadeo,
  g_comercial.export_planimetria
TO authenticated;

-- 5. Verificación
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'g_comercial'
      AND table_name = 'promociones'
      AND column_name = 'numero_pagina'
  ) THEN
    RAISE NOTICE 'Migración completada exitosamente: columna numero_pagina y vistas actualizadas.';
  END IF;
END $$;



-- =====================================================================
-- STEP: supabase_sku_master.sql
-- =====================================================================

-- ====================================================================
-- SCRIPT: Creación de tabla sku_master y funciones RPC en Supabase
-- Sistema de Gestión de Promociones Retail
-- ====================================================================

-- 1. Eliminar tabla previa obsoleta si existe (para recrear con la nueva estructura de columnas)
DROP TABLE IF EXISTS g_comercial.sku_master CASCADE;

-- 2. Crear tabla sku_master con las columnas solicitadas
CREATE TABLE g_comercial.sku_master (
  sku VARCHAR(50) PRIMARY KEY,
  num_parte VARCHAR(100),            -- VPN / Número de parte (Columna O / 15)
  descripcion TEXT NOT NULL,         -- ITEM_DESC (Columna D / 4)
  dep_id VARCHAR(50),                -- DEPT / Departamento (Columna E / 5)
  unidad_medida VARCHAR(20),         -- STANDARD_UOM (Columna H / 8)
  proveedor TEXT,                    -- SUP_NAME (Columna K / 11)
  precio_regular NUMERIC(12, 2),     -- UNIT_RETAIL (Columna M / 13)
  activo BOOLEAN DEFAULT true,
  actualizado_el TIMESTAMPTZ DEFAULT NOW()
);

-- Comentarios de documentación
COMMENT ON TABLE g_comercial.sku_master IS 'Maestro de productos y SKU importado desde el catálogo ERP.';
COMMENT ON COLUMN g_comercial.sku_master.sku IS 'Código SKU principal del artículo (Columna A - ITEM).';
COMMENT ON COLUMN g_comercial.sku_master.num_parte IS 'Número de parte o VPN del fabricante (Columna O - VPN).';
COMMENT ON COLUMN g_comercial.sku_master.descripcion IS 'Descripción comercial del artículo (Columna D - ITEM_DESC).';
COMMENT ON COLUMN g_comercial.sku_master.dep_id IS 'Código del departamento o división (Columna E - DEPT).';
COMMENT ON COLUMN g_comercial.sku_master.unidad_medida IS 'Unidad de medida estándar (Columna H - STANDARD_UOM).';
COMMENT ON COLUMN g_comercial.sku_master.proveedor IS 'Nombre del proveedor (Columna K - SUP_NAME).';
COMMENT ON COLUMN g_comercial.sku_master.precio_regular IS 'Precio de venta regular / lista con IVA (Columna M - UNIT_RETAIL).';

-- 3. Índices para búsqueda de alta velocidad
create index if not exists idx_sku_master_sku ON g_comercial.sku_master (sku);
create index if not exists idx_sku_master_num_parte ON g_comercial.sku_master (num_parte);
create index if not exists idx_sku_master_dep_id ON g_comercial.sku_master (dep_id);

-- 4. Habilitar Row Level Security (RLS)
ALTER TABLE g_comercial.sku_master ENABLE ROW LEVEL SECURITY;

-- Política de lectura: cualquier usuario autenticado en la app puede consultar el catálogo
CREATE POLICY "Lectura sku_master para usuarios autenticados"
ON g_comercial.sku_master
FOR SELECT
TO authenticated
USING (true);

-- Política de escritura directa (restringida a administradores)
-- Valida auth_user_id o id contra auth.uid() para total compatibilidad
CREATE POLICY "Escritura sku_master para administradores"
ON g_comercial.sku_master
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM g_comercial.usuarios_app
    WHERE (g_comercial.usuarios_app.auth_user_id = auth.uid() OR g_comercial.usuarios_app.id = auth.uid())
      AND UPPER(g_comercial.usuarios_app.rol) = 'ADMIN'
      AND g_comercial.usuarios_app.activo = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM g_comercial.usuarios_app
    WHERE (g_comercial.usuarios_app.auth_user_id = auth.uid() OR g_comercial.usuarios_app.id = auth.uid())
      AND UPPER(g_comercial.usuarios_app.rol) = 'ADMIN'
      AND g_comercial.usuarios_app.activo = true
  )
);

-- ====================================================================
-- 5. RPC: clear_sku_master
-- Vacía por completo la tabla sku_master para recargar desde cero.
-- ====================================================================
CREATE OR REPLACE FUNCTION g_comercial.clear_sku_master()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count_before INTEGER;
BEGIN
  -- Contar registros actuales antes de limpiar
  SELECT COUNT(*) INTO v_count_before FROM g_comercial.sku_master;

  -- Borrar todos los registros
  DELETE FROM g_comercial.sku_master;

  RETURN jsonb_build_object(
    'ok', true,
    'deleted_count', v_count_before,
    'message', 'Tabla sku_master vaciada correctamente para recarga desde cero.',
    'cleared_at', NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION g_comercial.clear_sku_master() TO authenticated;

-- ====================================================================
-- 6. RPC: insert_sku_master_batch
-- Inserta un lote de filas de forma optimizada.
-- ====================================================================
CREATE OR REPLACE FUNCTION g_comercial.insert_sku_master_batch(p_rows JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INTEGER := 0;
BEGIN
  IF p_rows IS NULL OR jsonb_array_length(p_rows) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'inserted', 0);
  END IF;

  INSERT INTO g_comercial.sku_master (
    sku,
    num_parte,
    descripcion,
    dep_id,
    unidad_medida,
    proveedor,
    precio_regular,
    activo,
    actualizado_el
  )
  SELECT DISTINCT ON (TRIM(elem->>'sku'))
    TRIM(elem->>'sku'),
    COALESCE(NULLIF(TRIM(elem->>'num_parte'), ''), NULLIF(TRIM(elem->>'vpn'), '')),
    COALESCE(NULLIF(TRIM(elem->>'descripcion'), ''), 'Sin descripción'),
    NULLIF(TRIM(elem->>'dep_id'), ''),
    NULLIF(TRIM(elem->>'unidad_medida'), ''),
    NULLIF(TRIM(elem->>'proveedor'), ''),
    CASE 
      WHEN (elem->>'precio_regular') IS NOT NULL AND (elem->>'precio_regular') <> '' 
      THEN (elem->>'precio_regular')::NUMERIC 
      WHEN (elem->>'precio') IS NOT NULL AND (elem->>'precio') <> '' 
      THEN (elem->>'precio')::NUMERIC 
      ELSE NULL 
    END,
    COALESCE((elem->>'activo')::BOOLEAN, true),
    NOW()
  FROM jsonb_array_elements(p_rows) AS elem
  WHERE TRIM(elem->>'sku') IS NOT NULL AND TRIM(elem->>'sku') <> ''
  ORDER BY TRIM(elem->>'sku')
  ON CONFLICT (sku) DO UPDATE SET
    num_parte = EXCLUDED.num_parte,
    descripcion = EXCLUDED.descripcion,
    dep_id = EXCLUDED.dep_id,
    unidad_medida = EXCLUDED.unidad_medida,
    proveedor = EXCLUDED.proveedor,
    precio_regular = EXCLUDED.precio_regular,
    activo = EXCLUDED.activo,
    actualizado_el = NOW();

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'inserted', v_inserted,
    'timestamp', NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION g_comercial.insert_sku_master_batch(JSONB) TO authenticated;

-- ====================================================================
-- 7. RPC: get_sku_master_summary
-- Devuelve total de SKU registrados y fecha del último registro.
-- ====================================================================
CREATE OR REPLACE FUNCTION g_comercial.get_sku_master_summary()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INTEGER;
  v_last_updated TIMESTAMPTZ;
BEGIN
  SELECT COUNT(*), MAX(actualizado_el)
  INTO v_total, v_last_updated
  FROM g_comercial.sku_master;

  RETURN jsonb_build_object(
    'ok', true,
    'total', COALESCE(v_total, 0),
    'last_updated', v_last_updated
  );
END;
$$;

GRANT EXECUTE ON FUNCTION g_comercial.get_sku_master_summary() TO authenticated;



-- =====================================================================
-- STEP: supabase_live_notifications.sql
-- =====================================================================

-- Notificaciones en vivo para la app de promociones.
-- Ejecutar despues del esquema base y del RPC transaccional.

alter table g_comercial.campanas
  add column if not exists notificaciones_envivo boolean not null default true;

create table if not exists g_comercial.notificaciones_envivo (
  id uuid primary key default gen_random_uuid(),
  destinatario_usuario_id uuid references g_comercial.usuarios_app(id) on delete cascade,
  destinatario_rol text not null default '',
  actor_usuario_id uuid references g_comercial.usuarios_app(id) on delete set null,
  actor_nombre text not null default '',
  actor_rol text not null default '',
  campana_id uuid references g_comercial.campanas(id) on delete cascade,
  promocion_id uuid references g_comercial.promociones(id) on delete set null,
  comentario_id uuid references g_comercial.comentarios(id) on delete set null,
  tipo_evento text not null,
  titulo text not null,
  mensaje text not null default '',
  url_modulo text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  leida boolean not null default false,
  leida_en timestamptz,
  created_at timestamptz not null default now(),
  constraint notificaciones_envivo_destinatario_check check (
    destinatario_usuario_id is not null or destinatario_rol <> ''
  )
);

create index if not exists idx_notificaciones_envivo_usuario
  on g_comercial.notificaciones_envivo(destinatario_usuario_id, leida, created_at desc);

create index if not exists idx_notificaciones_envivo_rol
  on g_comercial.notificaciones_envivo(destinatario_rol, leida, created_at desc);

create index if not exists idx_notificaciones_envivo_campana
  on g_comercial.notificaciones_envivo(campana_id, created_at desc);

create or replace function g_comercial.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from g_comercial.usuarios_app
  where auth_user_id = auth.uid()
    and activo = true
  limit 1;
$$;

alter table g_comercial.notificaciones_envivo enable row level security;

drop policy if exists notificaciones_envivo_select_own on g_comercial.notificaciones_envivo;
create policy notificaciones_envivo_select_own on g_comercial.notificaciones_envivo for select
using (
  destinatario_usuario_id = g_comercial.current_app_user_id()
);

drop policy if exists notificaciones_envivo_update_own on g_comercial.notificaciones_envivo;
create policy notificaciones_envivo_update_own on g_comercial.notificaciones_envivo for update
using (
  destinatario_usuario_id = g_comercial.current_app_user_id()
)
with check (
  destinatario_usuario_id = g_comercial.current_app_user_id()
);

drop policy if exists notificaciones_envivo_no_client_insert on g_comercial.notificaciones_envivo;
create policy notificaciones_envivo_no_client_insert on g_comercial.notificaciones_envivo for insert
with check (false);

revoke insert, update, delete on g_comercial.notificaciones_envivo from authenticated;
grant select on g_comercial.notificaciones_envivo to authenticated;
grant update (leida, leida_en) on g_comercial.notificaciones_envivo to authenticated;

drop function if exists g_comercial.create_live_notification(
  text, text, text, text, text, text, text[], uuid[], text, jsonb
);

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
  v_campana_id uuid;
  v_promocion_id uuid;
  v_comentario_uuid uuid;
  v_inserted integer := 0;
  v_has_catalog_designers boolean := false;
begin
  select *
    into v_actor
  from g_comercial.usuarios_app
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
    from g_comercial.campanas
    where legacy_actividad_id = trim(p_legacy_actividad_id)
    limit 1;
  end if;

  if v_campana_id is not null then
    perform 1
    from g_comercial.campanas
    where id = v_campana_id
      and notificaciones_envivo = true;

    if not found then
      return jsonb_build_object('inserted', 0, 'skipped', 'disabled_for_campaign');
    end if;
  end if;

  if v_campana_id is not null and coalesce(trim(p_legacy_row_id), '') <> '' then
    select id
      into v_promocion_id
    from g_comercial.promociones
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
      from g_comercial.comentarios
      where legacy_comentario_id = trim(p_comentario_id)
      limit 1;
    end;
  end if;

  -- Comprobar si hay diseñadores asignados a las páginas de este catálogo
  if (coalesce(trim(p_legacy_actividad_id), '') <> '' or v_campana_id is not null)
     and ('MARK' = any(coalesce(p_destinatario_roles, array[]::text[])))
     and (p_tipo_evento like 'PROMOCION_%' or p_tipo_evento = 'COMENTARIO_COMPRAS') then

    perform 1
    from g_comercial.catalogo_proyecto_diseno p
    join g_comercial.catalogo_paginas_diseno pag on pag.proyecto_id = p.id
    join g_comercial.usuarios_app u on u.id = pag.disenador_id
    where (
      p.catalogo_id = trim(p_legacy_actividad_id)
      or (v_campana_id is not null and (
        p.catalogo_id = v_campana_id::text
        or p.catalogo_id = (select legacy_actividad_id from g_comercial.campanas where id = v_campana_id limit 1)
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
    from g_comercial.usuarios_app u
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
    from g_comercial.catalogo_proyecto_diseno p
    join g_comercial.catalogo_paginas_diseno pag on pag.proyecto_id = p.id
    join g_comercial.usuarios_app u on u.id = pag.disenador_id
    where (
      p.catalogo_id = trim(p_legacy_actividad_id)
      or (v_campana_id is not null and (
        p.catalogo_id = v_campana_id::text
        or p.catalogo_id = (select legacy_actividad_id from g_comercial.campanas where id = v_campana_id limit 1)
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
    from g_comercial.usuarios_app u
    where u.activo = true
      and u.id <> v_actor.id
      and u.id = any(coalesce(p_destinatario_usuario_ids, array[]::uuid[]))
  ),
  buyer_targets as (
    select
      u.id as usuario_id,
      u.rol as destinatario_rol,
      coalesce(p_url_modulo, '') as target_url_modulo
    from g_comercial.usuarios_app u
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
    insert into g_comercial.notificaciones_envivo (
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

revoke execute on function g_comercial.create_live_notification(
  text, text, text, text, text, text, text[], uuid[], uuid[], text, jsonb
) from public;
revoke execute on function g_comercial.create_live_notification(
  text, text, text, text, text, text, text[], uuid[], uuid[], text, jsonb
) from anon;
grant execute on function g_comercial.create_live_notification(
  text, text, text, text, text, text, text[], uuid[], uuid[], text, jsonb
) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'g_comercial'
      and tablename = 'notificaciones_envivo'
  ) then
    alter publication supabase_realtime add table g_comercial.notificaciones_envivo;
  end if;
end;
$$;



-- =====================================================================
-- STEP: supabase_catalog_deadlines_broadcasts.sql
-- =====================================================================

-- Ejecutar después de supabase_live_notifications.sql y de las migraciones de roles.
-- No modifica las hojas ni columnas Excel. No envía mensajes al instalarse.
begin;

-- Amplía las restricciones existentes, conservando sus estados permitidos.
do $$
declare
  item record;
begin
  for item in
    select conname, pg_get_expr(conbin, conrelid) as expression
    from pg_constraint
    where conrelid = 'g_comercial.campanas'::regclass and contype = 'c'
      and conname in ('campanas_estado_check', 'campanas_estado_operativo_check')
  loop
    execute format('alter table g_comercial.campanas drop constraint %I', item.conname);
    execute format('alter table g_comercial.campanas add constraint %I check ((%s) or (tipo_actividad = ''CATALOGO'' and estado in (''Precios Finales'', ''PRECIOS FINALES'')))', item.conname, item.expression);
  end loop;
end;
$$;

-- Una solicitud produce como máximo una notificación por destinatario.
create unique index if not exists notificaciones_difusion_request_recipient
  on g_comercial.notificaciones_envivo (actor_usuario_id, (metadata ->> 'broadcast_request_id'), destinatario_usuario_id)
  where tipo_evento = 'ADMIN_DIFUSION';

-- También protege contra intentos de enviar este evento desde el RPC genérico.
create or replace function g_comercial.guard_admin_broadcast()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.tipo_evento = 'ADMIN_DIFUSION' and not exists (
    select 1 from g_comercial.usuarios_app
    where auth_user_id = auth.uid() and activo = true and rol = 'ADMIN'
      and id = new.actor_usuario_id
  ) then
    raise exception 'Solo el administrador puede enviar difusiones.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function g_comercial.guard_admin_broadcast() from public, anon, authenticated;
drop trigger if exists guard_admin_broadcast on g_comercial.notificaciones_envivo;
create trigger guard_admin_broadcast before insert on g_comercial.notificaciones_envivo
  for each row execute function g_comercial.guard_admin_broadcast();

create or replace function g_comercial.send_admin_broadcast(p_titulo text, p_mensaje text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor g_comercial.usuarios_app%rowtype;
  v_count integer;
  v_previous g_comercial.notificaciones_envivo%rowtype;
begin
  select * into v_actor from g_comercial.usuarios_app
    where auth_user_id = auth.uid() and activo = true and rol = 'ADMIN' limit 1;
  if v_actor.id is null then
    raise exception 'Solo el administrador puede enviar difusiones.' using errcode = '42501';
  end if;
  if p_request_id is null or coalesce(length(btrim(p_titulo)), 0) not between 1 and 100
    or coalesce(length(btrim(p_mensaje)), 0) not between 1 and 1000 then
    raise exception 'Asunto (1–100), mensaje (1–1000) e identificador son obligatorios.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_actor.id::text || p_request_id::text, 0));
  select * into v_previous from g_comercial.notificaciones_envivo
    where tipo_evento = 'ADMIN_DIFUSION' and actor_usuario_id = v_actor.id
      and metadata ->> 'broadcast_request_id' = p_request_id::text limit 1;
  if found then
    if v_previous.titulo <> btrim(p_titulo) or v_previous.mensaje <> btrim(p_mensaje) then
      raise exception 'El identificador ya corresponde a otro mensaje.' using errcode = '22023';
    end if;
    select count(*) into v_count from g_comercial.notificaciones_envivo
      where tipo_evento = 'ADMIN_DIFUSION' and actor_usuario_id = v_actor.id
        and metadata ->> 'broadcast_request_id' = p_request_id::text;
    return jsonb_build_object('inserted', v_count, 'replayed', true);
  end if;

  insert into g_comercial.notificaciones_envivo (
    destinatario_usuario_id, destinatario_rol, actor_usuario_id, actor_nombre, actor_rol,
    tipo_evento, titulo, mensaje, metadata
  )
  select id, rol, v_actor.id, v_actor.nombre, v_actor.rol,
    'ADMIN_DIFUSION', btrim(p_titulo), btrim(p_mensaje),
    jsonb_build_object('broadcast_request_id', p_request_id)
  from g_comercial.usuarios_app
  where activo = true and rol in ('BUYER', 'MARK', 'OPER');
  get diagnostics v_count = row_count;
  return jsonb_build_object('inserted', v_count);
end;
$$;
revoke all on function g_comercial.send_admin_broadcast(text, text, uuid) from public, anon;
grant execute on function g_comercial.send_admin_broadcast(text, text, uuid) to authenticated;
commit;



-- =====================================================================
-- STEP: supabase_catalogo_diseno.sql
-- =====================================================================

-- Modulo Diseño de Catalogos.
-- Ejecutar en Supabase SQL Editor despues de docs/supabase_roles_permissions_mvp.sql.

begin;

-- Permite integrar diseñadores sin romper los roles actuales del MVP.
alter table g_comercial.usuarios_app
  drop constraint if exists usuarios_app_rol_check;

update g_comercial.usuarios_app
set rol = case upper(trim(rol))
  when 'COMPRADOR' then 'BUYER'
  when 'COMP' then 'BUYER'
  when 'MERCADEO' then 'MARK'
  when 'MARKETING' then 'MARK'
  when 'PRICING' then 'OPER'
  when 'PRICE' then 'OPER'
  when 'PLANIMETRIA' then 'OPER'
  when 'AUT' then 'AUD'
  when 'CDD' then 'DISENADOR'
  when 'DISEÑADOR' then 'DISENADOR'
  else upper(trim(rol))
end;

alter table g_comercial.usuarios_app drop constraint if exists usuarios_app_rol_check;
alter table g_comercial.usuarios_app add constraint usuarios_app_rol_check
  check (rol in ('ADMIN', 'BUYER', 'MARK', 'OPER', 'AUD', 'DISENADOR'));

drop policy if exists usuarios_select_self_admin_mark on g_comercial.usuarios_app;
create policy usuarios_select_self_admin_mark on g_comercial.usuarios_app for select
to authenticated
using (auth_user_id = auth.uid() or g_comercial.is_any_role(array['ADMIN', 'MARK']));

create or replace function g_comercial.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from g_comercial.usuarios_app
  where auth_user_id = auth.uid()
    and activo = true
  limit 1;
$$;

create table if not exists g_comercial.catalogo_proyecto_diseno (
  id uuid primary key default gen_random_uuid(),
  catalogo_id text not null,
  nombre_proyecto text not null,
  estado text not null default 'planificacion',
  fecha_inicio date,
  fecha_entrega date,
  creado_por uuid references g_comercial.usuarios_app(id) on delete set null,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalogo_proyecto_diseno_estado_check
    check (estado in ('planificacion', 'en_diseno', 'en_revision', 'aprobado', 'consolidado', 'cancelado'))
);

create table if not exists g_comercial.catalogo_paginas_diseno (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references g_comercial.catalogo_proyecto_diseno(id) on delete cascade,
  numero_pagina integer not null check (numero_pagina > 0),
  titulo_pagina text,
  disenador_id uuid references g_comercial.usuarios_app(id) on delete set null,
  comprador_id uuid references g_comercial.compradores(id) on delete set null,
  estado text not null default 'pendiente',
  archivo_path text,
  archivo_url text,
  fecha_ultima_carga timestamptz,
  actualizado_por uuid references g_comercial.usuarios_app(id) on delete set null,
  observacion_actual text,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalogo_paginas_diseno_estado_check
    check (estado in ('pendiente', 'en_diseno', 'en_revision', 'ajustes', 'aprobada', 'rechazada', 'lista_consolidar')),
  constraint catalogo_paginas_diseno_numero_unique unique (proyecto_id, numero_pagina)
);

create table if not exists g_comercial.catalogo_pagina_comentarios (
  id uuid primary key default gen_random_uuid(),
  pagina_id uuid not null references g_comercial.catalogo_paginas_diseno(id) on delete cascade,
  usuario_id uuid references g_comercial.usuarios_app(id) on delete set null,
  comentario text not null,
  tipo text not null default 'comentario',
  estado text not null default 'abierto',
  anotaciones jsonb not null default '[]'::jsonb,
  resuelto_por uuid references g_comercial.usuarios_app(id) on delete set null,
  fecha_resolucion timestamptz,
  fecha_creacion timestamptz not null default now(),
  constraint catalogo_pagina_comentarios_tipo_check
    check (tipo in ('comentario', 'observacion', 'aprobacion', 'rechazo', 'ajuste', 'precio', 'imagen', 'general')),
  constraint catalogo_pagina_comentarios_estado_check
    check (estado in ('abierto', 'resuelto'))
);

create table if not exists g_comercial.catalogo_consolidado_final (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references g_comercial.catalogo_proyecto_diseno(id) on delete cascade,
  pdf_path text,
  pdf_url text,
  estado text not null default 'pendiente',
  consolidado_por uuid references g_comercial.usuarios_app(id) on delete set null,
  fecha_consolidacion timestamptz,
  fecha_creacion timestamptz not null default now(),
  constraint catalogo_consolidado_final_estado_check
    check (estado in ('pendiente', 'consolidado', 'cancelado')),
  constraint catalogo_consolidado_final_proyecto_unique unique (proyecto_id)
);

create index if not exists idx_catalogo_proyecto_diseno_catalogo on g_comercial.catalogo_proyecto_diseno(catalogo_id);
create index if not exists idx_catalogo_paginas_diseno_proyecto on g_comercial.catalogo_paginas_diseno(proyecto_id);
create index if not exists idx_catalogo_paginas_diseno_disenador on g_comercial.catalogo_paginas_diseno(disenador_id);
create index if not exists idx_catalogo_paginas_diseno_comprador on g_comercial.catalogo_paginas_diseno(comprador_id);
create index if not exists idx_catalogo_pagina_comentarios_pagina on g_comercial.catalogo_pagina_comentarios(pagina_id);

alter table g_comercial.catalogo_proyecto_diseno
  add column if not exists updated_at timestamptz not null default now();

alter table g_comercial.catalogo_paginas_diseno
  add column if not exists updated_at timestamptz not null default now();

alter table g_comercial.catalogo_pagina_comentarios
  add column if not exists anotaciones jsonb not null default '[]'::jsonb;

alter table g_comercial.catalogo_pagina_comentarios
  add column if not exists estado text not null default 'abierto',
  add column if not exists resuelto_por uuid references g_comercial.usuarios_app(id) on delete set null,
  add column if not exists fecha_resolucion timestamptz;

alter table g_comercial.catalogo_pagina_comentarios
  drop constraint if exists catalogo_pagina_comentarios_estado_check,
  add constraint catalogo_pagina_comentarios_estado_check
    check (estado in ('abierto', 'resuelto'));

create or replace function g_comercial.set_fecha_actualizacion()
returns trigger
language plpgsql
as $$
begin
  new.fecha_actualizacion = now();
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists catalogo_proyecto_diseno_set_fecha_actualizacion on g_comercial.catalogo_proyecto_diseno;
create trigger catalogo_proyecto_diseno_set_fecha_actualizacion before update on g_comercial.catalogo_proyecto_diseno
for each row execute function g_comercial.set_fecha_actualizacion();

drop trigger if exists catalogo_paginas_diseno_set_fecha_actualizacion on g_comercial.catalogo_paginas_diseno;
create trigger catalogo_paginas_diseno_set_fecha_actualizacion before update on g_comercial.catalogo_paginas_diseno
for each row execute function g_comercial.set_fecha_actualizacion();

create or replace function g_comercial.catalogo_paginas_diseno_guard_restricted_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  role_name text := g_comercial.current_user_role();
begin
  if g_comercial.is_any_role(array['ADMIN', 'MARK']) then
    return new;
  end if;

  if role_name = 'DISENADOR' then
    if old.disenador_id is distinct from g_comercial.current_app_user_id()
      or new.disenador_id is distinct from old.disenador_id
      or new.comprador_id is distinct from old.comprador_id
      or new.proyecto_id is distinct from old.proyecto_id
      or new.numero_pagina is distinct from old.numero_pagina
      or new.estado not in ('en_diseno', 'en_revision') then
      raise exception 'El diseñador solo puede actualizar la imagen de sus paginas asignadas.';
    end if;
    return new;
  end if;

  if role_name = 'BUYER' then
    if old.comprador_id is distinct from g_comercial.current_buyer_id()
      or new.comprador_id is distinct from old.comprador_id
      or new.disenador_id is distinct from old.disenador_id
      or new.proyecto_id is distinct from old.proyecto_id
      or new.numero_pagina is distinct from old.numero_pagina
      or new.estado not in ('aprobada', 'ajustes', 'rechazada') then
      raise exception 'El comprador solo puede aprobar o solicitar ajustes en sus paginas asignadas.';
    end if;
    return new;
  end if;

  raise exception 'Rol no autorizado para actualizar paginas de diseño.';
end;
$$;

drop trigger if exists catalogo_paginas_diseno_restricted_update on g_comercial.catalogo_paginas_diseno;
create trigger catalogo_paginas_diseno_restricted_update before update on g_comercial.catalogo_paginas_diseno
for each row execute function g_comercial.catalogo_paginas_diseno_guard_restricted_update();

create or replace function g_comercial.catalogo_pagina_comentarios_guard_status_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if g_comercial.is_any_role(array['ADMIN', 'MARK']) then
    return new;
  end if;

  if new.pagina_id is distinct from old.pagina_id
    or new.usuario_id is distinct from old.usuario_id
    or new.comentario is distinct from old.comentario
    or new.tipo is distinct from old.tipo
    or new.anotaciones is distinct from old.anotaciones
    or new.fecha_creacion is distinct from old.fecha_creacion then
    raise exception 'Solo se permite cambiar el estado del comentario.';
  end if;

  if new.estado not in ('abierto', 'resuelto') then
    raise exception 'Estado de comentario no permitido.';
  end if;

  return new;
end;
$$;

drop trigger if exists catalogo_pagina_comentarios_status_update on g_comercial.catalogo_pagina_comentarios;
create trigger catalogo_pagina_comentarios_status_update before update on g_comercial.catalogo_pagina_comentarios
for each row execute function g_comercial.catalogo_pagina_comentarios_guard_status_update();

drop trigger if exists catalogo_proyecto_diseno_audit_row_change on g_comercial.catalogo_proyecto_diseno;
create trigger catalogo_proyecto_diseno_audit_row_change after insert or update or delete on g_comercial.catalogo_proyecto_diseno
for each row execute function g_comercial.audit_business_row_change();

drop trigger if exists catalogo_paginas_diseno_audit_row_change on g_comercial.catalogo_paginas_diseno;
create trigger catalogo_paginas_diseno_audit_row_change after insert or update or delete on g_comercial.catalogo_paginas_diseno
for each row execute function g_comercial.audit_business_row_change();

drop trigger if exists catalogo_pagina_comentarios_audit_row_change on g_comercial.catalogo_pagina_comentarios;
create trigger catalogo_pagina_comentarios_audit_row_change after insert or update or delete on g_comercial.catalogo_pagina_comentarios
for each row execute function g_comercial.audit_business_row_change();

drop trigger if exists catalogo_consolidado_final_audit_row_change on g_comercial.catalogo_consolidado_final;
create trigger catalogo_consolidado_final_audit_row_change after insert or update or delete on g_comercial.catalogo_consolidado_final
for each row execute function g_comercial.audit_business_row_change();

alter table g_comercial.catalogo_proyecto_diseno enable row level security;
alter table g_comercial.catalogo_paginas_diseno enable row level security;
alter table g_comercial.catalogo_pagina_comentarios enable row level security;
alter table g_comercial.catalogo_consolidado_final enable row level security;

grant select, insert, update, delete on
  g_comercial.catalogo_proyecto_diseno,
  g_comercial.catalogo_paginas_diseno,
  g_comercial.catalogo_pagina_comentarios,
  g_comercial.catalogo_consolidado_final
to authenticated;

drop policy if exists catalogo_proyecto_diseno_select_roles on g_comercial.catalogo_proyecto_diseno;
create policy catalogo_proyecto_diseno_select_roles on g_comercial.catalogo_proyecto_diseno for select
to authenticated
using (g_comercial.current_user_role() is not null);

drop policy if exists catalogo_proyecto_diseno_manage_admin_mark on g_comercial.catalogo_proyecto_diseno;
create policy catalogo_proyecto_diseno_manage_admin_mark on g_comercial.catalogo_proyecto_diseno for all
to authenticated
using (g_comercial.is_any_role(array['ADMIN', 'MARK']))
with check (g_comercial.is_any_role(array['ADMIN', 'MARK']));

drop policy if exists catalogo_paginas_diseno_select_scoped on g_comercial.catalogo_paginas_diseno;
create policy catalogo_paginas_diseno_select_scoped on g_comercial.catalogo_paginas_diseno for select
to authenticated
using (
  g_comercial.is_any_role(array['ADMIN', 'MARK', 'AUD'])
  or (g_comercial.is_role('DISENADOR') and disenador_id = g_comercial.current_app_user_id())
  or (g_comercial.is_role('BUYER') and comprador_id = g_comercial.current_buyer_id())
);

drop policy if exists catalogo_paginas_diseno_insert_admin_mark on g_comercial.catalogo_paginas_diseno;
create policy catalogo_paginas_diseno_insert_admin_mark on g_comercial.catalogo_paginas_diseno for insert
to authenticated
with check (g_comercial.is_any_role(array['ADMIN', 'MARK']));

drop policy if exists catalogo_paginas_diseno_update_scoped on g_comercial.catalogo_paginas_diseno;
create policy catalogo_paginas_diseno_update_scoped on g_comercial.catalogo_paginas_diseno for update
to authenticated
using (
  g_comercial.is_any_role(array['ADMIN', 'MARK'])
  or (g_comercial.is_role('DISENADOR') and disenador_id = g_comercial.current_app_user_id())
  or (g_comercial.is_role('BUYER') and comprador_id = g_comercial.current_buyer_id())
)
with check (
  g_comercial.is_any_role(array['ADMIN', 'MARK'])
  or (g_comercial.is_role('DISENADOR') and disenador_id = g_comercial.current_app_user_id())
  or (g_comercial.is_role('BUYER') and comprador_id = g_comercial.current_buyer_id())
);

drop policy if exists catalogo_paginas_diseno_delete_admin_mark on g_comercial.catalogo_paginas_diseno;
create policy catalogo_paginas_diseno_delete_admin_mark on g_comercial.catalogo_paginas_diseno for delete
to authenticated
using (g_comercial.is_any_role(array['ADMIN', 'MARK']));

drop policy if exists catalogo_pagina_comentarios_select_scoped on g_comercial.catalogo_pagina_comentarios;
create policy catalogo_pagina_comentarios_select_scoped on g_comercial.catalogo_pagina_comentarios for select
to authenticated
using (
  exists (
    select 1
    from g_comercial.catalogo_paginas_diseno p
    where p.id = pagina_id
  )
);

drop policy if exists catalogo_pagina_comentarios_insert_scoped on g_comercial.catalogo_pagina_comentarios;
create policy catalogo_pagina_comentarios_insert_scoped on g_comercial.catalogo_pagina_comentarios for insert
to authenticated
with check (
  usuario_id = g_comercial.current_app_user_id()
  and exists (
    select 1
    from g_comercial.catalogo_paginas_diseno p
    where p.id = pagina_id
      and (
        g_comercial.is_any_role(array['ADMIN', 'MARK'])
        or (g_comercial.is_role('DISENADOR') and p.disenador_id = g_comercial.current_app_user_id())
        or (g_comercial.is_role('BUYER') and p.comprador_id = g_comercial.current_buyer_id())
      )
  )
);

drop policy if exists catalogo_pagina_comentarios_update_status_scoped on g_comercial.catalogo_pagina_comentarios;
create policy catalogo_pagina_comentarios_update_status_scoped on g_comercial.catalogo_pagina_comentarios for update
to authenticated
using (
  exists (
    select 1
    from g_comercial.catalogo_paginas_diseno p
    where p.id = pagina_id
      and (
        g_comercial.is_any_role(array['ADMIN', 'MARK'])
        or (g_comercial.is_role('DISENADOR') and p.disenador_id = g_comercial.current_app_user_id())
        or (g_comercial.is_role('BUYER') and p.comprador_id = g_comercial.current_buyer_id())
      )
  )
)
with check (
  estado in ('abierto', 'resuelto')
  and
  exists (
    select 1
    from g_comercial.catalogo_paginas_diseno p
    where p.id = pagina_id
      and (
        g_comercial.is_any_role(array['ADMIN', 'MARK'])
        or (g_comercial.is_role('DISENADOR') and p.disenador_id = g_comercial.current_app_user_id())
        or (g_comercial.is_role('BUYER') and p.comprador_id = g_comercial.current_buyer_id())
      )
  )
);

drop policy if exists catalogo_consolidado_final_select_roles on g_comercial.catalogo_consolidado_final;
create policy catalogo_consolidado_final_select_roles on g_comercial.catalogo_consolidado_final for select
to authenticated
using (g_comercial.current_user_role() is not null);

drop policy if exists catalogo_consolidado_final_manage_admin_mark on g_comercial.catalogo_consolidado_final;
create policy catalogo_consolidado_final_manage_admin_mark on g_comercial.catalogo_consolidado_final for all
to authenticated
using (g_comercial.is_any_role(array['ADMIN', 'MARK']))
with check (g_comercial.is_any_role(array['ADMIN', 'MARK']));

-- Buckets privados. El frontend genera signed URLs para visualizar.
insert into storage.buckets (id, name, public)
values
  ('sns_app_promo', 'sns_app_promo', false),
  ('catalogo_final', 'catalogo_final', false)
on conflict (id) do update set public = false;

drop policy if exists catalog_design_work_storage_read on storage.objects;
create policy catalog_design_work_storage_read on storage.objects for select
to authenticated
using (
  bucket_id = 'sns_app_promo'
  and (
    g_comercial.is_any_role(array['ADMIN', 'MARK', 'AUD'])
    or exists (
      select 1
      from g_comercial.catalogo_paginas_diseno p
      join g_comercial.catalogo_proyecto_diseno pr on pr.id = p.proyecto_id
      where (
        p.archivo_path = name
        or name like 'catalogos/' || pr.catalogo_id || '/paginas/pagina_' || p.numero_pagina || '.%'
      )
      and (
        (g_comercial.is_role('DISENADOR') and p.disenador_id = g_comercial.current_app_user_id())
        or (g_comercial.is_role('BUYER') and p.comprador_id = g_comercial.current_buyer_id())
      )
    )
  )
);

drop policy if exists catalog_design_work_storage_write on storage.objects;
create policy catalog_design_work_storage_write on storage.objects for insert
to authenticated
with check (
  bucket_id = 'sns_app_promo'
  and (
    g_comercial.is_any_role(array['ADMIN', 'MARK'])
    or exists (
      select 1
      from g_comercial.catalogo_paginas_diseno p
      join g_comercial.catalogo_proyecto_diseno pr on pr.id = p.proyecto_id
      where name like 'catalogos/' || pr.catalogo_id || '/paginas/pagina_' || p.numero_pagina || '.%'
        and g_comercial.is_role('DISENADOR')
        and p.disenador_id = g_comercial.current_app_user_id()
    )
  )
);

drop policy if exists catalog_design_work_storage_update on storage.objects;
create policy catalog_design_work_storage_update on storage.objects for update
to authenticated
using (
  bucket_id = 'sns_app_promo'
  and (
    g_comercial.is_any_role(array['ADMIN', 'MARK'])
    or exists (
      select 1
      from g_comercial.catalogo_paginas_diseno p
      where p.archivo_path = name
        and g_comercial.is_role('DISENADOR')
        and p.disenador_id = g_comercial.current_app_user_id()
    )
  )
)
with check (bucket_id = 'sns_app_promo');

drop policy if exists catalog_design_final_storage_read on storage.objects;
create policy catalog_design_final_storage_read on storage.objects for select
to authenticated
using (
  bucket_id = 'catalogo_final'
  and g_comercial.current_user_role() is not null
);

drop policy if exists catalog_design_final_storage_write on storage.objects;
create policy catalog_design_final_storage_write on storage.objects for insert
to authenticated
with check (
  bucket_id = 'catalogo_final'
  and g_comercial.is_any_role(array['ADMIN', 'MARK'])
);

drop policy if exists catalog_design_final_storage_update on storage.objects;
create policy catalog_design_final_storage_update on storage.objects for update
to authenticated
using (
  bucket_id = 'catalogo_final'
  and g_comercial.is_any_role(array['ADMIN', 'MARK'])
)
with check (
  bucket_id = 'catalogo_final'
  and g_comercial.is_any_role(array['ADMIN', 'MARK'])
);

commit;



-- =====================================================================
-- STEP: supabase_catalogo_diseno_fix_fecha_actualizacion.sql
-- =====================================================================

-- Correccion para instalaciones existentes del modulo Diseño de Catalogos.
-- Soluciona: record "new" has no field "updated_at" [42703]

begin;

alter table g_comercial.catalogo_proyecto_diseno
  add column if not exists updated_at timestamptz not null default now();

alter table g_comercial.catalogo_paginas_diseno
  add column if not exists updated_at timestamptz not null default now();

create or replace function g_comercial.set_fecha_actualizacion()
returns trigger
language plpgsql
as $$
begin
  new.fecha_actualizacion = now();
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  trigger_item record;
begin
  for trigger_item in
    select n.nspname as schema_name, c.relname as table_name, t.tgname as trigger_name
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal
      and n.nspname = 'public'
      and c.relname in ('catalogo_proyecto_diseno', 'catalogo_paginas_diseno')
      and (
        pg_get_triggerdef(t.oid) ilike '%set_updated_at%'
        or pg_get_triggerdef(t.oid) ilike '%set_fecha_actualizacion%'
      )
  loop
    execute format(
      'drop trigger if exists %I on %I.%I',
      trigger_item.trigger_name,
      trigger_item.schema_name,
      trigger_item.table_name
    );
  end loop;
end;
$$;

drop trigger if exists catalogo_proyecto_diseno_set_fecha_actualizacion on g_comercial.catalogo_proyecto_diseno;
create trigger catalogo_proyecto_diseno_set_fecha_actualizacion before update on g_comercial.catalogo_proyecto_diseno
for each row execute function g_comercial.set_fecha_actualizacion();

drop trigger if exists catalogo_paginas_diseno_set_fecha_actualizacion on g_comercial.catalogo_paginas_diseno;
create trigger catalogo_paginas_diseno_set_fecha_actualizacion before update on g_comercial.catalogo_paginas_diseno
for each row execute function g_comercial.set_fecha_actualizacion();

drop policy if exists catalogo_paginas_diseno_delete_admin_mark on g_comercial.catalogo_paginas_diseno;
create policy catalogo_paginas_diseno_delete_admin_mark on g_comercial.catalogo_paginas_diseno for delete
to authenticated
using (g_comercial.is_any_role(array['ADMIN', 'MARK']));

commit;



-- =====================================================================
-- STEP: supabase_catalogo_diseno_versiones.sql
-- =====================================================================

-- Script de migración: Versionamiento de imágenes y comentarios en Catálogo Diseño
-- Ejecutar en Supabase SQL Editor.

begin;

-- Funciones auxiliares para RLS si no estuvieran definidas en el esquema
create or replace function g_comercial.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from g_comercial.usuarios_app
  where auth_user_id = auth.uid()
    and activo = true
  limit 1;
$$;

create or replace function g_comercial.current_buyer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select buyer_id
  from g_comercial.usuarios_app
  where auth_user_id = auth.uid()
    and activo = true
  limit 1;
$$;

-- 1. Tabla de versiones históricas de cada página
create table if not exists g_comercial.catalogo_pagina_versiones (
  id uuid primary key default gen_random_uuid(),
  pagina_id uuid not null references g_comercial.catalogo_paginas_diseno(id) on delete cascade,
  numero_version integer not null check (numero_version > 0),
  archivo_path text not null,
  archivo_url text,
  creado_por uuid references g_comercial.usuarios_app(id) on delete set null,
  fecha_creacion timestamptz not null default now(),
  constraint catalogo_pagina_versiones_pagina_numero_unique unique (pagina_id, numero_version)
);

create index if not exists idx_catalogo_pagina_versiones_pagina on g_comercial.catalogo_pagina_versiones(pagina_id);

-- 2. Habilitar RLS en catalogo_pagina_versiones
alter table g_comercial.catalogo_pagina_versiones enable row level security;

drop policy if exists catalogo_pagina_versiones_select on g_comercial.catalogo_pagina_versiones;
create policy catalogo_pagina_versiones_select on g_comercial.catalogo_pagina_versiones for select
to authenticated
using (true);

drop policy if exists catalogo_pagina_versiones_insert on g_comercial.catalogo_pagina_versiones;
create policy catalogo_pagina_versiones_insert on g_comercial.catalogo_pagina_versiones for insert
to authenticated
with check (
  g_comercial.is_any_role(array['ADMIN', 'MARK', 'DISENADOR'])
  or exists (
    select 1 from g_comercial.catalogo_paginas_diseno p
    where p.id = pagina_id
      and (p.disenador_id = g_comercial.current_app_user_id() or p.comprador_id = g_comercial.current_buyer_id())
  )
);

-- 3. Agregar version_actual a catalogo_paginas_diseno si no existe
alter table g_comercial.catalogo_paginas_diseno
  add column if not exists version_actual integer default 1;

-- 4. Agregar numero_version y version_id a catalogo_pagina_comentarios si no existen
alter table g_comercial.catalogo_pagina_comentarios
  add column if not exists numero_version integer default null,
  add column if not exists version_id uuid references g_comercial.catalogo_pagina_versiones(id) on delete set null;

create index if not exists idx_catalogo_pagina_comentarios_version on g_comercial.catalogo_pagina_comentarios(pagina_id, numero_version);

-- 5. Poblar catalogo_pagina_versiones con las imágenes ya existentes (v1)
insert into g_comercial.catalogo_pagina_versiones (pagina_id, numero_version, archivo_path, archivo_url, creado_por, fecha_creacion)
select 
  id as pagina_id,
  1 as numero_version,
  archivo_path,
  archivo_url,
  actualizado_por as creado_por,
  coalesce(fecha_ultima_carga, fecha_creacion, now()) as fecha_creacion
from g_comercial.catalogo_paginas_diseno
where archivo_path is not null
on conflict (pagina_id, numero_version) do nothing;

-- 6. Asignar versión 1 a comentarios existentes en páginas que ya tengan imagen
update g_comercial.catalogo_pagina_comentarios c
set numero_version = 1
where c.numero_version is null
  and exists (
    select 1 from g_comercial.catalogo_paginas_diseno p
    where p.id = c.pagina_id and p.archivo_path is not null
  );

commit;



-- =====================================================================
-- STEP: supabase_catalogo_diseno_versiones_seguras.sql
-- =====================================================================

-- Requiere esquema de Diseño, versionamiento y corrección de fechas.
-- Aplicar antes de publicar el frontend de etapa 3. No elimina archivos históricos.
begin;

update storage.buckets set public = false where id = 'sns_app_promo';

create or replace function g_comercial.can_read_design_page(p_page_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from g_comercial.catalogo_paginas_diseno p where p.id = p_page_id
    and (g_comercial.is_any_role(array['ADMIN','MARK','AUD'])
      or (g_comercial.is_role('DISENADOR') and p.disenador_id = g_comercial.current_app_user_id())
      or (g_comercial.is_role('BUYER') and p.comprador_id = g_comercial.current_buyer_id())));
$$;

create or replace function g_comercial.can_upload_design_path(p_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from g_comercial.catalogo_paginas_diseno p
    join g_comercial.catalogo_proyecto_diseno pr on pr.id = p.proyecto_id
    where split_part(p_path,'/',1) = 'catalogos'
      and split_part(p_path,'/',2) = pr.catalogo_id
      and split_part(p_path,'/',3) = 'paginas'
      and split_part(p_path,'/',4) = p.id::text
      and array_length(string_to_array(p_path,'/'),1) = 5
      and split_part(p_path,'/',5) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$'
      and (g_comercial.is_any_role(array['ADMIN','MARK'])
        or (g_comercial.is_role('DISENADOR') and p.disenador_id = g_comercial.current_app_user_id())));
$$;

create or replace function g_comercial.can_read_design_path(p_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from g_comercial.catalogo_paginas_diseno p
    where g_comercial.can_read_design_page(p.id) and (p.archivo_path = p_path
      or exists (select 1 from g_comercial.catalogo_pagina_versiones v where v.pagina_id = p.id and v.archivo_path = p_path)));
$$;

revoke all on function g_comercial.can_read_design_page(uuid), g_comercial.can_upload_design_path(text), g_comercial.can_read_design_path(text) from public, anon;
grant execute on function g_comercial.can_read_design_page(uuid), g_comercial.can_upload_design_path(text), g_comercial.can_read_design_path(text) to authenticated;

drop policy if exists catalogo_pagina_versiones_select on g_comercial.catalogo_pagina_versiones;
drop policy if exists catalogo_pagina_versiones_insert on g_comercial.catalogo_pagina_versiones;
drop policy if exists design_versions_scope on g_comercial.catalogo_pagina_versiones;
drop policy if exists catalogo_pagina_versiones_select on g_comercial.catalogo_pagina_versiones;
create policy catalogo_pagina_versiones_select on g_comercial.catalogo_pagina_versiones for select to authenticated
  using (g_comercial.can_read_design_page(pagina_id));
drop policy if exists design_versions_scope on g_comercial.catalogo_pagina_versiones;
create policy design_versions_scope on g_comercial.catalogo_pagina_versiones as restrictive for select to authenticated
  using (g_comercial.can_read_design_page(pagina_id));
revoke all on g_comercial.catalogo_pagina_versiones from public, anon, authenticated;
grant select on g_comercial.catalogo_pagina_versiones to authenticated;

-- Las columnas del archivo y su contador solo se escriben mediante la RPC.
revoke update on g_comercial.catalogo_paginas_diseno from public, anon, authenticated;
grant update (titulo_pagina, disenador_id, comprador_id, estado, observacion_actual, actualizado_por, fecha_actualizacion)
  on g_comercial.catalogo_paginas_diseno to authenticated;

drop policy if exists catalog_design_work_storage_read on storage.objects;
drop policy if exists catalog_design_work_storage_write on storage.objects;
drop policy if exists catalog_design_work_storage_update on storage.objects;
drop policy if exists catalog_design_work_storage_read on storage.objects;
create policy catalog_design_work_storage_read on storage.objects for select to authenticated
  using (bucket_id = 'sns_app_promo' and g_comercial.can_read_design_path(name));
drop policy if exists catalog_design_work_storage_write on storage.objects;
create policy catalog_design_work_storage_write on storage.objects for insert to authenticated
  with check (bucket_id = 'sns_app_promo' and g_comercial.can_upload_design_path(name));

-- Evita que otra política permisiva del bucket habilite sobrescrituras o lecturas ajenas.
drop policy if exists design_storage_no_anon on storage.objects;
create policy design_storage_no_anon on storage.objects as restrictive for all to anon
  using (bucket_id <> 'sns_app_promo') with check (bucket_id <> 'sns_app_promo');
drop policy if exists design_storage_read_scope on storage.objects;
create policy design_storage_read_scope on storage.objects as restrictive for select to authenticated
  using (bucket_id <> 'sns_app_promo' or g_comercial.can_read_design_path(name));
drop policy if exists design_storage_insert_scope on storage.objects;
create policy design_storage_insert_scope on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'sns_app_promo' or g_comercial.can_upload_design_path(name));
drop policy if exists design_storage_immutable_update on storage.objects;
create policy design_storage_immutable_update on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'sns_app_promo') with check (bucket_id <> 'sns_app_promo');
drop policy if exists design_storage_immutable_delete on storage.objects;
create policy design_storage_immutable_delete on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'sns_app_promo');

create or replace function g_comercial.register_catalog_design_version(p_page_id uuid, p_path text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p g_comercial.catalogo_paginas_diseno%rowtype;
  v g_comercial.catalogo_pagina_versiones%rowtype;
  next_number integer;
begin
  select * into p from g_comercial.catalogo_paginas_diseno where id = p_page_id for update;
  if not found or not coalesce(g_comercial.can_upload_design_path(p_path), false)
    or split_part(p_path,'/',4) <> p_page_id::text then
    raise exception 'No tiene permiso para cargar esta página.';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'sns_app_promo'
    and name = p_path and owner_id = auth.uid()::text) then
    raise exception 'No se encontró un archivo cargado por su sesión.';
  end if;
  -- Reintentar la misma confirmación no crea otra versión.
  select * into v from g_comercial.catalogo_pagina_versiones where pagina_id = p.id and archivo_path = p_path;
  if found then
    return jsonb_build_object('updatedPage',to_jsonb(p),'newVersionRecord',to_jsonb(v),'versionNumber',v.numero_version);
  end if;
  -- Conserva el arte previo de instalaciones con historial incompleto.
  if p.archivo_path is not null and not exists (
    select 1 from g_comercial.catalogo_pagina_versiones where pagina_id = p.id and archivo_path = p.archivo_path
  ) then
    insert into g_comercial.catalogo_pagina_versiones(pagina_id,numero_version,archivo_path,creado_por,fecha_creacion)
    values(p.id,coalesce(p.version_actual,1),p.archivo_path,p.actualizado_por,coalesce(p.fecha_ultima_carga,now()));
  end if;
  select greatest(coalesce(max(numero_version),0),case when p.archivo_path is not null then coalesce(p.version_actual,1) else 0 end)+1
    into next_number from g_comercial.catalogo_pagina_versiones where pagina_id = p.id;
  insert into g_comercial.catalogo_pagina_versiones(pagina_id,numero_version,archivo_path,creado_por)
    values(p.id,next_number,p_path,g_comercial.current_app_user_id()) returning * into v;
  update g_comercial.catalogo_paginas_diseno set archivo_path = p_path, archivo_url = null,
    version_actual = next_number, estado = 'en_revision', fecha_ultima_carga = now(),
    actualizado_por = g_comercial.current_app_user_id() where id = p.id returning * into p;
  return jsonb_build_object('updatedPage',to_jsonb(p),'newVersionRecord',to_jsonb(v),'versionNumber',next_number);
end;
$$;
revoke all on function g_comercial.register_catalog_design_version(uuid,text) from public, anon;
grant execute on function g_comercial.register_catalog_design_version(uuid,text) to authenticated;
commit;



-- =====================================================================
-- STEP: supabase_catalogo_diseno_categorias.sql
-- =====================================================================

-- Ejecutar después del esquema de Diseño y antes de publicar el frontend actualizado.
-- Conserva los tipos históricos y agrega las categorías existentes en la interfaz.
begin;

alter table g_comercial.catalogo_pagina_comentarios
  drop constraint if exists catalogo_pagina_comentarios_tipo_check;

alter table g_comercial.catalogo_pagina_comentarios drop constraint if exists catalogo_pagina_comentarios_tipo_check;
alter table g_comercial.catalogo_pagina_comentarios add constraint catalogo_pagina_comentarios_tipo_check
  check (tipo in ('comentario', 'observacion', 'aprobacion', 'rechazo', 'ajuste', 'precio', 'imagen', 'general'));

commit;



-- =====================================================================
-- STEP: supabase_catalogo_diseno_operaciones_atomicas.sql
-- =====================================================================

-- Etapa 4. Aplicar después de categorías y versiones_seguras, antes del frontend.
begin;

create table if not exists g_comercial.catalogo_diseno_operaciones (
  id uuid primary key,
  usuario_id uuid not null references g_comercial.usuarios_app(id),
  solicitud jsonb not null,
  resultado jsonb not null,
  fecha_creacion timestamptz not null default now()
);
alter table g_comercial.catalogo_diseno_operaciones enable row level security;
revoke all on g_comercial.catalogo_diseno_operaciones from public, anon, authenticated;

-- Solo la llaman las RPC autorizadas. El bloqueo serializa reintentos del mismo ID.
create or replace function g_comercial.design_operation_result(p_id uuid, p_request jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare op g_comercial.catalogo_diseno_operaciones%rowtype;
begin
  if p_id is null or g_comercial.current_app_user_id() is null then raise exception 'Sesión u operación inválida.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  select * into op from g_comercial.catalogo_diseno_operaciones where id = p_id;
  if found then
    if op.usuario_id <> g_comercial.current_app_user_id() or op.solicitud <> p_request then
      raise exception 'El identificador pertenece a otra operación.';
    end if;
    return op.resultado;
  end if;
  return null;
end;
$$;
revoke all on function g_comercial.design_operation_result(uuid,jsonb) from public, anon, authenticated;

create or replace function g_comercial.save_catalog_design_project(
  p_operation_id uuid, p_project_id uuid, p_values jsonb, p_titles jsonb, p_expected_updated_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p g_comercial.catalogo_proyecto_diseno%rowtype;
  request jsonb := jsonb_build_object('action','project','id',p_project_id,'values',p_values,'titles',p_titles,'expected',p_expected_updated_at);
  result jsonb;
  page_count integer;
begin
  if not coalesce(g_comercial.is_any_role(array['ADMIN','MARK']),false) then raise exception 'No puede administrar proyectos de diseño.'; end if;
  result := g_comercial.design_operation_result(p_operation_id,request);
  if result is not null then return result; end if;
  if jsonb_typeof(p_titles) is distinct from 'array' then raise exception 'Lista de páginas inválida.'; end if;
  page_count := jsonb_array_length(p_titles);
  if page_count not between 1 and 120 or exists(select 1 from jsonb_array_elements(p_titles) t where jsonb_typeof(t) <> 'string' or btrim(t #>> '{}') = '') then
    raise exception 'Defina entre 1 y 120 páginas con títulos válidos.';
  end if;
  if coalesce(btrim(p_values->>'nombre_proyecto'),'') = '' then raise exception 'Ingrese nombre del proyecto.'; end if;
  if p_project_id is null then
    if coalesce(btrim(p_values->>'catalogo_id'),'') = '' then raise exception 'Seleccione un catálogo.'; end if;
    insert into g_comercial.catalogo_proyecto_diseno(catalogo_id,nombre_proyecto,estado,fecha_inicio,fecha_entrega,creado_por)
      values(btrim(p_values->>'catalogo_id'),btrim(p_values->>'nombre_proyecto'),p_values->>'estado',
        nullif(p_values->>'fecha_inicio','')::date,nullif(p_values->>'fecha_entrega','')::date,g_comercial.current_app_user_id()) returning * into p;
  else
    select * into p from g_comercial.catalogo_proyecto_diseno where id = p_project_id for update;
    if not found then raise exception 'El proyecto ya no está disponible.'; end if;
    if p_expected_updated_at is null or p.fecha_actualizacion is distinct from p_expected_updated_at then
      raise exception 'Otro usuario modificó el proyecto. Actualice antes de guardar.';
    end if;
    -- Bloquea también las páginas frente a cargas y revisiones concurrentes.
    perform id from g_comercial.catalogo_paginas_diseno where proyecto_id = p.id order by id for update;
    if exists(select 1 from g_comercial.catalogo_paginas_diseno pg where pg.proyecto_id = p.id and pg.numero_pagina > page_count
      and (pg.archivo_path is not null or pg.archivo_url is not null
        or exists(select 1 from g_comercial.catalogo_pagina_comentarios c where c.pagina_id = pg.id)
        or exists(select 1 from g_comercial.catalogo_pagina_versiones v where v.pagina_id = pg.id))) then
      raise exception 'No se puede reducir: las páginas tienen imágenes, historial o comentarios.';
    end if;
    update g_comercial.catalogo_proyecto_diseno set nombre_proyecto = btrim(p_values->>'nombre_proyecto'),estado = p_values->>'estado',
      fecha_inicio = nullif(p_values->>'fecha_inicio','')::date,fecha_entrega = nullif(p_values->>'fecha_entrega','')::date,
      fecha_actualizacion = clock_timestamp() where id = p.id returning * into p;
    delete from g_comercial.catalogo_paginas_diseno where proyecto_id = p.id and numero_pagina > page_count;
  end if;
  insert into g_comercial.catalogo_paginas_diseno(proyecto_id,numero_pagina,titulo_pagina,estado)
    select p.id,n::integer,title,'pendiente' from jsonb_array_elements_text(p_titles) with ordinality as t(title,n)
    on conflict (proyecto_id,numero_pagina) do nothing;
  result := to_jsonb(p);
  insert into g_comercial.catalogo_diseno_operaciones(id,usuario_id,solicitud,resultado) values(p_operation_id,g_comercial.current_app_user_id(),request,result);
  return result;
end;
$$;

create or replace function g_comercial.review_catalog_design_page(
  p_operation_id uuid, p_page_id uuid, p_status text, p_comment text, p_annotations jsonb,
  p_version_number integer, p_version_id uuid, p_image_path text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p g_comercial.catalogo_paginas_diseno%rowtype;
  request jsonb := jsonb_build_object('action','review','page',p_page_id,'status',p_status,'comment',p_comment,
    'annotations',p_annotations,'version',p_version_number,'versionId',p_version_id,'path',p_image_path);
  result jsonb;
  resolved_version_id uuid;
  review_text text;
begin
  if not coalesce(g_comercial.is_any_role(array['ADMIN','MARK','BUYER']),false) then raise exception 'No puede revisar páginas.'; end if;
  result := g_comercial.design_operation_result(p_operation_id,request);
  if result is not null then return result; end if;
  select * into p from g_comercial.catalogo_paginas_diseno where id = p_page_id for update;
  if not found then raise exception 'La página ya no está disponible.'; end if;
  if not coalesce(g_comercial.is_any_role(array['ADMIN','MARK']) or (g_comercial.is_role('BUYER') and p.comprador_id = g_comercial.current_buyer_id()),false) then
    raise exception 'No puede revisar una página sin asignación.';
  end if;
  if p_status is null or p_status not in ('aprobada','ajustes','rechazada') then raise exception 'Estado de revisión inválido.'; end if;
  if p_version_number is distinct from coalesce(p.version_actual,1) or p_image_path is distinct from p.archivo_path then
    raise exception 'Solo se puede revisar la versión vigente. Actualice la página.';
  end if;
  select id into resolved_version_id from g_comercial.catalogo_pagina_versiones where pagina_id = p.id and numero_version = p_version_number and archivo_path = p.archivo_path;
  if p_version_id is not null and p_version_id is distinct from resolved_version_id then raise exception 'La versión no corresponde a esta página.'; end if;
  if jsonb_typeof(p_annotations) is distinct from 'array' then raise exception 'Anotaciones inválidas.'; end if;
  review_text := coalesce(nullif(btrim(p_comment),''),case when p_status = 'aprobada' then 'Pagina aprobada.' else 'Pagina requiere ajustes.' end);
  update g_comercial.catalogo_paginas_diseno set estado = p_status,observacion_actual = review_text,
    actualizado_por = g_comercial.current_app_user_id() where id = p.id returning * into p;
  insert into g_comercial.catalogo_pagina_comentarios(pagina_id,usuario_id,comentario,tipo,estado,anotaciones,numero_version,version_id)
    values(p.id,g_comercial.current_app_user_id(),review_text,case when p_status = 'aprobada' then 'aprobacion' else 'rechazo' end,
      case when p_status = 'aprobada' then 'resuelto' else 'abierto' end,p_annotations,p_version_number,resolved_version_id);
  result := to_jsonb(p);
  insert into g_comercial.catalogo_diseno_operaciones(id,usuario_id,solicitud,resultado) values(p_operation_id,g_comercial.current_app_user_id(),request,result);
  return result;
end;
$$;
revoke all on function g_comercial.save_catalog_design_project(uuid,uuid,jsonb,jsonb,timestamptz), g_comercial.review_catalog_design_page(uuid,uuid,text,text,jsonb,integer,uuid,text) from public, anon;
grant execute on function g_comercial.save_catalog_design_project(uuid,uuid,jsonb,jsonb,timestamptz), g_comercial.review_catalog_design_page(uuid,uuid,text,text,jsonb,integer,uuid,text) to authenticated;
commit;



-- =====================================================================
-- STEP: supabase_catalogo_respuestas.sql
-- =====================================================================

-- Ejecutar despues de supabase_catalogo_diseno.sql y antes del frontend.
begin;

create table if not exists g_comercial.catalogo_pagina_respuestas (
  id uuid primary key default gen_random_uuid(),
  comentario_id uuid not null references g_comercial.catalogo_pagina_comentarios(id) on delete cascade,
  numero smallint not null check (numero in (1, 2)),
  comentario text not null check (length(btrim(comentario)) > 0),
  usuario_id uuid default g_comercial.current_app_user_id() references g_comercial.usuarios_app(id) on delete set null,
  fecha_creacion timestamptz not null default now(),
  constraint catalogo_pagina_respuestas_slot_unique unique (comentario_id, numero)
);

alter table g_comercial.catalogo_pagina_respuestas enable row level security;
revoke all on g_comercial.catalogo_pagina_respuestas from anon, authenticated;
grant select on g_comercial.catalogo_pagina_respuestas to authenticated;
-- Autor y fecha se obtienen del servidor; las respuestas no se editan ni eliminan.
grant insert (comentario_id, numero, comentario) on g_comercial.catalogo_pagina_respuestas to authenticated;

drop policy if exists catalogo_respuestas_select on g_comercial.catalogo_pagina_respuestas;
create policy catalogo_respuestas_select on g_comercial.catalogo_pagina_respuestas
for select to authenticated using (
  exists (select 1 from g_comercial.catalogo_pagina_comentarios c where c.id = comentario_id)
);

drop policy if exists catalogo_respuestas_insert on g_comercial.catalogo_pagina_respuestas;
create policy catalogo_respuestas_insert on g_comercial.catalogo_pagina_respuestas
for insert to authenticated with check (
  usuario_id = g_comercial.current_app_user_id()
  and exists (
    select 1 from g_comercial.catalogo_pagina_comentarios c
    join g_comercial.catalogo_paginas_diseno p on p.id = c.pagina_id
    where c.id = comentario_id
      and (
        g_comercial.is_any_role(array['ADMIN', 'MARK'])
        or (g_comercial.is_role('DISENADOR') and p.disenador_id = g_comercial.current_app_user_id())
        or (g_comercial.is_role('BUYER') and p.comprador_id = g_comercial.current_buyer_id())
      )
  )
);

notify pgrst, 'reload schema';
commit;



-- =====================================================================
-- STEP: supabase_catalogo_diseno_fecha_estado.sql
-- =====================================================================

-- Seguimiento exacto de cambios de estado, sin alterar las fechas de actualización.
-- Aplicar en Supabase SQL Editor. Los registros anteriores conservan NULL hasta
-- su siguiente cambio de estado: no se inventa una fecha histórica.
begin;
alter table g_comercial.catalogo_proyecto_diseno add column if not exists fecha_ultimo_estado timestamptz;
alter table g_comercial.catalogo_paginas_diseno add column if not exists fecha_ultimo_estado timestamptz;

create or replace function g_comercial.catalogo_diseno_set_fecha_estado()
returns trigger language plpgsql set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    new.fecha_ultimo_estado := clock_timestamp();
  elsif new.estado is distinct from old.estado then
    new.fecha_ultimo_estado := clock_timestamp();
  else
    new.fecha_ultimo_estado := old.fecha_ultimo_estado;
  end if;
  return new;
end;
$$;

drop trigger if exists catalogo_proyecto_diseno_fecha_estado on g_comercial.catalogo_proyecto_diseno;
create trigger catalogo_proyecto_diseno_fecha_estado before insert or update on g_comercial.catalogo_proyecto_diseno
for each row execute function g_comercial.catalogo_diseno_set_fecha_estado();
drop trigger if exists catalogo_paginas_diseno_fecha_estado on g_comercial.catalogo_paginas_diseno;
create trigger catalogo_paginas_diseno_fecha_estado before insert or update on g_comercial.catalogo_paginas_diseno
for each row execute function g_comercial.catalogo_diseno_set_fecha_estado();
commit;



-- =====================================================================
-- PERMISOS FINALES DE API Y ROLES
-- =====================================================================
grant usage on schema g_comercial to anon, authenticated, service_role;
grant all on all tables in schema g_comercial to anon, authenticated, service_role;
grant all on all routines in schema g_comercial to anon, authenticated, service_role;
grant all on all sequences in schema g_comercial to anon, authenticated, service_role;

alter default privileges in schema g_comercial grant all on tables to anon, authenticated, service_role;
alter default privileges in schema g_comercial grant all on routines to anon, authenticated, service_role;
alter default privileges in schema g_comercial grant all on sequences to anon, authenticated, service_role;
