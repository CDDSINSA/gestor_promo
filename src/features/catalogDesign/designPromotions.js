import { complexPromoTypes } from "../../promoTypes/promoTypeEngine.js";

const text = (value) => String(value ?? "").trim();

export function getDesignPromoPage(row = {}) {
  if (!row || typeof row !== "object") return null;

  const directValue = [
    row.numero_pagina,
    row.num_pagina,
    row.numPagina,
    row["Numero de pagina"],
    row["Numero de Pagina"],
    row["Número de pagina"],
    row["Número de página"],
    row["numero de pagina"],
    row["número de página"],
    row.pagina,
    row.página,
    row.Pagina,
    row.Página,
    row.pag,
    row.Pag,
  ].find((v) => text(v) !== "");

  let raw = directValue;

  if (raw === undefined) {
    for (const key of Object.keys(row)) {
      const cleanKey = key
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      if (["numerodepagina", "numpagina", "pagina", "pag"].includes(cleanKey)) {
        if (text(row[key]) !== "") {
          raw = row[key];
          break;
        }
      }
    }
  }

  if (raw === undefined || raw === null || text(raw) === "") return null;
  const page = Number(raw);
  return Number.isInteger(page) && page > 0 ? page : null;
}

export function getDesignCatalogPromotions(rows = [], catalogId) {
  const id = text(catalogId).toLowerCase();
  if (!id) return [];
  return rows.filter((row) =>
    [
      row.catalogo_id,
      row.catalogoId,
      row.actividad_id,
      row.actividadId,
      row.catalogo,
      row.campana_id,
    ].some((value) => text(value).toLowerCase() === id)
  );
}

export function getDesignPagePromotions(rows = [], pageNumber, query = "", limit = 50) {
  const page = Number(pageNumber) > 0 ? Number(pageNumber) : getDesignPromoPage({ numero_pagina: pageNumber });
  const belongsToPage = (row) => page !== null && getDesignPromoPage(row) === page;
  const term = text(query).toLowerCase();

  if (term) {
    const exactSku = rows.filter((row) => text(row.sku).toLowerCase() === term);
    const startsSku = rows.filter((row) => text(row.sku).toLowerCase().startsWith(term) && !exactSku.includes(row));
    const containsSku = rows.filter((row) => text(row.sku).toLowerCase().includes(term) && !exactSku.includes(row) && !startsSku.includes(row));
    const otherMatches = rows.filter((row) => {
      if (exactSku.includes(row) || startsSku.includes(row) || containsSku.includes(row)) return false;
      const desc = text(row.descripcion || row.desc).toLowerCase();
      const numParte = text(row.num_parte || row.numParte).toLowerCase();
      return desc.includes(term) || numParte.includes(term);
    });

    const allMatches = [...exactSku, ...startsSku, ...containsSku, ...otherMatches];
    const matchBelongs = allMatches.filter(belongsToPage);
    const matchOther = allMatches.filter((row) => !belongsToPage(row));

    return [...matchBelongs, ...matchOther.slice(0, limit)];
  }

  const pageRows = page !== null ? rows.filter(belongsToPage) : [];
  const otherRows = page !== null ? rows.filter((row) => !belongsToPage(row)) : rows;

  if (pageRows.length > 0) {
    return [...pageRows, ...otherRows.slice(0, limit)];
  }

  return rows.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Agrupación por oferta para el panel de SKU de Diseño de catálogos.
// Las promociones complejas (Combo, Umbral, Compra X lleva X…) se muestran en una sola
// card con todas sus líneas; las simples siguen siendo una card por fila.
// ---------------------------------------------------------------------------

const COMPLEX_PROMO_TYPES = new Set(complexPromoTypes.map((type) => type.toLowerCase()));
const ROLE_ORDER = { principal: 0, beneficio: 1, regalia: 2 };
const ROLE_LABELS = { principal: "Principal", beneficio: "Beneficio", regalia: "Regalía" };

const lower = (value) => text(value).toLowerCase();
const firstValue = (row, ...fields) => fields.map((field) => text(row?.[field])).find(Boolean) || "";

export const getPromoType = (row) => firstValue(row, "tipoPromo", "tipo_promo");
const getGroup = (row) => firstValue(row, "grupoOferta", "grupo_oferta");
const getOfferId = (row) => firstValue(row, "ofertaId", "oferta_id");
const getRole = (row) => lower(firstValue(row, "tipoSku", "tipo_sku"));
const getBuyerKey = (row) => firstValue(row, "comprador_id", "compradorId", "buyer_id", "buyerId", "usuario_id", "usuarioId", "comprador");
const getRowKey = (row, index) => firstValue(row, "id", "row_id", "rowId") || `${text(row?.sku)}#${index}`;

export function isComplexDesignPromo(row) {
  return COMPLEX_PROMO_TYPES.has(lower(getPromoType(row)));
}

// Clave de oferta: el oferta_id ya trae catálogo + tipo + comprador + número, pero se le
// suman tipo y comprador para que datos viejos sin comprador en el ID no junten combos ajenos.
export function getDesignOfferKey(row, index = 0) {
  if (isComplexDesignPromo(row)) {
    const offer = getOfferId(row) || getGroup(row);
    if (offer) return ["complex", lower(getPromoType(row)), lower(getBuyerKey(row)), lower(offer)].join("|");
  }
  return `row|${getRowKey(row, index)}`;
}

export function getDesignRoleLabel(row) {
  const role = getRole(row);
  if (!role || role === "simple") return "";
  return ROLE_LABELS[role] || role.charAt(0).toUpperCase() + role.slice(1);
}

// "combo-1" -> "Combo 1"; si el grupo no sigue el patrón se muestra tal cual.
export function getDesignOfferLabel(row) {
  const type = getPromoType(row);
  const group = getGroup(row);
  const match = group.match(/-(\d+)$/);
  if (match && type) return `${type} ${Number(match[1])}`;
  return group || type || "Oferta";
}

const parsePercent = (value) => {
  const raw = text(value).replace(/%$/, "").trim().replace(",", ".");
  if (!raw) return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
};

const formatPercent = (value) => {
  const raw = text(value);
  return raw.endsWith("%") ? raw : `${raw}%`;
};

// Beneficio de una línea:
// - Regalía: descuento 100 %, precio ahora 0 en promo compleja o rol regalía sin otro valor.
// - Descuento: promo tipo Descuento, o línea compleja con descuento (no se muestra "Ahora").
// - Precio: el resto (como hoy).
export function getDesignLineBenefit(row = {}) {
  const discount = firstValue(row, "descuento");
  const now = firstValue(row, "precioAhora", "precio_ahora");
  const percent = parsePercent(discount);
  const complex = isComplexDesignPromo(row);
  const nowIsZero = now !== "" && Number(now) === 0;

  if (percent === 100 || (complex && nowIsZero) || (getRole(row) === "regalia" && !now && !discount)) {
    return { kind: "regalia", label: "Beneficio", value: "Regalía" };
  }
  if (discount && (lower(getPromoType(row)) === "descuento" || complex)) {
    return { kind: "descuento", label: "Desc.", value: formatPercent(discount) };
  }
  return { kind: "precio", label: "Ahora", value: now };
}

function sortOfferLines(lines) {
  return lines
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const ra = ROLE_ORDER[getRole(a.row)] ?? 9;
      const rb = ROLE_ORDER[getRole(b.row)] ?? 9;
      return ra - rb || a.index - b.index;
    })
    .map((item) => item.row);
}

// AIRES: precio del aire = Σ(precio pieza × cantidad); "antes" = Σ(precio antes × cantidad).
const AIRES_TYPE = "aires";
const toNumberOrNull = (value) => {
  const raw = text(value);
  if (!raw) return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
};
const sumLines = (lines, ...fields) => {
  let total = 0;
  for (const row of lines) {
    const value = toNumberOrNull(firstValue(row, ...fields));
    if (value === null) return null;
    total += value * (toNumberOrNull(firstValue(row, "cantidadMinima", "cantidad_minima")) || 1);
  }
  return Math.round((total + Number.EPSILON) * 100) / 100;
};

export function getDesignAireSummary(lines = []) {
  if (!lines.length || lower(getPromoType(lines[0])) !== AIRES_TYPE) return null;
  return {
    description: firstValue(lines[0], "descripcion"),
    total: sumLines(lines, "precioAhora", "precio_ahora"),
    before: sumLines(lines, "precioAntes", "precio_antes"),
  };
}

// Construye las ofertas del catálogo (todas sus líneas), conservando el orden de aparición.
export function buildDesignOffers(rows = []) {
  const byKey = new Map();
  rows.forEach((row, index) => {
    const key = getDesignOfferKey(row, index);
    if (!byKey.has(key)) byKey.set(key, { key, complex: key.startsWith("complex|"), lines: [] });
    byKey.get(key).lines.push(row);
  });
  const offerByRow = new Map();
  const offers = Array.from(byKey.values()).map((offer) => {
    const lines = offer.complex ? sortOfferLines(offer.lines) : offer.lines;
    const pages = lines.map(getDesignPromoPage).filter((page) => page !== null);
    const first = lines[0];
    const built = {
      ...offer,
      lines,
      page: pages[0] ?? null,
      pages: Array.from(new Set(pages)),
      label: offer.complex ? getDesignOfferLabel(first) : "",
      buyer: firstValue(first, "comprador", "comprador_nombre", "nombre_comprador"),
      promoType: getPromoType(first),
      aire: offer.complex ? getDesignAireSummary(lines) : null,
    };
    offer.lines.forEach((row) => offerByRow.set(row, built));
    return built;
  });
  return { offers, offerByRow };
}

// Igual que getDesignPagePromotions pero devuelve ofertas: la búsqueda encuentra filas y
// cada coincidencia trae su oferta completa (sin cards repetidas). Las ofertas con alguna
// línea en la página actual van primero y siempre completas; el límite cuenta ofertas.
export function getDesignPageOffers(rows = [], pageNumber, query = "", limit = 50) {
  const { offers, offerByRow } = buildDesignOffers(rows);
  const page = Number(pageNumber) > 0 ? Number(pageNumber) : getDesignPromoPage({ numero_pagina: pageNumber });
  const ordered = getDesignPagePromotions(rows, pageNumber, query, Number.POSITIVE_INFINITY);
  const term = text(query);

  const seen = new Map();
  ordered.forEach((row) => {
    const offer = offerByRow.get(row);
    if (!offer) return;
    if (!seen.has(offer.key)) seen.set(offer.key, { ...offer, matchedRows: new Set() });
    if (term) seen.get(offer.key).matchedRows.add(row);
  });

  const all = Array.from(seen.values());
  const onPage = (offer) => page !== null && offer.lines.some((row) => getDesignPromoPage(row) === page);
  const pageOffers = all.filter(onPage);
  const otherOffers = all.filter((offer) => !onPage(offer));
  const visible = [...pageOffers, ...otherOffers.slice(0, limit)];
  return { offers: visible, total: term ? all.length : offers.length };
}
