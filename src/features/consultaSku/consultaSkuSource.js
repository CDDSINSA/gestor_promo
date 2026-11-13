// Consulta SKU bajo demanda (carga por campaña).
//
// La consulta ya no necesita todas las promociones en memoria:
// - Las actividades que YA estan en memoria se leen de memoria (incluye cambios sin guardar).
// - Las demas actividades abiertas se consultan en Supabase, solo para los SKU pedidos.
// Con la bandera apagada todo esta en memoria y no se consulta el servidor.

function text(value) {
  return String(value ?? "").trim();
}

export function getRowActivityId(row = {}) {
  return text(row.actividadId || row.actividad_id || row.catalogo_id || row.catalogoId);
}

/** Actividades cuya informacion vale la de memoria: las cargadas y las que tienen filas locales. */
export function getMemoryActivityIds(rows = [], loadedIds = null) {
  const ids = new Set(Array.from(loadedIds || []).map(text).filter(Boolean));
  (rows || []).forEach((row) => {
    const id = getRowActivityId(row);
    if (id) ids.add(id);
  });
  return ids;
}

/** Actividades abiertas que hay que consultar en el servidor (no estan en memoria). */
export function getServerActivityIds(actividades = [], memoryIds = new Set()) {
  const ids = (actividades || [])
    .map((item) => text(item?.actividad_id || item?.actividadId))
    .filter((id) => id && !memoryIds.has(id));
  return Array.from(new Set(ids));
}

/** Une memoria y servidor: memoria manda en sus actividades; del servidor se toma solo el resto. */
export function mergeConsultaRows(memoryRows = [], serverRows = [], memoryIds = new Set()) {
  return [
    ...(memoryRows || []),
    ...(serverRows || []).filter((row) => !memoryIds.has(getRowActivityId(row))),
  ];
}
