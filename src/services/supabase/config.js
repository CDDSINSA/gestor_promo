export const STORAGE_KEY = "sinsaPromo.supabaseConnection";
export const APP_SESSION_STORAGE_KEY = "sinsaPromo.appSession";
export const REQUEST_TIMEOUT_MS = 45000;
export const SELECT_PAGE_SIZE = 1000;
export const SUPABASE_CONNECTION_OVERRIDES_ENABLED = false;

export function getEnvValue(key) {
  return import.meta.env?.[key] || "";
}

export function cleanText(value) {
  return String(value ?? "").trim();
}

function withoutTrailingSlash(value) {
  return cleanText(value).replace(/\/$/, "");
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

export function getConfiguredSupabaseUrl() {
  return withoutTrailingSlash(getEnvValue("VITE_SUPABASE_URL"));
}

export function getConfiguredAnonKey() {
  return cleanText(getEnvValue("VITE_SUPABASE_ANON_KEY"));
}

function getConnectionUrlOverride(connection = {}) {
  if (!SUPABASE_CONNECTION_OVERRIDES_ENABLED) return "";
  return withoutTrailingSlash(connection.url || connection.supabaseUrl);
}

function getConnectionAnonKeyOverride(connection = {}) {
  if (!SUPABASE_CONNECTION_OVERRIDES_ENABLED) return "";
  return cleanText(connection.anonKey || connection.supabaseAnonKey);
}

export function getSupabaseUrl(connection = {}) {
  return getConnectionUrlOverride(connection) || getConfiguredSupabaseUrl();
}

export function getAnonKey(connection = {}) {
  return getConnectionAnonKeyOverride(connection) || getConfiguredAnonKey();
}

function getUrlHostname(value) {
  const text = withoutTrailingSlash(value);
  if (!text) return "";
  try {
    return new URL(text).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function normalizeHostEntry(value) {
  const text = cleanText(value).toLowerCase();
  if (!text) return "";
  return getUrlHostname(text) || text;
}

export function getAllowedSupabaseHosts(connection = {}) {
  const configuredHosts = cleanText(getEnvValue("VITE_SUPABASE_ALLOWED_HOSTS"))
    .split(",")
    .map(normalizeHostEntry)
    .filter(Boolean);
  const hosts = new Set(configuredHosts);
  const configuredHost = getUrlHostname(getConfiguredSupabaseUrl());
  if (configuredHost) hosts.add(configuredHost);
  const overrideHost = SUPABASE_CONNECTION_OVERRIDES_ENABLED ? getUrlHostname(getConnectionUrlOverride(connection)) : "";
  if (overrideHost && configuredHosts.includes(overrideHost)) hosts.add(overrideHost);
  return hosts;
}

export function assertAllowedSupabaseHost(connection = {}) {
  const supabaseUrl = getSupabaseUrl(connection);
  const hostname = getUrlHostname(supabaseUrl);
  if (!hostname) {
    throw new Error("La URL de Supabase no es valida.");
  }
  const allowedHosts = getAllowedSupabaseHosts(connection);
  if (!allowedHosts.has(hostname)) {
    throw new Error("El origen de Supabase no esta permitido para este entorno.");
  }
  return supabaseUrl;
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

const activeFetchControllers = new Set();

export function abortActiveSupabaseRequests() {
  activeFetchControllers.forEach((controller) => controller.abort());
  activeFetchControllers.clear();
}

export async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  activeFetchControllers.add(controller);
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();

  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener("abort", abortFromCaller, { once: true });
  }

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
    if (options.signal) options.signal.removeEventListener("abort", abortFromCaller);
    activeFetchControllers.delete(controller);
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
    const error = new Error(message);
    error.status = response.status;
    error.supabaseError = data;
    throw error;
  }
  return data;
}

export function keyBy(rows, key) {
  return (rows || []).reduce((acc, row) => {
    if (row?.[key]) acc[String(row[key])] = row;
    return acc;
  }, {});
}
