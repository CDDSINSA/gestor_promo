# Maestro de artículos por demanda

Actualizado: 2026-09-09.

## Fuente y alcance

`sku_master` de Supabase es la única fuente del maestro. La aplicación ya no
descarga la tabla completa ni utiliza un Excel de Drive, un archivo local o
IndexedDB como respaldo del maestro. El archivo administrativo de Ajustes sirve
para actualizar la BD; no se distribuye como diccionario operativo.

Excel sigue admitido para importar promociones y propuestas de fidelización,
exportar resultados y generar respaldos. Sus hojas y columnas no cambian.

## Consulta y caché

- `src/services/supabase/skuMaster.js`: `loadSkuMasterBySkusFromSupabase` exige
  sesión y consulta únicamente códigos mediante `sku=in.(...)`. Agrupa como
  máximo 100 códigos/variantes por petición y pagina los resultados filtrados.
- Devuelve SKU, descripción, número de parte, departamento, unidad, proveedor,
  precio regular y fecha de actualización. El precio cero se conserva.
- Los códigos exactos tienen prioridad. Se admiten variantes numéricas con
  ceros iniciales de 5 a 8 posiciones solo si identifican un único artículo;
  los códigos ambiguos no se completan por aproximación.
- `useSkuMaster` conserva resultados en memoria durante la sesión, comparte
  peticiones simultáneas del mismo código y recuerda códigos no encontrados.
  Los errores de red no se guardan como resultados vacíos.
- Cambiar de usuario/cerrar sesión limpia la caché y cancela consultas. Las
  respuestas tardías se descartan. Actualizar el maestro desde Ajustes invalida
  la caché y recarga solo los códigos que ya se habían solicitado.
- `skuMasterCount` cuenta artículos en caché, no el total de la tabla.
- `SkuLookupContext` permite consultar desde páginas y modales sin propagar
  conexiones ni volver a cargar el diccionario completo.

## Flujos cubiertos

| Flujo | Resolución del maestro |
| --- | --- |
| Promociones existentes / modal del catálogo | Consulta los códigos de las promociones cargadas al entrar a módulos que usan artículos. |
| Alta simple | Consulta el SKU antes de crear la fila; la vista previa consulta con una espera de 300 ms al escribir. |
| Edición de SKU en grilla | Espera la BD antes de completar los campos; una respuesta de una edición anterior no reemplaza la más reciente. |
| Constructor de combo | Consulta principales y regalías antes de insertar las filas. |
| Pegado / plantilla | Extrae códigos con los mismos parsers de la vista previa: simples, Umbral, Combo, Compra X/Lleva X y todos los obsequios de Megapack. |
| Promoción especial / solicitudes especiales | Comparten la grilla y la consulta de promociones. |
| Fidelización: canasto y detalle de solicitud | Consulta los códigos necesarios para completar la información visible. |
| Fidelización: entrada manual / Excel | Consulta los códigos antes de calcular deltas; el maestro no procede de la descripción del archivo. |
| Exportación ORCE desde fidelización / solicitudes | Espera la consulta de los códigos exportados para completar campos faltantes. |

Las filas ya guardadas conservan sus descripciones/precios históricos; esta
mejora no reescribe promociones por un cambio posterior del maestro. La ausencia
de un artículo mantiene las advertencias de revisión existentes. Un error de
consulta detiene la acción que necesita esos datos y permite reintentar.

## Verificación

Archivos de esta implementación:

- Integración: `src/App.jsx`, `src/hooks/useSkuMaster.js`,
  `src/features/skuMaster/SkuLookupContext.js`, `src/services/supabase/skuMaster.js`.
- Promociones: `src/components/PromosPage.jsx`, `src/hooks/usePromos.js`,
  `src/features/promotions/application/bulkImport.js`.
- Fidelización y solicitudes: `src/components/FidelizacionPage.jsx`,
  `src/components/FidelizacionUpdateModal.jsx`, `src/components/SolicitudesEspecialesPage.jsx`,
  `src/services/fidelizacionService.js`.
- Pruebas: `tests/skuMaster.test.mjs`, `tests/useSkuMaster.test.mjs`,
  `tests/skuDemandFlows.test.mjs`.
- Documentación: `README.md`, `ROADMAP.md`, `docs/plan_migracion_drive_supabase.md`
  y este documento.

```powershell
node --experimental-vm-modules --test tests/skuMaster.test.mjs tests/useSkuMaster.test.mjs tests/skuDemandFlows.test.mjs
npm.cmd run build
```

Prueba manual con sesión autenticada:

1. Entrar al módulo y comprobar en Red que todas las peticiones a `sku_master`
   operativas tienen filtro `sku`; no debe existir una descarga de la tabla completa.
   El resumen administrativo puede consultar solo una fila o una RPC de conteo.
2. Crear/editar un SKU conocido y comprobar descripción, número de parte,
   departamento y precio. Repetirlo y comprobar reutilización de la caché.
3. Pegar/importar cada mecánica, especialmente combos y regalías Megapack.
4. Importar y agregar manualmente en fidelización; revisar detalle y exportar
   ORCE tanto desde fidelización como desde solicitudes especiales.
5. Simular fallo de red, reintentar y cambiar rápidamente de SKU. No deben
   aplicarse resultados antiguos ni crearse filas por una consulta fallida.
6. Actualizar el maestro en Ajustes y comprobar que los artículos consultados
   se obtienen nuevamente de la BD.

Limitaciones: una sesión conserva los artículos consultados hasta su cierre o
actualización explícita. Los cambios hechos por otro usuario no se notifican en
tiempo real. La validación automatizada utiliza respuestas simuladas, sin
modificar la BD; la comprobación visual autenticada requiere la sesión del usuario.
