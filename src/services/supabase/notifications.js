import { createClient } from "@supabase/supabase-js";
import {
  assertAllowedSupabaseHost,
  cleanText,
  getAnonKey,
} from "./config";
import { buildQuery, callRpc, supabaseRequest } from "./http";

function getSessionToken(connection = {}) {
  return connection.session?.access_token || connection.appSession?.access_token || connection.authSession?.access_token || "";
}

function normalizeNotification(row = {}) {
  return {
    id: row.id,
    tipoEvento: row.tipo_evento || row.tipoEvento || "",
    titulo: row.titulo || "",
    mensaje: row.mensaje || "",
    actorNombre: row.actor_nombre || row.actorNombre || "",
    actorRol: row.actor_rol || row.actorRol || "",
    destinatarioUsuarioId: row.destinatario_usuario_id || row.destinatarioUsuarioId || "",
    destinatarioRol: row.destinatario_rol || row.destinatarioRol || "",
    campanaId: row.campana_id || row.campanaId || "",
    promocionId: row.promocion_id || row.promocionId || "",
    comentarioId: row.comentario_id || row.comentarioId || "",
    urlModulo: row.url_modulo || row.urlModulo || "",
    metadata: row.metadata || {},
    leida: row.leida === true,
    leidaEn: row.leida_en || row.leidaEn || "",
    createdAt: row.created_at || row.createdAt || "",
  };
}

export function createNotificationsRealtimeClient(connection = {}) {
  const supabaseUrl = assertAllowedSupabaseHost(connection);
  const anonKey = getAnonKey(connection);
  const token = getSessionToken(connection);
  if (!anonKey || !token) return null;

  const client = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
  client.realtime.setAuth(token);
  return client;
}

export async function loadLiveNotifications(connection, { limit = 30 } = {}) {
  const pageSize = Math.max(1, Math.min(50, Number(limit || 30)));
  const rows = await supabaseRequest(connection, `/rest/v1/notificaciones_envivo${buildQuery({
    select: "id,tipo_evento,titulo,mensaje,actor_nombre,actor_rol,destinatario_usuario_id,destinatario_rol,campana_id,promocion_id,comentario_id,url_modulo,metadata,leida,leida_en,created_at",
    order: "created_at.desc",
    limit: pageSize,
  })}`);
  return Array.isArray(rows) ? rows.map(normalizeNotification) : [];
}

export async function markLiveNotificationRead(connection, notificationId) {
  const id = cleanText(notificationId);
  if (!id) return null;
  const rows = await supabaseRequest(connection, `/rest/v1/notificaciones_envivo${buildQuery({ id: `eq.${id}` })}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ leida: true, leida_en: new Date().toISOString() }),
  });
  return Array.isArray(rows) ? normalizeNotification(rows[0]) : normalizeNotification(rows);
}

export async function markAllLiveNotificationsRead(connection) {
  const rows = await supabaseRequest(connection, `/rest/v1/notificaciones_envivo${buildQuery({ leida: "eq.false" })}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ leida: true, leida_en: new Date().toISOString() }),
  });
  return Array.isArray(rows) ? rows.map(normalizeNotification) : [];
}

export async function createLiveNotification(connection, event = {}) {
  const roles = (event.destinatarioRoles || event.roles || [])
    .map((role) => cleanText(role).toUpperCase())
    .filter(Boolean);
  const userIds = (event.destinatarioUsuarioIds || event.usuarioIds || [])
    .map(cleanText)
    .filter(Boolean);
  const buyerIds = (event.destinatarioBuyerIds || event.buyerIds || [])
    .map(cleanText)
    .filter(Boolean);
  if (!roles.length && !userIds.length && !buyerIds.length) return { inserted: 0, skipped: "without_recipients" };

  return callRpc(connection, "create_live_notification", {
    p_tipo_evento: cleanText(event.tipoEvento || event.tipo_evento),
    p_titulo: cleanText(event.titulo),
    p_mensaje: cleanText(event.mensaje),
    p_legacy_actividad_id: cleanText(event.actividadId || event.actividad_id),
    p_legacy_row_id: cleanText(event.rowId || event.row_id),
    p_comentario_id: cleanText(event.comentarioId || event.comentario_id),
    p_destinatario_roles: roles,
    p_destinatario_usuario_ids: userIds,
    p_destinatario_buyer_ids: buyerIds,
    p_url_modulo: cleanText(event.urlModulo || event.url_modulo),
    p_metadata: event.metadata || {},
  });
}

export function mapRealtimeNotification(row = {}) {
  return normalizeNotification(row);
}
