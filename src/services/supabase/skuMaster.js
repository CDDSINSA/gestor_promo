import { callRpc, selectAll, supabaseRequest, toPostgrestIn } from "./http";

export const SKU_MASTER_BATCH_SIZE = 1000;
export const PROMOTION_COST_COMPLETION_LIMIT = 1000;

/**
 * Obtiene métricas del maestro de SKU (total registros y última actualización).
 */
export async function getSkuMasterSummaryFromSupabase(connection) {
  try {
    const summary = await callRpc(connection, "get_sku_master_summary");
    if (summary && typeof summary.total === "number") {
      return summary;
    }
  } catch (err) {
    // Si la RPC aún no ha sido creada, hacemos fallback a consulta estándar
  }

  try {
    const rows = await supabaseRequest(connection, "/rest/v1/sku_master?select=actualizado_el&order=actualizado_el.desc&limit=1", {
      headers: {
        Prefer: "count=exact",
        Range: "0-0",
      },
    });
    return {
      total: Array.isArray(rows) ? rows.length : 0,
      last_updated: rows?.[0]?.actualizado_el || null,
    };
  } catch (error) {
    return { total: 0, last_updated: null, error: error.message };
  }
}

/**
 * Vacía por completo la tabla sku_master para permitir una recarga limpia desde cero.
 */
export async function clearSkuMasterInSupabase(connection) {
  try {
    return await callRpc(connection, "clear_sku_master");
  } catch (error) {
    // Si el error es de permisos o timeout de sentencia, propagar inmediatamente
    if (error?.status === 401 || error?.status === 403 || error?.message?.includes("57014")) {
      throw error;
    }
    // Fallback ligero con DELETE solo si la RPC no estuviera creada en la BD
    return await supabaseRequest(connection, "/rest/v1/sku_master?sku=neq.__never__", {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
  }
}

/**
 * Inserta o actualiza un lote de registros de sku_master.
 */
export async function insertSkuMasterBatch(connection, batch = []) {
  if (!batch.length) return { inserted: 0 };
  try {
    return await callRpc(connection, "insert_sku_master_batch", { p_rows: batch });
  } catch (error) {
    // Con costos en el lote no hay respaldo por REST: el costo solo se guarda por la
    // RPC (sku_costos no es accesible por REST) y nunca debe terminar en sku_master.
    if (batch.some(hasCostFields)) throw error;
    // Fallback a POST estándar en REST con merge-duplicates
    return await supabaseRequest(connection, "/rest/v1/sku_master?on_conflict=sku", {
      method: "POST",
      headers: {
        Prefer: "return=minimal,resolution=merge-duplicates",
      },
      body: JSON.stringify(batch),
    });
  }
}

function hasCostFields(row = {}) {
  return row.av_cost !== null && row.av_cost !== undefined;
}

/**
 * Llama completar_costos_promociones por tramos hasta que no queden líneas por completar.
 */
export async function completePromotionCostsInSupabase(connection, onStep = null, maxRounds = 500) {
  let total = 0;
  for (let round = 0; round < maxRounds; round += 1) {
    const result = await callRpc(connection, "completar_costos_promociones", { p_limit: PROMOTION_COST_COMPLETION_LIMIT });
    const completed = Number(result?.completed) || 0;
    total += completed;
    onStep?.(total);
    if (completed < PROMOTION_COST_COMPLETION_LIMIT) break;
  }
  return total;
}

/**
 * Orquesta la recarga total desde cero de sku_master:
 * 1. Limpia la tabla completa.
 * 2. Carga en lotes secuenciales informando el progreso.
 */
export async function replaceSkuMasterInSupabase(connection, rows = [], onProgress = null) {
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error("No hay registros válidos para cargar en el catálogo maestro.");
  }

  onProgress?.({ phase: "clearing", percent: 2, message: "Borrando catálogo anterior..." });
  await clearSkuMasterInSupabase(connection);

  const total = rows.length;
  const totalBatches = Math.ceil(total / SKU_MASTER_BATCH_SIZE);
  let totalInserted = 0;
  let totalCosts = 0;
  let promotionsCompleted = 0;

  for (let i = 0; i < totalBatches; i++) {
    const start = i * SKU_MASTER_BATCH_SIZE;
    const end = Math.min(start + SKU_MASTER_BATCH_SIZE, total);
    const chunk = rows.slice(start, end);

    const currentPercent = Math.round(5 + ((i + 1) / totalBatches) * 90);
    onProgress?.({
      phase: "uploading",
      percent: currentPercent,
      currentBatch: i + 1,
      totalBatches,
      processed: end,
      total,
      message: `Cargando lote ${i + 1} de ${totalBatches} (${end.toLocaleString()} de ${total.toLocaleString()} SKU)...`,
    });

    const result = await insertSkuMasterBatch(connection, chunk);
    totalInserted += chunk.length;
    totalCosts += Number(result?.costs) || 0;
  }

  // Al final (no por lote): completa el costo de promociones que estaban sin costo.
  // Si falla, el maestro ya quedó cargado; se reintenta en la próxima carga.
  let completionError = "";
  if (totalCosts > 0) {
    try {
      promotionsCompleted = await completePromotionCostsInSupabase(connection, (completed) => {
        onProgress?.({
          phase: "completing",
          percent: 97,
          message: `Completando costo de promociones existentes (${completed.toLocaleString()} líneas)...`,
        });
      });
    } catch (error) {
      completionError = error.message || "No se pudo completar el costo de promociones.";
    }
  }

  onProgress?.({
    phase: "completed",
    percent: 100,
    total: totalInserted,
    message: `¡Carga completada! Se registraron ${totalInserted.toLocaleString()} artículos.`,
  });

  return { ok: true, total: totalInserted, costs: totalCosts, promotionsCompleted, completionError };
}

export const SKU_CLASSIFICATION_BATCH_SIZE = 2000;

/**
 * Resumen de la clasificación ABC (paso 35). Devuelve null si el script aún no se
 * ejecutó, para que Ajustes siga funcionando sin la clasificación.
 */
export async function getSkuClassificationSummaryFromSupabase(connection) {
  try {
    const summary = await callRpc(connection, "get_clasificacion_abc_resumen");
    return summary && typeof summary.total_clasificados === "number" ? summary : null;
  } catch {
    return null;
  }
}

function newLoadId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // Respaldo para navegadores sin randomUUID (contexto no seguro).
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16));
}

/**
 * Actualización PARCIAL del maestro: solo la clasificación ABC. No borra ni modifica
 * sku_master ni costos. Sube los lotes con un mismo id de carga y al final aplica:
 * los SKU que no vinieron en el archivo quedan como 8 (Nuevo). Si un lote
 * falla, no se aplica y la clasificación anterior se conserva.
 */
export async function updateSkuClassificationInSupabase(connection, rows = [], onProgress = null) {
  const valid = (Array.isArray(rows) ? rows : [])
    .map((row) => ({ sku: String(row?.sku ?? "").trim(), clasificacion_abc: Number(row?.clasificacion_abc) }))
    .filter((row) => row.sku && Number.isInteger(row.clasificacion_abc) && row.clasificacion_abc >= 1 && row.clasificacion_abc <= 11);
  if (!valid.length) throw new Error("No hay clasificaciones válidas para cargar.");

  const loadId = newLoadId();
  const total = valid.length;
  const totalBatches = Math.ceil(total / SKU_CLASSIFICATION_BATCH_SIZE);
  for (let i = 0; i < totalBatches; i++) {
    const end = Math.min((i + 1) * SKU_CLASSIFICATION_BATCH_SIZE, total);
    onProgress?.({
      phase: "uploading",
      percent: Math.round(5 + ((i + 1) / totalBatches) * 85),
      message: `Cargando clasificación ABC, lote ${i + 1} de ${totalBatches} (${end.toLocaleString()} de ${total.toLocaleString()} SKU)...`,
    });
    await callRpc(connection, "cargar_clasificacion_abc_lote", {
      p_carga_id: loadId,
      p_rows: valid.slice(i * SKU_CLASSIFICATION_BATCH_SIZE, end),
    });
  }

  onProgress?.({ phase: "applying", percent: 95, message: "Aplicando clasificación y marcando el resto como Nuevo..." });
  const summary = await callRpc(connection, "aplicar_clasificacion_abc", { p_carga_id: loadId });
  onProgress?.({ phase: "completed", percent: 100, message: "Clasificación ABC actualizada." });
  return { ok: true, total, summary: summary || null };
}

/**
 * Consulta exclusivamente los códigos solicitados; nunca descarga el maestro completo.
 */
export async function loadSkuMasterBySkusFromSupabase(connection, skus = [], { signal } = {}) {
  if (!connection?.session?.access_token && !connection?.appSession?.access_token && !connection?.authSession?.access_token) {
    throw new Error("Se requiere una sesión activa para consultar el maestro de artículos.");
  }
  const requested = [...new Set(skus.map((sku) => String(sku ?? "").trim()).filter(Boolean))];
  const lookup = [...new Set(requested.flatMap(skuVariants))];
  const rows = [];
  // Small batches keep the encoded URL bounded, including leading-zero variants.
  for (let i = 0; i < lookup.length; i += 100) {
    const page = await selectAll(connection, "sku_master", {
      select: "sku,num_parte,descripcion,dep_id,unidad_medida,proveedor,precio_regular,actualizado_el",
      sku: toPostgrestIn(lookup.slice(i, i + 100)),
      order: "sku.asc",
    }, { signal });
    if (!Array.isArray(page)) throw new Error("La BD devolvió una respuesta inválida para el maestro de artículos.");
    rows.push(...page);
  }

  const dictionary = {};
  let lastUpdated = null;

  for (let i = 0; i < rows.length; i++) {
    const item = rows[i];
    if (!item?.sku) continue;
    dictionary[item.sku] = {
      sku: item.sku,
      vpn: item.num_parte || "",
      descripcion: item.descripcion || "",
      dep_id: item.dep_id || "",
      precio: item.precio_regular !== null && item.precio_regular !== undefined ? item.precio_regular : "",
      unidad_medida: item.unidad_medida || "",
      proveedor: item.proveedor || "",
    };
    if (item.actualizado_el && (!lastUpdated || item.actualizado_el > lastUpdated)) {
      lastUpdated = item.actualizado_el;
    }
  }

  // Prefer exact codes; only use an unambiguous leading-zero variant as fallback.
  for (const sku of requested) {
    if (dictionary[sku]) continue;
    const matches = [...new Set(skuVariants(sku).map((key) => dictionary[key]).filter(Boolean))];
    if (matches.length === 1) dictionary[sku] = matches[0];
  }
  return {
    skuMaster: dictionary,
    skuMasterCount: rows.length,
    lastUpdated,
  };
}

function skuVariants(sku) {
  if (!/^\d+$/.test(sku)) return [sku];
  const numeric = sku.replace(/^0+(?=\d)/, "");
  return [...new Set([sku, numeric, ...[5, 6, 7, 8].map((length) => numeric.padStart(length, "0"))])];
}

/**
 * AIRES: pesos de reparto por costo (AV_COST) de cada pieza de cada aire.
 * La RPC no devuelve costos, solo la proporción; si a una pieza le falta costo el aire
 * viene con fuente SIN_COSTO y el frontend reparte por precio regular.
 * combos: [{ combo, items: [{ sku, cantidad }] }]
 */
export async function loadAiresCostWeightsFromSupabase(connection, combos = []) {
  if (!Array.isArray(combos) || !combos.length) return [];
  const result = await callRpc(connection, "calcular_pesos_aires", { p_combos: combos });
  return Array.isArray(result) ? result : [];
}
