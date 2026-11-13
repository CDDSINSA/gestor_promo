-- =====================================================================
-- supabase_g_comercial_correo_programar_envio.sql
-- Guarda en Vault la URL y el token de la Edge Function "enviar-correos" y
-- programa el envío automático cada 2 minutos (pg_cron + pg_net).
--
-- Úselo cuando los correos se quedan en la cola y solo salen al llamar la
-- función a mano. Reemplaza el paso "Vault" manual de notificaciones_correo.md.
--
-- Antes de ejecutar:
--   1. Database > Extensions: pg_cron y pg_net activas.
--   2. Escriba abajo, en v_token, el MISMO valor del secreto CRON_TOKEN de la
--      Edge Function (Edge Functions > Secrets). Si cambia CRON_TOKEN, vuelva a
--      ejecutar este script con el valor nuevo.
--   3. Ejecute todo. Si algo falta, se detiene con un mensaje en rojo.
--      Si todo está bien, el resultado muestra las dos tareas programadas.
--
-- Requiere: supabase_g_comercial_notificaciones_correo.sql (cola y funciones).
-- Repetible: sí. Destructivo: no (crea o actualiza los secretos y las tareas).
-- No guarde este archivo con el token escrito en el repositorio.
-- =====================================================================
do $$
declare
  v_url   text := 'https://hanvbbezofcengyorooc.supabase.co/functions/v1/enviar-correos';
  v_token text := 'PEGUE_AQUI_EL_CRON_TOKEN';
  v_id uuid;
begin
  v_token := btrim(v_token);
  if v_token = 'PEGUE_AQUI_EL_CRON_TOKEN' or length(v_token) < 20 then
    raise exception 'Escriba en v_token el valor del secreto CRON_TOKEN de la Edge Function.';
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'Active la extensión pg_cron (Database > Extensions) y vuelva a ejecutar.';
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'Active la extensión pg_net (Database > Extensions) y vuelva a ejecutar.';
  end if;
  if to_regclass('g_comercial.notificaciones_correo') is null then
    raise exception 'Falta g_comercial.notificaciones_correo: ejecute primero supabase_g_comercial_notificaciones_correo.sql.';
  end if;

  -- Vault: crear o actualizar los dos secretos.
  select id into v_id from vault.secrets where name = 'correo_funcion_url';
  if v_id is null then
    perform vault.create_secret(v_url, 'correo_funcion_url', 'URL de la Edge Function enviar-correos');
  else
    perform vault.update_secret(v_id, v_url);
  end if;

  v_id := null;
  select id into v_id from vault.secrets where name = 'correo_funcion_token';
  if v_id is null then
    perform vault.create_secret(v_token, 'correo_funcion_token', 'Igual al secreto CRON_TOKEN de enviar-correos');
  else
    perform vault.update_secret(v_id, v_token);
  end if;

  -- Tareas programadas (mismas que supabase_g_comercial_notificaciones_correo.sql).
  perform cron.unschedule(jobid) from cron.job
  where jobname in ('notificaciones-correo-envio', 'notificaciones-correo-limpieza');

  perform cron.schedule(
    'notificaciones-correo-envio',
    '*/2 * * * *',
    $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'correo_funcion_url'),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'correo_funcion_token')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 55000
      )
      where exists (
        select 1 from g_comercial.notificaciones_correo
        where estado in ('pendiente', 'enviando') and disponible_desde <= now()
      );
    $job$
  );

  perform cron.schedule('notificaciones-correo-limpieza', '40 8 * * *', 'select g_comercial.cleanup_email_notifications()');
end
$$;

-- Resultado: deben aparecer las dos tareas activas.
select jobname, schedule, active from cron.job where jobname like 'notificaciones-correo%' order by jobname;
