# Plan de migracion de Drive a Supabase

## Estado actual revisado

Fecha de analisis: 2026-06-23.

Archivos revisados:

- `esquema_SUPABASE.csv`
- `usuarios_mvp.xlsx`
- `export_google_sheet_mvp.xlsx`
- `docs/supabase_schema.sql`
- `docs/supabase_delta_operativo_2026_06_22.sql`
- `src/App.jsx`
- `src/services/googleSheetsService.js`
- `src/services/excelService.js`
- `apps-script/Code.gs`

Supabase sera la fuente principal. Google Sheets / Drive debe quedar solo como respaldo temporal o exportacion operativa durante la transicion.

El maestro SKU debe seguir fuera de Supabase.

## Inventario de datos fuente

Desde `export_google_sheet_mvp.xlsx`:

| Hoja | Registros | Observacion |
| --- | ---: | --- |
| CONFIG | 0 | Sin datos activos. |
| CATALOGOS | 4 | Fuente para campanas tipo catalogo. |
| ACTIVIDADES | 7 | Incluye catalogos y solicitudes especiales. |
| PROMOCIONES | 248 | Tabla principal de migracion. |
| PROMOCIONES_DETALLE | 0 | Preparada para campos complejos futuros. |
| COMENTARIOS | 2 | Incluye comentarios por actividad y por linea. |
| LOGS | 52 | Historial operativo. |
| COMPRADORES | 14 | Coincide con `usuarios_mvp.xlsx`. |
| RESPONSABLES_SOLICITUDES | 5 | Coincide con `usuarios_mvp.xlsx`. |
| JERARQUIA_CATEGORIAS | 138 | Ya trae `activo`; los 138 registros estan activos. |
| SEGMENTOS_CLIENTES | 9 | Todos disponibles como catalogo de segmentos. |
| NOTIFICACIONES | 8 | Ya trae `actividad_id`; requiere mapearlo a `campana_id`. |
| AVANCES_CATALOGO | 3 | Estado vigente de avance por comprador/division. |
| CONSOLIDADO | 248 | Vista generada, no debe migrarse como tabla editable. |
| EXPORT_PRICING | 248 | Vista generada, no debe migrarse como tabla editable. |
| EXPORT_MERCADEO | 248 | Vista generada, no debe migrarse como tabla editable. |
| EXPORT_PLANIMETRIA | 248 | Vista generada, no debe migrarse como tabla editable. |

Desde `usuarios_mvp.xlsx`:

- `compradores`: 14 registros.
- `responsables_promoiones`: 5 registros.

Nota: la hoja se llama `responsables_promoiones`, con error ortografico. No bloquea si se lee por encabezados, pero conviene estandarizar el nombre a `responsables_promociones` o usar el archivo `export_google_sheet_mvp.xlsx`, que ya trae `RESPONSABLES_SOLICITUDES`.

## Estado del esquema Supabase

El CSV completo contiene 281 filas de inventario y confirma estas tablas/vistas:

- Tablas principales: `campanas`, `promociones`, `promociones_detalle`, `comentarios`, `logs`.
- Catalogos operativos: `compradores`, `usuarios_app`, `configuracion`, `segmentos_clientes`, `responsables_solicitudes`, `jerarquia_categorias`, `avances_catalogo`, `notificaciones`.
- Vistas generadas: `consolidado`, `export_pricing`, `export_mercadeo`, `export_planimetria`.
- `sku_master` existe en el esquema, pero no debe usarse para el MVP porque el maestro SKU se mantiene fuera de Supabase.

## Brechas revisadas

Validacion actualizada contra `export_google_sheet_mvp.xlsx`:

1. `PROMOCIONES` ya incluye `dep_id`.
   - Estado: resuelto.
   - Los 248 registros tienen `dep_id` informado.

2. `PROMOCIONES.actividad_id` ya referencia actividades existentes.
   - Estado: resuelto.
   - Los comentarios tambien referencian actividades existentes.

3. `JERARQUIA_CATEGORIAS` ya incluye `activo`.
   - Estado: resuelto.
   - Los 138 registros vienen con `activo = TRUE`.

4. `NOTIFICACIONES` ya usa `actividad_id`.
   - Estado: resuelto.
   - La migracion debe resolver `campana_id` mediante `campanas.legacy_actividad_id = NOTIFICACIONES.actividad_id`.

5. Seguridad MVP sin login real.
   - Estado: decidido.
   - Se usara Opcion A: usuario tecnico compartido de Supabase Auth.

## Decision de seguridad

Se usara la Opcion A: usuario tecnico compartido de Supabase Auth.

La app iniciara sesion automaticamente con un usuario tecnico del MVP para operar bajo el rol `authenticated`, sin mostrar login real al usuario final.

Ventajas:

- Mantiene RLS usando rol `authenticated`.
- No abre la base al rol anonimo.
- Evita exponer una service role key en React.
- Es la opcion mas compatible con el esquema actual.

Riesgos aceptados para el MVP:

- No hay trazabilidad real por persona a nivel de Supabase Auth.
- Las acciones deben registrar el usuario operativo elegido dentro de la app, por ejemplo comprador, Mercadeo o sistema, en columnas como `usuario`, `ultima_modificacion_por` y `logs.usuario`.

Datos que se deben definir para implementarla:

- Email del usuario tecnico.
- Password del usuario tecnico, guardado solo en variables de entorno locales o configuracion segura del despliegue.
- Registro correspondiente en `public.usuarios_app` con rol suficiente para el MVP.

## Mapeo de migracion

### Compradores

Origen: `COMPRADORES`.

Destino: `public.compradores`.

Mapeo:

- `comprador_id` -> `comprador_id`
- `categoria_comprador` -> `categoria_comprador`
- `comprador` -> `comprador`
- `division` -> `division`
- `correo` -> `correo`
- `activo` -> `activo`
- `senior_id` -> `senior_id`

### Responsables de solicitudes

Origen: `RESPONSABLES_SOLICITUDES`.

Destino: `public.responsables_solicitudes`.

Mapeo directo por columnas.

### Jerarquia de categorias

Origen: `JERARQUIA_CATEGORIAS`.

Destino: `public.jerarquia_categorias`.

Mapeo:

- `dep_id` -> `dep_id`
- `dep_desc` -> `dep_desc`
- `division` -> `division`
- `activo` -> `activo`

### Segmentos

Origen: `SEGMENTOS_CLIENTES`.

Destino: `public.segmentos_clientes`.

Mapeo:

- `segmento_id` -> `legacy_segmento_id`
- `nombre_segmento` -> `nombre_segmento`
- `canal` -> `canal`
- `activo` -> `activo`
- `orden` -> `orden`

### Campanas

Origen principal: `ACTIVIDADES`.

Destino: `public.campanas`.

Mapeo:

- `actividad_id` -> `legacy_actividad_id`
- `nombre_actividad` -> `nombre_actividad`
- `tipo_actividad` -> `tipo_actividad`
- `canal` -> `canal`
- `fecha_inicio` -> `fecha_inicio`
- `fecha_fin` -> `fecha_fin`
- `solicitante` -> `comprador`
- `estado` -> `estado`
- `motivo_solicitud` -> `motivo_solicitud`
- `responsable` -> `responsable`
- campos de tiempos y fechas -> columnas equivalentes

Complementar con `CATALOGOS` para:

- `color`
- `doc_id`
- `token_conexion`
- `notificaciones`
- `correos`
- `divisiones`

### Promociones

Origen: `PROMOCIONES`.

Destino: `public.promociones`.

Mapeo:

- `row_id` -> `legacy_row_id`
- `actividad_id` -> resolver `campana_id` por `campanas.legacy_actividad_id`
- `comprador` -> resolver `buyer_id` por `compradores.comprador`
- `oferta_id` -> `oferta_id`
- columnas comerciales -> columnas equivalentes
- `dep_id` -> `dep_id`
- `ultima_modificacion_por` -> `ultima_modificacion_por`
- `fecha_creacion` -> `created_at`
- `fecha_modificacion` -> `updated_at`

### Promociones detalle

Origen: `PROMOCIONES_DETALLE`.

Destino: `public.promociones_detalle`.

Actualmente no hay registros. Cuando existan:

- Resolver `promocion_id` desde `promociones.legacy_row_id`.
- Insertar `campo`, `valor`.

### Comentarios

Origen: `COMENTARIOS`.

Destino: `public.comentarios`.

Mapeo:

- `comentario_id` -> `legacy_comentario_id`
- `actividad_id` -> resolver `campana_id`
- `row_id` -> `legacy_row_id`
- si `alcance_comentario = LINEA`, resolver `promocion_id`
- si `alcance_comentario = ACTIVIDAD`, usar `campana_id`
- `usuario`, `tipo_usuario`, `comentario`, `estado`, `prioridad`, `fecha`, `resuelto_por`, `fecha_resolucion` -> columnas equivalentes

Nota de validacion: el archivo corregido ya no contiene comentarios con `actividad_id` huerfano.

### Logs

Origen: `LOGS`.

Destino: `public.logs`.

Mapeo:

- `log_id` -> `request_id` o conservar en `valor_anterior` solo si se requiere trazabilidad legacy.
- `usuario` -> `usuario`
- `catalogo` -> resolver `campana_id` cuando sea posible
- `row_id` -> resolver `promocion_id` cuando sea posible
- `accion`, `campo`, `valor_anterior`, `valor_nuevo`, `fecha`, `fecha_cierre` -> columnas equivalentes

### Notificaciones

Origen: `NOTIFICACIONES`.

Destino: `public.notificaciones`.

Mapeo:

- `actividad_id` -> resolver `campana_id` por `campanas.legacy_actividad_id`
- `correo` -> `correo`
- `activo` -> `activo`
- `tipo` -> `CAMBIO_PROMOCION`

### Avances de catalogo

Origen: `AVANCES_CATALOGO`.

Destino: `public.avances_catalogo`.

Mapeo:

- `avance_id` -> `avance_id`
- `catalogo_id` -> `catalogo_id`
- `catalogo` -> `catalogo`
- `comprador_id` -> `comprador_id`
- `comprador` -> resolver `buyer_id`
- `division`, `estado`, `fecha_estado`, `usuario` -> columnas equivalentes
- `campana_id` -> resolver por `catalogo_id`

## Cambios implementados en la app

1. Se agrego servicio Supabase sin dependencia nueva:

   - `src/services/supabaseService.js`
   - Usa Auth y REST nativo de Supabase.
   - Mantiene el MVP simple y evita agregar paquetes adicionales.

2. Se agregaron variables de entorno:

   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_SUPABASE_TECH_EMAIL`
   - `VITE_SUPABASE_TECH_PASSWORD`

3. Se creo `src/services/supabaseService.js` con el mismo contrato operativo de Drive:

   - `hasSupabaseConnection()`
   - `loadCatalogFromSupabase()`
   - `saveCatalogToSupabase(data)`
   - `saveSettingsToSupabase(data)`

4. Se mantiene `src/services/googleSheetsService.js` como respaldo durante la transicion.

5. Se ajusto `src/App.jsx` para que:

   - Supabase sea el flujo principal de carga/guardado.
   - Drive quede como accion secundaria o respaldo.
   - Excel siga disponible como exportacion local.

6. Se reusan `applyCatalogData` y `buildCatalogPayload`.

7. Se agrego el script de carga inicial:

   - `scripts/migrate_drive_excel_to_supabase.py`
   - Valida el Excel en modo local.
   - Carga datos cuando se ejecuta con `--execute` y credenciales del usuario tecnico.

Esto reduce el cambio en pantallas y mantiene la migracion localizada en servicios y script operativo.

## Orden de ejecucion recomendado

1. Crear usuario tecnico en Supabase Auth.
2. Insertar el usuario tecnico en `public.usuarios_app` con rol `ADMIN` para el MVP.
3. Crear migracion de datos desde `export_google_sheet_mvp.xlsx`.
4. Ejecutar migracion en Supabase.
5. Validar conteos:

   - 14 compradores
   - 5 responsables
   - 138 jerarquias
   - 9 segmentos
   - 7 campanas
   - 248 promociones
   - 2 comentarios
   - 52 logs
   - 8 notificaciones
   - 3 avances

6. Validar vistas:

   - `consolidado`: 248 filas
   - `export_pricing`: 248 filas
   - `export_mercadeo`: 248 filas
   - `export_planimetria`: 248 filas

7. Implementar servicio Supabase en React con inicio de sesion tecnico. Estado: implementado.
8. Probar carga desde Supabase.
9. Probar guardado de:

   - promocion simple
   - promocion compleja
   - comentario Mercadeo abierto/resuelto
   - avance de catalogo
   - ajuste de comprador

10. Congelar Drive como respaldo.

## Criterios de aceptacion

- La app carga desde Supabase al iniciar o mediante boton principal.
- Guardar promociones escribe en Supabase y las vistas se actualizan automaticamente.
- La app opera con usuario tecnico autenticado, sin pantalla de login para el MVP.
- Excel sigue funcionando como exportacion.
- Las vistas generadas reemplazan `CONSOLIDADO` y `EXPORT_*`.
- No se sube maestro SKU a Supabase.
- No se expone service role key en el frontend.
- La migracion conserva `row_id`, `actividad_id`, `oferta_id` y `comentario_id` legacy.

## Riesgos

- Sin login real, la trazabilidad por persona depende de campos operativos de la app y logs, no de Supabase Auth.
- Las credenciales del usuario tecnico no deben publicarse fuera del entorno controlado del MVP.
- Las fechas vienen mezcladas entre ISO y formato local; la migracion debe normalizarlas.
- `sku_master` existe en Supabase, pero no debe usarse desde la app.

## Siguiente paso propuesto

Implementar la Opcion A:

1. Crear el usuario tecnico en Supabase Auth.
2. Registrar ese usuario en `public.usuarios_app`.
3. Configurar `VITE_SUPABASE_TECH_EMAIL` y `VITE_SUPABASE_TECH_PASSWORD`.
4. Ejecutar `scripts/migrate_drive_excel_to_supabase.py --execute`.
