const DEFAULT_SUPABASE_URL = "https://hanvbbezofcengyorooc.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_DBBFpGllQwN98skP71n-Dg_kXzmEMgS";
const STORAGE_KEY = "sinsaPromo.supabaseConnection";
const SESSION_STORAGE_KEY = "sinsaPromo.supabaseSession";
const APP_SESSION_STORAGE_KEY = "sinsaPromo.appSession";
const REQUEST_TIMEOUT_MS = 45000;
const SELECT_PAGE_SIZE = 1000;

let currentSession = null;

function getEnvValue(key) {
  return import.meta.env?.[key] || "";
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function emptyToNull(value) {
  const text = cleanText(value);
  return text ? value : null;
}

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  const text = cleanText(value).toUpperCase();
  return ["TRUE", "SI", "SÍ", "1", "ACTIVO", "ACTIVA"].includes(text);
}

function toNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isNaN(value) ? null : value;
  const clean = String(value).replace("%", "").replace(",", ".").trim();
  const number = Number(clean);
  return Number.isNaN(number) ? null : number;
}

function normalizeTimestamp(value) {
  const text = cleanText(value);
  if (!text) return null;
  const normalized = text
    .replace(/\ba\.\s*m\./gi, "AM")
    .replace(/\bp\.\s*m\./gi, "PM");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeDate(value) {
  const timestamp = normalizeTimestamp(value);
  return timestamp ? timestamp.slice(0, 10) : null;
}

function getSupabaseUrl(connection = {}) {
  return cleanText(connection.url || connection.supabaseUrl || getEnvValue("VITE_SUPABASE_URL") || DEFAULT_SUPABASE_URL).replace(/\/$/, "");
}

function getAnonKey(connection = {}) {
  return cleanText(connection.anonKey || connection.supabaseAnonKey || getEnvValue("VITE_SUPABASE_ANON_KEY") || DEFAULT_SUPABASE_ANON_KEY);
}

function getTechEmail(connection = {}) {
  return cleanText(connection.techEmail || getEnvValue("VITE_SUPABASE_TECH_EMAIL"));
}

function getTechPassword(connection = {}) {
  return cleanText(connection.techPassword || getEnvValue("VITE_SUPABASE_TECH_PASSWORD"));
}

function getHeaders(connection, token, extra = {}) {
  const anonKey = getAnonKey(connection);
  return {
    apikey: anonKey,
    Authorization: `Bearer ${token || anonKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function fetchWithTimeout(url, options = {}) {
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

async function assertOk(response, fallbackMessage) {
  const data = await readJsonResponse(response);
  if (!response.ok) {
    const detail = typeof data === "string" ? data : data?.message || data?.msg || data?.error_description || data?.error;
    const code = typeof data === "object" && data?.code ? ` [${data.code}]` : "";
    const message = detail ? `${fallbackMessage}: ${detail}${code}` : `${fallbackMessage} (HTTP ${response.status})`;
    throw new Error(message);
  }
  return data;
}

export const SUPABASE_PROJECT_URL = DEFAULT_SUPABASE_URL;

export function getDefaultSupabaseConnection() {
  return {
    url: getSupabaseUrl(),
    anonKey: getAnonKey(),
    techEmail: getTechEmail(),
    techPassword: getTechPassword(),
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
    techEmail: getTechEmail(connection),
    techPassword: getTechPassword(connection),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextConnection));
  window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  currentSession = null;
  return nextConnection;
}

export function hasSupabaseConnection(connection) {
  return Boolean(getSupabaseUrl(connection) && getAnonKey(connection) && getTechEmail(connection) && getTechPassword(connection));
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

export function signOutAppUser() {
  window.sessionStorage.removeItem(APP_SESSION_STORAGE_KEY);
}

function readStoredSession() {
  if (currentSession?.access_token) return currentSession;
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session?.access_token || !session?.expires_at) return null;
    if (Date.now() > Number(session.expires_at) - 60000) return null;
    currentSession = session;
    return session;
  } catch {
    return null;
  }
}

async function signInTechnicalUser(connection) {
  if (!hasSupabaseConnection(connection)) {
    throw new Error("Configure URL, anon key, correo y password del usuario tecnico de Supabase.");
  }

  const storedSession = readStoredSession();
  if (storedSession?.access_token) return storedSession;

  let response;
  try {
    response = await fetchWithTimeout(`${getSupabaseUrl(connection)}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: getHeaders(connection, null),
      body: JSON.stringify({
        email: getTechEmail(connection),
        password: getTechPassword(connection),
      }),
    });
  } catch (error) {
    throw new Error(`No se pudo contactar Supabase Auth. Revise internet, URL del proyecto y CORS. Detalle: ${error.message || error}`);
  }

  const data = await assertOk(response, "No se pudo iniciar sesion con el usuario tecnico de Supabase.");
  const session = {
    ...data,
    expires_at: Date.now() + Number(data.expires_in || 3600) * 1000,
  };
  currentSession = session;
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  return session;
}

async function supabaseRequest(connection, path, options = {}) {
  const session = await signInTechnicalUser(connection);
  const response = await fetchWithTimeout(`${getSupabaseUrl(connection)}${path}`, {
    ...options,
    headers: getHeaders(connection, session.access_token, options.headers || {}),
  });
  return assertOk(response, "No se pudo completar la operacion en Supabase.");
}

function buildQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, value);
  });
  const text = query.toString();
  return text ? `?${text}` : "";
}

async function selectAll(connection, table, params = {}) {
  const queryParams = { select: "*", ...params };
  if (queryParams.limit) {
    return supabaseRequest(connection, `/rest/v1/${table}${buildQuery(queryParams)}`);
  }

  const results = [];
  for (let offset = 0; ; offset += SELECT_PAGE_SIZE) {
    const page = await supabaseRequest(connection, `/rest/v1/${table}${buildQuery(queryParams)}`, {
      headers: { Range: `${offset}-${offset + SELECT_PAGE_SIZE - 1}` },
    });
    if (!Array.isArray(page)) return page;
    results.push(...page);
    if (page.length < SELECT_PAGE_SIZE) break;
  }
  return results;
}

async function upsertRows(connection, table, rows, onConflict) {
  const dataRows = (rows || []).filter(Boolean);
  if (!dataRows.length) return [];

  const results = [];
  for (let index = 0; index < dataRows.length; index += 500) {
    const chunk = dataRows.slice(index, index + 500);
    const query = onConflict ? buildQuery({ on_conflict: onConflict }) : "";
    const result = await supabaseRequest(connection, `/rest/v1/${table}${query}`, {
      method: "POST",
      headers: { Prefer: `return=representation${onConflict ? ",resolution=merge-duplicates" : ""}` },
      body: JSON.stringify(chunk),
    });
    if (Array.isArray(result)) results.push(...result);
  }
  return results;
}

function toPostgrestIn(values = []) {
  const uniqueValues = Array.from(new Set(values.map(cleanText).filter(Boolean)));
  if (!uniqueValues.length) return "";
  return `in.(${uniqueValues.map((value) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")})`;
}

async function selectRowsByValues(connection, table, field, values, select = "*") {
  const uniqueValues = Array.from(new Set(values.map(cleanText).filter(Boolean)));
  const results = [];
  for (let index = 0; index < uniqueValues.length; index += 400) {
    const chunk = uniqueValues.slice(index, index + 400);
    const filter = toPostgrestIn(chunk);
    if (!filter) continue;
    const rows = await selectAll(connection, table, { select, [field]: filter });
    if (Array.isArray(rows)) results.push(...rows);
  }
  return results;
}

async function deleteRowsByValues(connection, table, field, values) {
  const uniqueValues = Array.from(new Set(values.map(cleanText).filter(Boolean)));
  for (let index = 0; index < uniqueValues.length; index += 400) {
    const chunk = uniqueValues.slice(index, index + 400);
    const filter = toPostgrestIn(chunk);
    if (!filter) continue;
    await supabaseRequest(connection, `/rest/v1/${table}${buildQuery({ [field]: filter })}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
  }
}

async function deletePromotionsByLegacyIds(connection, legacyIds = []) {
  const promotions = await selectRowsByValues(connection, "promociones", "legacy_row_id", legacyIds, "id,legacy_row_id");
  const promotionIds = promotions.map((item) => item.id).filter(Boolean);
  if (promotionIds.length) {
    await deleteRowsByValues(connection, "comentarios", "promocion_id", promotionIds);
    await deleteRowsByValues(connection, "promociones_detalle", "promocion_id", promotionIds);
    await deleteRowsByValues(connection, "promociones", "id", promotionIds);
  }
}

async function patchRowById(connection, table, id, row) {
  const query = buildQuery({ id: `eq.${id}` });
  const result = await supabaseRequest(connection, `/rest/v1/${table}${query}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  return Array.isArray(result) ? result[0] : result;
}

function keyBy(rows, key) {
  return (rows || []).reduce((acc, row) => {
    if (row?.[key]) acc[String(row[key])] = row;
    return acc;
  }, {});
}

function buildCatalogosFromCampanas(campanas = []) {
  return campanas
    .filter((item) => item.tipo_actividad === "CATALOGO")
    .map((item) => ({
      catalogo_id: item.legacy_actividad_id,
      id: item.legacy_actividad_id,
      nombre: item.nombre_actividad,
      canal: item.canal,
      vigencia_inicio: item.fecha_inicio || "",
      vigencia_fin: item.fecha_fin || "",
      estado: item.estado,
      color: item.color,
      doc_id: item.doc_id,
      token_conexion: item.token_conexion,
      notificaciones: item.notificaciones,
      correos: item.correos,
      divisiones: item.divisiones || "",
    }));
}

function toActividad(row, compradorById = {}) {
  const solicitante = row.comprador || compradorById[row.solicitante_buyer_id]?.comprador || "";
  return {
    actividad_id: row.legacy_actividad_id,
    nombre_actividad: row.nombre_actividad,
    tipo_actividad: row.tipo_actividad,
    canal: row.canal,
    fecha_inicio: row.fecha_inicio || "",
    fecha_fin: row.fecha_fin || "",
    comprador: row.comprador || solicitante,
    solicitante,
    estado: row.estado,
    fecha_creacion: row.created_at,
    motivo_solicitud: row.motivo_solicitud,
    fecha_modificacion: row.updated_at,
    responsable: row.responsable,
    recursos_ocupados: row.recursos_ocupados,
    fecha_estado: row.fecha_estado || "",
    fecha_nuevo: row.fecha_nuevo || "",
    fecha_aprovado: row.fecha_aprovado || "",
    fecha_entrabajo: row.fecha_entrabajo || "",
    fecha_finalizado: row.fecha_finalizado || "",
    fecha_asignado: row.fecha_asignado || "",
    fecha_trabajando: row.fecha_trabajando || "",
    fecha_resuelto: row.fecha_resuelto || "",
    tiempo_nuevo_horas: row.tiempo_nuevo_horas,
    tiempo_aprovado_horas: row.tiempo_aprovado_horas,
    tiempo_entrabajo_horas: row.tiempo_entrabajo_horas,
    tiempo_finalizado_horas: row.tiempo_finalizado_horas,
    tiempo_asignado_horas: row.tiempo_asignado_horas,
    tiempo_trabajando_horas: row.tiempo_trabajando_horas,
    tiempo_resuelto_horas: row.tiempo_resuelto_horas,
    tiempo_total_horas: row.tiempo_total_horas,
    promo_ids: row.promo_ids,
    oferta_ids: row.oferta_ids,
  };
}

function toPromotionRow(row, campanaById = {}, compradorById = {}) {
  const campana = campanaById[row.campana_id] || {};
  const comprador = compradorById[row.buyer_id] || {};
  return {
    row_id: row.legacy_row_id,
    actividad_id: campana.legacy_actividad_id || "",
    oferta_id: row.oferta_id,
    comprador: comprador.comprador || "",
    division: comprador.division || "",
    dep_id: row.dep_id || "",
    tipo_promo: row.tipo_promo,
    grupo_oferta: row.grupo_oferta,
    tipo_sku: row.tipo_sku,
    variante: row.variante,
    sku: row.sku,
    num_parte: row.num_parte,
    descripcion: row.descripcion,
    tipo_cantidad: row.tipo_cantidad,
    cantidad_minima: row.cantidad_minima,
    precio_antes: row.precio_antes,
    precio_ahora: row.precio_ahora,
    descuento: row.descuento,
    comentario_comprador: row.comentario_comprador,
    aplica_segmento: row.aplica_segmento,
    segmento_cliente: row.segmento_cliente,
    segmento: row.aplica_segmento === "SI" ? row.segmento_cliente : "Todos",
    alcance_tipo: row.alcance_tipo,
    alcance_valor: row.alcance_valor,
    estado_registro: row.estado_registro,
    fecha_creacion: row.created_at,
    fecha_modificacion: row.updated_at,
    ultima_modificacion_por: row.ultima_modificacion_por,
  };
}

function toDbComprador(row) {
  return {
    comprador_id: emptyToNull(row.comprador_id),
    categoria_comprador: cleanText(row.categoria_comprador) || "Senior",
    comprador: cleanText(row.comprador || row.nombre),
    division: cleanText(row.division),
    correo: cleanText(row.correo),
    senior_id: cleanText(row.senior_id),
    activo: row.activo === undefined || row.activo === "" ? true : toBoolean(row.activo),
  };
}

function toDbCampana(row, catalogosById = {}, compradorByName = {}) {
  const actividadId = cleanText(row.actividad_id || row.catalogo_id);
  const catalogo = catalogosById[actividadId] || {};
  const solicitante = cleanText(row.solicitante || row.comprador);
  return {
    legacy_actividad_id: actividadId,
    tipo_actividad: cleanText(row.tipo_actividad) || "CATALOGO",
    nombre_actividad: cleanText(row.nombre_actividad || row.nombre),
    canal: cleanText(row.canal || catalogo.canal),
    fecha_inicio: normalizeDate(row.fecha_inicio || catalogo.vigencia_inicio),
    fecha_fin: normalizeDate(row.fecha_fin || catalogo.vigencia_fin),
    solicitante_buyer_id: compradorByName[solicitante]?.id || null,
    estado: cleanText(row.estado) || "Borrador",
    motivo_solicitud: cleanText(row.motivo_solicitud),
    color: cleanText(catalogo.color) || "bg-emerald-700",
    doc_id: cleanText(catalogo.doc_id),
    token_conexion: cleanText(catalogo.token_conexion),
    notificaciones: toBoolean(catalogo.notificaciones),
    correos: cleanText(catalogo.correos),
    comprador: solicitante,
    responsable: cleanText(row.responsable),
    recursos_ocupados: cleanText(row.recursos_ocupados),
    fecha_estado: normalizeTimestamp(row.fecha_estado),
    fecha_nuevo: normalizeTimestamp(row.fecha_nuevo),
    fecha_aprovado: normalizeTimestamp(row.fecha_aprovado),
    fecha_entrabajo: normalizeTimestamp(row.fecha_entrabajo),
    fecha_finalizado: normalizeTimestamp(row.fecha_finalizado),
    fecha_asignado: normalizeTimestamp(row.fecha_asignado),
    fecha_trabajando: normalizeTimestamp(row.fecha_trabajando),
    fecha_resuelto: normalizeTimestamp(row.fecha_resuelto),
    tiempo_nuevo_horas: toNumber(row.tiempo_nuevo_horas) || 0,
    tiempo_aprovado_horas: toNumber(row.tiempo_aprovado_horas) || 0,
    tiempo_entrabajo_horas: toNumber(row.tiempo_entrabajo_horas) || 0,
    tiempo_finalizado_horas: toNumber(row.tiempo_finalizado_horas) || 0,
    tiempo_asignado_horas: toNumber(row.tiempo_asignado_horas) || 0,
    tiempo_trabajando_horas: toNumber(row.tiempo_trabajando_horas) || 0,
    tiempo_resuelto_horas: toNumber(row.tiempo_resuelto_horas) || 0,
    tiempo_total_horas: toNumber(row.tiempo_total_horas) || 0,
    promo_ids: cleanText(row.promo_ids),
    oferta_ids: cleanText(row.oferta_ids),
    divisiones: cleanText(catalogo.divisiones),
  };
}

function toDbPromocion(row, campanaByLegacy = {}, compradorByName = {}) {
  return {
    legacy_row_id: cleanText(row.row_id),
    campana_id: campanaByLegacy[cleanText(row.actividad_id)]?.id,
    oferta_id: cleanText(row.oferta_id),
    buyer_id: compradorByName[cleanText(row.comprador)]?.id,
    tipo_promo: cleanText(row.tipo_promo),
    grupo_oferta: cleanText(row.grupo_oferta),
    tipo_sku: cleanText(row.tipo_sku) || "simple",
    variante: cleanText(row.variante),
    sku: cleanText(row.sku),
    num_parte: cleanText(row.num_parte),
    descripcion: cleanText(row.descripcion),
    tipo_cantidad: cleanText(row.tipo_cantidad) || "Exacta",
    cantidad_minima: toNumber(row.cantidad_minima) || 1,
    precio_antes: toNumber(row.precio_antes),
    precio_ahora: toNumber(row.precio_ahora),
    descuento: cleanText(row.descuento),
    comentario_comprador: cleanText(row.comentario_comprador),
    aplica_segmento: cleanText(row.aplica_segmento).toUpperCase() === "SI" ? "SI" : "NO",
    segmento_cliente: cleanText(row.segmento_cliente),
    alcance_tipo: cleanText(row.alcance_tipo),
    alcance_valor: cleanText(row.alcance_valor),
    estado_registro: cleanText(row.estado_registro) || "BORRADOR",
    dep_id: cleanText(row.dep_id),
    ultima_modificacion_por: cleanText(row.ultima_modificacion_por),
  };
}

export async function pingSupabaseConnection(connection) {
  await signInTechnicalUser(connection);
  const role = await supabaseRequest(connection, "/rest/v1/rpc/current_user_role", { method: "POST", body: "{}" });
  const currentRole = Array.isArray(role) ? role[0] : role;
  if (!currentRole) {
    throw new Error("El usuario tecnico inicio sesion, pero no tiene registro activo en public.usuarios_app.");
  }
  if (currentRole !== "ADMIN") {
    throw new Error(`El usuario tecnico inicio sesion, pero tiene rol ${currentRole}. Para este MVP debe ser ADMIN.`);
  }
  return { role: currentRole };
}

export async function loadCatalogFromSupabase(connection) {
  const [
    compradores,
    campanas,
    segmentos,
    responsables,
    jerarquias,
    avances,
    promociones,
    detalles,
    comentarios,
    notificaciones,
    config,
  ] = await Promise.all([
    selectAll(connection, "compradores", { order: "comprador.asc" }),
    selectAll(connection, "campanas", { order: "created_at.asc" }),
    selectAll(connection, "segmentos_clientes", { order: "orden.asc" }),
    selectAll(connection, "responsables_solicitudes", { order: "nombre.asc" }),
    selectAll(connection, "jerarquia_categorias", { order: "dep_id.asc" }),
    selectAll(connection, "avances_catalogo", { order: "fecha_estado.asc" }),
    selectAll(connection, "promociones", { order: "created_at.asc" }),
    selectAll(connection, "promociones_detalle", { order: "created_at.asc" }),
    selectAll(connection, "comentarios", { order: "fecha.asc" }),
    selectAll(connection, "notificaciones", { order: "created_at.asc" }),
    selectAll(connection, "configuracion"),
  ]);

  const compradorById = keyBy(compradores, "id");
  const campanaById = keyBy(campanas, "id");
  const promoById = keyBy(promociones, "id");

  return {
    config: config.map((item) => ({ clave: item.clave, valor: JSON.stringify(item.valor || {}), descripcion: item.descripcion })),
    catalogos: buildCatalogosFromCampanas(campanas),
    actividades: campanas.map((item) => toActividad(item, compradorById)),
    segmentos_clientes: segmentos.map((item) => ({
      segmento_id: item.legacy_segmento_id,
      nombre_segmento: item.nombre_segmento,
      canal: item.canal,
      activo: item.activo,
      orden: item.orden,
    })),
    compradores,
    responsables_solicitudes: responsables,
    jerarquia_categorias: jerarquias,
    avances_catalogo: avances.map((item) => ({
      avance_id: item.avance_id,
      catalogo_id: item.catalogo_id,
      catalogo: item.catalogo,
      comprador_id: item.comprador_id,
      comprador: item.comprador,
      division: item.division,
      estado: item.estado,
      fecha_estado: item.fecha_estado,
      usuario: item.usuario,
    })),
    promociones: promociones.map((item) => toPromotionRow(item, campanaById, compradorById)),
    promociones_detalle: detalles.map((item) => {
      const promo = promoById[item.promocion_id] || {};
      const campana = campanaById[promo.campana_id] || {};
      return {
        detalle_id: item.id,
        row_id: promo.legacy_row_id || "",
        actividad_id: campana.legacy_actividad_id || "",
        oferta_id: promo.oferta_id || "",
        grupo_oferta: promo.grupo_oferta || "",
        tipo_promo: promo.tipo_promo || "",
        campo: item.campo,
        valor: item.valor,
      };
    }),
    comentarios: comentarios.map((item) => {
      const promo = promoById[item.promocion_id] || {};
      const campana = campanaById[item.campana_id || promo.campana_id] || {};
      return {
        comentario_id: item.legacy_comentario_id || item.id,
        actividad_id: campana.legacy_actividad_id || "",
        row_id: item.alcance_comentario === "ACTIVIDAD" ? "" : item.legacy_row_id || promo.legacy_row_id || "",
        alcance_comentario: item.alcance_comentario,
        prioridad: item.prioridad,
        usuario: item.usuario,
        tipo_usuario: item.tipo_usuario,
        comentario: item.comentario,
        estado: item.estado,
        fecha: item.fecha,
        resuelto_por: item.resuelto_por || "",
        fecha_resolucion: item.fecha_resolucion || "",
      };
    }),
    logs: [],
    notificaciones: notificaciones.map((item) => ({
      actividad_id: campanaById[item.campana_id]?.legacy_actividad_id || "",
      correo: item.correo,
      activo: item.activo,
    })),
  };
}

export async function loadLogsFromSupabase(connection, options = {}) {
  const pageSize = Math.max(10, Math.min(100, Number(options.pageSize || 25)));
  const page = Math.max(1, Number(options.page || 1));
  const offset = (page - 1) * pageSize;
  const logs = await selectAll(connection, "logs", {
    select: "id,created_at,usuario,campana_id,promocion_id,accion,campo,valor_anterior,valor_nuevo,request_id,fecha_cierre",
    order: "created_at.desc",
    limit: pageSize + 1,
    offset,
  });
  const pageRows = Array.isArray(logs) ? logs.slice(0, pageSize) : [];
  const hasNextPage = Array.isArray(logs) && logs.length > pageSize;
  const promotionIds = pageRows.map((item) => item.promocion_id).filter(Boolean);
  const promociones = promotionIds.length
    ? await selectRowsByValues(connection, "promociones", "id", promotionIds, "id,legacy_row_id,campana_id")
    : [];
  const promoById = keyBy(promociones, "id");
  const campanaIds = Array.from(new Set([
    ...pageRows.map((item) => item.campana_id).filter(Boolean),
    ...promociones.map((item) => item.campana_id).filter(Boolean),
  ]));
  const campanas = campanaIds.length
    ? await selectRowsByValues(connection, "campanas", "id", campanaIds, "id,legacy_actividad_id")
    : [];
  const campanaById = keyBy(campanas, "id");

  return {
    page,
    page_size: pageSize,
    has_next_page: hasNextPage,
    logs: pageRows.map((item) => {
      const promo = promoById[item.promocion_id] || {};
      const campana = campanaById[item.campana_id || promo.campana_id] || {};
      return {
        log_id: item.request_id || item.id,
        fecha: item.created_at,
        usuario: item.usuario,
        catalogo: campana.legacy_actividad_id || "",
        accion: item.accion,
        row_id: promo.legacy_row_id || "",
        campo: item.campo,
        valor_anterior: item.valor_anterior,
        valor_nuevo: item.valor_nuevo,
        fecha_cierre: item.fecha_cierre || "",
      };
    }),
  };
}

export async function saveCatalogToSupabase(connection, data = {}) {
  const returnMode = cleanText(data.sync_options?.return_mode || data.sync_options?.returnMode).toLowerCase();
  const promotionSyncOptions = data.sync_options?.promociones || data.sync_options?.promotions || null;
  const usePromotionDiff = Boolean(promotionSyncOptions);
  const changedPromotionIds = new Set((promotionSyncOptions?.changed_row_ids || promotionSyncOptions?.changedRowIds || []).map(cleanText).filter(Boolean));
  const deletedPromotionIds = (promotionSyncOptions?.deleted_row_ids || promotionSyncOptions?.deletedRowIds || []).map(cleanText).filter(Boolean);
  const buyerSyncOptions = data.sync_options?.compradores || data.sync_options?.buyers || null;
  const useBuyerDiff = Boolean(buyerSyncOptions);
  const changedBuyerIds = new Set((buyerSyncOptions?.changed_ids || buyerSyncOptions?.changedIds || []).map(cleanText).filter(Boolean));
  const activitySyncOptions = data.sync_options?.actividades || data.sync_options?.activities || null;
  const useActivityDiff = Boolean(activitySyncOptions);
  const changedActivityIds = new Set((activitySyncOptions?.changed_ids || activitySyncOptions?.changedIds || []).map(cleanText).filter(Boolean));
  const commentSyncOptions = data.sync_options?.comentarios || data.sync_options?.comments || null;
  const useCommentDiff = Boolean(commentSyncOptions);
  const changedCommentIds = new Set((commentSyncOptions?.changed_ids || commentSyncOptions?.changedIds || []).map(cleanText).filter(Boolean));
  const logSyncOptions = data.sync_options?.logs || null;
  const useLogDiff = Boolean(logSyncOptions);
  const changedLogIds = new Set((logSyncOptions?.changed_ids || logSyncOptions?.changedIds || []).map(cleanText).filter(Boolean));
  const avanceSyncOptions = data.sync_options?.avances_catalogo || data.sync_options?.avancesCatalogo || null;
  const useAvanceDiff = Boolean(avanceSyncOptions);
  const changedAvanceIds = new Set((avanceSyncOptions?.changed_ids || avanceSyncOptions?.changedIds || []).map(cleanText).filter(Boolean));
  const responsableSyncOptions = data.sync_options?.responsables_solicitudes || data.sync_options?.responsablesSolicitudes || null;
  const useResponsableDiff = Boolean(responsableSyncOptions);
  const changedResponsableIds = new Set((responsableSyncOptions?.changed_ids || responsableSyncOptions?.changedIds || []).map(cleanText).filter(Boolean));
  const jerarquiaSyncOptions = data.sync_options?.jerarquia_categorias || data.sync_options?.jerarquiaCategorias || null;
  const useJerarquiaDiff = Boolean(jerarquiaSyncOptions);
  const changedJerarquiaIds = new Set((jerarquiaSyncOptions?.changed_ids || jerarquiaSyncOptions?.changedIds || []).map(cleanText).filter(Boolean));
  const segmentoSyncOptions = data.sync_options?.segmentos_clientes || data.sync_options?.segmentosClientes || null;
  const useSegmentoDiff = Boolean(segmentoSyncOptions);
  const changedSegmentoIds = new Set((segmentoSyncOptions?.changed_ids || segmentoSyncOptions?.changedIds || []).map(cleanText).filter(Boolean));
  const notificacionSyncOptions = data.sync_options?.notificaciones || data.sync_options?.notifications || null;
  const useNotificacionDiff = Boolean(notificacionSyncOptions);
  const changedNotificacionIds = new Set((notificacionSyncOptions?.changed_ids || notificacionSyncOptions?.changedIds || []).map(cleanText).filter(Boolean));

  const allBuyerRows = (data.compradores || []).map(toDbComprador).filter((item) => item.comprador);
  const buyerRowsToUpsert = useBuyerDiff
    ? allBuyerRows.filter((item) => changedBuyerIds.has(item.comprador))
    : allBuyerRows;
  const upsertedBuyers = await upsertRows(connection, "compradores", buyerRowsToUpsert, "comprador");
  const compradores = useBuyerDiff
    ? await selectRowsByValues(connection, "compradores", "comprador", allBuyerRows.map((item) => item.comprador), "*")
    : upsertedBuyers;
  const compradorByName = keyBy(compradores, "comprador");
  const catalogosById = keyBy(data.catalogos || [], "catalogo_id");
  const allCampanaRows = (data.actividades || [])
    .map((item) => toDbCampana(item, catalogosById, compradorByName))
    .filter((item) => item.legacy_actividad_id);
  const campanaRowsToUpsert = useActivityDiff
    ? allCampanaRows.filter((item) => changedActivityIds.has(item.legacy_actividad_id))
    : allCampanaRows;
  const upsertedCampanas = await upsertRows(connection, "campanas", campanaRowsToUpsert, "legacy_actividad_id");
  const campanas = useActivityDiff
    ? await selectRowsByValues(connection, "campanas", "legacy_actividad_id", allCampanaRows.map((item) => item.legacy_actividad_id), "*")
    : upsertedCampanas;
  const campanaByLegacy = keyBy(campanas, "legacy_actividad_id");

  const responsableRows = useResponsableDiff
    ? (data.responsables_solicitudes || []).filter((item) => changedResponsableIds.has(cleanText(item.responsable_id || item.responsableId || item.id)))
    : data.responsables_solicitudes || [];
  await upsertRows(connection, "responsables_solicitudes", responsableRows, "responsable_id");

  const jerarquiaRows = useJerarquiaDiff
    ? (data.jerarquia_categorias || []).filter((item) => changedJerarquiaIds.has(cleanText(item.dep_id || item.depId)))
    : data.jerarquia_categorias || [];
  await upsertRows(connection, "jerarquia_categorias", jerarquiaRows, "dep_id");

  const segmentoRows = useSegmentoDiff
    ? (data.segmentos_clientes || []).filter((item) => changedSegmentoIds.has(cleanText(item.segmento_id || item.segmentoId || item.id)))
    : data.segmentos_clientes || [];
  await upsertRows(connection, "segmentos_clientes", segmentoRows.map((item) => ({
    legacy_segmento_id: cleanText(item.segmento_id),
    canal: cleanText(item.canal),
    nombre_segmento: cleanText(item.nombre_segmento),
    activo: item.activo === undefined || item.activo === "" ? true : toBoolean(item.activo),
    orden: toNumber(item.orden),
  })), "legacy_segmento_id");

  if (usePromotionDiff && deletedPromotionIds.length) {
    await deletePromotionsByLegacyIds(connection, deletedPromotionIds);
  }

  const allPromotionRows = (data.promociones || [])
    .map((item) => toDbPromocion(item, campanaByLegacy, compradorByName))
    .filter((item) => item.campana_id && item.buyer_id && item.sku);
  const promotionRowsToUpsert = usePromotionDiff
    ? allPromotionRows.filter((item) => changedPromotionIds.has(item.legacy_row_id))
    : allPromotionRows;
  const upsertedPromotions = await upsertRows(connection, "promociones", promotionRowsToUpsert, "legacy_row_id");
  const detalleSourceRows = usePromotionDiff
    ? (data.promociones_detalle || []).filter((item) => changedPromotionIds.has(cleanText(item.row_id || item.rowId)))
    : data.promociones_detalle || [];
  const comentarioSourceRows = useCommentDiff
    ? (data.comentarios || []).filter((item) => changedCommentIds.has(cleanText(item.comentario_id || item.comentarioId || item.id)))
    : data.comentarios || [];
  const logSourceRows = useLogDiff
    ? (data.logs || []).filter((item) => changedLogIds.has(cleanText(item.log_id || item.logId || item.id)))
    : data.logs || [];
  const currentPromotionIds = usePromotionDiff
    ? Array.from(new Set([
      ...promotionRowsToUpsert.map((item) => item.legacy_row_id),
      ...detalleSourceRows.map((item) => cleanText(item.row_id || item.rowId)),
      ...comentarioSourceRows.map((item) => cleanText(item.row_id || item.rowId)),
      ...logSourceRows.map((item) => cleanText(item.row_id || item.rowId)),
    ].filter(Boolean)))
    : allPromotionRows.map((item) => item.legacy_row_id).filter(Boolean);
  const promociones = usePromotionDiff
    ? await selectRowsByValues(connection, "promociones", "legacy_row_id", currentPromotionIds, "id,legacy_row_id,campana_id")
    : upsertedPromotions;
  const promoByLegacy = keyBy(promociones, "legacy_row_id");

  if (usePromotionDiff && changedPromotionIds.size) {
    const changedPromotionDbIds = promociones
      .filter((item) => changedPromotionIds.has(item.legacy_row_id))
      .map((item) => item.id)
      .filter(Boolean);
    await deleteRowsByValues(connection, "promociones_detalle", "promocion_id", changedPromotionDbIds);
  }

  await upsertRows(connection, "promociones_detalle", detalleSourceRows.map((item) => ({
    promocion_id: promoByLegacy[cleanText(item.row_id)]?.id,
    campo: cleanText(item.campo),
    valor: cleanText(item.valor),
  })).filter((item) => item.promocion_id && item.campo), "promocion_id,campo");

  const comentarioRows = comentarioSourceRows.map((item) => {
    const alcance = cleanText(item.alcance_comentario) || (item.row_id ? "LINEA" : "ACTIVIDAD");
    const promo = promoByLegacy[cleanText(item.row_id)];
    const campana = campanaByLegacy[cleanText(item.actividad_id)] || (promo ? { id: promo.campana_id } : null);
    return {
      legacy_comentario_id: cleanText(item.comentario_id),
      promocion_id: alcance === "LINEA" ? promo?.id : null,
      campana_id: campana?.id || null,
      legacy_row_id: alcance === "LINEA" ? cleanText(item.row_id) : "",
      alcance_comentario: alcance,
      prioridad: cleanText(item.prioridad) || "MEDIA",
      usuario: cleanText(item.usuario),
      tipo_usuario: cleanText(item.tipo_usuario),
      comentario: cleanText(item.comentario),
      estado: cleanText(item.estado).toUpperCase() || "ABIERTO",
      fecha: normalizeTimestamp(item.fecha) || new Date().toISOString(),
      fecha_resolucion: normalizeTimestamp(item.fecha_resolucion),
    };
  }).filter((item) => item.comentario && (item.promocion_id || item.campana_id));
  const existingComentarios = useCommentDiff
    ? await selectRowsByValues(connection, "comentarios", "legacy_comentario_id", comentarioRows.map((item) => item.legacy_comentario_id), "id,legacy_comentario_id")
    : await selectAll(connection, "comentarios", { select: "id,legacy_comentario_id" });
  const comentarioIdByLegacy = keyBy(existingComentarios, "legacy_comentario_id");
  const newComentarios = [];
  for (const comentario of comentarioRows) {
    const existing = comentarioIdByLegacy[comentario.legacy_comentario_id];
    if (existing?.id) {
      await patchRowById(connection, "comentarios", existing.id, comentario);
    } else {
      newComentarios.push(comentario);
    }
  }
  await upsertRows(connection, "comentarios", newComentarios, null);

  const notificacionRows = useNotificacionDiff
    ? (data.notificaciones || []).filter((item) => {
      const key = cleanText(item.notificacion_id || item.notificacionId || `${item.actividad_id || item.catalogo_id || ""}__${item.correo || ""}`);
      return changedNotificacionIds.has(key);
    })
    : data.notificaciones || [];
  await upsertRows(connection, "notificaciones", notificacionRows.map((item) => {
    const campana = campanaByLegacy[cleanText(item.actividad_id || item.catalogo_id)];
    return {
      campana_id: campana?.id,
      correo: cleanText(item.correo),
      tipo: "CAMBIO_PROMOCION",
      activo: item.activo === undefined || item.activo === "" ? true : toBoolean(item.activo),
    };
  }).filter((item) => item.campana_id && item.correo), "campana_id,correo,tipo");

  const avanceRows = useAvanceDiff
    ? (data.avances_catalogo || []).filter((item) => changedAvanceIds.has(cleanText(item.avance_id || item.avanceId || item.id)))
    : data.avances_catalogo || [];
  await upsertRows(connection, "avances_catalogo", avanceRows.map((item) => ({
    avance_id: cleanText(item.avance_id),
    campana_id: campanaByLegacy[cleanText(item.catalogo_id)]?.id || null,
    catalogo_id: cleanText(item.catalogo_id),
    catalogo: cleanText(item.catalogo),
    comprador_id: cleanText(item.comprador_id),
    buyer_id: compradorByName[cleanText(item.comprador)]?.id || null,
    comprador: cleanText(item.comprador),
    division: cleanText(item.division),
    estado: cleanText(item.estado) || "Pendiente",
    fecha_estado: normalizeTimestamp(item.fecha_estado) || new Date().toISOString(),
    usuario: cleanText(item.usuario),
  })).filter((item) => item.avance_id), "avance_id");

  const existingLogs = useLogDiff
    ? await selectRowsByValues(connection, "logs", "request_id", logSourceRows.map((item) => item.log_id || item.logId || item.id), "request_id")
    : await selectAll(connection, "logs", { select: "request_id" });
  const existingRequestIds = new Set(existingLogs.map((item) => item.request_id).filter(Boolean));
  await upsertRows(connection, "logs", logSourceRows.filter((item) => !existingRequestIds.has(cleanText(item.log_id))).map((item) => {
    const promo = promoByLegacy[cleanText(item.row_id)];
    return {
      usuario: cleanText(item.usuario),
      entidad: "PROMOCIONES",
      campana_id: promo?.campana_id || campanaByLegacy[cleanText(item.catalogo)]?.id || null,
      promocion_id: promo?.id || null,
      accion: cleanText(item.accion),
      campo: cleanText(item.campo),
      valor_anterior: cleanText(item.valor_anterior),
      valor_nuevo: cleanText(item.valor_nuevo),
      request_id: cleanText(item.log_id),
      created_at: normalizeTimestamp(item.fecha) || new Date().toISOString(),
      fecha_cierre: normalizeTimestamp(item.fecha_cierre),
    };
  }).filter((item) => item.accion), null);

  if (returnMode === "delta") {
    return {
      sync_mode: "delta",
      saved_at: new Date().toISOString(),
      cambios: {
        promociones_actualizadas: promotionRowsToUpsert.length,
        promociones_eliminadas: deletedPromotionIds.length,
        comentarios_actualizados: comentarioRows.length,
        avances_actualizados: avanceRows.length,
        logs_nuevos: logSourceRows.length,
      },
    };
  }

  return loadCatalogFromSupabase(connection);
}

export function saveSettingsToSupabase(connection, data = {}) {
  return saveCatalogToSupabase(connection, data);
}
