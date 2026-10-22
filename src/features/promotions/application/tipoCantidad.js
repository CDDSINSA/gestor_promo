// Valores válidos del campo "tipo de cantidad" de una promoción.
export const TIPO_CANTIDAD_EXACTA = "Exacta";
export const TIPO_CANTIDAD_MINIMO = "Mínimo";
export const TIPOS_CANTIDAD = [TIPO_CANTIDAD_EXACTA, TIPO_CANTIDAD_MINIMO];

// La grilla guardaba "MÃ­nimo" (codificación dañada) y el modal de promo simple guardaba
// el texto literal "M\u00ednimo" (escape sin interpretar en un atributo JSX).
// Se reconocen esas variantes y la escritura sin tilde para guardarlas siempre como "Mínimo".
const LEGACY_TIPO_CANTIDAD = new Map([
  ["mã­nimo", TIPO_CANTIDAD_MINIMO],
  ["mãnimo", TIPO_CANTIDAD_MINIMO],
  ["m\\u00ednimo", TIPO_CANTIDAD_MINIMO],
  ["minimo", TIPO_CANTIDAD_MINIMO],
  ["mínimo", TIPO_CANTIDAD_MINIMO],
  ["exacta", TIPO_CANTIDAD_EXACTA],
]);

export function normalizeTipoCantidad(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return LEGACY_TIPO_CANTIDAD.get(text.toLowerCase()) || text;
}
