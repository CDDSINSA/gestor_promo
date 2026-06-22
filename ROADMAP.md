# ROADMAP - Sistema de Gestion de Promociones Retail

## Estado General

Version actual: MVP v0.1

Objetivo principal: digitalizar y estructurar el proceso de creacion, revision y consolidacion de promociones comerciales.

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

Estado: Completado MVP visual

- Promociones simples.
- Promociones complejas.
- Grilla tipo Excel.
- Autocompletado de SKU mock.
- Pegado masivo.
- Vista previa de pegado masivo.
- Validaciones visuales.

### Consolidado

Estado: Completado MVP visual

- Vista unificada.
- Filtro por comprador.
- Filtro por tipo de promocion.
- Metricas generales.

### Comentarios de Mercadeo

Estado: Completado MVP visual

- Comentarios por SKU.
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

Estado: Completado base

Archivo:

src/services/excelService.js

Incluye:

- Lectura de Excel.
- Escritura de Excel.
- Generacion de consolidado.
- Exportaciones.
- Validaciones basicas.

## En Desarrollo

### Integracion Real con Excel

Estado: En progreso

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

## Proximas Funcionalidades

### Sprint 2 - Archivo Comprador ERP

Estado: Pendiente

- Reemplazar skuMaster mock.
- Cargar archivo comprador ERP.
- Crear catalogo SKU dinamico.
- Autocompletar descripcion, VPN y precio.

Prioridad: Alta

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

Estado: Pendiente

- Ver diferencias entre versiones.
- Consultar cambios por usuario.
- Consultar cambios por fecha.

Prioridad: Media

### Sprint 5 - Notificaciones

Estado: Pendiente

- Correos automaticos.
- Notificaciones por comentario.
- Notificaciones por cambios.

Prioridad: Media

### Sprint 6 - Integracion Drive

Estado: En progreso

- Google Drive via Apps Script y Google Sheets.
- Carga completa del catalogo desde la hoja compartida.
- Guardado completo y regeneracion de CONSOLIDADO y EXPORT_*.
- Excel queda como respaldo/exportacion.
- OneDrive y SharePoint quedan para evaluacion futura.

Prioridad: Media

### Sprint 7 - Seguridad

Estado: Pendiente

- Roles.
- Permisos.
- Autenticacion.

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
- Excel como almacenamiento temporal.
- Arquitectura desacoplada.
- Consolidado generado automaticamente.

Evitar:

- Logica Excel dentro de pantallas.
- Pestañas por comprador.
- Dependencias directas con Oracle.
- Automatizaciones complejas antes de estabilizar el MVP.
