# Conciliación de IDs de ORCE

## Instalación

Ejecutar `supabase_fidelizacion_orce.sql` **después de** `supabase_fidelizacion_integrity.sql`. La migración es transaccional y repetible; Luego aplicar `supabase_admin_fidelizacion.sql` y `supabase_admin_orce.sql` para habilitar al Administrador. Mantener este orden al reinstalar migraciones. Publicar el frontend con la migración instalada. No se ejecuta automáticamente contra la base remota.

Se agregan al canasto `promo_id_orce`, `oferta_id_orce`, `estado_conciliacion_orce`, `revision_orce`, `fecha_conciliacion_orce` y `lote_conciliacion_orce`. Los IDs son texto y siempre se guardan juntos. Las tablas `fidelizacion_orce_importaciones` y `fidelizacion_orce_historial` conservan lotes, resultados y valores anteriores. No se modifican las hojas del respaldo Excel general.

La carga inicial del canasto se administra directamente en la BD. El importador no crea registros ni asigna compradores. Los registros nuevos con descuento positivo y sin IDs nacen pendientes; al insertar ambos IDs se identifican como conciliados. La carga inicial debe respetar las restricciones y el propietario del canasto ya establecidos.

## Operación

1. Ingresar como **Ejecutor o Administrador** a Fidelización y seleccionar **Cargar reporte ORCE**.
2. Seleccionar el reporte `.xlsx`. Se detectan sus encabezados aunque no estén en la primera fila. Se utilizan Id de oferta (A), Id de promo (B), Articulo (G), Detail change percent (M) y Segmento (P).
3. Revisar los resultados. El segmento se extrae al final del texto (por ejemplo, `45 - Segmento COMASA 1102` produce `1102`). El canal proviene del catálogo de segmentos activos. Las ubicaciones no intervienen.
4. Solo se actualizan IDs de combinaciones existentes con exactamente el mismo descuento. Duplicados equivalentes se unifican; descuentos o IDs contradictorios bloquean toda la combinación. Las filas inválidas, no encontradas y con descuento distinto se muestran para revisión.
5. Las fechas inicial/final vencidas, futuras, ausentes o no interpretables generan advertencias; no excluyen ofertas ni deciden entre IDs contradictorios. Los descuentos son permanentes y su vigencia técnica se renueva en ORCE. Si el reporte declara un tipo de descuento distinto a `PERCENT_OFF`, la fila es inválida.
6. Confirmar **Actualizar IDs**. Las combinaciones omitidas conservan sus datos. Descargar el resultado CSV para revisar todas las filas, incluyendo las no actualizadas.
7. Hacer clic en el SKU del canasto para consultar IDs y estado de conciliación por segmento. La matriz principal conserva su organización.

## Finalización de solicitudes

- Un cambio real a descuento positivo vacía los IDs actuales y deja `PENDIENTE`. El historial conserva los IDs anteriores.
- Un cambio a cero conserva IDs y fecha/lote de su última conciliación. El canasto queda `Inactivo` y la conciliación `NO_APLICA`. Esos IDs son referencias anteriores, no evidencia de una oferta activa.
- Al reactivar desde cero, los IDs anteriores se invalidan y queda pendiente de conciliación.
- Si el descuento no cambia, los IDs permanecen intactos.
- El estado de la solicitud sigue su flujo actual. `Finalizado` y `PENDIENTE` de conciliación pertenecen a entidades diferentes.

El trigger aplica estas reglas dentro de la transacción existente de finalización; no requiere cambios en el formulario de solicitudes ni distribuye los IDs de la cabecera entre todos los SKU.

## Integridad y reintentos

Solo Ejecutor puede importar. Compradores consultan sus referencias según su alcance. La RPC verifica permisos, catálogo de segmentos, descuento y revisión actual; nunca inserta combinaciones ni modifica descuentos.

La vista previa detecta conflictos sobre el archivo completo. La carga usa lotes de hasta 500 combinaciones, cada uno transaccional e idempotente. Si se interrumpe, los lotes ya confirmados permanecen guardados. Reintentar desde la misma ventana reutiliza sus IDs y recupera sus resultados sin duplicar escrituras. También se puede volver a leer el archivo para comparar contra el estado actual.

La revisión impide aplicar una vista previa obsoleta, incluso si el descuento cambió y luego volvió al mismo valor. Un archivo ya antiguo antes de preparar la vista previa puede coincidir con un descuento actual: la ausencia de una fecha confiable de extracción impide certificar su actualidad. El operador debe usar un reporte recién obtenido; las fechas de vigencia no son fechas de extracción.

Los lotes e historiales son de solo lectura para usuarios de la aplicación. La importación no prueba el estado en tiempo real de ORCE ni elimina ofertas en ese sistema.

## Pruebas

```powershell
node --experimental-vm-modules --test tests/fidelizacionOrce.test.mjs tests/fidelizacionOrceService.test.mjs tests/fidelizacionIntegrity.test.mjs tests/fidelizacionPermissions.test.mjs tests/permissions.test.mjs
$env:PROMO_SQL_TEST_RUNTIME = Join-Path $env:TEMP 'promo-fidelizacion-sql-tests\node_modules\@electric-sql\pglite\dist\index.js'
node --test tests/permissionsSql.test.mjs
npm run build
```

La prueba SQL requiere PGlite instalado fuera del proyecto según `fidelizacion_integrity.md`. Verifica instalación repetida, permisos, conciliación exacta, reintentos, conflictos, historial, invalidación, baja a cero y reactivación. Las pruebas no certifican que la migración esté instalada en Supabase remoto.

Prueba funcional: en una BD de prueba con las combinaciones existentes, importar el reporte de ejemplo; debe reconocer cinco filas, dos duplicados y tres combinaciones únicas. Verificar que los IDs se asignan solo si el descuento coincide. Finalizar cambios a otro porcentaje y a cero, y consultar nuevamente el detalle del SKU.
