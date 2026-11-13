# Cuenta regresiva y difusión administrativa

## Activación

Aplicar `supabase_catalog_deadlines_broadcasts.sql` en el SQL Editor del proyecto correspondiente, después de las migraciones de roles y `supabase_live_notifications.sql`. La instalación es transaccional y no envía mensajes. La base remota no fue modificada durante el desarrollo.

El contador funciona sin esta migración. El guardado de **Precios Finales** y el envío de difusión requieren instalarla. No se agregaron dependencias a la aplicación ni se modificó la estructura Excel.

## Comportamiento

> Desde `supabase_notificaciones_v2.sql` los cortes además cambian el estado del catálogo automáticamente (Borrador → Preliminar → Precios Finales) y envían un aviso único el mismo día. Ver [notificaciones](notificaciones_envivo_flujo.md#calendario-automático-de-catálogos).


- Inicio: una franja debajo de los botones de cada catálogo muestra el próximo corte. Avanza al día siguiente de cada corte, sin confirmar entregas ni cambiar el estado del catálogo.
- Días calendario en America/Managua. Se actualiza al volver a la aplicación y cada 30 segundos mientras está abierta.
- Perfil general: preliminar a −22 días, precios finales a −12 e imprenta a −7 respecto al inicio de vigencia.
- Galerón/Galerones y Ferrex: −16, −10 y −6. Se selecciona por canal existente; un catálogo mixto muestra ambos perfiles.
- Rojo: de 0 a 2 días; ámbar: de 3 a 5; neutro: más de 5. Después de imprenta se muestra el inicio de vigencia, y después la indicación de vigencia iniciada/finalizada. Nunca se declara una entrega cumplida.
- `Ver fechas` muestra los cuatro hitos. Las fechas ya transcurridas se identifican como pasadas.
- Ajustes permite seleccionar **Precios Finales**, independiente del contador.
- Ajustes > Difusión: solo ADMIN puede enviar asunto y mensaje a usuarios activos BUYER, MARK y OPER. Pricing, Ejecutor y Planimetría comparten OPER en el modelo actual. No se cambió la matriz de permisos.
- Se reutiliza la campana y su lectura individual. Los mensajes quedan guardados para usuarios desconectados. No se envían correos ni WhatsApp.
- El formulario ofrece vista previa, límites de longitud, estado de envío y resultado con cantidad de destinatarios. Reintentar el mismo contenido después de un error conserva el identificador mientras el formulario permanezca montado; el servidor evita duplicados para ese identificador.

## Verificación

1. Catálogo Retail con inicio 2026-10-01: fechas 09/09, 19/09, 24/09 y 01/10. Galerón/Ferrex: 15/09, 21/09, 25/09 y 01/10.
2. Comprobar cortes de hoy, paso automático al siguiente, vigencia iniciada y datos incompletos. No hay botones de confirmación de entrega.
3. Tras instalar SQL, guardar Precios Finales y recargar el catálogo.
4. En un ambiente de prueba con cuentas de cada rol, enviar desde ADMIN, abrir la campana como destinatario y verificar que marcar leído no afecta a otros. Un usuario no administrador no debe poder invocar el RPC de difusión.
5. Revisar tarjetas y formulario en escritorio y móvil.

Pruebas automáticas:

```powershell
node --experimental-vm-modules --test tests/catalogSchedule.test.mjs tests/broadcast.test.mjs tests/notificationEvents.test.mjs tests/useLiveNotifications.test.mjs tests/AppContent.test.mjs
npm run build
```

La prueba `tests/broadcastSql.test.mjs` usa un PostgreSQL aislado opcional. Definir `PROMO_SQL_TEST_RUNTIME` con la ruta a `@electric-sql/pglite/dist/index.js` instalado fuera de la aplicación y ejecutar `node --test tests/broadcastSql.test.mjs`. Comprueba permisos, RLS por destinatario, inactivos excluidos, reintentos, contenido inválido y preservación de estados anteriores.

## Archivos afectados

- `src/components/HomePage.jsx`
- `src/components/AjustesPage.jsx`
- `src/features/catalogSchedule/catalogSchedule.js`
- `src/features/catalogSchedule/useCatalogToday.js`
- `src/features/catalogSchedule/CatalogCountdown.jsx`
- `src/features/notifications/broadcast.js`
- `src/features/notifications/BroadcastSettings.jsx`
- `src/services/supabase/broadcasts.js`
- `src/styles/pages/home.css`
- `src/styles/pages/ajustes.css`
- `src/styles/components/ui-elements.css`
- `docs/supabase_catalog_deadlines_broadcasts.sql`
- `docs/catalog-deadlines-broadcasts.md`
- `tests/catalogSchedule.test.mjs`
- `tests/broadcast.test.mjs`
- `tests/broadcastSql.test.mjs`

## Límites

Los plazos son informativos y no miden cumplimiento. No contemplan feriados ni excepciones por catálogo. La hora proviene del dispositivo, interpretada en Managua. La difusión depende de la sesión y de Supabase; su bandeja conserva el comportamiento existente de cargar las 50 notificaciones más recientes. La revisión visual utilizó componentes reales con datos de ejemplo, sin enviar mensajes reales ni verificar la base remota.
