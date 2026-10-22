# Correcciones de integridad de Fidelización

## Aplicación

Ejecutar `supabase_fidelizacion_integrity.sql` **después** de `supabase_permissions_hardening.sql` y publicar este frontend junto con la migración. El script es transaccional y repetible. No altera columnas ni hojas Excel y no borra registros históricos. Si se reinstalan los scripts anteriores, volver a ejecutar esta migración al final.

La migración no se aplica desde el navegador. Las pruebas locales no certifican su instalación en Supabase remoto.

Para la conciliación de IDs, ejecutar después `supabase_fidelizacion_orce.sql`, según [fidelizacion_orce.md](fidelizacion_orce.md).

## Comportamiento

- Los valores internos son puntos porcentuales: `0.5`, `0,5` y `0.5%` representan medio por ciento. Una celda Excel con formato porcentaje se interpreta según su formato, incluido `100%`. Una celda numérica sin formato porcentaje se interpreta como puntos porcentuales.
- Vacío significa conservar el descuento. Cero explícito significa retirarlo. Se rechazan textos inválidos, porcentajes fuera de rango, segmentos desconocidos y SKU/segmentos duplicados.
- Solo se envían y exportan cambios reales. Los `SIN_CAMBIO` históricos nunca se reaplican; al finalizar junto con cambios reales quedan `RECHAZADO`, sin modificar el descuento.
- La comparación usa el canasto completo del canal y alcance autorizado. Los filtros solo afectan la consulta y exportación visibles. Las consultas del canasto y detalle se paginan.
- Actualizar datos recarga también solicitudes y sus conteos de SKU. La búsqueda masiva usa todos los códigos.
- Los nuevos IDs conservan `FID-fecha-` con un sufijo aleatorio. El servidor rechaza IDs existentes; no sustituye solicitudes pendientes.
- Se rechazan solicitudes pendientes superpuestas por canal/SKU/segmento. La creación y finalización comprueban el descuento anterior y se serializan dentro de transacciones.
- Creación de solicitudes masiva vectorizada (set-based): Se reemplazó el bucle procedimental fila por fila por validación e inserción en bloque sobre tablas temporales e índices dedicados (`idx_canasto_fid_sku` e `idx_fid_detalle_pendiente`), previniendo errores de timeout `[57014]` en cargas con cientos o miles de SKUs.
- Solo Ejecutor puede finalizar. Debe registrar la referencia de la carga realizada en el campo existente **ID de promos / ORCE**. `ORCE-CARGADO` no es una referencia válida. Esto es una referencia declarada por el Ejecutor, no una confirmación automática de Oracle.
- La exportación de una solicitud pendiente comprueba el canasto antes de generar el archivo. La finalización vuelve a comprobarlo. Si una solicitud histórica está desactualizada, se bloquea y requiere revisión operativa; no se sobrescribe automáticamente ni se descarta información.
- El respaldo local/demo está separado por identidad de usuario. No se recuperan automáticamente las antiguas claves compartidas entre sesiones. Este modo no sustituye la operación multiusuario en Supabase.

El respaldo Excel general continúa sin incluir canasto y detalles de Fidelización. No se agregan hojas ni se modifica su estructura.

## Verificación

```powershell
node --experimental-vm-modules --test tests/permissions.test.mjs tests/fidelizacionPermissions.test.mjs tests/fidelizacionIntegrity.test.mjs
npm run build
```

La prueba SQL usa PGlite en un directorio temporal externo al proyecto, sin añadir dependencias a la aplicación:

```powershell
npm install --prefix "$env:TEMP\promo-fidelizacion-sql-tests" --no-save --ignore-scripts @electric-sql/pglite
$env:PROMO_SQL_TEST_RUNTIME = Join-Path $env:TEMP 'promo-fidelizacion-sql-tests\node_modules\@electric-sql\pglite\dist\index.js'
node --test tests/permissionsSql.test.mjs
```

En un entorno de prueba, cargar un Excel con `0.5%`, una celda vacía y cero explícito; verificar la comparación con un filtro de división activo. Pegar varios SKU y comprobar que la exportación contiene todos los resultados filtrados. Recargar solicitudes, finalizar con Ejecutor usando una referencia ORCE y comprobar los descuentos. Intentar finalizar como Comprador y enviar cambios superpuestos: ambos deben rechazarse.
