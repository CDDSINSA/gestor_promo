# Promociones anuladas

## Regla funcional

La accion de borrar promociones desde la grilla o desde el visor no elimina registros ya guardados en Supabase. Las promociones persistidas se conservan para trazabilidad y se actualizan con `estado_registro = ANULADO`.

Las promociones que todavia no han sido guardadas en Supabase se eliminan solo del estado local de la grilla. No generan historico, no se exportan y no producen logs de base de datos.

## Promociones complejas

Cuando el usuario borra una linea de una promocion compleja, se afecta la oferta completa para evitar que queden promociones incompletas en validaciones posteriores.

El alcance de anulacion se resuelve por:

- `actividad_id`
- `tipo_promo`
- `oferta_id`

Esto aplica a `Combo`, `Umbral`, `Compra X lleva X`, `Compra X Lleva X V2`, `Megapack` y cualquier tipo configurado como complejo en `promoTypeEngine`.

Si el grupo combina lineas guardadas y lineas locales sin guardar, las lineas guardadas se marcan como `ANULADO` y las locales se descartan.

## Visibilidad

Las promociones anuladas no se muestran en la grilla operativa del comprador ni en el visor de promociones del catalogo. Permanecen disponibles para consolidado, exportaciones y auditoria.

## Reportes

Las exportaciones incluyen promociones anuladas. Las filas con `estado_registro = ANULADO` se pintan en rojo en los archivos XLSX generados con `exportStyledWorkbook`.

Las hojas de salida deben conservar una columna de estado para que Pricing, Mercadeo y Planimetria distingan promociones activas de anuladas.

## Auditoria

La anulacion de promociones persistidas se guarda como un `UPDATE` sobre `public.promociones`. Los logs se generan por triggers de Supabase; el cliente no debe insertar logs directamente en la tabla `logs`.
