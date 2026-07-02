# Apps Script para Google Sheets

Este script convierte la hoja de calculo existente en una API simple para la app React.

## Instalacion

1. Abra la hoja de calculo de Google.
2. Entre a `Extensiones > Apps Script`.
3. Pegue el contenido de `apps-script/Code.gs`.
4. Ejecute manualmente la funcion `setupWorkbook` desde Apps Script para crear hojas faltantes y encabezados.
5. Opcional: en `Configuracion del proyecto > Propiedades de la secuencia de comandos`, cree `PROMO_API_TOKEN` con un valor privado.
6. Publique como `Implementar > Nueva implementacion > Aplicacion web`.
7. Use estos valores:
   - Ejecutar como: usted.
   - Quien tiene acceso: cualquier usuario con el enlace.
8. Copie la URL `/exec` y guardela en Ajustes dentro de la app.

Cuando cambie este script, vuelva a publicar la implementacion web:

1. `Implementar > Administrar implementaciones`.
2. Edite la implementacion activa.
3. Seleccione `Nueva version`.
4. Guarde y conserve la URL `/exec`.

Si la app muestra errores de conexion:

- Confirme que la URL usada termina en `/exec`, no en `/dev`.
- Confirme que la implementacion web permite acceso a `cualquier usuario con el enlace`.
- Si usa un token, el valor de `PROMO_API_TOKEN` en Apps Script debe ser igual al token guardado en Ajustes.
- Despues de cambiar permisos o codigo, publique una `Nueva version` de la implementacion.

## Acciones disponibles

- `ping`: prueba conexion.
- `setupWorkbook`: crea hojas requeridas si faltan.
- `getCatalog`: lee CONFIG, CATALOGOS, segmentos_clientes, COMPRADORES, RESPONSABLES_SOLICITUDES, JERARQUIA_CATEGORIAS, AVANCES_CATALOGO, NOTIFICACIONES, PROMOCIONES, PROMOCIONES_DETALLE, COMENTARIOS y LOGS.
- `saveCatalog`: guarda el catalogo completo y regenera CONSOLIDADO y EXPORT_*.
- `rebuildViews`: regenera CONSOLIDADO y EXPORT_* desde las hojas principales.
- `upsertPromocion`, `deletePromocion`, `upsertComentario`, `resolveComentario`: acciones granulares para una fase futura.

La app React usa `getCatalog` y `saveCatalog` para mantener el comportamiento actual del MVP, pero ahora sobre Google Sheets.

## Hoja CATALOGOS

La informacion de catalogos se guarda en una hoja tabular llamada `CATALOGOS`.

Encabezados requeridos:

`catalogo_id`, `nombre`, `canal`, `vigencia_inicio`, `vigencia_fin`, `vigencia`, `estado`, `color`, `doc_id`, `token_conexion`, `notificaciones`, `correos`, `divisiones`

Si antes existe una fila `CATALOGOS_JSON` en `CONFIG`, puede dejarla temporalmente para que la app lea los datos viejos. Despues de guardar con esta version nueva, los catalogos se escriben en `CATALOGOS`; ya puede borrar esa fila antigua de `CONFIG`.

## Hoja COMPRADORES

La informacion de compradores se guarda en una hoja llamada `COMPRADORES`.

Encabezados requeridos:

`comprador_id`, `categoria_comprador`, `comprador`, `division`, `correo`, `activo`, `senior_id`

Reglas:

- `categoria_comprador` debe ser `Senior` o `Junior`.
- `division` puede contener una o varias divisiones separadas por `;`.
- `senior_id` se llena solo para compradores `Junior` y debe apuntar al `comprador_id` del Senior.
- Si un Junior apoya a mas de un Senior, puede usar `senior_id` separado por `;`.

## Hoja AVANCES_CATALOGO

La app usa esta hoja como fuente del estado actual de avance por catalogo, comprador Senior y division.

Encabezados requeridos:

`avance_id`, `catalogo_id`, `catalogo`, `comprador_id`, `comprador`, `division`, `estado`, `fecha_estado`, `usuario`

Reglas:

- `estado` guarda el estado actual, normalmente `Terminado`.
- Cuando una division se reabre, la app elimina ese avance actual de la hoja y deja el historial en `LOGS`.
- `LOGS` mantiene la trazabilidad; `AVANCES_CATALOGO` mantiene el estado vigente.

## Hoja RESPONSABLES_SOLICITUDES

La app usa esta hoja para poblar el campo `Responsable` en la ventana de Gestion de solicitudes. Estos usuarios no son compradores; son usuarios o equipos operativos de las areas que procesan las solicitudes en el sistema de promociones.

Encabezados requeridos:

`responsable_id`, `nombre`, `area`, `correo`, `activo`

Reglas:

- `nombre` es el texto que se guarda en `ACTIVIDADES.responsable`.
- `area` permite identificar si pertenece a Pricing, Mercadeo, Planimetria u otra area operativa.
- `activo` debe ser `TRUE` para aparecer como opcion asignable.
- Si la hoja esta vacia, la app usa temporalmente los responsables iniciales de respaldo.

## Hoja JERARQUIA_CATEGORIAS

La app usa esta hoja para relacionar el ID de departamento del maestro de SKU con la division o categoria operativa.

Encabezados requeridos:

`dep_id`, `dep_desc`, `division`, `activo`

Reglas:

- `dep_id` debe coincidir con la columna `DEPT` del maestro de SKU.
- `dep_desc` guarda la descripcion del departamento.
- `division` define la categoria que usa la app para avances por comprador.
- `activo` debe ser `TRUE` para que la relacion se use.
- La grilla de promociones no muestra estos campos, pero `PROMOCIONES` guarda `dep_id` para trazabilidad.

## Hoja segmentos_clientes

La segmentacion de clientes se guarda en una hoja llamada `segmentos_clientes`.

Encabezados requeridos:

`segmento_id`, `nombre_segmento`, `canal`, `activo`, `orden`

Ejemplo inicial:

`1007`, `Gold`, `retail`, `TRUE`, `1`

`1002`, `Managua`, `comasa`, `TRUE`, `1`

Puede cambiar los nombres por los segmentos reales de SINSA. La app muestra solo los segmentos activos del canal del catalogo seleccionado.

## Columnas de segmentacion en PROMOCIONES

La hoja `PROMOCIONES` debe incluir estas columnas:

`dep_id`, `aplica_segmento`, `segmento`

Regla:

- Promocion general: `aplica_segmento = NO` y `segmento = Todos`.
- Promocion segmentada: `aplica_segmento = SI` y `segmento` contiene uno o mas `segmento_id` separados por ` | `.

## Hoja PROMOCIONES_DETALLE

La hoja `PROMOCIONES_DETALLE` queda preparada para guardar campos especificos por motor de promocion compleja sin agregar columnas extra a `PROMOCIONES`.

Encabezados:

`detalle_id`, `row_id`, `grupo_oferta`, `tipo_promo`, `campo`, `valor`

Ejemplo futuro para Umbral:

`DET-1`, `ROW-123`, `umbral-1`, `Umbral`, `monto_minimo`, `1500`
