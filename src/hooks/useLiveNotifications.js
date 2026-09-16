import { useEffect, useMemo, useRef, useState } from "react";
import {
  createNotificationsRealtimeClient,
  loadLiveNotifications,
  mapRealtimeNotification,
  markAllLiveNotificationsRead,
  markLiveNotificationRead,
} from "../services/supabaseService";

function sortNotifications(rows = []) {
  return [...rows].sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
}

function mergeNotification(rows, item) {
  if (!item?.id) return rows;
  const exists = rows.some((row) => row.id === item.id);
  const nextRows = exists ? rows.map((row) => row.id === item.id ? { ...row, ...item } : row) : [item, ...rows];
  return sortNotifications(nextRows).slice(0, 50);
}

export function useLiveNotifications({ connection, currentUserId = "", enabled = true, onIncoming } = {}) {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState({ type: "idle", message: "" });
  const [isOpen, setIsOpen] = useState(false);
  const onIncomingRef = useRef(onIncoming);
  const sessionToken = connection?.session?.access_token || connection?.appSession?.access_token || connection?.authSession?.access_token || "";
  const unreadCount = useMemo(() => items.filter((item) => !item.leida).length, [items]);

  useEffect(() => {
    onIncomingRef.current = onIncoming;
  }, [onIncoming]);

  const refresh = async () => {
    if (!enabled || !sessionToken || !currentUserId) {
      setItems([]);
      setStatus({ type: "idle", message: "" });
      return;
    }
    setStatus({ type: "loading", message: "Consultando notificaciones..." });
    try {
      const nextItems = await loadLiveNotifications(connection);
      setItems(nextItems);
      setStatus({ type: "ready", message: "" });
    } catch (error) {
      setStatus({ type: "error", message: error.message || "No se pudieron cargar las notificaciones." });
    }
  };

  useEffect(() => {
    void refresh();
  }, [enabled, sessionToken, currentUserId]);

  useEffect(() => {
    if (!enabled || !sessionToken || !currentUserId) return undefined;
    let active = true;
    let client = null;
    let channel = null;

    try {
      client = createNotificationsRealtimeClient(connection);
      if (!client) return undefined;
      channel = client
        .channel("live-notifications")
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "notificaciones_envivo",
          filter: `destinatario_usuario_id=eq.${currentUserId}`,
        }, (payload) => {
          if (!active) return;
          const notification = mapRealtimeNotification(payload.new);
          setItems((current) => mergeNotification(current, notification));
          onIncomingRef.current?.(notification);
        })
        .subscribe((state) => {
          if (!active) return;
          if (state === "SUBSCRIBED") setStatus({ type: "ready", message: "" });
          if (state === "CHANNEL_ERROR" || state === "TIMED_OUT") {
            setStatus({ type: "error", message: "Realtime de notificaciones no esta disponible." });
          }
        });
    } catch (error) {
      setStatus({ type: "error", message: error.message || "No se pudo activar Realtime." });
    }

    return () => {
      active = false;
      if (channel && client) client.removeChannel(channel);
    };
  }, [enabled, sessionToken, currentUserId, connection?.url, connection?.anonKey]);

  const markRead = async (id) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, leida: true, leidaEn: new Date().toISOString() } : item));
    try {
      const updated = await markLiveNotificationRead(connection, id);
      if (updated?.id) setItems((current) => mergeNotification(current, updated));
    } catch {
      void refresh();
    }
  };

  const markAllRead = async () => {
    const timestamp = new Date().toISOString();
    setItems((current) => current.map((item) => ({ ...item, leida: true, leidaEn: item.leidaEn || timestamp })));
    try {
      const updated = await markAllLiveNotificationsRead(connection);
      setItems((current) => {
        const next = new Map(current.map((item) => [item.id, item]));
        updated.forEach((item) => next.set(item.id, item));
        return sortNotifications(Array.from(next.values()));
      });
    } catch {
      void refresh();
    }
  };

  return {
    items,
    unreadCount,
    status,
    isOpen,
    setIsOpen,
    refresh,
    markRead,
    markAllRead,
  };
}
