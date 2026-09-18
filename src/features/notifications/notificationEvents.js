import { normalizeRole, ROLES } from "../../constants/permissions.js";

const text = (value) => String(value ?? "").trim();
const unique = (values) => [...new Set(values.map(text).filter(Boolean))];
const activityId = (row) => text(row.actividad_id || row.actividadId);

function buyerId(row, buyers) {
  if (row.buyer_id || row.buyerId) return row.buyer_id || row.buyerId;
  const id = text(row.comprador_id || row.compradorId);
  const name = text(row.comprador).toLowerCase();
  return buyers.find((buyer) => (id && [buyer.id, buyer.comprador_id].includes(id))
    || (name && text(buyer.comprador || buyer.nombre).toLowerCase() === name))?.id || "";
}

// Pure event builders: no persistence, UI state or network requests.
export function buildCatalogNotificationEvents(payload = {}, { operationType = "catalog", actorRole, buyers = [], previousPromotions = new Map() } = {}) {
  const events = [];
  const sync = payload.sync_options || {};
  const promotions = payload.promociones || [];
  if (operationType === "catalog") {
    const changed = new Set(sync.promociones?.changed_row_ids || []);
    const groups = new Map();
    const addChange = (rowId, id, change) => {
      const key = JSON.stringify([id, change]);
      const group = groups.get(key) || { id, change, rowIds: [] };
      group.rowIds.push(rowId);
      groups.set(key, group);
    };
    promotions.filter((row) => changed.has(row.row_id)).forEach((row) => {
      const previous = previousPromotions.get(row.row_id);
      const persisted = previousPromotions.has(row.row_id) || Number(sync.promociones?.expected_versions?.[row.row_id] || row.version) > 0;
      const annulled = text(row.estado_registro || row.estadoRegistro).toUpperCase() === "ANULADO";
      const wasAnnulled = text(previous?.estado_registro).toUpperCase() === "ANULADO";
      const change = !persisted ? "added" : annulled && !wasAnnulled ? "annulled" : "modified";
      addChange(row.row_id, activityId(row), change);
    });
    unique(sync.promociones?.deleted_row_ids || []).forEach((rowId) => {
      const previous = previousPromotions.get(rowId);
      addChange(rowId, activityId(previous || {}), "deleted");
    });
    const messages = {
      added: { event: "PROMOCION_AGREGADA", title: "Nuevas promociones", singular: "Se agregó", plural: "Se agregaron" },
      modified: { event: "PROMOCION_ACTUALIZADA", title: "Promociones modificadas", singular: "Se modificó", plural: "Se modificaron" },
      annulled: { event: "PROMOCION_ANULADA", title: "Promociones anuladas", singular: "Se anuló", plural: "Se anularon" },
      deleted: { event: "PROMOCION_ELIMINADA", title: "Promociones eliminadas", singular: "Se eliminó", plural: "Se eliminaron" },
    };
    groups.forEach(({ rowIds, id, change }) => {
      const catalog = (payload.catalogos || []).find((row) => text(row.catalogo_id || row.id) === id);
      const activity = (payload.actividades || []).find((row) => activityId(row) === id);
      const name = text(catalog?.nombre || activity?.nombre_actividad || activity?.nombre || id);
      const kind = catalog || activity?.tipo_actividad === "CATALOGO" ? "catálogo" : "actividad";
      const context = name ? ` en ${kind === "catálogo" ? "el" : "la"} ${kind} «${name}»` : "";
      const count = rowIds.length;
      const message = messages[change];
      events.push({
        tipoEvento: message.event, titulo: message.title,
        mensaje: `${count === 1 ? message.singular : message.plural} ${count} ${count === 1 ? "promoción" : "promociones"}${context}.${change === "annulled" ? (count === 1 ? " Ya no está activa." : " Ya no están activas.") : ""} Favor revisar.`,
        actividadId: id, destinatarioRoles: [ROLES.MARK], urlModulo: "consolidado",
        metadata: { promotionChanges: count, changeType: change, rowIds, operationId: payload.operation_id },
      });
    });

    const changedComments = new Set(sync.comentarios?.changed_ids || []);
    (payload.comentarios || []).filter((comment) => changedComments.has(comment.comentario_id)).forEach((comment) => {
      const id = activityId(comment);
      const rows = promotions.filter((row) => activityId(row) === id && (!comment.row_id || row.row_id === comment.row_id));
      const activity = (payload.actividades || []).find((row) => activityId(row) === id);
      const buyerIds = unique(rows.map((row) => buyerId(row, buyers)));
      if (!comment.row_id && activity?.solicitante_buyer_id) buyerIds.push(activity.solicitante_buyer_id);
      const fromBuyer = normalizeRole(actorRole) === ROLES.BUYER;
      events.push({
        tipoEvento: fromBuyer ? "COMENTARIO_COMPRAS" : "COMENTARIO_MERCADEO",
        titulo: fromBuyer ? "Comentario de Compras actualizado" : "Comentario de Mercadeo actualizado",
        mensaje: `Comentario ${text(comment.estado).toLowerCase() || "actualizado"}${comment.row_id ? ` en la promocion ${comment.row_id}` : ` en la actividad ${id}`}.`,
        actividadId: id,
        rowId: comment.row_id,
        comentarioId: comment.comentario_id,
        destinatarioRoles: fromBuyer ? [ROLES.MARK] : [],
        destinatarioBuyerIds: fromBuyer ? [] : unique(buyerIds),
        urlModulo: "consolidado",
        metadata: { estado: comment.estado, operationId: payload.operation_id },
      });
    });
  }
  if (operationType === "settings") {
    const changed = new Set(sync.actividades?.changed_ids || []);
    (payload.actividades || []).filter((row) => changed.has(activityId(row))).forEach((row) => events.push({
      tipoEvento: "CATALOGO_ACTUALIZADO", titulo: "Catalogo actualizado",
      mensaje: "La configuracion del catalogo fue actualizada.", actividadId: activityId(row),
      destinatarioRoles: [ROLES.MARK, ROLES.BUYER], urlModulo: "home",
      metadata: { operationId: payload.operation_id },
    }));
  }
  return events;
}

export function buildDesignNotificationEvent({ page, project, actorRole, action, state, commentId } = {}) {
  if (!page?.id || !project?.catalogo_id) return null;
  const role = normalizeRole(actorRole);
  const titles = {
    comment: "Nuevo comentario de diseño", review: "Revision de pagina",
    resolved: "Comentario de diseño resuelto", reopened: "Comentario de diseño reabierto",
    image: "Imagen de pagina actualizada", state: "Estado de pagina actualizado",
  };
  return {
    tipoEvento: `DISENO_${action.toUpperCase()}`,
    titulo: titles[action] || "Diseño actualizado",
    mensaje: `${project.nombre_proyecto || project.catalogo_id} · Pagina ${page.numero_pagina}${state ? ` · ${state.replace(/_/g, " ")}` : ""}.`,
    actividadId: project.catalogo_id,
    destinatarioRoles: [ROLES.BUYER, ROLES.DESIGNER].includes(role) ? [ROLES.MARK] : [],
    destinatarioBuyerIds: role !== ROLES.BUYER && page.comprador_id ? [page.comprador_id] : [],
    destinatarioUsuarioIds: page.disenador_id ? [page.disenador_id] : [],
    urlModulo: "catalogDesign",
    // Design comments belong to a different table: never use comentarioId (FK to comentarios).
    metadata: { proyectoId: project.id, paginaId: page.id, comentarioDisenoId: commentId || null, estado: state || null },
  };
}
