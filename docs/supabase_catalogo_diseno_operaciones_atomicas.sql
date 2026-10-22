-- Etapa 4. Aplicar después de categorías y versiones_seguras, antes del frontend.
begin;

create table if not exists public.catalogo_diseno_operaciones (
  id uuid primary key,
  usuario_id uuid not null references public.usuarios_app(id),
  solicitud jsonb not null,
  resultado jsonb not null,
  fecha_creacion timestamptz not null default now()
);
alter table public.catalogo_diseno_operaciones enable row level security;
revoke all on public.catalogo_diseno_operaciones from public, anon, authenticated;

-- Solo la llaman las RPC autorizadas. El bloqueo serializa reintentos del mismo ID.
create or replace function public.design_operation_result(p_id uuid, p_request jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare op public.catalogo_diseno_operaciones%rowtype;
begin
  if p_id is null or public.current_app_user_id() is null then raise exception 'Sesión u operación inválida.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  select * into op from public.catalogo_diseno_operaciones where id = p_id;
  if found then
    if op.usuario_id <> public.current_app_user_id() or op.solicitud <> p_request then
      raise exception 'El identificador pertenece a otra operación.';
    end if;
    return op.resultado;
  end if;
  return null;
end;
$$;
revoke all on function public.design_operation_result(uuid,jsonb) from public, anon, authenticated;

create or replace function public.save_catalog_design_project(
  p_operation_id uuid, p_project_id uuid, p_values jsonb, p_titles jsonb, p_expected_updated_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p public.catalogo_proyecto_diseno%rowtype;
  request jsonb := jsonb_build_object('action','project','id',p_project_id,'values',p_values,'titles',p_titles,'expected',p_expected_updated_at);
  result jsonb;
  page_count integer;
begin
  if not coalesce(public.is_any_role(array['ADMIN','MARK']),false) then raise exception 'No puede administrar proyectos de diseño.'; end if;
  result := public.design_operation_result(p_operation_id,request);
  if result is not null then return result; end if;
  if jsonb_typeof(p_titles) is distinct from 'array' then raise exception 'Lista de páginas inválida.'; end if;
  page_count := jsonb_array_length(p_titles);
  if page_count not between 1 and 120 or exists(select 1 from jsonb_array_elements(p_titles) t where jsonb_typeof(t) <> 'string' or btrim(t #>> '{}') = '') then
    raise exception 'Defina entre 1 y 120 páginas con títulos válidos.';
  end if;
  if coalesce(btrim(p_values->>'nombre_proyecto'),'') = '' then raise exception 'Ingrese nombre del proyecto.'; end if;
  if p_project_id is null then
    if coalesce(btrim(p_values->>'catalogo_id'),'') = '' then raise exception 'Seleccione un catálogo.'; end if;
    insert into public.catalogo_proyecto_diseno(catalogo_id,nombre_proyecto,estado,fecha_inicio,fecha_entrega,creado_por)
      values(btrim(p_values->>'catalogo_id'),btrim(p_values->>'nombre_proyecto'),p_values->>'estado',
        nullif(p_values->>'fecha_inicio','')::date,nullif(p_values->>'fecha_entrega','')::date,public.current_app_user_id()) returning * into p;
  else
    select * into p from public.catalogo_proyecto_diseno where id = p_project_id for update;
    if not found then raise exception 'El proyecto ya no está disponible.'; end if;
    if p_expected_updated_at is null or p.fecha_actualizacion is distinct from p_expected_updated_at then
      raise exception 'Otro usuario modificó el proyecto. Actualice antes de guardar.';
    end if;
    -- Bloquea también las páginas frente a cargas y revisiones concurrentes.
    perform id from public.catalogo_paginas_diseno where proyecto_id = p.id order by id for update;
    if exists(select 1 from public.catalogo_paginas_diseno pg where pg.proyecto_id = p.id and pg.numero_pagina > page_count
      and (pg.archivo_path is not null or pg.archivo_url is not null
        or exists(select 1 from public.catalogo_pagina_comentarios c where c.pagina_id = pg.id)
        or exists(select 1 from public.catalogo_pagina_versiones v where v.pagina_id = pg.id))) then
      raise exception 'No se puede reducir: las páginas tienen imágenes, historial o comentarios.';
    end if;
    update public.catalogo_proyecto_diseno set nombre_proyecto = btrim(p_values->>'nombre_proyecto'),estado = p_values->>'estado',
      fecha_inicio = nullif(p_values->>'fecha_inicio','')::date,fecha_entrega = nullif(p_values->>'fecha_entrega','')::date,
      fecha_actualizacion = clock_timestamp() where id = p.id returning * into p;
    delete from public.catalogo_paginas_diseno where proyecto_id = p.id and numero_pagina > page_count;
  end if;
  insert into public.catalogo_paginas_diseno(proyecto_id,numero_pagina,titulo_pagina,estado)
    select p.id,n::integer,title,'pendiente' from jsonb_array_elements_text(p_titles) with ordinality as t(title,n)
    on conflict (proyecto_id,numero_pagina) do nothing;
  result := to_jsonb(p);
  insert into public.catalogo_diseno_operaciones(id,usuario_id,solicitud,resultado) values(p_operation_id,public.current_app_user_id(),request,result);
  return result;
end;
$$;

create or replace function public.review_catalog_design_page(
  p_operation_id uuid, p_page_id uuid, p_status text, p_comment text, p_annotations jsonb,
  p_version_number integer, p_version_id uuid, p_image_path text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p public.catalogo_paginas_diseno%rowtype;
  request jsonb := jsonb_build_object('action','review','page',p_page_id,'status',p_status,'comment',p_comment,
    'annotations',p_annotations,'version',p_version_number,'versionId',p_version_id,'path',p_image_path);
  result jsonb;
  resolved_version_id uuid;
  review_text text;
begin
  if not coalesce(public.is_any_role(array['ADMIN','MARK','BUYER']),false) then raise exception 'No puede revisar páginas.'; end if;
  result := public.design_operation_result(p_operation_id,request);
  if result is not null then return result; end if;
  select * into p from public.catalogo_paginas_diseno where id = p_page_id for update;
  if not found then raise exception 'La página ya no está disponible.'; end if;
  if not coalesce(public.is_any_role(array['ADMIN','MARK']) or (public.is_role('BUYER') and p.comprador_id = public.current_buyer_id()),false) then
    raise exception 'No puede revisar una página sin asignación.';
  end if;
  if p_status is null or p_status not in ('aprobada','ajustes','rechazada') then raise exception 'Estado de revisión inválido.'; end if;
  if p_version_number is distinct from coalesce(p.version_actual,1) or p_image_path is distinct from p.archivo_path then
    raise exception 'Solo se puede revisar la versión vigente. Actualice la página.';
  end if;
  select id into resolved_version_id from public.catalogo_pagina_versiones where pagina_id = p.id and numero_version = p_version_number and archivo_path = p.archivo_path;
  if p_version_id is not null and p_version_id is distinct from resolved_version_id then raise exception 'La versión no corresponde a esta página.'; end if;
  if jsonb_typeof(p_annotations) is distinct from 'array' then raise exception 'Anotaciones inválidas.'; end if;
  review_text := coalesce(nullif(btrim(p_comment),''),case when p_status = 'aprobada' then 'Pagina aprobada.' else 'Pagina requiere ajustes.' end);
  update public.catalogo_paginas_diseno set estado = p_status,observacion_actual = review_text,
    actualizado_por = public.current_app_user_id() where id = p.id returning * into p;
  insert into public.catalogo_pagina_comentarios(pagina_id,usuario_id,comentario,tipo,estado,anotaciones,numero_version,version_id)
    values(p.id,public.current_app_user_id(),review_text,case when p_status = 'aprobada' then 'aprobacion' else 'rechazo' end,
      case when p_status = 'aprobada' then 'resuelto' else 'abierto' end,p_annotations,p_version_number,resolved_version_id);
  result := to_jsonb(p);
  insert into public.catalogo_diseno_operaciones(id,usuario_id,solicitud,resultado) values(p_operation_id,public.current_app_user_id(),request,result);
  return result;
end;
$$;
revoke all on function public.save_catalog_design_project(uuid,uuid,jsonb,jsonb,timestamptz), public.review_catalog_design_page(uuid,uuid,text,text,jsonb,integer,uuid,text) from public, anon;
grant execute on function public.save_catalog_design_project(uuid,uuid,jsonb,jsonb,timestamptz), public.review_catalog_design_page(uuid,uuid,text,text,jsonb,integer,uuid,text) to authenticated;
commit;
