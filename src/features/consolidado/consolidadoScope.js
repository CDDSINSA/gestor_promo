// Consolidado con carga por campaña: al presionar Buscar se cargan solo las
// actividades que pueden cumplir los filtros. Sin filtros se cargan todas.
//
// Solo se usan los filtros que dependen de la actividad (actividad/catálogo,
// tipo de actividad, canal y comprador). Los filtros por linea (SKU, tipo de
// promo, alcance, comentarios) no permiten descartar actividades sin consultar
// el servidor; se aplican despues sobre las lineas cargadas, como antes.
// El resultado puede incluir actividades de mas, nunca de menos.

export const CONSOLIDADO_DEFAULT_FILTERS = Object.freeze({
  comprador: "Todos",
  tipo: "Todos",
  tipoActividad: "Todos",
  canal: "Todos",
  alcance: "Todos",
  estadoComentario: "Todos",
  sku: "",
  actividadCatalogo: "",
});

function text(value) {
  return String(value ?? "").trim();
}

export function hasConsolidadoFilters(filters = {}) {
  return Object.entries(CONSOLIDADO_DEFAULT_FILTERS).some(([key, value]) => text(filters[key] ?? value) !== text(value));
}

/**
 * @param filters   filtros del Consolidado
 * @param activities actividades normalizadas (actividad_id, nombre_actividad, tipo_actividad, canal, comprador, solicitante)
 * @param options.catalogNames  Map id -> nombre del catalogo
 * @param options.resumen       filas de v_catalogo_resumen (actividad_id, comprador, promociones_count)
 * @param options.normalize     normalizador de texto de la app (normalizeCanal)
 * @param options.channelMatches  channelMatchesFilter de la app
 */
export function getConsolidadoCampaignIds(filters = {}, activities = [], {
  catalogNames = new Map(),
  resumen = [],
  normalize = (value) => text(value).toLowerCase(),
  channelMatches = (canal, filtro) => text(canal) === text(filtro),
} = {}) {
  const term = normalize(filters.actividadCatalogo || "");
  // Actividad elegida en la lista desplegable: su ID exacto. Texto libre: "contiene".
  const rawActivity = text(filters.actividadCatalogo);
  const exactId = rawActivity && (activities || []).some((activity) => text(activity?.actividad_id || activity?.actividadId) === rawActivity)
    ? rawActivity
    : "";
  const comprador = text(filters.comprador || "Todos");
  const resumenRows = Array.isArray(resumen) ? resumen : [];
  // Sin resumen (vista no disponible) no se puede saber que comprador tiene lineas en cada catalogo.
  const canNarrowByBuyer = comprador !== "Todos" && comprador !== "Sin comprador" && resumenRows.length > 0;
  const buyerActivities = new Set(resumenRows
    .filter((item) => text(item.comprador) === comprador && Number(item.promociones_count) > 0)
    .map((item) => text(item.actividad_id || item.actividadId)));

  return (activities || []).filter((activity) => {
    const id = text(activity?.actividad_id || activity?.actividadId);
    if (!id) return false;
    const name = text(activity.nombre_actividad || activity.nombreActividad || activity.nombre || catalogNames.get(id));
    if (exactId ? id !== exactId : term && !normalize(`${id} ${name}`).includes(term)) return false;
    if (filters.tipoActividad && filters.tipoActividad !== "Todos"
      && text(activity.tipo_actividad || "CATALOGO") !== filters.tipoActividad) return false;
    if (filters.canal && filters.canal !== "Todos") {
      const canal = text(activity.canal) || "Sin canal";
      const matches = canal === "Sin canal" ? filters.canal === "Sin canal" : channelMatches(canal, filters.canal);
      if (!matches) return false;
    }
    if (canNarrowByBuyer) {
      const activityBuyer = text(activity.comprador || activity.solicitante);
      if (!buyerActivities.has(id) && activityBuyer !== comprador) return false;
    }
    return true;
  }).map((activity) => text(activity.actividad_id || activity.actividadId));
}
