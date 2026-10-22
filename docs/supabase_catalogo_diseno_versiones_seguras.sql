-- Requiere esquema de Diseño, versionamiento y corrección de fechas.
-- Aplicar antes de publicar el frontend de etapa 3. No elimina archivos históricos.
begin;

update storage.buckets set public = false where id = 'sns_app_promo';

create or replace function public.can_read_design_page(p_page_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.catalogo_paginas_diseno p where p.id = p_page_id
    and (public.is_any_role(array['ADMIN','MARK','AUD'])
      or (public.is_role('DISENADOR') and p.disenador_id = public.current_app_user_id())
      or (public.is_role('BUYER') and p.comprador_id = public.current_buyer_id())));
$$;

create or replace function public.can_upload_design_path(p_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.catalogo_paginas_diseno p
    join public.catalogo_proyecto_diseno pr on pr.id = p.proyecto_id
    where split_part(p_path,'/',1) = 'catalogos'
      and split_part(p_path,'/',2) = pr.catalogo_id
      and split_part(p_path,'/',3) = 'paginas'
      and split_part(p_path,'/',4) = p.id::text
      and array_length(string_to_array(p_path,'/'),1) = 5
      and split_part(p_path,'/',5) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$'
      and (public.is_any_role(array['ADMIN','MARK'])
        or (public.is_role('DISENADOR') and p.disenador_id = public.current_app_user_id())));
$$;

create or replace function public.can_read_design_path(p_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.catalogo_paginas_diseno p
    where public.can_read_design_page(p.id) and (p.archivo_path = p_path
      or exists (select 1 from public.catalogo_pagina_versiones v where v.pagina_id = p.id and v.archivo_path = p_path)));
$$;

revoke all on function public.can_read_design_page(uuid), public.can_upload_design_path(text), public.can_read_design_path(text) from public, anon;
grant execute on function public.can_read_design_page(uuid), public.can_upload_design_path(text), public.can_read_design_path(text) to authenticated;

drop policy if exists catalogo_pagina_versiones_select on public.catalogo_pagina_versiones;
drop policy if exists catalogo_pagina_versiones_insert on public.catalogo_pagina_versiones;
drop policy if exists design_versions_scope on public.catalogo_pagina_versiones;
create policy catalogo_pagina_versiones_select on public.catalogo_pagina_versiones for select to authenticated
  using (public.can_read_design_page(pagina_id));
create policy design_versions_scope on public.catalogo_pagina_versiones as restrictive for select to authenticated
  using (public.can_read_design_page(pagina_id));
revoke all on public.catalogo_pagina_versiones from public, anon, authenticated;
grant select on public.catalogo_pagina_versiones to authenticated;

-- Las columnas del archivo y su contador solo se escriben mediante la RPC.
revoke update on public.catalogo_paginas_diseno from public, anon, authenticated;
grant update (titulo_pagina, disenador_id, comprador_id, estado, observacion_actual, actualizado_por, fecha_actualizacion)
  on public.catalogo_paginas_diseno to authenticated;

drop policy if exists catalog_design_work_storage_read on storage.objects;
drop policy if exists catalog_design_work_storage_write on storage.objects;
drop policy if exists catalog_design_work_storage_update on storage.objects;
create policy catalog_design_work_storage_read on storage.objects for select to authenticated
  using (bucket_id = 'sns_app_promo' and public.can_read_design_path(name));
create policy catalog_design_work_storage_write on storage.objects for insert to authenticated
  with check (bucket_id = 'sns_app_promo' and public.can_upload_design_path(name));

-- Evita que otra política permisiva del bucket habilite sobrescrituras o lecturas ajenas.
drop policy if exists design_storage_read_scope on storage.objects;
drop policy if exists design_storage_insert_scope on storage.objects;
drop policy if exists design_storage_immutable_update on storage.objects;
drop policy if exists design_storage_immutable_delete on storage.objects;
drop policy if exists design_storage_no_anon on storage.objects;
create policy design_storage_no_anon on storage.objects as restrictive for all to anon
  using (bucket_id <> 'sns_app_promo') with check (bucket_id <> 'sns_app_promo');
create policy design_storage_read_scope on storage.objects as restrictive for select to authenticated
  using (bucket_id <> 'sns_app_promo' or public.can_read_design_path(name));
create policy design_storage_insert_scope on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'sns_app_promo' or public.can_upload_design_path(name));
create policy design_storage_immutable_update on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'sns_app_promo') with check (bucket_id <> 'sns_app_promo');
create policy design_storage_immutable_delete on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'sns_app_promo');

create or replace function public.register_catalog_design_version(p_page_id uuid, p_path text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p public.catalogo_paginas_diseno%rowtype;
  v public.catalogo_pagina_versiones%rowtype;
  next_number integer;
begin
  select * into p from public.catalogo_paginas_diseno where id = p_page_id for update;
  if not found or not coalesce(public.can_upload_design_path(p_path), false)
    or split_part(p_path,'/',4) <> p_page_id::text then
    raise exception 'No tiene permiso para cargar esta página.';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'sns_app_promo'
    and name = p_path and owner_id = auth.uid()::text) then
    raise exception 'No se encontró un archivo cargado por su sesión.';
  end if;
  -- Reintentar la misma confirmación no crea otra versión.
  select * into v from public.catalogo_pagina_versiones where pagina_id = p.id and archivo_path = p_path;
  if found then
    return jsonb_build_object('updatedPage',to_jsonb(p),'newVersionRecord',to_jsonb(v),'versionNumber',v.numero_version);
  end if;
  -- Conserva el arte previo de instalaciones con historial incompleto.
  if p.archivo_path is not null and not exists (
    select 1 from public.catalogo_pagina_versiones where pagina_id = p.id and archivo_path = p.archivo_path
  ) then
    insert into public.catalogo_pagina_versiones(pagina_id,numero_version,archivo_path,creado_por,fecha_creacion)
    values(p.id,coalesce(p.version_actual,1),p.archivo_path,p.actualizado_por,coalesce(p.fecha_ultima_carga,now()));
  end if;
  select greatest(coalesce(max(numero_version),0),case when p.archivo_path is not null then coalesce(p.version_actual,1) else 0 end)+1
    into next_number from public.catalogo_pagina_versiones where pagina_id = p.id;
  insert into public.catalogo_pagina_versiones(pagina_id,numero_version,archivo_path,creado_por)
    values(p.id,next_number,p_path,public.current_app_user_id()) returning * into v;
  update public.catalogo_paginas_diseno set archivo_path = p_path, archivo_url = null,
    version_actual = next_number, estado = 'en_revision', fecha_ultima_carga = now(),
    actualizado_por = public.current_app_user_id() where id = p.id returning * into p;
  return jsonb_build_object('updatedPage',to_jsonb(p),'newVersionRecord',to_jsonb(v),'versionNumber',next_number);
end;
$$;
revoke all on function public.register_catalog_design_version(uuid,text) from public, anon;
grant execute on function public.register_catalog_design_version(uuid,text) to authenticated;
commit;
