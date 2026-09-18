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
