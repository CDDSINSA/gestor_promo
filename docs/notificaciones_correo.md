# Notificaciones por correo (Microsoft 365)

Actualizado: 2026-10-13.

Los avisos en vivo (campana) de ciertos tipos también se envían por correo desde un buzón de
Microsoft 365, usando Microsoft Graph. La app web no cambia: todo ocurre en Supabase.

```
Aviso en vivo (notificaciones_envivo)
  └─ trigger → cola notificaciones_correo (solo tipos activos, usuarios activos con correo)
       └─ pg_cron cada 2 min → Edge Function "enviar-correos" → Microsoft Graph sendMail
```

| Pieza | Archivo |
| --- | --- |
| Cola, tipos activos, trigger, funciones y tarea programada | `docs/supabase_notificaciones_correo.sql` (paso 31) |
| Envío por Graph | `supabase/functions/enviar-correos/index.ts` |

## Credenciales

Se usa por ahora el registro de aplicación **Transforma-Hub** de Entra ID (client credentials).
Riesgos aceptados por el área usuaria mientras TI aprueba un registro propio:

- En los registros de Microsoft los envíos aparecen como hechos por Transforma-Hub.
- Si TI renueva o revoca ese secreto, los correos dejan de salir. La cola los conserva y los
  reintenta; ver *Monitoreo*.
- El secreto se compartió por chat: pedir a TI que lo renueve cuando sea posible y cargar el nuevo
  valor en Supabase.

Cuando TI entregue un registro propio, solo hay que cambiar `MS_CLIENT_ID` y `MS_CLIENT_SECRET`
(y `MS_TENANT_ID` si cambiara). No hay que tocar código.

**Nunca** poner estos valores en `.env.local`, en variables `VITE_`, en el repositorio ni en el
frontend. Solo como secretos de la Edge Function.

## Instalación

### 1. Base de datos

1. Database → Extensions: habilitar **pg_cron** y **pg_net**.
2. Ejecutar `docs/supabase_notificaciones_correo.sql` en el SQL Editor. La primera vez avisará que
   faltan los secretos de Vault: es normal.

### 2. Edge Function

Opción A, panel de Supabase: Edge Functions → *Deploy a new function* → *Via Editor*. Nombre
`enviar-correos`, pegar el contenido de `supabase/functions/enviar-correos/index.ts` y desplegar.
En la configuración de la función, **desactivar "Verify JWT"** (la función valida su propio token).

Opción B, CLI:

```bash
npx supabase functions deploy enviar-correos --no-verify-jwt --project-ref <ref-del-proyecto>
```

### 3. Secretos de la función

Edge Functions → Secrets (o `npx supabase secrets set NOMBRE=valor`):

| Secreto | Valor |
| --- | --- |
| `MS_TENANT_ID` | Tenant ID entregado por TI |
| `MS_CLIENT_ID` | Client ID (Application ID) |
| `MS_CLIENT_SECRET` | *Secret Value* (no el *Secret ID*) |
| `MS_SENDER` | `dev.transformacion@sinsa.com.ni` (buzón del que envía Transforma-Hub) |
| `CRON_TOKEN` | Texto aleatorio largo. En PowerShell: `[guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')` |
| `APP_URL` | URL de la app (botón del correo). Opcional |
| `EMAIL_REDIRECT_TO` | **Modo prueba**: todos los correos llegan a esta dirección. Quitarlo para producción |
| `EMAIL_ALLOWED_DOMAINS` | Dominios permitidos, por defecto `sinsa.com.ni` |

### 4. Probar las credenciales

```powershell
$url = "https://<ref>.supabase.co/functions/v1/enviar-correos?prueba=su.correo@sinsa.com.ni"
Invoke-RestMethod -Method Post -Uri $url -Headers @{ "x-cron-token" = "<CRON_TOKEN>" }
```

| Respuesta | Significado |
| --- | --- |
| `ok: true` y llega el correo | Todo listo |
| `No se obtuvo token ... AADSTS7000215` | Secreto incorrecto: usar el *Secret Value*, no el *Secret ID* |
| `AADSTS700016` | Client ID o Tenant ID incorrectos |
| `Graph 403 ... ErrorAccessDenied` | La app no tiene `Mail.Send` de aplicación, o no puede enviar desde ese buzón. Probar otro `MS_SENDER` o pedir el permiso a TI |
| `Graph 404` | El buzón de `MS_SENDER` no existe |

### 5. Activar el envío automático

1. Vault (Integrations → Vault o Project Settings → Vault): crear
   - `correo_funcion_url` = `https://<ref>.supabase.co/functions/v1/enviar-correos`
   - `correo_funcion_token` = el mismo valor de `CRON_TOKEN`
2. Volver a ejecutar `docs/supabase_notificaciones_correo.sql`. Debe terminar sin el aviso de Vault.
3. Dejar `EMAIL_REDIRECT_TO` unos días con su propio correo para revisar contenido y volumen.
   Después quitarlo.

## Qué se envía

Tabla `notificaciones_correo_tipos`. Activos por defecto: `DISENO_REVIEW`, `DISENO_STATE`,
`DISENO_IMAGE`, `DISENO_ASIGNACION`, `DISENO_RESPUESTA`, `AVISO_CORTE`, `CATALOGO_ESTADO`,
`ADMIN_DIFUSION`. Desactivados: observaciones nuevas/resueltas/reabiertas, vigencia, comentarios
de Consolidado y promociones (generan mucho volumen).

```sql
update public.notificaciones_correo_tipos set activo = true where tipo_evento = 'DISENO_COMMENT';
```

Solicitudes especiales y Fidelización (`SOLICITUD_*`, `FIDELIZACION_*`, paso 32) quedan activas para
correo y sus destinatarios se configuran en **Ajustes > Notificaciones**, donde también se puede
apagar el correo por evento.

Los destinatarios son los mismos del aviso en vivo (ver `notificaciones_envivo_flujo.md`). Solo se
envía a usuarios activos con correo y de dominios permitidos. Los avisos dirigidos solo a un rol (sin
usuario) no generan correo.

## Monitoreo

```sql
select estado, count(*) from public.notificaciones_correo group by estado;
select created_at, destinatario_email, tipo_evento, intentos, ultimo_error
from public.notificaciones_correo where estado = 'error' order by created_at desc limit 20;
-- Reintentar tras corregir credenciales:
update public.notificaciones_correo set estado = 'pendiente', intentos = 0, disponible_desde = now()
where estado = 'error';
-- Pausar / reanudar: select cron.unschedule('notificaciones-correo-envio');  y volver a ejecutar el script.
```

- Errores temporales (límite de Microsoft, caídas) y de credenciales se reintentan hasta 5 veces
  (esperas de 2, 4, 8 y 16 min). Después quedan en `error`.
- Si fallan las credenciales o permisos, la función detiene el lote para no gastar intentos en
  todos los correos.
- Los correos enviados se borran a los 90 días.
- Un fallo al encolar nunca revierte el aviso en vivo ni la operación de negocio.

## Pruebas realizadas

- SQL en PostgreSQL 16 local: script repetible, trigger con tipos activos/inactivos, usuarios
  inactivos y avisos por rol, fallo del encolado sin revertir el aviso, permisos (solo ADMIN lee la
  cola; `authenticated` no puede tomar lotes), reintentos y paso a `error`.
- Edge Function con Deno 2 y Microsoft/Supabase simulados: token inválido, 403, filtro de dominio,
  modo prueba, escape de HTML y caché del token.
- No probado: pg_cron/pg_net/Vault ni el envío real a Microsoft 365.
