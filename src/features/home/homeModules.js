// Inicio para todos los roles: saludo, texto por rol y tarjetas de módulos.
// Las tarjetas salen de la misma lista del menú lateral (SIDEBAR_NAV_ITEMS) filtrada por permiso,
// así que un permiso nuevo hace aparecer su tarjeta sin tocar Inicio.

import { ROLES, normalizeRole } from "../../constants/permissions.js";

export const HOME_MODULE_DESCRIPTIONS = {
  ajustes: "Catálogos base, compradores, maestro SKU, difusión y parámetros del sistema.",
  fidelizacion: "Canastos permanentes y descuentos por segmento para Comasa y Retail.",
  consulta: "Busca un SKU y revisa en qué promociones y campañas participa.",
  solicitudes: "Promociones especiales fuera de catálogo, con su responsable y estado.",
  seguimiento: "Calendario tipo Gantt de las campañas con sus fechas clave.",
  catalogDesign: "Páginas del catálogo: carga de diseños, revisión y observaciones.",
  logs: "Historial legible de los cambios registrados en el sistema.",
  consolidado: "Todas las promociones de la campaña en una vista, con exportación.",
  margenes: "Márgenes por grupo de oferta con semáforo y análisis ABC.",
  export: "Archivos para Pricing, Mercadeo y Planimetría.",
};

// Módulos que ya tienen su tarjeta de proceso en Inicio (Fidelización, Campañas, Solicitudes especiales).
export const HOME_PROCESS_MODULE_IDS = ["fidelizacion", "solicitudes", "especial", "promos", "avances"];

const ROLE_INTROS = {
  [ROLES.ADMIN]: "Tienes acceso completo al portal. Elige un proceso comercial para comenzar o entra directo a otro módulo desde los accesos de abajo.",
  [ROLES.BUYER]: "Desde aquí trabajas tus campañas comerciales, la fidelización de clientes y las solicitudes especiales. Elige un proceso para comenzar o entra directo a otro módulo desde los accesos de abajo.",
  [ROLES.MARK]: "Desde aquí trabajas el diseño de los catálogos, revisas el consolidado de promociones con sus comentarios y das seguimiento al calendario de campañas. Elige un módulo para comenzar.",
  [ROLES.OPER]: "Desde aquí atiendes las solicitudes especiales, consultas SKU y revisas el consolidado, la fidelización y los márgenes para su ejecución. Elige un módulo para comenzar.",
  [ROLES.AUD]: "Desde aquí revisas el calendario de campañas y el historial de cambios del sistema. Elige un módulo para comenzar.",
  [ROLES.DESIGNER]: "Desde aquí subes las páginas de los catálogos y das seguimiento al calendario de campañas. Elige un módulo para comenzar.",
};

const DEFAULT_INTRO = "Estos son los módulos disponibles para tu usuario. Elige uno para comenzar.";

export function getGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

function capitalize(word) {
  const text = String(word || "").trim();
  if (!text) return "";
  return text.charAt(0).toLocaleUpperCase("es") + text.slice(1).toLocaleLowerCase("es");
}

// Primer nombre del usuario: nombre del perfil, y si no hay, la parte del correo antes del punto o la @.
export function getFirstName(appUser) {
  const nombre = String(appUser?.nombre || "").trim();
  if (nombre) return capitalize(nombre.split(/\s+/)[0]);
  const email = String(appUser?.email || "").trim();
  if (!email.includes("@")) return "";
  return capitalize(email.split("@")[0].split(/[._-]/)[0]);
}

export function getRoleIntro(role) {
  return ROLE_INTROS[normalizeRole(role)] || DEFAULT_INTRO;
}

// Tarjetas de módulos visibles para el rol. Inicio nunca aparece; excludeIds quita los que ya tienen tarjeta de proceso.
export function getHomeModules(items = [], can = () => false, { excludeIds = [] } = {}) {
  const excluded = new Set(["home", ...excludeIds]);
  return items
    .filter((item) => !excluded.has(item.id) && can(item.permission))
    .map((item) => ({ ...item, description: HOME_MODULE_DESCRIPTIONS[item.id] || "" }));
}
