import React, { useEffect, useState } from "react";

export default function DatabaseStatus({ connected, busy, statuses = [] }) {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const error = statuses.find((status) => status?.type === "error");
  const loading = busy || statuses.some((status) => status?.type === "loading");
  const state = !online || !connected ? "offline" : loading ? "loading" : error ? "error" : "ready";
  const label = !online ? "BD: sin conexión a Internet"
    : !connected ? "BD: conexión no disponible"
    : loading ? "BD: consultando o sincronizando datos"
    : error ? `BD: error en la última operación. ${error.message || ""}`
    : "BD: última conexión correcta";

  return <div className="database-status-bar">
    <span className={`database-status ${state}`} role="status" aria-label={label} title={label} tabIndex={0}>
      <span className="database-status-led" aria-hidden="true" />
      <span aria-hidden="true">BD</span>
    </span>
  </div>;
}
