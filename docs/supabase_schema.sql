-- Supabase schema for Sistema de Gestion de Promociones Retail.
-- Ejecutar desde Supabase SQL Editor en un proyecto nuevo.
-- Este modelo conserva PROMOCIONES como tabla principal y deja CONSOLIDADO/EXPORT_* como vistas.

create extension if not exists pgcrypto;

-- =========================================================
-- Helpers
-- =========================================================

create or replace function public.set_updated_at()
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

create table if not exists public.compradores (
  id uuid primary key default gen_random_uuid(),
  comprador text not null,
  division text not null default '',
  correo text not null default '',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint compradores_comprador_unique unique (comprador)
);

create table if not exists public.usuarios_app (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  nombre text not null default '',
  email text not null unique,
  rol text not null check (rol in ('ADMIN', 'COMPRADOR', 'MERCADEO', 'PRICING', 'PLANIMETRIA')),
  buyer_id uuid references public.compradores(id),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint usuarios_app_buyer_required check (
    rol <> 'COMPRADOR' or buyer_id is not null
  )
);

create table if not exists public.configuracion (
  clave text primary key,
  valor jsonb not null default '{}'::jsonb,
  categoria text not null default 'GENERAL',
  descripcion text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.usuarios_app(id)
);

create table if not exists public.campanas (
  id uuid primary key default gen_random_uuid(),
  legacy_actividad_id text not null unique check (length(trim(legacy_actividad_id)) > 0),
  tipo_actividad text not null default 'CATALOGO' check (tipo_actividad in ('CATALOGO', 'ESPECIAL')),
  nombre_actividad text not null,
  canal text not null default '',
  fecha_inicio date,
  fecha_fin date,
  solicitante_buyer_id uuid references public.compradores(id),
  estado text not null default 'BORRADOR' check (estado in ('BORRADOR', 'ACTIVO', 'CERRADO', 'CANCELADO')),
  motivo_solicitud text not null default '',
  color text not null default 'bg-emerald-700',
  doc_id text not null default '',
  token_conexion text not null default '',
  notificaciones boolean not null default false,
  correos text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campanas_fechas_validas check (
    fecha_inicio is null or fecha_fin is null or fecha_fin >= fecha_inicio
  )
);

create table if not exists public.segmentos_clientes (
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

create table if not exists public.sku_master (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid references public.compradores(id),
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

create table if not exists public.promociones (
  id uuid primary key default gen_random_uuid(),
  legacy_row_id text unique,
  campana_id uuid not null references public.campanas(id) on delete cascade,
  oferta_id text not null,
  buyer_id uuid not null references public.compradores(id),
  tipo_promo text not null,
  grupo_oferta text not null default '',
  tipo_sku text not null default 'simple',
  variante text not null default '',
  sku text not null,
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
  updated_by uuid references public.usuarios_app(id),
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

create table if not exists public.promociones_detalle (
  id uuid primary key default gen_random_uuid(),
  promocion_id uuid not null references public.promociones(id) on delete cascade,
  campo text not null,
  valor text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promociones_detalle_unique unique (promocion_id, campo)
);

create table if not exists public.comentarios (
  id uuid primary key default gen_random_uuid(),
  promocion_id uuid not null references public.promociones(id) on delete cascade,
  prioridad text not null default 'MEDIA' check (prioridad in ('BAJA', 'MEDIA', 'ALTA')),
  usuario_id uuid references public.usuarios_app(id),
  usuario text not null default '',
  tipo_usuario text not null default '',
  comentario text not null,
  estado text not null default 'ABIERTO' check (estado in ('ABIERTO', 'RESUELTO')),
  resuelto_por uuid references public.usuarios_app(id),
  fecha_resolucion timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comentarios_texto_required check (length(trim(comentario)) > 0)
);

create table if not exists public.logs (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references public.usuarios_app(id),
  actor_auth_user_id uuid,
  usuario text not null default '',
  rol text not null default '',
  entidad text not null default 'PROMOCIONES',
  entidad_id uuid,
  registro text not null default '',
  campana_id uuid references public.campanas(id) on delete set null,
  promocion_id uuid references public.promociones(id) on delete set null,
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

create table if not exists public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid references public.campanas(id) on delete cascade,
  correo text not null,
  tipo text not null default 'CAMBIO_PROMOCION',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notificaciones_unique unique (campana_id, correo, tipo)
);

-- =========================================================
-- Helpers de seguridad
-- =========================================================

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select rol
  from public.usuarios_app
  where auth_user_id = auth.uid()
    and activo = true
  limit 1;
$$;

create or replace function public.current_buyer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select buyer_id
  from public.usuarios_app
  where auth_user_id = auth.uid()
    and activo = true
  limit 1;
$$;

create or replace function public.is_role(required_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() = required_role;
$$;

create or replace function public.is_any_role(required_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() = any(required_roles);
$$;

-- =========================================================
-- Auditoria confiable
-- =========================================================

create or replace function public.insert_audit_log(
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
  from public.usuarios_app
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

  insert into public.logs (
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

revoke execute on function public.insert_audit_log(text, text, uuid, text, text, text, text, uuid, uuid, text, text, text, jsonb, timestamptz) from public, authenticated, anon;

create or replace function public.logs_prevent_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Los logs de auditoria son append-only y no pueden modificarse ni eliminarse.'
    using errcode = '42501';
end;
$$;

create or replace function public.audit_business_row_change()
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
    select campana_id into v_campana_id from public.promociones where id = v_promocion_id;
  elsif tg_table_name = 'comentarios' then
    v_promocion_id := nullif(v_row ->> 'promocion_id', '')::uuid;
    select campana_id into v_campana_id from public.promociones where id = v_promocion_id;
  end if;

  perform public.insert_audit_log(
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

drop trigger if exists compradores_set_updated_at on public.compradores;
create trigger compradores_set_updated_at
before update on public.compradores
for each row execute function public.set_updated_at();

drop trigger if exists usuarios_app_set_updated_at on public.usuarios_app;
create trigger usuarios_app_set_updated_at
before update on public.usuarios_app
for each row execute function public.set_updated_at();

drop trigger if exists campanas_set_updated_at on public.campanas;
create trigger campanas_set_updated_at
before update on public.campanas
for each row execute function public.set_updated_at();

drop trigger if exists segmentos_clientes_set_updated_at on public.segmentos_clientes;
create trigger segmentos_clientes_set_updated_at
before update on public.segmentos_clientes
for each row execute function public.set_updated_at();

drop trigger if exists sku_master_set_updated_at on public.sku_master;
create trigger sku_master_set_updated_at
before update on public.sku_master
for each row execute function public.set_updated_at();

drop trigger if exists promociones_set_updated_at on public.promociones;
create trigger promociones_set_updated_at
before update on public.promociones
for each row execute function public.set_updated_at();

drop trigger if exists promociones_detalle_set_updated_at on public.promociones_detalle;
create trigger promociones_detalle_set_updated_at
before update on public.promociones_detalle
for each row execute function public.set_updated_at();

drop trigger if exists comentarios_set_updated_at on public.comentarios;
create trigger comentarios_set_updated_at
before update on public.comentarios
for each row execute function public.set_updated_at();

drop trigger if exists campanas_audit_row_change on public.campanas;
create trigger campanas_audit_row_change
after insert or update or delete on public.campanas
for each row execute function public.audit_business_row_change();

drop trigger if exists promociones_audit_row_change on public.promociones;
create trigger promociones_audit_row_change
after insert or update or delete on public.promociones
for each row execute function public.audit_business_row_change();

drop trigger if exists promociones_detalle_audit_row_change on public.promociones_detalle;
create trigger promociones_detalle_audit_row_change
after insert or update or delete on public.promociones_detalle
for each row execute function public.audit_business_row_change();

drop trigger if exists comentarios_audit_row_change on public.comentarios;
create trigger comentarios_audit_row_change
after insert or update or delete on public.comentarios
for each row execute function public.audit_business_row_change();

drop trigger if exists logs_prevent_update on public.logs;
create trigger logs_prevent_update
before update on public.logs
for each row execute function public.logs_prevent_mutation();

drop trigger if exists logs_prevent_delete on public.logs;
create trigger logs_prevent_delete
before delete on public.logs
for each row execute function public.logs_prevent_mutation();

drop trigger if exists notificaciones_set_updated_at on public.notificaciones;
create trigger notificaciones_set_updated_at
before update on public.notificaciones
for each row execute function public.set_updated_at();

-- =========================================================
-- Vistas generadas
-- =========================================================

create or replace view public.consolidado
with (security_invoker = true) as
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
  p.usuario_crea,
  p.usuario_edita,
  p.updated_at as fecha_modificacion
from public.promociones p
join public.campanas c on c.id = p.campana_id
join public.compradores b on b.id = p.buyer_id
left join public.comentarios cm on cm.promocion_id = p.id
group by c.legacy_actividad_id, p.oferta_id, c.tipo_actividad, c.canal, p.alcance_tipo,
  p.alcance_valor, b.comprador, b.division, p.tipo_promo, p.grupo_oferta, p.tipo_sku,
  p.variante, p.sku, p.num_parte, p.descripcion, p.tipo_cantidad, p.cantidad_minima,
  p.precio_antes, p.precio_ahora, p.descuento, p.comentario_comprador, p.aplica_segmento,
  p.segmento_cliente, p.estado_registro, p.usuario_crea, p.usuario_edita, p.updated_at;

create or replace view public.export_pricing
with (security_invoker = true) as
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
  p.estado_registro
from public.promociones p
join public.campanas c on c.id = p.campana_id
join public.compradores b on b.id = p.buyer_id;

create or replace view public.export_mercadeo
with (security_invoker = true) as
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
  string_agg(cm.comentario, ' | ') filter (where cm.estado = 'ABIERTO') as comentarios_abiertos_mercadeo
from public.promociones p
join public.campanas c on c.id = p.campana_id
join public.compradores b on b.id = p.buyer_id
left join public.comentarios cm on cm.promocion_id = p.id
group by c.legacy_actividad_id, p.oferta_id, c.tipo_actividad, c.canal, p.alcance_tipo,
  p.alcance_valor, b.comprador, p.tipo_promo, p.grupo_oferta, p.variante, p.sku,
  p.num_parte, p.descripcion, p.precio_antes, p.precio_ahora, p.descuento,
  p.comentario_comprador, p.aplica_segmento, p.segmento_cliente;

create or replace view public.export_planimetria
with (security_invoker = true) as
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
  case when p.aplica_segmento = 'SI' then p.segmento_cliente else 'Todos' end as segmento
from public.promociones p
join public.campanas c on c.id = p.campana_id
join public.compradores b on b.id = p.buyer_id;

-- =========================================================
-- Indices
-- =========================================================

create index if not exists idx_usuarios_app_auth_user_id on public.usuarios_app(auth_user_id);
create index if not exists idx_usuarios_app_rol on public.usuarios_app(rol);
create index if not exists idx_campanas_estado on public.campanas(estado);
create index if not exists idx_campanas_fechas on public.campanas(fecha_inicio, fecha_fin);
create index if not exists idx_segmentos_canal on public.segmentos_clientes(canal);
create index if not exists idx_sku_master_sku on public.sku_master(sku);
create index if not exists idx_promociones_campana on public.promociones(campana_id);
create index if not exists idx_promociones_buyer on public.promociones(buyer_id);
create index if not exists idx_promociones_sku on public.promociones(sku);
create index if not exists idx_promociones_tipo_promo on public.promociones(tipo_promo);
create index if not exists idx_promociones_estado on public.promociones(estado_registro);
create index if not exists idx_promociones_oferta on public.promociones(oferta_id);
create index if not exists idx_comentarios_promocion on public.comentarios(promocion_id);
create index if not exists idx_comentarios_estado on public.comentarios(estado);
create index if not exists idx_logs_promocion on public.logs(promocion_id);
create index if not exists idx_logs_created_at on public.logs(created_at);
create index if not exists idx_logs_request_id on public.logs(request_id);
create index if not exists idx_logs_operation_id on public.logs(operation_id);
create index if not exists idx_notificaciones_campana on public.notificaciones(campana_id);

-- =========================================================
-- Grants para Supabase API
-- =========================================================

grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.compradores,
  public.usuarios_app,
  public.configuracion,
  public.campanas,
  public.segmentos_clientes,
  public.sku_master,
  public.promociones,
  public.promociones_detalle,
  public.comentarios,
  public.notificaciones
to authenticated;

grant select on public.logs to authenticated;
revoke insert, update, delete on public.logs from authenticated;

grant select on
  public.consolidado,
  public.export_pricing,
  public.export_mercadeo,
  public.export_planimetria
to authenticated;

-- =========================================================
-- Row Level Security
-- =========================================================

alter table public.compradores enable row level security;
alter table public.usuarios_app enable row level security;
alter table public.configuracion enable row level security;
alter table public.campanas enable row level security;
alter table public.segmentos_clientes enable row level security;
alter table public.sku_master enable row level security;
alter table public.promociones enable row level security;
alter table public.promociones_detalle enable row level security;
alter table public.comentarios enable row level security;
alter table public.logs enable row level security;
alter table public.notificaciones enable row level security;

drop policy if exists compradores_select_authenticated on public.compradores;
create policy compradores_select_authenticated
on public.compradores for select
to authenticated
using (true);

drop policy if exists compradores_admin_all on public.compradores;
create policy compradores_admin_all
on public.compradores for all
to authenticated
using (public.is_role('ADMIN'))
with check (public.is_role('ADMIN'));

drop policy if exists usuarios_select_self_or_admin on public.usuarios_app;
create policy usuarios_select_self_or_admin
on public.usuarios_app for select
to authenticated
using (auth_user_id = auth.uid() or public.is_role('ADMIN'));

drop policy if exists usuarios_admin_all on public.usuarios_app;
create policy usuarios_admin_all
on public.usuarios_app for all
to authenticated
using (public.is_role('ADMIN'))
with check (public.is_role('ADMIN'));

drop policy if exists configuracion_admin_all on public.configuracion;
create policy configuracion_admin_all
on public.configuracion for all
to authenticated
using (public.is_role('ADMIN'))
with check (public.is_role('ADMIN'));

drop policy if exists configuracion_read_authenticated on public.configuracion;
create policy configuracion_read_authenticated
on public.configuracion for select
to authenticated
using (true);

drop policy if exists campanas_select_roles on public.campanas;
create policy campanas_select_roles
on public.campanas for select
to authenticated
using (public.is_any_role(array['ADMIN', 'COMPRADOR', 'MERCADEO', 'PRICING', 'PLANIMETRIA']));

drop policy if exists campanas_write_admin_mercadeo_comprador on public.campanas;
create policy campanas_write_admin_mercadeo_comprador
on public.campanas for insert
to authenticated
with check (
  public.is_any_role(array['ADMIN', 'MERCADEO'])
  or (public.is_role('COMPRADOR') and solicitante_buyer_id = public.current_buyer_id())
);

drop policy if exists campanas_update_admin_mercadeo_comprador on public.campanas;
create policy campanas_update_admin_mercadeo_comprador
on public.campanas for update
to authenticated
using (
  public.is_any_role(array['ADMIN', 'MERCADEO'])
  or (public.is_role('COMPRADOR') and solicitante_buyer_id = public.current_buyer_id())
)
with check (
  public.is_any_role(array['ADMIN', 'MERCADEO'])
  or (public.is_role('COMPRADOR') and solicitante_buyer_id = public.current_buyer_id())
);

drop policy if exists segmentos_read_authenticated on public.segmentos_clientes;
create policy segmentos_read_authenticated
on public.segmentos_clientes for select
to authenticated
using (true);

drop policy if exists segmentos_admin_all on public.segmentos_clientes;
create policy segmentos_admin_all
on public.segmentos_clientes for all
to authenticated
using (public.is_role('ADMIN'))
with check (public.is_role('ADMIN'));

drop policy if exists sku_master_select_roles on public.sku_master;
create policy sku_master_select_roles
on public.sku_master for select
to authenticated
using (
  public.is_any_role(array['ADMIN', 'MERCADEO', 'PRICING', 'PLANIMETRIA'])
  or buyer_id = public.current_buyer_id()
);

drop policy if exists sku_master_write_owner_or_admin on public.sku_master;
create policy sku_master_write_owner_or_admin
on public.sku_master for all
to authenticated
using (public.is_role('ADMIN') or buyer_id = public.current_buyer_id())
with check (public.is_role('ADMIN') or buyer_id = public.current_buyer_id());

drop policy if exists promociones_select_roles on public.promociones;
create policy promociones_select_roles
on public.promociones for select
to authenticated
using (
  public.is_any_role(array['ADMIN', 'MERCADEO', 'PRICING', 'PLANIMETRIA'])
  or buyer_id = public.current_buyer_id()
);

drop policy if exists promociones_insert_buyer_admin on public.promociones;
create policy promociones_insert_buyer_admin
on public.promociones for insert
to authenticated
with check (
  public.is_role('ADMIN')
  or (public.is_role('COMPRADOR') and buyer_id = public.current_buyer_id())
);

drop policy if exists promociones_update_buyer_admin_mercadeo on public.promociones;
create policy promociones_update_buyer_admin_mercadeo
on public.promociones for update
to authenticated
using (
  public.is_role('ADMIN')
  or public.is_role('MERCADEO')
  or (public.is_role('COMPRADOR') and buyer_id = public.current_buyer_id())
)
with check (
  public.is_role('ADMIN')
  or public.is_role('MERCADEO')
  or (public.is_role('COMPRADOR') and buyer_id = public.current_buyer_id())
);

drop policy if exists promociones_delete_admin_owner on public.promociones;
create policy promociones_delete_admin_owner
on public.promociones for delete
to authenticated
using (
  public.is_role('ADMIN')
  or (public.is_role('COMPRADOR') and buyer_id = public.current_buyer_id() and estado_registro = 'BORRADOR')
);

drop policy if exists promociones_detalle_select_roles on public.promociones_detalle;
create policy promociones_detalle_select_roles
on public.promociones_detalle for select
to authenticated
using (
  exists (
    select 1
    from public.promociones p
    where p.id = promocion_id
      and (
        public.is_any_role(array['ADMIN', 'MERCADEO', 'PRICING', 'PLANIMETRIA'])
        or p.buyer_id = public.current_buyer_id()
      )
  )
);

drop policy if exists promociones_detalle_write_owner_admin on public.promociones_detalle;
create policy promociones_detalle_write_owner_admin
on public.promociones_detalle for all
to authenticated
using (
  public.is_role('ADMIN')
  or exists (
    select 1
    from public.promociones p
    where p.id = promocion_id
      and p.buyer_id = public.current_buyer_id()
  )
)
with check (
  public.is_role('ADMIN')
  or exists (
    select 1
    from public.promociones p
    where p.id = promocion_id
      and p.buyer_id = public.current_buyer_id()
  )
);

drop policy if exists comentarios_select_roles on public.comentarios;
create policy comentarios_select_roles
on public.comentarios for select
to authenticated
using (
  public.is_any_role(array['ADMIN', 'MERCADEO', 'PRICING', 'PLANIMETRIA'])
  or exists (
    select 1 from public.promociones p
    where p.id = promocion_id
      and p.buyer_id = public.current_buyer_id()
  )
);

drop policy if exists comentarios_insert_mercadeo_admin on public.comentarios;
create policy comentarios_insert_mercadeo_admin
on public.comentarios for insert
to authenticated
with check (public.is_any_role(array['ADMIN', 'MERCADEO']));

drop policy if exists comentarios_update_mercadeo_admin on public.comentarios;
create policy comentarios_update_mercadeo_admin
on public.comentarios for update
to authenticated
using (public.is_any_role(array['ADMIN', 'MERCADEO']))
with check (public.is_any_role(array['ADMIN', 'MERCADEO']));

drop policy if exists logs_select_roles on public.logs;
create policy logs_select_roles
on public.logs for select
to authenticated
using (
  public.is_any_role(array['ADMIN', 'MERCADEO', 'PRICING', 'PLANIMETRIA'])
  or exists (
    select 1 from public.promociones p
    where p.id = promocion_id
      and p.buyer_id = public.current_buyer_id()
  )
);

drop policy if exists logs_insert_authenticated on public.logs;
drop policy if exists logs_update_authenticated on public.logs;
drop policy if exists logs_delete_authenticated on public.logs;

drop policy if exists notificaciones_select_roles on public.notificaciones;
create policy notificaciones_select_roles
on public.notificaciones for select
to authenticated
using (public.is_any_role(array['ADMIN', 'MERCADEO']));

drop policy if exists notificaciones_admin_all on public.notificaciones;
create policy notificaciones_admin_all
on public.notificaciones for all
to authenticated
using (public.is_role('ADMIN'))
with check (public.is_role('ADMIN'));

-- Nota de arranque:
-- 1. Crear usuarios en Supabase Auth.
-- 2. Insertar al menos un registro ADMIN en public.usuarios_app desde SQL Editor.
-- 3. Luego administrar compradores, roles y permisos desde la app o desde Supabase.
