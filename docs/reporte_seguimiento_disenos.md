# Reporte de seguimiento de diseños

En Exportaciones, la sección Seguimiento de diseños consulta Supabase con Buscar.
Los filtros de catálogo/proyecto, estado del proyecto, diseñador y comprador
se aplican al resultado consultado. Buscar actualiza los datos; Limpiar reinicia
la consulta. Descargar XLSX genera un archivo independiente con Resumen proyectos
y Detalle paginas; no modifica las hojas del archivo operativo.

El avance es (páginas aprobadas + listas para consolidar) / páginas en alcance.
Los conteos de comentarios incluyen registros principales de todas las versiones,
sin contar respuestas. Se exporta el texto de comentarios abiertos por página.
Si supera el límite de Excel de 32,767 caracteres, el texto se recorta; el conteo
de comentarios conserva su valor completo.

Administración y Mercadeo pueden obtener proyectos completos. Un comprador
obtiene las páginas autorizadas por RLS; los proyectos sin páginas autorizadas
se omiten. El reporte etiqueta el alcance y recalcula cantidades tras los filtros.
No se amplían permisos de Exportaciones ni de Diseño. Si RLS no permite consultar
el usuario asignado, se muestra Usuario no disponible, sin exponer su identidad.

## Fecha de último cambio de estado

Aplicar `docs/supabase_catalogo_diseno_fecha_estado.sql` en el SQL Editor de Supabase.
El script añade una fecha y un trigger a proyectos y páginas. El trigger registra
la creación y cada cambio de estado, y conserva esa fecha al editar otros campos.
Puede ejecutarse otra vez. No cambia políticas, estados ni fechas de actualización.

Sin la migración, el reporte continúa funcionando: muestra Sin registro en la
fecha de estado. No se puede reconstruir la fecha histórica de los registros
anteriores; permanece vacía hasta el próximo cambio de estado. Las horas del
Excel corresponden a America/Managua; las fechas de inicio/entrega no cambian de día.

## Verificación

1. Con Administración o Mercadeo, abrir Exportaciones y pulsar Buscar en Seguimiento de diseños.
2. Descargar y comparar estados, asignaciones, páginas y comentarios con Diseño de Catálogos.
3. Filtrar por comprador/diseñador y confirmar que los conteos consideran solo esas páginas.
4. Con un comprador, confirmar que se exportan únicamente sus páginas autorizadas.
5. Después de aplicar el SQL, cambiar un estado y comprobar la fecha del reporte.
   Cambiar solo el título o la asignación: la fecha del estado debe conservarse.
6. Confirmar que Pricing, Mercadeo, Planimetría y Consolidado siguen descargándose.

Pruebas locales:

```powershell
node --experimental-vm-modules --test tests/designReport.test.mjs tests/designExportData.test.mjs tests/consolidadoExport.test.mjs
npm.cmd run build
```
