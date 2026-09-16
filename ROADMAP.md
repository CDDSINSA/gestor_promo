# ROADMAP - Sistema de Gestion de Promociones Retail

## Estado General

Version actual: MVP v0.2.

Objetivo principal: digitalizar y estructurar el proceso de promociones comerciales, manteniendo Supabase como persistencia operativa del MVP y Excel como respaldo, importacion, exportacion y compatibilidad operativa.

El sistema ya no debe considerarse un prototipo solo basado en Excel. La direccion actual es:

1. Operacion diaria en Supabase.
2. Excel como respaldo y salida operativa.
3. Preparacion tecnica para una futura migracion a SQL Server, Oracle, Dataverse o API corporativa.

## Implementado

### Autenticacion, Sesion y Seguridad Base

Estado: Completado MVP operativo.

- Login con Supabase Auth.
- Recuperacion y restablecimiento de contrasena.
- Cierre de sesion desde la barra lateral.
- Perfil operativo desde `public.usuarios_app`.
- Roles normalizados en frontend: `ADMIN`, `BUYER`, `MARK`, `OPER`, `AUD`, `DISENADOR`.
- Proteccion visual por modulo mediante `ProtectedRoute`.
- RLS documentado y aplicado desde scripts SQL.
- Validacion de host Supabase mediante `VITE_SUPABASE_ALLOWED_HOSTS`.

Pendiente:

- Auditoria de permisos finales con usuarios reales.
- Reglas mas finas por accion si negocio las solicita.

### UX/UI y Layout

Estado: Completado base / mantenimiento.

- Navegacion lateral en escritorio.
- Navegacion movil.
- Barra superior de estado de base de datos y procesos.
- Diseno responsive.
- Paleta corporativa inspirada en SINSA.
- Modulos con carga diferida (`React.lazy`) para mejorar separacion y carga inicial.
- Estilos organizados en `src/styles/` por base, layout, componentes y paginas.

Pendiente:

- Revision visual final por perfiles reales.
- Ajustes menores de accesibilidad y consistencia visual.

### Gestion de Promociones

Estado: Completado MVP operativo.

- Grilla tipo Excel.
- Promociones simples.
- Promociones complejas.
- Pegado masivo.
- Vista previa de pegado masivo.
- Validaciones visuales y validacion previa a guardado.
- Anulacion logica de promociones guardadas.
- Consulta por demanda de SKU desde `sku_master`.
- Recarga de un alcance especifico de promociones desde Supabase cuando aplica.
- Manejo de conflictos de version mediante `PROMOTION_VERSION_CONFLICT`.

Pendiente:

- Endurecer reglas por tipo de promocion segun definicion final de negocio.
- Ampliar pruebas de promociones complejas.

### Promociones Especiales y Solicitudes

Estado: Completado MVP operativo.

- Creacion de promociones especiales.
- Gestion de solicitudes especiales.
- Carga bajo demanda de datos especiales desde Supabase.
- Responsables de solicitudes desde `responsables_solicitudes`.
- Integracion con comentarios y logs.

Pendiente:

- Cierre funcional con responsables reales y estados finales del proceso.
- Reglas adicionales de aprobacion si negocio las define.

### Fidelizacion

Estado: Completado MVP operativo.

- Modulo de fidelizacion.
- Tablas y RPC documentadas en `docs/supabase_fidelizacion_schema.sql`.
- Consulta de maestro SKU para los articulos requeridos.
- Flujo operativo para canastos y detalle de solicitudes.

Pendiente:

- Pruebas ampliadas con datos reales de fidelizacion.
- Reportes finales o exportaciones especificas si se requieren.

### Consolidado y Comentarios de Mercadeo

Estado: Completado MVP operativo.

- Vista unificada de promociones.
- Filtros por actividad/catalogo, comprador y tipo de promocion.
- Comentarios por SKU/promocion.
- Comentarios generales por actividad.
- Estados `Abierto` y `Resuelto`.
- Reapertura de comentarios.
- Guardado de comentarios hacia Supabase.
- Exportacion de consolidado en Excel.

Pendiente:

- Reglas finales de visibilidad para comentarios por comprador y actividad.
- Reportes de pendientes por area si negocio los solicita.

### Seguimiento y Avances

Estado: Completado MVP operativo.

- Vista de seguimiento tipo Gantt.
- Gestion de avances por catalogo, comprador y division.
- Persistencia en `avances_catalogo`.
- Relacion con actividades/campanas.

Pendiente:

- Definir estados definitivos de avance.
- Ajustar indicadores de cumplimiento si se formaliza un SLA.

### Diseno de Catalogos

Estado: Completado MVP operativo.

- Modulo de diseno de catalogos.
- Proyecto, paginas, comentarios y consolidado final en Supabase.
- Soporte de storage/politicas segun `docs/supabase_catalogo_diseno.sql`.
- Rol `DISENADOR` para carga/revision de paginas.

Pendiente:

- Validacion operativa con equipo de diseno.
- Reglas finales de aprobacion/publicacion.

### Exportaciones

Estado: Completado MVP operativo.

- Exportacion para Pricing.
- Exportacion para Mercadeo.
- Exportacion para Planimetria.
- Exportacion de Consolidado.
- Consultas desde Supabase con filtros.
- Generacion de archivos `.xlsx`.

Pendiente:

- Validacion final de columnas con cada area.
- Ajustes especificos para carga en Oracle si Pricing los confirma.

### Logs y Auditoria

Estado: Completado MVP operativo.

- Logs consultables bajo demanda.
- Paginacion de 25, 50 o 100 registros.
- Orden descendente por fecha.
- Separacion entre logs consultados y logs locales pendientes.
- Triggers/RPC de auditoria documentados en SQL.

Pendiente:

- Filtros avanzados por usuario, fecha, entidad, operacion y actividad.
- Vista de diferencias entre versiones si se requiere auditoria avanzada.

### Notificaciones en Vivo

Estado: Completado base.

- Tabla `notificaciones_envivo`.
- RPC `create_live_notification`.
- Cliente realtime con token del usuario autenticado.
- Panel de notificaciones y marcado como leido.

Pendiente:

- Reglas finales de eventos a notificar.
- Plantillas de mensaje por tipo de evento.
- Notificaciones por correo, si negocio lo solicita.

### Maestro de Articulos

Estado: Completado MVP operativo.

- Tabla `sku_master`.
- Consulta por demanda; no se descarga toda la tabla al abrir.
- Cache en memoria durante la sesion.
- Registro de SKU no encontrados.
- Importacion administrativa por lotes desde Ajustes.
- Fallbacks REST cuando faltan RPC auxiliares.

Pendiente:

- Definir frecuencia y responsable de actualizacion.
- Automatizar carga desde origen corporativo cuando exista integracion.

### Excel de Respaldo

Estado: Completado base / mantenimiento.

- Carga de respaldo desde Excel.
- Guardado/exportacion de respaldo.
- Generacion de hojas de salida.
- Mantenimiento de compatibilidad con usuarios acostumbrados a Excel.

Pendiente:

- Congelar contrato final de columnas.
- Documentar plantilla oficial si se estabiliza una version para usuarios.

## En Mejora Continua

### Sincronizacion Supabase

Objetivos:

- Mantener guardado transaccional.
- Evitar descargas completas innecesarias.
- Conservar idempotencia de operaciones.
- Reducir riesgo de sobreescritura por concurrencia.
- Mantener compatibilidad con futura API corporativa.

Archivos clave:

- `src/app/sync/syncOptions.js`
- `src/app/sync/savePayload.js`
- `src/hooks/useCatalogSync.js`
- `src/services/supabase/save.js`
- `docs/supabase_transactional_save_rpc.sql`
- `docs/supabase_promociones_optimistic_concurrency.sql`

### Permisos y RLS

Objetivos:

- Validar roles con usuarios reales.
- Alinear `src/constants/permissions.js` con politicas SQL.
- Evitar que el frontend prometa acciones que RLS no permita.
- Mantener lectura/escritura por alcance de comprador cuando aplique.

### Rendimiento

Objetivos:

- Mantener carga diferida por modulo.
- Seguir paginando lecturas grandes.
- Evitar descargar `sku_master` completo.
- Revisar chunks si el build empieza a impactar experiencia real.

## Proximas Funcionalidades

### Sprint 3 - Validaciones de Negocio

Estado: Pendiente / parcial.

- Deteccion de SKU duplicados segun regla final.
- Promociones sin precio.
- Promociones sin descuento.
- Combos sin principal.
- Recompensas sin grupo.
- Inconsistencias de cantidades.
- Validaciones especificas por canal, alcance y segmentacion.

Prioridad: Alta.

### Sprint 4 - Auditoria Avanzada

Estado: Parcial.

- Implementado: logs paginados bajo demanda.
- Pendiente: filtros avanzados.
- Pendiente: comparacion entre versiones.
- Pendiente: detalle legible por operacion transaccional.

Prioridad: Media.

### Sprint 5 - Notificaciones Operativas

Estado: Base implementada.

- Implementado: notificaciones en vivo dentro de la app.
- Pendiente: reglas finales por evento.
- Pendiente: notificaciones por correo.
- Pendiente: recordatorios por comentarios abiertos o actividades proximas.

Prioridad: Media.

### Sprint 6 - Integraciones Documentales

Estado: En espera.

- Supabase queda como flujo principal.
- Excel queda como respaldo/exportacion.
- Google Drive/Sheets, OneDrive o SharePoint quedan para evaluacion futura si negocio lo requiere.

Prioridad: Media.

### Sprint 7 - Integracion Corporativa

Estado: Pendiente.

- SQL Server.
- Oracle.
- Dataverse.
- APIs corporativas.
- Carga automatica del maestro de articulos.
- Exportacion/carga directa para Pricing si Oracle lo permite.

Prioridad: Alta.

## Decisiones Arquitectonicas Vigentes

Mantener:

- React y Vite.
- Supabase como persistencia principal del MVP.
- Excel como respaldo/exportacion.
- RPC transaccional para guardado.
- RLS como capa real de seguridad.
- `PROMOCIONES` como tabla principal del modelo Excel.
- `campanas` como entidad operativa para catalogos, actividades y solicitudes.
- Normalizadores para compatibilidad entre camelCase, snake_case y columnas historicas.

Evitar:

- Logica Excel embebida dentro de pantallas.
- Hojas separadas por comprador.
- Dependencias directas con Oracle antes de definir contrato.
- Automatizaciones complejas antes de estabilizar reglas de negocio.
- Descargas completas de tablas grandes.
- Cambios de columnas Excel sin autorizacion.
- Refactors amplios no ligados a una solicitud concreta.

## Riesgos Abiertos

- Las reglas finales de negocio por tipo de promocion pueden requerir ajustes adicionales.
- Las politicas RLS deben mantenerse sincronizadas con la matriz de permisos del frontend.
- Las exportaciones deben validarse con Pricing, Mercadeo y Planimetria antes de considerarse contrato cerrado.
- La carga manual del maestro SKU depende de disciplina operativa hasta que exista integracion corporativa.
- La concurrencia se maneja para promociones, pero otros flujos pueden necesitar reglas similares si aumenta el uso simultaneo.
