import { normalizeValue } from "../../../utils/common.js";

export const SIMPLE_PROMO_MODAL_TYPES = ["Descuento", "Precio fijo"];

export function createSimplePromoDraft(promoType = "Descuento", defaultSegments = []) {
  return {
    tipoPromo: SIMPLE_PROMO_MODAL_TYPES.includes(promoType) ? promoType : "Descuento",
    sku: "",
    numPagina: "",
    tipoCantidad: "Exacta",
    cantidadMinima: 1,
    precioAhora: "",
    descuento: "",
    comentario: "",
    segmentos: Array.isArray(defaultSegments) ? defaultSegments : [],
    error: "",
  };
}

export function getAuditUserLabel(appUser = {}) {
  return normalizeValue(appUser?.nombre || appUser?.email || "");
}
