import { cleanText, keyBy } from "./config";
import { selectAll, selectRowsByValues, toPostgrestIn } from "./http";
import { toActividad, toPromotionRow } from "./mappers";

function normalizeFilterText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function splitChannelValues(value) {
  return String(value || "")
    .split(/[,;/|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function channelMatchesFilter(canal, selected) {
  const expected = normalizeFilterText(selected);
  if (!expected) return true;
  return splitChannelValues(canal).some((item) => normalizeFilterText(item) === expected);
}

function buildHierarchyByDepId(jerarquias = []) {
  return Object.fromEntries(
    (jerarquias || [])
      .filter((item) => item.activo !== false && item.dep_id)
      .map((item) => [
        normalizeFilterText(item.dep_id).replace(/[^a-z0-9]/g, ""),
        item,
      ]),
  );
}

function isAllFilter(value) {
  return !value || value === "Todos";
}

function matchesActivityFilters(campana, filters = {}) {
  const activityTerm = normalizeFilterText(filters.actividadCatalogo);
  const activityText = normalizeFilterText(`${campana.legacy_actividad_id || ""} ${campana.nombre_actividad || ""}`);
  const canal = campana.canal || "";

  return (!activityTerm || activityText.includes(activityTerm))
    && (isAllFilter(filters.tipoActividad) || (campana.tipo_actividad || "CATALOGO") === filters.tipoActividad)
    && (isAllFilter(filters.canal)
      || (canal ? channelMatchesFilter(canal, filters.canal) : filters.canal === "Sin canal"));
}

function buildPromotionQuery(filters = {}, campanaIds = [], buyerIds = []) {
  const query = { order: "created_at.asc" };
  if (campanaIds.length) query.campana_id = toPostgrestIn(campanaIds);
  if (!isAllFilter(filters.tipo)) query.tipo_promo = `eq.${filters.tipo}`;
  if (!isAllFilter(filters.alcance)) query.alcance_tipo = `eq.${filters.alcance}`;
  if (buyerIds.length) query.buyer_id = toPostgrestIn(buyerIds);
  if (cleanText(filters.sku)) query.sku = `ilike.*${cleanText(filters.sku).replace(/\*/g, "")}*`;
  return query;
}

function mapComentarios(comentarios = [], promoById = {}, campanaById = {}) {
  return comentarios.map((item) => {
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
  });
}

export async function loadExportDataFromSupabase(connection, filters = {}) {
  const [
    compradores,
    campanas,
    jerarquias,
  ] = await Promise.all([
    selectAll(connection, "compradores", { order: "comprador.asc" }),
    selectAll(connection, "campanas", { order: "created_at.asc" }),
    selectAll(connection, "jerarquia_categorias", { order: "dep_id.asc" }),
  ]);

  const matchingCampanas = campanas.filter((campana) => matchesActivityFilters(campana, filters));
  const matchingCampanaIds = matchingCampanas.map((campana) => campana.id).filter(Boolean);
  const hasActivityScopedFilters = cleanText(filters.actividadCatalogo)
    || !isAllFilter(filters.tipoActividad)
    || !isAllFilter(filters.canal);

  if (hasActivityScopedFilters && !matchingCampanaIds.length) {
    return { promociones: [], actividades: [], comentarios: [] };
  }

  const buyerIds = isAllFilter(filters.comprador)
    ? []
    : compradores
      .filter((buyer) => buyer.comprador === filters.comprador)
      .map((buyer) => buyer.id)
      .filter(Boolean);

  if (!isAllFilter(filters.comprador) && !buyerIds.length) {
    return { promociones: [], actividades: [], comentarios: [] };
  }

  const promociones = await selectAll(
    connection,
    "promociones",
    buildPromotionQuery(filters, hasActivityScopedFilters ? matchingCampanaIds : [], buyerIds),
  );

  const promotionCampanaIds = Array.from(new Set((promociones || []).map((item) => item.campana_id).filter(Boolean)));
  const exportCampanas = hasActivityScopedFilters
    ? matchingCampanas.filter((campana) => promotionCampanaIds.includes(campana.id))
    : campanas.filter((campana) => promotionCampanaIds.includes(campana.id));
  const exportCampanaIds = exportCampanas.map((campana) => campana.id).filter(Boolean);
  const promotionIds = (promociones || []).map((item) => item.id).filter(Boolean);

  const [lineComments, activityComments] = await Promise.all([
    promotionIds.length ? selectRowsByValues(connection, "comentarios", "promocion_id", promotionIds) : [],
    exportCampanaIds.length ? selectRowsByValues(connection, "comentarios", "campana_id", exportCampanaIds) : [],
  ]);

  const comentariosById = new Map();
  [...lineComments, ...activityComments].forEach((item) => {
    if (item?.id) comentariosById.set(item.id, item);
  });

  const compradorById = keyBy(compradores, "id");
  const campanaById = keyBy(exportCampanas, "id");
  const promoById = keyBy(promociones, "id");
  const hierarchyByDepId = buildHierarchyByDepId(jerarquias);

  return {
    promociones: (promociones || []).map((item) => toPromotionRow(item, campanaById, compradorById, hierarchyByDepId)),
    actividades: exportCampanas.map((item) => toActividad(item, compradorById)),
    comentarios: mapComentarios(
      Array.from(comentariosById.values()).sort((left, right) => String(left.fecha || left.created_at || "").localeCompare(String(right.fecha || right.created_at || ""))),
      promoById,
      campanaById,
    ),
  };
}
