import {
  APP_SESSION_STORAGE_KEY,
  DEFAULT_SUPABASE_URL,
  STORAGE_KEY,
  assertOk,
  cleanText,
  fetchWithTimeout,
  getAnonKey,
  getHeaders,
  getEnvValue,
  getSupabaseUrl,
} from "./config";

export const SUPABASE_PROJECT_URL = DEFAULT_SUPABASE_URL;

export function getDefaultSupabaseConnection() {
  return {
    url: getSupabaseUrl(),
    anonKey: getAnonKey(),
  };
}

export function loadStoredSupabaseConnection() {
  const defaults = getDefaultSupabaseConnection();
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
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextConnection));
  return nextConnection;
}

export function hasSupabaseConnection(connection) {
  return Boolean(getSupabaseUrl(connection) && getAnonKey(connection));
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
  try {
    const raw = window.sessionStorage.getItem(APP_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session?.access_token || !session?.expires_at) return null;
    if (Date.now() > Number(session.expires_at) - 60000 && !session.refresh_token) return null;
    return session;
  } catch {
    return null;
  }
}

export function saveStoredAppSession(session) {
  if (!session?.access_token) return null;
  window.sessionStorage.setItem(APP_SESSION_STORAGE_KEY, JSON.stringify(session));
  return session;
}

function isSessionExpired(session) {
  return Boolean(session?.expires_at && Date.now() > Number(session.expires_at));
}

function isSessionExpiring(session, windowMs = 120000) {
  return Boolean(session?.expires_at && Date.now() > Number(session.expires_at) - windowMs);
}

let refreshPromise = null;

export async function refreshAppSession(connection, session) {
  if (!session?.refresh_token) {
    if (isSessionExpired(session)) throw new Error("La sesion expiro. Inicie sesion nuevamente.");
    return session;
  }
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    let response;
    try {
      response = await fetchWithTimeout(`${getSupabaseUrl(connection)}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: getHeaders(connection, null),
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      });
    } catch (error) {
      throw new Error(`No se pudo renovar la sesion. Detalle: ${error.message || error}`);
    }

    const data = await assertOk(response, "No se pudo renovar la sesion.");
    const nextSession = {
      ...session,
      ...data,
      user: data.user || session.user,
      user_email: data.user?.email || session.user_email,
      refresh_token: data.refresh_token || session.refresh_token,
      expires_at: Date.now() + Number(data.expires_in || 3600) * 1000,
    };
    saveStoredAppSession(nextSession);
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
  if (!session?.access_token) throw new Error("No hay una sesion activa para consultar Supabase. Inicie sesion nuevamente.");
  if (!isSessionExpiring(session, windowMs)) return session;
  return refreshAppSession(connection, session);
}

export async function signInAppUser(connection, email, password) {
  const cleanEmail = cleanText(email);
  const cleanPassword = cleanText(password);
  if (!getSupabaseUrl(connection) || !getAnonKey(connection)) {
    throw new Error("Configure URL y anon key de Supabase para iniciar sesion.");
  }
  if (!cleanEmail || !cleanPassword) {
    throw new Error("Ingrese correo y contraseña para iniciar sesion.");
  }

  let response;
  try {
    response = await fetchWithTimeout(`${getSupabaseUrl(connection)}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: getHeaders(connection, null),
      body: JSON.stringify({ email: cleanEmail, password: cleanPassword }),
    });
  } catch (error) {
    throw new Error(`No se pudo contactar Supabase Auth. Detalle: ${error.message || error}`);
  }

  const data = await assertOk(response, "No se pudo iniciar sesion.");
  const session = {
    ...data,
    user_email: data.user?.email || cleanEmail,
    expires_at: Date.now() + Number(data.expires_in || 3600) * 1000,
  };
  return saveStoredAppSession(session);
}

export async function requestPasswordRecovery(connection, email) {
  const cleanEmail = cleanText(email);
  if (!getSupabaseUrl(connection) || !getAnonKey(connection)) {
    throw new Error("Configure URL y anon key de Supabase para recuperar la contraseña.");
  }
  if (!cleanEmail) {
    throw new Error("Ingrese el correo del usuario para recuperar la contraseña.");
  }

  let response;
  try {
    response = await fetchWithTimeout(`${getSupabaseUrl(connection)}/auth/v1/recover`, {
      method: "POST",
      headers: getHeaders(connection, null),
      body: JSON.stringify({
        email: cleanEmail,
        options: {
          redirectTo: getAuthRedirectUrl(connection),
        },
      }),
    });
  } catch (error) {
    throw new Error(`No se pudo contactar Supabase Auth. Detalle: ${error.message || error}`);
  }

  await assertOk(response, "No se pudo enviar el correo de recuperacion.");
}

export async function updateRecoveredPassword(connection, recoverySession, password) {
  if (!recoverySession?.access_token) {
    throw new Error("No hay una sesion de recuperacion valida.");
  }
  const cleanPassword = cleanText(password);
  if (!cleanPassword) {
    throw new Error("Ingrese una nueva contraseña.");
  }

  let response;
  try {
    response = await fetchWithTimeout(`${getSupabaseUrl(connection)}/auth/v1/user`, {
      method: "PUT",
      headers: getHeaders(connection, recoverySession.access_token),
      body: JSON.stringify({ password: cleanPassword }),
    });
  } catch (error) {
    throw new Error(`No se pudo contactar Supabase Auth. Detalle: ${error.message || error}`);
  }

  return assertOk(response, "No se pudo actualizar la contraseña.");
}

export async function loadAuthUserFromSession(connection, session) {
  if (!session?.access_token) {
    throw new Error("No hay una sesion activa para consultar el usuario.");
  }
  const activeSession = await ensureFreshAppSession(connection, session);
  const response = await fetchWithTimeout(`${getSupabaseUrl(connection)}/auth/v1/user`, {
    headers: getHeaders(connection, activeSession.access_token),
  });
  return assertOk(response, "No se pudo consultar el usuario autenticado.");
}

function buildAppUserQuery(params) {
  const query = new URLSearchParams({
    select: "id,auth_user_id,nombre,email,rol,buyer_id,activo,compradores(comprador,division,correo)",
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

  const queries = [
    authUserId ? buildAppUserQuery({ auth_user_id: `eq.${authUserId}` }) : "",
    email ? buildAppUserQuery({ email: `eq.${email}` }) : "",
  ].filter(Boolean);

  for (const query of queries) {
    const response = await fetchWithTimeout(`${getSupabaseUrl(connection)}${query}`, { headers });
    const data = await assertOk(response, "No se pudo consultar el perfil de permisos.");
    const profile = Array.isArray(data) ? data[0] : null;
    if (profile?.activo !== false) return profile;
  }

  throw new Error("El usuario inicio sesion, pero no esta activo en public.usuarios_app.");
}

export function signOutAppUser() {
  window.sessionStorage.removeItem(APP_SESSION_STORAGE_KEY);
}
