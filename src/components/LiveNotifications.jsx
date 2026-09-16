import React from "react";
import { Bell, CheckCheck, RefreshCw, X } from "lucide-react";
import { classNames } from "../utils/common";

function formatNotificationTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-NI", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function LiveNotificationsToast({ notification, onClose }) {
  if (!notification) return null;
  return <div className="live-notification-toast" role="status" aria-live="polite">
    <div className="live-notification-toast-icon"><Bell size={17}/></div>
    <div className="live-notification-toast-copy">
      <strong>{notification.titulo}</strong>
      <span>{notification.mensaje || notification.actorNombre || "Nueva notificacion en vivo"}</span>
    </div>
    <button type="button" className="success-toast-close" onClick={onClose} aria-label="Cerrar notificacion"><X size={16}/></button>
  </div>;
}

export default function LiveNotifications({
  items = [],
  unreadCount = 0,
  status = { type: "idle", message: "" },
  isOpen = false,
  onToggle,
  onClose,
  onRefresh,
  onMarkRead,
  onMarkAllRead,
  onOpenItem,
}) {
  const isLoading = status.type === "loading";
  return <div className="live-notifications">
    <button
      type="button"
      className={classNames("live-notifications-trigger", unreadCount > 0 && "has-unread", isOpen && "open")}
      onClick={onToggle}
      aria-label={`Notificaciones en vivo${unreadCount ? `, ${unreadCount} pendientes` : ""}`}
      aria-expanded={isOpen}
    >
      <Bell size={18}/>
      {unreadCount > 0 && <span>{unreadCount > 9 ? "9+" : unreadCount}</span>}
    </button>
    {isOpen && <div className="live-notifications-panel" role="dialog" aria-label="Notificaciones en vivo">
      <div className="live-notifications-head">
        <div>
          <strong>Notificaciones en vivo</strong>
          <span>{unreadCount ? `${unreadCount} pendiente(s)` : "Sin pendientes"}</span>
        </div>
        <div className="live-notifications-actions">
          <button type="button" onClick={onRefresh} disabled={isLoading} title="Actualizar" aria-label="Actualizar notificaciones"><RefreshCw size={16}/></button>
          <button type="button" onClick={onMarkAllRead} disabled={!unreadCount} title="Marcar todo como leido" aria-label="Marcar todo como leido"><CheckCheck size={16}/></button>
          <button type="button" onClick={onClose} title="Cerrar" aria-label="Cerrar notificaciones"><X size={16}/></button>
        </div>
      </div>
      {status.message && <div className={classNames("live-notifications-status", status.type === "error" && "error")}>{status.message}</div>}
      <div className="live-notifications-list">
        {items.length ? items.map((item) => <button
          type="button"
          key={item.id}
          className={classNames("live-notification-item", !item.leida && "unread")}
          onClick={() => onOpenItem ? onOpenItem(item) : onMarkRead(item.id)}
        >
          <span className="live-notification-dot" aria-hidden="true"></span>
          <span className="live-notification-copy">
            <strong>{item.titulo}</strong>
            <em>{item.mensaje}</em>
            <small>{[item.actorNombre, formatNotificationTime(item.createdAt)].filter(Boolean).join(" - ")}</small>
          </span>
        </button>) : <div className="live-notifications-empty">No hay notificaciones recientes.</div>}
      </div>
    </div>}
  </div>;
}
