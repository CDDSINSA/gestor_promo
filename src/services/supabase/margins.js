import { buildQuery, selectAll, supabaseRequest, toPostgrestIn, upsertRows } from "./http";

export const MARGIN_PAGE_SIZE = 1000;
export const MARGIN_MAX_ROWS = 20000;
// Los costos (AV_COST) vienen siempre en C$: no hay tasa de cambio que configurar.
export const MARGIN_CONFIG_KEYS = Object.freeze({ semaforo: "MARGEN_SEMAFORO" });

function emptyToNull(value) {
  const text = String(value ?? "").trim();
  return text && text !== "Todos" ? text : null;
}

export function buildMarginRpcParams(filters = {}) {
  return {
    p_comprador: emptyToNull(filters.comprador),
    p_division: emptyToNull(filters.division),
    p_tipo_actividad: emptyToNull(filters.tipoActividad),
    p_actividad: emptyToNull(filters.actividad),
    p_tipo_promo: emptyToNull(filters.tipoPromo),
    p_sku: emptyToNull(filters.sku),
  };
}

/**
 * Consulta bajo demanda las líneas con costo guardado (RPC consultar_margenes_promociones).
 * El servidor valida rol (ADMIN, OPER, BUYER) y alcance del comprador.
 */
export async function loadMarginLinesFromSupabase(connection, filters = {}, { signal } = {}) {
  const params = buildMarginRpcParams(filters);
  const rows = [];
  for (let offset = 0; offset < MARGIN_MAX_ROWS; offset += MARGIN_PAGE_SIZE) {
    const page = await supabaseRequest(
      connection,
      `/rest/v1/rpc/consultar_margenes_promociones${buildQuery({ limit: MARGIN_PAGE_SIZE, offset })}`,
      { method: "POST", body: JSON.stringify(params), signal },
    );
    if (!Array.isArray(page)) throw new Error("La BD devolvió una respuesta inválida para la consulta de márgenes.");
    rows.push(...page);
    if (page.length < MARGIN_PAGE_SIZE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

function abcSkuKey(sku) {
  const text = String(sku ?? "").trim();
  return /^\d+$/.test(text) ? text.replace(/^0+(?=\d)/, "") : text;
}

/**
 * Clasificación ABC de los SKU consultados (tabla sku_clasificacion_abc, paso 35).
 * Devuelve { bySku, byKey } o null si la tabla no existe o no se pudo leer, para que
 * el módulo de márgenes siga funcionando sin la clasificación.
 */
export async function loadAbcClassificationsFromSupabase(connection, skus = [], { signal } = {}) {
  const keys = [...new Set(skus.map(abcSkuKey).filter(Boolean))];
  const bySku = new Map();
  const byKey = new Map();
  try {
    for (let i = 0; i < keys.length; i += 200) {
      const page = await selectAll(connection, "sku_clasificacion_abc", {
        select: "sku,sku_key,clasificacion",
        sku_key: toPostgrestIn(keys.slice(i, i + 200)),
      }, { signal });
      if (!Array.isArray(page)) return null;
      for (const row of page) {
        const code = Number(row.clasificacion);
        bySku.set(String(row.sku).trim(), code);
        if (!byKey.has(row.sku_key)) byKey.set(row.sku_key, code);
      }
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    return null;
  }
  return { bySku, byKey };
}

export async function loadMarginSettingsFromSupabase(connection) {
  const rows = await selectAll(connection, "configuracion", {
    select: "clave,valor",
    clave: `eq.${MARGIN_CONFIG_KEYS.semaforo}`,
  });
  const byKey = Object.fromEntries((Array.isArray(rows) ? rows : []).map((row) => [row.clave, row.valor]));
  return {
    semaforo: byKey[MARGIN_CONFIG_KEYS.semaforo] && typeof byKey[MARGIN_CONFIG_KEYS.semaforo] === "object"
      ? byKey[MARGIN_CONFIG_KEYS.semaforo]
      : null,
  };
}

/** Solo ADMIN (política configuracion_admin_all). */
export async function saveMarginSettingsToSupabase(connection, { semaforo }) {
  return upsertRows(connection, "configuracion", [
    {
      clave: MARGIN_CONFIG_KEYS.semaforo,
      valor: { verde: Number(semaforo.verde), naranja: Number(semaforo.naranja), amarillo: Number(semaforo.amarillo) },
      categoria: "MARGENES",
      descripcion: "Cortes del semáforo de margen (%): verde >= verde, naranja >= naranja, amarillo >= amarillo, rojo menor.",
    },
  ], "clave");
}
