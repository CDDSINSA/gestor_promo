export function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

let idSequence = 0;

// Antes: Date.now() + aleatorio de 0 a 99.999. En una carga masiva cientos de filas
// se crean en el mismo milisegundo y dos podían recibir el mismo id (legacy_row_id),
// lo que el guardado trataba como "conflicto de promoción" contra otra fila.
function randomSuffix() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID().replace(/-/g, "").slice(0, 12);
  if (cryptoApi?.getRandomValues) {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(6));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return Math.random().toString(16).slice(2, 14).padEnd(12, "0");
}

export function makeId(prefix) {
  idSequence = (idSequence + 1) % 1679616;
  return `${prefix}-${Date.now()}-${idSequence.toString(36)}${randomSuffix()}`;
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
