# Contexto de la app para asistencia externa

Fecha de contexto: 2026-10-12.

Documento autocontenido para pegar en un asistente externo. La referencia completa de parámetros es el [README principal](../README.md); si hay diferencias, prevalece el README.

## Resumen

MVP web para gestionar las promociones comerciales retail de SINSA (Nicaragua). Reemplaza gradualmente los Excel compartidos y la coordinación informal, sin sustituir Oracle ni otros sistemas corporativos.

Flujo principal: **Comprador → Mercadeo → Pricing → Planimetría**.

1. El comprador crea o modifica promociones (unos 15 días antes de su vigencia).
2. Mercadeo revisa, comenta y resuelve observaciones; Diseño arma las páginas del catálogo.
3. Pricing (rol `OPER`) usa las exportaciones para configurar en Oracle/ORCE.
4. Planimetría (rol `OPER`) usa las exportaciones para tickets, rótulos y exhibiciones.

## Stack y parámetros

| Parámetro | Valor |
| --- | --- |
| Paquete | `promo-retail-mvp` 0.2.0 |
| Frontend | React 19, Vite 8, `lucide-react`, CSS propio en `src/styles/` |
| Excel | `xlsx` y `exceljs` |
| Persistencia | Supabase (REST, RPC, Auth, Storage, Realtime) |
| Puerto local | `3005` (`http://localhost:3005/`) |
| Zona horaria | `America/Managua` |
| Pruebas | `node:test`, `tests/*.test.mjs` |

```bash
npm run dev
npm run build
node --experimental-vm-modules --test tests/*.test.mjs
```

Variables de entorno:

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co        # obligatoria
VITE_SUPABASE_ANON_KEY=tu-publishable-o-anon-key         # obligatoria
VITE_SUPABASE_ALLOWED_HOSTS=tu-proyecto.supabase.co      # opcional, separada por comas
VITE_SUPABASE_AUTH_REDIRECT_URL=http://localhost:3005/   # opcional
VITE_USE_DEMO_DATA=false                                 # opcional, solo desarrollo
```

Nunca usar `service_role` en el frontend. La conexión solo se toma de estas variables.

## Roles

| Rol | Uso |
| --- | --- |
| `ADMIN` | Administración total. No crea solicitudes de Fidelización. |
| `BUYER` | Comprador: promociones, especiales, avances, Fidelización de su alcance, comentarios en Consolidado, revisión en Diseño. |
| `MARK` | Mercadeo: Diseño, Consolidado, Exportar, Seguimiento. |
| `OPER` | Ejecutor (Pricing/Planimetría): Solicitudes, Fidelización, Exportar, Seguimiento. |
| `AUD` | Auditor: Logs, Seguimiento, Diseño en lectura. |
| `DISENADOR` | Diseñador: carga de páginas en Diseño, Seguimiento. |

Matriz: `src/constants/permissions.js`. El perfil se lee de `public.usuarios_app`. RLS es la seguridad real.

## Módulos

Inicio, Fidelización, Promociones, Consulta SKU, Solicitudes, Promoción especial, Seguimiento, Avances, Diseño de Catálogos, Logs, Consolidado, Márgenes, Exportar y Ajustes.

La navegación está en `src/constants/ui.js`; el montaje de módulos en `src/app/shell/AppContent.jsx`. Promoción especial y Avances no están en el menú: se abren desde Inicio o Solicitudes.

## Archivos clave

- `src/App.jsx`: autenticación, carga inicial, estado y orquestación.
- `src/app/sync/syncOptions.js`, `savePayload.js`; `src/hooks/useCatalogSync.js`: sincronización.
- `src/components/PromosPage.jsx`: grilla de promociones.
- `src/components/ConsolidadoPage.jsx`: consolidado y comentarios.
- `src/components/ExportPageV2.jsx`: exportaciones.
- `src/components/CatalogDesignPage.jsx` y `src/features/catalogDesign/`: Diseño.
- `src/components/FidelizacionPage.jsx`, `src/services/fidelizacionService.js`: Fidelización.
- `src/services/supabase/`: cliente modular (`http`, `config`, `session`, `catalog`, `save`, `exports`, `notifications`, `skuMaster`, `catalogDesign`, `mappers`).
- `src/utils/promoHelpers.js`: normalizadores app/Excel.
- `src/promoTypes/promoTypeEngine.js`: reglas por tipo de promoción.

## Supabase

Tablas: `usuarios_app`, `compradores`, `configuracion`, `campanas`, `segmentos_clientes`, `promociones`, `promociones_detalle`, `comentarios`, `logs`, `notificaciones`, `save_operations`, `responsables_solicitudes`, `jerarquia_categorias`, `avances_catalogo`, `sku_master`, `notificaciones_envivo`, `catalogo_proyecto_diseno`, `catalogo_paginas_diseno`, `catalogo_pagina_comentarios`, `catalogo_pagina_respuestas`, `catalogo_pagina_versiones`, `catalogo_diseno_operaciones`, `catalogo_consolidado_final`, `canasto_fidelizacion`, `fidelizacion_solicitudes_detalle`, `fidelizacion_orce_importaciones`, `fidelizacion_orce_historial`, `notificaciones_correo`, `notificaciones_correo_tipos`, `notificaciones_eventos`, `notificaciones_grupos`, `notificaciones_grupo_miembros`, `notificaciones_suscripciones`, `sku_costos`, `promociones_costo`, `sku_clasificacion_abc`, `clasificacion_abc_catalogo` (vista `sku_master_abc`).

Vistas: `v_catalogos_operativos`, `v_catalogo_resumen`, `consolidado`, `export_pricing`, `export_mercadeo`, `export_planimetria`.

Correos por Microsoft 365: Edge Function `supabase/functions/enviar-correos` (credenciales solo como secretos de Supabase) y tarea `pg_cron` `notificaciones-correo-envio`; detalle en [notificaciones_correo.md](notificaciones_correo.md). Tabla de control del calendario: `catalogo_eventos_programados`. Tareas `pg_cron`: `run_catalog_daily_jobs` y `cleanup_live_notifications`. Avisos por triggers: estado/vigencia del catálogo, asignaciones y respuestas de Diseño. Detalle: [notificaciones_envivo_flujo.md](notificaciones_envivo_flujo.md).

RPC usadas por el frontend: `current_user_role`, `save_catalog_transactional`, `create_live_notification`, `send_admin_broadcast`, `get_sku_master_summary`, `clear_sku_master`, `insert_sku_master_batch`, `save_catalog_design_project`, `review_catalog_design_page`, `register_catalog_design_version`, `catalog_design_user_directory`, `get_notification_routing`, `set_notification_subscriptions`, `save_notification_group`, `delete_notification_group`, `crear_solicitud_fidelizacion`, `finalizar_solicitud_fidelizacion`, `conciliar_fidelizacion_orce`, `consultar_margenes_promociones`, `completar_costos_promociones`, `cargar_clasificacion_abc_lote`, `aplicar_clasificacion_abc`, `get_clasificacion_abc_resumen`.

Storage: buckets privados `sns_app_promo` (páginas de trabajo) y `catalogo_final` (PDF final), con URL firmadas.

Los scripts SQL están en `docs/` y se ejecutan a mano en el SQL Editor. Orden y riesgos: [docs/README.md](README.md#scripts-sql).

## Sincronización

- RPC `save_catalog_transactional` con token del usuario y `operation_id` por operación.
- Validación previa, sincronización incremental por firmas y conflictos `PROMOTION_VERSION_CONFLICT`.
- Lecturas paginadas de 1000; logs bajo demanda; exportaciones consultan Supabase con filtros.
- Carga por campaña (bandera `VITE_CARGA_POR_CAMPANA`, `src/app/sync/campaignLoading.js`): el inicio no trae promociones; `ensureCampaignsLoaded` (App.jsx) carga por actividad con `loadCampaignsFromSupabase`. La copia sincronizada solo contiene campañas cargadas, así que el guardado solo puede borrar dentro de ellas. Una actividad con cambios sin guardar nunca se reemplaza al cargarla. Seguimiento usa `v_seguimiento_resumen` e Inicio `v_comentarios_actividad_abiertos` (paso 40) para las campañas no cargadas.
- Guardia de borrado masivo: `src/app/sync/deleteGuard.js` + trigger del paso 39 (más de 20 y más del 10 % de una actividad requiere confirmación explícita y el encabezado `x-promo-allow-bulk-delete`).

## Maestro SKU

Solo desde `sku_master`, por los códigos necesarios, con caché de sesión. No descargar la tabla completa; no tratar un fallo de red como SKU inexistente. `skuMasterCount` cuenta la caché, no el total. Detalle: [maestro_sku_por_demanda.md](maestro_sku_por_demanda.md).

Clasificación ABC: Ajustes > Maestro detecta el reporte UDA (encabezados `UDA_ID, UDA_ITEM, UDA_VALUE`) y hace una actualización parcial (solo `UDA_ID = 4`; `UDA_VALUE` acepta código 1–11 o nombre). Se guarda en `sku_clasificacion_abc` (paso 35), separada de `sku_master` para sobrevivir al TRUNCATE de la recarga. SKU sin clasificación = 8 (Nuevo) (paso 36). Parser: `src/features/skuMaster/skuMasterParser.js`; carga: `updateSkuClassificationInSupabase`.

## Modelo Excel

Excel es respaldo, no base principal. Hojas: `CONFIG`, `CATALOGOS`, `ACTIVIDADES`, `segmentos_clientes`, `COMPRADORES`, `RESPONSABLES_SOLICITUDES`, `JERARQUIA_CATEGORIAS`, `PROMOCIONES`, `PROMOCIONES_DETALLE`, `AVANCES_CATALOGO`, `COMENTARIOS`, `LOGS`, `NOTIFICACIONES`, `CONSOLIDADO`, `EXPORT_PRICING`, `EXPORT_MERCADEO`, `EXPORT_PLANIMETRIA`.

Mínimas para importar: `CONFIG`, `COMPRADORES`, `PROMOCIONES`, `COMENTARIOS`, `LOGS`, `NOTIFICACIONES`.

`PROMOCIONES` es la tabla principal; no hay hojas por comprador; `CONSOLIDADO` y `EXPORT_*` son generadas; no cambiar columnas sin autorización.

## Reglas de negocio

- SKU y tipo de promoción obligatorios.
- Tipos simples: `Precio fijo` (exige precio ahora), `Descuento` (exige descuento).
- Tipos complejos: `Combo`, `Umbral`, `Compra X lleva X`, `Compra X Lleva X V2`, `Megapack`; exigen `grupo_oferta` y `tipo_sku` (y `variante` en Compra X).
- Comentarios abiertos no bloquean el guardado.
- Borrar una promoción guardada la marca `ANULADO`. Ver [promociones_anuladas.md](promociones_anuladas.md).
- Las promociones guardadas conservan datos históricos aunque cambie el maestro.
- Márgenes: precio con IVA ÷ 1.15 contra el costo guardado en la promoción (`promociones_costo`), por grupo de oferta. Costo con origen `NI` en C$; otro origen en US$ × `TASA_CAMBIO_USD`. Semáforo: verde ≥30, naranja ≥20, amarillo ≥10, rojo <10. Ver [margenes_promociones.md](margenes_promociones.md).

## UX/UI

Corporativa, sobria, productiva, responsive y familiar para usuarios de Excel.

Paleta: verde `#006B3F`, verde oscuro `#004B2D`, verde claro `#E8F5EE`, celeste `#00A6C8`, amarillo `#FFC72C`, naranja SINSA `#F18A00` (`--color-sinsa-orange` en `src/styles/base/variables.css`). Los colores nuevos o de marca se definen como tokens en ese archivo, no en JSX; el CSS existente todavía usa hexadecimales directos. Ver [notificaciones_envivo_flujo.md](notificaciones_envivo_flujo.md) para los tokens de la campana.

## Riesgos y puntos de atención

- Mantener alineados `permissions.js` y RLS.
- Algunas entidades aceptan camelCase y snake_case.
- Sin `save_catalog_transactional` no se puede guardar.
- Reejecutar scripts SQL antiguos puede revertir permisos.
- Las exportaciones aún deben validarse con Pricing, Mercadeo y Planimetría.

## Prompt sugerido

```text
Actúa como ingeniero frontend senior. Usa este contexto del proyecto SINSA Promo MVP.
Necesito modificar [módulo/archivo] para [objetivo].
Respeta la estructura Excel, el flujo Comprador -> Mercadeo -> Pricing -> Planimetría,
los permisos actuales, RLS de Supabase y la compatibilidad futura con SQL Server/Oracle/API.
Propón cambios pequeños y localizados, evita refactors no solicitados y valida con
npm run build si tocas frontend o servicios. Si cambias la base, entrega un script SQL
nuevo en docs/ con sus dependencias.
```
