-- Ajuste operativo Supabase - 2026-06-22
-- Sistema de Gestion de Promociones Retail
--
-- Ejecutar despues de docs/supabase_schema.sql si la base ya fue creada.
-- Este ajuste NO carga ni modela master_sku. El maestro de SKU se mantiene fuera de Supabase
-- por ser informacion delicada/confidencial del negocio.

-- =========================================================
-- 1. Compradores Senior/Junior
-- =========================================================

alter table public.compradores
  add column if not exists comprador_id text,
  add column if not exists categoria_comprador text not null default 'Senior',
  add column if not exists senior_id text not null default '';

create unique index if not exists compradores_comprador_id_unique
on public.compradores (comprador_id)
where comprador_id is not null and comprador_id <> '';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'compradores_categoria_comprador_check'
      and conrelid = 'public.compradores'::regclass
  ) then
    alter table public.compradores
      add constraint compradores_categoria_comprador_check
      check (categoria_comprador in ('Senior', 'Junior'));
  end if;
end;
$$;

-- =========================================================
-- 2. Campanas / Actividades / Solicitudes especiales
-- =========================================================

alter table public.campanas
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

alter table public.campanas
  drop constraint if exists campanas_estado_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'campanas_estado_operativo_check'
      and conrelid = 'public.campanas'::regclass
  ) then
    alter table public.campanas
      add constraint campanas_estado_operativo_check
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

alter table public.promociones
  add column if not exists dep_id text not null default '',
  add column if not exists ultima_modificacion_por text not null default '';

alter table public.promociones
  drop constraint if exists promociones_estado_registro_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'promociones_estado_registro_operativo_check'
      and conrelid = 'public.promociones'::regclass
  ) then
    alter table public.promociones
      add constraint promociones_estado_registro_operativo_check
      check (estado_registro in (
        'BORRADOR', 'REGISTRADO', 'EN_REVISION', 'APROBADO', 'RECHAZADO', 'CERRADO', 'ANULADO'
      ));
  end if;
end;
$$;

create index if not exists idx_promociones_dep_id on public.promociones(dep_id);

-- =========================================================
-- 4. Comentarios por linea y por actividad
-- =========================================================

alter table public.comentarios
  alter column promocion_id drop not null;

alter table public.comentarios
  add column if not exists legacy_comentario_id text,
  add column if not exists campana_id uuid references public.campanas(id) on delete cascade,
  add column if not exists legacy_row_id text not null default '',
  add column if not exists alcance_comentario text not null default 'LINEA',
  add column if not exists fecha timestamptz not null default now();

create unique index if not exists comentarios_legacy_comentario_id_unique
on public.comentarios (legacy_comentario_id)
where legacy_comentario_id is not null and legacy_comentario_id <> '';

alter table public.comentarios
  drop constraint if exists comentarios_alcance_comentario_check,
  drop constraint if exists comentarios_scope_reference_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'comentarios_alcance_comentario_check'
      and conrelid = 'public.comentarios'::regclass
  ) then
    alter table public.comentarios
      add constraint comentarios_alcance_comentario_check
      check (alcance_comentario in ('LINEA', 'ACTIVIDAD'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'comentarios_scope_reference_check'
      and conrelid = 'public.comentarios'::regclass
  ) then
    alter table public.comentarios
      add constraint comentarios_scope_reference_check
      check (
        (alcance_comentario = 'LINEA' and promocion_id is not null)
        or
        (alcance_comentario = 'ACTIVIDAD' and campana_id is not null)
      );
  end if;
end;
$$;

create index if not exists idx_comentarios_campana on public.comentarios(campana_id);
create index if not exists idx_comentarios_alcance on public.comentarios(alcance_comentario);
create index if not exists idx_comentarios_legacy_row_id on public.comentarios(legacy_row_id);

-- =========================================================
-- 5. Nuevas tablas operativas
-- =========================================================

create table if not exists public.responsables_solicitudes (
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

create table if not exists public.jerarquia_categorias (
  dep_id text primary key,
  dep_desc text not null default '',
  division text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jerarquia_categorias_division_required check (length(trim(division)) > 0)
);

create table if not exists public.avances_catalogo (
  id uuid primary key default gen_random_uuid(),
  avance_id text not null unique,
  campana_id uuid references public.campanas(id) on delete cascade,
  catalogo_id text not null default '',
  catalogo text not null default '',
  comprador_id text not null default '',
  buyer_id uuid references public.compradores(id) on delete set null,
  comprador text not null default '',
  division text not null default '',
  estado text not null default 'Pendiente' check (estado in ('Pendiente', 'Terminado')),
  fecha_estado timestamptz not null default now(),
  usuario text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists responsables_solicitudes_set_updated_at on public.responsables_solicitudes;
create trigger responsables_solicitudes_set_updated_at
before update on public.responsables_solicitudes
for each row execute function public.set_updated_at();

drop trigger if exists jerarquia_categorias_set_updated_at on public.jerarquia_categorias;
create trigger jerarquia_categorias_set_updated_at
before update on public.jerarquia_categorias
for each row execute function public.set_updated_at();

drop trigger if exists avances_catalogo_set_updated_at on public.avances_catalogo;
create trigger avances_catalogo_set_updated_at
before update on public.avances_catalogo
for each row execute function public.set_updated_at();

create index if not exists idx_responsables_solicitudes_activo on public.responsables_solicitudes(activo);
create index if not exists idx_jerarquia_categorias_division on public.jerarquia_categorias(division);
create index if not exists idx_avances_catalogo_campana on public.avances_catalogo(campana_id);
create index if not exists idx_avances_catalogo_catalogo_id on public.avances_catalogo(catalogo_id);
create index if not exists idx_avances_catalogo_buyer on public.avances_catalogo(buyer_id);
create index if not exists idx_avances_catalogo_estado on public.avances_catalogo(estado);

-- =========================================================
-- 6. Vistas actualizadas
-- =========================================================

drop view if exists public.consolidado;
drop view if exists public.export_pricing;
drop view if exists public.export_mercadeo;
drop view if exists public.export_planimetria;

create or replace view public.consolidado
with (security_invoker = true) as
with comentarios_actividad as (
  select
    campana_id,
    string_agg(estado || ': ' || comentario, ' | ' order by fecha) as comentarios_actividad,
    count(*) filter (where estado = 'ABIERTO') as comentarios_actividad_abiertos
  from public.comentarios
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
  p.updated_at as fecha_modificacion,
  p.ultima_modificacion_por
from public.promociones p
join public.campanas c on c.id = p.campana_id
join public.compradores b on b.id = p.buyer_id
left join public.comentarios cm
  on cm.promocion_id = p.id
  and cm.alcance_comentario = 'LINEA'
left join comentarios_actividad ca on ca.campana_id = p.campana_id
group by c.legacy_actividad_id, p.oferta_id, c.tipo_actividad, c.canal, p.alcance_tipo,
  p.alcance_valor, b.comprador, b.division, p.tipo_promo, p.grupo_oferta, p.tipo_sku,
  p.variante, p.sku, p.num_parte, p.descripcion, p.tipo_cantidad, p.cantidad_minima,
  p.precio_antes, p.precio_ahora, p.descuento, p.comentario_comprador, p.aplica_segmento,
  p.segmento_cliente, p.estado_registro, ca.comentarios_actividad,
  ca.comentarios_actividad_abiertos, p.updated_at, p.ultima_modificacion_por;

create or replace view public.export_pricing
with (security_invoker = true) as
with comentarios_actividad as (
  select
    campana_id,
    string_agg(estado || ': ' || comentario, ' | ' order by fecha) as comentarios_actividad
  from public.comentarios
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
from public.promociones p
join public.campanas c on c.id = p.campana_id
join public.compradores b on b.id = p.buyer_id
left join comentarios_actividad ca on ca.campana_id = p.campana_id;

create or replace view public.export_mercadeo
with (security_invoker = true) as
with comentarios_actividad as (
  select
    campana_id,
    string_agg(estado || ': ' || comentario, ' | ' order by fecha) as comentarios_actividad
  from public.comentarios
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
from public.promociones p
join public.campanas c on c.id = p.campana_id
join public.compradores b on b.id = p.buyer_id
left join public.comentarios cm
  on cm.promocion_id = p.id
  and cm.alcance_comentario = 'LINEA'
left join comentarios_actividad ca on ca.campana_id = p.campana_id
group by c.legacy_actividad_id, p.oferta_id, c.tipo_actividad, c.canal, p.alcance_tipo,
  p.alcance_valor, b.comprador, p.tipo_promo, p.grupo_oferta, p.variante, p.sku,
  p.num_parte, p.descripcion, p.precio_antes, p.precio_ahora, p.descuento,
  p.comentario_comprador, p.aplica_segmento, p.segmento_cliente, ca.comentarios_actividad;

create or replace view public.export_planimetria
with (security_invoker = true) as
with comentarios_actividad as (
  select
    campana_id,
    string_agg(estado || ': ' || comentario, ' | ' order by fecha) as comentarios_actividad
  from public.comentarios
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
from public.promociones p
join public.campanas c on c.id = p.campana_id
join public.compradores b on b.id = p.buyer_id
left join comentarios_actividad ca on ca.campana_id = p.campana_id;

-- =========================================================
-- 7. Grants y RLS para nuevas tablas
-- =========================================================

grant select, insert, update, delete on
  public.responsables_solicitudes,
  public.jerarquia_categorias,
  public.avances_catalogo
to authenticated;

grant select on
  public.consolidado,
  public.export_pricing,
  public.export_mercadeo,
  public.export_planimetria
to authenticated;

alter table public.responsables_solicitudes enable row level security;
alter table public.jerarquia_categorias enable row level security;
alter table public.avances_catalogo enable row level security;

drop policy if exists responsables_solicitudes_select_roles on public.responsables_solicitudes;
create policy responsables_solicitudes_select_roles
on public.responsables_solicitudes for select
to authenticated
using (public.current_user_role() is not null);

drop policy if exists responsables_solicitudes_admin_mercadeo_all on public.responsables_solicitudes;
create policy responsables_solicitudes_admin_mercadeo_all
on public.responsables_solicitudes for all
to authenticated
using (public.is_any_role(array['ADMIN', 'MERCADEO']))
with check (public.is_any_role(array['ADMIN', 'MERCADEO']));

drop policy if exists jerarquia_categorias_select_roles on public.jerarquia_categorias;
create policy jerarquia_categorias_select_roles
on public.jerarquia_categorias for select
to authenticated
using (public.current_user_role() is not null);

drop policy if exists jerarquia_categorias_admin_all on public.jerarquia_categorias;
create policy jerarquia_categorias_admin_all
on public.jerarquia_categorias for all
to authenticated
using (public.is_role('ADMIN'))
with check (public.is_role('ADMIN'));

drop policy if exists avances_catalogo_select_roles on public.avances_catalogo;
create policy avances_catalogo_select_roles
on public.avances_catalogo for select
to authenticated
using (
  public.is_any_role(array['ADMIN', 'MERCADEO', 'PRICING', 'PLANIMETRIA'])
  or buyer_id = public.current_buyer_id()
);

drop policy if exists avances_catalogo_write_owner_admin_mercadeo on public.avances_catalogo;
create policy avances_catalogo_write_owner_admin_mercadeo
on public.avances_catalogo for all
to authenticated
using (
  public.is_any_role(array['ADMIN', 'MERCADEO'])
  or buyer_id = public.current_buyer_id()
)
with check (
  public.is_any_role(array['ADMIN', 'MERCADEO'])
  or buyer_id = public.current_buyer_id()
);

-- =========================================================
-- 8. Ajuste de politicas para comentarios de actividad
-- =========================================================

drop policy if exists comentarios_select_roles on public.comentarios;
create policy comentarios_select_roles
on public.comentarios for select
to authenticated
using (
  public.is_any_role(array['ADMIN', 'MERCADEO', 'PRICING', 'PLANIMETRIA'])
  or exists (
    select 1
    from public.promociones p
    where p.id = promocion_id
      and p.buyer_id = public.current_buyer_id()
  )
  or exists (
    select 1
    from public.campanas c
    where c.id = campana_id
      and c.solicitante_buyer_id = public.current_buyer_id()
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

-- =========================================================
-- 9. Opcional: retirar sku_master de Supabase
-- =========================================================
-- Si ejecutaste el esquema anterior, esta linea bloquea el uso de sku_master desde la API autenticada.
-- La tabla queda inaccesible para la app aunque exista en la base.
do $$
begin
  if to_regclass('public.sku_master') is not null then
    revoke all on table public.sku_master from authenticated;
  end if;
end;
$$;

-- Si ademas quieres eliminar la tabla, ejecuta manualmente esta linea despues de confirmar
-- que no tiene datos ni dependencias:
-- drop table if exists public.sku_master;
--
-- Recomendacion operativa:
-- mantener el maestro SKU fuera de Supabase y cargarlo temporalmente desde archivo ERP en la sesion
-- de trabajo del comprador, como hace actualmente la app.
