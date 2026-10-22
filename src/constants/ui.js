import { CalendarDays, Download, History, Home, Images, ListChecks, Percent, Search, Settings, TrendingUp } from "lucide-react";
import { PERMISSIONS } from "./permissions.js";

// Módulos que no están en el menú porque se abren desde otra pantalla con un contexto ya elegido.
// Promociones solo se abre desde Inicio ("Trabajar catalogo") o desde Avances, para que el comprador
// elija explícitamente la campaña comercial y no cargue promociones en una actividad equivocada.
export const NAV_PARENT_MODULE = {
  promos: "home",
  avances: "home",
};

export const SIDEBAR_NAV_ITEMS = [
  { id: "ajustes", label: "Ajustes", icon: Settings, permission: PERMISSIONS.MANAGE_SETTINGS },
  { id: "home", label: "Inicio", icon: Home, permission: PERMISSIONS.VIEW_HOME },
  { id: "fidelizacion", label: "Fidelización", icon: Percent, permission: PERMISSIONS.VIEW_FIDELIZACION },
  { id: "consulta", label: "Consulta SKU", icon: Search, permission: PERMISSIONS.VIEW_CONSULTA },
  { id: "solicitudes", label: "Solicitudes", icon: ListChecks, permission: PERMISSIONS.VIEW_SOLICITUDES },
  { id: "seguimiento", label: "Seguimiento", icon: CalendarDays, permission: PERMISSIONS.VIEW_SEGUIMIENTO },
  { id: "catalogDesign", label: "Diseño Catálogos", icon: Images, permission: PERMISSIONS.VIEW_CATALOG_DESIGN },
  { id: "logs", label: "Logs", icon: History, permission: PERMISSIONS.VIEW_LOGS },
  { id: "consolidado", label: "Consolidado", icon: ListChecks, permission: PERMISSIONS.VIEW_CONSOLIDADO },
  { id: "margenes", label: "Márgenes", icon: TrendingUp, permission: PERMISSIONS.VIEW_MARGINS },
  { id: "export", label: "Exportar", icon: Download, permission: PERMISSIONS.VIEW_EXPORTS },
];

export const MOBILE_NAV_ITEMS = [
  { id: "home", label: "Inicio", icon: Home, permission: PERMISSIONS.VIEW_HOME },
  { id: "fidelizacion", label: "Fideliz.", icon: Percent, permission: PERMISSIONS.VIEW_FIDELIZACION },
  { id: "consulta", label: "Consulta", icon: Search, permission: PERMISSIONS.VIEW_CONSULTA },
  { id: "solicitudes", label: "Especiales", icon: ListChecks, permission: PERMISSIONS.VIEW_SOLICITUDES },
  { id: "seguimiento", label: "Gantt", icon: CalendarDays, permission: PERMISSIONS.VIEW_SEGUIMIENTO },
  { id: "catalogDesign", label: "Diseño", icon: Images, permission: PERMISSIONS.VIEW_CATALOG_DESIGN },
  { id: "consolidado", label: "Consol.", icon: ListChecks, permission: PERMISSIONS.VIEW_CONSOLIDADO },
  { id: "margenes", label: "Márgenes", icon: TrendingUp, permission: PERMISSIONS.VIEW_MARGINS },
  { id: "export", label: "Export", icon: Download, permission: PERMISSIONS.VIEW_EXPORTS },
  { id: "ajustes", label: "Ajustes", icon: Settings, permission: PERMISSIONS.MANAGE_SETTINGS },
  { id: "logs", label: "Logs", icon: History, permission: PERMISSIONS.VIEW_LOGS },
];

export const CONSOLIDADO_TABLE_HEADERS = [
  "Actividad",
  "Nombre actividad",
  "Oferta ID",
  "Tipo act.",
  "Canal",
  "Alcance",
  "Valor",
  "Segmenta",
  "Segmento cliente",
  "Comprador",
  "Tipo promo",
  "Oferta",
  "Rol",
  "Variante",
  "SKU",
  "N° Pág.",
  "Descripci\u00f3n",
  "Cant.",
  "Precio ahora",
  "Descuento",
  "Estado",
  "Comentario comprador",
];

export const LEGACY_EXPORT_PAGE_CARDS = [
  ["Pricing", "Archivo limpio para carga operativa"],
  ["Mercadeo", "Base para cat\u00e1logo PDF e impreso"],
  ["Planimetr\u00eda", "Tickets, r\u00f3tulos y g\u00f3ndolas"],
  ["Consolidado", "Pesta\u00f1a futura con todas las promociones"],
];
