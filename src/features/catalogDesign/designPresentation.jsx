import React from "react";
import { classNames } from "../../utils/common";

export const PROJECT_STATES = ["planificacion", "en_diseno", "en_revision", "aprobado", "consolidado", "cancelado"];
export const PAGE_STATES = ["pendiente", "en_diseno", "en_revision", "ajustes", "aprobada", "rechazada", "lista_consolidar"];
export const ANNOTATION_COLOR = "#E53935";
export const COMMENT_CATEGORIES = [
  { id: "precio", label: "Precio / Promo", color: "#D97706", icon: "🏷️" },
  { id: "imagen", label: "Arte / Imagen", color: "#00A6C8", icon: "🖼️" },
  { id: "ajuste", label: "Ajuste Crítico", color: "#E53935", icon: "⚠️" },
  { id: "general", label: "General / Texto", color: "#006B3F", icon: "📝" },
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
  return <span className={classNames("catalog-design-badge", `catalog-design-state-${normalized.replace(/_/g, "-")}`)}>{normalized.replace(/_/g, " ")}</span>;
}

export function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toLocaleDateString();
}

export function getUserLabel(user) {
  return user ? `${user.nombre || user.email || "Usuario"}${user.rol ? ` (${user.rol})` : ""}` : "Sin asignar";
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
