import { createClient } from "@supabase/supabase-js";
import {
  APP_SESSION_STORAGE_KEY,
  SUPABASE_CONNECTION_OVERRIDES_ENABLED,
  STORAGE_KEY,
  assertOk,
  assertAllowedSupabaseHost,
  cleanText,
  fetchWithTimeout,
  getAnonKey,
  getConfiguredAnonKey,
  getConfiguredSupabaseUrl,
  getHeaders,
  getEnvValue,
  getSupabaseUrl,
} from "./config";

export const SUPABASE_PROJECT_URL = getConfiguredSupabaseUrl();

const SUPABASE_AUTH_STORAGE_KEY = "sinsaPromo.supabaseAuth";
const authClients = new Map();
const memoryAuthStorage = {};
let currentAppSession = null;
let refreshPromise = null;

function getPkceStorageKey() {
  return `${SUPABASE_AUTH_STORAGE_KEY}-code-verifier`;
}

function isPkceVerifierKey(key) {
  return key === getPkceStorageKey() || String(key || "").endsWith("-code-verifier");
}

function getBrowserSessionStorage() {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

function getBrowserLocalStorage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

const pkceMemoryStorage = {
  getItem(key) {
    if (isPkceVerifierKey(key)) {
      return getBrowserSessionStorage()?.getItem(key) ?? memoryAuthStorage[key] ?? null;
    }
    return memoryAuthStorage[key] ?? null;
  },
  setItem(key, value) {
    if (isPkceVerifierKey(key)) {
      getBrowserSessionStorage()?.setItem(key, value);
      return;
    }
    memoryAuthStorage[key] = value;
  },
  removeItem(key) {
    delete memoryAuthStorage[key];
    if (isPkceVerifierKey(key)) getBrowserSessionStorage()?.removeItem(key);
  },
};

function getSupabaseAuthClient(connection = {}) {
  const supabaseUrl = assertAllowedSupabaseHost(connection);
  const anonKey = getAnonKey(connection);
  if (!anonKey) throw new Error("Configure URL y anon key de Supabase para autenticacion.");

  const cacheKey = `${supabaseUrl}|${anonKey}`;
  if (!authClients.has(cacheKey)) {
    authClients.set(cacheKey, createClient(supabaseUrl, anonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
        // Custom storage keeps auth sessions in memory; only the PKCE verifier
        // survives redirects in sessionStorage and cannot authorize requests.
        persistSession: true,
        storage: pkceMemoryStorage,
        storageKey: SUPABASE_AUTH_STORAGE_KEY,
      },
    }));
  }
  return authClients.get(cacheKey);
}

function toMilliseconds(expiresAt) {
  const value = Number(expiresAt || 0);
  if (!value) return 0;
  return value > 1e12 ? value : value * 1000;
}

function normalizeSession(session) {
  if (!session?.access_token) return null;
  return {
    ...session,
    user_email: session.user?.email || session.user_email || "",
    expires_at: toMilliseconds(session.expires_at) || (Date.now() + Number(session.expires_in || 3600) * 1000),
  };
}

function rememberAppSession(session) {
  currentAppSession = normalizeSession(session);
  return currentAppSession;
}

function clearLegacyStoredAppSession() {
  getBrowserSessionStorage()?.removeItem(APP_SESSION_STORAGE_KEY);
  getBrowserLocalStorage()?.removeItem(APP_SESSION_STORAGE_KEY);
}

function clearAuthMemory() {
  Object.keys(memoryAuthStorage).forEach((key) => {
    delete memoryAuthStorage[key];
  });
  currentAppSession = null;
  refreshPromise = null;
}

function getSupabaseErrorMessage(error, fallbackMessage) {
  const detail = error?.message || error?.error_description || error?.error;
  return detail ? `${fallbackMessage}: ${detail}` : fallbackMessage;
}

function isSessionExpired(session) {
  return Boolean(session?.expires_at && Date.now() > Number(session.expires_at));
}

function isSessionExpiring(session, windowMs = 120000) {
  return Boolean(session?.expires_at && Date.now() > Number(session.expires_at) - windowMs);
}

function hasRecoveryCallbackInUrl() {
  if (typeof window === "undefined") return false;
  const url = new URL(window.location.href);
  const hasPkceCode = Boolean(url.searchParams.get("code"));
  const storedVerifier = getBrowserSessionStorage()?.getItem(getPkceStorageKey()) || "";
  return hasPkceCode && storedVerifier.endsWith("/recovery");
}

export function getDefaultSupabaseConnection() {
  return {
    url: getConfiguredSupabaseUrl(),
    anonKey: getConfiguredAnonKey(),
  };
}

export function loadStoredSupabaseConnection() {
  const defaults = getDefaultSupabaseConnection();
  if (!SUPABASE_CONNECTION_OVERRIDES_ENABLED) return defaults;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

export function saveStoredSupabaseConnection(connection) {
  const nextConnection = {
    url: getSupabaseUrl(connection),
    anonKey: getAnonKey(connection),
  };
  if (SUPABASE_CONNECTION_OVERRIDES_ENABLED) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextConnection));
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  return nextConnection;
}

export function hasSupabaseConnection(connection) {
  try {
    return Boolean(assertAllowedSupabaseHost(connection) && getAnonKey(connection));
  } catch {
    return false;
  }
}

export function getAuthRedirectUrl(connection = {}) {
  const configuredRedirect = cleanText(connection.authRedirectUrl || connection.redirectUrl || getEnvValue("VITE_SUPABASE_AUTH_REDIRECT_URL"));
  if (configuredRedirect) return configuredRedirect.replace(/\/$/, "");
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${window.location.pathname}`;
  }
  return getSupabaseUrl(connection);
}

export function loadStoredAppSession() {
  clearLegacyStoredAppSession();
  return currentAppSession;
}

export function saveStoredAppSession(session) {
  clearLegacyStoredAppSession();
  return rememberAppSession(session);
}

export async function loadRecoverySessionFromUrl(connection = {}) {
  if (!hasRecoveryCallbackInUrl()) return null;
  const client = getSupabaseAuthClient(connection);
  const { data, error } = await client.auth.getSession();
  if (error) throw new Error(getSupabaseErrorMessage(error, "No se pudo validar el enlace de recuperacion."));
  if (!data.session) throw new Error("No se pudo validar el enlace de recuperacion.");
  return rememberAppSession(data.session);
}

export async function refreshAppSession(connection, session) {
  if (!session?.refresh_token) {
    if (isSessionExpired(session)) throw new Error("La sesion expiro. Inicie sesion nuevamente.");
    return session;
  }
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const client = getSupabaseAuthClient(connection);
    const { data, error } = await client.auth.refreshSession({ refresh_token: session.refresh_token });
    if (error) throw new Error(getSupabaseErrorMessage(error, "No se pudo renovar la sesion."));
    const nextSession = rememberAppSession(data.session || session);
    connection.onSessionRefresh?.(nextSession);
    return nextSession;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function ensureFreshAppSession(connection, session, windowMs = 120000) {
  const activeSession = session || currentAppSession;
  if (!activeSession?.access_token) throw new Error("No hay una sesion activa para consultar Supabase. Inicie sesion nuevamente.");
  if (!isSessionExpiring(activeSession, windowMs)) return activeSession;
  return refreshAppSession(connection, activeSession);
}

export async function signInAppUser(connection, email, password) {
  const cleanEmail = cleanText(email);
  const cleanPassword = cleanText(password);
  if (!getSupabaseUrl(connection) || !getAnonKey(connection)) {
    throw new Error("Configure URL y anon key de Supabase para iniciar sesion.");
  }
  if (!cleanEmail || !cleanPassword) {
    throw new Error("Ingrese correo y contrasena para iniciar sesion.");
  }

  clearLegacyStoredAppSession();
  const client = getSupabaseAuthClient(connection);
  const { data, error } = await client.auth.signInWithPassword({
    email: cleanEmail,
    password: cleanPassword,
  });
  if (error) throw new Error(getSupabaseErrorMessage(error, "No se pudo iniciar sesion."));
  return rememberAppSession(data.session);
}

export async function requestPasswordRecovery(connection, email) {
  const cleanEmail = cleanText(email);
  if (!getSupabaseUrl(connection) || !getAnonKey(connection)) {
    throw new Error("Configure URL y anon key de Supabase para recuperar la contrasena.");
  }
  if (!cleanEmail) {
    throw new Error("Ingrese el correo del usuario para recuperar la contrasena.");
  }

  const client = getSupabaseAuthClient(connection);
  const { error } = await client.auth.resetPasswordForEmail(cleanEmail, {
    redirectTo: getAuthRedirectUrl(connection),
  });
  if (error) throw new Error(getSupabaseErrorMessage(error, "No se pudo enviar el correo de recuperacion."));
}

export async function updateRecoveredPassword(connection, recoverySession, password) {
  if (!recoverySession?.access_token) {
    throw new Error("No hay una sesion de recuperacion valida.");
  }
  const cleanPassword = cleanText(password);
  if (!cleanPassword) {
    throw new Error("Ingrese una nueva contrasena.");
  }

  const client = getSupabaseAuthClient(connection);
  await ensureFreshAppSession(connection, recoverySession, 0);
  const { data, error } = await client.auth.updateUser({ password: cleanPassword });
  if (error) throw new Error(getSupabaseErrorMessage(error, "No se pudo actualizar la contrasena."));
  return data;
}

export async function loadAuthUserFromSession(connection, session) {
  if (!session?.access_token) {
    throw new Error("No hay una sesion activa para consultar el usuario.");
  }
  const activeSession = await ensureFreshAppSession(connection, session);
  const client = getSupabaseAuthClient(connection);
  const { data, error } = await client.auth.getUser(activeSession.access_token);
  if (error) throw new Error(getSupabaseErrorMessage(error, "No se pudo consultar el usuario autenticado."));
  return data.user;
}

function buildAppUserQuery(params) {
  const query = new URLSearchParams({
    select: "id,auth_user_id,nombre,email,rol,buyer_id,activo,compradores(id,comprador_id,categoria_comprador,comprador,division,correo,senior_id,activo)",
    activo: "eq.true",
    limit: "1",
    ...params,
  });
  return `/rest/v1/usuarios_app?${query.toString()}`;
}

export async function loadAppUserProfile(connection, session) {
  if (!session?.access_token) {
    throw new Error("No hay una sesion activa para consultar permisos.");
  }
  const activeSession = await ensureFreshAppSession(connection, session);

  const authUserId = activeSession.user?.id || activeSession.user_id || "";
  const email = cleanText(activeSession.user?.email || activeSession.user_email);
  const headers = getHeaders(connection, activeSession.access_token);
  const supabaseUrl = assertAllowedSupabaseHost(connection);

  const queries = [
    authUserId ? buildAppUserQuery({ auth_user_id: `eq.${authUserId}` }) : "",
    email ? buildAppUserQuery({ email: `eq.${email}` }) : "",
  ].filter(Boolean);

  for (const query of queries) {
    const response = await fetchWithTimeout(`${supabaseUrl}${query}`, { headers });
    const data = await assertOk(response, "No se pudo consultar el perfil de permisos.");
    const profile = Array.isArray(data) ? data[0] : null;
    if (profile?.activo !== false) return profile;
  }

  throw new Error("El usuario inicio sesion, pero no esta activo en public.usuarios_app.");
}

export async function signOutAppUser(connection = {}, session = null, options = {}) {
  const activeSession = session || connection.session || connection.appSession || connection.authSession || currentAppSession;

  try {
    if (activeSession?.access_token && hasSupabaseConnection(connection)) {
      const scope = cleanText(options.scope || "global").toLowerCase();
      const client = getSupabaseAuthClient(connection);
      const { error } = await client.auth.signOut({ scope });
      if (error) throw new Error(getSupabaseErrorMessage(error, "No se pudo cerrar la sesion en Supabase."));
    }
  } finally {
    clearLegacyStoredAppSession();
    getBrowserSessionStorage()?.removeItem(getPkceStorageKey());
    clearAuthMemory();
  }
}
