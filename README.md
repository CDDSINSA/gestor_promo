# SINSA Promo MVP

Aplicacion React/Vite para gestion de promociones retail. El MVP conserva Excel como respaldo/exportacion y usa Supabase como persistencia principal operativa. La arquitectura mantiene la estructura Excel original para facilitar una migracion futura a base de datos corporativa o API interna.

## Instalacion

```bash
npm install
npm run dev
```

## Estructura

```text
src/App.jsx
src/styles.css
src/services/excelService.js
src/services/supabaseService.js
AGENTS.md
ROADMAP.md
docs/
```

## Flujo recomendado

1. Ejecutar el proyecto.
2. Iniciar sesion con un usuario de Supabase Auth.
3. La app carga automaticamente el catalogo desde Supabase.
4. Crear/editar promociones.
5. Agregar comentarios de Mercadeo.
6. Guardar en Supabase.
7. Usar Exportaciones o Excel como respaldo operativo.

## Supabase

La conexion se configura por variables de entorno copiando `.env.example` a `.env.local` en local, o desde Environment Variables en Vercel.

Variables principales:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Notas operativas:

- El login de entrada usa Supabase Auth.
- Los permisos se leen desde `public.usuarios_app.rol`.
- La sincronizacion de datos usa el token del usuario logueado y queda protegida por RLS.
- Roles vigentes: `ADMIN`, `BUYER`, `MARK`, `OPER`, `AUD`.
- No se expone service role key en el frontend.

Para preparar Supabase, ejecutar los scripts de esquema y luego:

```text
docs/supabase_roles_permissions_mvp.sql
```

## Sincronizacion

El guardado hacia Supabase usa mutaciones incrementales:

- Promociones: inserta/actualiza/elimina solo filas cambiadas.
- Comentarios, logs, avances, compradores, actividades y catalogos auxiliares: sincronizan solo registros modificados cuando hay estado previo.
- Las lecturas grandes se hacen con paginacion interna para evitar depender de limites de respuesta.
- La pestana Logs no se carga junto con el catalogo; se consulta bajo demanda con paginacion desde la pantalla Logs.

## Flujo Excel de respaldo

1. Cargar plantilla Excel desde Inicio.
2. Revisar Consolidado.
3. Crear/editar promociones.
4. Agregar comentarios de Mercadeo.
5. Guardar Excel actualizado.

## Modulos actuales

- Inicio
- Promociones
- Consolidado
- Comentarios de Mercadeo dentro de Consolidado
- Logs con consulta bajo demanda y paginacion
- Ajustes
- Exportaciones

## Nota

Este MVP esta preparado para que Codex continue con:

- Validaciones de negocio avanzadas.
- Ajustes finos de permisos por accion.
- Auditoria avanzada por usuario final.
- Integracion corporativa con SQL Server, Oracle, Dataverse o API.
