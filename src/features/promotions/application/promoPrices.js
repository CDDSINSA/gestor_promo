const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== "";
const roundPrice = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

export function priceWithIva(price) {
  if (!hasValue(price) || !Number.isFinite(Number(price))) return "";
  return roundPrice(Number(price) * 1.15);
}

export function resolveDiscountPrice(promoType, before, now, discount) {
  if (hasValue(now) || promoType !== "Descuento") return now;
  if (!hasValue(before) || !hasValue(discount)) return now;
  const price = Number(before);
  const percent = Number(String(discount).trim().replace(/%$/, "").trim().replace(",", "."));
  if (!Number.isFinite(price) || price < 0 || !Number.isFinite(percent) || percent < 0 || percent > 100) return now;
  return roundPrice(price * (1 - percent / 100));
}
