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
  when 'COMPRADOR' then 'BUYER'
  when 'MERCADEO' then 'MARK'
  when 'MARKETING' then 'MARK'
  when 'PRICING' then 'OPER'
  when 'PLANIMETRIA' then 'OPER'
  when 'EJECUTOR' then 'OPER'
  when 'AUDITOR' then 'AUD'
  else upper(trim(rol))
end;

alter table public.usuarios_app
  add constraint usuarios_app_rol_check
  check (rol in ('ADMIN', 'BUYER', 'MARK', 'OPER', 'AUD'));

alter table public.usuarios_app
  add constraint usuarios_app_buyer_required
  check (rol <> 'BUYER' or buyer_id is not null);

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

grant select, insert, update, delete on
  public.compradores,
  public.usuarios_app,
  public.configuracion,
  public.campanas,
  public.segmentos_clientes,
  public.promociones,
  public.promociones_detalle,
  public.comentarios,
  public.logs,
  public.notificaciones
to authenticated;

grant select, insert, update, delete on
  public.responsables_solicitudes,
  public.jerarquia_categorias,
  public.avances_catalogo
to authenticated;

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
  or (public.is_role('BUYER') and solicitante_buyer_id = public.current_buyer_id())
);

drop policy if exists campanas_update_admin_buyer on public.campanas;
drop policy if exists campanas_update_admin_mercadeo_comprador on public.campanas;
create policy campanas_update_admin_buyer
on public.campanas for update
to authenticated
using (
  public.is_role('ADMIN')
  or (public.is_role('BUYER') and solicitante_buyer_id = public.current_buyer_id())
)
with check (
  public.is_role('ADMIN')
  or (public.is_role('BUYER') and solicitante_buyer_id = public.current_buyer_id())
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
  or (public.is_role('BUYER') and buyer_id = public.current_buyer_id())
);

drop policy if exists promociones_insert_buyer_admin on public.promociones;
create policy promociones_insert_buyer_admin
on public.promociones for insert
to authenticated
with check (
  public.is_role('ADMIN')
  or (public.is_role('BUYER') and buyer_id = public.current_buyer_id())
);

drop policy if exists promociones_update_buyer_admin_mercadeo on public.promociones;
drop policy if exists promociones_update_buyer_admin on public.promociones;
create policy promociones_update_buyer_admin
on public.promociones for update
to authenticated
using (
  public.is_role('ADMIN')
  or (public.is_role('BUYER') and buyer_id = public.current_buyer_id())
)
with check (
  public.is_role('ADMIN')
  or (public.is_role('BUYER') and buyer_id = public.current_buyer_id())
);

drop policy if exists promociones_delete_admin_owner on public.promociones;
create policy promociones_delete_admin_owner
on public.promociones for delete
to authenticated
using (
  public.is_role('ADMIN')
  or (public.is_role('BUYER') and buyer_id = public.current_buyer_id() and estado_registro = 'BORRADOR')
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
        or (public.is_role('BUYER') and p.buyer_id = public.current_buyer_id())
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
      and p.buyer_id = public.current_buyer_id()
  )
)
with check (
  public.is_role('ADMIN')
  or exists (
    select 1
    from public.promociones p
    where p.id = promocion_id
      and public.is_role('BUYER')
      and p.buyer_id = public.current_buyer_id()
  )
);

drop policy if exists avances_catalogo_select_roles on public.avances_catalogo;
create policy avances_catalogo_select_roles
on public.avances_catalogo for select
to authenticated
using (
  public.is_any_role(array['ADMIN', 'MARK', 'OPER'])
  or (public.is_role('BUYER') and buyer_id = public.current_buyer_id())
);

drop policy if exists avances_catalogo_write_owner_admin_mercadeo on public.avances_catalogo;
drop policy if exists avances_catalogo_write_owner_admin on public.avances_catalogo;
create policy avances_catalogo_write_owner_admin
on public.avances_catalogo for all
to authenticated
using (
  public.is_role('ADMIN')
  or (public.is_role('BUYER') and buyer_id = public.current_buyer_id())
)
with check (
  public.is_role('ADMIN')
  or (public.is_role('BUYER') and buyer_id = public.current_buyer_id())
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
      and p.buyer_id = public.current_buyer_id()
  )
  or exists (
    select 1 from public.campanas c
    where c.id = campana_id
      and public.is_role('BUYER')
      and c.solicitante_buyer_id = public.current_buyer_id()
  )
);

drop policy if exists comentarios_insert_mercadeo_admin on public.comentarios;
drop policy if exists comentarios_insert_mark_buyer_admin on public.comentarios;
create policy comentarios_insert_mark_buyer_admin
on public.comentarios for insert
to authenticated
with check (public.is_any_role(array['ADMIN', 'BUYER', 'MARK']));

drop policy if exists comentarios_update_mercadeo_admin on public.comentarios;
drop policy if exists comentarios_update_mark_buyer_admin on public.comentarios;
create policy comentarios_update_mark_buyer_admin
on public.comentarios for update
to authenticated
using (public.is_any_role(array['ADMIN', 'BUYER', 'MARK']))
with check (public.is_any_role(array['ADMIN', 'BUYER', 'MARK']));

drop policy if exists logs_select_roles on public.logs;
create policy logs_select_roles
on public.logs for select
to authenticated
using (public.is_any_role(array['ADMIN', 'AUD']));

drop policy if exists logs_insert_authenticated on public.logs;
create policy logs_insert_authenticated
on public.logs for insert
to authenticated
with check (public.current_user_role() is not null);

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
