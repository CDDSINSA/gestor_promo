const TIME_ZONE = "America/Managua";
export const MODIFICATION_DATE_FORMAT = "dd/mm/yyyy hh:mm";

function timestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isModifiedPromotion(row = {}) {
  const version = Number(row.version);
  // A first saved version is a creation, not an edit. Legacy data may lack versions.
  if (Number.isFinite(version) && version > 0) return version > 1;
  const created = timestamp(row.fecha_creacion || row.fechaCreacion || row.created_at);
  const modified = timestamp(row.fecha_modificacion || row.fechaModificacion || row.updated_at);
  return Boolean(created && modified && modified.getTime() > created.getTime());
}

export function getModificationExcelDate(row = {}) {
  const date = timestamp(row.fecha_modificacion || row.fechaModificacion || row.updated_at);
  if (!date) return null;
  // Excel dates have no timezone: encode Managua wall time as a sortable date value.
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date).map(({ type, value }) => [type, value]));
  return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second)));
}
