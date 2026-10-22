# ROADMAP — Gestor de Promociones Retail

Actualizado: 2026-10-12. Versión actual: MVP `0.2.0`.

## Dirección

1. Operación diaria en Supabase.
2. Excel como respaldo y salida operativa.
3. Preparación técnica para migrar a SQL Server, Oracle, Dataverse o API corporativa.

Parámetros técnicos: [README.md](README.md). Guías y scripts SQL: [docs/README.md](docs/README.md).

## Estado por módulo

| Módulo / capacidad | Estado | Pendiente principal |
| --- | --- | --- |
| Autenticación y sesión | Operativo | Auditoría de permisos con usuarios reales. |
| UX/UI y layout | Mantenimiento | Revisión visual por perfiles y ajustes de accesibilidad. |
| Promociones | Operativo | Reglas finales por tipo y más pruebas de promociones complejas. |
| Promociones especiales y solicitudes | Operativo | Estados finales con responsables reales. |
| Fidelización | Operativo | Pruebas con datos reales. |
| Consolidado y comentarios | Operativo | Reglas finales de visibilidad de comentarios. |
| Seguimiento y avances | Operativo | Estados definitivos de avance y SLA. |
| Diseño de catálogos | Operativo | Validación con Diseño; reglas de aprobación/publicación; extraer lógica de `CatalogDesignPage.jsx` a hooks. |
| Exportaciones | Operativo | Cerrar el contrato de columnas con cada área. |
| Logs y auditoría | Operativo | Filtros avanzados y comparación de versiones. |
| Notificaciones en vivo | Operativo (v2) | Envío por correo; mover a la base los avisos que aún pide el navegador. |
| Maestro de artículos | Operativo | Responsable y frecuencia de actualización; carga automática. |
| Excel de respaldo | Mantenimiento | Congelar contrato de columnas y plantilla oficial. |

## Implementado

### Autenticación, sesión y seguridad

- Login, recuperación y restablecimiento de contraseña con Supabase Auth.
- Perfil desde `public.usuarios_app`; roles `ADMIN`, `BUYER`, `MARK`, `OPER`, `AUD`, `DISENADOR`.
- Protección por módulo con `ProtectedRoute` y RLS en Supabase.
- Validación del host de Supabase (`VITE_SUPABASE_ALLOWED_HOSTS`).
- Endurecimiento de permisos (`supabase_permissions_hardening.sql`).

### UX/UI

- Navegación lateral (escritorio) e inferior (móvil); barra de estado de base de datos.
- Módulos con carga diferida (`React.lazy`).
- Estilos por base, layout, componentes y páginas; tokens en `variables.css`.

### Promociones

- Grilla tipo Excel, promociones simples y complejas, pegado masivo con vista previa.
- Validaciones visuales y previas al guardado.
- Anulación lógica (`ANULADO`).
- Carga de promociones por alcance, bajo demanda.
- Concurrencia optimista (`PROMOTION_VERSION_CONFLICT`).
- Número de página sugerido (`numero_pagina`).

### Promociones especiales y solicitudes

- Creación de promociones especiales y gestión de solicitudes.
- Responsables desde `responsables_solicitudes`; estado `Archivado`.
- Cambio de estado por el Ejecutor (`cambiar_estado_solicitud`).

### Fidelización

- Canasto y solicitudes de actualización de descuentos.
- Reglas de integridad y creación masiva por lotes.
- Conciliación de IDs de ORCE desde reporte `.xlsx`.
- Acceso ADMIN para consulta, cambio de estado y conciliación.
- Resumen de ofertas vigentes (ADMIN y OPER).

### Consolidado y comentarios

- Vista unificada con filtros; comentarios por SKU y por actividad; estados `Abierto`/`Resuelto`.
- Exportación XLSX con fecha de modificación y resaltado de modificadas/anuladas.

### Seguimiento y avances

- Vista Gantt y gestión de avances (`avances_catalogo`).
- Cuenta regresiva de cortes por catálogo en Inicio (zona America/Managua).

### Diseño de catálogos

- Proyectos, páginas, comentarios y consolidado final; buckets privados con URL firmadas.
- Visor con zoom, paneo y anotaciones; checklist de observaciones.
- Versionado seguro de imágenes y operaciones atómicas por RPC.
- Hasta dos respuestas por observación.
- Fecha exacta del último cambio de estado.
- Reporte XLSX de seguimiento de diseños en Exportaciones.

### Exportaciones

- Pricing, Mercadeo, Planimetría, Consolidado y seguimiento de diseños, consultando Supabase con filtros.

### Logs

- Consulta bajo demanda, paginación de 25/50/100, orden descendente; auditoría por triggers.

### Notificaciones

- `notificaciones_envivo`, RPC `create_live_notification` y Realtime.
- Campana flotante, sonido configurable y recuperación al reconectar.
- Difusión administrativa (`send_admin_broadcast`, solo ADMIN).
- v2 (octubre 2026): estados automáticos de catálogo por calendario, aviso único el día de cada corte, avisos de cambio de estado/vigencia, asignación de páginas y respuestas de Diseño; cambios de promociones dirigidos al diseñador de la página; destinatarios calculados en el servidor; campana con no leídas y paginación; limpieza 30/90 días.

### Maestro de artículos

- `sku_master` consultado por demanda con caché de sesión.
- Carga administrativa por lotes desde Ajustes.

### Excel de respaldo

- Carga y generación de respaldos y hojas de salida.

## Próximas funcionalidades

| Sprint | Alcance | Estado | Prioridad |
| --- | --- | --- | --- |
| 3 — Validaciones de negocio | SKU duplicados, promociones sin precio o descuento, combos sin principal, recompensas sin grupo, cantidades inconsistentes, reglas por canal/alcance/segmento | Pendiente / parcial | Alta |
| 4 — Auditoría avanzada | Filtros por usuario/fecha/entidad/operación, comparación de versiones, detalle legible por operación | Parcial (logs paginados) | Media |
| 5 — Notificaciones operativas | Envío por correo (Edge Function con las mismas reglas), recordatorios de comentarios abiertos, PDF final de Diseño | Parcial (v2 en vivo, cortes y estados automáticos) | Media |
| 6 — Integraciones documentales | Google Drive/Sheets, OneDrive o SharePoint si el negocio lo requiere | En espera | Media |
| 7 — Integración corporativa | SQL Server, Oracle, Dataverse, API corporativa; carga automática del maestro; carga directa para Pricing | Pendiente | Alta |

## Deuda técnica

- Componentes grandes: `PromosPage.jsx`, `CatalogDesignPage.jsx`, `FidelizacionPage.jsx`, `App.jsx`.
- Scripts SQL sin herramienta de migraciones; el orden se documenta en [docs/README.md](docs/README.md) y falta probar una instalación completa desde cero.
- Archivos legados en la raíz y en `apps-script/` pendientes de retirar.
- Falta un script `npm test` en `package.json`.

## Decisiones arquitectónicas vigentes

Mantener:

- React y Vite.
- Supabase como persistencia principal; RLS como capa real de seguridad.
- RPC transaccional para guardado.
- Excel como respaldo/exportación, con `PROMOCIONES` como tabla principal.
- `campanas` como entidad operativa de catálogos, actividades y solicitudes.
- Normalizadores para compatibilidad camelCase / snake_case / columnas históricas.

Evitar:

- Lógica Excel dentro de pantallas.
- Hojas separadas por comprador.
- Dependencias directas con Oracle antes de definir el contrato.
- Automatizaciones complejas antes de estabilizar reglas de negocio.
- Descargas completas de tablas grandes.
- Cambios de columnas Excel sin autorización.
- Refactors amplios no ligados a una solicitud.

## Riesgos abiertos

- Las reglas finales por tipo de promoción pueden requerir ajustes.
- La matriz de permisos del frontend y RLS deben mantenerse sincronizadas.
- Las exportaciones deben validarse con Pricing, Mercadeo y Planimetría antes de cerrar el contrato.
- La carga manual del maestro SKU depende de disciplina operativa.
- La concurrencia está controlada en promociones, Diseño y Fidelización; otros flujos podrían necesitarla si crece el uso simultáneo.
- Reejecutar scripts SQL antiguos puede revertir permisos; seguir el orden de [docs/README.md](docs/README.md).
