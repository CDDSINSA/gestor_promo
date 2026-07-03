# Supabase Auth y RLS

Esta guia deja la app operando sin usuario tecnico. Todas las lecturas y escrituras usan el token del usuario logueado en Supabase Auth, y Supabase aplica permisos mediante RLS y `public.usuarios_app`.

## Variables de entorno

Configurar en `.env.local` para desarrollo y en Vercel como Environment Variables:

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
VITE_SUPABASE_AUTH_REDIRECT_URL=http://localhost:5173/
```

No se usan `VITE_SUPABASE_TECH_EMAIL` ni `VITE_SUPABASE_TECH_PASSWORD`.
`VITE_SUPABASE_AUTH_REDIRECT_URL` es opcional, pero ayuda a que el enlace de recuperacion vuelva a esta app en local y en Vercel.

## Orden de preparacion

1. Ejecutar el esquema base de Supabase.
2. Ejecutar el delta operativo si el proyecto aun no tiene tablas como `responsables_solicitudes`, `jerarquia_categorias` y `avances_catalogo`.
3. Ejecutar `docs/supabase_roles_permissions_mvp.sql`.
4. Crear usuarios en Supabase Auth.
5. Registrar cada usuario en `public.usuarios_app`.
6. Para usuarios `BUYER`, asociar `buyer_id` con una fila existente en `public.compradores`.

## Supabase Auth

En el panel de Supabase, revisar:

1. `Authentication > URL Configuration`
2. `Site URL`
3. `Redirect URLs`

Agregar al menos:

- `http://localhost:5173/`
- La URL real de Vercel, por ejemplo `https://tu-proyecto.vercel.app/`

Eso permite que el enlace de recuperacion de contraseña vuelva a la pantalla correcta.

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

Si quieres que el correo apunte siempre a Vercel, confirma que la URL esté incluida en `Redirect URLs` y que `VITE_SUPABASE_AUTH_REDIRECT_URL` coincida con esa misma direccion.

## Roles vigentes

`ADMIN`: acceso total y administracion de catalogos base.

`BUYER`: crea/edita promociones, promociones especiales, avances, solicitudes, consulta SKU, Export y Consolidado.

`MARK`: usa Consolidado con comentarios y estados de comentario, y usa Export.

`OPER`: usa Export y Solicitudes.

`AUD`: usa Logs.

## Tabla public.usuarios_app

Campos minimos por usuario:

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
  'correo@sinsa.com',
  'BUYER',
  'UUID_DE_PUBLIC_COMPRADORES',
  true
);
```

Para `ADMIN`, `MARK`, `OPER` y `AUD`, `buyer_id` puede ir `null`.

## Verificacion rapida

Ejecutar en Supabase SQL Editor con un usuario autenticado desde la app:

```sql
select public.current_user_role();
select public.current_buyer_id();
```

Si `current_user_role()` devuelve `null`, el usuario existe en Auth pero falta o esta inactivo en `public.usuarios_app`.
