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
    where conrelid = 'public.campanas'::regclass and contype = 'c'
      and conname in ('campanas_estado_check', 'campanas_estado_operativo_check')
  loop
    execute format('alter table public.campanas drop constraint %I', item.conname);
    execute format('alter table public.campanas add constraint %I check ((%s) or (tipo_actividad = ''CATALOGO'' and estado in (''Precios Finales'', ''PRECIOS FINALES'')))', item.conname, item.expression);
  end loop;
end;
$$;

-- Una solicitud produce como máximo una notificación por destinatario.
create unique index if not exists notificaciones_difusion_request_recipient
  on public.notificaciones_envivo (actor_usuario_id, (metadata ->> 'broadcast_request_id'), destinatario_usuario_id)
  where tipo_evento = 'ADMIN_DIFUSION';

-- También protege contra intentos de enviar este evento desde el RPC genérico.
create or replace function public.guard_admin_broadcast()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.tipo_evento = 'ADMIN_DIFUSION' and not exists (
    select 1 from public.usuarios_app
    where auth_user_id = auth.uid() and activo = true and rol = 'ADMIN'
      and id = new.actor_usuario_id
  ) then
    raise exception 'Solo el administrador puede enviar difusiones.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_admin_broadcast() from public, anon, authenticated;
drop trigger if exists guard_admin_broadcast on public.notificaciones_envivo;
create trigger guard_admin_broadcast before insert on public.notificaciones_envivo
  for each row execute function public.guard_admin_broadcast();

create or replace function public.send_admin_broadcast(p_titulo text, p_mensaje text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor public.usuarios_app%rowtype;
  v_count integer;
  v_previous public.notificaciones_envivo%rowtype;
begin
  select * into v_actor from public.usuarios_app
    where auth_user_id = auth.uid() and activo = true and rol = 'ADMIN' limit 1;
  if v_actor.id is null then
    raise exception 'Solo el administrador puede enviar difusiones.' using errcode = '42501';
  end if;
  if p_request_id is null or coalesce(length(btrim(p_titulo)), 0) not between 1 and 100
    or coalesce(length(btrim(p_mensaje)), 0) not between 1 and 1000 then
    raise exception 'Asunto (1–100), mensaje (1–1000) e identificador son obligatorios.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_actor.id::text || p_request_id::text, 0));
  select * into v_previous from public.notificaciones_envivo
    where tipo_evento = 'ADMIN_DIFUSION' and actor_usuario_id = v_actor.id
      and metadata ->> 'broadcast_request_id' = p_request_id::text limit 1;
  if found then
    if v_previous.titulo <> btrim(p_titulo) or v_previous.mensaje <> btrim(p_mensaje) then
      raise exception 'El identificador ya corresponde a otro mensaje.' using errcode = '22023';
    end if;
    select count(*) into v_count from public.notificaciones_envivo
      where tipo_evento = 'ADMIN_DIFUSION' and actor_usuario_id = v_actor.id
        and metadata ->> 'broadcast_request_id' = p_request_id::text;
    return jsonb_build_object('inserted', v_count, 'replayed', true);
  end if;

  insert into public.notificaciones_envivo (
    destinatario_usuario_id, destinatario_rol, actor_usuario_id, actor_nombre, actor_rol,
    tipo_evento, titulo, mensaje, metadata
  )
  select id, rol, v_actor.id, v_actor.nombre, v_actor.rol,
    'ADMIN_DIFUSION', btrim(p_titulo), btrim(p_mensaje),
    jsonb_build_object('broadcast_request_id', p_request_id)
  from public.usuarios_app
  where activo = true and rol in ('BUYER', 'MARK', 'OPER');
  get diagnostics v_count = row_count;
  return jsonb_build_object('inserted', v_count);
end;
$$;
revoke all on function public.send_admin_broadcast(text, text, uuid) from public, anon;
grant execute on function public.send_admin_broadcast(text, text, uuid) to authenticated;
commit;
