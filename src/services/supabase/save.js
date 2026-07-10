import {
  cleanText,
  keyBy,
  normalizeTimestamp,
  toBoolean,
  toNumber,
} from "./config";
import { loadCatalogFromSupabase } from "./catalog";
import {
  deletePromotionsByLegacyIds,
  deleteRowsByValues,
  patchRowById,
  selectAll,
  selectRowsByValues,
  upsertRows,
} from "./http";
import {
  toDbCampana,
  toDbComprador,
  toDbPromocion,
} from "./mappers";
import { normalizeRole, ROLES } from "../../constants/permissions";

export async function saveCatalogToSupabase(connection, data = {}) {
  const role = normalizeRole(connection.appUser?.rol || connection.role);
  const isAdmin = role === ROLES.ADMIN;
  const isBuyer = role === ROLES.BUYER;
  const currentBuyerId = cleanText(connection.appUser?.buyer_id || connection.buyer_id);
  const canWriteOperationalData = isAdmin || role === ROLES.BUYER;
  const canWriteComments = isAdmin || role === ROLES.BUYER || role === ROLES.MARK;
  if (!isAdmin && !canWriteOperationalData && !canWriteComments) {
    throw new Error("Su rol no tiene permisos para guardar cambios en Supabase.");
  }

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
  const buyerRowsToUpsert = isAdmin
    ? (useBuyerDiff ? allBuyerRows.filter((item) => changedBuyerIds.has(item.comprador)) : allBuyerRows)
    : [];
  const upsertedBuyers = isAdmin ? await upsertRows(connection, "compradores", buyerRowsToUpsert, "comprador") : [];
  const compradores = isAdmin && !useBuyerDiff
    ? upsertedBuyers
    : await selectRowsByValues(connection, "compradores", "comprador", allBuyerRows.map((item) => item.comprador), "*");
  const compradorByName = keyBy(compradores, "comprador");
  const catalogosById = keyBy(data.catalogos || [], "catalogo_id");
  const allCampanaRows = (data.actividades || [])
    .map((item) => toDbCampana(item, catalogosById, compradorByName))
    .filter((item) => item.legacy_actividad_id);
  const changedCampanaRows = useActivityDiff ? allCampanaRows.filter((item) => changedActivityIds.has(item.legacy_actividad_id)) : allCampanaRows;
  const campanaRowsToUpsert = isAdmin
    ? changedCampanaRows
    : isBuyer
      ? changedCampanaRows.filter((item) => item.solicitante_buyer_id && cleanText(item.solicitante_buyer_id) === currentBuyerId)
      : [];
  const upsertedCampanas = canWriteOperationalData ? await upsertRows(connection, "campanas", campanaRowsToUpsert, "legacy_actividad_id") : [];
  const campanas = canWriteOperationalData && !useActivityDiff
    ? upsertedCampanas
    : await selectRowsByValues(connection, "campanas", "legacy_actividad_id", allCampanaRows.map((item) => item.legacy_actividad_id), "*");
  const campanaByLegacy = keyBy(campanas, "legacy_actividad_id");

  const responsableRows = useResponsableDiff
    ? (data.responsables_solicitudes || []).filter((item) => changedResponsableIds.has(cleanText(item.responsable_id || item.responsableId || item.id)))
    : data.responsables_solicitudes || [];
  if (isAdmin) await upsertRows(connection, "responsables_solicitudes", responsableRows, "responsable_id");

  const jerarquiaRows = useJerarquiaDiff
    ? (data.jerarquia_categorias || []).filter((item) => changedJerarquiaIds.has(cleanText(item.dep_id || item.depId)))
    : data.jerarquia_categorias || [];
  if (isAdmin) await upsertRows(connection, "jerarquia_categorias", jerarquiaRows, "dep_id");

  const segmentoRows = useSegmentoDiff
    ? (data.segmentos_clientes || []).filter((item) => changedSegmentoIds.has(cleanText(item.segmento_id || item.segmentoId || item.id)))
    : data.segmentos_clientes || [];
  if (isAdmin) await upsertRows(connection, "segmentos_clientes", segmentoRows.map((item) => ({
    legacy_segmento_id: cleanText(item.segmento_id),
    canal: cleanText(item.canal),
    nombre_segmento: cleanText(item.nombre_segmento),
    activo: item.activo === undefined || item.activo === "" ? true : toBoolean(item.activo),
    orden: toNumber(item.orden),
  })), "legacy_segmento_id");

  if (canWriteOperationalData && usePromotionDiff && deletedPromotionIds.length) {
    await deletePromotionsByLegacyIds(connection, deletedPromotionIds);
  }

  const allPromotionRows = (data.promociones || [])
    .map((item) => toDbPromocion(item, campanaByLegacy, compradorByName))
    .filter((item) => item.campana_id && item.buyer_id && item.sku);
  const changedPromotionRows = usePromotionDiff ? allPromotionRows.filter((item) => changedPromotionIds.has(item.legacy_row_id)) : allPromotionRows;
  const promotionRowsToUpsert = isAdmin
    ? changedPromotionRows
    : isBuyer
      ? changedPromotionRows.filter((item) => item.buyer_id && cleanText(item.buyer_id) === currentBuyerId)
      : [];
  const upsertedPromotions = canWriteOperationalData ? await upsertRows(connection, "promociones", promotionRowsToUpsert, "legacy_row_id") : [];
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
  const promociones = usePromotionDiff || !canWriteOperationalData
    ? await selectRowsByValues(connection, "promociones", "legacy_row_id", currentPromotionIds, "id,legacy_row_id,campana_id")
    : upsertedPromotions;
  const promoByLegacy = keyBy(promociones, "legacy_row_id");

  if (canWriteOperationalData && usePromotionDiff && changedPromotionIds.size) {
    const changedPromotionDbIds = promociones
      .filter((item) => changedPromotionIds.has(item.legacy_row_id))
      .map((item) => item.id)
      .filter(Boolean);
    await deleteRowsByValues(connection, "promociones_detalle", "promocion_id", changedPromotionDbIds);
  }

  if (canWriteOperationalData) await upsertRows(connection, "promociones_detalle", detalleSourceRows.map((item) => ({
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
  const existingComentarios = canWriteComments ? (useCommentDiff
    ? await selectRowsByValues(connection, "comentarios", "legacy_comentario_id", comentarioRows.map((item) => item.legacy_comentario_id), "id,legacy_comentario_id")
    : await selectAll(connection, "comentarios", { select: "id,legacy_comentario_id" })) : [];
  const comentarioIdByLegacy = keyBy(existingComentarios, "legacy_comentario_id");
  const newComentarios = [];
  if (canWriteComments) {
    for (const comentario of comentarioRows) {
      const existing = comentarioIdByLegacy[comentario.legacy_comentario_id];
      if (existing?.id) {
        await patchRowById(connection, "comentarios", existing.id, comentario);
      } else {
        newComentarios.push(comentario);
      }
    }
    await upsertRows(connection, "comentarios", newComentarios, null);
  }

  const notificacionRows = useNotificacionDiff
    ? (data.notificaciones || []).filter((item) => {
      const key = cleanText(item.notificacion_id || item.notificacionId || `${item.actividad_id || item.catalogo_id || ""}__${item.correo || ""}`);
      return changedNotificacionIds.has(key);
    })
    : data.notificaciones || [];
  if (isAdmin) await upsertRows(connection, "notificaciones", notificacionRows.map((item) => {
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
  const avanceRowsToUpsert = isAdmin ? avanceRows : isBuyer ? avanceRows.filter((item) => {
    const buyerName = cleanText(item.comprador);
    return compradorByName[buyerName]?.id && cleanText(compradorByName[buyerName].id) === currentBuyerId;
  }) : [];
  if (canWriteOperationalData) await upsertRows(connection, "avances_catalogo", avanceRowsToUpsert.map((item) => ({
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

  if (canWriteOperationalData) {
    try {
      const existingLogs = isAdmin ? (useLogDiff
        ? await selectRowsByValues(connection, "logs", "request_id", logSourceRows.map((item) => item.log_id || item.logId || item.id), "request_id")
        : await selectAll(connection, "logs", { select: "request_id" })) : [];
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
    } catch {
      // El log no debe impedir que se guarden las promociones.
    }
  }

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
