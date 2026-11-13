# Supabase Auth y RLS

Actualizado: 2026-10-12.

Esta guía deja la app operando sin usuario técnico. Todas las lecturas y escrituras usan el token del usuario logueado en Supabase Auth, y Supabase aplica permisos mediante RLS y `public.usuarios_app`.

## Variables de entorno

Configurar en `.env.local` para desarrollo y en las variables de entorno del hosting (por ejemplo Vercel) para producción. La lista completa y su descripción están en el [README principal](../README.md#variables-de-entorno).

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
VITE_SUPABASE_AUTH_REDIRECT_URL=http://localhost:3005/
```

- No se usan credenciales técnicas (`VITE_SUPABASE_TECH_EMAIL`, `VITE_SUPABASE_TECH_PASSWORD`) ni la clave `service_role`.
- `VITE_SUPABASE_AUTH_REDIRECT_URL` es opcional. Si falta, el enlace de recuperación vuelve a la URL actual del navegador. Si se define, debe coincidir con una de las `Redirect URLs` de Supabase.

## Orden de preparación

1. Ejecutar los scripts SQL de núcleo (pasos 1 y 2 de [docs/README.md](README.md#orden-recomendado-para-una-base-nueva)).
2. Crear los usuarios en Supabase Auth.
3. Ejecutar `docs/supabase_roles_permissions_mvp.sql` y continuar con el resto de scripts en el orden del índice.
4. Registrar cada usuario en `public.usuarios_app` con su rol.
5. Para usuarios `BUYER`, asociar `buyer_id` a una fila existente de `public.compradores` (la base lo exige).

## Supabase Auth

En el panel de Supabase, revisar `Authentication > URL Configuration`:

- `Site URL`: la URL de producción.
- `Redirect URLs`: agregar al menos
  - `http://localhost:3005/` (desarrollo; puerto definido en `vite.config.js`),
  - la URL de producción, por ejemplo `https://tu-proyecto.vercel.app/`.

Esto permite que el enlace de recuperación de contraseña vuelva a la pantalla correcta.

## Plantilla del correo de recuperacion

En `Authentication > Email Templates > Reset Password`, puedes reemplazar el contenido por esto:

**Asunto**

```text
Restablece tu acceso a Gestor de Promociones
```

**Cuerpo HTML**

```html
<div style="font-family: Arial, sans-serif; line-height: 1.5; color: #0f172a;">
  <h2 style="margin: 0 0 16px; color: #004B2D;">Gestor de Promociones</h2>
  <p style="margin: 0 0 16px;">
    Recibimos una solicitud para restablecer tu contraseña.
  </p>
  <p style="margin: 0 0 20px;">
    Haz clic en el siguiente enlace para crear una nueva contraseña y volver a ingresar:
  </p>
  <p style="margin: 0 0 20px;">
    <a href="{{ .ConfirmationURL }}" style="display: inline-block; background: #006B3F; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 8px;">
      Restablecer contraseña
    </a>
  </p>
  <p style="margin: 0 0 12px;">
    Si el boton no funciona, copia y pega este enlace en tu navegador:
  </p>
  <p style="word-break: break-all; margin: 0 0 16px;">
    {{ .ConfirmationURL }}
  </p>
  <p style="margin: 0;">
    Si no solicitaste este cambio, puedes ignorar este correo.
  </p>
</div>
```

**Versión texto plano**

```text
Gestor de Promociones

Recibimos una solicitud para restablecer tu contraseña.

Ingresa a este enlace para crear una nueva contraseña:
{{ .ConfirmationURL }}

Si no solicitaste este cambio, puedes ignorar este correo.
```

Si el correo debe apuntar siempre a producción, confirmar que la URL esté incluida en `Redirect URLs` y que `VITE_SUPABASE_AUTH_REDIRECT_URL` coincida con esa misma dirección.

## Roles vigentes

Valores válidos de `usuarios_app.rol` (restricción en la base): `ADMIN`, `BUYER`, `MARK`, `OPER`, `AUD`, `DISENADOR`.

| Rol | Uso |
| --- | --- |
| `ADMIN` | Acceso total y administración de catálogos base, compradores, maestro SKU y difusión. No crea solicitudes de Fidelización. |
| `BUYER` | Promociones, promociones especiales, avances, solicitudes, Consulta SKU, Fidelización de su alcance, Consolidado, Exportar y revisión en Diseño. |
| `MARK` | Diseño de catálogos (gestión, carga y revisión), Consolidado con comentarios, Exportar y Seguimiento. |
| `OPER` | Ejecutor (Pricing/Planimetría): Solicitudes, Fidelización, Exportar y Seguimiento. |
| `AUD` | Logs, Seguimiento y Diseño en lectura. |
| `DISENADOR` | Carga de páginas en Diseño y Seguimiento. |

La matriz detallada está en `src/constants/permissions.js` y en el [README principal](../README.md#roles-y-permisos).

## Tabla public.usuarios_app

Campos mínimos por usuario:

```sql
insert into public.usuarios_app (
  auth_user_id,
  nombre,
  email,
  rol,
  buyer_id,
  activo
)
values (
  'UUID_DE_AUTH_USERS',
  'Nombre Apellido',
  'correo@sinsa.com.ni',
  'BUYER',
  'UUID_DE_PUBLIC_COMPRADORES',
  true
);
```

`buyer_id` es obligatorio para `BUYER` y puede ir `null` para los demás roles.

## Verificación rápida

En el SQL Editor no hay usuario de Auth en sesión (`auth.uid()` es `null`), por lo que `current_user_role()` devuelve `null` allí. Para revisar el alta, consultar directamente:

```sql
select u.email, a.rol, a.activo, a.buyer_id
from auth.users u
left join public.usuarios_app a on a.auth_user_id = u.id
order by u.email;
```

Un usuario sin fila en `usuarios_app`, o con `activo = false`, inicia sesión en Auth pero la app no le asigna rol. Desde la app, el rol se obtiene con la RPC `current_user_role`.
