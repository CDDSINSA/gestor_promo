# Resumen de ofertas vigentes

Pestaña de Fidelización disponible solo para ADMIN y OPER. Es de consulta y no modifica campañas, canasto, descuentos, conciliación ni hojas Excel. Usa las políticas existentes de Supabase (incluidos los ajustes de acceso ADMIN ya instalados); no requiere migraciones nuevas ni dependencias.

## Criterios

- Canal seleccionado: COMASA o RETAIL. Día de corte: zona America/Managua al consultar.
- Fidelización: canasto Activo, descuento positivo y ambos IDs numéricos conciliados. No representa una verificación de vigencia técnica en ORCE.
- Especiales: tipo ESPECIAL, estado Finalizado o Archivado y fecha_inicio <= corte <= fecha_fin. Se excluyen cabeceras FID para evitar doble conteo. Archivar no vence una oferta.
- IDs únicos normalizados como texto numérico, sin convertir a Number. No contar SKU ni referencias como ORCE-CARGADO. Los totales deduplican entre fuentes; por segmento se deduplica independientemente.
- Aviso desde 450 ofertas; límite alcanzado desde 500. Es informativo y no bloquea operaciones.
- Las cabeceras especiales carecen de relación exacta ID de oferta–segmento. Sus IDs figuran en el total y en ofertas sin segmento verificable, nunca se asignan arbitrariamente al gráfico. Completar ese desglose exige una fuente o relación explícita adicional.
- Las solicitudes sin fechas verificables se excluyen y se señalan. El canasto pendiente de conciliación también se señala. Un valor bajo no garantiza capacidad libre.

## Arquitectura y diseño

summaryModel.js: cálculo puro, fechas y deduplicación. fidelizacionSummaryService.js: lecturas paginadas con columnas acotadas, autorización y cancelación. useSummary.js: consulta manual y cancelación; SummaryPanel.jsx: estados de consulta y error. SummaryView.jsx y summary.css: presentación responsive, barras horizontales con escala compartida, conteos visibles y estados expresados con texto además de color.

Consultas únicamente al pulsar Actualizar resumen o Reintentar. Entrar a la pestaña, cambiar de canal o renovar la conexión no consulta datos; invalida la vista anterior. Sin actualización automática, sin datos locales de respaldo ni ceros simulados ante errores. No es una instantánea transaccional de ORCE: para decisiones de capacidad confirmar datos en el sistema corporativo.

Referencias de diseño: [NN/g: gráficos para dashboards](https://www.nngroup.com/articles/dashboards-preattentive/) y [GOV.UK: avisos con texto](https://design-system.service.gov.uk/components/warning-text/). Se conserva la paleta corporativa y se evita usar color como única señal.

## Verificación

node --experimental-vm-modules --test tests/fidelizacionSummary.test.mjs tests/fidelizacionSummaryService.test.mjs

npm run build

En la aplicación: entrar como ADMIN y OPER, abrir Resumen de ofertas y comprobar que no hay consultas hasta pulsar Actualizar resumen; alternar canales y volver a la pestaña sin consultas automáticas; comprobar que BUYER no ve la pestaña. Revisar IDs repetidos, ofertas vencidas, pendientes y límites 449/450/499/500/501. Ante fallo de red debe mostrarse error con Reintentar. El gráfico y las tarjetas deben apilarse en móvil sin desplazamiento horizontal.
