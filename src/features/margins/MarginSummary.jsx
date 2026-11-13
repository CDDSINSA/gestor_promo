import React from "react";
import { ArrowRight } from "lucide-react";
import { Button, Card, CardContent } from "../../components/ui";
import { MARGIN_STATUS, MARGIN_STATUS_LABELS } from "./marginEngine";
import { describeThresholds, MARGIN_STATUS_CLASS } from "./marginPresentation";

const STATUS_TILES = [MARGIN_STATUS.VERDE, MARGIN_STATUS.NARANJA, MARGIN_STATUS.AMARILLO, MARGIN_STATUS.ROJO];

export default function MarginSummary({ report, activeStatus, onSelectStatus }) {
  const { summary, thresholds } = report;
  const ranges = describeThresholds(thresholds);
  const critical = summary.porEstado.ROJO + summary.porEstado.AMARILLO;
  const withoutCost = summary.porEstado.SIN_COSTO + summary.porEstado.SIN_PRECIO;
  const toggle = (status) => onSelectStatus(activeStatus === status ? "Todos" : status);

  return <Card className="margin-summary-card">
    <CardContent className="margin-summary">
      <div className="section-head">
        <h2>Salud del margen</h2>
        <span className="margin-summary-meta">{summary.lineas} líneas · {summary.skus} SKU · {summary.actividades} actividades</span>
      </div>
      <div className="margin-tiles">
        <div className="margin-tile">
          <span>Ofertas evaluadas</span>
          <strong>{summary.ofertas}</strong>
          <small>Por grupo de oferta</small>
        </div>
        {STATUS_TILES.map((status) => (
          <button
            type="button"
            key={status}
            className={`margin-tile selectable ${MARGIN_STATUS_CLASS[status]}${activeStatus === status ? " active" : ""}`}
            onClick={() => toggle(status)}
            aria-pressed={activeStatus === status}
          >
            <span><i className="margin-dot" aria-hidden="true"/>{MARGIN_STATUS_LABELS[status]}</span>
            <strong>{summary.porEstado[status]}</strong>
            <small>{ranges[status]}</small>
          </button>
        ))}
        <button
          type="button"
          className={`margin-tile selectable sin-costo${activeStatus === MARGIN_STATUS.SIN_COSTO ? " active" : ""}`}
          onClick={() => toggle(MARGIN_STATUS.SIN_COSTO)}
          aria-pressed={activeStatus === MARGIN_STATUS.SIN_COSTO}
        >
          <span><i className="margin-dot" aria-hidden="true"/>Sin costo</span>
          <strong>{withoutCost}</strong>
          <small>No entran al semáforo</small>
        </button>
      </div>
    </CardContent>
    {(critical > 0 || summary.costoCambio > 0) && <div className="margin-summary-footer">
      <p>
        {critical > 0 && <>{critical} de {summary.ofertas} ofertas están bajo {thresholds.naranja}% y necesitan revisión de precio.</>}
        {summary.costoCambio > 0 && <> {summary.costoCambio} con costo vigente distinto al guardado.</>}
      </p>
      {summary.porEstado.ROJO > 0 && <Button type="button" variant="outline" onClick={() => onSelectStatus(MARGIN_STATUS.ROJO)}>Ver ofertas críticas<ArrowRight size={16}/></Button>}
    </div>}
  </Card>;
}
