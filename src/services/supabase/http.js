import {
  SELECT_PAGE_SIZE,
  assertOk,
  cleanText,
  fetchWithTimeout,
  getAnonKey,
  getHeaders,
  getSupabaseUrl,
} from "./config";
import { ensureFreshAppSession } from "./session";

async function getAuthenticatedSession(connection = {}) {
  const session = connection.session || connection.appSession || connection.authSession;
  if (!session?.access_token) {
    return { access_token: getAnonKey(connection) };
  }
  return ensureFreshAppSession(connection, session);
}

async function sendSupabaseRequest(connection, path, options = {}) {
  const session = await getAuthenticatedSession(connection);
  return fetchWithTimeout(`${getSupabaseUrl(connection)}${path}`, {
    ...options,
    headers: getHeaders(connection, session.access_token, options.headers || {}),
  });
}

export async function supabaseRequest(connection, path, options = {}) {
  const response = await sendSupabaseRequest(connection, path, options);
  return assertOk(response, "No se pudo completar la operacion en Supabase.");
}

export function buildQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, value);
  });
  const text = query.toString();
  return text ? `?${text}` : "";
}

// Ejecuta tareas con un maximo de peticiones simultaneas y conserva el orden.
export async function runWithConcurrency(tasks = [], limit = 4) {
  const results = new Array(tasks.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), tasks.length) }, async () => {
    while (next < tasks.length) {
      const index = next;
      next += 1;
      results[index] = await tasks[index]();
    }
  });
  await Promise.all(workers);
  return results;
}

function parseTotalFromContentRange(value) {
  const match = /\/(\d+)\s*$/.exec(String(value || ""));
  return match ? Number(match[1]) : null;
}

export async function selectAll(connection, table, params = {}, { signal, parallelPages = false } = {}) {
  const queryParams = { select: "*", ...params };
  if (queryParams.limit) {
    return supabaseRequest(connection, `/rest/v1/${table}${buildQuery(queryParams)}`, { signal });
  }
  const path = `/rest/v1/${table}${buildQuery(queryParams)}`;
  const pageRange = (offset) => `${offset}-${offset + SELECT_PAGE_SIZE - 1}`;

  // Con orden estable y conteo exacto, las paginas restantes se piden en paralelo.
  if (parallelPages && queryParams.order) {
    const response = await sendSupabaseRequest(connection, path, {
      signal,
      headers: { Range: pageRange(0), Prefer: "count=exact" },
    });
    const total = parseTotalFromContentRange(response.headers?.get?.("content-range"));
    const firstPage = await assertOk(response, "No se pudo completar la operacion en Supabase.");
    if (!Array.isArray(firstPage)) return firstPage;
    if (total !== null && firstPage.length < total && firstPage.length === SELECT_PAGE_SIZE) {
      const offsets = [];
      for (let offset = SELECT_PAGE_SIZE; offset < total; offset += SELECT_PAGE_SIZE) offsets.push(offset);
      const pages = await runWithConcurrency(offsets.map((offset) => () => supabaseRequest(connection, path, {
        signal,
        headers: { Range: pageRange(offset) },
      })), 4);
      return [firstPage, ...pages].flatMap((page) => (Array.isArray(page) ? page : []));
    }
    if (total === null && firstPage.length === SELECT_PAGE_SIZE) {
      // Sin conteo disponible: continuar en serie desde la segunda pagina.
      const results = [...firstPage];
      for (let offset = SELECT_PAGE_SIZE; ; offset += SELECT_PAGE_SIZE) {
        const page = await supabaseRequest(connection, path, { signal, headers: { Range: pageRange(offset) } });
        if (!Array.isArray(page)) break;
        results.push(...page);
        if (page.length < SELECT_PAGE_SIZE) break;
      }
      return results;
    }
    return firstPage;
  }

  const results = [];
  for (let offset = 0; ; offset += SELECT_PAGE_SIZE) {
    const page = await supabaseRequest(connection, path, {
      signal,
      headers: { Range: pageRange(offset) },
    });
    if (!Array.isArray(page)) return page;
    results.push(...page);
    if (page.length < SELECT_PAGE_SIZE) break;
  }
  return results;
}

export async function upsertRows(connection, table, rows, onConflict) {
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

export async function callRpc(connection, functionName, params = {}, { headers } = {}) {
  return supabaseRequest(connection, `/rest/v1/rpc/${functionName}`, {
    method: "POST",
    body: JSON.stringify(params),
    ...(headers ? { headers } : {}),
  });
}

export function toPostgrestIn(values = []) {
  const uniqueValues = Array.from(new Set(values.map(cleanText).filter(Boolean)));
  if (!uniqueValues.length) return "";
  return `in.(${uniqueValues.map((value) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")})`;
}

export async function selectRowsByValues(connection, table, field, values, select = "*", options = {}) {
  const uniqueValues = Array.from(new Set(values.map(cleanText).filter(Boolean)));
  const { order, extraParams = {}, concurrency = 1 } = options || {};
  const tasks = [];
  for (let index = 0; index < uniqueValues.length; index += 400) {
    const chunk = uniqueValues.slice(index, index + 400);
    const filter = toPostgrestIn(chunk);
    if (!filter) continue;
    tasks.push(() => selectAll(
      connection,
      table,
      { select, ...extraParams, [field]: filter, ...(order ? { order } : {}) },
      { parallelPages: Boolean(order) && concurrency > 1 },
    ));
  }
  const pages = await runWithConcurrency(tasks, concurrency);
  return pages.flatMap((rows) => (Array.isArray(rows) ? rows : []));
}

export async function deleteRowsByValues(connection, table, field, values) {
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

export async function deletePromotionsByLegacyIds(connection, legacyIds = []) {
  const promotions = await selectRowsByValues(connection, "promociones", "legacy_row_id", legacyIds, "id,legacy_row_id");
  const promotionIds = promotions.map((item) => item.id).filter(Boolean);
  if (promotionIds.length) {
    await deleteRowsByValues(connection, "comentarios", "promocion_id", promotionIds);
    await deleteRowsByValues(connection, "promociones_detalle", "promocion_id", promotionIds);
    await deleteRowsByValues(connection, "promociones", "id", promotionIds);
  }
}

export async function patchRowById(connection, table, id, row) {
  const query = buildQuery({ id: `eq.${id}` });
  const result = await supabaseRequest(connection, `/rest/v1/${table}${query}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  return Array.isArray(result) ? result[0] : result;
}
