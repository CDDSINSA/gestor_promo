import React, { useMemo, useState } from "react";
import { CalendarDays, Clock3, Layers3, ListFilter, Rows3, Users } from "lucide-react";
import { Button, Card, CardContent, Header, Metric } from "./ui";
import { classNames } from "../utils/common";
import {
  buildSeguimientoItems,
  buildTimelineModel,
  formatSeguimientoDateRange,
  formatTimelineRange,
  getItemGridPosition,
  getUniqueBuyers,
  getUniqueTypes,
} from "../features/seguimiento/ganttModel";

const BAR_COLORS = {
  CATALOGO: "#006b3f",
  ESPECIAL: "#00a6c8",
  SOLICITUD: "#64748b",
};

function getBarColor(item, index) {
  if (BAR_COLORS[item.type]) return BAR_COLORS[item.type];
  const palette = ["#006b3f", "#00a6c8", "#64748b", "#b45309", "#475569"];
  return palette[index % palette.length];
}

function formatList(values, fallback = "No configurado") {
  if (!values?.length) return fallback;
  if (values.length <= 3) return values.join(", ");
  return `${values.slice(0, 3).join(", ")} +${values.length - 3}`;
}

function SeguimientoTooltip({ tooltip }) {
  if (!tooltip?.item) return null;
  const { item, x, y } = tooltip;
  return <div className="seguimiento-tooltip" style={{ left: x, top: y }} role="status">
    <div className="seguimiento-tooltip-head">
      <strong>{item.name}</strong>
      <span>{item.type}</span>
    </div>
    <dl>
      <div><dt>Fechas</dt><dd>{formatSeguimientoDateRange(item)}</dd></div>
      <div><dt>Comprador</dt><dd>{item.buyerLabel}</dd></div>
      <div><dt>Tiendas</dt><dd>{formatList(item.tiendas, item.channel || "Alcance general")}</dd></div>
      <div><dt>Segmentos</dt><dd>{formatList(item.segmentos, "Todos")}</dd></div>
      <div><dt>Promos</dt><dd>{formatList(item.tiposPromo, "Sin promociones")}</dd></div>
    </dl>
  </div>;
}

function ActivityNameCell({ item, onShowTooltip, onHideTooltip }) {
  return <button
    type="button"
    className="seguimiento-name-cell"
    onMouseEnter={onShowTooltip}
    onFocus={onShowTooltip}
    onMouseLeave={onHideTooltip}
    onBlur={onHideTooltip}
  >
    <span className="seguimiento-name-main">{item.name}</span>
    <span className="seguimiento-name-meta">{item.buyerLabel} - {item.status}</span>
  </button>;
}

function TimelineRow({ item, index, timeline }) {
  const position = getItemGridPosition(item, timeline);
  const color = getBarColor(item, index);
  return <div
    className={classNames("seguimiento-time-row", position.missing && "missing-dates")}
    style={{
      gridTemplateColumns: `repeat(${timeline.totalDays}, minmax(0, 1fr))`,
      "--bar-color": color,
      "--day-width": `${100 / timeline.totalDays}%`,
    }}
  >
    {timeline.todayOffset !== null && <span className="seguimiento-today-line" style={{ gridColumn: `${timeline.todayOffset + 1}` }} />}
    <div className="seguimiento-bar" style={{ gridColumn: position.gridColumn }}>
      <span>{position.missing ? "Sin fechas" : formatSeguimientoDateRange(item)}</span>
    </div>
  </div>;
}

export default function SeguimientoGanttPage({ actividades = [], rows = [], catalogos = [] }) {
  const [buyerFilter, setBuyerFilter] = useState("Todos");
  const [typeFilter, setTypeFilter] = useState("Todos");
  const [tooltip, setTooltip] = useState(null);
  const items = useMemo(() => buildSeguimientoItems({ actividades, rows, catalogos }), [actividades, rows, catalogos]);
  const buyerOptions = useMemo(() => getUniqueBuyers(items), [items]);
  const typeOptions = useMemo(() => getUniqueTypes(items), [items]);
  const filteredItems = useMemo(() => items.filter((item) => {
    const buyerMatches = buyerFilter === "Todos" || item.compradores.includes(buyerFilter);
    const typeMatches = typeFilter === "Todos" || item.type === typeFilter;
    return buyerMatches && typeMatches;
  }), [items, buyerFilter, typeFilter]);
  const timeline = useMemo(() => buildTimelineModel(filteredItems), [filteredItems]);
  const activeCount = filteredItems.filter((item) => item.hasDates && item.start <= new Date() && item.end >= new Date()).length;
  const buyerCount = getUniqueBuyers(filteredItems).length;
  const rangeLabel = formatTimelineRange(timeline);

  const showTooltip = (item, event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = 310;
    const x = Math.min(rect.right + 12, Math.max(12, window.innerWidth - width - 12));
    const y = Math.min(rect.top, Math.max(12, window.innerHeight - 230));
    setTooltip({ item, x, y });
  };

  return <div className="seguimiento-page">
    <div className="toolbar page-header-toolbar">
      <Header title="Seguimiento Gantt" subtitle="Linea de tiempo operativa para revisar actividades, vigencias y alcance sin modificar promociones." />
      <div className="toolbar-actions seguimiento-actions">
        <label className="seguimiento-filter">
          <ListFilter size={15}/>
          <select value={buyerFilter} onChange={(event) => setBuyerFilter(event.target.value)} aria-label="Filtrar por comprador">
            <option value="Todos">Todos los compradores</option>
            {buyerOptions.map((buyer) => <option key={buyer} value={buyer}>{buyer}</option>)}
          </select>
        </label>
        <label className="seguimiento-filter">
          <Layers3 size={15}/>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Filtrar por tipo de actividad">
            <option value="Todos">Todos los tipos</option>
            {typeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        {(buyerFilter !== "Todos" || typeFilter !== "Todos") && <Button variant="outline" onClick={() => { setBuyerFilter("Todos"); setTypeFilter("Todos"); }}>Limpiar</Button>}
      </div>
    </div>

    <div className="metrics four seguimiento-metrics">
      <Metric title="Actividades" value={filteredItems.length} icon={Rows3}/>
      <Metric title="En curso" value={activeCount} icon={Clock3}/>
      <Metric title="Compradores" value={buyerCount} icon={Users}/>
      <Metric title="Rango visible" value={rangeLabel} icon={CalendarDays}/>
    </div>

    <Card className="seguimiento-board-card">
      <CardContent>
        <div className="section-head seguimiento-section-head">
          <div>
            <h2>Calendario de actividades</h2>
            <span>Coloque el cursor sobre una actividad para ver su configuracion resumida.</span>
          </div>
          <span className="pill green">{filteredItems.length} visibles</span>
        </div>

        <div className="seguimiento-scroll">
          <div
            className="seguimiento-board"
            style={{ gridTemplateColumns: `minmax(17rem, 21rem) ${timeline.minWidth}px` }}
          >
            <div className="seguimiento-corner">Actividad</div>
            <div
              className="seguimiento-time-head"
              style={{ gridTemplateColumns: `repeat(${timeline.totalDays}, minmax(0, 1fr))` }}
            >
              {timeline.ticks.map((tick) => <div key={tick.key} className={classNames("seguimiento-tick", tick.isMonthStart && "month-start")} style={{ gridColumn: tick.gridColumn }}>
                <strong>{tick.label}</strong>
                <span>{tick.month}</span>
              </div>)}
            </div>

            {filteredItems.map((item, index) => <React.Fragment key={item.id}>
              <ActivityNameCell
                item={item}
                onShowTooltip={(event) => showTooltip(item, event)}
                onHideTooltip={() => setTooltip(null)}
              />
              <TimelineRow item={item} index={index} timeline={timeline} />
            </React.Fragment>)}
          </div>
        </div>

        {!filteredItems.length && <div className="empty-state">No hay actividades que coincidan con los filtros actuales.</div>}
      </CardContent>
    </Card>

    <SeguimientoTooltip tooltip={tooltip} />
  </div>;
}
