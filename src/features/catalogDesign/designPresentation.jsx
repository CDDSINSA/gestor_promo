import React from "react";
import { AlertTriangle, FileText, ImageIcon, Tag } from "lucide-react";
import { classNames } from "../../utils/common";
import { ROLE_LABELS, normalizeRole } from "../../constants/permissions";

export const PROJECT_STATES = ["planificacion", "en_diseno", "en_revision", "aprobado", "consolidado", "cancelado"];
export const PAGE_STATES = ["pendiente", "en_diseno", "en_revision", "ajustes", "aprobada", "rechazada", "lista_consolidar"];
export const PAGE_STATE_LABELS = {
  pendiente: "Pendiente",
  en_diseno: "En diseño",
  en_revision: "En revisión",
  ajustes: "Ajustes",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  lista_consolidar: "Lista para consolidar",
};
export const PROJECT_STATE_LABELS = {
  planificacion: "Planificación",
  en_diseno: "En diseño",
  en_revision: "En revisión",
  aprobado: "Aprobado",
  consolidado: "Consolidado",
  cancelado: "Cancelado",
};
// Estados de página que disparan aprobación/rechazo formal y requieren confirmación.
export const CONFIRM_PAGE_STATES = new Set(["aprobada", "ajustes", "rechazada", "lista_consolidar"]);

function humanizeState(value) {
  const text = String(value || "").replace(/_/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

export function getPageStateLabel(state) {
  const key = String(state || "pendiente").toLowerCase();
  return PAGE_STATE_LABELS[key] || humanizeState(key);
}

export function getProjectStateLabel(state) {
  const key = String(state || "planificacion").toLowerCase();
  return PROJECT_STATE_LABELS[key] || humanizeState(key);
}

export const ANNOTATION_COLOR = "#E53935";
export const COMMENT_CATEGORIES = [
  { id: "precio", label: "Precio / Promo", color: "#D97706", Icon: Tag },
  { id: "imagen", label: "Arte / Imagen", color: "#00A6C8", Icon: ImageIcon },
  { id: "ajuste", label: "Ajuste crítico", color: "#E53935", Icon: AlertTriangle },
  { id: "general", label: "General / Texto", color: "#006B3F", Icon: FileText },
];

export const CATEGORY_COLORS = {
  precio: "#D97706",
  imagen: "#00A6C8",
  ajuste: "#E53935",
  general: "#006B3F",
  rechazo: "#E53935",
  aprobacion: "#006B3F",
  comentario: "#E53935",
};

export function Field({ label, children }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

export function StateBadge({ state }) {
  const normalized = String(state || "pendiente").toLowerCase();
  return <span className={classNames("catalog-design-badge", `catalog-design-state-${normalized.replace(/_/g, "-")}`)} title={getPageStateLabel(normalized)}>{getPageStateLabel(normalized)}</span>;
}

export function formatDate(value) {
  if (!value) return "";
  // Las fechas "AAAA-MM-DD" se interpretan como fecha local para evitar el corrimiento de un día por zona horaria.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  const date = dateOnly ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])) : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toLocaleDateString("es-NI");
}

export function getUserLabel(user) {
  if (!user) return "Sin asignar";
  const roleLabel = user.rol ? ROLE_LABELS[normalizeRole(user.rol)] || user.rol : "";
  return `${user.nombre || user.email || "Usuario"}${roleLabel ? ` (${roleLabel})` : ""}`;
}

export function getBuyerLabel(buyer) {
  return buyer ? `${buyer.comprador || "Comprador"}${buyer.division ? ` - ${buyer.division}` : ""}` : "Sin asignar";
}

export function getCommentStatus(comment) {
  return String(comment?.estado || "abierto").toLowerCase() === "resuelto" ? "resuelto" : "abierto";
}

export function normalizeCommentAnnotations(comment) {
  const raw = comment?.anotaciones || comment?.annotations || [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}
