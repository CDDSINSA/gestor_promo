export const OFFER_LIMIT = 500;
export const OFFER_WARNING = 450;
const text = (value) => String(value ?? "").trim();
const upper = (value) => text(value).toUpperCase();
const id = (value) => /^\d+$/.test(text(value)) ? text(value).replace(/^0+(?=\d)/, "") : "";
const ids = (value) => text(value).split(/[,;\s]+/).map(id).filter(Boolean);
const union = (...sets) => new Set(sets.flatMap((set) => [...set]));

export function managuaDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Managua", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function dateKey(value) {
  const key = text(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return "";
  const date = new Date(`${key}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== key ? "" : key;
}

export function offerStatus(count) {
  if (count >= OFFER_LIMIT) return { level: "danger", label: count > OFFER_LIMIT ? "Límite superado" : "Límite alcanzado" };
  if (count >= OFFER_WARNING) return { level: "warning", label: "Cerca del límite" };
  return { level: "normal", label: "Conteo inferior a 450" };
}

// Solo cuenta IDs ORCE identificables. Nunca equipara SKU, filas o solicitudes con ofertas.
export function buildSummary({ canasto = [], requests = [], segments = [], channel, today = managuaDate() }) {
  const matches = (row) => text(row.canal).toLowerCase() === text(channel).toLowerCase();
  const fidelity = { promotions: new Set(), offers: new Set() };
  const special = { promotions: new Set(), offers: new Set() };
  const bySegment = new Map();
  const pending = new Set();
  const unknownSegmentOffers = new Set();
  let undatedRequests = 0, missingIdsRequests = 0, currentRequests = 0;
  segments.filter(matches).forEach((segment) => {
    const key = text(segment.legacy_segmento_id || segment.segmento_id);
    if (key) bySegment.set(key, { id: key, name: text(segment.nombre_segmento || segment.segmento || key), offers: new Set() });
  });
  canasto.filter(matches).forEach((row) => {
    if (upper(row.estatus) !== "ACTIVO" || !(Number(row.descuento) > 0)) return;
    const offer = id(row.oferta_id_orce), promo = id(row.promo_id_orce);
    if (upper(row.estado_conciliacion_orce) !== "CONCILIADO" || !offer || !promo) {
      pending.add(`${row.sku}|${row.segmento_id}`);
      return;
    }
    fidelity.offers.add(offer); fidelity.promotions.add(promo);
    const key = text(row.segmento_id);
    if (!key) { unknownSegmentOffers.add(offer); return; }
    if (!bySegment.has(key)) bySegment.set(key, { id: key, name: "Segmento fuera del catálogo", offers: new Set() });
    bySegment.get(key).offers.add(offer);
  });
  requests.filter(matches).forEach((request) => {
    if (upper(request.tipo_actividad) !== "ESPECIAL" || upper(request.legacy_actividad_id || request.actividad_id).startsWith("FID-") || upper(request.subtipo) === "FIDELIZACION") return;
    if (!["FINALIZADO", "ARCHIVADO"].includes(upper(request.estado))) return;
    const start = dateKey(request.fecha_inicio), end = dateKey(request.fecha_fin);
    if (!start || !end || end < start) { undatedRequests++; return; }
    if (today < start || today > end) return;
    currentRequests++;
    const promos = ids(request.promo_ids), offers = ids(request.oferta_ids);
    if (!promos.length || !offers.length) missingIdsRequests++;
    promos.forEach((value) => special.promotions.add(value));
    offers.forEach((value) => special.offers.add(value));
    // La cabecera no relaciona cada ID de oferta con un segmento. No repartir por inferencia.
  });
  const segmentRows = [...bySegment.values()].map(({ offers, ...segment }) => ({ ...segment, count: offers.size, ...offerStatus(offers.size) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return {
    promotions: union(fidelity.promotions, special.promotions).size,
    offers: union(fidelity.offers, special.offers).size,
    sources: [
      { name: "Fidelización", promotions: fidelity.promotions.size, offers: fidelity.offers.size },
      { name: "Solicitudes especiales", promotions: special.promotions.size, offers: special.offers.size },
    ],
    segments: segmentRows, alerts: segmentRows.filter((segment) => segment.count >= OFFER_WARNING),
    pending: pending.size, unassigned: union(special.offers, unknownSegmentOffers).size,
    undatedRequests, missingIdsRequests, currentRequests, today,
  };
}
