import React from "react";

export default function OfferReference({ reference }) {
  if (!reference || reference.status === "NO_APLICA") return <span className="fid-offer-muted">No aplica</span>;
  if (reference.status === "SIN_IDENTIFICAR") return <span className="fid-offer-muted">Sin oferta identificada</span>;
  return <div className="fid-offer-reference">
    <span>{reference.ids.join(", ")}</span>
    {reference.status === "MULTIPLE" && <small>Varias ofertas · revisar</small>}
  </div>;
}
