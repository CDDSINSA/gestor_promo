import React, { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { Card, CardContent } from "../../components/ui";
import { MARGIN_STATUS_LABELS } from "./marginEngine";
import { MARGIN_STATUS_CLASS, formatPct } from "./marginPresentation";
import { ABC_BREAKDOWN_STATUSES, MIN_COMPARABLE_LINES, buildAbcAnalysis } from "./abcMarginAnalysis";

const STATUS_LABEL = { ...MARGIN_STATUS_LABELS, SIN_DATO: "Sin costo o precio" };
const STATUS_CLASS = { ...MARGIN_STATUS_CLASS, SIN_DATO: "sin-costo" };
const number = new Intl.NumberFormat("es-NI");
const share = (value) => `${Math.round(value)}%`;

function plural(count, one, many) {
  return `${number.format(count)} ${count === 1 ? one : many}`;
}

/**
 * Escala del margen promedio: barras desde 0 hacia la derecha, solo para márgenes
 * positivos, con la meta marcada. Los negativos no se dibujan como barra: se muestran
 * como etiqueta roja (pierden dinero), así un -550% no aplasta al resto.
 */
function marginScale(rows, thresholds) {
  const values = rows.map((row) => row.margenPromedio).filter((value) => value !== null);
  const max = Math.max(thresholds.verde + 10, Math.ceil(Math.max(...values, 0) / 10) * 10);
  return { max, toPct: (value) => (Math.min(Math.max(value, 0), max) / max) * 100, hasNegative: values.some((value) => value < 0) };
}

const signedPct = (value) => `${value > 0 ? "+" : ""}${formatPct(value)}`;

function KpiRow({ summary, thresholds, filtered }) {
  return <div className="abc-kpis" role="list">
    <div className="abc-kpi" role="listitem">
      <span>SKU analizados</span>
      <strong>{number.format(summary.skus)}</strong>
      <small>{plural(summary.lineas, "línea", "líneas")} de promoción</small>
    </div>
    <div className={`abc-kpi ${STATUS_CLASS[summary.estadoPromedio]}`} role="listitem">
      <span>Margen promedio</span>
      <strong>{formatPct(summary.margenPromedio)}</strong>
      <small><i className="margin-dot" aria-hidden="true"/>{STATUS_LABEL[summary.estadoPromedio]} · meta {thresholds.verde}%</small>
    </div>
    {filtered
      ? <div className="abc-kpi" role="listitem">
        <span>Líneas sin costo o precio</span>
        <strong>{number.format(summary.sinDato)}</strong>
        <small>No entran al promedio</small>
      </div>
      : <div className="abc-kpi" role="listitem">
        <span>SKU AA o A</span>
        <strong>{share(summary.pctTop)}</strong>
        <small>Mayor rotación</small>
      </div>}
    <div className={`abc-kpi${summary.criticas ? " rojo" : ""}`} role="listitem">
      <span>Líneas en margen crítico</span>
      <strong>{number.format(summary.criticas)}</strong>
      <small>Menos de {thresholds.amarillo}%</small>
    </div>
  </div>;
}

function CompositionBar({ composition, total }) {
  return <section className="abc-section" aria-labelledby="abc-composition-title">
    <div className="abc-section-head">
      <h3 id="abc-composition-title">¿Qué estamos promocionando?</h3>
      <p>Proporción de los {number.format(total)} SKU por clasificación.</p>
    </div>
    <div className="abc-stack" role="img" aria-label={composition.map((group) => `${group.label}: ${group.skus} SKU (${share(group.pct)})`).join("; ")}>
      {composition.map((group) => (
        <span
          key={group.id}
          className={`abc-stack-seg abc-group-${group.id} abc-tip`}
          style={{ flexGrow: group.skus }}
          tabIndex={0}
          data-tip={`${group.label}${group.id === "otras" ? ` (${group.detalle.join(", ")})` : ""}: ${plural(group.skus, "SKU", "SKU")} · ${share(group.pct)}`}
        >
          {group.pct >= 9 && <span className="abc-stack-label">{group.label} {share(group.pct)}</span>}
        </span>
      ))}
    </div>
    <ul className="abc-legend">
      {composition.map((group) => <li key={group.id}>
        <i className={`abc-swatch abc-group-${group.id}`} aria-hidden="true"/>
        <span>{group.label}</span>
        <strong>{number.format(group.skus)}</strong>
        <small>{share(group.pct)}</small>
      </li>)}
    </ul>
  </section>;
}

function BreakdownLegend() {
  return <ul className="abc-legend compact" aria-label="Estados del margen por línea">
    {ABC_BREAKDOWN_STATUSES.map((status) => <li key={status} className={STATUS_CLASS[status]}>
      <i className="abc-swatch status" aria-hidden="true"/><span>{STATUS_LABEL[status]}</span>
    </li>)}
  </ul>;
}

function MarginCell({ row, scale, meta }) {
  if (row.margenPromedio === null) return <span className="abc-muted">Sin dato</span>;
  const value = row.margenPromedio;
  const label = signedPct(value);
  const tip = `Promedio ${label} · rango ${formatPct(row.margenMin)} a ${formatPct(row.margenMax)} · ${plural(row.conMargen, "línea", "líneas")}`;
  if (value < 0) {
    return <div className="abc-bar abc-tip" tabIndex={0} data-tip={tip}>
      <div className="abc-bar-plot">
        <span className="abc-neg-pill"><span aria-hidden="true">▼</span>{label}</span>
      </div>
    </div>;
  }
  const end = scale.toPct(value);
  return <div className="abc-bar abc-tip" tabIndex={0} data-tip={tip}>
    <div className="abc-bar-plot" aria-hidden="true">
      <i className="abc-bar-meta" style={{ left: `${scale.toPct(meta)}%` }}/>
      <i className={`abc-bar-fill ${STATUS_CLASS[row.estadoPromedio]}`} style={{ width: `max(2px, ${end}%)` }}/>
      <span className="abc-bar-label" style={{ left: `calc(${end}% + 6px)` }}>{label}</span>
    </div>
    <span className="sr-only">{label}</span>
  </div>;
}

function BreakdownBar({ row }) {
  const total = row.evaluadas;
  if (!total) return <span className="abc-muted">Solo obsequios</span>;
  return <div className="abc-breakdown" role="img" aria-label={ABC_BREAKDOWN_STATUSES.filter((status) => row.desglose[status]).map((status) => `${STATUS_LABEL[status]}: ${row.desglose[status]}`).join("; ")}>
    {ABC_BREAKDOWN_STATUSES.filter((status) => row.desglose[status] > 0).map((status) => (
      <span
        key={status}
        className={`abc-breakdown-seg ${STATUS_CLASS[status]} abc-tip`}
        style={{ flexGrow: row.desglose[status] }}
        tabIndex={0}
        data-tip={`${STATUS_LABEL[status]}: ${plural(row.desglose[status], "línea", "líneas")} (${share((row.desglose[status] / total) * 100)})`}
      />
    ))}
  </div>;
}

function ClassTable({ rows, thresholds, onSelectAbc }) {
  const scale = useMemo(() => marginScale(rows, thresholds), [rows, thresholds]);
  const maxSkus = Math.max(...rows.map((row) => row.skus), 1);
  return <section className="abc-section" aria-labelledby="abc-table-title">
    <div className="abc-section-head split">
      <div>
        <h3 id="abc-table-title">Margen por clasificación</h3>
        <p>Margen promedio por clasificación con la meta de {thresholds.verde}% marcada (los negativos se muestran en rojo con ▼) y desglose de las líneas por estado.</p>
      </div>
      <BreakdownLegend/>
    </div>
    <div className="table-wrap abc-table-wrap">
      <table className="abc-table">
        <thead>
          <tr>
            <th scope="col">Clasificación</th>
            <th scope="col">SKU</th>
            <th scope="col" className="num">% SKU</th>
            <th scope="col" className="abc-col-margin">
              <span className="abc-col-title">Margen promedio (%)</span>
              <span className="abc-scale-key" aria-hidden="true">
                <span className="abc-key-goal"><i className="key-meta"/>Meta {thresholds.verde}%</span>
                {scale.hasNegative && <span className="abc-key-neg">▼ Margen negativo</span>}
              </span>
            </th>
            <th scope="col" className="abc-col-breakdown">Desglose por estado</th>
            <th scope="col"><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => <tr key={row.codigo}>
            <th scope="row">
              <span className="abc-class">
                <i className={`abc-swatch abc-group-${row.grupo}`} aria-hidden="true"/>
                <span>{row.nombre}</span>
                <small>{row.codigo}</small>
              </span>
            </th>
            <td>
              <div className="abc-count">
                <span className="abc-count-value">{number.format(row.skus)}</span>
                <span className="abc-count-track" aria-hidden="true"><i style={{ width: `${(row.skus / maxSkus) * 100}%` }}/></span>
              </div>
            </td>
            <td className="num">{share(row.pctSkus)}</td>
            <td><MarginCell row={row} scale={scale} meta={thresholds.verde}/></td>
            <td>
              <BreakdownBar row={row}/>
              <small className="abc-muted">
                {plural(row.lineas, "línea", "líneas")}
                {row.desglose.ROJO ? ` · ${number.format(row.desglose.ROJO)} crítica${row.desglose.ROJO === 1 ? "" : "s"}` : ""}
                {row.desglose.AMARILLO ? ` · ${number.format(row.desglose.AMARILLO)} baja${row.desglose.AMARILLO === 1 ? "" : "s"}` : ""}
                {row.obsequios ? ` · ${row.obsequios} obsequio${row.obsequios === 1 ? "" : "s"}` : ""}
              </small>
            </td>
            <td>
              <button type="button" className="abc-link" onClick={() => onSelectAbc(String(row.codigo))}>
                Ver ofertas<ArrowRight size={14} aria-hidden="true"/>
              </button>
            </td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </section>;
}

const MATRIX_STATUSES = ["ROJO", "AMARILLO", "NARANJA", "VERDE"];

function MatrixCell({ cell, division, groupLabel }) {
  if (!cell) return <td className="abc-cell empty"><span aria-label="Sin SKU">—</span></td>;
  if (cell.margenPromedio === null) {
    return <td className="abc-cell muted"><span className="abc-tip" tabIndex={0} data-tip={`${division} · ${groupLabel}: ${plural(cell.skus, "SKU", "SKU")} sin costo o precio`}>s/d</span></td>;
  }
  const tip = `${division} · ${groupLabel}: ${formatPct(cell.margenPromedio)} promedio · ${plural(cell.conMargen, "línea", "líneas")} · ${plural(cell.skus, "SKU", "SKU")}${cell.criticas ? ` · ${cell.criticas} crítica${cell.criticas === 1 ? "" : "s"}` : ""}`;
  if (!cell.comparable) {
    return <td className="abc-cell muted"><span className="abc-tip" tabIndex={0} data-tip={`${tip} (pocas líneas para comparar)`}>{formatPct(cell.margenPromedio)}</span></td>;
  }
  return <td className={`abc-cell ${STATUS_CLASS[cell.estado]}`}>
    <span className="abc-tip" tabIndex={0} data-tip={tip}>{formatPct(cell.margenPromedio)}</span>
  </td>;
}

function DivisionMatrix({ matrix, summary, thresholds }) {
  if (!matrix.rows.length) return null;
  const { columns, rows, totals } = matrix;
  return <section className="abc-section" aria-labelledby="abc-division-title">
    <div className="abc-section-head split">
      <div>
        <h3 id="abc-division-title">¿Dónde se concentra el margen bajo?</h3>
        <p>Margen promedio por división y clasificación. Divisiones ordenadas de menor a mayor margen.</p>
      </div>
      <ul className="abc-legend compact" aria-label="Color de cada celda">
        {MATRIX_STATUSES.map((status) => <li key={status} className={STATUS_CLASS[status]}>
          <i className="abc-swatch cell" aria-hidden="true"/><span>{STATUS_LABEL[status]}</span>
        </li>)}
        <li><i className="abc-swatch cell blank" aria-hidden="true"/><span>Menos de {MIN_COMPARABLE_LINES} líneas</span></li>
      </ul>
    </div>
    <div className="table-wrap abc-table-wrap">
      <table className="abc-table abc-matrix">
        <thead>
          <tr>
            <th scope="col">División</th>
            <th scope="col" className="num">SKU</th>
            <th scope="col" className="num">Margen promedio</th>
            {columns.map((group) => <th key={group.id} scope="col" className="abc-cell-head">
              <span className="abc-class"><i className={`abc-swatch abc-group-${group.id}`} aria-hidden="true"/>{group.label}</span>
            </th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => <tr key={row.division}>
            <th scope="row" className="abc-division">{row.division}</th>
            <td className="num">{number.format(row.skus)}</td>
            <td className="num">
              <span className={`abc-avg ${STATUS_CLASS[row.estado]}`}>
                {row.margenPromedio !== null && <i className="margin-dot" aria-hidden="true"/>}
                {row.margenPromedio === null ? "Sin dato" : formatPct(row.margenPromedio)}
              </span>
            </td>
            {columns.map((group) => <MatrixCell key={group.id} cell={row.cells[group.id]} division={row.division} groupLabel={group.label}/>)}
          </tr>)}
        </tbody>
        {rows.length > 1 && <tfoot>
          <tr>
            <th scope="row">Todas las divisiones</th>
            <td className="num">{number.format(summary.skus)}</td>
            <td className="num">
              <span className={`abc-avg ${STATUS_CLASS[summary.estadoPromedio]}`}>
                {summary.margenPromedio !== null && <i className="margin-dot" aria-hidden="true"/>}
                {formatPct(summary.margenPromedio)}
              </span>
            </td>
            {columns.map((group) => <MatrixCell key={group.id} cell={totals[group.id]} division="Todas" groupLabel={group.label}/>)}
          </tr>
        </tfoot>}
      </table>
    </div>
    <p className="abc-note">Meta {thresholds.verde}%. Celdas sin color: menos de {MIN_COMPARABLE_LINES} líneas con margen, el promedio es solo referencial. "Otras" agrupa Nuevo, Temporada, Lento Movimiento, Inventario Duro, Quebrada y Servicio.</p>
  </section>;
}

export default function MarginAbcAnalysis({ offers, thresholds, abcFilter, onSelectAbc }) {
  const analysis = useMemo(() => buildAbcAnalysis(offers, thresholds, abcFilter), [offers, thresholds, abcFilter]);

  if (!analysis.available) {
    return <Card className="abc-analysis"><CardContent>
      <div className="empty-state">
        {analysis.lineas
          ? "La clasificación ABC no está disponible. Ejecute el paso 35 en Supabase y cargue el reporte UDA desde Ajustes > Maestro de SKU."
          : "No hay líneas con los filtros actuales."}
      </div>
    </CardContent></Card>;
  }

  const { summary, rows, composition, insights } = analysis;
  return <Card className="abc-analysis">
    <CardContent className="abc-analysis-body">
      <header className="abc-headline">
        <span className="abc-eyebrow">Análisis por clasificación ABC{analysis.filtro !== null ? ` · solo ${rows[0]?.nombre || ""}` : ""}</span>
        <h2>{insights.headline}</h2>
        {insights.items.length > 0 && <ul className="abc-findings">
          {insights.items.map((item) => <li key={item.id}>
            {item.text}
            {item.codigo && analysis.filtro === null && <button type="button" className="abc-link" onClick={() => onSelectAbc(String(item.codigo))}>Ver ofertas<ArrowRight size={14} aria-hidden="true"/></button>}
          </li>)}
        </ul>}
      </header>

      <KpiRow summary={summary} thresholds={thresholds} filtered={analysis.filtro !== null}/>
      {analysis.filtro === null && <CompositionBar composition={composition} total={summary.skus}/>}
      <ClassTable rows={rows} thresholds={thresholds} onSelectAbc={onSelectAbc}/>
      <DivisionMatrix matrix={analysis.divisiones} summary={summary} thresholds={thresholds}/>

      <p className="abc-method">
        Cada línea es un SKU dentro de una oferta. Margen unitario = (precio sin IVA − costo guardado) / precio sin IVA; el promedio es simple
        por línea. Los obsequios no entran al margen. Se usa la clasificación vigente; los SKU sin clasificación cargada cuentan como Nuevo (dentro de "Otras").
        La división sale de la jerarquía del departamento del SKU (o la del comprador si no tiene). Respeta todos los filtros de la consulta.
      </p>
    </CardContent>
  </Card>;
}
