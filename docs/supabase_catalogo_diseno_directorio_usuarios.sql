-- Paso 30. Directorio mínimo de usuarios para Diseño de catálogos.
-- Depende de: supabase_roles_permissions_mvp.sql (current_user_role), supabase_catalogo_diseno.sql
--             y supabase_catalogo_respuestas.sql.
-- Repetible: sí (create or replace). Destructivo: no. No cambia políticas existentes.
--
-- Motivo: la política usuarios_select_self_admin_mark (paso 15) solo permite a ADMIN y MARK leer
-- otros registros de usuarios_app. Por eso el comprador y el diseñador veían "Sin asignar" en el
-- diseñador de sus páginas y en los autores de comentarios hechos por otras personas.
--
-- En lugar de abrir usuarios_app completa (correo, auth_user_id, buyer_id), esta función devuelve
-- solo id, nombre, rol y activo, y únicamente de:
--   * usuarios que pueden trabajar o revisar diseño (DISENADOR, ADMIN, MARK);
--   * autores de comentarios o respuestas de Diseño.
-- Solo responde a usuarios activos con sesión (current_user_role() no nulo).
begin;

create or replace function public.catalog_design_user_directory()
returns table (id uuid, nombre text, rol text, activo boolean)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.nombre, u.rol, u.activo
  from public.usuarios_app u
  where public.current_user_role() is not null
    and (
      u.rol in ('DISENADOR', 'ADMIN', 'MARK')
      or exists (select 1 from public.catalogo_pagina_comentarios c where c.usuario_id = u.id)
      or exists (select 1 from public.catalogo_pagina_respuestas r where r.usuario_id = u.id)
    )
  order by u.nombre;
$$;

revoke all on function public.catalog_design_user_directory() from public, anon;
grant execute on function public.catalog_design_user_directory() to authenticated;

commit;

-- Verificación (con la sesión de un comprador debe devolver diseñadores y autores, sin correos):
-- select * from public.catalog_design_user_directory();
