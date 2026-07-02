# Supabase Auth y RLS

Esta guia deja la app operando sin usuario tecnico. Todas las lecturas y escrituras usan el token del usuario logueado en Supabase Auth, y Supabase aplica permisos mediante RLS y `public.usuarios_app`.

## Variables de entorno

Configurar en `.env.local` para desarrollo y en Vercel como Environment Variables:

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
```

No se usan `VITE_SUPABASE_TECH_EMAIL` ni `VITE_SUPABASE_TECH_PASSWORD`.

## Orden de preparacion

1. Ejecutar el esquema base de Supabase.
2. Ejecutar el delta operativo si el proyecto aun no tiene tablas como `responsables_solicitudes`, `jerarquia_categorias` y `avances_catalogo`.
3. Ejecutar `docs/supabase_roles_permissions_mvp.sql`.
4. Crear usuarios en Supabase Auth.
5. Registrar cada usuario en `public.usuarios_app`.
6. Para usuarios `BUYER`, asociar `buyer_id` con una fila existente en `public.compradores`.

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
