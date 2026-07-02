import { Download, FileSpreadsheet, History, Home, ListChecks, Search, Settings } from "lucide-react";
import { PERMISSIONS } from "./permissions";

export const SIDEBAR_NAV_ITEMS = [
  { id: "ajustes", label: "Ajustes", icon: Settings, permission: PERMISSIONS.MANAGE_SETTINGS },
  { id: "home", label: "Inicio", icon: Home, permission: PERMISSIONS.VIEW_HOME },
  { id: "promos", label: "Promociones", icon: FileSpreadsheet, permission: PERMISSIONS.VIEW_PROMOS },
  { id: "consulta", label: "Consulta SKU", icon: Search, permission: PERMISSIONS.VIEW_CONSULTA },
  { id: "solicitudes", label: "Solicitudes", icon: ListChecks, permission: PERMISSIONS.VIEW_SOLICITUDES },
  { id: "logs", label: "Logs", icon: History, permission: PERMISSIONS.VIEW_LOGS },
  { id: "consolidado", label: "Consolidado", icon: ListChecks, permission: PERMISSIONS.VIEW_CONSOLIDADO },
  { id: "export", label: "Exportar", icon: Download, permission: PERMISSIONS.VIEW_EXPORTS },
];

export const MOBILE_NAV_ITEMS = [
  { id: "home", label: "Inicio", icon: Home, permission: PERMISSIONS.VIEW_HOME },
  { id: "promos", label: "Promos", icon: FileSpreadsheet, permission: PERMISSIONS.VIEW_PROMOS },
  { id: "consulta", label: "Consulta", icon: Search, permission: PERMISSIONS.VIEW_CONSULTA },
  { id: "solicitudes", label: "Especiales", icon: ListChecks, permission: PERMISSIONS.VIEW_SOLICITUDES },
  { id: "consolidado", label: "Consol.", icon: ListChecks, permission: PERMISSIONS.VIEW_CONSOLIDADO },
  { id: "export", label: "Export", icon: Download, permission: PERMISSIONS.VIEW_EXPORTS },
  { id: "ajustes", label: "Ajustes", icon: Settings, permission: PERMISSIONS.MANAGE_SETTINGS },
  { id: "logs", label: "Logs", icon: History, permission: PERMISSIONS.VIEW_LOGS },
];

export const CONSOLIDADO_TABLE_HEADERS = [
  "Actividad",
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
  "Descripción",
  "Cant.",
  "Precio ahora",
  "Descuento",
  "Revisión Mercadeo",
];

export const LEGACY_EXPORT_PAGE_CARDS = [
  ["Pricing", "Archivo limpio para carga operativa"],
  ["Mercadeo", "Base para catálogo PDF e impreso"],
  ["Planimetría", "Tickets, rótulos y góndolas"],
  ["Consolidado", "Pestaña futura con todas las promociones"],
];
