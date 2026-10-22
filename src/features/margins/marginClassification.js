import { ABC_DEFAULT_CODE, getAbcClassificationName } from "../skuMaster/skuMasterParser.js";

/** Misma clave que margen_sku_key en SQL: sin ceros a la izquierda si es numérico. */
export function marginSkuKey(sku) {
  const text = String(sku ?? "").trim();
  return /^\d+$/.test(text) ? text.replace(/^0+(?=\d)/, "") : text;
}

/**
 * Agrega clasificacion_abc a cada línea. Si no se pudo consultar la clasificación
 * (classifications = null, p. ej. paso 35 sin ejecutar) deja null; si se consultó y
 * el SKU no tiene, usa ABC_DEFAULT_CODE (8, Nuevo).
 */
export function attachAbcClassification(lines = [], classifications = null) {
  return lines.map((line) => {
    if (!classifications) return { ...line, clasificacion_abc: null };
    const exact = classifications.bySku.get(String(line.sku ?? "").trim());
    const code = exact ?? classifications.byKey.get(marginSkuKey(line.sku)) ?? ABC_DEFAULT_CODE;
    return { ...line, clasificacion_abc: code };
  });
}

export function formatAbcCode(code) {
  return code === null || code === undefined ? "—" : `${code} · ${getAbcClassificationName(code)}`;
}

/** Resumen por oferta: una clasificación, o la lista ordenada por código si son varias. */
export function describeOfferAbc(offer = {}) {
  const codes = [...new Set((offer.lineas || []).map((line) => line.clasificacion_abc).filter((code) => code !== null && code !== undefined))]
    .sort((a, b) => a - b);
  if (!codes.length) return { label: "—", detail: "" };
  if (codes.length === 1) return { label: formatAbcCode(codes[0]), detail: "" };
  return { label: "Varias", detail: codes.map(getAbcClassificationName).join(", ") };
}
