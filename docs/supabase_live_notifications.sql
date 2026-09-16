-- Notificaciones en vivo para la app de promociones.
-- Ejecutar despues del esquema base y del RPC transaccional.

alter table public.campanas
  add column if not exists notificaciones_envivo boolean not null default true;

create table if not exists public.notificaciones_envivo (
  id uuid primary key default gen_random_uuid(),
  destinatario_usuario_id uuid references public.usuarios_app(id) on delete cascade,
  destinatario_rol text not null default '',
  actor_usuario_id uuid references public.usuarios_app(id) on delete set null,
  actor_nombre text not null default '',
  actor_rol text not null default '',
  campana_id uuid references public.campanas(id) on delete cascade,
  promocion_id uuid references public.promociones(id) on delete set null,
  comentario_id uuid references public.comentarios(id) on delete set null,
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
  on public.notificaciones_envivo(destinatario_usuario_id, leida, created_at desc);

create index if not exists idx_notificaciones_envivo_rol
  on public.notificaciones_envivo(destinatario_rol, leida, created_at desc);

create index if not exists idx_notificaciones_envivo_campana
  on public.notificaciones_envivo(campana_id, created_at desc);

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

alter table public.notificaciones_envivo enable row level security;

drop policy if exists notificaciones_envivo_select_own on public.notificaciones_envivo;
create policy notificaciones_envivo_select_own
on public.notificaciones_envivo for select
using (
  destinatario_usuario_id = public.current_app_user_id()
);

drop policy if exists notificaciones_envivo_update_own on public.notificaciones_envivo;
create policy notificaciones_envivo_update_own
on public.notificaciones_envivo for update
using (
  destinatario_usuario_id = public.current_app_user_id()
)
with check (
  destinatario_usuario_id = public.current_app_user_id()
);

drop policy if exists notificaciones_envivo_no_client_insert on public.notificaciones_envivo;
create policy notificaciones_envivo_no_client_insert
on public.notificaciones_envivo for insert
with check (false);

revoke insert, update, delete on public.notificaciones_envivo from authenticated;
grant select on public.notificaciones_envivo to authenticated;
grant update (leida, leida_en) on public.notificaciones_envivo to authenticated;

drop function if exists public.create_live_notification(
  text, text, text, text, text, text, text[], uuid[], text, jsonb
);

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

  with role_targets as (
    select
      u.id as usuario_id,
      u.rol as destinatario_rol
    from public.usuarios_app u
    where u.activo = true
      and u.id <> v_actor.id
      and upper(u.rol) = any(coalesce(p_destinatario_roles, array[]::text[]))
  ),
  direct_targets as (
    select
      u.id as usuario_id,
      u.rol as destinatario_rol
    from public.usuarios_app u
    where u.activo = true
      and u.id <> v_actor.id
      and u.id = any(coalesce(p_destinatario_usuario_ids, array[]::uuid[]))
  ),
  buyer_targets as (
    select
      u.id as usuario_id,
      u.rol as destinatario_rol
    from public.usuarios_app u
    where u.activo = true
      and u.id <> v_actor.id
      and u.buyer_id = any(coalesce(p_destinatario_buyer_ids, array[]::uuid[]))
  ),
  targets as (
    select distinct on (usuario_id)
      usuario_id,
      destinatario_rol
    from (
      select * from direct_targets
      union all
      select * from buyer_targets
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
      coalesce(p_url_modulo, ''),
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

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notificaciones_envivo'
  ) then
    alter publication supabase_realtime add table public.notificaciones_envivo;
  end if;
end;
$$;
