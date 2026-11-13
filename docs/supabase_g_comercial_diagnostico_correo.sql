-- =====================================================================
-- supabase_g_comercial_diagnostico_correo.sql
-- Diagnóstico de notificaciones por correo (solo lectura).
--
-- Revisa cada eslabón: aviso en vivo -> cola de correo -> pg_cron -> pg_net
-- -> Edge Function enviar-correos -> Microsoft Graph, y devuelve UNA tabla
-- (paso, estado, detalle) para copiar y compartir.
--
-- Uso: pegar completo en SQL Editor y ejecutar. No modifica datos: crea una
-- función temporal (pg_temp) que desaparece al cerrar la sesión.
-- No muestra secretos: de Vault solo indica si existen y la URL.
-- =====================================================================
create or replace function pg_temp.diag_correo()
returns table (paso text, estado text, detalle text)
language plpgsql
as $$
declare
  v_txt text;
  v_n bigint;
  v_rec record;
begin
  -- 1. Tipos de evento activos para correo.
  if to_regclass('g_comercial.notificaciones_correo_tipos') is null then
    return query select '1 Tipos de correo', 'FALLA', 'No existe g_comercial.notificaciones_correo_tipos: falta supabase_g_comercial_notificaciones_correo.sql';
  else
    for v_rec in select t.tipo_evento, t.activo from g_comercial.notificaciones_correo_tipos t
                 where t.tipo_evento like 'SOLICITUD_%' or t.tipo_evento like 'FIDELIZACION_%' order by 1 loop
      return query select '1 Tipo ' || v_rec.tipo_evento, case when v_rec.activo then 'OK' else 'APAGADO' end, 'activo = ' || v_rec.activo;
    end loop;
    if not found then
      return query select '1 Tipos de correo', 'FALLA', 'No hay filas SOLICITUD_*/FIDELIZACION_* en notificaciones_correo_tipos';
    end if;
  end if;

  -- 2. Trigger que pasa los avisos a la cola.
  select string_agg(tgname || case when tgenabled = 'D' then ' (DESACTIVADO)' else '' end, ', ') into v_txt
  from pg_trigger where tgrelid = to_regclass('g_comercial.notificaciones_envivo') and not tgisinternal;
  return query select '2 Triggers de notificaciones_envivo',
    case when coalesce(v_txt, '') like '%enqueue_email_notification%' and v_txt not like '%DESACTIVADO%' then 'OK' else 'FALLA' end,
    coalesce(v_txt, 'ninguno');

  -- 3. Avisos de solicitudes generados en los últimos 3 días (sin avisos no hay correo).
  for v_rec in
    select n.created_at, n.tipo_evento, coalesce(u.nombre, '?') as dest, coalesce(u.email, '') as email,
           n.actor_nombre, c.estado as correo_estado, c.ultimo_error
    from g_comercial.notificaciones_envivo n
    left join g_comercial.usuarios_app u on u.id = n.destinatario_usuario_id
    left join g_comercial.notificaciones_correo c on c.notificacion_id = n.id
    where (n.tipo_evento like 'SOLICITUD_%' or n.tipo_evento like 'FIDELIZACION_%')
      and n.created_at > now() - interval '3 days'
    order by n.created_at desc limit 15
  loop
    return query select '3 Aviso ' || to_char(v_rec.created_at at time zone 'America/Managua', 'DD/MM HH24:MI'),
      case when v_rec.correo_estado is null then 'SIN COLA' else upper(v_rec.correo_estado) end,
      format('%s -> %s <%s> (autor %s)%s', v_rec.tipo_evento, v_rec.dest, v_rec.email, v_rec.actor_nombre,
        case when coalesce(v_rec.ultimo_error, '') <> '' then ' | error: ' || left(v_rec.ultimo_error, 300) else '' end);
  end loop;
  if not found then
    return query select '3 Avisos de solicitudes (3 días)', 'NINGUNO',
      'No se generó ningún aviso. El autor del cambio nunca se notifica a sí mismo: pruebe moviendo la solicitud con un usuario distinto al destinatario.';
  end if;

  -- 4. Estado general de la cola.
  for v_rec in select c.estado, count(*) as n, max(c.created_at) as ultimo from g_comercial.notificaciones_correo c group by c.estado loop
    return query select '4 Cola ' || v_rec.estado, case when v_rec.estado in ('enviado') then 'OK' when v_rec.estado = 'error' then 'FALLA' else 'INFO' end,
      format('%s correos; último %s', v_rec.n, to_char(v_rec.ultimo at time zone 'America/Managua', 'DD/MM HH24:MI'));
  end loop;
  if not found then
    return query select '4 Cola', 'VACÍA', 'Nunca se encoló un correo.';
  end if;
  for v_rec in select c.ultimo_error, count(*) n from g_comercial.notificaciones_correo c
               where c.ultimo_error <> '' group by 1 order by 2 desc limit 3 loop
    return query select '4 Error frecuente', 'FALLA', format('(%s) %s', v_rec.n, left(v_rec.ultimo_error, 500));
  end loop;

  -- 5. Usuarios activos sin correo válido (no pueden recibir).
  select count(*), string_agg(u.nombre, ', ') into v_n, v_txt from g_comercial.usuarios_app u
  where u.activo and position('@' in coalesce(u.email, '')) <= 1;
  return query select '5 Usuarios activos sin correo', case when v_n = 0 then 'OK' else 'AVISO' end, coalesce(v_txt, '—');

  -- 6. Permisos de service_role (la Edge Function llama las RPC con esa clave).
  return query select '6 service_role USAGE en g_comercial',
    case when has_schema_privilege('service_role', 'g_comercial', 'USAGE') then 'OK' else 'FALLA' end,
    'Sin USAGE la función recibe "permission denied for schema g_comercial".';
  if to_regprocedure('g_comercial.claim_email_batch(integer)') is null then
    return query select '6 RPC claim_email_batch', 'FALLA', 'No existe la función.';
  else
    return query select '6 service_role EXECUTE claim_email_batch',
      case when has_function_privilege('service_role', 'g_comercial.claim_email_batch(integer)', 'EXECUTE') then 'OK' else 'FALLA' end, '';
    return query select '6 service_role EXECUTE mark_email_result',
      case when has_function_privilege('service_role', 'g_comercial.mark_email_result(uuid, boolean, text, boolean)', 'EXECUTE') then 'OK' else 'FALLA' end, '';
  end if;

  -- 7. Extensiones.
  return query select '7 Extensión ' || e, case when exists (select 1 from pg_extension where extname = e) then 'OK' else 'FALLA' end, ''
  from unnest(array['pg_cron', 'pg_net']) as e;

  -- 8. Vault (solo existencia y URL; nunca el token).
  if to_regclass('vault.decrypted_secrets') is null then
    return query select '8 Vault', 'FALLA', 'No hay acceso a vault.decrypted_secrets.';
  else
    execute $q$select max(case when name = 'correo_funcion_url' then decrypted_secret end),
                      count(*) filter (where name = 'correo_funcion_token' and length(decrypted_secret) > 0)
               from vault.decrypted_secrets where name in ('correo_funcion_url', 'correo_funcion_token')$q$
      into v_txt, v_n;
    return query select '8 Vault correo_funcion_url',
      case when v_txt like 'https://%.supabase.co/functions/v1/enviar-correos' then 'OK' when v_txt is null then 'FALLA' else 'REVISAR' end,
      coalesce(v_txt, 'no existe');
    return query select '8 Vault correo_funcion_token', case when v_n > 0 then 'OK' else 'FALLA' end,
      'Debe ser idéntico al secreto CRON_TOKEN de la Edge Function (no se muestra).';
  end if;

  -- 9. Tareas de pg_cron y sus últimas ejecuciones.
  if to_regclass('cron.job') is null then
    return query select '9 pg_cron', 'FALLA', 'No existe cron.job.';
  else
    for v_rec in execute $q$select jobid, jobname, schedule, active, command from cron.job
                           where command ilike '%correo%' or jobname ilike '%correo%' order by jobid$q$ loop
      return query select '9 Tarea ' || v_rec.jobname, case when v_rec.active then 'OK' else 'INACTIVA' end,
        format('id %s, %s, esquema en comando: %s', v_rec.jobid, v_rec.schedule,
          case when v_rec.command ilike '%g_comercial.notificaciones_correo%' then 'g_comercial'
               when v_rec.command ilike '%public.notificaciones_correo%' then 'public (VIEJO)' else '?' end);
    end loop;
    if not found then
      return query select '9 Tareas de correo', 'FALLA', 'No hay tareas programadas: volver a ejecutar supabase_g_comercial_notificaciones_correo.sql con Vault listo.';
    end if;
    if to_regclass('cron.job_run_details') is not null then
      for v_rec in execute $q$select d.start_time, d.status, d.return_message, j.jobname
                             from cron.job_run_details d join cron.job j on j.jobid = d.jobid
                             where j.jobname ilike '%correo%' order by d.start_time desc limit 3$q$ loop
        return query select '9 Ejecución ' || to_char(v_rec.start_time at time zone 'America/Managua', 'DD/MM HH24:MI'),
          case when v_rec.status = 'succeeded' then 'OK' else upper(v_rec.status) end,
          v_rec.jobname || ': ' || left(coalesce(v_rec.return_message, ''), 300);
      end loop;
    end if;
  end if;

  -- 10. Respuestas de la Edge Function (pg_net guarda ~6 horas).
  if to_regclass('net._http_response') is null then
    return query select '10 Respuestas pg_net', 'SIN DATOS', 'No existe net._http_response.';
  else
    for v_rec in execute $q$select created, status_code, error_msg, left(content, 400) as content
                           from net._http_response order by created desc limit 5$q$ loop
      return query select '10 Respuesta ' || to_char(v_rec.created at time zone 'America/Managua', 'DD/MM HH24:MI'),
        case when v_rec.status_code = 200 and coalesce(v_rec.content, '') like '%"ok":true%' then 'OK' else 'FALLA' end,
        format('HTTP %s %s %s', coalesce(v_rec.status_code::text, '—'), coalesce(v_rec.error_msg, ''), coalesce(v_rec.content, ''));
    end loop;
    if not found then
      return query select '10 Respuestas pg_net', 'NINGUNA',
        'pg_cron no ha llamado a la función en las últimas horas (solo llama si hay correos pendientes).';
    end if;
  end if;
end;
$$;

select * from pg_temp.diag_correo();
