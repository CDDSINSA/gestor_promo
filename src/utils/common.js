export function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

export function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

export function normalizeValue(value) {
  return String(value ?? "").trim();
}

export function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  const text = String(value || "").trim().toUpperCase();
  return text === "TRUE" || text === "SI" || text === "SÍ" || text === "ACTIVO";
}

export function formatDisplayDate(value) {
  if (!value) return "";
  const [year, month, day] = String(value).split("-");
  if (!year || !month || !day) return value;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-NI", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDisplayDate(value) || value;
  return date.toLocaleString("es-NI", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function formatVigenciaRange(start, end) {
  const first = formatDisplayDate(start);
  const last = formatDisplayDate(end);
  if (first && last) return `${first} - ${last}`;
  return first || last || "";
}
