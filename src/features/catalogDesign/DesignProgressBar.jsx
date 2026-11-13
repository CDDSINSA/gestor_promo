import React from "react";

const SEGMENTS = [
  ["listas", "Listas", "is-listas"],
  ["aprobadas", "Aprobadas", "is-aprobadas"],
  ["revision", "En revisión", "is-revision"],
  ["ajustes", "Ajustes", "is-ajustes"],
  ["enDiseno", "En diseño", "is-diseno"],
  ["pendientes", "Pendientes", "is-pendientes"],
];

// Avance del proyecto como una sola barra apilada por estado, en lugar de siete tarjetas de KPI.
export default function DesignProgressBar({ metrics }) {
  const total = metrics.total || 0;
  return (
    <div className="catalog-design-progress">
      <div className="catalog-design-progress-head">
        <span>Avance del proyecto</span>
        <strong>{metrics.porcentaje}%</strong>
      </div>
      <div
        className="catalog-design-progress-bar"
        role="img"
        aria-label={`${metrics.porcentaje}% aprobado o listo de ${total} páginas`}
      >
        {total > 0 && SEGMENTS.map(([key, label, className]) => metrics[key] > 0 && (
          <span
            key={key}
            className={className}
            style={{ width: `${(metrics[key] / total) * 100}%` }}
            title={`${label}: ${metrics[key]}`}
          />
        ))}
      </div>
      <ul className="catalog-design-progress-legend">
        {SEGMENTS.map(([key, label, className]) => (
          <li key={key} className={metrics[key] ? "" : "is-empty"}>
            <i className={className} aria-hidden="true"/>
            <span>{label}</span>
            <strong>{metrics[key] || 0}</strong>
          </li>
        ))}
      </ul>
      <p className="catalog-design-progress-total">{total} página{total === 1 ? "" : "s"} en total</p>
    </div>
  );
}
