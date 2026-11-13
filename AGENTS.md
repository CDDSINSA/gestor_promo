# AGENTS.md — Reglas de trabajo

Instrucciones para desarrolladores y agentes de código (Codex, Claude u otros) que trabajen en este repositorio.

Actualizado: 2026-10-12.

## Contexto mínimo

- Proyecto: Gestor de Promociones Retail de SINSA (`promo-retail-mvp` 0.2.0).
- Stack: React 19 + Vite 8. Persistencia operativa en **Supabase** (Auth, RLS, RPC, Storage, Realtime).
- Excel es respaldo, importación y exportación. **No** es la base de datos.
- Flujo de negocio que todo cambio debe respetar: **Comprador → Mercadeo → Pricing → Planimetría**.
- Parámetros (variables de entorno, puerto, roles, tablas, RPC): [README.md](README.md).
- Guías técnicas y orden de scripts SQL: [docs/README.md](docs/README.md).

## Uso eficiente del contexto

- No analizar todo el repositorio salvo que se pida.
- Buscar primero los archivos más probables y leer solo los relacionados con la tarea.
- Evitar abrir completos los archivos de más de 500 líneas. Los más grandes son `src/components/PromosPage.jsx`, `CatalogDesignPage.jsx`, `FidelizacionPage.jsx`, `App.jsx`, `src/utils/promoHelpers.js` y `docs/supabase_transactional_save_rpc.sql`.
- Ignorar `node_modules/`, `dist/`, `output/`, `outputs/`, `.archify/`, `apps-script/`, `scripts/` y `excelService.js` de la raíz (legado sin uso).

## Dónde está cada cosa

| Necesito cambiar... | Empezar por |
| --- | --- |
| Permisos de un rol o módulo | `src/constants/permissions.js` y la política RLS correspondiente en `docs/*.sql` |
| Menú o navegación | `src/constants/ui.js`, `src/app/shell/AppNavigation.jsx`, `src/app/shell/AppContent.jsx` |
| Reglas por tipo de promoción | `src/promoTypes/promoTypeEngine.js`, `src/services/promotionValidationService.js` |
| Nombres de campos app ↔ Excel ↔ BD | `src/utils/promoHelpers.js`, `src/services/supabase/mappers.js` |
| Guardado y sincronización | `src/hooks/useCatalogSync.js`, `src/app/sync/`, `src/services/supabase/save.js` |
| Lecturas desde Supabase | `src/services/supabase/catalog.js`, `exports.js` |
| Exportaciones Excel | `src/components/ExportPageV2.jsx`, `src/services/excelService.js`, `excelStyleService.js` |
| Maestro SKU | `src/hooks/useSkuMaster.js`, `src/services/supabase/skuMaster.js` |
| Notificaciones | `src/features/notifications/`, `src/hooks/useLiveNotifications.js` |
| Diseño de catálogos | `src/components/CatalogDesignPage.jsx`, `src/features/catalogDesign/` |
| Fidelización | `src/components/FidelizacionPage.jsx`, `src/services/fidelizacionService.js`, `src/features/fidelizacion/` |
| Colores y tipografía | `src/styles/base/variables.css` |

## Reglas de desarrollo

- Cambios pequeños y localizados. No refactorizar código no relacionado con la solicitud.
- No cambiar nombres de hojas ni columnas Excel sin autorización (`src/constants/sheets.js`).
- No agregar dependencias sin justificarlo.
- Mantener compatibilidad con datos en camelCase y snake_case; preferir los normalizadores existentes.
- Todo permiso nuevo en el frontend debe tener su equivalente en RLS. El frontend no es la capa de seguridad.
- Nunca usar la clave `service_role` ni credenciales técnicas en el frontend.
- No insertar en `logs` desde el cliente: la auditoría la generan triggers.
- Los cambios de base de datos se entregan como script SQL nuevo en `docs/`, con encabezado que indique dependencias, si es repetible y si es destructivo. Registrarlo en [docs/README.md](docs/README.md).
- No escribir colores en JSX. Los colores nuevos o de marca se definen como tokens en `src/styles/base/variables.css` (p. ej. `--color-sinsa-orange`). El CSS existente aún usa hexadecimales directos; no reescribirlo salvo que la tarea lo pida.
- Mantener la compatibilidad con una futura migración a SQL Server, Oracle, Dataverse o API corporativa.

## Antes de programar

1. Identificar el módulo afectado.
2. Identificar los archivos candidatos.
3. Explicar brevemente el plan.
4. Hacer los cambios mínimos.

## Validación

- Tras tocar frontend o servicios: `npm run build`.
- Tras cambiar reglas de dominio: agregar o ajustar pruebas en `tests/` y ejecutar
  `node --experimental-vm-modules --test tests/<archivo>.test.mjs`.
- Los scripts SQL no se pueden validar desde el frontend; indicar qué debe ejecutarse en Supabase.

## Al finalizar cada tarea

Indicar:

1. Archivos modificados.
2. Resumen de cambios.
3. Cómo probarlos.
4. Scripts SQL a ejecutar, si aplica, y en qué orden.
5. Riesgos identificados.

Si el cambio afecta parámetros, roles, tablas, RPC o módulos, actualizar también `README.md` y `docs/contexto_app_para_claude.md`.

## Preferencias del proyecto

- Priorizar simplicidad y mantenibilidad.
- UI corporativa, sobria, responsive y orientada a la productividad, familiar para usuarios de Excel.
