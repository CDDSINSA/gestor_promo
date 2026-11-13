# Promociones AIRES (aire acondicionado)

Fecha: 2026-10-19. Actualizado: 2026-11-03 (regalías dentro del aire y columna cantidad).

## Qué resuelve

Un aire acondicionado se factura en varias piezas con SKU distintos (condensador y evaporador; un multi-split puede traer más). La compradora manda **un solo precio c/IVA por aire**. Para ORCE, cada pieza va en un set separado del combo, con su propio precio. La app reparte el precio del aire entre las piezas.

## Plantilla: pestaña `AIRES`

| pagina | combo | SKU | descripcion | ahora c/iva | comentario | cantidad |
| --- | --- | --- | --- | --- | --- | --- |
|  | 1 | 157638037 | MINI SPLIT 12000BTU 220V SEER 18 HISENSE | 12999 |  |  |
|  | 1 | 157638070 |  |  |  |  |
|  | 1 | 100531212 |  |  | Regalía al 100 % |  |
|  | 1 | 100531299 |  | 250 | Regalía al 50 % | 2 |

- Cada número de `combo` es un aire. Se agrupa por número, aunque las filas no estén seguidas (en ese caso sale un aviso).
- La descripción, el precio, la página y el comentario pueden venir en una sola fila del aire: se copian a todas las piezas.
- La descripción de la plantilla reemplaza la del maestro en todas las piezas. Se quitan los espacios dobles.
- Si un SKU se repite en el mismo aire, se guarda una sola línea y se suman sus cantidades.
- `cantidad` es opcional: vacía = 1; debe ser un entero mayor a 0.

## Regalías dentro del aire (2026-11-03)

A veces el aire lleva uno o dos artículos adicionales de regalía (al 100 % o con precio). La compradora **no los marca**:

- **Piezas del aire:** los SKU del combo cuyo número de parte base (VPN del maestro) se repite en 2 o más SKU.
- **Regalías:** todos los demás SKU del mismo combo. Se guardan con rol `regalia`, igual que en Combo y Megapack.
- **Precio de la regalía:** su propio `ahora c/iva`. Vacío (o 0) = regalía al 100 % (precio 0, descuento 100 %). Con precio, ese es el precio de la regalía.
- El `ahora c/iva` de las piezas es **solo el precio del aire**; las regalías no entran al reparto ni al "Precio aire c/IVA".
- **Sin base repetida** (por ejemplo, piezas sin VPN en el maestro): todo el combo se toma como piezas, igual que antes.
- **Bloquea:** dos paquetes de aire en el mismo combo; regalía con el mismo precio del aire (probable pieza con VPN mal cargado); precio o cantidad inválidos.
- **Aviso:** regalía sin número de parte en el maestro (verificar que no sea pieza).
- La vista previa muestra cada fila como "Pieza de aire" o "Regalía de aire" para confirmar antes de aplicar.
- **Recarga:** el aire existente se reconoce solo por sus piezas. La plantilla manda también en las regalías: se actualizan, se agregan las nuevas y las que ya no vienen se anulan (o se descartan si no estaban guardadas).

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
- La columna **Rol** muestra "Pieza" o "Regalía" (solo lectura). Las regalías se editan como en Combo: precio, descuento y cantidad.
- "Agregar línea" está deshabilitado: los aires y sus regalías se cargan con la plantilla o pegando la tabla.
- Anular una pieza anula el aire completo, igual que en las demás ofertas agrupadas.
- **Al guardar**, se valida que el aire tenga al menos 2 piezas (las regalías no cuentan), ningún SKU repetido y una sola página. La regalía acepta precio 0.
- El aire viaja completo en una sola parte del guardado (`saveChunks.js`).

## Reportes

- **Exportes y Consolidado:** muestran una fila por pieza con tipo `AIRES`, precio c/IVA de la pieza y la descripción del aire. Pricing calcula el precio sin IVA como pieza ÷ 1.15.
- **Diseño de catálogos:** la tarjeta del aire muestra la descripción, el **precio del aire** y el "antes" del aire (suma de piezas, sin regalías), y debajo cada pieza con su precio y al final las regalías (Regalía o su precio).
- **Márgenes:** el margen se calcula por oferta: lo cobrado (piezas + regalías con precio, sin IVA) contra el costo de todo lo entregado (piezas + regalías × cantidad). Sin regalías, cada pieza tiene el mismo margen que el aire.
- **Supabase:** no requiere script nuevo. El rol `regalia` ya está permitido y AIRES no pasa por la regla de principal/regalía del guardado.

## Archivos

- `src/features/promotions/application/airesCombo.js`: lectura, reparto, VPN y vista previa (lógica pura).
- `AiresWeightsContext.js` y `loadAiresCostWeightsFromSupabase` (`services/supabase/skuMaster.js`): consulta de pesos.
- Integración en `PromosPage.jsx`, `bulkImport.js`, `promoTypeEngine.js`, `renderPromoGridCell.jsx`, `promotionValidationService.js`, `saveChunks.js`, `syncOptions.js`, `usePromoFilters.js`, `excelService.js`, `designPromotions.js` y `DesignSkuOfferCard.jsx`.
- SQL: `docs/supabase_combo_aires.sql` (paso 41).
- Pruebas: `tests/airesCombo.test.mjs`.

## Pendiente conocido

`save_catalog_transactional` no valida en el servidor que un aire tenga 2 o más piezas. Esa regla está solo en el frontend (validación previa al guardado). Las reglas de principal y regalía del servidor no aplican a AIRES.
