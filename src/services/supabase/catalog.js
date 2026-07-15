import { keyBy } from "./config";
import { selectAll, selectRowsByValues, supabaseRequest } from "./http";
import {
  buildCatalogosFromCampanas,
  toActividad,
  toPromotionRow,
} from "./mappers";

const OPERATIONAL_PROMOTION_WINDOW_DAYS = 60;
const CLOSED_ACTIVITY_STATUSES = new Set(["cerrado", "cerrada", "cancelado", "cancelada"]);

function normalizeStatus(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function parseDateOnly(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getOperationalPromotionCampanaIds(campanas = []) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - OPERATIONAL_PROMOTION_WINDOW_DAYS);
  cutoff.setHours(0, 0, 0, 0);

  return campanas
    .filter((campana) => {
      const status = normalizeStatus(campana.estado);
      const endDate = parseDateOnly(campana.fecha_fin);
      if (!CLOSED_ACTIVITY_STATUSES.has(status)) return true;
      return endDate ? endDate >= cutoff : false;
    })
    .map((campana) => campana.id)
    .filter(Boolean);
}

export async function pingSupabaseConnection(connection) {
  const role = await supabaseRequest(connection, "/rest/v1/rpc/current_user_role", { method: "POST", body: "{}" });
  const currentRole = Array.isArray(role) ? role[0] : role;
  if (!currentRole) {
    throw new Error("El usuario inicio sesion, pero no tiene registro activo en public.usuarios_app.");
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
    notificaciones,
    config,
  ] = await Promise.all([
    selectAll(connection, "compradores", { order: "comprador.asc" }),
    selectAll(connection, "campanas", { order: "created_at.asc" }),
    selectAll(connection, "segmentos_clientes", { order: "orden.asc" }),
    selectAll(connection, "responsables_solicitudes", { order: "nombre.asc" }),
    selectAll(connection, "jerarquia_categorias", { order: "dep_id.asc" }),
    selectAll(connection, "avances_catalogo", { order: "fecha_estado.asc" }),
    selectAll(connection, "notificaciones", { order: "created_at.asc" }),
    selectAll(connection, "configuracion"),
  ]);

  const operationalCampanaIds = getOperationalPromotionCampanaIds(campanas);
  const promociones = operationalCampanaIds.length
    ? await selectRowsByValues(connection, "promociones", "campana_id", operationalCampanaIds)
    : [];
  promociones.sort((left, right) => String(left.created_at || "").localeCompare(String(right.created_at || "")));

  const promotionIds = promociones.map((item) => item.id).filter(Boolean);
  const [detalles, lineComments, activityComments] = await Promise.all([
    promotionIds.length
      ? selectRowsByValues(connection, "promociones_detalle", "promocion_id", promotionIds)
      : [],
    promotionIds.length
      ? selectRowsByValues(connection, "comentarios", "promocion_id", promotionIds)
      : [],
    operationalCampanaIds.length
      ? selectRowsByValues(connection, "comentarios", "campana_id", operationalCampanaIds)
      : [],
  ]);
  detalles.sort((left, right) => String(left.created_at || "").localeCompare(String(right.created_at || "")));
  const comentariosById = new Map();
  [...lineComments, ...activityComments].forEach((item) => {
    if (item?.id) comentariosById.set(item.id, item);
  });
  const comentarios = Array.from(comentariosById.values())
    .sort((left, right) => String(left.fecha || left.created_at || "").localeCompare(String(right.fecha || right.created_at || "")));

  const compradorById = keyBy(compradores, "id");
  const campanaById = keyBy(campanas, "id");
  const promoById = keyBy(promociones, "id");
  const hierarchyByDepId = Object.fromEntries(
    (jerarquias || [])
      .filter((item) => item.activo !== false && item.dep_id)
      .map((item) => [
        String(item.dep_id || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, ""),
        item,
      ])
  );

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
    promociones: promociones.map((item) => toPromotionRow(item, campanaById, compradorById, hierarchyByDepId)),
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
