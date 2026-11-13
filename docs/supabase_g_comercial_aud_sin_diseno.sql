-- =====================================================================
-- supabase_g_comercial_aud_sin_diseno.sql
-- Quita al rol AUD (Auditor) el acceso de lectura al módulo Diseño de Catálogos.
--
-- Esquema: g_comercial.
-- Requiere: supabase_g_comercial_consolidado.sql (pasos 1–41), en especial el
--           módulo de Diseño y supabase_catalogo_diseno_versiones_seguras.
-- Repetible: sí. Destructivo: no (solo reemplaza políticas y una función; no borra datos).
-- Si se vuelve a ejecutar supabase_g_comercial_consolidado.sql o parte1,
-- ejecutar de nuevo este script: reinstalarían el acceso de AUD.
--
-- Alcance:
--   * catalogo_proyecto_diseno: AUD ya no lista proyectos.
--   * catalogo_paginas_diseno: AUD ya no ve páginas.
--   * can_read_design_page: sin AUD; con eso tampoco ve versiones ni
--     archivos del bucket sns_app_promo.
--   * comentarios y respuestas de Diseño dependen de las páginas visibles,
--     por lo que quedan ocultos para AUD sin cambiar su política.
--   * catalogo_consolidado_final y bucket catalogo_final: sin AUD.
-- AUD conserva Seguimiento y Logs.
-- =====================================================================
begin;

drop policy if exists catalogo_proyecto_diseno_select_roles on g_comercial.catalogo_proyecto_diseno;
create policy catalogo_proyecto_diseno_select_roles on g_comercial.catalogo_proyecto_diseno for select
to authenticated
using (
  g_comercial.current_user_role() is not null
  and g_comercial.current_user_role() <> 'AUD'
);

drop policy if exists catalogo_paginas_diseno_select_scoped on g_comercial.catalogo_paginas_diseno;
create policy catalogo_paginas_diseno_select_scoped on g_comercial.catalogo_paginas_diseno for select
to authenticated
using (
  g_comercial.is_any_role(array['ADMIN', 'MARK'])
  or (g_comercial.is_role('DISENADOR') and disenador_id = g_comercial.current_app_user_id())
  or (g_comercial.is_role('BUYER') and comprador_id = g_comercial.current_buyer_id())
);

create or replace function g_comercial.can_read_design_page(p_page_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from g_comercial.catalogo_paginas_diseno p where p.id = p_page_id
    and (g_comercial.is_any_role(array['ADMIN','MARK'])
      or (g_comercial.is_role('DISENADOR') and p.disenador_id = g_comercial.current_app_user_id())
      or (g_comercial.is_role('BUYER') and p.comprador_id = g_comercial.current_buyer_id())));
$$;
revoke all on function g_comercial.can_read_design_page(uuid) from public, anon;
grant execute on function g_comercial.can_read_design_page(uuid) to authenticated;

drop policy if exists catalogo_consolidado_final_select_roles on g_comercial.catalogo_consolidado_final;
create policy catalogo_consolidado_final_select_roles on g_comercial.catalogo_consolidado_final for select
to authenticated
using (
  g_comercial.current_user_role() is not null
  and g_comercial.current_user_role() <> 'AUD'
);

drop policy if exists catalog_design_final_storage_read on storage.objects;
create policy catalog_design_final_storage_read on storage.objects for select
to authenticated
using (
  bucket_id = 'catalogo_final'
  and g_comercial.current_user_role() is not null
  and g_comercial.current_user_role() <> 'AUD'
);

commit;

-- Verificación (ejecutar aparte): no debe aparecer 'AUD'.
-- select policyname, qual from pg_policies
--  where (schemaname = 'g_comercial' and tablename in ('catalogo_proyecto_diseno','catalogo_paginas_diseno','catalogo_consolidado_final'))
--     or (schemaname = 'storage' and policyname = 'catalog_design_final_storage_read');
-- select pg_get_functiondef('g_comercial.can_read_design_page(uuid)'::regprocedure);
