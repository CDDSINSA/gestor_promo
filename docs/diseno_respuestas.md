# Respuestas a observaciones de Diseño

Cada observación admite **dos respuestas en total**, compartidas entre todos los
participantes. No son dos por usuario ni dos niveles de conversación. Las respuestas
se muestran debajo del comentario con autor y fecha; no tienen respuestas propias,
edición, eliminación ni estado independiente.

Responder no resuelve ni reabre una observación, no altera la página, los pines,
los contadores de observaciones, la aprobación ni las exportaciones.
Se puede responder también a una observación resuelta.

## Instalación

1. En Supabase ejecutar `docs/supabase_catalogo_respuestas.sql` después del esquema
   de Diseño (`docs/supabase_catalogo_diseno.sql`). Es una migración aditiva.
2. Publicar el frontend después de ejecutar el SQL. La carga de comentarios ahora
   incluye la relación `respuestas`; sin la migración la carga del módulo fallará.

No se modifican hojas ni columnas Excel. No se agregan dependencias.

## Arquitectura y permisos

- `src/features/catalogDesign/CommentReplies.jsx`: visualización, formulario,
  bloqueo de doble envío y manejo de conflictos. Reutiliza botones y estilos del módulo.
- `src/features/catalogDesign/commentReplies.css`: estilos locales de respuestas.
- `src/services/supabase/catalogDesignReplies.js`: consultas e inserción vía el
  cliente HTTP existente y su sesión autenticada.
- `src/services/supabase/catalogDesign.js`: carga de respuestas junto al comentario.
- `src/features/catalogDesign/DesignCommentsPanel.jsx`: integración visual de respuestas.
- `src/components/CatalogDesignPage.jsx`: coordinación y notificaciones existentes.
- `docs/supabase_catalogo_respuestas.sql`: persistencia y seguridad.

La tabla separada referencia exclusivamente comentarios originales. El número de
respuesta solo permite 1 o 2 y es único por comentario: incluso envíos concurrentes
o llamadas directas a la API no pueden crear una tercera respuesta. Si dos usuarios
ocupan simultáneamente el mismo número, uno recibe un aviso y se recargan las
respuestas; su borrador se conserva y puede reenviarlo si todavía queda espacio.

La lectura hereda la visibilidad del comentario mediante RLS. Pueden responder ADMIN,
MARK, el diseñador asignado y el comprador asignado, igual que al agregar comentarios.
Autor y fecha se generan en el servidor; el cliente no puede modificarlos. Las
notificaciones reutilizan el evento de comentario y sus destinatarios actuales.

Los archivos nuevos tienen menos de 600 líneas. La página principal superaba
2.000 líneas al incorporar respuestas. Posteriormente se extrajeron el panel de
comentarios, la lista y los formularios; ver [componentes de Diseño](diseno_componentes.md).

## Verificación manual con la migración aplicada

1. Abrir Diseño y una página con observaciones previas. Verificar sus textos,
   pines, filtros, contadores y acciones Resolver/Reabrir.
2. Pulsar Responder. Un texto vacío o solo espacios no se puede guardar.
3. Guardar la primera respuesta y recargar: deben persistir texto, autor y fecha.
4. Desde otro usuario autorizado agregar la segunda: se muestra 2/2 y desaparece
   Responder. Recargar para confirmar que ambas persisten.
5. Intentar el envío simultáneo desde dos sesiones cuando queda una sola respuesta:
   solo una debe guardarse y la otra debe recibir el aviso de límite alcanzado.
6. Verificar que un usuario sin asignación no pueda insertar por API, que no sea
   posible editar/eliminar respuestas ni insertar un número diferente de 1 o 2.
7. Responder a una observación resuelta: su estado debe permanecer resuelto.
8. Revisar en móvil que el texto largo y los botones no desborden la tarjeta.

La compilación local no sustituye estas verificaciones de RLS y concurrencia en
Supabase. Esta implementación no aplica automáticamente cambios a la base remota.

Verificación local realizada: `npm run build` correcto (aviso de paquetes mayores
de 500 kB). Prueba aislada del servicio con HTTP simulado: rechaza texto vacío y
comentario sin identificador, asigna los cupos 1 y 2, rechaza el tercero sin enviar
petición y no envía autor ni fecha desde el cliente.
