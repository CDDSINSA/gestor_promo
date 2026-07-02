# ROADMAP - Sistema de Gestion de Promociones Retail

## Estado General

Version actual: MVP v0.2

Objetivo principal: digitalizar y estructurar el proceso de creacion, revision y consolidacion de promociones comerciales, manteniendo Excel como respaldo/exportacion y Supabase como persistencia operativa del MVP.

## Funcionalidades Implementadas

### Diseno UX/UI

Estado: Completado

- Home con modulos principales.
- Diseno responsive.
- Paleta corporativa inspirada en SINSA.
- Navegacion lateral.
- Dashboard inicial.
- Cards de catalogos.

### Gestion de Promociones

Estado: Completado MVP operativo

- Promociones simples.
- Promociones complejas.
- Grilla tipo Excel.
- Carga de archivo comprador ERP para SKU de trabajo.
- Pegado masivo.
- Vista previa de pegado masivo.
- Validaciones visuales.

### Consolidado

Estado: Completado MVP operativo

- Vista unificada.
- Filtro por comprador.
- Filtro por tipo de promocion.
- Metricas generales.

### Comentarios de Mercadeo

Estado: Completado MVP operativo

- Comentarios por SKU.
- Comentarios generales por actividad.
- Estado Abierto.
- Estado Resuelto.
- Reapertura de comentarios.
- Filtros por estado.

### Modelo de Datos Excel

Estado: Completado

Hojas definidas:

- CONFIG
- COMPRADORES
- NOTIFICACIONES
- PROMOCIONES
- COMENTARIOS
- LOGS
- CONSOLIDADO
- EXPORT_PRICING
- EXPORT_MERCADEO
- EXPORT_PLANIMETRIA

### Servicio Excel

Estado: Completado como respaldo/exportacion

Archivo:

src/services/excelService.js

Incluye:

- Lectura de Excel.
- Escritura de Excel.
- Generacion de consolidado.
- Exportaciones.
- Validaciones basicas.

### Servicio Supabase

Estado: Completado MVP operativo

Archivo:

src/services/supabaseService.js

Incluye:

- Login de entrada con Supabase Auth.
- Carga de catalogo desde Supabase.
- Guardado incremental con mutaciones atomicas.
- Paginacion interna para lecturas grandes.
- Consulta paginada de logs bajo demanda.
- Uso de usuario tecnico para sincronizacion de datos del MVP.

### Logs

Estado: Completado MVP operativo

- La pestana Logs no descarga datos al cargar el catalogo.
- Boton Consultar.
- Paginacion de 25, 50 o 100 filas.
- Navegacion Anterior / Siguiente.
- Separacion entre logs consultados en pantalla y logs nuevos pendientes de sincronizar.

### Seguridad

Estado: Completado base

- Login con Supabase Auth.
- Cierre de sesion desde la barra lateral.
- Todos los usuarios autenticados tienen acceso a todos los modulos por ahora.
- Roles y permisos quedan pendientes para una fase posterior.

## En Desarrollo

### Integracion Real con Excel

Estado: Completado base / mantenimiento

Objetivos:

- Cargar plantilla Excel.
- Leer datos reales.
- Guardar cambios reales.
- Regenerar hojas automaticamente.

Criterio de aceptacion:

- Abrir archivo.
- Modificar promociones.
- Guardar.
- Ver cambios reflejados en Excel.

### Sincronizacion Supabase

Estado: En mejora continua

Objetivos:

- Mantener mutaciones atomicas.
- Evitar descargas completas innecesarias.
- Preparar filtros por vigencia, estado y catalogo.
- Mantener compatibilidad con migracion futura a SQL Server o API corporativa.

## Proximas Funcionalidades

### Sprint 3 - Validaciones de Negocio

Estado: Pendiente

- SKU duplicados.
- Promociones sin precio.
- Promociones sin descuento.
- Combos sin principal.
- Recompensas sin grupo.
- Inconsistencias de cantidades.

Prioridad: Alta

### Sprint 4 - Historial Avanzado

Estado: Parcial

- Implementado: logs consultables bajo demanda con paginacion.
- Pendiente: ver diferencias entre versiones.
- Pendiente: filtros avanzados por usuario, fecha y entidad.

Prioridad: Media

### Sprint 5 - Notificaciones

Estado: Pendiente

- Correos automaticos.
- Notificaciones por comentario.
- Notificaciones por cambios.

Prioridad: Media

### Sprint 6 - Integracion Drive / SharePoint

Estado: En espera

- Supabase queda como flujo principal de carga/guardado.
- Excel queda como respaldo/exportacion.
- Google Drive/Sheets, OneDrive y SharePoint quedan para evaluacion futura si negocio lo requiere.

Prioridad: Media

### Sprint 7 - Seguridad

Estado: Base implementada / roles pendientes

- Implementado: autenticacion con Supabase Auth.
- Pendiente: tabla/modelo de roles.
- Pendiente: permisos por modulo.
- Pendiente: auditoria por usuario final.

Prioridad: Alta

### Sprint 8 - Integracion Corporativa

Estado: Pendiente

- Oracle.
- SQL Server.
- Dataverse.
- APIs corporativas.

Prioridad: Alta

## Decisiones Arquitectonicas

Mantener:

- React.
- Excel como respaldo/exportacion y compatibilidad operativa.
- Supabase como persistencia principal del MVP.
- Arquitectura desacoplada.
- Consolidado generado automaticamente.
- PROMOCIONES como tabla principal.

Evitar:

- Logica Excel dentro de pantallas.
- Pestanas por comprador.
- Dependencias directas con Oracle.
- Automatizaciones complejas antes de estabilizar el MVP.
- Descargas completas innecesarias de tablas historicas grandes.
