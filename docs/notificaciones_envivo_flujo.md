# Notificaciones en vivo

## Arquitectura

- `src/features/notifications/notificationEvents.js`: funciones puras para construir eventos y destinatarios.
- `src/features/notifications/deliverNotifications.js`: entrega de eventos y advertencias, independiente de React y del transporte.
- `src/services/supabase/notifications.js`: transporte a la RPC existente, consultas y lecturas.
- `useCatalogSync`: genera eventos despues del guardado confirmado de promociones/comentarios/ajustes.
- `CatalogDesignPage`: genera un evento despues de cada comentario, revision, cambio de estado o carga de imagen exitosa.
- `useLiveNotifications`: consulta inicial, INSERT/UPDATE por destinatario, recuperacion al reconectar, volver a la pestaña o recuperar red.
- `src/hooks/useNotificationSound.js`: habilitacion de audio tras interaccion y preferencia de sonido en `localStorage` (`sinsaPromo.notificationSound`).
- `src/features/notifications/notificationSound.js`: tono local, control de duplicados y limite de frecuencia, sin dependencias adicionales.
- `src/components/LiveNotifications.jsx`: campana flotante y panel mediante portal en `document.body`, con contador, control de sonido y cierre por teclado o clic fuera.

Se conserva el esquema existente. Requiere que `docs/supabase_live_notifications.sql` ya este instalado en Supabase, incluidos la RPC con destinatarios por comprador, RLS y la publicacion Realtime. Esta mejora no instala ni modifica la base remota.

## Destinatarios

| Evento | Destino |
| --- | --- |
| Promociones agregadas, modificadas, anuladas o eliminadas | Usuarios activos MARK, agrupadas por actividad y tipo de cambio |
| Comentario de Compras en Consolidado | MARK |
| Comentario de Mercadeo en Consolidado | Comprador de la fila; para comentarios generales, compradores identificados en las promociones cargadas de esa actividad y solicitante |
| Comentario/revision de Compras en Diseño | MARK y diseñador asignado |
| Accion de Mercadeo en Diseño | Comprador y diseñador asignados a la pagina |
| Accion del diseñador | MARK y comprador asignado |
| Ajustes de actividad guardados | MARK y BUYER, por cada actividad modificada |

La RPC excluye al autor y usuarios inactivos y respeta `campanas.notificaciones_envivo`. No se usa el rol BUYER como respaldo cuando falta un comprador especifico. Los identificadores de comentarios de Diseño van en metadata, nunca en la FK `comentario_id`, que pertenece a Consolidado.

### Mensajes de promociones

Los avisos indican accion, cantidad y nombre del catalogo/actividad (o su identificador si no hay nombre). Un guardado mixto produce un aviso por cada tipo de cambio y actividad, por ejemplo:

- Se agregaron 3 promociones en el catálogo «Septiembre». Favor revisar.
- Se modificaron 2 promociones en el catálogo «Septiembre». Favor revisar.
- Se eliminaron 2 promociones en el catálogo «Octubre». Favor revisar.
- Se anuló 1 promoción en el catálogo «Septiembre». Ya no está activa. Favor revisar.

La clasificacion compara el guardado con la instantanea previamente sincronizada. Se conserva ese contexto antes de actualizar las instantaneas; incluye actividad y estado para identificar filas eliminadas y transiciones a ANULADO. Una fila existente sin version se considera modificada, no nueva. Editar una fila ya anulada no vuelve a anunciar una anulacion.

Anular una promocion persistida conserva su registro y genera un aviso de anulacion. Las eliminaciones reales se identifican mediante `deleted_row_ids`. Retirar una fila nueva sin guardar no genera avisos, pues no hubo un cambio persistido. No se modifica la logica de eliminacion/anulacion ni los destinatarios. Los avisos historicos conservan su texto anterior.

## Validacion manual

1. Usar sesiones separadas de Compras y Mercadeo, con usuarios activos y notificaciones activadas en el catalogo.
2. En Consolidado crear un comentario, guardar y verificar el aviso del destinatario. Repetir resolviendo/reabriendo y en sentido Compras → Mercadeo.
3. En Diseño asignar comprador y diseñador a una pagina. Comentar, revisar, cambiar estado, subir imagen y resolver/reabrir un comentario. Cada accion exitosa debe emitir un aviso a sus destinatarios, excluyendo al autor.
4. Comprobar que otro comprador no asignado no recibe los comentarios de esa pagina/fila.
5. Interrumpir la red del receptor, generar un aviso desde otra sesion y reconectar. La campana debe recuperar el aviso guardado.
6. Marcar un aviso leido desde otra sesion del mismo usuario; el estado se debe actualizar sin un nuevo toast.
7. Cerrar sesion y entrar con otro usuario; no deben persistir avisos del anterior.
8. Si faltan destinatarios o falla la RPC, el guardado debe conservarse y mostrarse una advertencia. No repetir la accion de negocio para intentar reenviar el aviso.

Pruebas locales: `node --experimental-vm-modules --test tests/notificationEvents.test.mjs tests/useCatalogSync.test.mjs tests/useLiveNotifications.test.mjs tests/notificationSound.test.mjs` y `npm run build`.

## Sonido y acceso flotante

La campana queda fija en la esquina inferior derecha, sobre la navegacion movil. Muestra el contador y abre el mismo panel de avisos. Se cierra con Escape, al tocar fuera o con el boton Cerrar.

El boton de altavoz dentro del panel permite silenciar/activar el sonido y guarda la preferencia en ese navegador. El sonido es un tono breve generado localmente con Web Audio, solo para avisos nuevos recibidos en vivo; cargar historial, reconectar o marcar como leido no reproduce alertas antiguas. Las rafagas se limitan a un sonido cada 1,5 segundos.

El navegador requiere una primera interaccion (clic, toque o teclado) para habilitar audio. Si el navegador bloquea audio, el aviso visual sigue funcionando. No se reproduce con la app cerrada.

Para probar: interactuar con la app, enviar un aviso desde otra cuenta y verificar tono/contador. Silenciar, enviar otro aviso y verificar que aparezca sin sonido; recargar y comprobar que se mantiene silenciado. Revisar el boton al desplazar la pagina y en pantalla movil.

## Color de marca y tokens de la campana

El naranja SINSA se define una sola vez en el codigo como `--color-sinsa-orange` en `src/styles/base/variables.css`. Su valor de marca es `#F18A00`. El componente consume tokens semanticos; no debe repetir valores hexadecimales en sus reglas CSS ni en JSX.

| Token | Uso |
| --- | --- |
| `--notification-fab-background` | Fondo normal, vinculado al naranja SINSA |
| `--notification-fab-background-hover` | Fondo al pasar el puntero y mantener abierto el panel; mezcla de 90% naranja y 10% tinta |
| `--notification-fab-foreground` | Icono oscuro, vinculado a `--color-ink` |
| `--notification-fab-border` | Borde, mezcla de 70% naranja y 30% tinta |
| `--notification-fab-focus` | Anillo de foco visible para teclado, en tinta |
| `--notification-fab-shadow` | Sombra derivada del naranja con 25% de opacidad |

Las mezclas se derivan con `color-mix()` en los tokens. `src/styles/components/ui-elements.css` los aplica a la campana y `src/styles/layout/responsive.css` conserva su posicion sobre la navegacion movil y las areas seguras de la pantalla. Los avisos transitorios se posicionan por encima del boton. El contador conserva su estilo amarillo existente.

El icono oscuro tiene un contraste calculado de **7.12:1** sobre el fondo normal y **5.96:1** sobre el fondo hover/abierto. El foco mantiene un contorno de 3 px separado del boton. Esta comprobacion de colores no equivale a una auditoria completa de accesibilidad.

Para validar un cambio de paleta: revisar estado normal, con pendientes, hover y panel abierto; recorrer con Tab para comprobar el foco; verificar escritorio y movil. Modificar los tokens, manteniendo el contraste, sin cambiar dimensiones, posicion, destinatarios ni comportamiento del sonido.

## Limites de entrega

- La entrega sigue siendo posterior al guardado mediante la RPC existente. No hay cola persistente ni garantia de entrega si se cierra la pestaña o falla la red entre ambas operaciones. Las advertencias no implican reintento automatico.
- Los comentarios generales de Consolidado resuelven compradores desde los datos cargados; si se necesita cubrir participantes no cargados, debe trasladarse esa resolucion al servidor.
- La campana mantiene los 50 avisos recientes; su contador corresponde a esa ventana, no a todo el historial.
- Abrir un aviso navega al modulo; proyecto/pagina quedan identificados en el mensaje y metadata, sin alterar el flujo de navegacion actual.
- Consolidado conserva el guardado manual. Agregar/resolver localmente no envia avisos hasta guardar.
