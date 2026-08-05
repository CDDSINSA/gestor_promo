-- Roles y politicas RLS para el MVP de Gestion de Promociones.
-- Ejecutar en Supabase SQL Editor despues de crear los usuarios en Authentication.

begin;

-- 1) Actualizar catalogo de roles en public.usuarios_app.
alter table public.usuarios_app
  drop constraint if exists usuarios_app_rol_check;

alter table public.usuarios_app
  drop constraint if exists usuarios_app_buyer_required;

update public.usuarios_app
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
  from public.usuarios_app
  where rol not in ('ADMIN', 'BUYER', 'MARK', 'OPER', 'AUD', 'DISENADOR');

  if v_invalid_roles is not null then
    raise exception 'Roles no reconocidos en public.usuarios_app: %. Actualice el bloque de normalizacion antes de crear usuarios_app_rol_check.', v_invalid_roles;
  end if;
end;
$$;

alter table public.usuarios_app
  add constraint usuarios_app_rol_check
  check (rol in ('ADMIN', 'BUYER', 'MARK', 'OPER', 'AUD', 'DISENADOR'));

alter table public.usuarios_app
  add constraint usuarios_app_buyer_required
  check (rol <> 'BUYER' or buyer_id is not null);

alter table public.compradores
  add column if not exists comprador_id text,
  add column if not exists categoria_comprador text not null default 'Senior',
  add column if not exists senior_id text not null default '';

-- 2) Funciones auxiliares usadas por RLS.
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

create or replace function public.current_buyer_scope_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  with current_buyer as (
    select c.*
    from public.compradores c
    where c.id = public.current_buyer_id()
      and c.activo = true
    limit 1
  ),
  buyer_scope as (
    select c.id
    from public.compradores c
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

create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.usuarios_app
  where auth_user_id = auth.uid()
    and activo = true
  limit 1;
$$;

create or replace function public.current_user_label()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(nombre, ''), nullif(email, ''), '')
  from public.usuarios_app
  where auth_user_id = auth.uid()
    and activo = true
  limit 1;
$$;

create or replace function public.is_comment_scope_closed(
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
    left join public.promociones p on p.id = p_promocion_id
    left join public.campanas cp on cp.id = p.campana_id
    left join public.campanas ca on ca.id = p_campana_id
  )
  select coalesce(bool_or(
    upper(coalesce(promocion_estado, '')) in ('CERRADO', 'ANULADO')
    or upper(coalesce(campana_estado, '')) in ('CERRADO', 'CANCELADO', 'FINALIZADO', 'ARCHIVADO')
  ), false)
  from target;
$$;

create or replace function public.can_write_comment_scope(
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
    from public.usuarios_app
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
    left join public.promociones p on p.id = p_promocion_id
    left join public.campanas cp on cp.id = p.campana_id
    left join public.campanas ca on ca.id = p_campana_id
  )
  select coalesce((
    select
      u.rol = 'ADMIN'
      or (
        u.rol = 'BUYER'
        and (
          t.promocion_buyer_id = any(public.current_buyer_scope_ids())
          or t.solicitante_buyer_id = any(public.current_buyer_scope_ids())
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

create or replace function public.enforce_comentarios_update_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean := public.is_role('ADMIN');
  v_current_user_id uuid := public.current_app_user_id();
  v_current_label text := lower(trim(public.current_user_label()));
  v_is_author boolean := false;
  v_in_author_window boolean := false;
begin
  if v_is_admin then
    return new;
  end if;

  if public.is_comment_scope_closed(old.promocion_id, old.campana_id)
    or public.is_comment_scope_closed(new.promocion_id, new.campana_id) then
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

drop trigger if exists comentarios_enforce_update_rules on public.comentarios;
create trigger comentarios_enforce_update_rules
before update on public.comentarios
for each row execute function public.enforce_comentarios_update_rules();

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
    if v_promocion_id is not null then
      select campana_id into v_campana_id from public.promociones where id = v_promocion_id;
    end if;
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

-- 3) RLS basico por roles nuevos.
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
alter table if exists public.responsables_solicitudes enable row level security;
alter table if exists public.jerarquia_categorias enable row level security;
alter table if exists public.avances_catalogo enable row level security;

alter table public.logs
  add column if not exists actor_auth_user_id uuid,
  add column if not exists rol text not null default '',
  add column if not exists registro text not null default '',
  add column if not exists operation_id text not null default '',
  add column if not exists origen text not null default 'db',
  add column if not exists contexto jsonb not null default '{}'::jsonb;

grant select, insert, update, delete on
  public.compradores,
  public.usuarios_app,
  public.configuracion,
  public.campanas,
  public.segmentos_clientes,
  public.promociones,
  public.promociones_detalle,
  public.comentarios,
  public.notificaciones
to authenticated;

grant select on public.logs to authenticated;
revoke insert, update, delete on public.logs from authenticated;

grant select, insert, update, delete on
  public.responsables_solicitudes,
  public.jerarquia_categorias,
  public.avances_catalogo
to authenticated;

drop trigger if exists logs_prevent_update on public.logs;
create trigger logs_prevent_update
before update on public.logs
for each row execute function public.logs_prevent_mutation();

drop trigger if exists logs_prevent_delete on public.logs;
create trigger logs_prevent_delete
before delete on public.logs
for each row execute function public.logs_prevent_mutation();

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

drop trigger if exists avances_catalogo_audit_row_change on public.avances_catalogo;
create trigger avances_catalogo_audit_row_change
after insert or update or delete on public.avances_catalogo
for each row execute function public.audit_business_row_change();

drop policy if exists compradores_select_authenticated on public.compradores;
create policy compradores_select_authenticated
on public.compradores for select
to authenticated
using (public.current_user_role() is not null);

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

drop policy if exists configuracion_read_authenticated on public.configuracion;
create policy configuracion_read_authenticated
on public.configuracion for select
to authenticated
using (public.current_user_role() is not null);

drop policy if exists configuracion_admin_all on public.configuracion;
create policy configuracion_admin_all
on public.configuracion for all
to authenticated
using (public.is_role('ADMIN'))
with check (public.is_role('ADMIN'));

drop policy if exists campanas_select_roles on public.campanas;
create policy campanas_select_roles
on public.campanas for select
to authenticated
using (public.is_any_role(array['ADMIN', 'BUYER', 'MARK', 'OPER']));

drop policy if exists campanas_write_admin_buyer on public.campanas;
drop policy if exists campanas_write_admin_mercadeo_comprador on public.campanas;
create policy campanas_write_admin_buyer
on public.campanas for insert
to authenticated
with check (
  public.is_role('ADMIN')
  or (public.is_role('BUYER') and solicitante_buyer_id = any(public.current_buyer_scope_ids()))
);

drop policy if exists campanas_update_admin_buyer on public.campanas;
drop policy if exists campanas_update_admin_mercadeo_comprador on public.campanas;
create policy campanas_update_admin_buyer
on public.campanas for update
to authenticated
using (
  public.is_role('ADMIN')
  or (public.is_role('BUYER') and solicitante_buyer_id = any(public.current_buyer_scope_ids()))
)
with check (
  public.is_role('ADMIN')
  or (public.is_role('BUYER') and solicitante_buyer_id = any(public.current_buyer_scope_ids()))
);

drop policy if exists segmentos_read_authenticated on public.segmentos_clientes;
create policy segmentos_read_authenticated
on public.segmentos_clientes for select
to authenticated
using (public.current_user_role() is not null);

drop policy if exists segmentos_admin_all on public.segmentos_clientes;
create policy segmentos_admin_all
on public.segmentos_clientes for all
to authenticated
using (public.is_role('ADMIN'))
with check (public.is_role('ADMIN'));

drop policy if exists responsables_solicitudes_select_roles on public.responsables_solicitudes;
create policy responsables_solicitudes_select_roles
on public.responsables_solicitudes for select
to authenticated
using (public.current_user_role() is not null);

drop policy if exists responsables_solicitudes_admin_mercadeo_all on public.responsables_solicitudes;
drop policy if exists responsables_solicitudes_admin_all on public.responsables_solicitudes;
create policy responsables_solicitudes_admin_all
on public.responsables_solicitudes for all
to authenticated
using (public.is_role('ADMIN'))
with check (public.is_role('ADMIN'));

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

drop policy if exists sku_master_select_roles on public.sku_master;
create policy sku_master_select_roles
on public.sku_master for select
to authenticated
using (
  public.is_any_role(array['ADMIN', 'MARK', 'OPER'])
  or (public.is_role('BUYER') and buyer_id = public.current_buyer_id())
);

drop policy if exists sku_master_write_owner_or_admin on public.sku_master;
create policy sku_master_write_owner_or_admin
on public.sku_master for all
to authenticated
using (public.is_role('ADMIN') or (public.is_role('BUYER') and buyer_id = public.current_buyer_id()))
with check (public.is_role('ADMIN') or (public.is_role('BUYER') and buyer_id = public.current_buyer_id()));

drop policy if exists promociones_select_roles on public.promociones;
create policy promociones_select_roles
on public.promociones for select
to authenticated
using (
  public.is_any_role(array['ADMIN', 'MARK', 'OPER'])
  or (public.is_role('BUYER') and buyer_id = any(public.current_buyer_scope_ids()))
);

drop policy if exists promociones_insert_buyer_admin on public.promociones;
create policy promociones_insert_buyer_admin
on public.promociones for insert
to authenticated
with check (
  public.is_role('ADMIN')
  or (public.is_role('BUYER') and buyer_id = any(public.current_buyer_scope_ids()))
);

drop policy if exists promociones_update_buyer_admin_mercadeo on public.promociones;
drop policy if exists promociones_update_buyer_admin on public.promociones;
create policy promociones_update_buyer_admin
on public.promociones for update
to authenticated
using (
  public.is_role('ADMIN')
  or (public.is_role('BUYER') and buyer_id = any(public.current_buyer_scope_ids()))
)
with check (
  public.is_role('ADMIN')
  or (public.is_role('BUYER') and buyer_id = any(public.current_buyer_scope_ids()))
);

drop policy if exists promociones_delete_admin_owner on public.promociones;
create policy promociones_delete_admin_owner
on public.promociones for delete
to authenticated
using (
  public.is_role('ADMIN')
  or (public.is_role('BUYER') and buyer_id = any(public.current_buyer_scope_ids()) and estado_registro = 'BORRADOR')
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
        public.is_any_role(array['ADMIN', 'MARK', 'OPER'])
        or (public.is_role('BUYER') and p.buyer_id = any(public.current_buyer_scope_ids()))
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
      and public.is_role('BUYER')
      and p.buyer_id = any(public.current_buyer_scope_ids())
  )
)
with check (
  public.is_role('ADMIN')
  or exists (
    select 1
    from public.promociones p
    where p.id = promocion_id
      and public.is_role('BUYER')
      and p.buyer_id = any(public.current_buyer_scope_ids())
  )
);

drop policy if exists avances_catalogo_select_roles on public.avances_catalogo;
create policy avances_catalogo_select_roles
on public.avances_catalogo for select
to authenticated
using (
  public.is_any_role(array['ADMIN', 'MARK', 'OPER'])
  or (public.is_role('BUYER') and buyer_id = any(public.current_buyer_scope_ids()))
);

drop policy if exists avances_catalogo_write_owner_admin_mercadeo on public.avances_catalogo;
drop policy if exists avances_catalogo_write_owner_admin on public.avances_catalogo;
create policy avances_catalogo_write_owner_admin
on public.avances_catalogo for all
to authenticated
using (
  public.is_role('ADMIN')
  or (public.is_role('BUYER') and buyer_id = any(public.current_buyer_scope_ids()))
)
with check (
  public.is_role('ADMIN')
  or (public.is_role('BUYER') and buyer_id = any(public.current_buyer_scope_ids()))
);

drop policy if exists comentarios_select_roles on public.comentarios;
create policy comentarios_select_roles
on public.comentarios for select
to authenticated
using (
  public.is_any_role(array['ADMIN', 'MARK', 'OPER'])
  or exists (
    select 1 from public.promociones p
    where p.id = promocion_id
      and public.is_role('BUYER')
      and p.buyer_id = any(public.current_buyer_scope_ids())
  )
  or exists (
    select 1 from public.campanas c
    where c.id = campana_id
      and public.is_role('BUYER')
      and c.solicitante_buyer_id = any(public.current_buyer_scope_ids())
  )
);

drop policy if exists comentarios_insert_mercadeo_admin on public.comentarios;
drop policy if exists comentarios_insert_mark_buyer_admin on public.comentarios;
create policy comentarios_insert_mark_buyer_admin
on public.comentarios for insert
to authenticated
with check (
  public.can_write_comment_scope(promocion_id, campana_id)
  and usuario_id = public.current_app_user_id()
);

drop policy if exists comentarios_update_mercadeo_admin on public.comentarios;
drop policy if exists comentarios_update_mark_buyer_admin on public.comentarios;
create policy comentarios_update_mark_buyer_admin
on public.comentarios for update
to authenticated
using (public.can_write_comment_scope(promocion_id, campana_id))
with check (public.can_write_comment_scope(promocion_id, campana_id));

drop policy if exists logs_select_roles on public.logs;
create policy logs_select_roles
on public.logs for select
to authenticated
using (public.is_any_role(array['ADMIN', 'AUD']));

drop policy if exists logs_insert_authenticated on public.logs;
drop policy if exists logs_update_authenticated on public.logs;
drop policy if exists logs_delete_authenticated on public.logs;

drop policy if exists notificaciones_select_roles on public.notificaciones;
create policy notificaciones_select_roles
on public.notificaciones for select
to authenticated
using (public.is_role('ADMIN'));

drop policy if exists notificaciones_admin_all on public.notificaciones;
create policy notificaciones_admin_all
on public.notificaciones for all
to authenticated
using (public.is_role('ADMIN'))
with check (public.is_role('ADMIN'));

commit;

-- 4) Ejemplo para asociar un usuario Auth a la app:
-- insert into public.usuarios_app (auth_user_id, nombre, email, rol, buyer_id, activo)
-- values ('UUID_DE_AUTH_USERS', 'Nombre Apellido', 'correo@sinsa.com', 'BUYER', 'UUID_DE_COMPRADOR', true);
