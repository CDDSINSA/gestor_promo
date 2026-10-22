# Notificaciones en vivo

Actualizado: 2026-10-12.

## Arquitectura

- `src/features/notifications/notificationEvents.js`: funciones puras para construir eventos y destinatarios.
- `src/features/notifications/deliverNotifications.js`: entrega de eventos y advertencias, independiente de React y del transporte.
- `src/services/supabase/notifications.js`: transporte a la RPC existente, consultas y lecturas.
- `useCatalogSync`: genera eventos despues del guardado confirmado de promociones y comentarios.
- `CatalogDesignPage`: genera un evento despues de cada comentario, revision, cambio de estado o carga de imagen exitosa.
- `useLiveNotifications`: vista de no leídas/todas, paginación de 20, contador en servidor, INSERT/UPDATE por destinatario y recuperación al reconectar, volver a la pestaña o recuperar red.
- `src/hooks/useNotificationSound.js`: habilitacion de audio tras interaccion y preferencia de sonido en `localStorage` (`sinsaPromo.notificationSound`).
- `src/features/notifications/notificationSound.js`: tono local, control de duplicados y limite de frecuencia, sin dependencias adicionales.
- `src/components/LiveNotifications.jsx`: campana flotante y panel mediante portal en `document.body`, con contador, control de sonido y cierre por teclado o clic fuera.

Requiere `docs/supabase_live_notifications.sql` y, desde octubre 2026, `docs/supabase_notificaciones_v2.sql`, que reemplaza `create_live_notification` y agrega los avisos generados por la base de datos. Orden en [docs/README.md](README.md#scripts-sql).

### Dónde se decide cada aviso (v2)

- **El navegador** sigue avisando de promociones, comentarios de Consolidado y acciones de Diseño, pero solo indica el tipo de evento y el contexto (actividad, filas, página).
- **La función `create_live_notification`** valida que el rol del autor pueda emitir ese tipo de evento y **calcula los destinatarios en el servidor**; ignora los destinatarios que envíe el navegador. Rechaza tipos no permitidos (por ejemplo `ADMIN_DIFUSION`, `CATALOGO_ESTADO` o `AVISO_CORTE`, que solo genera el servidor). Recorta título (120) y mensaje (500).
- **Triggers de la base** generan, dentro de la misma transacción, los avisos de cambio de estado o vigencia del catálogo, asignaciones de página y respuestas. Un fallo del aviso nunca revierte la operación.
- **Tarea diaria (`pg_cron`, 00:05 Managua)** cambia estados por calendario y envía el aviso de corte.

## Destinatarios

| Evento | Tipo | Origen | Destino |
| --- | --- | --- | --- |
| Promociones agregadas, modificadas, anuladas o eliminadas | `PROMOCION_*` | Guardado (BUYER, ADMIN) | Diseñador de la página indicada en el N° de página de cada promoción. Si una promoción no tiene página o la página no tiene diseñador: diseñadores del catálogo. Si el catálogo no tiene diseñadores: Mercadeo (MARK). |
| Comentario de Compras en Consolidado | `COMENTARIO_COMPRAS` | BUYER | La misma regla anterior, más los usuarios de Mercadeo/ADMIN que ya comentaron esa promoción (o los comentarios generales de la actividad). |
| Comentario de Mercadeo en Consolidado | `COMENTARIO_MERCADEO` | MARK, ADMIN | Compradores indicados por la app, filtrados a los que tienen promociones en la actividad o son el solicitante. |
| Comentario, revisión, estado, imagen, resolver/reabrir en Diseño | `DISENO_*` | ADMIN, MARK, BUYER, DISENADOR | Diseñador de la página; comprador de la página si actúa alguien distinto de un comprador; MARK si actúa un comprador o un diseñador. |
| Respuesta a una observación de Diseño | `DISENO_RESPUESTA` | Trigger | Autor de la observación, quienes respondieron antes, diseñador y comprador de la página. |
| Asignación de comprador a una página | `DISENO_ASIGNACION` | Trigger | Comprador asignado; si se reasigna, también el comprador anterior. |
| Cambio de diseñador en una página | `DISENO_ASIGNACION` | Trigger | Comprador de la página. |
| Cambio de estado del catálogo (manual o automático) | `CATALOGO_ESTADO` | Trigger | Compradores de las divisiones del catálogo (todas si no tiene divisiones) y MARK. |
| Cambio de fechas de vigencia | `CATALOGO_VIGENCIA` | Trigger | Igual que el anterior. |
| Día de corte (preliminar, precios finales, imprenta) | `AVISO_CORTE` | Tarea diaria | Compradores de las divisiones y MARK. Aviso único por catálogo, hito y fecha, marcado como **Importante**. |
| Difusión | `ADMIN_DIFUSION` | ADMIN | BUYER, MARK y OPER activos. |
| Nueva solicitud especial / de Fidelización | `SOLICITUD_NUEVA`, `FIDELIZACION_NUEVA` | Trigger | **Configurable** en Ajustes > Notificaciones. Inicial: rol Ejecutor (OPER) y grupo «Supervisión de solicitudes». |
| Cambio de estado en el tablero de solicitudes | `SOLICITUD_ESTADO`, `FIDELIZACION_ESTADO` | Trigger | **Configurable**. Inicial: comprador dueño (`solicitante_buyer_id`) y grupo «Supervisión de solicitudes». |

Los eventos configurables se resuelven con `subscription_user_ids(tipo, dueños)` a partir de roles, grupos de notificación (usuarios de la app, sin correos escritos a mano) y el comprador dueño. No dependen de `campanas.notificaciones_envivo`. Script: `docs/supabase_notificaciones_grupos.sql` (paso 32).

Todos los avisos excluyen al autor y a usuarios inactivos, y respetan `campanas.notificaciones_envivo` (salvo la difusión, que no es de un catálogo). Guardar Ajustes ya no genera el aviso genérico "Catálogo actualizado": los cambios relevantes los notifica la base. Los identificadores de comentarios de Diseño van en metadata, nunca en la FK `comentario_id`, que pertenece a Consolidado.

## Calendario automático de catálogos

La tarea diaria `run_catalog_daily_jobs()` usa los mismos cortes que la cuenta regresiva de Inicio (perfil general −22/−12/−7 días; Galerón/Ferrex −16/−10/−6; en catálogos mixtos, el corte más temprano):

1. **Borrador → Preliminar** el día del corte preliminar. En ese momento enciende las notificaciones en vivo del catálogo.
2. **Borrador/Preliminar → Precios Finales** el día del corte de precios finales.
3. Solo avanza, nunca retrocede, y no actúa a partir del inicio de vigencia. Activo y Cerrado siguen siendo manuales.
4. Si el administrador apaga las notificaciones después del cambio automático, la tarea no las vuelve a encender.
5. El mismo día de cada corte envía un aviso único "Importante" (si el catálogo no está en Borrador ni Cerrado y tiene las notificaciones encendidas).

Cada ejecución queda registrada en `catalogo_eventos_programados`, lo que evita duplicados si la tarea corre dos veces.

Los catálogos nuevos se crean en Borrador con las notificaciones en vivo apagadas.

**Precaución:** si alguien tiene Ajustes abierto desde antes del cambio automático y guarda ese catálogo, puede devolverlo al estado anterior. Recargar la app antes de editar un catálogo que tenga un corte ese día.

## Campana

- Abre en **No leídas**; los avisos desaparecen de esa vista al leerlos. La pestaña **Todas** muestra también los leídos.
- Carga de 20 en 20 con **Cargar más** (paginación por fecha).
- El contador consulta en el servidor hasta 100 pendientes (muestra "99+").
- Los avisos de corte se marcan como **Importante** con un borde naranja.

## Limpieza

`cleanup_live_notifications()` corre a diario (02:20 Managua): borra los avisos leídos hace más de 30 días y los no leídos con más de 90 días.

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

Pruebas locales: `node --experimental-vm-modules --test tests/notificationEvents.test.mjs tests/useCatalogSync.test.mjs tests/useLiveNotifications.test.mjs tests/notificationSound.test.mjs` y `npm run build`. Pruebas SQL (PGlite, con `PROMO_SQL_TEST_RUNTIME`): `node --test tests/notificacionesV2Sql.test.mjs tests/broadcastSql.test.mjs`.

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

- Los avisos de promociones, comentarios de Consolidado y acciones de Diseño aún se piden desde el navegador después del guardado: si se cierra la pestaña o falla la red entre ambas operaciones, ese aviso se pierde. Los avisos generados por triggers y por la tarea diaria no tienen ese límite. Siguiente paso recomendado: generar también los primeros dentro de `save_catalog_transactional` y las RPC de Diseño.
- Los comentarios de Mercadeo toman la lista de compradores de los datos cargados y el servidor la filtra; un comprador cuyas promociones no estén cargadas en pantalla no se incluye.
- El contador de pendientes se limita a 100 por consulta.
- Abrir un aviso navega al modulo; proyecto/pagina quedan identificados en el mensaje y metadata, sin alterar el flujo de navegacion actual.
- Consolidado conserva el guardado manual. Agregar/resolver localmente no envia avisos hasta guardar.
