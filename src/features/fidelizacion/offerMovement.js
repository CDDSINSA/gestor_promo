const text = (value) => String(value ?? "").trim();
const channel = (value) => text(value).toLowerCase();
const numericId = (value) => /^\d+$/.test(text(value));
const percent = (value) => {
  if (value == null || text(value) === "") return null;
  const number = Number(text(value).replace(",", "."));
  return Number.isFinite(number) && number >= 0 && number <= 100
    ? Math.round(number * 100) : null;
};
const key = (canal, segmento, discount) => JSON.stringify([channel(canal), text(segmento), discount]);

function result(applies, ids = []) {
  const unique = [...new Set(ids)].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  return { ids: unique, status: !applies ? "NO_APLICA" : unique.length > 1 ? "MULTIPLE" : unique.length ? "IDENTIFICADA" : "SIN_IDENTIFICAR" };
}

// Referencias de consulta: nunca asigna IDs ni modifica descuentos o solicitudes.
// Solo usa filas visibles por los permisos vigentes y conciliadas con ORCE.
export function buildOfferMovements(deltas = [], canasto = []) {
  const destinations = new Map();
  const origins = new Map();
  for (const row of canasto) {
    const discount = percent(row.descuento);
    if (text(row.estado_conciliacion_orce).toUpperCase() !== "CONCILIADO" ||
      !numericId(row.oferta_id_orce) || !numericId(row.promo_id_orce) ||
      !channel(row.canal) || !text(row.segmento_id) || discount == null || discount <= 0 ||
      text(row.estatus).toLowerCase() === "inactivo") continue;
    const offer = text(row.oferta_id_orce);
    const matchKey = key(row.canal, row.segmento_id, discount);
    const originKey = JSON.stringify([matchKey, text(row.sku)]);
    if (!destinations.has(matchKey)) destinations.set(matchKey, []);
    if (!origins.has(originKey)) origins.set(originKey, []);
    destinations.get(matchKey).push(offer);
    origins.get(originKey).push(offer);
  }
  return deltas.map((delta) => {
    const previous = percent(delta.descuento_anterior);
    const requested = percent(delta.descuento_solicitado);
    const changed = previous !== null && requested !== null && previous !== requested && delta.tipo_cambio !== "SIN_CAMBIO";
    const originKey = JSON.stringify([key(delta.canal, delta.segmento_id, previous), text(delta.sku)]);
    return {
      ...delta,
      oferta_origen: result(changed && previous > 0, changed && previous > 0 ? origins.get(originKey) : []),
      oferta_destino: result(changed && requested > 0, changed && requested > 0 ? destinations.get(key(delta.canal, delta.segmento_id, requested)) : []),
    };
  });
}
