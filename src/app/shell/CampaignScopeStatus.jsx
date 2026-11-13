import React from "react";

// Se muestra en lugar del modulo mientras se cargan las promociones de su campaña
// (carga por campaña). Evita que se edite una grilla que todavia no tiene sus datos.
export default function CampaignScopeStatus({ status = {}, onRetry, onGoHome }) {
  const state = status.status || status.type || "loading";
  const isError = state === "error";
  const message = status.message || "Cargando promociones de la campaña...";
  return (
    <div className="empty-state campaign-scope-status" role={isError ? "alert" : "status"} aria-live="polite">
      <p>{isError ? `No se pudieron cargar las promociones. ${message}` : message}</p>
      {isError && (
        <div className="campaign-scope-actions">
          <button type="button" className="btn btn-primary" onClick={onRetry}>Reintentar</button>
          <button type="button" className="btn btn-outline" onClick={onGoHome}>Ir a Inicio</button>
        </div>
      )}
    </div>
  );
}
