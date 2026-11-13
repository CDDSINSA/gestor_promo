import React from "react";
import { CalendarDays, Clock3, TriangleAlert } from "lucide-react";
import { formatCatalogDate, getCatalogSchedules } from "./catalogSchedule";

export default function CatalogCountdown({ catalog, today }) {
  const schedules = getCatalogSchedules(catalog, today);
  if (!schedules.length) return <div className="catalog-countdown neutral"><CalendarDays size={16} aria-hidden="true"/><span>Configure canal y fechas para ver el cronograma.</span></div>;
  return <div className="catalog-countdowns">
    {schedules.map(({ profile, milestones, next, message, tone }) => <div key={profile.id} className={`catalog-countdown ${tone}`}>
      {tone === "urgent" ? <TriangleAlert size={17} aria-hidden="true"/> : <Clock3 size={17} aria-hidden="true"/>}
      <div className="catalog-countdown-copy">
        {schedules.length > 1 && <small>{profile.label}</small>}
        <strong>{next ? `${next.label} · ${message}` : message}</strong>
        {next && <span>{next.days === 0 ? "Fecha programada" : "Fecha límite"}: {formatCatalogDate(next.date)}</span>}
        <details>
          <summary>Ver fechas</summary>
          <p>{profile.label} · Días calendario. Referencia informativa; no confirma entregas.</p>
          <ul>{milestones.map((milestone) => <li key={milestone.label}>
            <span>{milestone.label}{milestone.days < 0 ? " · Fecha pasada" : ""}</span>
            <time dateTime={milestone.date}>{formatCatalogDate(milestone.date)}</time>
          </li>)}</ul>
        </details>
      </div>
    </div>)}
  </div>;
}
