# Contexto de la App para Asistencia Externa

Fecha de contexto: 2026-09-16

## Resumen Ejecutivo

Esta aplicacion es un MVP web para gestionar promociones comerciales retail de SINSA. Reemplaza gradualmente el proceso actual basado en archivos Excel compartidos y comunicacion informal, sin sustituir inicialmente Oracle ni otros sistemas corporativos.

La app esta construida con React y Vite. Supabase es la base operativa actual. Excel se conserva como respaldo, importacion/exportacion y puente para usuarios acostumbrados a trabajar con archivos.

## Objetivo del Producto

Centralizar la gestion de promociones comerciales para que Compradores, Mercadeo, Pricing y Planimetria trabajen sobre una misma fuente de datos, con trazabilidad, comentarios, seguimiento, diseno de catalogos y exportaciones controladas.

Flujo principal:

1. Comprador crea o modifica promociones.
2. Mercadeo revisa, comenta y resuelve observaciones.
3. Pricing usa exportaciones para configurar promociones.
4. Planimetria usa exportaciones para tickets, rotulos y exhibiciones.
5. Los equipos pueden consultar logs, avances y seguimiento segun rol.

## Stack Tecnico

- Frontend: React 19.
- Build: Vite 8.
- Estilos: CSS global y archivos por dominio en `src/styles/`.
- Iconos: `lucide-react`.
- Excel: `xlsx` y `exceljs`.
- Persistencia operativa: Supabase REST/RPC/Auth/Realtime.
- Pruebas: `node:test` con archivos `.test.mjs`.

Comandos utiles:

```bash
npm run dev
npm run build
node --experimental-vm-modules --test tests/*.test.mjs
```

## Variables de Entorno

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-publishable-o-anon-key
VITE_SUPABASE_ALLOWED_HOSTS=tu-proyecto.supabase.co
VITE_SUPABASE_AUTH_REDIRECT_URL=http://localhost:5173/
```

Notas:

- No usar `service_role` en frontend.
- La app valida el host de Supabase contra `VITE_SUPABASE_ALLOWED_HOSTS`.
- En produccion no se deben depender de overrides manuales de conexion.

## Usuarios y Roles

Roles actuales:

- `ADMIN`: administrador total.
- `BUYER`: comprador.
- `MARK`: mercadeo/marketing.
- `OPER`: pricing, planimetria o ejecutor operativo.
- `AUD`: auditor.
- `DISENADOR`: diseno/carga de paginas de catalogo.

Archivos de permisos:

- `src/constants/permissions.js`
- `src/hooks/usePermissions.js`
- `src/components/ProtectedRoute.jsx`

La sesion usa Supabase Auth y el perfil operativo se lee desde `public.usuarios_app`.

## Modulos Funcionales

- Inicio.
- Fidelizacion.
- Promociones.
- Consulta SKU.
- Solicitudes especiales.
- Promocion especial.
- Seguimiento.
- Gestion de avances.
- Diseno de catalogos.
- Logs.
- Consolidado.
- Exportaciones.
- Ajustes.

La navegacion visible se define en `src/constants/ui.js`. El contenido de cada modulo se monta desde `src/app/shell/AppContent.jsx`.

## Estructura Principal del Repositorio

```text
src/App.jsx
src/main.jsx
src/app/
src/components/
src/constants/
src/context/
src/features/
src/hooks/
src/promoTypes/
src/services/
src/services/supabase/
src/styles/
src/utils/
tests/
docs/
apps-script/
```

Archivos clave:

- `src/App.jsx`: autenticacion, carga inicial, estado principal y orquestacion.
- `src/app/shell/AppContent.jsx`: renderizado de modulos protegidos.
- `src/app/shell/AppNavigation.jsx`: navegacion lateral y movil.
- `src/app/sync/syncOptions.js`: firmas, snapshots e identificadores de sincronizacion.
- `src/app/sync/savePayload.js`: normalizacion de conflictos y payloads de guardado.
- `src/components/PromosPage.jsx`: carga y edicion de promociones.
- `src/components/ConsolidadoPage.jsx`: consolidado y comentarios de Mercadeo.
- `src/components/ExportPageV2.jsx`: exportaciones `.xlsx`.
- `src/components/AjustesPage.jsx`: catalogos base, compradores, conexion y maestro SKU.
- `src/components/CatalogDesignPage.jsx`: coordina el flujo de diseno y revision de catalogos, estados, permisos y acciones. El panel de comentarios, lista de paginas, formularios, visor y anotaciones se encuentran en `src/features/catalogDesign/`; ver [componentes de Diseño](diseno_componentes.md).
- `src/components/FidelizacionPage.jsx`: flujo de fidelizacion.
- `src/services/excelService.js`: importacion/exportacion Excel.
- `src/services/supabase/catalog.js`: lectura operativa desde Supabase.
- `src/services/supabase/save.js`: guardado transaccional.
- `src/services/supabase/exports.js`: lectura filtrada para exportaciones.
- `src/services/supabase/notifications.js`: notificaciones en vivo.
- `src/services/supabase/skuMaster.js`: maestro SKU por demanda.
- `src/services/supabase/mappers.js`: transformacion Supabase <-> app.
- `src/utils/promoHelpers.js`: normalizaciones y conversiones app/Excel.
- `src/promoTypes/promoTypeEngine.js`: reglas por tipo de promocion.

## Supabase

Tablas y vistas relevantes:

- `usuarios_app`
- `compradores`
- `configuracion`
- `campanas`
- `segmentos_clientes`
- `sku_master`
- `promociones`
- `promociones_detalle`
- `comentarios`
- `logs`
- `notificaciones`
- `notificaciones_envivo`
- `responsables_solicitudes`
- `jerarquia_categorias`
- `avances_catalogo`
- `canasto_fidelizacion`
- `fidelizacion_solicitudes_detalle`
- `catalogo_proyecto_diseno`
- `catalogo_paginas_diseno`
- `catalogo_pagina_comentarios`
- `catalogo_consolidado_final`
- `save_operations`
- `v_catalogos_operativos`
- `v_catalogo_resumen`

RPC/funciones relevantes:

- `current_user_role`
- `current_buyer_id`
- `current_buyer_scope_ids`
- `current_app_user_id`
- `save_catalog_transactional`
- `create_live_notification`
- `get_sku_master_summary`
- `clear_sku_master`
- `insert_sku_master_batch`
- `crear_solicitud_fidelizacion`
- `finalizar_solicitud_fidelizacion`

Scripts/documentos relevantes:

- `docs/supabase_schema.sql`
- `docs/supabase_roles_permissions_mvp.sql`
- `docs/supabase_auth_rls_setup.md`
- `docs/supabase_transactional_save_rpc.sql`
- `docs/supabase_promociones_optimistic_concurrency.sql`
- `docs/supabase_live_notifications.sql`
- `docs/supabase_sku_master.sql`
- `docs/supabase_fidelizacion_schema.sql`
- `docs/supabase_catalogo_diseno.sql`
- `docs/supabase_delta_operativo_2026_06_22.sql`

## Sincronizacion

El guardado principal usa la RPC `save_catalog_transactional`.

Caracteristicas actuales:

- Usa token del usuario autenticado.
- Valida promociones antes de guardar.
- Genera `operation_id` por operacion.
- Sincroniza incrementalmente cuando existe estado previo.
- Detecta conflictos de version en promociones.
- Muestra modal de conflicto cuando Supabase devuelve `PROMOTION_VERSION_CONFLICT`.
- Lecturas grandes usan paginacion interna de 1000 registros.
- Logs se consultan bajo demanda desde la pantalla Logs.
- Exportaciones consultan Supabase con filtros, no dependen solo del estado cargado en pantalla.

## Maestro SKU

El maestro se consulta exclusivamente desde `sku_master`.

Reglas:

- No descargar todo el maestro al abrir.
- Consultar solo SKU necesarios.
- Mantener cache en memoria durante la sesion.
- Recordar SKU no encontrados.
- No tratar fallos de red como SKU inexistente.
- Importar maestro desde Ajustes en lotes.

Documento detallado: `docs/maestro_sku_por_demanda.md`.

## Modelo Excel

Excel es respaldo operativo, no base principal.

Hojas soportadas:

- `CONFIG`
- `CATALOGOS`
- `ACTIVIDADES`
- `segmentos_clientes`
- `COMPRADORES`
- `RESPONSABLES_SOLICITUDES`
- `JERARQUIA_CATEGORIAS`
- `PROMOCIONES`
- `PROMOCIONES_DETALLE`
- `AVANCES_CATALOGO`
- `COMENTARIOS`
- `LOGS`
- `NOTIFICACIONES`
- `CONSOLIDADO`
- `EXPORT_PRICING`
- `EXPORT_MERCADEO`
- `EXPORT_PLANIMETRIA`

Hojas minimas requeridas para importar:

- `CONFIG`
- `COMPRADORES`
- `PROMOCIONES`
- `COMENTARIOS`
- `LOGS`
- `NOTIFICACIONES`

Reglas:

- `PROMOCIONES` es la tabla principal.
- No usar hojas separadas por comprador.
- `CONSOLIDADO` y `EXPORT_*` son vistas generadas.
- No cambiar columnas Excel sin autorizacion.

## Reglas de Negocio Importantes

- SKU es obligatorio.
- Tipo de promocion es obligatorio.
- Promociones complejas requieren `grupo_oferta` y `tipo_sku`.
- Comentarios abiertos no bloquean guardado; generan advertencias o avisos.
- Borrar una promocion guardada marca `ANULADO`; filas nuevas sin guardar se descartan localmente.
- Promociones guardadas conservan datos historicos aunque el maestro SKU cambie.
- Mantener compatibilidad futura con SQL Server, Oracle, Dataverse o API corporativa.

Reglas de anulacion: `docs/promociones_anuladas.md`.

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
- Naranja SINSA: `#F18A00`, definido por `--color-sinsa-orange` en `src/styles/base/variables.css`.

La campana flotante utiliza el naranja mediante los tokens semanticos `--notification-fab-*`, con icono oscuro y estados hover, abierto, borde, sombra y foco derivados. No repetir el hexadecimal en componentes. Consultar [el flujo de notificaciones](notificaciones_envivo_flujo.md) para arquitectura, sonido, destinatarios, contraste y pruebas.

Evitar redisenos grandes o decoracion innecesaria. Priorizar cambios pequenos, localizados y consistentes con los estilos existentes.

## Recomendaciones para Futuras Modificaciones

- Leer solo los archivos relacionados con la tarea.
- Evitar refactors amplios.
- No modificar columnas Excel sin autorizacion.
- No modificar hojas Excel esperadas sin autorizacion.
- No agregar dependencias salvo que sea estrictamente necesario.
- Mantener cambios pequenos y localizados.
- Revisar `src/utils/promoHelpers.js` antes de renombrar campos.
- Verificar permisos frontend y RLS cuando se agregue una accion nueva.
- Despues de tocar frontend o servicios, validar con `npm run build`.
- Para cambios de reglas de dominio, agregar o ajustar pruebas en `tests/`.

## Riesgos y Puntos de Atencion

- La matriz de permisos del frontend debe mantenerse alineada con RLS.
- Algunas entidades aceptan camelCase y snake_case por compatibilidad historica.
- `skuMasterCount` representa articulos en cache de sesion, no el total real del maestro.
- Si falta `save_catalog_transactional`, no se puede guardar en Supabase.
- Exportaciones deben validarse con Pricing, Mercadeo y Planimetria antes de cerrar contrato de columnas.
- La futura integracion corporativa debe preservar el flujo Comprador -> Mercadeo -> Pricing -> Planimetria.

## Prompt Sugerido para Asistencia Externa

```text
Actua como ingeniero frontend senior. Usa este contexto del proyecto SINSA Promo MVP.
Necesito modificar [modulo/archivo] para [objetivo].
Respeta la estructura Excel, el flujo Comprador -> Mercadeo -> Pricing -> Planimetria,
los permisos actuales, RLS de Supabase y la compatibilidad futura con SQL Server/Oracle/API.
Propone cambios pequenos y localizados, evita refactors no solicitados y valida con npm run build si tocas frontend o servicios.
```
