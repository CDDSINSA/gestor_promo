# Correos de acceso (Supabase Auth) por Microsoft 365

Actualizado: 2026-10-26.

Los correos de autenticación (recuperar contraseña, invitación, cambio de correo, enlace
mágico y códigos de verificación) salen del buzón de SINSA por Microsoft Graph, con las
mismas credenciales de Entra ID que usan las notificaciones (`enviar-correos`). Supabase deja
de enviarlos con su propio servidor.

```
Usuario: "Olvidé mi contraseña"
  └─ Supabase Auth genera el token
       └─ Send Email hook → Edge Function "correo-auth" (petición firmada)
            └─ arma el enlace https://<ref>.supabase.co/auth/v1/verify?token=...&type=recovery&redirect_to=...
                 └─ Microsoft Graph sendMail desde MS_SENDER
```

| Pieza | Archivo |
| --- | --- |
| Envío de correos de Auth | `supabase/functions/correo-auth/index.ts` |
| Pruebas locales (Deno) | `supabase/functions/correo-auth/index.test.ts` |

La app web no cambia. El enlace sigue pasando por `/auth/v1/verify` de Supabase, así que el
flujo PKCE de recuperación (`?code=` → pantalla "Nueva contraseña") funciona igual que antes.

## Antes de empezar

- **El hook reemplaza TODOS los correos de Auth del proyecto.** Si esta función falla, el usuario
  ve el error y Supabase no envía el correo por su cuenta. Activarlo solo después de la prueba
  del paso 3.
- **Proyecto compartido.** Si el proyecto de Supabase lo usan otras apps (p. ej.
  `mesa_serv_compras`), sus correos de acceso también pasarán por esta función. Avisar a su
  responsable y configurar `AUTH_APP_NAMES` para que cada correo lleve el nombre de su app.
  Revisar también `AUTH_EMAIL_ALLOWED_DOMAINS` si esa app tiene usuarios fuera de `sinsa.com.ni`.
- **Pedir a TI** (si las credenciales son nuevas):
  - Tenant ID, Client ID y *Secret Value* del registro de aplicación.
  - Permiso de Microsoft Graph **`Mail.Send` de tipo Aplicación**, con consentimiento de
    administrador.
  - El buzón remitente (recomendado: uno genérico como `notificaciones@sinsa.com.ni`). Si TI
    restringe la app con una *Application Access Policy*, ese buzón debe estar incluido.

## Instalación

### 1. Credenciales de Microsoft (compartidas con `enviar-correos`)

Los secretos de Edge Functions son del proyecto: las dos funciones leen los mismos valores.
En Edge Functions → Secrets (o `npx supabase secrets set NOMBRE=valor`):

| Secreto | Valor |
| --- | --- |
| `MS_TENANT_ID` | Tenant ID entregado por TI |
| `MS_CLIENT_ID` | Client ID (Application ID) |
| `MS_CLIENT_SECRET` | *Secret Value* (no el *Secret ID*) |
| `MS_SENDER` | Buzón remitente, p. ej. `notificaciones@sinsa.com.ni` |

Al pasar de Transforma-Hub a las credenciales de TI solo se cambian estos cuatro valores; las
notificaciones y los correos de acceso quedan con la misma cuenta. No hay que tocar código.

**Nunca** poner estos valores en `.env.local`, en variables `VITE_`, en el repositorio ni en el
frontend.

Opcionales de esta función:

| Secreto | Uso |
| --- | --- |
| `AUTH_APP_NAME` | Nombre en el encabezado y asunto del correo. Por defecto `SINSA`. |
| `AUTH_APP_NAMES` | Nombre por host de la app: `promo.sinsa.com.ni=Gestor Comercial,localhost:3005=Gestor Comercial (dev)`. Se toma del `redirect_to` del enlace. |
| `AUTH_EMAIL_ALLOWED_DOMAINS` | Dominios que pueden recibir correos. Por defecto `sinsa.com.ni`; `*` = todos. |
| `AUTH_LINK_TTL_TEXT` | Texto de vigencia del enlace. Por defecto `1 hora`; debe coincidir con Authentication → Email → *Email OTP Expiration* (3600 s por defecto). |

`CRON_TOKEN` (ya existe para `enviar-correos`) habilita el modo de prueba del paso 3.

### 2. Desplegar la función

Opción A, panel: Edge Functions → *Deploy a new function* → *Via Editor*. Nombre
`correo-auth`, pegar `supabase/functions/correo-auth/index.ts` y desplegar. En su configuración,
**desactivar "Verify JWT"** (la función valida la firma del hook).

Opción B, CLI:

```bash
npx supabase functions deploy correo-auth --no-verify-jwt --project-ref <ref-del-proyecto>
```

### 3. Probar el envío y el diseño (sin activar el hook)

```powershell
$base = "https://<ref>.supabase.co/functions/v1/correo-auth"
$h = @{ "x-cron-token" = "<CRON_TOKEN>" }
Invoke-RestMethod -Method Post -Headers $h -Uri "$base?prueba=su.correo@sinsa.com.ni&tipo=recovery&redirect_to=https://promo.sinsa.com.ni/"
Invoke-RestMethod -Method Post -Headers $h -Uri "$base?prueba=su.correo@sinsa.com.ni&tipo=invite"
```

Llega un correo con asunto `[Prueba] ...`. El botón de la prueba **no funciona** (usa un token
falso); solo sirve para revisar remitente, diseño y que Microsoft acepte el envío.

`tipo` acepta: `recovery`, `invite`, `signup`, `magiclink`, `email_change`, `reauthentication`.

### 4. Crear y activar el hook

1. Authentication → **Hooks** → *Add hook* → **Send Email hook**.
2. Tipo **HTTPS**. URL: `https://<ref>.supabase.co/functions/v1/correo-auth`.
3. *Generate secret* y copiar el valor completo (`v1,whsec_...`).
4. Edge Functions → Secrets: crear `SEND_EMAIL_HOOK_SECRET` con ese valor.
5. Volver al hook, activarlo (*Enable*) y guardar.

### 5. Probar de punta a punta

1. En la app: *¿Olvidó su contraseña?* con un usuario real.
2. Debe llegar el correo desde `MS_SENDER` con el botón **Crear nueva contraseña**.
3. Abrirlo en el mismo navegador: debe mostrar la pantalla "Nueva contraseña".
4. Revisar Edge Functions → `correo-auth` → **Logs**: `Correo de Auth enviado recovery ...`.

Requisito que no cambia: Authentication → URL Configuration → *Redirect URLs* debe incluir la URL
de producción y la de desarrollo; si no, el enlace cae en el *Site URL*.

## Volver atrás

Authentication → Hooks → desactivar el Send Email hook. Supabase vuelve a enviar con su servidor
(o el SMTP configurado) de inmediato. No hay datos que revertir.

## Problemas frecuentes

| Lo que ve el usuario o el log | Causa | Qué hacer |
| --- | --- | --- |
| "El servicio de correo no está configurado" | Falta algún secreto (el log dice cuál) | Cargar el secreto y reintentar |
| `Firma del hook inválida` / `Faltan encabezados` (401) | `SEND_EMAIL_HOOK_SECRET` distinto al del hook, o la función se llamó sin pasar por Auth | Copiar de nuevo el secreto del hook |
| "No se pudo enviar el correo (credenciales de Microsoft)" | Log `Token Microsoft 400/401` con `AADSTS7000215` (secreto mal copiado o vencido) o `AADSTS700016` (Client/Tenant ID) | Corregir `MS_*` |
| "(Microsoft 403)" | La app no tiene `Mail.Send` de aplicación o no puede enviar desde `MS_SENDER` | Pedir el permiso a TI o cambiar el buzón |
| "(Microsoft 404)" | El buzón de `MS_SENDER` no existe | Corregir `MS_SENDER` |
| "Demasiados correos en poco tiempo" | Límite de Microsoft (aprox. 30 correos/min por buzón) | Esperar unos minutos |
| "El dominio de ... no está permitido" | Destinatario fuera de `AUTH_EMAIL_ALLOWED_DOMAINS` | Ajustar el secreto si corresponde |
| El enlace abre el login y no "Nueva contraseña" | URL no está en *Redirect URLs*, enlace vencido o abierto en otro navegador | Ver [supabase_auth_rls_setup.md](supabase_auth_rls_setup.md) |

## Diferencias con `enviar-correos`

- Envía **al momento**, sin cola ni pg_cron: el usuario está esperando el correo y Supabase
  espera la respuesta del hook solo unos segundos.
- No usa `EMAIL_REDIRECT_TO` (modo prueba de notificaciones): un enlace de recuperación nunca
  debe llegar a otra persona.
- Duplica la conexión a Graph (unas 40 líneas) para que cada función se pueda pegar sola en el
  editor del panel. Si se pasa a desplegar con CLI, se puede mover a `supabase/functions/_shared/`.

## Pruebas realizadas

Deno 2.9 con Microsoft simulado (`deno test -A supabase/functions/correo-auth/index.test.ts`):
firma comparada con la librería oficial `standardwebhooks` (válida, alterada, vencida, sin
encabezados), enlace `verify` con `pkce_` y `redirect_to`, cambio de correo con los dos hash
cruzados, código visible solo en `reauthentication`, escape de HTML, respuesta `{}` al hook,
error con formato del hook ante Graph 403, dominio no permitido y modo prueba con `x-cron-token`.

No probado: el hook real en Supabase ni el envío real a Microsoft 365.
