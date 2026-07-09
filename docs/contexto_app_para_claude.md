# Contexto de la app para Claude

Fecha de contexto: 2026-07-08

## Resumen ejecutivo

Esta aplicacion es un MVP web para gestionar promociones comerciales retail de SINSA. Busca reemplazar gradualmente el proceso actual basado en archivos Excel compartidos y comunicacion informal, sin sustituir inicialmente Oracle ni otros sistemas corporativos.

La app esta construida con React y Vite. Supabase es la base operativa actual. Excel se conserva como respaldo, importacion/exportacion y puente para usuarios acostumbrados a trabajar con archivos.

## Objetivo del producto

Centralizar la gestion de promociones comerciales para que Compradores, Mercadeo, Pricing y Planimetria trabajen sobre una misma fuente de datos, con trazabilidad, comentarios y exportaciones controladas.

El flujo principal es:

1. Comprador crea o modifica promociones.
2. Mercadeo revisa y agrega comentarios.
3. Pricing usa exportaciones para configurar promociones.
4. Planimetria usa exportaciones para tickets, rotulos y exhibiciones.

## Usuarios y roles

Roles actuales:

- `ADMIN`: administrador total.
- `BUYER`: comprador.
- `MARK`: mercadeo/marketing.
- `OPER`: pricing, planimetria o ejecutor operativo.
- `AUD`: auditor.

Los permisos del frontend estan en:

- `src/constants/permissions.js`
- `src/hooks/usePermissions.js`
- `src/components/ProtectedRoute.jsx`

La sesion usa Supabase Auth y el perfil operativo se lee desde `public.usuarios_app`.

## Filosofia UX/UI

La interfaz debe ser:

- Corporativa, sobria, moderna y profesional.
- Inspirada en identidad visual SINSA.
- Productiva antes que decorativa.
- Responsive para escritorio y movil.
- Familiar para usuarios acostumbrados a Excel.

Paleta base:

- Verde principal: `#006B3F`
- Verde oscuro: `#004B2D`
- Verde claro: `#E8F5EE`
- Celeste: `#00A6C8`
- Amarillo: `#FFC72C`

Evitar redisenos grandes o decoracion innecesaria. Priorizar cambios pequenos, localizados y consistentes con `src/styles.css`.

## Stack tecnico

- Frontend: React.
- Build: Vite.
- Estilos: CSS global en `src/styles.css`.
- Iconos: `lucide-react`.
- Animaciones puntuales: `framer-motion`.
- Excel: `xlsx`.
- Persistencia operativa: Supabase.

Comandos utiles:

```bash
npm.cmd run dev
npm.cmd run build
```

## Estructura principal del repositorio

```text
src/App.jsx
src/main.jsx
src/styles.css
src/components/
src/constants/
src/hooks/
src/services/
src/services/supabase/
src/utils/
src/promoTypes/
docs/
```

Archivos clave:

- `src/App.jsx`: estado principal, rutas internas, carga/guardado, paso de props.
- `src/components/HomePage.jsx`: pantalla Inicio.
- `src/components/PromosPage.jsx`: carga y edicion de promociones.
- `src/components/ConsolidadoPage.jsx`: consolidado, filtros y comentarios de Mercadeo.
- `src/components/ExportPageV2.jsx`: exportaciones separadas para Pricing, Mercadeo, Planimetria y Consolidado.
- `src/components/AjustesPage.jsx`: catalogos, compradores y conexion Supabase.
- `src/services/excelService.js`: importacion/exportacion Excel.
- `src/services/supabase/catalog.js`: lectura de catalogo desde Supabase.
- `src/services/supabase/save.js`: guardado incremental hacia Supabase.
- `src/services/supabase/mappers.js`: transformacion app <-> Supabase.
- `src/utils/promoHelpers.js`: normalizaciones y conversiones de datos.
- `src/promoTypes/promoTypeEngine.js`: reglas por tipo de promocion.

## Modulos funcionales

- Inicio.
- Promociones.
- Consulta SKU.
- Solicitudes especiales.
- Gestion de Avances.
- Consolidado.
- Logs.
- Ajustes.
- Exportaciones.

## Reglas de negocio importantes

- SKU es obligatorio.
- Tipo de promocion es obligatorio.
- Promociones complejas requieren `grupo_oferta` y `tipo_sku`.
- Comentarios abiertos no bloquean guardado; generan advertencias o avisos.
- `CONSOLIDADO` y `EXPORT_*` son vistas generadas, no deben editarse manualmente.
- La tabla principal del modelo Excel es `PROMOCIONES`; no usar hojas separadas por comprador.
- No cambiar nombres de columnas Excel sin autorizacion.
- Mantener compatibilidad futura con SQL Server, Oracle, Dataverse o API corporativa.

## Estructura Excel esperada

Hojas esperadas:

- `CONFIG`
- `COMPRADORES`
- `NOTIFICACIONES`
- `PROMOCIONES`
- `COMENTARIOS`
- `LOGS`
- `CONSOLIDADO`
- `EXPORT_PRICING`
- `EXPORT_MERCADEO`
- `EXPORT_PLANIMETRIA`

Excel es respaldo operativo, no la base principal en la version actual.

## Supabase

Variables principales:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_SUPABASE_AUTH_REDIRECT_URL
```

Notas:

- No exponer `service_role` en frontend.
- Los permisos reales se protegen con RLS.
- La app usa el token del usuario autenticado.
- Los roles se leen desde `public.usuarios_app.rol`.
- Para usuarios compradores, `public.usuarios_app.buyer_id` debe apuntar a `public.compradores.id`.

Tablas relevantes:

- `usuarios_app`
- `compradores`
- `campanas`
- `promociones`
- `promociones_detalle`
- `comentarios`
- `logs`
- `avances_catalogo`
- `notificaciones`
- `configuracion`
- `segmentos_clientes`
- `responsables_solicitudes`
- `jerarquia_categorias`

Scripts/documentos relevantes:

- `docs/supabase_schema.sql`
- `docs/supabase_roles_permissions_mvp.sql`
- `docs/supabase_auth_rls_setup.md`
- `docs/supabase_delta_operativo_2026_06_22.sql`

## Comentarios de Mercadeo

Los comentarios viven en `comentarios` y pueden aplicar a:

- Linea/SKU: ligados a `row_id` o promocion.
- Actividad/catalogo: ligados a `actividad_id` o campana.

Estados esperados:

- `Abierto` / `ABIERTO`
- `Resuelto` / `RESUELTO`

En Consolidado, Mercadeo puede agregar comentarios y marcar estados. En Inicio, los compradores ven un aviso con la cantidad de comentarios abiertos asociados a sus promociones o actividades.

Importante sobre RLS:

- Comentarios ligados a promocion suelen estar cubiertos por politicas basadas en `promociones.buyer_id`.
- Comentarios generales de actividad pueden requerir politica adicional basada en `campanas.solicitante_buyer_id` si se quiere que el comprador los vea.

## Cambios recientes relevantes

### Inicio

Archivo:

- `src/components/HomePage.jsx`

Cambios:

- Estado de conexion Supabase movido arriba, junto al encabezado, en formato compacto.
- Agregado aviso para compradores con conteo de comentarios abiertos de Mercadeo.
- El aviso usa datos existentes (`comentarios`, `actividades`, `rows`) y no escribe en Supabase.

### Consolidado

Archivo:

- `src/components/ConsolidadoPage.jsx`

Cambios:

- Campo `Actividad / catalogo` usa un desplegable propio.
- El usuario ve y busca por nombre de actividad/catalogo.
- Internamente sigue siendo compatible con filtrado por ID o nombre.
- El boton de exportacion de Consolidado ahora genera `.xlsx`, no CSV.

### Exportaciones

Archivo:

- `src/components/ExportPageV2.jsx`

Cambios:

- Las exportaciones de Pricing, Mercadeo, Planimetria y Consolidado generan archivos `.xlsx`.
- Se mantiene la misma estructura de columnas.

## Recomendaciones para futuras modificaciones

- Leer solo los archivos relacionados con la tarea.
- Evitar refactors amplios.
- No modificar columnas Excel sin autorizacion.
- No modificar hojas Excel esperadas sin autorizacion.
- No agregar dependencias salvo que sea estrictamente necesario.
- Mantener cambios pequenos y localizados.
- Despues de tocar frontend, validar con:

```bash
npm.cmd run build
```

Aviso conocido: Vite puede mostrar advertencia de chunks mayores a 500 kB. Actualmente es informativa y no bloquea el build.

## Puntos de atencion

- La app tiene nombres y campos en espanol, algunos con variantes camelCase y snake_case por compatibilidad.
- Muchos normalizadores aceptan ambas formas. Revisar `src/utils/promoHelpers.js` antes de cambiar nombres.
- El diseno se apoya fuertemente en clases globales de `src/styles.css`.
- Algunas pantallas tienen componentes `Header`, `Button`, `Card` locales repetidos; no refactorizar salvo que se pida.
- La app debe seguir siendo simple para usuarios que vienen de Excel.

## Prompt sugerido para Claude

Puedes pegar este texto junto con una solicitud concreta. Ejemplo:

```text
Actua como ingeniero frontend senior. Usa este contexto del proyecto SINSA Promo MVP.
Necesito modificar [modulo/archivo] para [objetivo].
Respeta la estructura Excel, el flujo Comprador -> Mercadeo -> Pricing -> Planimetria,
los permisos actuales y la compatibilidad futura con Supabase/SQL Server/API.
Propone cambios pequenos y localizados, y evita refactors no solicitados.
```
