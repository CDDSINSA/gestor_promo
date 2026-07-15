import {
  SELECT_PAGE_SIZE,
  assertOk,
  cleanText,
  fetchWithTimeout,
  getHeaders,
  getSupabaseUrl,
} from "./config";
import { ensureFreshAppSession } from "./session";

async function getAuthenticatedSession(connection = {}) {
  const session = connection.session || connection.appSession || connection.authSession;
  return ensureFreshAppSession(connection, session);
}

export async function supabaseRequest(connection, path, options = {}) {
  const session = await getAuthenticatedSession(connection);
  const response = await fetchWithTimeout(`${getSupabaseUrl(connection)}${path}`, {
    ...options,
    headers: getHeaders(connection, session.access_token, options.headers || {}),
  });
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

export async function selectAll(connection, table, params = {}) {
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

export async function callRpc(connection, functionName, params = {}) {
  return supabaseRequest(connection, `/rest/v1/rpc/${functionName}`, {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function toPostgrestIn(values = []) {
  const uniqueValues = Array.from(new Set(values.map(cleanText).filter(Boolean)));
  if (!uniqueValues.length) return "";
  return `in.(${uniqueValues.map((value) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")})`;
}

export async function selectRowsByValues(connection, table, field, values, select = "*") {
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
