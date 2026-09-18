import { normalizeCanal } from "../utils/promoHelpers";
import { complexPromoTypes } from "../promoTypes/promoTypeEngine";
import { isAnulledPromotion } from "../features/promotions/application/promotionAnulation";

const COMPLEX_PROMO_TYPES = new Set(complexPromoTypes.map((type) => normalizeCanal(type)));
const COMPLEX_PROMO_BAND_COLORS = ["FFE2F0D9", "FFFCE4D6"];
const ANULLED_ROW_COLOR = "FFFFE2E2";
const ANULLED_FONT_COLOR = "FF991B1B";
const MODIFIED_ROW_COLOR = "FFFFF2CC";
const EXCEL_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function loadExcelJS() {
  const module = await import("exceljs");
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
  return COMPLEX_PROMO_TYPES.has(promoType);
}

function getBandGroupKey(row = {}) {
  return `${normalizeCanal(getActivityId(row))}::${normalizeCanal(getOfferGroupKey(row))}::${normalizeCanal(getPromoType(row))}`;
}

function applyComplexPromoBanding(worksheet, dataRows = [], columnCount = 0) {
  if (!worksheet || !dataRows.length || !columnCount) return;

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
    const excelRowIndex = dataIndex + 2;
    const worksheetRow = worksheet.getRow(excelRowIndex);

    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      const cell = worksheetRow.getCell(columnIndex + 1);
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: color },
      };
    }
  });
}

function applyAnulledRowStyle(worksheet, dataRows = [], columnCount = 0) {
  if (!worksheet || !dataRows.length || !columnCount) return;

  dataRows.forEach((row, dataIndex) => {
    if (!isAnulledPromotion(row)) return;
    const worksheetRow = worksheet.getRow(dataIndex + 2);
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      const cell = worksheetRow.getCell(columnIndex + 1);
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: ANULLED_ROW_COLOR },
      };
      cell.font = {
        ...(cell.font || {}),
        color: { argb: ANULLED_FONT_COLOR },
      };
    }
  });
}

function downloadBuffer(buffer, fileName) {
  const blob = new Blob([buffer], { type: EXCEL_MIME_TYPE });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function exportStyledWorkbook({ sheetName, rows = [], dataRows = [], columnCount = 0, fileName, isModifiedRow, columnFormats = [] }) {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  rows.forEach((row) => worksheet.addRow(row));
  applyComplexPromoBanding(worksheet, dataRows, columnCount);
  if (isModifiedRow) {
    dataRows.forEach((row, index) => {
      if (!isModifiedRow(row)) return;
      for (let column = 1; column <= columnCount; column += 1) {
        worksheet.getRow(index + 2).getCell(column).fill = {
          type: "pattern", pattern: "solid", fgColor: { argb: MODIFIED_ROW_COLOR },
        };
      }
    });
  }
  // Anulled promotions retain their existing red warning, even if also modified.
  applyAnulledRowStyle(worksheet, dataRows, columnCount);
  columnFormats.forEach(({ column, numFmt, width }) => {
    const target = worksheet.getColumn(column);
    if (numFmt) target.numFmt = numFmt;
    if (width) target.width = width;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBuffer(buffer, fileName);
}
