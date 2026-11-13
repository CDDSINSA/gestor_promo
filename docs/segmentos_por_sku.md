# Segmentos de clientes por SKU

Una promoción (catálogo o solicitud especial) puede dar beneficios distintos a cada segmento de clientes para el mismo SKU. Por ejemplo, 5 % para 1002 y 1003, y 4 % para 1102 a 1104.

Cada fila guarda sus segmentos como códigos unidos por ` | ` (ej. `1002 | 1003`). Los exportes y ORCE aceptan varios segmentos juntos, así que no se parte en una fila por segmento.

## Solicitud especial

- **Alcance:** solo dice dónde aplica: todo el canal, una tienda o varias tiendas. Ya no existe el alcance "Segmento de clientes".
- **¿Aplica a segmentos de clientes?** Sí/No. Si es Sí, los segmentos se eligen al cargar cada SKU.
- **Solicitudes viejas con alcance "Segmento de clientes":** siguen funcionando. Sus segmentos se usan como valor por defecto para los SKU nuevos que no traigan los suyos.

## Cómo cargar segmentos por SKU

Al cargar, cada fila toma su segmento en este orden:

1. El que trae la fila: columna "Segmento", modal de SKU o tabla SKU × segmento.
2. El que está seleccionado en "Segmentos" en la ventana de carga.
3. El valor por defecto de la solicitud (solo solicitudes viejas).

### Opción 1: pegado o plantilla con columna "Segmento"

Funciona para Descuento y Precio fijo. Hay que pegar **con la fila de encabezado**:

| SKU | Descuento | Segmento |
| --- | --- | --- |
| 100531212 | 5% | 1002, 1103 |
| 100531212 | 6% | 1003 |
| 100531212 | 3% | 1104-1105 |

- La columna "Segmento" acepta `1002, 1003`, `1002 | 1003`, `1002;1003`, rangos (`1102-1104`) y nombres de segmento.
- `Todos` o `General` dejan la fila para público general.
- Sin encabezado, las columnas se leen por posición: SKU, valor, opcional (Ahora c/IVA en Descuento), comentario y página. Por eso un segmento en la tercera columna se leería como precio.
- En la plantilla de Excel (pestañas DESCUENTO y PRECIO_FIJO) basta con agregar una columna titulada "Segmento".
- Si el SKU ya existe con esos mismos segmentos, se actualiza; si no, se crea una fila nueva. El orden de los códigos no importa.

### Opción 2: tabla SKU × segmento

En "Pegar valores en", elija "Tabla SKU × segmento" (aparece cuando "¿Aplica a segmentos?" está en Sí):

| SKU | 1002 | 1003 | 1102 | 1103 | 1104 | 1105 |
| --- | --- | --- | --- | --- | --- | --- |
| 100531212 | 5% | 6% | 4% | 5% | 3% | 3% |

- Crea 4 filas: 5 % (1002 y 1103), 6 % (1003), 4 % (1102) y 3 % (1104 y 1105). Los segmentos con el mismo valor quedan juntos.
- En Precio fijo, las celdas llevan el precio ahora c/IVA.
- El encabezado acepta rangos (`1102-1104`). Columnas opcionales: Página y Comentario.

### Opción 3: grilla

En la columna Segmentos se puede escribir `1003, 1002` o `1102-1104`; la app lo ordena como `1002 | 1003`.

## Revisiones de la vista previa

- **Carga bloqueada:**
  - Descuento con Ahora c/IVA mayor al precio regular (suele ser un segmento pegado en la columna de precio).
  - Segmentos que no existen en el canal.
- **Aviso:**
  - Ahora c/IVA igual a un código de segmento.
  - Precio fijo mayor al regular.
  - Una fila se cruza con otra del mismo SKU.
  - Solicitud con segmentos y fila sin segmento.

## Validaciones al guardar

- **El mismo SKU no puede tener dos beneficios para un mismo segmento.**
  - Aplica en el mismo tipo y comprador, o entre Descuento y Precio fijo.
  - Dos filas para público general también chocan.
- **Descuento y Precio fijo del mismo SKU pueden convivir** si sus segmentos no se cruzan.
- **Una fila general y otra segmentada del mismo SKU no chocan.**

## Base de datos

Ejecutar `supabase_g_comercial_segmentos_por_sku.sql` para poder cambiar segmentos en solicitudes viejas con alcance "Segmento de clientes". Las solicitudes nuevas no lo necesitan.
