import { exportStyledWorkbook } from "../../services/excelStyleService";
import { MARGIN_STATUS_LABELS } from "./marginEngine.js";
import { describeLineRole } from "./marginPresentation.js";
import { describeOfferAbc, formatAbcCode } from "./marginClassification.js";

const OFFER_HEADERS = [
  "Actividad", "Nombre actividad", "Tipo actividad", "Oferta ID", "Tipo promo", "Grupo oferta",
  "Comprador", "División", "SKU", "Clasificación ABC", "Venta neta C$", "Costo C$", "Margen %", "Estado",
  "Líneas sin costo", "Costo vigente distinto", "Costo completado después",
];

const LINE_HEADERS = [
  "Actividad", "Oferta ID", "Tipo promo", "Rol", "Variante", "SKU", "Descripción", "Clasificación ABC", "Cantidad",
  "Unidades entregadas", "Precio c/IVA", "Precio neto", "Costo unit. C$ (AV_COST)",
  "Fuente costo", "Costo vigente C$", "Margen unit. %",
];

const round = (value, decimals = 2) => (value === null || value === undefined || !Number.isFinite(Number(value))
  ? null
  : Math.round(Number(value) * 10 ** decimals) / 10 ** decimals);

function abcExportLabel(offer) {
  const { label, detail } = describeOfferAbc(offer);
  if (label === "—") return "";
  return detail ? `Varias: ${detail}` : label;
}

export function buildMarginExportRows(offers = []) {
  const offerRows = offers.map((offer) => [
    offer.actividadId,
    offer.nombreActividad,
    offer.tipoActividad,
    offer.ofertaId,
    offer.tipoPromo,
    offer.grupoOferta,
    offer.comprador,
    offer.division,
    offer.skuCount === 1 ? offer.lineas[0]?.sku || "" : `${offer.skuCount} SKU`,
    abcExportLabel(offer),
    round(offer.ventaNeta),
    round(offer.costoTotal),
    round(offer.margen),
    MARGIN_STATUS_LABELS[offer.estado] || offer.estado,
    offer.sinCosto,
    offer.costoCambio ? "SI" : "NO",
    offer.costoEstimado ? "SI" : "NO",
  ]);
  const lineRows = offers.flatMap((offer) => offer.lineas.map((line) => [
    offer.actividadId,
    offer.ofertaId,
    offer.tipoPromo,
    describeLineRole(line),
    line.variante || "",
    line.sku,
    line.descripcion || "",
    line.clasificacion_abc === null || line.clasificacion_abc === undefined ? "" : formatAbcCode(line.clasificacion_abc),
    line.cantidad,
    line.unidadesEntregadas,
    round(line.precioBrutoUnit),
    round(line.precioNetoUnit),
    round(line.costoUnit, 4),
    line.fuente_costo || "",
    round(line.costo_vigente_nio, 4),
    round(line.margenUnit),
  ]));
  return { offerRows, lineRows };
}

export async function exportMarginReport(offers = []) {
  const { offerRows, lineRows } = buildMarginExportRows(offers);
  const stamp = new Date().toISOString().slice(0, 10);
  await exportStyledWorkbook({
    sheetName: "Margen por oferta",
    rows: [OFFER_HEADERS, ...offerRows],
    dataRows: [],
    columnCount: OFFER_HEADERS.length,
    fileName: `margenes_promociones_${stamp}.xlsx`,
    columnFormats: [
      { column: 2, width: 28 },
      { column: 4, width: 26 },
      { column: 10, width: 20 },
      { column: 11, numFmt: "#,##0.00", width: 14 },
      { column: 12, numFmt: "#,##0.00", width: 14 },
      { column: 13, numFmt: "0.00", width: 10 },
    ],
    additionalSheets: [{
      name: "Detalle por línea",
      rows: [LINE_HEADERS, ...lineRows],
      columns: LINE_HEADERS.map((header) => ({ width: Math.max(12, header.length + 2) })),
    }],
  });
}
