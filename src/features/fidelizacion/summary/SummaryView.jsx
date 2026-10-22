import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { OFFER_LIMIT, OFFER_WARNING } from "./summaryModel";
import "./summary.css";

const number = (value) => value.toLocaleString("es-NI");

export default function SummaryView({ summary, channel, updatedAt, onRefresh, onReconcile }) {
  const scale = Math.max(OFFER_LIMIT, Math.ceil(Math.max(0, ...summary.segments.map((s) => s.count)) / 100) * 100);
  const incomplete = summary.unassigned > 0 || summary.pending > 0 || summary.undatedRequests > 0 || summary.missingIdsRequests > 0;
  return <section className="fid-summary" aria-label="Resumen de promociones y ofertas vigentes">
    <div className="fid-summary-heading">
      <div><p className="fid-summary-eyebrow">CONTROL DE OFERTAS · {channel.toUpperCase()}</p>
        <h2>Promociones y ofertas vigentes</h2>
        <p>IDs únicos registrados · corte {summary.today} · actualizado {new Date(updatedAt).toLocaleTimeString("es-NI", { timeZone: "America/Managua", hour: "2-digit", minute: "2-digit" })}</p>
      </div>
      <button type="button" className="fid-summary-refresh" onClick={onRefresh}><RefreshCw size={15} aria-hidden="true" /> Actualizar resumen</button>
    </div>

    <div className="fid-summary-metrics">
      <article><span>Promociones identificadas</span><strong>{number(summary.promotions)}</strong><small>IDs de promoción distintos entre ambas fuentes</small></article>
      <article><span>Ofertas identificadas</span><strong>{number(summary.offers)}</strong><small>Una oferta repetida en varios SKU cuenta una vez</small></article>
      <article className={summary.alerts.length ? "fid-summary-attention" : ""}><span>Segmentos en alerta</span><strong>{number(summary.alerts.length)}<small> / {summary.segments.length}</small></strong><small>Alerta desde {OFFER_WARNING} · límite {OFFER_LIMIT} por segmento</small></article>
    </div>

    {summary.alerts.length > 0 && <div className="fid-summary-alert" role="status">
      <AlertTriangle size={19} aria-hidden="true" /><div><strong>Revisar capacidad antes de cargar nuevas ofertas</strong>
        <p>{summary.alerts.map((s) => `${s.name} (${s.id}): ${number(s.count)} — ${s.label.toLowerCase()}`).join("; ")}.</p></div>
    </div>}

    <div className="fid-summary-layout">
      <section className="fid-summary-chart" aria-labelledby="fid-summary-chart-title">
        <div className="fid-summary-section-head"><h3 id="fid-summary-chart-title">Ofertas por segmento</h3><span>{incomplete ? "Conteo parcial" : "IDs registrados"}</span></div>
        <p className="fid-summary-muted">Fidelización conciliada. Las ofertas especiales sin relación oferta–segmento se muestran aparte.</p>
        <div className="fid-summary-legend"><span>Alerta: {OFFER_WARNING}</span><span>Límite: {OFFER_LIMIT}</span><span>Escala: 0–{number(scale)}</span></div>
        {summary.segments.length ? <ul className="fid-summary-bars">{summary.segments.map((segment) => <li key={segment.id}>
          <div className="fid-summary-bar-label"><span>{segment.name} <small>{segment.id}</small></span><strong>{number(segment.count)}</strong></div>
          <div className="fid-summary-track" aria-hidden="true">
            <span className={`fid-summary-fill ${segment.level}`} style={{ width: `${segment.count / scale * 100}%` }} />
            <i className="fid-summary-warning-line" style={{ left: `${OFFER_WARNING / scale * 100}%` }} />
            <i className="fid-summary-limit-line" style={{ left: `calc(${OFFER_LIMIT / scale * 100}% - 1px)` }} />
          </div>
          <small className={`fid-summary-bar-status ${segment.level}`}>{segment.label}{segment.count >= OFFER_WARNING && segment.count < OFFER_LIMIT ? ` · ${OFFER_LIMIT - segment.count} hasta el límite` : ""}</small>
        </li>)}</ul> : <p className="fid-summary-empty">No hay segmentos registrados para este canal.</p>}
        <p className="fid-summary-footnote">Una misma oferta puede pertenecer a varios segmentos. La suma de barras puede superar el total de ofertas únicas.</p>
      </section>

      <aside className="fid-summary-aside">
        <section className="fid-summary-source"><h3>Composición del conteo</h3>
          <table><caption className="fid-summary-muted">IDs únicos por fuente</caption><thead><tr><th>Origen</th><th>Promos</th><th>Ofertas</th></tr></thead>
            <tbody>{summary.sources.map((source) => <tr key={source.name}><th scope="row">{source.name}</th><td>{number(source.promotions)}</td><td>{number(source.offers)}</td></tr>)}</tbody></table>
          <p className="fid-summary-footnote">Los totales superiores eliminan IDs compartidos entre fuentes.</p>
        </section>
        <section className="fid-summary-quality"><h3>Cobertura de los datos</h3>
          <dl><div><dt>Ofertas sin segmento verificable</dt><dd>{number(summary.unassigned)}</dd></div>
            <div><dt>SKU–segmento pendientes de conciliar</dt><dd>{number(summary.pending)}</dd></div>
            <div><dt>Especiales sin vigencia verificable</dt><dd>{number(summary.undatedRequests)}</dd></div>
            <div><dt>Especiales vigentes sin IDs completos</dt><dd>{number(summary.missingIdsRequests)}</dd></div></dl>
          <p>{incomplete ? "La información está incompleta: un segmento por debajo de 450 no garantiza capacidad disponible." : "El conteo refleja lo registrado en la app; confirme la disponibilidad real en ORCE."}</p>
          {summary.pending > 0 && <button type="button" className="fid-summary-link" onClick={onReconcile}>Cargar reporte ORCE →</button>}
        </section>
      </aside>
    </div>
    <details className="fid-summary-method"><summary>Cómo se calcula este resumen</summary>
      <p>Fidelización: canasto activo, descuento positivo e IDs conciliados. Especiales: solicitudes finalizadas o archivadas con fechas que incluyen el día del corte. Archivar una solicitud no implica que la oferta haya vencido. Se excluyen las cabeceras FID para no contar dos veces Fidelización.</p>
      <p>Solo se cuentan IDs numéricos de ORCE, no referencias de carga ni cantidades de SKU. Los registros sin fechas no se consideran vigentes. Las solicitudes especiales guardan listas de IDs sin asociación exacta con segmentos: sus ofertas se incluyen en los totales, pero no se reparten en el gráfico.</p>
      <p>Las alertas son informativas dentro de esta pestaña. No bloquean operaciones ni consultan ORCE en tiempo real. Los datos se consultan únicamente al pulsar Actualizar resumen; cambiar de canal o volver a esta pestaña no inicia consultas.</p>
    </details>
  </section>;
}
