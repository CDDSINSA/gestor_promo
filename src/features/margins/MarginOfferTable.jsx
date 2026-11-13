import React, { Fragment, useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button, Card, CardContent } from "../../components/ui";
import { MARGIN_STATUS_LABELS } from "./marginEngine";
import { describeOfferAbc, formatAbcCode } from "./marginClassification";
import { DEFAULT_MARGIN_PAGE_SIZE, MARGIN_PAGE_SIZE_OPTIONS, paginateOffers } from "./marginPagination";
import {
  MARGIN_STATUS_CLASS,
  describeCostOrigin,
  describeLineRole,
  formatMoney,
  formatPct,
  formatQty,
} from "./marginPresentation";


function StatusBadge({ status }) {
  return <span className={`margin-badge ${MARGIN_STATUS_CLASS[status]}`}><i className="margin-dot" aria-hidden="true"/>{MARGIN_STATUS_LABELS[status] || status}</span>;
}

function OfferFlags({ offer }) {
  return <div className="margin-flags">
    {offer.sinCosto > 0 && <small>{offer.sinCosto} línea{offer.sinCosto === 1 ? "" : "s"} sin costo</small>}
    {offer.costoCambio && <small className="warn"><AlertTriangle size={12} aria-hidden="true"/>Costo vigente distinto</small>}
    {offer.costoEstimado && <small>Costo completado después de crear</small>}
  </div>;
}

function OfferLines({ offer }) {
  const isUmbral = offer.escenarios.length > 0;
  return <tr className="margin-detail-row">
    <td colSpan={9}>
      <table className="margin-lines">
        <thead>
          <tr>
            <th>{isUmbral ? "Nivel" : "Rol"}</th>
            <th>SKU</th>
            <th>Descripción</th>
            <th>Clasif. ABC</th>
            <th className="num">Cant.</th>
            <th className="num">Precio c/IVA</th>
            <th className="num">Precio neto</th>
            <th className="num">Costo unit. C$</th>
            <th>Fuente del costo</th>
            <th className="num">Margen unit.</th>
          </tr>
        </thead>
        <tbody>
          {offer.lineas.map((line, index) => <tr key={line.promocion_id || line.row_id || `${line.sku}-${index}`}>
            <td>{isUmbral ? `${formatQty(line.cantidad)} o más` : describeLineRole(line) || "—"}{line.variante ? ` · ${line.variante}` : ""}</td>
            <td className="sku-code">{line.sku}</td>
            <td>{line.descripcion}</td>
            <td className="margin-abc">{formatAbcCode(line.clasificacion_abc)}</td>
            <td className="num">{formatQty(line.cantidad)}{line.unidadesGratis ? ` + ${formatQty(line.unidadesGratis)} gratis` : ""}</td>
            <td className="num">{line.esObsequio ? "Obsequio" : formatMoney(line.precioBrutoUnit)}</td>
            <td className="num">{line.esObsequio ? "—" : formatMoney(line.precioNetoUnit)}</td>
            <td className="num">
              {formatMoney(line.costoUnit)}
              {line.costoCambio && <small className="margin-cost-current">Vigente {formatMoney(line.costo_vigente_nio)}</small>}
            </td>
            <td>{describeCostOrigin(line)}</td>
            <td className="num">{line.esObsequio ? "—" : formatPct(line.margenUnit)}</td>
          </tr>)}
        </tbody>
      </table>
    </td>
  </tr>;
}

export default function MarginOfferTable({ offers, totalOffers }) {
  const [expanded, setExpanded] = useState(() => new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_MARGIN_PAGE_SIZE);
  const wrapRef = useRef(null);
  const pagination = paginateOffers(offers, page, pageSize);

  useEffect(() => { setPage(1); setExpanded(new Set()); }, [offers]);

  const goToPage = (next) => {
    setPage(next);
    setExpanded(new Set());
    if (wrapRef.current) wrapRef.current.scrollTop = 0;
  };

  const toggle = (key) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return <Card className="margin-table-card">
    <CardContent className="margin-table-head">
      <div className="section-head">
        <div>
          <h2>Detalle por grupo de oferta</h2>
          <p>{offers.length === totalOffers ? `${offers.length} ofertas` : `${offers.length} de ${totalOffers} ofertas`} · menor margen primero. Abra una oferta para ver sus SKU.</p>
        </div>
      </div>
    </CardContent>
    {offers.length === 0
      ? <div className="margin-empty"><div className="empty-state">No hay ofertas con esos filtros.</div></div>
      : <div className="table-wrap margin-table-wrap" ref={wrapRef}>
        <table className="margin-table">
          <thead>
            <tr>
              <th aria-label="Abrir detalle"/>
              <th>Actividad / oferta</th>
              <th>Tipo de promoción</th>
              <th>SKU</th>
              <th>Clasif. ABC</th>
              <th>Comprador / división</th>
              <th className="num">Venta neta C$</th>
              <th className="num">Costo C$</th>
              <th>Margen</th>
            </tr>
          </thead>
          <tbody>
            {pagination.items.map((offer) => {
              const open = expanded.has(offer.key);
              const single = offer.lineas.length === 1 ? offer.lineas[0] : null;
              const abc = describeOfferAbc(offer);
              return <Fragment key={offer.key}>
                <tr className={open ? "margin-row open" : "margin-row"}>
                  <td>
                    <button type="button" className="icon-btn" onClick={() => toggle(offer.key)} aria-expanded={open} aria-label={open ? "Cerrar detalle" : "Ver SKU de la oferta"}>
                      {open ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
                    </button>
                  </td>
                  <td>
                    <strong className="margin-cell-title">{offer.nombreActividad || offer.actividadId}</strong>
                    <small className="margin-cell-meta">{offer.actividadId} · {offer.tipoActividad === "ESPECIAL" ? "Especial" : "Catálogo"}</small>
                    <small className="margin-cell-meta">{offer.ofertaId}</small>
                  </td>
                  <td>
                    {offer.tipoPromo}
                    {offer.grupoOferta && offer.grupoOferta !== offer.tipoPromo && <small className="margin-cell-meta">{offer.grupoOferta}</small>}
                  </td>
                  <td>
                    {single
                      ? <><span className="sku-code">{single.sku}</span><small className="margin-cell-meta">{single.descripcion}</small></>
                      : <span>{offer.skuCount} SKU · {offer.lineas.length} líneas</span>}
                  </td>
                  <td className="margin-abc">
                    {abc.label}
                    {abc.detail && <small className="margin-cell-meta">{abc.detail}</small>}
                  </td>
                  <td>{offer.comprador || "—"}<small className="margin-cell-meta">{offer.division || "Sin división"}</small></td>
                  <td className="num">{formatMoney(offer.ventaNeta)}</td>
                  <td className="num">{formatMoney(offer.costoTotal)}</td>
                  <td>
                    <div className="margin-result">
                      <strong className={`margin-value ${MARGIN_STATUS_CLASS[offer.estado]}`}>{formatPct(offer.margen)}</strong>
                      <StatusBadge status={offer.estado}/>
                    </div>
                    {offer.escenarios.length > 0 && <small className="margin-cell-meta">Peor de {offer.escenarios.length} niveles</small>}
                    <OfferFlags offer={offer}/>
                  </td>
                </tr>
                {open && <OfferLines offer={offer}/>}
              </Fragment>;
            })}
          </tbody>
        </table>
      </div>}
    {offers.length > 0 && <div className="pagination-bar margin-pagination">
      <label className="margin-page-size">
        <span>Filas por página</span>
        <select value={pagination.pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); goToPage(1); }}>
          {MARGIN_PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
      <span>{pagination.from}–{pagination.to} de {pagination.total} · Página {pagination.page} de {pagination.totalPages}</span>
      <Button type="button" variant="outline" onClick={() => goToPage(pagination.page - 1)} disabled={!pagination.hasPrevious}><ChevronLeft size={16}/>Anterior</Button>
      <Button type="button" variant="outline" onClick={() => goToPage(pagination.page + 1)} disabled={!pagination.hasNext}>Siguiente<ChevronRight size={16}/></Button>
    </div>}
  </Card>;
}
