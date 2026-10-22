// Carga por campaña (bajo demanda).
//
// Con la bandera activa, el inicio de sesion no trae promociones: cada pantalla pide
// las campañas que necesita. Con la bandera apagada la app funciona como antes
// (todo al inicio). Apagarla es el rollback: no requiere cambios en la base.
//
// Activar:   VITE_CARGA_POR_CAMPANA=true  en .env.local (y reiniciar/reconstruir)
// Forzar en un navegador (pruebas): localStorage "promo.cargaPorCampana" = "on" | "off"

const STORAGE_KEY = "promo.cargaPorCampana";

function text(value) {
  return String(value ?? "").trim();
}

function readEnvFlag() {
  try {
    return import.meta.env?.VITE_CARGA_POR_CAMPANA;
  } catch {
    return undefined;
  }
}

function readStorageOverride() {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function isCampaignLoadingEnabled({ env = readEnvFlag(), override = readStorageOverride() } = {}) {
  const forced = text(override).toLowerCase();
  if (forced === "on") return true;
  if (forced === "off") return false;
  return ["true", "1", "si", "on"].includes(text(env).toLowerCase());
}

/**
 * Qué datos de promociones necesita cada modulo.
 * - campaigns: solo las campañas indicadas.
 * - especiales: las solicitudes especiales (las carga su propio refresco).
 * - all: todo (modulos aun no migrados: Exportes, Consulta SKU, Ajustes).
 * - none: no necesita lineas (usa resumenes del servidor o no usa promociones).
 *   Fidelizacion trabaja con su canasto y el maestro SKU; las lineas de catalogos
 *   cargadas solo completan descripcion/comprador si ya estan en memoria.
 */
export function getModuleCampaignScope(active, { catalogoActivo = null, catalogoAvanceActivo = null } = {}) {
  const catalogId = (catalogo) => text(catalogo?.id || catalogo?.catalogo_id);
  switch (active) {
    case "promos":
      return catalogId(catalogoActivo) ? { type: "campaigns", ids: [catalogId(catalogoActivo)] } : { type: "none" };
    case "avances":
      return catalogId(catalogoAvanceActivo) ? { type: "campaigns", ids: [catalogId(catalogoAvanceActivo)] } : { type: "none" };
    case "solicitudes":
    case "especial":
      return { type: "especiales" };
    case "export":
    case "consulta":
    case "ajustes":
      return { type: "all" };
    default:
      // home, seguimiento, margenes, logs, fidelizacion.
      // catalogDesign pide su campaña al abrir un proyecto; consolidado, al presionar Buscar.
      return { type: "none" };
  }
}

/** Texto para el aviso de carga: "7 catálogos y 1 solicitud especial". */
export function describeCampaignTypes(ids = [], actividades = []) {
  const typeById = new Map((actividades || []).map((item) => [
    text(item?.actividad_id || item?.actividadId),
    text(item?.tipo_actividad || item?.tipoActividad).toUpperCase(),
  ]));
  const labels = {
    CATALOGO: ["catálogo", "catálogos"],
    ESPECIAL: ["solicitud especial", "solicitudes especiales"],
    FIDELIZACION: ["actividad de fidelización", "actividades de fidelización"],
  };
  const counts = new Map();
  (ids || []).forEach((id) => {
    const type = typeById.get(text(id)) || "OTRA";
    counts.set(type, (counts.get(type) || 0) + 1);
  });
  const parts = Array.from(counts.entries()).map(([type, count]) => {
    const [one, many] = labels[type] || ["actividad", "actividades"];
    return `${count} ${count === 1 ? one : many}`;
  });
  if (parts.length <= 1) return parts[0] || "";
  return `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
}

export function getPendingCampaignIds(requestedIds = [], loadedIds = new Set()) {
  return Array.from(new Set((requestedIds || []).map(text).filter(Boolean))).filter((id) => !loadedIds.has(id));
}

export function getRowActivityId(row = {}) {
  return text(row.actividadId || row.actividad_id || row.catalogo_id || row.catalogoId);
}

/** Reemplaza las filas de las actividades indicadas; deja intactas las demas. */
export function replaceActivityItems(currentItems = [], activityIds, nextItems = [], getActivityId = getRowActivityId) {
  const activities = new Set(Array.from(activityIds || []).map(text).filter(Boolean));
  return [
    ...(currentItems || []).filter((item) => !activities.has(getActivityId(item))),
    ...(nextItems || []),
  ];
}

/** Actividades presentes en un conjunto de filas (para marcar como cargadas tras una carga completa). */
export function collectActivityIds(rows = []) {
  return new Set((rows || []).map(getRowActivityId).filter(Boolean));
}
