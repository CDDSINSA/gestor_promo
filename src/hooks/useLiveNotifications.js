import { useEffect, useMemo, useRef, useState } from "react";
import {
  countUnreadLiveNotifications,
  createNotificationsRealtimeClient,
  loadLiveNotifications,
  mapRealtimeNotification,
  markAllLiveNotificationsRead,
  markLiveNotificationRead,
} from "../services/supabaseService";

const PAGE_SIZE = 20;
export const NOTIFICATION_VIEWS = { UNREAD: "unread", ALL: "all" };

function sortNotifications(rows = []) {
  return [...rows].sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
}

// In the unread view a notification disappears as soon as it is read.
function mergeNotification(rows, item, view) {
  if (!item?.id) return rows;
  if (view === NOTIFICATION_VIEWS.UNREAD && item.leida) return rows.filter((row) => row.id !== item.id);
  const exists = rows.some((row) => row.id === item.id);
  const nextRows = exists ? rows.map((row) => row.id === item.id ? { ...row, ...item } : row) : [item, ...rows];
  return sortNotifications(nextRows);
}

function mergePage(rows, page, view) {
  return (page || []).reduce((current, item) => mergeNotification(current, item, view), rows);
}

export function useLiveNotifications({ connection, currentUserId = "", enabled = true, onIncoming } = {}) {
  const [items, setItems] = useState([]);
  const [view, setView] = useState(NOTIFICATION_VIEWS.UNREAD);
  const [hasMore, setHasMore] = useState(false);
  const [unreadTotal, setUnreadTotal] = useState(null);
  const [loadStatus, setLoadStatus] = useState({ type: "idle", message: "" });
  const [realtimeStatus, setRealtimeStatus] = useState({ type: "idle", message: "" });
  const [isOpen, setIsOpen] = useState(false);
  const onIncomingRef = useRef(onIncoming);
  const itemsRef = useRef(items);
  const refreshRef = useRef(async () => {});
  const loadMoreRef = useRef(async () => {});
  const generationRef = useRef(0);
  const ownerRef = useRef("");
  itemsRef.current = items;
  const sessionToken = connection?.session?.access_token || connection?.appSession?.access_token || connection?.authSession?.access_token || "";
  const loadedUnread = useMemo(() => items.filter((item) => !item.leida).length, [items]);
  // The server count also covers unread notifications beyond the loaded page.
  const unreadCount = unreadTotal === null ? loadedUnread : Math.max(unreadTotal, loadedUnread);
  const status = loadStatus.type === "error" ? loadStatus
    : realtimeStatus.type === "error" ? realtimeStatus : loadStatus;

  useEffect(() => {
    onIncomingRef.current = onIncoming;
  }, [onIncoming]);

  const refresh = () => refreshRef.current();
  const loadMore = () => loadMoreRef.current();

  useEffect(() => {
    const generation = ++generationRef.current;
    const owner = `${connection?.url || ""}:${currentUserId}`;
    if (ownerRef.current !== owner || !enabled) {
      setItems([]);
      setUnreadTotal(null);
      setHasMore(false);
      setIsOpen(false);
      ownerRef.current = owner;
    }
    setLoadStatus({ type: "idle", message: "" });
    setRealtimeStatus({ type: "idle", message: "" });
    if (!enabled || !sessionToken || !currentUserId) {
      refreshRef.current = async () => {};
      loadMoreRef.current = async () => {};
      return undefined;
    }
    let active = true;
    let requestId = 0;
    let revision = 0;
    const incoming = new Map();
    const unreadOnly = view === NOTIFICATION_VIEWS.UNREAD;
    let client = null;
    let channel = null;

    const recount = async () => {
      try {
        const total = await countUnreadLiveNotifications(connection);
        if (active) setUnreadTotal(total);
      } catch {
        if (active) setUnreadTotal(null);
      }
    };

    const reload = async () => {
      const request = ++requestId;
      const startRevision = revision;
      setLoadStatus({ type: "loading", message: "Consultando notificaciones..." });
      void recount();
      try {
        const rows = await loadLiveNotifications(connection, { limit: PAGE_SIZE, unreadOnly });
        if (!active || request !== requestId) return;
        // Preserve events received while the HTTP snapshot was in flight.
        let next = mergePage([], rows, view);
        incoming.forEach(({ item, version }, id) => {
          if (version > startRevision) next = mergeNotification(next, item, view);
          else incoming.delete(id);
        });
        setItems(next);
        setHasMore(rows.length === PAGE_SIZE);
        setLoadStatus({ type: "ready", message: "" });
      } catch (error) {
        if (active && request === requestId) setLoadStatus({ type: "error", message: error.message || "No se pudieron cargar las notificaciones." });
      }
    };

    const more = async () => {
      const request = requestId;
      const oldest = itemsRef.current[itemsRef.current.length - 1]?.createdAt || "";
      if (!oldest) return;
      setLoadStatus({ type: "loading", message: "Cargando notificaciones anteriores..." });
      try {
        const rows = await loadLiveNotifications(connection, { limit: PAGE_SIZE, unreadOnly, before: oldest });
        if (!active || request !== requestId) return;
        setItems((current) => mergePage(current, rows, view));
        setHasMore(rows.length === PAGE_SIZE);
        setLoadStatus({ type: "ready", message: "" });
      } catch (error) {
        if (active && request === requestId) setLoadStatus({ type: "error", message: error.message || "No se pudieron cargar las notificaciones." });
      }
    };
    refreshRef.current = reload;
    loadMoreRef.current = more;
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
        setItems((current) => mergeNotification(current, item, view));
        if (payload.eventType === "INSERT") {
          if (!item.leida) setUnreadTotal((total) => total === null ? null : total + 1);
          onIncomingRef.current?.(item);
        } else {
          void recount();
        }
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
      loadMoreRef.current = async () => {};
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      if (channel && client) void client.removeChannel(channel);
    };
  }, [enabled, sessionToken, currentUserId, connection?.url, connection?.anonKey, view]);

  const markRead = async (id) => {
    const generation = generationRef.current;
    const current = itemsRef.current.find((item) => item.id === id);
    if (current && !current.leida) setUnreadTotal((total) => total === null ? null : Math.max(0, total - 1));
    setItems((rows) => mergeNotification(rows, { ...(rows.find((item) => item.id === id) || {}), id, leida: true, leidaEn: new Date().toISOString() }, view));
    try {
      const updated = await markLiveNotificationRead(connection, id);
      if (generation !== generationRef.current) return;
      if (updated?.id) setItems((rows) => mergeNotification(rows, updated, view));
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
    setItems((rows) => view === NOTIFICATION_VIEWS.UNREAD
      ? []
      : rows.map((item) => ({ ...item, leida: true, leidaEn: item.leidaEn || timestamp })));
    setUnreadTotal(0);
    if (view === NOTIFICATION_VIEWS.UNREAD) setHasMore(false);
    try {
      const updated = await markAllLiveNotificationsRead(connection);
      if (generation !== generationRef.current) return;
      setItems((rows) => mergePage(rows, updated, view));
    } catch {
      if (generation !== generationRef.current) return;
      await refresh();
      if (generation !== generationRef.current) return;
      setLoadStatus({ type: "error", message: "No se pudo guardar la lectura del aviso. Vuelva a intentarlo." });
    }
  };

  const changeView = (nextView) => {
    if (nextView === view || !Object.values(NOTIFICATION_VIEWS).includes(nextView)) return;
    setItems([]);
    setHasMore(false);
    setView(nextView);
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
    view,
    setView: changeView,
    hasMore,
    loadMore,
  };
}
