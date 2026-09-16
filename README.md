# SINSA Promo MVP

Aplicacion web React/Vite para gestionar promociones comerciales retail de SINSA. El sistema centraliza el flujo de trabajo entre Compradores, Mercadeo, Pricing y Planimetria, reemplazando gradualmente el uso de archivos Excel compartidos.

La persistencia operativa actual es Supabase. Excel se mantiene como respaldo, importacion/exportacion y puente operativo para usuarios acostumbrados a trabajar con archivos.

## Estado Actual

- Version del paquete: `0.2.0`.
- Frontend: React 19 con Vite.
- Base operativa: Supabase con Auth, RLS, RPC transaccional y consultas REST.
- Excel: soporte de carga, respaldo y exportacion mediante `xlsx` y `exceljs`.
- Maestro de articulos: tabla `sku_master` en Supabase, consultada por demanda.
- Roles activos: `ADMIN`, `BUYER`, `MARK`, `OPER`, `AUD`, `DISENADOR`.
- La app usa el token del usuario autenticado. No se debe exponer una `service_role` key en el frontend.

## Instalacion Local

```bash
npm install
npm run dev
```

Para validar el build:

```bash
npm run build
```

Vite puede emitir advertencias de chunks grandes. Esa advertencia es informativa mientras el build termine correctamente.

## Variables de Entorno

Copiar `.env.example` a `.env.local` y configurar:

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-publishable-o-anon-key
VITE_SUPABASE_ALLOWED_HOSTS=tu-proyecto.supabase.co
VITE_SUPABASE_AUTH_REDIRECT_URL=http://localhost:5173/
```

Notas:

- `VITE_SUPABASE_ALLOWED_HOSTS` restringe los hosts de Supabase permitidos por el frontend.
- En desarrollo se permiten overrides locales de conexion desde la app; en produccion se usan las variables de entorno.
- `VITE_SUPABASE_AUTH_REDIRECT_URL` se usa para recuperacion de contrasena.
- No se usan credenciales tecnicas de usuario ni claves privadas en el frontend.

## Flujo Operativo

1. El usuario inicia sesion con Supabase Auth.
2. La app carga su perfil desde `public.usuarios_app`.
3. El frontend habilita modulos segun permisos de rol.
4. Se cargan catalogos, actividades abiertas, compradores, segmentos, responsables, jerarquias, promociones, detalles, comentarios, avances y notificaciones desde Supabase.
5. El comprador crea o modifica promociones.
6. Mercadeo revisa promociones, agrega comentarios y resuelve observaciones.
7. Pricing, Planimetria y otros equipos consumen exportaciones generadas.
8. Los cambios se guardan en Supabase mediante `save_catalog_transactional`.
9. Excel queda disponible para importar respaldos o generar archivos operativos.

## Modulos Actuales

- `Inicio`: resumen operativo, catalogos/actividades y acciones principales.
- `Fidelizacion`: solicitudes y canastos de fidelizacion.
- `Promociones`: carga y edicion tipo Excel de promociones.
- `Consulta SKU`: busqueda y revision de SKU usados en promociones.
- `Solicitudes`: gestion de solicitudes especiales.
- `Promocion especial`: creacion de promociones fuera del flujo regular de catalogo.
- `Seguimiento`: vista Gantt/seguimiento de actividades.
- `Avances`: control de avances por catalogo, comprador y division.
- `Diseno Catalogos`: carga, revision y comentarios de paginas de catalogo.
- `Logs`: consulta paginada bajo demanda de auditoria.
- `Consolidado`: vista unificada con comentarios de Mercadeo.
- `Exportar`: exportaciones de Pricing, Mercadeo, Planimetria y Consolidado.
- `Ajustes`: catalogos base, compradores, conexion y carga administrativa de maestro SKU.

## Roles y Permisos

La matriz de permisos del frontend esta en `src/constants/permissions.js`.

| Rol | Uso principal |
| --- | --- |
| `ADMIN` | Acceso total y administracion del sistema. |
| `BUYER` | Promociones, solicitudes, avances, consolidado, exportaciones y fidelizacion. |
| `MARK` | Diseno de catalogos, seguimiento, consolidado, comentarios y exportaciones. |
| `OPER` | Solicitudes, seguimiento, exportaciones y fidelizacion operativa. |
| `AUD` | Diseno de catalogos en lectura, seguimiento y logs. |
| `DISENADOR` | Diseno de catalogos, carga/revision de paginas y seguimiento. |

Los permisos visuales del frontend no sustituyen RLS. La seguridad real debe existir en Supabase.

## Arquitectura del Frontend

```text
src/
  App.jsx                         Estado principal, autenticacion y orquestacion.
  main.jsx                        Entrada React.
  app/
    shell/                        Navegacion, layout y contenido por modulo.
    session/                      Helpers de sesion.
    sync/                         Snapshots, firmas y payloads de guardado.
  components/                     Pantallas y componentes de UI.
  constants/                      Roles, permisos, hojas Excel, navegacion y datos base.
  context/                        Contextos React.
  features/
    promotions/                   Logica de grilla, importacion, anulacion y combos.
    seguimiento/                  Modelo Gantt.
    skuMaster/                    Consulta y carga del maestro SKU.
  hooks/                          Estado de dominio, auth, carga, sync y notificaciones.
  promoTypes/                     Motor de reglas por tipo de promocion.
  services/
    excelService.js               Importacion/exportacion Excel.
    excelStyleService.js          Estilos de archivos Excel.
    promotionValidationService.js Validaciones de promociones.
    fidelizacionService.js        Operaciones de fidelizacion.
    supabase/                     Cliente REST/RPC modular de Supabase.
  styles/                         CSS global organizado por base, layout, componentes y paginas.
  utils/                          Normalizadores y conversiones app/Excel.
tests/                            Pruebas unitarias con node:test.
docs/                             SQL, guias tecnicas y notas de arquitectura.
```

`src/services/supabaseService.js` reexporta los servicios modulares de `src/services/supabase/` para conservar compatibilidad con imports existentes.

## Persistencia Supabase

Tablas y vistas principales usadas por la app:

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

Funciones/RPC relevantes:

- `current_user_role`
- `current_buyer_id`
- `current_buyer_scope_ids`
- `current_app_user_id`
- `current_user_label`
- `save_catalog_transactional`
- `create_live_notification`
- `get_sku_master_summary`
- `clear_sku_master`
- `insert_sku_master_batch`
- `crear_solicitud_fidelizacion`
- `finalizar_solicitud_fidelizacion`

## Scripts de Supabase

Documentos SQL relevantes en `docs/`:

- `supabase_schema.sql`: esquema base.
- `supabase_roles_permissions_mvp.sql`: roles, permisos, RLS y auditoria.
- `supabase_transactional_save_rpc.sql`: guardado transaccional e idempotencia de operaciones.
- `supabase_promociones_optimistic_concurrency.sql`: versionado para conflictos de promociones.
- `supabase_live_notifications.sql`: notificaciones en vivo.
- `supabase_sku_master.sql`: maestro SKU.
- `supabase_fidelizacion_schema.sql`: tablas y RPC de fidelizacion.
- `supabase_catalogo_diseno.sql`: flujo de diseno de catalogos.
- `supabase_delta_operativo_2026_06_22.sql`: delta operativo historico.
- Hotfixes y deltas puntuales: `supabase_hotfix_estado_registro_delta_rpc.sql`, `supabase_special_request_status_cleanup.sql`, `supabase_add_catalog_status_preliminar.sql`, `supabase_require_activity_id.sql`, `supabase_catalogo_diseno_fix_fecha_actualizacion.sql`.

Guia de autenticacion y RLS: `docs/supabase_auth_rls_setup.md`.

## Sincronizacion y Guardado

El guardado principal se realiza mediante la RPC `save_catalog_transactional`.

Caracteristicas:

- Genera un `operation_id` por operacion cliente.
- Valida promociones antes de enviar datos.
- Guarda cambios de forma transaccional.
- Usa firmas/snapshots locales para sincronizar solo registros modificados cuando hay estado previo.
- Maneja conflictos de version en promociones con el codigo `PROMOTION_VERSION_CONFLICT`.
- Si falta la RPC, la app muestra un error indicando ejecutar `docs/supabase_transactional_save_rpc.sql`.

Lecturas grandes:

- `selectAll` pagina internamente con `SELECT_PAGE_SIZE = 1000`.
- Logs se consultan bajo demanda con paginacion de 25, 50 o 100 filas.
- Exportaciones consultan datos desde Supabase con filtros y no dependen de tener todo cargado en memoria.

## Maestro de Articulos

El maestro se consulta exclusivamente desde `sku_master` en Supabase.

- La app no descarga todo el maestro al abrir.
- Se consultan solo los SKU usados, digitados, pegados o requeridos por flujos como regalías.
- Los resultados se mantienen en cache durante la sesion.
- Los SKU no encontrados se recuerdan para evitar consultas repetidas.
- Un fallo de red no se interpreta como SKU inexistente.
- La importacion administrativa desde Ajustes reemplaza el maestro en lotes.

Detalle tecnico: `docs/maestro_sku_por_demanda.md`.

## Modelo Excel

Excel es respaldo operativo, no la fuente principal de datos en esta version.

Hojas soportadas por el codigo:

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

Hojas minimas requeridas para importar respaldo:

- `CONFIG`
- `COMPRADORES`
- `PROMOCIONES`
- `COMENTARIOS`
- `LOGS`
- `NOTIFICACIONES`

Reglas:

- `PROMOCIONES` sigue siendo la tabla principal del modelo Excel.
- No se usan hojas separadas por comprador.
- `CONSOLIDADO` y `EXPORT_*` son vistas generadas; no deben editarse manualmente.
- No cambiar nombres de columnas ni hojas sin autorizacion.

## Reglas de Negocio

- SKU es obligatorio.
- Tipo de promocion es obligatorio.
- Promociones complejas requieren `grupo_oferta` y `tipo_sku`.
- Los comentarios abiertos no bloquean el guardado; generan advertencias o avisos operativos.
- La accion de borrar una promocion ya guardada la marca como `ANULADO`; las filas nuevas sin guardar se descartan localmente.
- Las promociones guardadas conservan datos historicos; consultar el maestro SKU no reescribe precios automaticamente.
- El flujo funcional debe respetar: Comprador -> Mercadeo -> Pricing -> Planimetria.
- La arquitectura debe seguir preparada para migrar a SQL Server, Oracle, Dataverse o API corporativa.

Reglas de anulacion: `docs/promociones_anuladas.md`.

## Pruebas

El proyecto usa `node:test` para pruebas focalizadas.

Ejecutar todas las pruebas disponibles:

```bash
node --experimental-vm-modules --test tests/*.test.mjs
```

Ejecutar pruebas del maestro SKU:

```bash
node --experimental-vm-modules --test tests/skuMaster.test.mjs
```

Validacion de produccion:

```bash
npm run build
```

## Convenciones de Desarrollo

- Hacer cambios pequenos y localizados.
- Leer primero los archivos del modulo afectado.
- No refactorizar codigo no relacionado con la solicitud.
- No agregar dependencias sin justificacion.
- Mantener compatibilidad con datos existentes en camelCase y snake_case.
- Preservar RLS y permisos de Supabase al tocar servicios.
- Mantener UI corporativa, sobria, responsive y orientada a productividad.
- Preferir normalizadores existentes en `src/utils/promoHelpers.js` antes de cambiar nombres de campos.

## Documentacion Complementaria

- `ROADMAP.md`: estado por modulo y plan de evolucion.
- `AGENTS.md`: instrucciones de trabajo para agentes de desarrollo.
- `docs/contexto_app_para_claude.md`: contexto resumido para asistencia externa.
- `docs/plan_migracion_drive_supabase.md`: plan historico de migracion.
- `docs/frontend_design_system_app_base.md`: lineamientos visuales.
- `apps-script/README.md`: integraciones auxiliares de Apps Script.
