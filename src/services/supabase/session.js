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
  getSupabaseSchema,
  getSupabaseUrl,
} from "./config";

export const SUPABASE_PROJECT_URL = getConfiguredSupabaseUrl();

const SUPABASE_AUTH_STORAGE_KEY = "sinsaPromo.supabaseAuth";
const RECOVERY_STORAGE_KEY = `${SUPABASE_AUTH_STORAGE_KEY}.recovery`;
const authClients = new Map();
const memoryAuthStorage = {};
let currentAppSession = null;
let sessionGeneration = 0;

function getPkceStorageKey() {
  return `${SUPABASE_AUTH_STORAGE_KEY}-code-verifier`;
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

// The PKCE code verifier must survive opening the e-mail link in a NEW tab, so it lives in
// localStorage (shared by the browser). The session itself stays per tab in sessionStorage.
function storageForKey(key) {
  return String(key).endsWith("-code-verifier") ? getBrowserLocalStorage() : getBrowserSessionStorage();
}

const tabAuthStorage = {
  getItem(key) {
    try {
      return storageForKey(key)?.getItem(key) ?? memoryAuthStorage[key] ?? null;
    } catch { return memoryAuthStorage[key] ?? null; }
  },
  setItem(key, value) {
    memoryAuthStorage[key] = value;
    try {
      storageForKey(key)?.setItem(key, value);
    } catch { /* Storage may be blocked; keep this tab usable in memory. */ }
  },
  removeItem(key) {
    delete memoryAuthStorage[key];
    try { storageForKey(key)?.removeItem(key); } catch { /* Unavailable storage. */ }
  },
};

// supabase-js stores the verifier with JSON.stringify ("\"abc/recovery\""), so parse it first.
function readStoredVerifier() {
  const raw = tabAuthStorage.getItem(getPkceStorageKey()) || "";
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "string" ? parsed : "";
  } catch {
    return raw;
  }
}

function getUrlAuthParams() {
  if (typeof window === "undefined") return new URLSearchParams();
  const url = new URL(window.location.href);
  const params = new URLSearchParams(url.hash.replace(/^#/, ""));
  url.searchParams.forEach((value, key) => { if (!params.has(key)) params.set(key, value); });
  return params;
}

function detectRecoveryCallback() {
  const params = getUrlAuthParams();
  return Boolean(params.get("code")) && readStoredVerifier().endsWith("/recovery");
}

// Invitation e-mails (correo-auth hook) link straight to the app with ?token_hash=...&type=invite.
// The app verifies the hash itself, so it works in any browser and mail scanners can't burn the link.
function detectInviteCallback() {
  const params = getUrlAuthParams();
  return Boolean(params.get("token_hash")) && params.get("type") === "invite";
}

// Captured when the module loads, before the SDK exchanges the code and deletes the verifier.
const inviteTokenHashAtLoad = detectInviteCallback() ? getUrlAuthParams().get("token_hash") : "";
let recoveryCallbackAtLoad = detectRecoveryCallback() || Boolean(inviteTokenHashAtLoad);
let inviteVerification = null;

function getAuthLinkErrorMessage() {
  const params = getUrlAuthParams();
  const code = params.get("error_code") || params.get("error");
  if (!code) return "";
  if (code === "otp_expired") {
    return params.get("type") === "invite"
      ? "La invitacion vencio o ya fue usada. Pida que se la reenvien."
      : "El enlace de recuperacion vencio o ya fue usado. Solicite uno nuevo.";
  }
  const description = (params.get("error_description") || "").replace(/\+/g, " ");
  return `No se pudo validar el enlace${description ? `: ${description}` : ""}. Solicite uno nuevo.`;
}

function getSupabaseAuthClient(connection = {}) {
  const supabaseUrl = assertAllowedSupabaseHost(connection);
  const anonKey = getAnonKey(connection);
  if (!anonKey) throw new Error("Configure URL y anon key de Supabase para autenticacion.");

  const schema = getSupabaseSchema(connection);
  const cacheKey = `${supabaseUrl}|${anonKey}|${schema}`;
  if (!authClients.has(cacheKey)) {
    authClients.set(cacheKey, createClient(supabaseUrl, anonKey, {
      db: { schema },
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
        // Persist SDK credentials across reloads in this browser tab.
        persistSession: true,
        storage: tabAuthStorage,
        storageKey: SUPABASE_AUTH_STORAGE_KEY,
      },
    }));
    // Keep the application snapshot synchronized even when the SDK refreshes
    // in the background. Never call asynchronous auth methods in this callback.
    authClients.get(cacheKey).auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") tabAuthStorage.setItem(RECOVERY_STORAGE_KEY, "true");
      if (event === "SIGNED_OUT") tabAuthStorage.removeItem(RECOVERY_STORAGE_KEY);
      if (event === "SIGNED_OUT") {
        sessionGeneration += 1;
        recoveryCallbackAtLoad = false;
      }
      rememberAppSession(session);
    });
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
  sessionGeneration += 1;
}

function getSupabaseErrorMessage(error, fallbackMessage) {
  const detail = error?.message || error?.error_description || error?.error;
  return detail ? `${fallbackMessage}: ${detail}` : fallbackMessage;
}

function hasRecoveryCallbackInUrl() {
  if (tabAuthStorage.getItem(RECOVERY_STORAGE_KEY)) return true;
  return recoveryCallbackAtLoad || detectRecoveryCallback();
}

// "invite" when this tab is defining the password of an invited user, otherwise "recovery".
function getRecoveryKind() {
  if (inviteTokenHashAtLoad || tabAuthStorage.getItem(RECOVERY_STORAGE_KEY) === "invite") return "invite";
  return "recovery";
}

function verifyInviteLink(client) {
  if (!inviteVerification) {
    // Run once per page load: the token is single use (React StrictMode would call this twice).
    inviteVerification = client.auth.verifyOtp({ token_hash: inviteTokenHashAtLoad, type: "invite" })
      .then(({ data, error }) => {
        if (error) {
          const expired = error.code === "otp_expired" || /expired|invalid/i.test(error.message || "");
          throw new Error(expired
            ? "La invitacion vencio o ya fue usada. Pida que se la reenvien."
            : getSupabaseErrorMessage(error, "No se pudo validar la invitacion."));
        }
        if (!data.session) throw new Error("No se pudo validar la invitacion.");
        tabAuthStorage.setItem(RECOVERY_STORAGE_KEY, "invite");
        return data.session;
      });
  }
  return inviteVerification;
}

export function getDefaultSupabaseConnection() {
  return {
    url: getConfiguredSupabaseUrl(),
    anonKey: getConfiguredAnonKey(),
    schema: getSupabaseSchema(),
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
  const linkError = getAuthLinkErrorMessage();
  if (linkError) throw new Error(linkError);
  if (!hasRecoveryCallbackInUrl()) return null;
  const client = getSupabaseAuthClient(connection);
  const kind = getRecoveryKind();
  if (inviteTokenHashAtLoad && tabAuthStorage.getItem(RECOVERY_STORAGE_KEY) !== "invite") {
    const session = await verifyInviteLink(client);
    return { ...rememberAppSession(session), recovery_kind: kind };
  }
  const { data, error } = await client.auth.getSession();
  const label = kind === "invite" ? "la invitacion" : "el enlace de recuperacion";
  if (error) throw new Error(getSupabaseErrorMessage(error, `No se pudo validar ${label}.`));
  if (!data.session) throw new Error(`No se pudo validar ${label}.`);
  return { ...rememberAppSession(data.session), recovery_kind: kind };
}

export function subscribeAppSession(connection, listener) {
  // Capture this before SDK initialization consumes the PKCE verifier.
  const recoveryCallback = hasRecoveryCallbackInUrl();
  const client = getSupabaseAuthClient(connection);
  const { data } = client.auth.onAuthStateChange((event, session) => {
    if (event === "INITIAL_SESSION" && (recoveryCallback || hasRecoveryCallbackInUrl())) return;
    listener(event, normalizeSession(session));
  });
  return () => data.subscription.unsubscribe();
}

export async function ensureFreshAppSession(connection, session) {
  const generation = sessionGeneration;
  const client = getSupabaseAuthClient(connection);
  // getSession reads the SDK's latest credentials and coordinates renewal.
  // Passing a captured refresh_token here would reintroduce token reuse.
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  if (generation !== sessionGeneration || !data.session?.access_token) {
    throw new Error("La sesion termino. Inicie sesion nuevamente.");
  }
  const expectedUser = session?.user?.id || session?.user_id;
  if (expectedUser && expectedUser !== data.session.user?.id) {
    throw new Error("La sesion cambio. Vuelva a intentar la operacion.");
  }
  return rememberAppSession(data.session);
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
  tabAuthStorage.removeItem(RECOVERY_STORAGE_KEY);
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
  await ensureFreshAppSession(connection, recoverySession);
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

  throw new Error("El usuario inicio sesion, pero no esta activo en usuarios_app.");
}

export async function signOutAppUser(connection = {}, session = null, options = {}) {
  const activeSession = session || connection.session || connection.appSession || connection.authSession || currentAppSession;

  try {
    if (activeSession?.access_token && hasSupabaseConnection(connection)) {
      const scope = cleanText(options.scope || "local").toLowerCase();
      const client = getSupabaseAuthClient(connection);
      const { error } = await client.auth.signOut({ scope });
      if (error) throw new Error(getSupabaseErrorMessage(error, "No se pudo cerrar la sesion en Supabase."));
    }
  } finally {
    tabAuthStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY);
    tabAuthStorage.removeItem(RECOVERY_STORAGE_KEY);
    clearLegacyStoredAppSession();
    getBrowserSessionStorage()?.removeItem(getPkceStorageKey());
    getBrowserLocalStorage()?.removeItem(getPkceStorageKey());
    recoveryCallbackAtLoad = false;
    clearAuthMemory();
  }
}
