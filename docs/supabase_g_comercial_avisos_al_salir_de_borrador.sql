-- =====================================================================
-- supabase_g_comercial_avisos_al_salir_de_borrador.sql
-- Al pasar un catálogo de Borrador a Preliminar (o a otro estado de trabajo)
-- se encienden sus "Notificaciones en vivo", y con ellas los correos.
--
-- Problema: solo la tarea diaria (run_catalog_daily_jobs) encendía el
-- interruptor al mover el catálogo de Borrador a Preliminar. Si alguien lo
-- cambiaba a mano en Ajustes, quedaba apagado y no salían avisos ni correos.
--
-- Cambio: trigger BEFORE UPDATE en g_comercial.campanas. Cuando un CATALOGO
-- pasa de Borrador a Preliminar, Precios Finales o Activo, deja
-- notificaciones_envivo = true. Cubre el cambio manual y el automático.
-- Al ser BEFORE, el aviso "Estado del catálogo actualizado" de ese mismo
-- cambio (trigger AFTER notify_catalog_change) ya sale.
--
-- Correos: no hay interruptor de correo por catálogo. El correo sale cuando
-- el aviso en vivo se genera y su tipo está activo en
-- notificaciones_correo_tipos (CATALOGO_ESTADO, DISENO_*, AVISO_CORTE... sí).
--
-- Qué NO cambia:
--   - Borrador -> Cerrado: no enciende nada.
--   - Si después se apagan a mano, no se vuelven a encender (el trigger solo
--     actúa en el cambio desde Borrador).
--   - Solicitudes especiales y Fidelización: no aplica (solo CATALOGO).
--   - Catálogos nuevos: siguen naciendo en Borrador con el interruptor apagado.
--
-- Esquema: g_comercial.
-- Requiere: supabase_g_comercial_consolidado.sql.
-- Repetible: sí. Destructivo: no (crea una función y un trigger; no toca datos).
-- Si se vuelve a ejecutar el consolidado, ejecutar de nuevo este script.
-- Reversa: ver al final.
-- =====================================================================
begin;

create or replace function g_comercial.catalog_enable_notifications_on_leave_draft()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.tipo_actividad = 'CATALOGO'
     and old.estado = 'Borrador'
     and new.estado in ('Preliminar', 'Precios Finales', 'Activo')
     and new.notificaciones_envivo is distinct from true then
    new.notificaciones_envivo := true;
  end if;
  return new;
end;
$$;

revoke all on function g_comercial.catalog_enable_notifications_on_leave_draft() from public, anon, authenticated;

drop trigger if exists catalog_enable_notifications_on_leave_draft on g_comercial.campanas;
create trigger catalog_enable_notifications_on_leave_draft
  before update of estado on g_comercial.campanas
  for each row
  when (old.estado = 'Borrador' and new.estado is distinct from old.estado)
  execute function g_comercial.catalog_enable_notifications_on_leave_draft();

commit;

-- Verificación (solo lectura):
--   select tgname, tgenabled from pg_trigger
--   where tgrelid = 'g_comercial.campanas'::regclass
--     and tgname = 'catalog_enable_notifications_on_leave_draft';
--
-- Reversa (vuelve al comportamiento anterior: solo la tarea diaria enciende):
--   drop trigger if exists catalog_enable_notifications_on_leave_draft on g_comercial.campanas;
--   drop function if exists g_comercial.catalog_enable_notifications_on_leave_draft();
