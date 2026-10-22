# Monitoreo de márgenes

Módulo **Márgenes** (`margenes`): calcula bajo demanda el margen de las promociones de
catálogos y solicitudes especiales, por **grupo de oferta**, con un semáforo.

## Acceso

| Rol | Ver | Exportar | Alcance |
| --- | --- | --- | --- |
| `ADMIN` | Sí | Sí | Todo. Además edita los cortes del semáforo en Ajustes > Márgenes. |
| `OPER` (Ejecutor) | Sí | Sí | Todo. |
| `BUYER` | Sí | Sí | Solo sus promociones (mismo alcance que en Promociones: `current_buyer_scope_ids`). |
| Otros | No | No | — |

La seguridad real está en la base: la RPC `consultar_margenes_promociones` valida el rol
y el alcance. `sku_costos` y `promociones_costo` no se pueden leer por REST.

## De dónde sale el costo

1. **Carga del maestro (Ajustes > Maestro de SKU, solo ADMIN).** El mismo archivo trae
   la columna `AV_COST` (costo promedio; se detecta por encabezado, también "Costo
   promedio"). La carga actualiza `sku_master` y `sku_costos` en una sola acción.
   - `AV_COST` viene **siempre en córdobas**: se guarda tal cual, sin tasa ni moneda.
   - Otras columnas de costo (`UNIT_COST`, etc.) y `ORIGIN_COUNTRY_ID` se ignoran.
   - El costo **no** se guarda en `sku_master` ni se muestra al crear ofertas.
2. **Costo guardado por promoción.** Al crear una línea de promoción (o cambiar su SKU)
   un trigger copia el AV_COST vigente (C$) a `promociones_costo`. **El margen se calcula siempre con este costo
   guardado.** Si después el maestro trae otro costo, el módulo lo avisa
   ("Costo vigente distinto"), pero no cambia el cálculo.
3. **Promociones sin costo.** Si al crearla el SKU no tenía costo queda `SIN_COSTO`; al
   terminar la siguiente carga del maestro, la app llama `completar_costos_promociones`
   por tramos de 1.000 líneas y la completa (`COMPLETADO`). Así se completan también las
   promociones que existían al instalar el paso 33.

La carga va en lotes de 1.000 SKU, el vaciado usa `TRUNCATE TABLE` (instantáneo) y las RPC
administrativas declaran `statement_timeout = '60s'` para no verse interrumpidas por el
límite estándar de 8 s de PostgREST en Supabase. La conciliación con promociones se hace
una sola vez al final por tramos de 1.000 líneas.

### Corrección 15-10-2026 (AV_COST)

La primera versión tomaba `UNIT_COST` y convertía a C$ con una tasa (36,62) cuando
`ORIGIN_COUNTRY_ID` no era `NI`. Era incorrecto. El paso 33 actualizado quita la tasa, las
columnas de moneda/origen y, **una sola vez** (marca `MARGEN_COSTO_AV_COST`), vacía
`sku_costos` y deja las promociones en `SIN_COSTO`. La siguiente carga del maestro con
`AV_COST` las completa. Re-ejecutar el paso 33 después no vuelve a borrar costos.

## Cálculo

- Precio neto = precio con IVA ÷ 1.15. Margen = (venta neta − costo) ÷ venta neta.
- Precio de la línea: `precio_ahora`; si no hay, `precio_antes` (o precio regular del
  maestro) con el descuento; descuento 100% = obsequio (venta 0).
- Las promociones `ANULADO` no se incluyen.

| Tipo | Cómo se evalúa |
| --- | --- |
| Precio fijo, Descuento | Cada línea es su propia oferta. |
| Combo | Todo el grupo: Σ precio × cantidad contra Σ costo × cantidad (regalías a 0). |
| Compra X lleva X | Grupo con fila principal y fila de regalía (a 0). |
| Compra X Lleva X V2 | Una fila: se cobran `cantidad_minima` unidades y se entregan además las gratis de la variante (3x2 → 1 gratis). |
| Megapack | Principal al precio regular por su cantidad; obsequios a 0. |
| Umbral | Cada nivel se evalúa por unidad en su precio; el grupo toma el **peor nivel**. |

Una oferta con alguna línea sin costo queda en **Sin costo** y no entra al semáforo.

## Semáforo

Parámetro `MARGEN_SEMAFORO` en `configuracion` (editable en Ajustes > Márgenes):

| Color | Rango por defecto |
| --- | --- |
| Verde | ≥ 30% |
| Naranja | ≥ 20% y < 30% |
| Amarillo | ≥ 10% y < 20% |
| Rojo | < 10% |

## Clasificación ABC

La tabla por oferta y el detalle por SKU muestran la columna **Clasif. ABC** (código ·
nombre), leída de `sku_clasificacion_abc` (paso 35) con la misma clave sin ceros que el
costo. SKU sin clasificación = 8 (Nuevo). Si la oferta tiene SKU con distintas
clasificaciones se muestra "Varias" con la lista. Es la clasificación **vigente**, no la
que tenía el SKU al crear la promoción. Si el paso 35 no está ejecutado, la columna
muestra "—" y el resto del módulo funciona igual. También va en el Excel exportado.

**Filtro "Clasificación ABC"**: se aplica en pantalla sin volver a consultar; deja las
ofertas que tienen al menos un SKU de esa clasificación. Aplica a ambas pestañas y al Excel.

**Pestaña "Análisis por clasificación ABC"** (sobre las mismas ofertas filtradas):
titular con el hallazgo principal (la clasificación donde más pesa el margen bajo:
brecha a la meta × líneas), indicadores, composición de SKU por clasificación (barra
100 %: AA→C en rampa azul, Descontinuado y Otras en neutros) y tabla por clasificación
con SKU, % de SKU, margen promedio sobre la escala del semáforo y desglose de líneas por
estado. "Ver ofertas" filtra la clasificación y vuelve al detalle. Unidad: línea de
promoción (SKU en una oferta); margen unitario; promedio simple; obsequios excluidos;
las comparaciones de margen piden al menos 3 líneas evaluadas por clasificación.
Sección **"¿Dónde se concentra el margen bajo?"**: mapa de calor División × clasificación
(AA, A, B, C, Descontinuado, Otras) con el margen promedio de cada cruce coloreado por el
semáforo; divisiones de menor a mayor margen y fila de total. Celdas con menos de 3 líneas
quedan sin color (referenciales). El hallazgo "cruce más débil" usa brecha a la meta ×
líneas. La división es la de la línea (jerarquía del departamento o, si falta, la del
comprador). Primera entrega: solo División.
Lógica en `src/features/margins/abcMarginAnalysis.js` (pruebas en
`tests/abcMarginAnalysis.test.mjs`), vista en `MarginAbcAnalysis.jsx`.

## Exportación

Botón **Exportar Excel** en el mismo módulo (ADMIN, BUYER, OPER). Genera dos hojas:
*Margen por oferta* y *Detalle por línea*, con lo filtrado en pantalla. No se modifican
`consolidado`, `export_*` ni el Excel de respaldo.

## Archivos

- SQL: `docs/supabase_margenes_promociones.sql` (paso 33) y `docs/supabase_fix_sku_master_timeout.sql` (paso 34), ambos con AV_COST.
- Motor: `src/features/margins/marginEngine.js` (pruebas en `tests/marginEngine.test.mjs`).
- UI: `src/components/MargenesPage.jsx`, `src/features/margins/`.
- Servicio: `src/services/supabase/margins.js`.
- Clasificación ABC: `src/features/margins/marginClassification.js` (pruebas en `tests/marginClassification.test.mjs`).
- Carga del maestro: `src/features/skuMaster/skuMasterParser.js`, `src/services/supabase/skuMaster.js` (pruebas en `tests/skuMasterAvCost.test.mjs`).
