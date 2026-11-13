// Edición de la cabecera de una solicitud especial desde Promoción especial.
//
// El comprador solo cambia datos de la solicitud (nombre, canal, fechas,
// comprador y motivo). Lo del tablero (estado, responsable, fechas y horas de
// cada estado, IDs de promo/oferta) se toma de la versión más reciente que
// tenga la app, nunca de la copia que quedó en pantalla al crearla, y no se
// reinicia fecha_estado. En la base, el trigger special_request_buyer_guard
// hace lo mismo para BUYER y es quien decide el estado final.
//
// Si un comprador cambia la fecha fin de una solicitud Aprobada o Finalizada,
// la base la pasa a «En trabajo» y avisa a OPER
// (supabase_g_comercial_especiales_cambio_fecha_fin.sql). movesToWork sirve
// para avisarle al comprador en pantalla.

export const SPECIAL_HEADER_FIELDS = [
  "nombre_actividad",
  "canal",
  "fecha_inicio",
  "fecha_fin",
  "comprador",
  "solicitante",
  "motivo_solicitud",
];

const STATES_REOPENED_BY_END_DATE = ["Aprobado", "Aprovado", "Finalizado"];

const isFidelizacionId = (id) => String(id || "").startsWith("FID-");

export function buildSpecialRequestHeaderUpdate(latest, draft) {
  const base = latest || {};
  const header = {
    nombre_actividad: draft.nombre_actividad,
    canal: draft.canal,
    fecha_inicio: draft.fecha_inicio,
    fecha_fin: draft.fecha_fin,
    comprador: draft.comprador,
    solicitante: draft.comprador,
    motivo_solicitud: draft.motivo_solicitud,
  };
  const endDateChanged = String(base.fecha_fin || "") !== String(header.fecha_fin || "");
  const movesToWork =
    endDateChanged &&
    !isFidelizacionId(base.actividad_id) &&
    STATES_REOPENED_BY_END_DATE.includes(String(base.estado || "").trim());

  // El estado no se cambia aquí: lo mueve la base (solo cuando guarda un
  // comprador) y suma las horas del tramo anterior.
  const activity = { ...base, ...header };

  return { activity, endDateChanged, movesToWork, previousStatus: base.estado || "" };
}
