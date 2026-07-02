import {
  APP_SESSION_STORAGE_KEY,
  DEFAULT_SUPABASE_URL,
  STORAGE_KEY,
  assertOk,
  cleanText,
  fetchWithTimeout,
  getAnonKey,
  getHeaders,
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

export function loadStoredAppSession() {
  try {
    const raw = window.sessionStorage.getItem(APP_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session?.access_token || !session?.expires_at) return null;
    if (Date.now() > Number(session.expires_at) - 60000) return null;
    return session;
  } catch {
    return null;
  }
}

export async function signInAppUser(connection, email, password) {
  const cleanEmail = cleanText(email);
  const cleanPassword = cleanText(password);
  if (!getSupabaseUrl(connection) || !getAnonKey(connection)) {
    throw new Error("Configure URL y anon key de Supabase para iniciar sesion.");
  }
  if (!cleanEmail || !cleanPassword) {
    throw new Error("Ingrese correo y password para iniciar sesion.");
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
  window.sessionStorage.setItem(APP_SESSION_STORAGE_KEY, JSON.stringify(session));
  return session;
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

  const authUserId = session.user?.id || session.user_id || "";
  const email = cleanText(session.user?.email || session.user_email);
  const headers = getHeaders(connection, session.access_token);

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
