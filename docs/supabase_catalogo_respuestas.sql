-- Ejecutar despues de supabase_catalogo_diseno.sql y antes del frontend.
begin;

create table if not exists public.catalogo_pagina_respuestas (
  id uuid primary key default gen_random_uuid(),
  comentario_id uuid not null references public.catalogo_pagina_comentarios(id) on delete cascade,
  numero smallint not null check (numero in (1, 2)),
  comentario text not null check (length(btrim(comentario)) > 0),
  usuario_id uuid default public.current_app_user_id() references public.usuarios_app(id) on delete set null,
  fecha_creacion timestamptz not null default now(),
  constraint catalogo_pagina_respuestas_slot_unique unique (comentario_id, numero)
);

alter table public.catalogo_pagina_respuestas enable row level security;
revoke all on public.catalogo_pagina_respuestas from anon, authenticated;
grant select on public.catalogo_pagina_respuestas to authenticated;
-- Autor y fecha se obtienen del servidor; las respuestas no se editan ni eliminan.
grant insert (comentario_id, numero, comentario) on public.catalogo_pagina_respuestas to authenticated;

drop policy if exists catalogo_respuestas_select on public.catalogo_pagina_respuestas;
create policy catalogo_respuestas_select on public.catalogo_pagina_respuestas
for select to authenticated using (
  exists (select 1 from public.catalogo_pagina_comentarios c where c.id = comentario_id)
);

drop policy if exists catalogo_respuestas_insert on public.catalogo_pagina_respuestas;
create policy catalogo_respuestas_insert on public.catalogo_pagina_respuestas
for insert to authenticated with check (
  usuario_id = public.current_app_user_id()
  and exists (
    select 1 from public.catalogo_pagina_comentarios c
    join public.catalogo_paginas_diseno p on p.id = c.pagina_id
    where c.id = comentario_id
      and (
        public.is_any_role(array['ADMIN', 'MARK'])
        or (public.is_role('DISENADOR') and p.disenador_id = public.current_app_user_id())
        or (public.is_role('BUYER') and p.comprador_id = public.current_buyer_id())
      )
  )
);

notify pgrst, 'reload schema';
commit;
