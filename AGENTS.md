# Sistema de Gestion de Promociones Retail

## Objetivo del Proyecto

Desarrollar una aplicacion web que reemplace gradualmente el proceso actual de gestion de promociones comerciales basado en archivos Excel compartidos.

El objetivo inicial no es reemplazar Oracle ni los sistemas corporativos existentes. El MVP utiliza React y Excel como almacenamiento temporal, con arquitectura preparada para migracion futura a base de datos corporativa.

## Contexto del Negocio

* 9 compradores trabajan promociones comerciales.
* Cada comprador administra una linea o division de productos.
* Las promociones se preparan aproximadamente 15 dias antes de su vigencia.
* Mercadeo, Pricing y Planimetria dependen de la misma informacion.
* Actualmente el proceso usa archivos Excel compartidos y comunicacion informal por WhatsApp.

Problemas actuales:

* Cambios dificiles de rastrear.
* Consolidacion manual.
* Retrabajo en Mercadeo y Pricing.
* Falta de trazabilidad.
* Estructura no estandarizada.

## Usuarios

### Comprador

Crea, modifica y administra promociones de sus SKU.

### Mercadeo

Revisa promociones, elabora catalogos, agrega comentarios de revision y marca comentarios como abiertos o resueltos.

### Pricing

Utiliza exportaciones para configurar promociones en Oracle.

### Planimetria

Utiliza exportaciones para tickets, rotulos y exhibiciones.

### Administrador

Configura catalogos, compradores, notificaciones y conexiones futuras.

## Filosofia UX/UI

* Corporativa, sobria, moderna y profesional.
* Inspirada en identidad visual de SINSA.
* Responsive para escritorio y movil.
* Priorizar productividad sobre decoracion.

Paleta sugerida:

* Verde principal: #006B3F
* Verde oscuro: #004B2D
* Verde claro: #E8F5EE
* Celeste: #00A6C8
* Amarillo: #FFC72C

## Modulos del Sistema

* Inicio
* Promociones
* Consolidado
* Comentarios de Mercadeo dentro de Consolidado
* Logs
* Ajustes
* Exportaciones

## Estructura Excel

Hojas esperadas:

* CONFIG
* COMPRADORES
* NOTIFICACIONES
* PROMOCIONES
* COMENTARIOS
* LOGS
* CONSOLIDADO
* EXPORT\_PRICING
* EXPORT\_MERCADEO
* EXPORT\_PLANIMETRIA

La tabla principal debe ser PROMOCIONES. No usar hojas separadas por comprador.

## Reglas de Negocio

* SKU es obligatorio.
* Tipo de promocion es obligatorio.
* Promociones complejas requieren grupo\_oferta y tipo\_sku.
* Los comentarios abiertos no bloquean guardado, solo generan advertencias.
* CONSOLIDADO y EXPORT\_\* son vistas generadas, no deben editarse manualmente.

## Arquitectura

* Frontend: React.
* Persistencia temporal: Excel.
* Servicio Excel: src/services/excelService.js.
* Futuro: SQL Server, Oracle, Dataverse o API corporativa.

## Regla Fundamental

Todo desarrollo futuro debe respetar:

1. La estructura Excel definida.
2. El flujo Comprador -> Mercadeo -> Pricing -> Planimetria.
3. La capacidad de migrar posteriormente a una base de datos corporativa.
4. La simplicidad operativa para usuarios acostumbrados a Excel.





Instrucciones para Codex



&#x20;Uso eficiente de contexto



\- No analizar todo el repositorio salvo que se solicite.

\- Buscar primero los archivos más probables.

\- Leer únicamente los archivos relacionados con la tarea.

\- Evitar abrir archivos completos mayores a 500 líneas si no es necesario.

\- Priorizar modificaciones pequeñas y localizadas.



&#x20;Reglas de desarrollo



\- No refactorizar código que no esté relacionado con la solicitud.

\- No cambiar nombres de columnas Excel sin autorización.

\- No modificar la estructura de hojas definida.

\- No crear nuevas dependencias sin justificarlo.

\- Mantener compatibilidad con futura migración a SQL Server o API corporativa.



Al finalizar cada tarea



Indicar:



1\. Archivos modificados.

2\. Resumen de cambios.

3\. Cómo probarlos.

4\. Riesgos identificados.



Estrategia de trabajo



Antes de programar:



1\. Identificar el módulo afectado.

2\. Identificar archivos candidatos.

3\. Explicar brevemente el plan.

4\. Realizar cambios mínimos.

5\. Haz pruebas únicamente si son necesarias



Preferencias del proyecto



\- Priorizar simplicidad.

\- Priorizar mantenibilidad.



