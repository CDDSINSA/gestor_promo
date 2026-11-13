-- Ejecutar después del esquema de Diseño y antes de publicar el frontend actualizado.
-- Conserva los tipos históricos y agrega las categorías existentes en la interfaz.
begin;

alter table public.catalogo_pagina_comentarios
  drop constraint if exists catalogo_pagina_comentarios_tipo_check;

alter table public.catalogo_pagina_comentarios
  add constraint catalogo_pagina_comentarios_tipo_check
  check (tipo in ('comentario', 'observacion', 'aprobacion', 'rechazo', 'ajuste', 'precio', 'imagen', 'general'));

commit;
