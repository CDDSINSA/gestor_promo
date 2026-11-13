import React, { useEffect } from "react";
import { AlertCircle, CheckCircle2, Loader2, X } from "lucide-react";
import { classNames } from "../../utils/common";

const AUTO_DISMISS_MS = 4500;

// Mensajes del módulo como aviso flotante: los de éxito se cierran solos; los errores quedan hasta cerrarlos.
export default function DesignToast({ status, onDismiss }) {
  const { type, message } = status || {};

  useEffect(() => {
    if (type !== "ready" || !message) return undefined;
    // Los mensajes largos (p. ej. con advertencias) se quedan más tiempo, hasta 10 s.
    const timer = window.setTimeout(onDismiss, Math.min(10000, AUTO_DISMISS_MS + message.length * 30));
    return () => window.clearTimeout(timer);
  }, [type, message, onDismiss]);

  if (!message || type === "idle") return null;

  const Icon = type === "error" ? AlertCircle : type === "loading" ? Loader2 : CheckCircle2;
  return (
    <div
      className={classNames("catalog-design-toast", `is-${type}`)}
      role={type === "error" ? "alert" : "status"}
      aria-live={type === "error" ? "assertive" : "polite"}
    >
      <Icon size={17} className={type === "loading" ? "catalog-design-spin" : ""} aria-hidden="true"/>
      <span>{message}</span>
      {type !== "loading" && (
        <button type="button" onClick={onDismiss} aria-label="Cerrar aviso" title="Cerrar">
          <X size={15}/>
        </button>
      )}
    </div>
  );
}
