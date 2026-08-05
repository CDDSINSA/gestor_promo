import { normalizeValue } from "../../../utils/common";

export function getComboBenefitValues(beneficio, valor, defaultReward = false) {
  const benefitValue = normalizeValue(valor);
  if (beneficio === "precio") return { precioAhora: benefitValue, descuento: "" };
  if (beneficio === "descuento") return { precioAhora: "", descuento: benefitValue.includes("%") ? benefitValue : `${benefitValue}%` };
  if (beneficio === "gratis") return { precioAhora: 0, descuento: "100%" };
  if (defaultReward) return { precioAhora: 0, descuento: "100%" };
  return { precioAhora: "", descuento: "" };
}

export function comboBenefitNeedsValue(beneficio) {
  return beneficio !== "gratis" && beneficio !== "sin";
}

export function canUseComboBenefit(beneficio, valor) {
  return !comboBenefitNeedsValue(beneficio) || Boolean(normalizeValue(valor));
}
