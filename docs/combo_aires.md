# Promociones AIRES (aire acondicionado)

Fecha: 2026-10-19.

## Qué resuelve

Un aire acondicionado se factura en varias piezas con SKU distintos (condensador y evaporador; un multi-split puede traer más). La compradora manda **un solo precio c/IVA por aire**. Para ORCE, cada pieza va en un set separado del combo, con su propio precio. La app reparte el precio del aire entre las piezas.

## Plantilla: pestaña `AIRES`

| pagina | combo | SKU | descripcion | ahora c/iva | comentario |
| --- | --- | --- | --- | --- | --- |
|  | 1 | 157638037 | MINI SPLIT 12000BTU 220V SEER 18 HISENSE | 12999 |  |
|  | 1 | 157638070 |  |  |  |

- Cada número de `combo` es un aire. Se agrupa por número, aunque las filas no estén seguidas (en ese caso sale un aviso).
- La descripción, el precio, la página y el comentario pueden venir en una sola fila del aire: se copian a todas las piezas.
- La descripción de la plantilla reemplaza la del maestro en todas las piezas. Se quitan los espacios dobles.
- Si un SKU se repite en el mismo aire, se guarda una sola línea con cantidad 2.

## Reparto del precio

```
peso de la pieza   = base × cantidad / Σ(base × cantidad)
precio de la pieza = peso × precio del aire   (2 decimales)
```

- **Base = costo (AV_COST).** Lo calcula la RPC `calcular_pesos_aires` (paso 41), que devuelve solo pesos, nunca costos.
- **Si a alguna pieza le falta costo** (o vale 0), todo el aire se reparte por **precio regular** del maestro. Las fuentes nunca se mezclan.
- **Sin costo ni precio regular**, el aire queda bloqueado.
- **Centavos:** la pieza de mayor peso absorbe la diferencia de redondeo. La suma de las piezas siempre es el precio del aire c/IVA. El negocio acepta ±1 centavo en ORCE/Xstore.
- **Comentario de cada pieza:** guarda la fuente y el peso, por ejemplo `Aire aires-1: reparto por costo 59.26%`, seguido del comentario de la compradora.

## Validaciones de la carga (bloquean el archivo completo)

- Falta el precio, el precio no es válido o hay dos precios distintos en el mismo aire.
- Falta la descripción o hay dos descripciones distintas.
- Hay dos páginas distintas en el mismo aire.
- El aire tiene una sola pieza, una pieza sin SKU o un SKU no numérico.
- **El número de parte no coincide.** Se compara la base del VPN del maestro: lo que va antes del primer punto o guion (`SW362H8.NRP0`, `SW362H8-USP0` → `SW362H8`); si no tiene punto ni guion, el VPN completo.
- No hay costo ni precio regular para repartir.

**Solo avisos:** pieza sin número de parte en el maestro, SKU que no está en el maestro, SKU repetido en otro aire del archivo, filas del combo no seguidas, costo no consultado (sin el paso 41 o por un error de red).

**Recarga:** si la actividad ya tiene un aire con exactamente los mismos SKU, se actualiza ese aire en lugar de crear otro.

## Grilla de Promociones

- El tipo `AIRES` muestra la columna **Precio aire c/IVA**, que es editable. Al cambiarla se recalculan las piezas y se conserva la proporción guardada.
- El SKU, el precio de cada pieza y la cantidad son de solo lectura. Así la descripción del aire no se reemplaza por la del maestro.
- "Agregar línea" está deshabilitado: los aires se cargan con la plantilla o pegando la tabla.
- Anular una pieza anula el aire completo, igual que en las demás ofertas agrupadas.
- **Al guardar**, se valida que el aire tenga al menos 2 piezas, ningún SKU repetido y una sola página.
- El aire viaja completo en una sola parte del guardado (`saveChunks.js`).

## Reportes

- **Exportes y Consolidado:** muestran una fila por pieza con tipo `AIRES`, precio c/IVA de la pieza y la descripción del aire. Pricing calcula el precio sin IVA como pieza ÷ 1.15.
- **Diseño de catálogos:** la tarjeta del aire muestra la descripción, el **precio del aire** y el "antes" del aire (suma de piezas), y debajo cada pieza con su precio.
- **Márgenes:** no cambia. El margen se calcula por oferta. Con reparto por costo, cada pieza tiene el mismo margen que el aire.

## Archivos

- `src/features/promotions/application/airesCombo.js`: lectura, reparto, VPN y vista previa (lógica pura).
- `AiresWeightsContext.js` y `loadAiresCostWeightsFromSupabase` (`services/supabase/skuMaster.js`): consulta de pesos.
- Integración en `PromosPage.jsx`, `bulkImport.js`, `promoTypeEngine.js`, `renderPromoGridCell.jsx`, `promotionValidationService.js`, `saveChunks.js`, `syncOptions.js`, `usePromoFilters.js`, `excelService.js`, `designPromotions.js` y `DesignSkuOfferCard.jsx`.
- SQL: `docs/supabase_combo_aires.sql` (paso 41).
- Pruebas: `tests/airesCombo.test.mjs`.

## Pendiente conocido

`save_catalog_transactional` no valida en el servidor que un aire tenga 2 o más piezas. Esa regla está solo en el frontend (validación previa al guardado). Las reglas de principal y regalía del servidor no aplican a AIRES.
