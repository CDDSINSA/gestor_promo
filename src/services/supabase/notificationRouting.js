import { callRpc } from "./http";

// Configuración de destinatarios de avisos (docs/supabase_notificaciones_grupos.sql). Solo ADMIN.
export async function loadNotificationRouting(connection) {
  const data = await callRpc(connection, "get_notification_routing");
  return {
    eventos: Array.isArray(data?.eventos) ? data.eventos : [],
    grupos: Array.isArray(data?.grupos) ? data.grupos : [],
    suscripciones: Array.isArray(data?.suscripciones) ? data.suscripciones : [],
    usuarios: Array.isArray(data?.usuarios) ? data.usuarios : [],
    correo: data?.correo && typeof data.correo === "object" ? data.correo : {},
  };
}

export function saveNotificationSubscriptions(connection, { tipoEvento, roles, grupos, dueno, correo }) {
  return callRpc(connection, "set_notification_subscriptions", {
    p_tipo_evento: tipoEvento,
    p_roles: roles,
    p_grupos: grupos,
    p_dueno: Boolean(dueno),
    p_correo: typeof correo === "boolean" ? correo : null,
  });
}

export function saveNotificationGroup(connection, { id, nombre, descripcion, activo, miembros }) {
  return callRpc(connection, "save_notification_group", {
    p_id: id || null,
    p_nombre: String(nombre || "").trim(),
    p_descripcion: String(descripcion || "").trim(),
    p_activo: activo !== false,
    p_miembros: miembros || [],
  });
}

export function deleteNotificationGroup(connection, id) {
  return callRpc(connection, "delete_notification_group", { p_id: id });
}
