# Documentación técnica — índice

Actualizado: 2026-10-26.

Este índice es la referencia para ubicar guías y scripts SQL del proyecto. Los
parámetros generales (variables de entorno, puertos, roles, tablas, RPC) están en
el [README principal](../README.md); este documento no los repite.

## Guías vigentes

| Guía | Tema |
| --- | --- |
| [supabase_auth_rls_setup.md](supabase_auth_rls_setup.md) | Supabase Auth, URLs de redirección, alta de usuarios en `usuarios_app` y verificación de rol. |
| [maestro_sku_por_demanda.md](maestro_sku_por_demanda.md) | Consulta del maestro `sku_master` por demanda, caché de sesión y flujos cubiertos. |
| [promociones_anuladas.md](promociones_anuladas.md) | Regla de anulación lógica (`ANULADO`) y su efecto en grilla, exportaciones y auditoría. |
| [correo_auth_microsoft.md](correo_auth_microsoft.md) | Correos de Supabase Auth (recuperar contraseña, invitación) enviados por Microsoft 365 con el Send Email hook y la Edge Function `correo-auth`. |
| [notificaciones_envivo_flujo.md](notificaciones_envivo_flujo.md) | Notificaciones en vivo: eventos, destinatarios, sonido, tokens de color y límites de entrega. |
| [catalog-deadlines-broadcasts.md](catalog-deadlines-broadcasts.md) | Cuenta regresiva de cortes por catálogo y difusión administrativa. |
| [diseno_componentes.md](diseno_componentes.md) | Separación de componentes del módulo Diseño de Catálogos. |
| [diseno_respuestas.md](diseno_respuestas.md) | Respuestas (máximo dos) a observaciones de Diseño. |
| [reporte_seguimiento_disenos.md](reporte_seguimiento_disenos.md) | Reporte XLSX de seguimiento de diseños en Exportaciones. |
| [permisos_fidelizacion_ejecutor.md](permisos_fidelizacion_ejecutor.md) | Permisos de Fidelización por rol y cambio de estatus de solicitudes. |
| [fidelizacion_integrity.md](fidelizacion_integrity.md) | Reglas de integridad de descuentos y solicitudes de Fidelización. |
| [fidelizacion_orce.md](fidelizacion_orce.md) | Conciliación de IDs de ORCE desde el reporte `.xlsx`. |
| [resumen_fidelizacion.md](resumen_fidelizacion.md) | Pestaña de resumen de ofertas vigentes (ADMIN y OPER). |
| [margenes_promociones.md](margenes_promociones.md) | Monitoreo de márgenes: costos con el maestro, costo guardado por promoción, cálculo por tipo y semáforo. |
| [frontend_design_system_app_base.md](frontend_design_system_app_base.md) | Lenguaje visual base, reutilizable para otras apps. |
| [contexto_app_para_claude.md](contexto_app_para_claude.md) | Contexto resumido para asistentes externos. |

Históricos (solo consulta; no describen la operación actual):

- [plan_migracion_drive_supabase.md](plan_migracion_drive_supabase.md): migración desde Google Drive/Sheets (junio 2026).
- [`../apps-script/README.md`](../apps-script/README.md): API anterior sobre Google Sheets. Ya no la usa el frontend.

Plantilla de Excel: `plantilla_promo.xlsx`.

## Scripts SQL

Todos se ejecutan manualmente en **Supabase SQL Editor** con un usuario
propietario. No existe herramienta de migraciones; el frontend no aplica SQL.

### Orden recomendado para una base nueva

El orden sigue las dependencias que declara cada script en su encabezado.
No se ha comprobado aún una instalación completa desde cero con esta secuencia;
validar primero en un proyecto de prueba.

**1. Núcleo**

| # | Script | Crea / cambia |
| --- | --- | --- |
| 1 | `supabase_schema.sql` | Tablas base (`usuarios_app`, `compradores`, `configuracion`, `campanas`, `segmentos_clientes`, `promociones`, `promociones_detalle`, `comentarios`, `logs`, `notificaciones`), vistas `consolidado` y `export_*`, helpers. |
| 2 | `supabase_delta_operativo_2026_06_22.sql` | `responsables_solicitudes`, `jerarquia_categorias`, `avances_catalogo` y ajustes de estados. |
| 3 | `supabase_roles_permissions_mvp.sql` | Roles válidos, funciones `current_*`, `is_role`, RLS y auditoría. Crear antes los usuarios en Supabase Auth. |
| 4 | `supabase_special_request_status_cleanup.sql` | Estados de solicitudes especiales y estado `Archivado`. |
| 5 | `supabase_add_catalog_status_preliminar.sql` | Estado `Preliminar` en `campanas`. |
| 6 | `supabase_promociones_optimistic_concurrency.sql` | Versión de fila para conflictos de promociones. |
| 7 | `supabase_require_activity_id.sql` | Obliga `actividad_id` en campañas. |
| 8 | `supabase_transactional_save_rpc.sql` | `save_operations` y RPC `save_catalog_transactional`. |
| 9 | `supabase_hotfix_estado_registro_delta_rpc.sql` | Condicional: solo si la RPC aún rechaza `REGISTRADO`/`ANULADO`. |
| 10 | `supabase_lazy_loading_promotions.sql` | Índices y vistas para carga de promociones bajo demanda (`v_catalogos_operativos`, `v_catalogo_resumen`). |
| 11 | `supabase_add_numero_pagina.sql` | Columna `numero_pagina` y recreación de vistas. |
| 12 | `supabase_sku_master.sql` | ⚠ Ejecuta `DROP TABLE sku_master CASCADE` y recrea la tabla con sus RPC. Usar solo en instalación o recreación intencional; luego recargar el maestro desde Ajustes. |

**2. Notificaciones**

| # | Script | Crea / cambia |
| --- | --- | --- |
| 13 | `supabase_live_notifications.sql` | `notificaciones_envivo`, RPC `create_live_notification` y publicación Realtime. |
| 14 | `supabase_catalog_deadlines_broadcasts.sql` | Estado `Precios Finales` en catálogos (`campanas`) y RPC `send_admin_broadcast` (solo ADMIN). |

`supabase_notificaciones_disenadores_catalogo.sql` contiene la misma versión de
`create_live_notification` que `supabase_live_notifications.sql`, sin la
publicación Realtime. No es necesario si el paso 13 está aplicado.

**3. Diseño de catálogos**

| # | Script | Crea / cambia |
| --- | --- | --- |
| 15 | `supabase_catalogo_diseno.sql` | Proyectos, páginas, comentarios, `catalogo_consolidado_final` y buckets privados `sns_app_promo` y `catalogo_final`. |
| 16 | `supabase_catalogo_diseno_fix_fecha_actualizacion.sql` | Corrección del trigger de fecha de actualización (repetible). |
| 17 | `supabase_catalogo_diseno_versiones.sql` | `catalogo_pagina_versiones` y `version_actual`. |
| 18 | `supabase_catalogo_diseno_versiones_seguras.sql` | RPC `register_catalog_design_version` y políticas de storage. |
| 19 | `supabase_catalogo_diseno_categorias.sql` | Categorías de observaciones usadas por la interfaz. |
| 20 | `supabase_catalogo_diseno_operaciones_atomicas.sql` | `catalogo_diseno_operaciones`, RPC `save_catalog_design_project` y `review_catalog_design_page`. |
| 21 | `supabase_catalogo_respuestas.sql` | `catalogo_pagina_respuestas`. Requerido por el frontend actual de Diseño. |
| 22 | `supabase_catalogo_diseno_fecha_estado.sql` | Fecha exacta del último cambio de estado. |

**4. Fidelización**

| # | Script | Crea / cambia |
| --- | --- | --- |
| 23 | `supabase_fidelizacion_schema.sql` | `canasto_fidelizacion`, `fidelizacion_solicitudes_detalle` y RPC base. |
| 24 | `supabase_permissions_hardening.sql` | Endurece permisos (Fidelización y cabeceras de `campanas`); RPC `cambiar_estado_solicitud`. |
| 25 | `supabase_fidelizacion_integrity.sql` | Validaciones de integridad y creación masiva por lotes. |
| 26 | `supabase_fidelizacion_orce.sql` | `fidelizacion_orce_importaciones`, `fidelizacion_orce_historial` y RPC `conciliar_fidelizacion_orce`. |
| 27 | `supabase_admin_fidelizacion.sql` | Consulta y cambio de estado para ADMIN. |
| 28 | `supabase_admin_orce.sql` | Conciliación ORCE para ADMIN. |

No volver a ejecutar `supabase_fidelizacion_schema.sql` después de los pasos
24–28: reinstala versiones anteriores de las RPC y políticas.

**5. Notificaciones v2**

| # | Script | Crea / cambia |
| --- | --- | --- |
| 29 | `supabase_notificaciones_v2.sql` | Calendario automático de catálogos (Borrador → Preliminar → Precios Finales), aviso único de corte, avisos por triggers (estado/vigencia del catálogo, asignaciones y respuestas de Diseño), destinatarios calculados en el servidor en `create_live_notification`, limpieza 30/90 días y tareas `pg_cron`. Requiere habilitar la extensión `pg_cron`. |

Después del paso 29 no volver a ejecutar `supabase_live_notifications.sql` ni
`supabase_notificaciones_disenadores_catalogo.sql`: reinstalarían la versión
anterior de `create_live_notification`. Si se ejecutan por error, volver a
ejecutar el paso 29.

**6. Diseño: directorio de usuarios**

| # | Script | Crea / cambia |
| --- | --- | --- |
| 30 | `supabase_catalogo_diseno_directorio_usuarios.sql` | RPC `catalog_design_user_directory` (id, nombre, rol y activo de diseñadores, ADMIN/MARK y autores de comentarios). Permite que compradores y diseñadores vean quién trabaja sus páginas sin abrir `usuarios_app`. Repetible, no destructivo. |
| 31 | `supabase_notificaciones_correo.sql` | Correos por Microsoft 365: tablas `notificaciones_correo` y `notificaciones_correo_tipos`, trigger sobre `notificaciones_envivo`, RPC `claim_email_batch`/`mark_email_result` (solo service_role) y tareas `pg_cron`. Requiere pg_cron, pg_net, secretos en Vault y la Edge Function `supabase/functions/enviar-correos`. Guía: [notificaciones_correo.md](notificaciones_correo.md). Repetible, no destructivo. |
| 32 | `supabase_notificaciones_grupos.sql` | Destinatarios configurables (roles, grupos y comprador dueño) en `notificaciones_eventos`, `notificaciones_grupos`, `notificaciones_grupo_miembros` y `notificaciones_suscripciones`; avisos por trigger al crear o cambiar de estado solicitudes especiales y de Fidelización; RPC de administración para Ajustes > Notificaciones. Repetible, no destructivo. |

**7. Márgenes**

| # | Script | Crea / cambia |
| --- | --- | --- |
| 33 | `supabase_margenes_promociones.sql` | `sku_costos`, `promociones_costo` (sin acceso REST), trigger que guarda el costo al crear la promoción o cambiar su SKU, parámetros `TASA_CAMBIO_USD` y `MARGEN_SEMAFORO`, RPC `consultar_margenes_promociones` y `completar_costos_promociones`. Reinstala `clear_sku_master`, `insert_sku_master_batch` (ahora con costos y solo ADMIN) y `get_sku_master_summary`. Requiere pasos 1–3 y 12. Repetible, no destructivo. Guía: [margenes_promociones.md](margenes_promociones.md). |
| 34 | `supabase_fix_sku_master_timeout.sql` | Hotfix de timeout (57014): `clear_sku_master` con `TRUNCATE TABLE` instantáneo y `statement_timeout = '60s'` en las RPC de recarga y completado de costos. Requiere paso 33. Repetible, no destructivo. |

**8. Clasificación ABC del maestro**

| # | Script | Crea / cambia |
| --- | --- | --- |
| 35 | `supabase_clasificacion_abc.sql` | `clasificacion_abc_catalogo` (1 AA … 11 Quebrada), `sku_clasificacion_abc` (clasificación por SKU, lectura para autenticados, escritura solo por RPC; no se borra al recargar el maestro), vista `sku_master_abc` (maestro + clasificación; sin clasificación = 8 Nuevo desde el paso 36), RPC `cargar_clasificacion_abc_lote`, `aplicar_clasificacion_abc` (solo ADMIN) y `get_clasificacion_abc_resumen`. Requiere pasos 12 y 33. Repetible, no destructivo. |
| 36 | `supabase_clasificacion_abc_default_nuevo.sql` | Corrige el valor por defecto de la clasificación ABC: los SKU sin clasificación pasan a 8 (Nuevo) en vez de 3 (Descontinuado). Reinstala la vista `sku_master_abc` y `get_clasificacion_abc_resumen` (nuevo campo `maestro_sin_clasificacion`). No modifica datos. Requiere paso 35. Repetible, no destructivo. |

Si se vuelve a ejecutar el paso 12 (`supabase_sku_master.sql`), ejecutar de nuevo el
paso 33 y 34: el paso 12 reinstala las RPC del maestro sin costos ni TRUNCATE.

**9. Rendimiento**

| # | Script | Crea / cambia |
| --- | --- | --- |
| 37 | `supabase_rls_rendimiento_promociones.sql` | Reemplaza la política SELECT de `promociones` envolviendo `is_any_role`, `is_role` y `current_buyer_scope_ids` en `(SELECT ...)` para que se evalúen una vez por consulta y no por fila. Mismos permisos. Acelera la carga inicial de la app. Repetible, no destructivo. Si se vuelve a ejecutar `supabase_schema.sql` o `supabase_restaurar_permisos_rls.sql`, ejecutar de nuevo este paso. |
| 38 | `supabase_save_rpc_rendimiento.sql` | Optimiza `save_catalog_transactional` para guardados grandes (6.000 SKU: 9,4 s → 4,1 s en Postgres 16): ids cambiados en jsonb, respuesta armada al final, campaña consultada una vez por actividad y validación de detalles en bloque. Misma firma y reglas. Complementa el guardado por partes del frontend (`saveChunks.js`, 500 promociones por llamada). Repetible; repetir si se vuelve a correr el paso 8. |
| 39 | `supabase_guardia_borrado_promociones.sql` | Trigger `promociones_guard_bulk_delete`: rechaza (y revierte todo el guardado) cualquier sentencia de la app que borre más de 20 promociones y más del 10 % de una actividad, salvo que la app envíe el encabezado `x-promo-allow-bulk-delete: true` tras la confirmación explícita del usuario. No afecta SQL Editor, service_role ni el borrado en cascada de una campaña completa. La misma regla está en `src/app/sync/deleteGuard.js`. Repetible, no destructivo. |
| 40 | `supabase_carga_por_campana.sql` | Vistas `v_seguimiento_resumen` (totales por campaña para Seguimiento) y `v_comentarios_actividad_abiertos` (alerta de comentarios en Inicio), con `security_invoker`, e índice `promociones(campana_id, id)`. Las usa la carga por campaña (`VITE_CARGA_POR_CAMPANA=true`). Repetible, no destructivo. Rollback: `supabase_carga_por_campana_rollback.sql` (solo con la bandera apagada). |
| 41 | `supabase_combo_aires.sql` | Tipo de promoción **AIRES** (aire acondicionado = varias piezas con SKU propio): agrega `AIRES` a la regla de promociones complejas y crea la RPC `calcular_pesos_aires` (ADMIN y BUYER), que devuelve el peso por costo (AV_COST) de cada pieza sin exponer el costo. Sin este paso la app reparte el precio por precio regular y lo avisa en la vista previa. Requiere pasos 1–3 y 33. Repetible, no destructivo. Guía: [combo_aires.md](combo_aires.md). |

### Despliegue corporativo multi-esquema (`g_comercial`)

Para instalar el Gestor Comercial en un proyecto compartido con otras aplicaciones dentro del esquema aislado `g_comercial`:

| Script | Uso | Riesgo |
| --- | --- | --- |
| `supabase_g_comercial_consolidado.sql` | Despliegue unificado completo (pasos 1–41) adaptado a `g_comercial`. | No destructivo sobre `public`. |
| `supabase_g_comercial_parte1.sql` | Parte 1: Núcleo, tablas base, módulo de diseño y storage (pasos 1–21). | No destructivo. |
| `supabase_g_comercial_parte2.sql` | Parte 2: Fidelización, Notificaciones v2, Márgenes, ABC, Rendimiento y RPCs (pasos 22–39). | No destructivo. |
| [supabase_g_comercial_logs_legibles.sql](supabase_g_comercial_logs_legibles.sql) | Auditoría más clara y liviana: el trigger `audit_business_row_change` guarda en UPDATE solo los campos cambiados, omite re-guardados sin cambios, agrega `contexto.ref` (SKU, descripción, actividad), registra `CAMBIO_ESTADO` en solicitudes especiales y evita el error de llave foránea al borrar líneas o campañas. Crea la RPC `consultar_logs` (ADMIN y AUD). Ejecutar después del consolidado y repetir si se vuelve a correr. | Repetible, no destructivo. No modifica logs existentes. |
| [supabase_g_comercial_aud_sin_diseno.sql](supabase_g_comercial_aud_sin_diseno.sql) | Quita al Auditor (`AUD`) la lectura de Diseño de Catálogos: proyectos, páginas, versiones, comentarios, consolidado final y archivos de Storage. Ejecutar después del consolidado (o de la parte 1) y repetir si se vuelven a correr. | Repetible, no destructivo. |
| [supabase_g_comercial_segmentos_por_sku.sql](supabase_g_comercial_segmentos_por_sku.sql) | Segmentos por SKU en solicitudes especiales: afloja la regla `promociones_alcance_segmento` (una fila con alcance `SEGMENTO` ya no tiene que llevar exactamente el segmento de la solicitud; basta con que tenga al menos uno). Solo hace falta para editar segmentos de solicitudes viejas creadas con alcance "Segmento de clientes"; las nuevas se guardan como canal con segmentos por SKU. Ejecutar después del consolidado (o de la parte 1) y repetir si se vuelven a correr. Guía: [segmentos_por_sku.md](segmentos_por_sku.md). | Repetible, no destructivo. No modifica datos. |
| [supabase_g_comercial_especiales_visibilidad.sql](supabase_g_comercial_especiales_visibilidad.sql) | Visibilidad de solicitudes especiales: Admin y Ejecutor ven todas; cada Comprador solo las que pidió él o un comprador de su alcance; Marketing, Auditor y Diseñador no las ven (encabezado, líneas ni comentarios). Agrega políticas restrictivas de lectura en `campanas`, `promociones` y `comentarios` y la función `especial_campana_ids()`. No cambia crear, editar ni cambiar estado. Ejecutar después del consolidado. | Repetible, no destructivo. |
| [supabase_g_comercial_responsables_especiales.sql](supabase_g_comercial_responsables_especiales.sql) | Responsable de solicitudes especiales: crea la RPC `solicitudes_responsables_directory()` (security definer) que devuelve solo id, nombre y rol de los usuarios activos ADMIN y OPER, para que el campo Responsable liste personas en lugar de los equipos de `responsables_solicitudes`. No abre `usuarios_app` ni cambia políticas. Ejecutar después del consolidado y antes de publicar el frontend. | Repetible, no destructivo. |
| [supabase_g_comercial_notificaciones_responsable.sql](supabase_g_comercial_notificaciones_responsable.sql) | Avisos (campana y correo) al responsable asignado de solicitudes especiales y Fidelización: destino nuevo «Responsable asignado» en Ajustes > Notificaciones para los eventos de cambio de estado (marcado de inicio la primera vez). El responsable es el usuario ADMIN/OPER activo cuyo nombre coincide con `campanas.responsable`. También avisa al nuevo responsable cuando se reasigna sin cambiar estado. Reemplaza `notify_special_request_change`, `subscription_user_ids` (agrega `p_responsable_ids`), `set_notification_subscriptions` (agrega `p_responsable`; si llega null conserva la configuración) y el trigger `notify_special_request_state`. Ejecutar después del consolidado y de `supabase_g_comercial_responsables_especiales.sql`; repetir si se vuelve a correr el consolidado. | Repetible, no destructivo. |
| [supabase_g_comercial_notificaciones_especiales.sql](supabase_g_comercial_notificaciones_especiales.sql) | Solicitudes especiales y Fidelización: cargar, editar, anular o eliminar promociones (`PROMOCION_*`) no genera aviso ni correo (desde 03-11-2026); los comentarios de Compras van a Ejecutor (OPER) y ADMIN en lugar de caer a Mercadeo. Reemplaza `create_live_notification` (misma firma). Catálogos y Diseño sin cambios. Ejecutar después del consolidado y repetir si se vuelve a correr. | Repetible, no destructivo. |
| [supabase_g_comercial_notificaciones_estados_solicitud.sql](supabase_g_comercial_notificaciones_estados_solicitud.sql) | Solicitudes especiales y Fidelización: elegir en Ajustes > Notificaciones en qué estados se avisa («Avisar al pasar a»; de inicio Aprobado y Finalizado). Agrega `notificaciones_eventos.admite_estados` y `estados_aviso` (null = todos), la RPC `set_notification_event_states` y reemplaza `notify_special_request_change`. «Nueva solicitud» y la reasignación de responsable siguen avisando. Ejecutar después de `supabase_g_comercial_notificaciones_responsable.sql`; repetir si se vuelve a correr ese script o el consolidado. | Repetible, no destructivo. |
| [supabase_g_comercial_especiales_cambio_fecha_fin.sql](supabase_g_comercial_especiales_cambio_fecha_fin.sql) | Solicitudes especiales: el guardado de un comprador ya no pisa estado, responsable, fechas/horas de cada estado ni IDs de promo/oferta (trigger `special_request_buyer_guard`). Si el comprador cambia la fecha fin de una especial Aprobada o Finalizada, pasa a «En trabajo» con el mismo responsable sumando las horas del tramo anterior (sin reiniciarlas). Nuevo evento `SOLICITUD_VIGENCIA` (de inicio: rol OPER + responsable, con correo) para cualquier cambio de fecha fin. No aplica a Fidelización (`FID-`). Ejecutar después de `supabase_g_comercial_notificaciones_responsable.sql`. | Repetible, no destructivo. Reversa al final del archivo. |
| [supabase_g_comercial_avisos_al_salir_de_borrador.sql](supabase_g_comercial_avisos_al_salir_de_borrador.sql) | Al pasar un catálogo de Borrador a Preliminar, Precios Finales o Activo (a mano o por calendario) enciende sus «Notificaciones en vivo», y con ellas los correos. Trigger BEFORE UPDATE `catalog_enable_notifications_on_leave_draft` en `campanas`; el aviso de ese mismo cambio de estado ya sale. Borrador → Cerrado no enciende; si después se apagan, no se vuelven a encender. Ejecutar después del consolidado y repetir si se vuelve a correr. Reversa al final del script. | Repetible, no destructivo. |
| [supabase_g_comercial_fidelizacion_buyer_id.sql](supabase_g_comercial_fidelizacion_buyer_id.sql) | Fidelización por ID de comprador: `canasto_fidelizacion` y `fidelizacion_solicitudes_detalle` guardan `buyer_id` (FK a `compradores.id`) y se elimina la columna de texto `comprador`. Copia el nombre actual a `buyer_id` (por nombre o `comprador_id`; en el detalle, si no coincide, usa el comprador de la solicitud) y se detiene sin cambiar nada si un nombre del canasto o de una solicitud pendiente no existe en Compradores. Permisos por `buyer_id` con el mismo alcance Senior/Junior (`current_buyer_scope_ids`), evaluado una vez por consulta. Reemplaza `guard_fidelizacion_rows`, `fidelizacion_sku_allowed`, `crear_solicitud_fidelizacion`, `finalizar_solicitud_fidelizacion` y elimina `fidelizacion_owner_allowed(text)`. Publicar junto con el frontend que lee `buyer_id`. Reversa: [supabase_g_comercial_fidelizacion_buyer_id_rollback.sql](supabase_g_comercial_fidelizacion_buyer_id_rollback.sql). Ejecutar después del consolidado y repetir si se vuelve a correr. | Repetible. **Destructivo**: borra la columna `comprador` del canasto y del detalle (queda en `buyer_id`; el rollback la recupera). |

### Scripts de utilidad (no forman parte de la instalación)

| Script | Uso | Riesgo |
| --- | --- | --- |
| `supabase_catalogo_diseno_auditoria.sql` | Consulta el despliegue real del módulo Diseño. | Solo lectura. |
| `supabase_restaurar_permisos_rls.sql` | Recuperación de emergencia de funciones `current_*` y políticas base. | Sobrescribe políticas de `campanas` y otras tablas. Después, volver a aplicar los pasos 24–28. |
| `supabase_reset_operational_data.sql` | Borra datos operativos (no estructura). | ⚠ Destructivo. Respaldar y probar primero en una base de pruebas. |
| [supabase_reset_operational_data_corregido.sql](supabase_reset_operational_data_corregido.sql) | Variante para SQL Editor que también vacía `logs`; suspende los protectores de Fidelización y de actualización de logs dentro de la transacción y restaura su estado original. Ejecutar completa y sola, en lugar del bloque de limpieza anterior, como propietario y con escritores detenidos. Verifica conteos antes del COMMIT y los muestra como NOTICE, sin tablas temporales. | ⚠ Destructivo: elimina datos operativos y auditoría. Respaldar y probar primero; conserva maestros, canasto y Storage. |
| `supabase_seed_from_drive_export.sql` | Carga histórica desde la exportación de Drive. Generado por `scripts/generate_supabase_seed_sql.py`. | Histórico; no usar en la operación diaria. |

### Una base existente

En una base ya operativa, ejecutar solo el script nuevo o corregido que indique
la guía de la funcionalidad, respetando las dependencias de su encabezado. Los
scripts de módulo son en general repetibles, salvo los marcados con ⚠.

## Mantener esta documentación

- Al agregar un script SQL, añadirlo a este índice con su posición y dependencias.
- Al agregar una guía, enlazarla en la tabla de guías vigentes.
- Si cambia una variable de entorno, un rol, una tabla o una RPC usada por el
  frontend, actualizar el [README principal](../README.md) y
  [contexto_app_para_claude.md](contexto_app_para_claude.md).
