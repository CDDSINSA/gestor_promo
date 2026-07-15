export const DEFAULT_SUPABASE_URL = "https://hanvbbezofcengyorooc.supabase.co";
export const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_DBBFpGllQwN98skP71n-Dg_kXzmEMgS";
export const STORAGE_KEY = "sinsaPromo.supabaseConnection";
export const APP_SESSION_STORAGE_KEY = "sinsaPromo.appSession";
export const REQUEST_TIMEOUT_MS = 45000;
export const SELECT_PAGE_SIZE = 1000;

export function getEnvValue(key) {
  return import.meta.env?.[key] || "";
}

export function cleanText(value) {
  return String(value ?? "").trim();
}

export function emptyToNull(value) {
  const text = cleanText(value);
  return text ? value : null;
}

export function toBoolean(value) {
  if (typeof value === "boolean") return value;
  const text = cleanText(value).toUpperCase();
  return ["TRUE", "SI", "SÍ", "1", "ACTIVO", "ACTIVA"].includes(text);
}

export function toNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isNaN(value) ? null : value;
  const clean = String(value).replace("%", "").replace(",", ".").trim();
  const number = Number(clean);
  return Number.isNaN(number) ? null : number;
}

export function normalizeTimestamp(value) {
  const text = cleanText(value);
  if (!text) return null;
  const normalized = text
    .replace(/\ba\.\s*m\./gi, "AM")
    .replace(/\bp\.\s*m\./gi, "PM");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function normalizeDate(value) {
  const timestamp = normalizeTimestamp(value);
  return timestamp ? timestamp.slice(0, 10) : null;
}

export function getSupabaseUrl(connection = {}) {
  return cleanText(connection.url || connection.supabaseUrl || getEnvValue("VITE_SUPABASE_URL") || DEFAULT_SUPABASE_URL).replace(/\/$/, "");
}

export function getAnonKey(connection = {}) {
  return cleanText(connection.anonKey || connection.supabaseAnonKey || getEnvValue("VITE_SUPABASE_ANON_KEY") || DEFAULT_SUPABASE_ANON_KEY);
}

export function getHeaders(connection, token, extra = {}) {
  const anonKey = getAnonKey(connection);
  return {
    apikey: anonKey,
    Authorization: `Bearer ${token || anonKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function assertOk(response, fallbackMessage) {
  const data = await readJsonResponse(response);
  if (!response.ok) {
    const detail = typeof data === "string" ? data : data?.message || data?.msg || data?.error_description || data?.error;
    const code = typeof data === "object" && data?.code ? ` [${data.code}]` : "";
    const message = detail ? `${fallbackMessage}: ${detail}${code}` : `${fallbackMessage} (HTTP ${response.status})`;
    throw new Error(message);
  }
  return data;
}

export function keyBy(rows, key) {
  return (rows || []).reduce((acc, row) => {
    if (row?.[key]) acc[String(row[key])] = row;
    return acc;
  }, {});
}
