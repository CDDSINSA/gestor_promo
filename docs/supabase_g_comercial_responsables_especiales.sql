-- =====================================================================
-- supabase_g_comercial_responsables_especiales.sql
-- Lista de responsables para Solicitudes especiales.
--
-- Problema: el campo "Responsable" mostraba los equipos de la tabla
-- responsables_solicitudes (Mercadeo, Planimetría, Pricing). El responsable
-- debe ser una persona con rol Ejecutor (OPER) o Administrador (ADMIN).
--
-- La política usuarios_select_self_admin_mark solo deja a ADMIN y MARK leer
-- otros usuarios, así que el Ejecutor no podría ver a sus compañeros. En vez de
-- abrir usuarios_app (correo, auth_user_id, buyer_id), esta función devuelve
-- solo id, nombre y rol de los usuarios activos ADMIN y OPER.
-- Solo responde a usuarios con sesión y rol (current_user_role() no nulo).
--
-- Esquema: g_comercial.
-- Requiere: supabase_g_comercial_consolidado.sql (pasos 1–41).
-- Repetible: sí (create or replace). Destructivo: no.
-- No cambia políticas ni datos. La tabla responsables_solicitudes queda igual;
-- la app ya no la usa para este campo. Las solicitudes que ya tienen un equipo
-- asignado lo siguen mostrando como "no esta en catalogo" hasta reasignarlas.
-- =====================================================================
begin;

create or replace function g_comercial.solicitudes_responsables_directory()
returns table (id uuid, nombre text, rol text)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.nombre, u.rol
  from g_comercial.usuarios_app u
  where g_comercial.current_user_role() is not null
    and u.activo
    and u.rol in ('ADMIN', 'OPER')
    and length(trim(coalesce(u.nombre, ''))) > 0
  order by u.nombre;
$$;

revoke all on function g_comercial.solicitudes_responsables_directory() from public, anon;
grant execute on function g_comercial.solicitudes_responsables_directory() to authenticated;

commit;

-- Verificación (con cualquier usuario con sesión; debe devolver solo ADMIN y OPER activos, sin correos):
-- select * from g_comercial.solicitudes_responsables_directory();
