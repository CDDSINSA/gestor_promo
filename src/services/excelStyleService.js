import { normalizeCanal } from "../utils/promoHelpers";

const SIMPLE_PROMO_TYPES = new Set(["descuento", "precio fijo"]);
const COMPLEX_PROMO_BAND_COLORS = ["E2F0D9", "FCE4D6"];

export async function loadStyledXlsx() {
  const module = await import("xlsx-js-style");
  return module.default || module;
}

function getPromoType(row = {}) {
  return row.tipoPromo || row.tipo_promo || "";
}

function getActivityId(row = {}) {
  return row.actividadId || row.actividad_id || row.catalogo_id || row.catalogoId || "";
}

function getOfferGroupKey(row = {}) {
  return row.ofertaId || row.oferta_id || row.grupoOferta || row.grupo_oferta || row.id || row.row_id || row.rowId || "";
}

function shouldBandPromoRow(row = {}) {
  const promoType = normalizeCanal(getPromoType(row));
  return Boolean(promoType) && !SIMPLE_PROMO_TYPES.has(promoType);
}

function getBandGroupKey(row = {}) {
  return `${normalizeCanal(getActivityId(row))}::${normalizeCanal(getOfferGroupKey(row))}::${normalizeCanal(getPromoType(row))}`;
}

export function applyComplexPromoBanding(XLSX, worksheet, dataRows = [], columnCount = 0) {
  if (!worksheet || !dataRows.length || !columnCount) return worksheet;

  const groupColorIndexes = new Map();
  let nextColorIndex = 0;

  dataRows.forEach((row, dataIndex) => {
    if (!shouldBandPromoRow(row)) return;

    const groupKey = getBandGroupKey(row);
    if (!groupColorIndexes.has(groupKey)) {
      groupColorIndexes.set(groupKey, nextColorIndex % COMPLEX_PROMO_BAND_COLORS.length);
      nextColorIndex += 1;
    }

    const color = COMPLEX_PROMO_BAND_COLORS[groupColorIndexes.get(groupKey)];
    const excelRowIndex = dataIndex + 1;

    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      const address = XLSX.utils.encode_cell({ r: excelRowIndex, c: columnIndex });
      const cell = worksheet[address] || { t: "s", v: "" };
      worksheet[address] = {
        ...cell,
        s: {
          ...(cell.s || {}),
          fill: {
            patternType: "solid",
            fgColor: { rgb: color },
          },
        },
      };
    }
  });

  return worksheet;
}
