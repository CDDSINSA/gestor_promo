import { callRpc, selectAll, supabaseRequest, toPostgrestIn } from "./http";

export const SKU_MASTER_BATCH_SIZE = 1500;

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
    // Fallback directo con DELETE si la RPC no está instalada
    return await supabaseRequest(connection, "/rest/v1/sku_master?sku=neq.__never__", {
      method: "DELETE",
      headers: { Prefer: "return=representation" },
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

    await insertSkuMasterBatch(connection, chunk);
    totalInserted += chunk.length;
  }

  onProgress?.({
    phase: "completed",
    percent: 100,
    total: totalInserted,
    message: `¡Carga completada! Se registraron ${totalInserted.toLocaleString()} artículos.`,
  });

  return { ok: true, total: totalInserted };
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
