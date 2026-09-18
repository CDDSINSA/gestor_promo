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
  const [loadStatus, setLoadStatus] = useState({ type: "idle", message: "" });
  const [realtimeStatus, setRealtimeStatus] = useState({ type: "idle", message: "" });
  const [isOpen, setIsOpen] = useState(false);
  const onIncomingRef = useRef(onIncoming);
  const refreshRef = useRef(async () => {});
  const generationRef = useRef(0);
  const ownerRef = useRef("");
  const sessionToken = connection?.session?.access_token || connection?.appSession?.access_token || connection?.authSession?.access_token || "";
  const unreadCount = useMemo(() => items.filter((item) => !item.leida).length, [items]);
  const status = loadStatus.type === "error" ? loadStatus
    : realtimeStatus.type === "error" ? realtimeStatus : loadStatus;

  useEffect(() => {
    onIncomingRef.current = onIncoming;
  }, [onIncoming]);

  const refresh = () => refreshRef.current();

  useEffect(() => {
    const generation = ++generationRef.current;
    const owner = `${connection?.url || ""}:${currentUserId}`;
    if (ownerRef.current !== owner || !enabled) {
      setItems([]);
      setIsOpen(false);
      ownerRef.current = owner;
    }
    setLoadStatus({ type: "idle", message: "" });
    setRealtimeStatus({ type: "idle", message: "" });
    if (!enabled || !sessionToken || !currentUserId) {
      refreshRef.current = async () => {};
      return undefined;
    }
    let active = true;
    let requestId = 0;
    let revision = 0;
    const incoming = new Map();
    let client = null;
    let channel = null;

    const reload = async () => {
      const request = ++requestId;
      const startRevision = revision;
      setLoadStatus({ type: "loading", message: "Consultando notificaciones..." });
      try {
        const rows = await loadLiveNotifications(connection, { limit: 50 });
        if (!active || request !== requestId) return;
        // Preserve events received while the HTTP snapshot was in flight.
        let next = rows;
        incoming.forEach(({ item, version }, id) => {
          if (version > startRevision) next = mergeNotification(next, item);
          else incoming.delete(id);
        });
        setItems(next);
        setLoadStatus({ type: "ready", message: "" });
      } catch (error) {
        if (active && request === requestId) setLoadStatus({ type: "error", message: error.message || "No se pudieron cargar las notificaciones." });
      }
    };
    refreshRef.current = reload;
    void reload();

    try {
      client = createNotificationsRealtimeClient(connection);
      if (!client) throw new Error("No se pudo activar Realtime. Use Actualizar para consultar los avisos.");
      const handlePayload = (payload) => {
        if (!active) return;
        const row = payload.new || {};
        if (String(row.destinatario_usuario_id || "") !== String(currentUserId)) return;
        const item = mapRealtimeNotification(row);
        if (!item.id) return;
        incoming.set(item.id, { item, version: ++revision });
        setItems((current) => mergeNotification(current, item));
        if (payload.eventType === "INSERT") onIncomingRef.current?.(item);
      };
      const filter = { schema: "public", table: "notificaciones_envivo", filter: `destinatario_usuario_id=eq.${currentUserId}` };
      channel = client.channel(`live-notifications-${currentUserId}`)
        .on("postgres_changes", { ...filter, event: "INSERT" }, handlePayload)
        .on("postgres_changes", { ...filter, event: "UPDATE" }, handlePayload)
        .subscribe((state) => {
          if (!active) return;
          if (state === "SUBSCRIBED") {
            setRealtimeStatus({ type: "ready", message: "" });
            void reload();
          }
          if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(state)) {
            setRealtimeStatus({ type: "error", message: "Conexion en vivo interrumpida. Puede consultar los avisos con Actualizar." });
          }
        });
    } catch (error) {
      setRealtimeStatus({ type: "error", message: error.message || "No se pudo activar Realtime." });
    }
    const onVisible = () => { if (document.visibilityState === "visible") void reload(); };
    const onOnline = () => { void reload(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      active = false;
      if (generationRef.current === generation) generationRef.current++;
      refreshRef.current = async () => {};
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      if (channel && client) void client.removeChannel(channel);
    };
  }, [enabled, sessionToken, currentUserId, connection?.url, connection?.anonKey]);

  const markRead = async (id) => {
    const generation = generationRef.current;
    setItems((current) => current.map((item) => item.id === id ? { ...item, leida: true, leidaEn: new Date().toISOString() } : item));
    try {
      const updated = await markLiveNotificationRead(connection, id);
      if (generation !== generationRef.current) return;
      if (updated?.id) setItems((current) => mergeNotification(current, updated));
    } catch {
      if (generation !== generationRef.current) return;
      await refresh();
      if (generation !== generationRef.current) return;
      setLoadStatus({ type: "error", message: "No se pudo guardar la lectura del aviso. Vuelva a intentarlo." });
    }
  };

  const markAllRead = async () => {
    const generation = generationRef.current;
    const timestamp = new Date().toISOString();
    setItems((current) => current.map((item) => ({ ...item, leida: true, leidaEn: item.leidaEn || timestamp })));
    try {
      const updated = await markAllLiveNotificationsRead(connection);
      if (generation !== generationRef.current) return;
      setItems((current) => {
        const next = new Map(current.map((item) => [item.id, item]));
        updated.forEach((item) => next.set(item.id, item));
        return sortNotifications(Array.from(next.values()));
      });
    } catch {
      if (generation !== generationRef.current) return;
      await refresh();
      if (generation !== generationRef.current) return;
      setLoadStatus({ type: "error", message: "No se pudo guardar la lectura del aviso. Vuelva a intentarlo." });
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
