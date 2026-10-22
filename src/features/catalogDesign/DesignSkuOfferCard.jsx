// Card del panel de SKU de Diseño de catálogos.
// - Promo simple: misma card de siempre (una fila).
// - Promo compleja (Combo, Umbral, Compra X lleva X…): una card por oferta con todas sus líneas,
//   cada una con su rol y su beneficio.
import React, { useState } from "react";
import { Check, Copy } from "lucide-react";
import { classNames } from "../../utils/common";
import { formatSkuInfoValue, getPromoField } from "./catalogDesignProject";
import { getDesignLineBenefit, getDesignPromoPage, getDesignRoleLabel } from "./designPromotions";

const COLLAPSED_LINES = 4;

function PagePill({ page, currentPage }) {
  const isCurrent = page !== null && page === currentPage;
  return (
    <span
      className={classNames("sku-discount-pill", "sku-page-pill", isCurrent && "is-current")}
      title={isCurrent ? "Asignado a esta página en Compras" : page ? `Asignado a página ${page}` : "Sin página asignada"}
    >
      {page ? `Página ${page}${isCurrent ? " · Actual" : ""}` : "Sin página asignada"}
    </span>
  );
}

function SkuCopy({ sku, copiedSkuText, onCopy }) {
  return (
    <>
      <span className="sku-chip">SKU {formatSkuInfoValue(sku)}</span>
      <button type="button" className="catalog-design-copy-btn" onClick={() => onCopy(sku, `SKU ${sku}`)} title="Copiar código SKU">
        {copiedSkuText === `SKU ${sku}` ? <Check size={12} /> : <Copy size={12} />}
      </button>
    </>
  );
}

// AIRES: el precio que va al catálogo es el del aire completo.
function AireSummary({ aire, onCopy }) {
  return (
    <div className="catalog-design-offer-aire">
      <p className="sku-desc-text">
        {formatSkuInfoValue(aire.description)}
        <button type="button" className="catalog-design-copy-inline-btn" onClick={() => onCopy(aire.description, "Descripción")} title="Copiar descripción del aire">
          <Copy size={12} />
        </button>
      </p>
      <div className="catalog-design-sku-data">
        <div>
          <span>Antes aire</span>
          <strong>{formatSkuInfoValue(aire.before)}</strong>
        </div>
        <div className="sku-now-price">
          <span>Precio aire</span>
          <strong>{formatSkuInfoValue(aire.total)}</strong>
          <button type="button" className="catalog-design-copy-inline-btn" onClick={() => onCopy(aire.total, "Precio")} title="Copiar precio del aire">
            <Copy size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

function LineBody({ row, onCopy, isAirePiece = false }) {
  const benefit = isAirePiece ? { kind: "precio", label: "Pieza", value: getPromoField(row, "precioAhora", "precio_ahora") } : getDesignLineBenefit(row);
  const comment = getPromoField(row, "comentario", "comentario_comprador");
  return (
    <>
      <p className="sku-desc-text">
        {formatSkuInfoValue(getPromoField(row, "descripcion"))}
        <button
          type="button"
          className="catalog-design-copy-inline-btn"
          onClick={() => onCopy(getPromoField(row, "descripcion"), "Descripción")}
          title="Copiar descripción al portapapeles"
        >
          <Copy size={12} />
        </button>
      </p>
      <div className="catalog-design-sku-data">
        <div>
          <span>Antes</span>
          <strong>{formatSkuInfoValue(getPromoField(row, "precioAntes", "precio_antes"))}</strong>
        </div>
        {benefit.kind === "precio" && (
          <div className="sku-now-price">
            <span>{isAirePiece ? "Precio pieza" : "Ahora"}</span>
            <strong>{formatSkuInfoValue(benefit.value)}</strong>
            <button
              type="button"
              className="catalog-design-copy-inline-btn"
              onClick={() => onCopy(benefit.value, "Precio")}
              title="Copiar precio oferta"
            >
              <Copy size={12} />
            </button>
          </div>
        )}
        {benefit.kind === "descuento" && (
          <div className="sku-benefit-discount">
            <span>{benefit.label}</span>
            <strong>{benefit.value}</strong>
            <button
              type="button"
              className="catalog-design-copy-inline-btn"
              onClick={() => onCopy(benefit.value, "Descuento")}
              title="Copiar descuento"
            >
              <Copy size={12} />
            </button>
          </div>
        )}
        {benefit.kind === "regalia" && (
          <div className="sku-benefit-gift">
            <span>{benefit.label}</span>
            <strong>{benefit.value}</strong>
          </div>
        )}
      </div>
      {comment && (
        <div className="catalog-design-sku-comment">
          <span>Nota comercial:</span>
          <p>{formatSkuInfoValue(comment)}</p>
        </div>
      )}
    </>
  );
}

function SimpleOfferCard({ row, currentPage, copiedSkuText, onCopy }) {
  const benefit = getDesignLineBenefit(row);
  const discount = getPromoField(row, "descuento");
  return (
    <div className="catalog-design-sku-result">
      <div className="catalog-design-sku-result-head">
        <div>
          <SkuCopy sku={row.sku} copiedSkuText={copiedSkuText} onCopy={onCopy} />
        </div>
        <div className="catalog-design-sku-pills">
          <PagePill page={getDesignPromoPage(row)} currentPage={currentPage} />
          {/* La etiqueta de descuento se mantiene solo si el descuento no se muestra ya en el recuadro. */}
          {discount && benefit.kind === "precio" && <span className="sku-discount-pill">{formatSkuInfoValue(discount)}</span>}
        </div>
      </div>
      <LineBody row={row} onCopy={onCopy} />
    </div>
  );
}

function ComplexOfferCard({ offer, currentPage, copiedSkuText, onCopy }) {
  const [expanded, setExpanded] = useState(false);
  const matched = offer.matchedRows || new Set();
  const hidden = expanded ? 0 : offer.lines.filter((row, index) => index >= COLLAPSED_LINES && !matched.has(row)).length;
  const visibleLines = expanded ? offer.lines : offer.lines.filter((row, index) => index < COLLAPSED_LINES || matched.has(row));
  const canCollapse = offer.lines.length > COLLAPSED_LINES;

  return (
    <div className="catalog-design-sku-result catalog-design-offer-card">
      <div className="catalog-design-sku-result-head">
        <div className="catalog-design-offer-title">
          <span className="catalog-design-offer-name">{offer.label}</span>
          {offer.buyer && <span className="catalog-design-offer-buyer" title="Comprador">{offer.buyer}</span>}
        </div>
        <div className="catalog-design-sku-pills">
          <span className="catalog-design-offer-count">{offer.lines.length} SKU</span>
          <PagePill page={offer.page} currentPage={currentPage} />
        </div>
      </div>

      {offer.aire && <AireSummary aire={offer.aire} onCopy={onCopy} />}

      <div className="catalog-design-offer-lines">
        {visibleLines.map((row, index) => {
          const linePage = getDesignPromoPage(row);
          const role = getDesignRoleLabel(row);
          return (
            <div
              key={`${row.id || row.row_id || row.sku}-${index}`}
              className={classNames("catalog-design-offer-line", matched.has(row) && "is-match")}
            >
              <div className="catalog-design-sku-result-head">
                <div>
                  {role && <span className="catalog-design-offer-role">{role}</span>}
                  <SkuCopy sku={row.sku} copiedSkuText={copiedSkuText} onCopy={onCopy} />
                </div>
                <div className="catalog-design-sku-pills">
                  {matched.has(row) && <span className="catalog-design-offer-match">Coincide</span>}
                  {linePage !== offer.page && <PagePill page={linePage} currentPage={currentPage} />}
                </div>
              </div>
              <LineBody row={row} onCopy={onCopy} isAirePiece={Boolean(offer.aire)} />
            </div>
          );
        })}
      </div>

      {canCollapse && (hidden > 0 || expanded) && (
        <button type="button" className="catalog-design-offer-toggle" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Ver menos" : `Ver ${hidden} SKU más`}
        </button>
      )}
    </div>
  );
}

export default function DesignSkuOfferCard({ offer, currentPage, copiedSkuText, onCopy }) {
  if (!offer.complex) {
    return <SimpleOfferCard row={offer.lines[0]} currentPage={currentPage} copiedSkuText={copiedSkuText} onCopy={onCopy} />;
  }
  return <ComplexOfferCard offer={offer} currentPage={currentPage} copiedSkuText={copiedSkuText} onCopy={onCopy} />;
}
