# SINSA Promo MVP — Gestor de Promociones

Aplicación web React/Vite para gestionar las promociones comerciales retail de SINSA. Centraliza el trabajo de Compradores, Mercadeo, Pricing, Planimetría y Diseño, y reemplaza gradualmente los archivos Excel compartidos.

- Persistencia operativa: **Supabase** (Auth, RLS, REST, RPC, Storage y Realtime).
- Excel: respaldo, importación/exportación y puente para usuarios habituados a archivos. No es la fuente de datos.
- Flujo de negocio: **Comprador → Mercadeo → Pricing → Planimetría**.

Actualizado: 2026-10-12.

## Parámetros del proyecto

| Parámetro | Valor | Dónde se define |
| --- | --- | --- |
| Paquete / versión | `promo-retail-mvp` `0.2.0` | `package.json` |
| Frontend | React 19.2, Vite 8.1, `lucide-react` | `package.json` |
| Excel | `xlsx` 0.20.3 (CDN SheetJS), `exceljs` 4.4 | `package.json` |
| Puerto de desarrollo | `3005`, escuchando en `0.0.0.0` | `vite.config.js` |
| URL local | `http://localhost:3005/` | — |
| Zona horaria de negocio | `America/Managua` | cuenta regresiva y exportaciones |
| Tamaño de página en lecturas | 1000 filas (`SELECT_PAGE_SIZE`) | `src/services/supabase/config.js` |
| Tiempo máximo por petición | 45 s (`REQUEST_TIMEOUT_MS`) | `src/services/supabase/config.js` |
| Lote de escritura REST | 500 filas | `src/services/supabase/http.js` |
| Buckets de Storage | `sns_app_promo` (trabajo), `catalogo_final` (PDF final), ambos privados | `src/services/supabase/catalogDesign.js` |
| Claves de `localStorage` | `sinsaPromo.supabaseConnection`, `sinsaPromo.appSession`, `sinsaPromo.notificationSound` | `config.js`, `useNotificationSound.js` |
| Pruebas | `node:test`, archivos `tests/*.test.mjs` | `tests/` |

## Instalación local

Requisitos: Node.js con npm y acceso a un proyecto Supabase ya preparado (ver [scripts SQL](docs/README.md#scripts-sql)).

```bash
npm install
cp .env.example .env.local   # completar valores
npm run dev                  # http://localhost:3005/
```

Scripts de `package.json`:

| Comando | Uso |
| --- | --- |
| `npm run dev` | Servidor de desarrollo en el puerto 3005. |
| `npm run build` | Build de producción en `dist/`. Las advertencias de chunks grandes son informativas. |
| `npm run preview` | Sirve el build localmente. |

En PowerShell con políticas restrictivas, usar `npm.cmd` en lugar de `npm`.

## Variables de entorno

Definir en `.env.local` (desarrollo) y en las variables del hosting (producción). `.env` y `.env.local` están en `.gitignore`.

| Variable | Obligatoria | Uso |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Sí | URL del proyecto, p. ej. `https://xxxx.supabase.co`. |
| `VITE_SUPABASE_ANON_KEY` | Sí | Clave pública (anon/publishable). Nunca usar `service_role` en el frontend. |
| `VITE_SUPABASE_ALLOWED_HOSTS` | No | Lista de hosts permitidos separada por comas. El host de `VITE_SUPABASE_URL` siempre se permite. |
| `VITE_SUPABASE_AUTH_REDIRECT_URL` | No | URL de retorno del correo de recuperación. Si falta, se usa la URL actual del navegador. Debe estar registrada en Supabase Auth. |
| `VITE_USE_DEMO_DATA` | No | `true` carga datos de ejemplo de `src/constants/seedData.js`. Solo funciona en modo desarrollo. |
| `VITE_CARGA_POR_CAMPANA` | No | `true` activa la carga por campaña: el inicio de sesión no descarga todas las promociones y cada módulo carga solo las campañas que usa (Consolidado, Exportes, Consulta SKU, Fidelización y Ajustes todavía cargan todo al entrar). `false` o vacío = carga completa como antes; es el rollback inmediato. Requiere el paso 40 de `docs/`. En un navegador se puede forzar con `localStorage` `promo.cargaPorCampana` = `on` / `off`. |

La conexión se toma solo de estas variables: la edición manual de URL/clave desde la app está desactivada (`SUPABASE_CONNECTION_OVERRIDES_ENABLED = false`).

## Flujo operativo

1. El usuario inicia sesión con Supabase Auth.
2. La app carga su perfil desde `public.usuarios_app` y normaliza su rol.
3. Se habilitan los módulos según la matriz de permisos.
4. Se cargan catálogos/actividades operativas, compradores, segmentos, responsables, jerarquías y avances. Las promociones se cargan por alcance, bajo demanda.
5. El comprador crea o modifica promociones; Mercadeo revisa y comenta en Consolidado.
6. Pricing y Planimetría descargan las exportaciones.
7. Los cambios se guardan con la RPC `save_catalog_transactional`.
8. Excel queda disponible para respaldos e importación.

## Módulos

Identificadores definidos en `src/constants/ui.js` y `MODULE_PERMISSIONS`.

| Id | Módulo | Acceso desde | Permiso |
| --- | --- | --- | --- |
| `home` | Inicio: catálogos, cuenta regresiva de cortes y acciones principales | Menú | `view:home` |
| `fidelizacion` | Fidelización: canasto, solicitudes, conciliación ORCE y resumen | Menú | `view:fidelizacion` |
| `promos` | Promociones: grilla tipo Excel, pegado masivo y validación | Menú | `view:promos` |
| `consulta` | Consulta SKU | Menú | `view:consulta` |
| `solicitudes` | Solicitudes especiales | Menú | `view:solicitudes` |
| `especial` | Promoción especial (fuera del catálogo regular) | Inicio / Solicitudes | `create:promocion_especial` |
| `seguimiento` | Seguimiento tipo Gantt | Menú | `view:seguimiento` |
| `avances` | Gestión de avances por catálogo, comprador y división | Inicio | `view:avances` |
| `catalogDesign` | Diseño de Catálogos: visor, anotaciones, observaciones, versiones | Menú | `view:catalog_design` |
| `logs` | Logs de auditoría, paginados (25/50/100) | Menú | `view:logs` |
| `consolidado` | Consolidado y comentarios de Mercadeo | Menú | `view:consolidado` |
| `margenes` | Monitoreo de márgenes por grupo de oferta (catálogos y especiales), semáforo y export XLSX | Menú | `view:margenes` (export: `export:margenes`) |
| `export` | Exportaciones Pricing, Mercadeo, Planimetría, Consolidado y seguimiento de diseños | Menú | `view:exports` |
| `ajustes` | Catálogos base, compradores, maestro SKU, difusión y parámetros de márgenes | Menú | `manage:settings` |

Notas de Consolidado: la exportación XLSX agrega la columna `Fecha de modificación` (hora de Nicaragua, `dd/mm/yyyy hh:mm`), resalta en amarillo las promociones modificadas (versión > 1, o fecha de modificación posterior a la creación) y en rojo las anuladas. Respeta los filtros seleccionados y no altera otras exportaciones.

## Roles y permisos

Fuente: `src/constants/permissions.js`. El frontend solo oculta o muestra; la seguridad real está en RLS. Ambos deben mantenerse alineados.

| Rol (`usuarios_app.rol`) | Etiqueta | Módulos | Acciones destacadas |
| --- | --- | --- | --- |
| `ADMIN` | Administrador | Todos | Todas, excepto `manage:fidelizacion` (crear solicitudes). En Supabase puede consultar, cambiar estado y conciliar ORCE. |
| `BUYER` | Comprador | Inicio, Fidelización, Promociones, Consulta SKU, Solicitudes, Promoción especial, Seguimiento, Avances, Diseño, Consolidado, Exportar | Edita promociones y avances; comenta en Consolidado; revisa páginas de Diseño; opera Fidelización de su alcance. Requiere `buyer_id`. |
| `MARK` | Marketing | Diseño, Seguimiento, Consolidado, Exportar | Gestiona proyectos de Diseño, sube y revisa páginas, comenta en Consolidado. No tiene Inicio. |
| `OPER` | Ejecutor (Pricing / Planimetría) | Fidelización, Solicitudes, Seguimiento, Exportar | Cambia estado de solicitudes y finaliza solicitudes de Fidelización. |
| `AUD` | Auditor | Diseño (lectura), Seguimiento, Logs | Solo consulta. |
| `DISENADOR` | Diseñador | Diseño, Seguimiento | Sube páginas de catálogo. |

Alias aceptados al normalizar el rol: `COMPRADOR`/`COMP` → `BUYER`; `MERCADEO`/`MARKETING` → `MARK`; `PRICING`/`PRICE`/`PLANIMETRIA`/`EJECUTOR` → `OPER`; `AUDITOR`/`AUT` → `AUD`; `CDD`/`DISEÑADOR` → `DISENADOR`. En la base, la restricción de `usuarios_app.rol` solo admite los seis valores canónicos.

## Arquitectura del frontend

```text
src/
  App.jsx                  Autenticación, carga inicial, estado principal y orquestación.
  main.jsx                 Entrada React.
  app/
    shell/                 AppContent (módulos con React.lazy), AppNavigation, DatabaseStatus.
    session/               Helpers de sesión.
    sync/                  Snapshots, firmas y payloads de guardado.
  components/              Pantallas (PromosPage, ConsolidadoPage, CatalogDesignPage, ...).
  constants/               Roles/permisos, navegación, hojas Excel, constantes de promociones, datos demo.
  context/                 AuthContext.
  features/
    catalogDesign/         Visor, anotaciones, comentarios y respuestas de Diseño.
    catalogSchedule/       Cuenta regresiva de cortes por catálogo.
    consolidado/           Metadatos de exportación.
    designExport/          Reporte de seguimiento de diseños.
    fidelizacion/          Conciliación ORCE, movimiento de ofertas y resumen.
    notifications/         Eventos, entrega, sonido y difusión.
    promotions/            Importación masiva, grilla, anulación y combos.
    seguimiento/           Modelo Gantt.
    skuMaster/             Consulta y carga del maestro SKU.
  hooks/                   Estado de dominio, auth, carga, sync y notificaciones.
  promoTypes/              Motor de reglas por tipo de promoción.
  services/
    excelService.js        Importación/exportación Excel.
    excelStyleService.js   Estilos de archivos Excel.
    promotionValidationService.js
    fidelizacionService.js, fidelizacionOrceService.js, fidelizacionSummaryService.js
    supabase/              Cliente REST/RPC/Storage modular (http, config, session, catalog, save, ...).
    supabaseService.js     Reexporta services/supabase para imports antiguos.
  styles/                  CSS por base, layout, componentes y páginas.
  utils/                   Normalizadores y conversiones app/Excel.
tests/                     Pruebas node:test.
docs/                      Guías técnicas y scripts SQL (ver docs/README.md).
scripts/                   Utilidades Python de la migración desde Drive (histórico).
apps-script/               API anterior sobre Google Sheets (histórico).
```

Archivos en la raíz que no forman parte del build: `excelService.js` (versión antigua, sin uso; la vigente es `src/services/excelService.js`), `summary-preview.*` (vista previa de desarrollo) y las carpetas `output/`, `outputs/` y `.archify/` (resultados de QA y análisis).

## Tipos de promoción

Fuente: `src/promoTypes/promoTypeEngine.js`.

| Tipo | Clase | Campos obligatorios adicionales |
| --- | --- | --- |
| `Precio fijo` | Simple | `precio_ahora` |
| `Descuento` | Simple | `descuento` |
| `Combo` | Compleja | `grupo_oferta`, `tipo_sku` |
| `Umbral` | Compleja | `grupo_oferta`, `tipo_sku` (hasta 6 niveles) |
| `Compra X lleva X` | Compleja | `grupo_oferta`, `tipo_sku`, `variante` |
| `Compra X Lleva X V2` | Compleja | `grupo_oferta`, `tipo_sku`, `variante` |
| `Megapack` | Compleja | `grupo_oferta`, `tipo_sku` |

Otras constantes (`src/constants/promoConstants.js`): tipos de actividad `CATALOGO`/`ESPECIAL`; alcances `CANAL`, `SEGMENTO`, `TIENDA`, `MULTI_TIENDA`; estados de solicitud especial `Nuevo`, `Aprobado`, `En trabajo`, `Finalizado` y `Archivado`.

## Supabase

Tablas:

- Núcleo: `usuarios_app`, `compradores`, `configuracion`, `campanas`, `segmentos_clientes`, `promociones`, `promociones_detalle`, `comentarios`, `logs`, `notificaciones`, `save_operations`.
- Operación: `responsables_solicitudes`, `jerarquia_categorias`, `avances_catalogo`, `sku_master`, `notificaciones_envivo`, `catalogo_eventos_programados`.
- Diseño: `catalogo_proyecto_diseno`, `catalogo_paginas_diseno`, `catalogo_pagina_comentarios`, `catalogo_pagina_respuestas`, `catalogo_pagina_versiones`, `catalogo_diseno_operaciones`, `catalogo_consolidado_final`.
- Fidelización: `canasto_fidelizacion`, `fidelizacion_solicitudes_detalle`, `fidelizacion_orce_importaciones`, `fidelizacion_orce_historial`.
- Clasificación ABC: `sku_clasificacion_abc` y `clasificacion_abc_catalogo`; vista `sku_master_abc` (maestro con clasificación, por defecto 8 Nuevo).
- Márgenes: `sku_costos` (costo por SKU, se carga con el maestro) y `promociones_costo` (costo guardado por línea de promoción). Sin acceso REST; solo por RPC. Parámetros `TASA_CAMBIO_USD` y `MARGEN_SEMAFORO` en `configuracion`.

Vistas: `v_catalogos_operativos`, `v_catalogo_resumen`, `consolidado`, `export_pricing`, `export_mercadeo`, `export_planimetria`.

RPC que llama el frontend:

| Área | RPC |
| --- | --- |
| Sesión | `current_user_role` |
| Guardado | `save_catalog_transactional` |
| Notificaciones | `create_live_notification`, `send_admin_broadcast`, `get_notification_routing`, `set_notification_subscriptions`, `save_notification_group`, `delete_notification_group` (Ajustes > Notificaciones, solo ADMIN) |
| Maestro SKU | `get_sku_master_summary`, `clear_sku_master`, `insert_sku_master_batch`, `cargar_clasificacion_abc_lote`, `aplicar_clasificacion_abc`, `get_clasificacion_abc_resumen` |
| Diseño | `save_catalog_design_project`, `review_catalog_design_page`, `register_catalog_design_version`, `catalog_design_user_directory` (opcional: nombres de diseñadores y autores para compradores y diseñadores) |
| Fidelización | `crear_solicitud_fidelizacion`, `finalizar_solicitud_fidelizacion`, `conciliar_fidelizacion_orce` |
| Márgenes | `consultar_margenes_promociones` (ADMIN, OPER y BUYER de su alcance), `completar_costos_promociones` (ADMIN, al final de la carga del maestro) |

Tareas programadas (`pg_cron`, ver [notificaciones](docs/notificaciones_envivo_flujo.md#calendario-automático-de-catálogos)): `run_catalog_daily_jobs` (00:05 Managua: estados automáticos Borrador → Preliminar → Precios Finales y aviso de corte) y `cleanup_live_notifications` (limpieza de avisos 30/90 días). Los avisos de estado, vigencia, asignaciones y respuestas de Diseño los generan triggers.

Funciones auxiliares usadas por RLS: `current_app_user_id`, `current_buyer_id`, `current_buyer_scope_ids`, `current_user_label`, `is_role`, `is_any_role`, `normalize_role`.

Instalación, orden de ejecución y riesgos de cada script: [docs/README.md](docs/README.md#scripts-sql). Autenticación y alta de usuarios: [docs/supabase_auth_rls_setup.md](docs/supabase_auth_rls_setup.md).

## Sincronización y guardado

- Guardado con la RPC `save_catalog_transactional`, con `operation_id` por operación (idempotencia en `save_operations`).
- Validación de promociones antes de enviar.
- Sincronización incremental mediante firmas/snapshots locales.
- Conflictos de versión de promociones: código `PROMOTION_VERSION_CONFLICT` y modal de resolución.
- Si falta la RPC, la app pide ejecutar `docs/supabase_transactional_save_rpc.sql`.
- Lecturas grandes paginadas de 1000 en 1000; logs bajo demanda; exportaciones consultan Supabase con filtros.

## Maestro de artículos

Se consulta solo desde `sku_master`, por los códigos necesarios, con caché durante la sesión. Recuerda los SKU no encontrados y no confunde un fallo de red con un SKU inexistente. La carga administrativa desde Ajustes (solo ADMIN) reemplaza el maestro por lotes y, en la misma acción, los costos (`UNIT_COST`, `ORIGIN_COUNTRY_ID`) en `sku_costos`. Si el archivo es el reporte UDA (`UDA_ID, UDA_DESC, UDA_ITEM, UDA_VALUE`), la app lo detecta y solo actualiza la clasificación ABC (filas con `UDA_ID = 4`); los SKU que no vienen quedan como 8 (Nuevo) y la clasificación se conserva al recargar el maestro. Detalle: [docs/maestro_sku_por_demanda.md](docs/maestro_sku_por_demanda.md).

## Modelo Excel

Hojas (`src/constants/sheets.js`): `CONFIG`, `CATALOGOS`, `ACTIVIDADES`, `segmentos_clientes`, `COMPRADORES`, `RESPONSABLES_SOLICITUDES`, `JERARQUIA_CATEGORIAS`, `PROMOCIONES`, `PROMOCIONES_DETALLE`, `AVANCES_CATALOGO`, `COMENTARIOS`, `LOGS`, `NOTIFICACIONES`, `CONSOLIDADO`, `EXPORT_PRICING`, `EXPORT_MERCADEO`, `EXPORT_PLANIMETRIA`.

Mínimas para importar un respaldo (`REQUIRED_SHEETS`): `CONFIG`, `COMPRADORES`, `PROMOCIONES`, `COMENTARIOS`, `LOGS`, `NOTIFICACIONES`.

Reglas:

- `PROMOCIONES` es la tabla principal. No se usan hojas por comprador.
- `CONSOLIDADO` y `EXPORT_*` son vistas generadas; no se editan a mano.
- No cambiar nombres de hojas ni columnas sin autorización.

## Reglas de negocio

- SKU y tipo de promoción son obligatorios.
- Las promociones complejas requieren `grupo_oferta` y `tipo_sku`.
- Los comentarios abiertos no bloquean el guardado; generan avisos.
- Borrar una promoción guardada la marca `ANULADO`; las filas nuevas sin guardar se descartan. Ver [docs/promociones_anuladas.md](docs/promociones_anuladas.md).
- Las promociones guardadas conservan su precio y descripción históricos aunque cambie el maestro.
- La arquitectura debe seguir preparada para migrar a SQL Server, Oracle, Dataverse o una API corporativa.

## Pruebas

```bash
# Todas
node --experimental-vm-modules --test tests/*.test.mjs

# Un archivo
node --experimental-vm-modules --test tests/skuMaster.test.mjs

# Build
npm run build
```

`tests/broadcastSql.test.mjs` necesita además la variable `PROMO_SQL_TEST_RUNTIME` con la ruta a PGlite; ver [docs/catalog-deadlines-broadcasts.md](docs/catalog-deadlines-broadcasts.md).

## Convenciones de desarrollo

Las reglas para personas y agentes de desarrollo están en [AGENTS.md](AGENTS.md).

## Documentación

- [ROADMAP.md](ROADMAP.md): estado por módulo y plan.
- [AGENTS.md](AGENTS.md): reglas de trabajo para desarrolladores y agentes.
- [docs/README.md](docs/README.md): índice de guías técnicas y scripts SQL.
- [docs/contexto_app_para_claude.md](docs/contexto_app_para_claude.md): contexto resumido para asistentes externos.
