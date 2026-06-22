import { Download, FileSpreadsheet, History, Home, ListChecks, Settings } from "lucide-react";

export const SIDEBAR_NAV_ITEMS = [
  { id: "ajustes", label: "Ajustes", icon: Settings },
  { id: "home", label: "Inicio", icon: Home },
  { id: "promos", label: "Promociones", icon: FileSpreadsheet },
  { id: "solicitudes", label: "Solicitudes", icon: ListChecks },
  { id: "logs", label: "Logs", icon: History },
  { id: "consolidado", label: "Consolidado", icon: ListChecks },
  { id: "export", label: "Exportar", icon: Download },
];

export const MOBILE_NAV_ITEMS = [
  { id: "home", label: "Inicio", icon: Home },
  { id: "promos", label: "Promos", icon: FileSpreadsheet },
  { id: "solicitudes", label: "Especiales", icon: ListChecks },
  { id: "ajustes", label: "Ajustes", icon: Settings },
  { id: "logs", label: "Logs", icon: History },
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
