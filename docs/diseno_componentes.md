# Componentes del módulo de Diseño

Se separaron el panel de comentarios, la lista de páginas, los formularios del
proyecto y el visor con sus anotaciones. Esta extracción conserva el HTML, las clases CSS, los textos, las
condiciones de permisos y los manejadores de eventos existentes.

## Archivos y responsabilidades

| Archivo en `src/features/catalogDesign/` | Responsabilidad |
| --- | --- |
| `DesignCommentsPanel.jsx` | Checklist, filtros, nueva observación, aprobación/rechazo, resolver/reabrir y respuestas mediante `CommentReplies`. |
| `DesignPageList.jsx` | Tira de miniaturas y tabla detallada; selección, carga de imágenes y controles de asignación/estado. |
| `DesignProjectSettings.jsx` | Configuración plegable y edición del proyecto: nombre, estado, fechas y cantidad de páginas. |
| `CreateDesignProjectModal.jsx` | Formulario de creación con catálogo base, fechas, cantidad y vista previa del nombre de página. |
| `designPresentation.jsx` | Constantes y utilidades compartidas de presentación: etiquetas, fechas, categorías y normalización de anotaciones. |
| `DesignViewerToolbar.jsx` | Navegación, zoom, herramientas de dibujo, enfoque y accesos a SKU, comentarios, carga y revisión. |
| `DesignImageViewer.jsx` | Superficie del visor, imagen, estados vacíos, indicaciones, tooltip y zona de arrastre. Recibe las referencias DOM originales. |
| `DesignAnnotationLayer.jsx` | Capa SVG de señales guardadas, borradores y señal activa; conexión con la selección de comentarios. |
| `renderAnnotation.jsx` | Dibujo SVG de rectángulos, elipses, trazos libres y pines numerados. |
| `annotationGeometry.js` | Coordenadas, dimensiones, colores, anclas y validación de señales útiles. |

`src/components/CatalogDesignPage.jsx` sigue coordinando estados, datos, permisos,
acciones y notificaciones. Pasa valores y funciones a estos componentes mediante
props. El paso 3 separó la presentación del visor y sus funciones puras. Los estados,
efectos de teclado/rueda y manejadores de dibujo, desplazamiento y carga siguen en
la página principal. La extracción a hooks corresponde al paso 4 y no se ha realizado.

Los componentes nuevos tienen menos de 600 líneas. La página principal se redujo
de unas 2.080 a unas 1.500 líneas en los pasos 1 y 2, y a unas 1.214 líneas en el
paso 3. Todavía supera ese límite; la separación gradual de la lógica sigue pendiente.

No hay dependencias nuevas ni cambios de esquema, servicios de persistencia,
reglas de negocio o estilos. La migración de respuestas documentada en
[Respuestas de Diseño](diseno_respuestas.md) sigue siendo requisito de esa función;
esta refactorización no agrega otra migración.

## Verificación

- Compilación con `npm run build`.
- Comparación estructural del JSX extraído contra el original: mismas condiciones,
  atributos y manejadores, salvo indentación y el fragmento sin nodo DOM de la lista.
- 16 renderizados estáticos de los cuatro componentes con variantes de permisos,
  formulario de comentario, configuración plegada y modos miniaturas/tabla.
- Paso 3: comparación estructural del JSX de los tres componentes del visor,
  seis renderizados de visor/barra con y sin imagen y modo de dibujo, comprobación
  de rectángulos/elipses/trazos libres, geometría, límites de zoom, selección de
  comentario y conexión de eventos de puntero/arrastre y referencias DOM.

Para la comprobación manual con sesión de usuario:

1. Abrir Diseño, cambiar filtros de observaciones, agregar un comentario y responder.
   Resolver/reabrir y comprobar que sus señales siguen seleccionándose en el visor.
2. Alternar miniaturas/tabla, seleccionar una página, cargar una imagen y verificar
   que la selección se conserva. Probar arrastrar una imagen a una miniatura.
3. Como ADMIN/MARK, cambiar asignaciones y estado desde la tabla; con usuario de
   lectura, comprobar que siguen mostrándose etiquetas en lugar de esos controles.
4. Crear un proyecto y revisar el catálogo, fechas, nomenclatura y cantidad inicial.
5. Editar y guardar configuración; comprobar el plegado y la restricción existente
   al reducir páginas con imágenes o comentarios.
6. En el visor, probar zoom con botones y Ctrl/Meta + rueda, desplazamiento por
   arrastre y tecla Espacio, navegación con flechas y enfoque con F/Escape.
7. Dibujar rectángulo, elipse y trazo libre; deshacer, guardar la observación y
   comprobar que las señales persisten. Pasar el puntero y seleccionar un pin para
   verificar el tooltip y la selección del comentario correspondiente.
8. Soltar un JPG/PNG sobre el visor con permiso de carga y comprobar la actualización
   de la página. Verificar los estados sin página seleccionada y sin imagen.

Las pruebas locales de renderizado no validan operaciones remotas ni interacción
real en navegador. No se efectuaron escrituras de prueba en Supabase.

## Etapa 3: versiones seguras y enlaces temporales

Aplicar `supabase_catalogo_diseno_versiones_seguras.sql` después del esquema base,
`supabase_catalogo_diseno_versiones.sql` y la corrección de fechas, antes de publicar
el frontend. La migración de categorías de la etapa 2 sigue siendo necesaria.
No ejecutar después el esquema antiguo de versiones, pues vuelve a abrir sus políticas.
Para inspeccionar el despliegue se incluye `supabase_catalogo_diseno_auditoria.sql`
(solo lectura). No se contrastaron las políticas remotas: el entorno únicamente
contiene la configuración pública del cliente, sin conexión administrativa.

Las cargas usan un UUID por archivo y no permiten sobrescribirlo. La RPC
`register_catalog_design_version` bloquea la página, asigna el siguiente número,
guarda el historial y actualiza el arte vigente en una transacción. Verifica la
asignación y que el archivo pertenezca a la sesión que lo cargó. Confirmar de nuevo
el mismo archivo es idempotente. El historial conserva sus rutas anteriores y la
lectura se verifica contra la página asignada (ADMIN/MARK/AUD pueden leer todas).
Las escrituras directas al historial y a las columnas de archivo de la página se
reemplazan por la RPC; otros campos conservan sus políticas existentes.

El archivo de Storage y la transacción SQL son operaciones distintas. Si la
confirmación falla, se informa al usuario para actualizar antes de reintentar.
No se elimina automáticamente el objeto: ante un timeout podría haberse confirmado.
Los archivos no registrados pueden quedar huérfanos y requieren revisión administrativa.
No se ocultan errores de historial ni se guardan comentarios descartando su versión.

`useDesignImageUrls.js` renueva enlaces cinco minutos antes de vencer, comprueba
cada minuto y al volver a la ventana, y ofrece reintento ante errores. El caché
se descarta al cambiar de conexión o conjunto de imágenes. Las comprobaciones
fallidas tienen una espera de un minuto para evitar bucles de peticiones.
Las URLs se generan con una vigencia de una hora; un enlace ya emitido puede seguir
siendo válido hasta su vencimiento después de cambiar una asignación.

Validación: pruebas locales de PostgreSQL mediante PGlite (instalado fuera del
proyecto, sin agregar dependencias a la aplicación), pruebas del servicio y caché,
y compilación. La prueba local no reproduce el servidor HTTP de Storage ni dos
sesiones remotas simultáneas. Tras aplicar el SQL, verificar con dos diseñadores,
un comprador y Mercadeo: cargas simultáneas, historial propio/ajeno, rechazo de
sobrescrituras y renovación tras una hora o suspensión de la pestaña.

## Etapa 4: guardados completos

Aplicar `supabase_catalogo_diseno_operaciones_atomicas.sql` después de las
migraciones de categorías y versiones seguras, antes del frontend de esta etapa.
No se ejecutó esta migración en la base remota.

`save_catalog_design_project` guarda los datos del proyecto y su cantidad de
páginas en una transacción. Rechaza reducciones que afecten imágenes, historial o
comentarios antes de guardar metadatos. Bloquea proyecto y páginas durante el
cambio y compara la fecha de actualización para evitar sobrescribir otra edición.
Conserva títulos y asignaciones existentes; genera solamente las páginas faltantes.

`review_catalog_design_page` bloquea la página y verifica permisos, versión y ruta
vigentes dentro de la transacción. El estado y el comentario se guardan juntos.
Las aprobaciones desde los selectores de estado también usan esta operación.
Los comentarios abiertos siguen sin bloquear una aprobación.

La tabla privada `catalogo_diseno_operaciones` conserva solicitud, actor y resultado
para reconocer reintentos. La interfaz bloquea acciones simultáneas; ante una
respuesta perdida vuelve a confirmar una vez con el mismo identificador. Mientras
se conserve la conexión en memoria, repetir el mismo contenido no cambia ese ID.
No se promete recuperar ese identificador tras recargar el navegador o cambiar de
conexión: si la confirmación sigue fallando, se debe actualizar y comprobar el
resultado antes de repetir. Los rechazos explícitos indican que no se guardaron
cambios; si el guardado fue confirmado y falla la recarga, se informa que solo
falta actualizar la vista. Las notificaciones continúan siendo posteriores al guardado.

La confirmación de imágenes reintenta la RPC idempotente sin volver a subir el
archivo. Storage y PostgreSQL siguen siendo operaciones separadas; pueden quedar
objetos sin registro si la confirmación falla definitivamente. El PDF final se
mantiene fuera de esta etapa, pues su interfaz corresponde a la etapa 5.

Pruebas locales: fallos forzados de creación de página y comentario, reversión de
metadatos al fallar el cambio de cantidad, edición desactualizada, permisos,
reintentos repetidos, versión incorrecta y aprobación con observaciones abiertas.
Después de desplegar, verificar creación, aumento/reducción y revisión desde dos
sesiones. No se han probado estas operaciones contra el servicio remoto real.
