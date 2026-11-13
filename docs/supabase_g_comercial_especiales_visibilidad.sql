-- =====================================================================
-- supabase_g_comercial_especiales_visibilidad.sql
-- Quién puede ver las solicitudes especiales (campañas tipo ESPECIAL).
--
-- Problema: la política campanas_select_roles deja leer TODAS las campañas
-- a ADMIN, BUYER, MARK y OPER. Por eso cada comprador veía en Solicitudes
-- los encabezados de las solicitudes de todos los compradores (las líneas sí
-- estaban filtradas por comprador), y Marketing las veía en Consolidado.
--
-- Regla nueva (solo lectura):
--   * ADMIN y OPER: ven todas las solicitudes especiales.
--   * BUYER: ve las que pidió él o un comprador de su alcance
--     (current_buyer_scope_ids, el mismo que usan las promociones). Si una
--     solicitud vieja no tiene solicitante_buyer_id, la ve quien tenga líneas en ella.
--   * MARK, AUD y DISENADOR: no ven solicitudes especiales (ni encabezado,
--     ni líneas, ni comentarios). Los catálogos no cambian.
-- Fidelización (FID-...) también es ESPECIAL y ya seguía esta misma regla;
-- no cambia.
--
-- Esquema: g_comercial.
-- Requiere: supabase_g_comercial_consolidado.sql (pasos 1–41).
-- Repetible: sí. Destructivo: no (solo agrega políticas restrictivas y una función; no borra datos).
-- No cambia crear, editar ni cambiar estado: solo agrega condiciones a la lectura.
-- Las vistas con security_invoker (v_seguimiento_resumen, v_catalogo_resumen,
-- v_comentarios_actividad_abiertos) heredan la regla.
-- Si se vuelve a ejecutar el consolidado, este script no se pierde (usa
-- políticas con nombre propio), pero conviene verificarlo con la consulta del final.
-- =====================================================================
begin;

-- Ids de todas las solicitudes especiales. security definer: se lee sin RLS
-- para poder usarla dentro de las políticas de promociones y comentarios.
create or replace function g_comercial.especial_campana_ids()
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(c.id), '{}'::uuid[])
  from g_comercial.campanas c
  where c.tipo_actividad = 'ESPECIAL';
$$;
revoke all on function g_comercial.especial_campana_ids() from public, anon;
grant execute on function g_comercial.especial_campana_ids() to authenticated;

-- 1) Encabezados de solicitudes especiales.
drop policy if exists campanas_especiales_scope on g_comercial.campanas;
create policy campanas_especiales_scope on g_comercial.campanas as restrictive for select
to authenticated
using (
  tipo_actividad <> 'ESPECIAL'
  or (select g_comercial.is_any_role(array['ADMIN', 'OPER']))
  or (
    (select g_comercial.is_role('BUYER'))
    and (
      solicitante_buyer_id = any((select g_comercial.current_buyer_scope_ids())::uuid[])
      or (
        solicitante_buyer_id is null
        and exists (
          select 1 from g_comercial.promociones p
          where p.campana_id = campanas.id
            and p.buyer_id = any((select g_comercial.current_buyer_scope_ids())::uuid[])
        )
      )
    )
  )
);

-- 2) Líneas de solicitudes especiales. BUYER ya está limitado a sus líneas por
--    promociones_select_roles; aquí se quitan a MARK, AUD y DISENADOR.
drop policy if exists promociones_especiales_scope on g_comercial.promociones;
create policy promociones_especiales_scope on g_comercial.promociones as restrictive for select
to authenticated
using (
  (select g_comercial.is_any_role(array['ADMIN', 'OPER', 'BUYER']))
  or campana_id <> all((select g_comercial.especial_campana_ids())::uuid[])
);

-- 3) Comentarios de solicitudes especiales (MARK los veía todos).
drop policy if exists comentarios_especiales_scope on g_comercial.comentarios;
create policy comentarios_especiales_scope on g_comercial.comentarios as restrictive for select
to authenticated
using (
  (select g_comercial.is_any_role(array['ADMIN', 'OPER', 'BUYER']))
  or campana_id is null
  or campana_id <> all((select g_comercial.especial_campana_ids())::uuid[])
);

commit;

-- Verificación (ejecutar aparte): deben aparecer las 3 políticas como RESTRICTIVE.
-- select tablename, policyname, permissive, cmd
--   from pg_policies
--  where schemaname = 'g_comercial'
--    and policyname in ('campanas_especiales_scope', 'promociones_especiales_scope', 'comentarios_especiales_scope');
--
-- Prueba con un comprador (en la app): Solicitudes debe listar solo sus solicitudes
-- y el filtro "Comprador" solo debe ofrecer su nombre (o los de su equipo si es senior).
