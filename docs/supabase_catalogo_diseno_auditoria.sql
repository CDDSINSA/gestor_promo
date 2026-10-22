-- Solo lectura. Ejecutar en SQL Editor para contrastar el despliegue real.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where (schemaname = 'public' and tablename in ('catalogo_pagina_versiones','catalogo_paginas_diseno'))
  or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;

select table_schema, table_name, grantee, privilege_type
from information_schema.table_privileges
where table_name in ('catalogo_pagina_versiones','catalogo_paginas_diseno')
  and grantee in ('PUBLIC','anon','authenticated');

select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_name in ('register_catalog_design_version','can_read_design_page','can_read_design_path','can_upload_design_path');

select id, name, public from storage.buckets where id in ('sns_app_promo','catalogo_final');
