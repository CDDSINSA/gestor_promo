const segmentColumns = ["aplicaSegmento", "segmento"];

const commonSimpleColumns = [
  "tipoPromo",
  ...segmentColumns,
  "sku",
  "numParte",
  "descripcion",
  "tipoCantidad",
  "cantidadMinima",
  "precioAntes",
  "precioAhora",
  "descuento",
  "comentario",
];

const commonComplexColumns = [
  "grupoOferta",
  "tipoSku",
  ...segmentColumns,
  "sku",
  "numParte",
  "descripcion",
  "tipoCantidad",
  "cantidadMinima",
  "precioAntes",
  "precioAhora",
  "descuento",
  "comentario",
];

const buyXGetXColumns = [
  "grupoOferta",
  "tipoSku",
  "variante",
  ...segmentColumns,
  "sku",
  "numParte",
  "descripcion",
  "tipoCantidad",
  "cantidadMinima",
  "precioAntes",
  "precioAhora",
  "descuento",
  "comentario",
];

export const promoLabels = {
  tipoPromo: "Tipo promo",
  grupoOferta: "Oferta",
  tipoSku: "Rol",
  variante: "Variante",
  aplicaSegmento: "Segmenta",
  segmento: "Segmentos",
  sku: "SKU",
  numParte: "Núm. parte",
  descripcion: "Descripción",
  tipoCantidad: "Tipo cantidad",
  cantidadMinima: "Cantidad mínima",
  precioAntes: "Precio antes c/IVA",
  precioAhora: "Precio ahora c/IVA",
  descuento: "Descuento",
  comentario: "Comentario adicional",
};

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function createDefaultGroup(type, rows) {
  const prefix = normalizeKey(type) || "promo";
  const count = rows.filter((row) => row.tipoPromo === type && row.tipoSku === "principal").length + 1;
  return `${prefix}-${count}`;
}

function createUniqueGroup(type, rows) {
  const prefix = normalizeKey(type) || "promo";
  const groups = new Set(
    rows
      .filter((row) => (row.tipoPromo || row.tipo_promo) === type)
      .map((row) => row.grupoOferta || row.grupo_oferta)
      .filter(Boolean)
  );
  let next = 1;
  while (groups.has(`${prefix}-${next}`)) next += 1;
  return `${prefix}-${next}`;
}

function validateComplexBase(row) {
  const errors = [];
  if (!row.grupoOferta && !row.grupo_oferta) errors.push("grupo_oferta");
  if (!row.tipoSku && !row.tipo_sku) errors.push("tipo_sku");
  return errors;
}

function validateBuyXGetX(row) {
  const errors = validateComplexBase(row);
  if (!row.variante) errors.push("variante");
  return errors;
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function validatePrecioFijo(row) {
  return hasValue(row.precioAhora) || hasValue(row.precio_ahora) ? [] : ["precio_ahora"];
}

function validateDescuento(row) {
  return hasValue(row.descuento) ? [] : ["descuento"];
}

function complexEngine(type, overrides = {}) {
  return {
    type,
    kind: "complex",
    columns: commonComplexColumns,
    detailFields: [],
    createGroup: createDefaultGroup,
    validateRow: validateComplexBase,
    ...overrides,
  };
}

function simpleEngine(type, validateRow = () => []) {
  return {
    type,
    kind: "simple",
    columns: commonSimpleColumns,
    detailFields: [],
    createGroup: (promoType) => promoType,
    validateRow,
  };
}

export const promoTypeEngines = {
  "Precio fijo": simpleEngine("Precio fijo", validatePrecioFijo),
  Descuento: simpleEngine("Descuento", validateDescuento),
  Combo: complexEngine("Combo", {
    createGroup: createUniqueGroup,
  }),
  Umbral: complexEngine("Umbral", {
    detailFields: ["monto_minimo", "cantidad_minima_grupo", "beneficio_umbral"],
    createGroup: createUniqueGroup,
  }),
  "Compra X lleva X": complexEngine("Compra X lleva X", {
    columns: buyXGetXColumns,
    detailFields: ["cantidad_compra", "cantidad_lleva", "rol_beneficio"],
    createGroup: createUniqueGroup,
    validateRow: validateBuyXGetX,
  }),
  "Compra X Lleva X V2": complexEngine("Compra X Lleva X V2", {
    columns: buyXGetXColumns,
    detailFields: ["cantidad_compra", "cantidad_lleva", "rol_beneficio"],
    createGroup: createUniqueGroup,
    validateRow: validateBuyXGetX,
  }),
};

export const simplePromoTypes = Object.values(promoTypeEngines)
  .filter((engine) => engine.kind === "simple")
  .map((engine) => engine.type);

export const complexPromoTypes = Object.values(promoTypeEngines)
  .filter((engine) => engine.kind === "complex")
  .map((engine) => engine.type);

export const allPromoTypes = [...simplePromoTypes, ...complexPromoTypes];

export function getPromoTypeEngine(type) {
  return promoTypeEngines[type] || simpleEngine(type || "Precio fijo");
}

export function getColumnsForPromoType(type) {
  return getPromoTypeEngine(type).columns;
}

export function isComplexPromoType(type) {
  return getPromoTypeEngine(type).kind === "complex";
}

export function createGroupForPromoType(type, rows) {
  return getPromoTypeEngine(type).createGroup(type, rows);
}

export function validatePromoByType(row) {
  const type = row.tipoPromo || row.tipo_promo;
  return getPromoTypeEngine(type).validateRow(row);
}

