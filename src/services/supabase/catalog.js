import { keyBy } from "./config";
import { selectAll, selectRowsByValues, supabaseRequest } from "./http";
import {
  buildCatalogosFromCampanas,
  toActividad,
  toPromotionRow,
} from "./mappers";

// Lecturas paginadas con orden unico (id): sin el, Supabase puede saltar o repetir
// filas entre paginas de 1000, y una linea ausente terminaria borrada al guardar.
const STABLE_PAGED_READ = Object.freeze({ order: "id.asc", concurrency: 4 });

const CLOSED_ACTIVITY_STATUSES = new Set([
  "archivado",
  "archivada",
  "cancelado",
  "cancelada",
  "cerrado",
  "cerrada",
  "finalizado",
  "finalizada",
  "resuelto",
  "resuelta",
]);

function normalizeStatus(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isOpenActivity(campana = {}) {
  return !CLOSED_ACTIVITY_STATUSES.has(normalizeStatus(campana.estado));
}

// Diagnostico de la carga inicial: mide cada consulta y deja el resultado en
// la consola del navegador y en window.__promoLoadTimings. No cambia los datos.
function createLoadTimer(label) {
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const start = now();
  const steps = [];
  return {
    async track(name, run) {
      const startedAt = now();
      const result = await run();
      steps.push({
        paso: name,
        ms: Math.round(now() - startedAt),
        filas: Array.isArray(result) ? result.length : "",
      });
      return result;
    },
    async phase(name, run) {
      const startedAt = now();
      const result = await run();
      steps.push({ paso: `== ${name}`, ms: Math.round(now() - startedAt), filas: "" });
      return result;
    },
    finish() {
      const total = Math.round(now() - start);
      const report = { label, total_ms: total, at: new Date().toISOString(), steps };
      if (typeof window !== "undefined") window.__promoLoadTimings = report;
      if (typeof console !== "undefined" && console.groupCollapsed && console.table) {
        console.groupCollapsed(`[carga] ${label}: ${total} ms`);
        console.table(steps);
        console.groupEnd();
      }
      return report;
    },
  };
}

async function loadCatalogSummary(connection) {
  try {
    return await selectAll(connection, "v_catalogo_resumen", {
      order: "actividad_id.asc",
    });
  } catch {
    return [];
  }
}

async function loadOpenCampanas(connection) {
  try {
    return await selectAll(connection, "v_catalogos_operativos", {
      order: "created_at.asc,id.asc",
    });
  } catch {
    const rows = await selectAll(connection, "campanas", { order: "created_at.asc,id.asc" });
    return (rows || []).filter(isOpenActivity);
  }
}

export async function pingSupabaseConnection(connection) {
  const role = await supabaseRequest(connection, "/rest/v1/rpc/current_user_role", { method: "POST", body: "{}" });
  const currentRole = Array.isArray(role) ? role[0] : role;
  if (!currentRole) {
    throw new Error("El usuario inicio sesion, pero no tiene registro activo en public.usuarios_app.");
  }
  return { role: currentRole };
}

export async function loadActivityIdsByPrefixFromSupabase(connection, prefix) {
  const cleanPrefix = String(prefix || "").trim();
  if (!cleanPrefix) return [];

  const rows = await selectAll(connection, "campanas", {
    select: "legacy_actividad_id",
    legacy_actividad_id: `like.${cleanPrefix}%`,
    order: "legacy_actividad_id.asc",
    limit: 1000,
  });

  return Array.isArray(rows)
    ? rows.map((item) => String(item.legacy_actividad_id || "").trim()).filter(Boolean)
    : [];
}

function buildHierarchyByDepId(jerarquias = []) {
  return Object.fromEntries(
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
}

export async function loadSpecialRequestsFromSupabase(connection) {
  const [
    compradores,
    campanas,
    responsables,
    jerarquias,
  ] = await Promise.all([
    selectAll(connection, "compradores", { order: "comprador.asc" }),
    selectAll(connection, "campanas", { tipo_actividad: "eq.ESPECIAL", order: "created_at.asc,id.asc" }),
    selectAll(connection, "responsables_solicitudes", { order: "nombre.asc" }),
    selectAll(connection, "jerarquia_categorias", { order: "dep_id.asc" }),
  ]);

  const campanaIds = campanas.map((item) => item.id).filter(Boolean);
  const promociones = campanaIds.length
    ? await selectRowsByValues(connection, "promociones", "campana_id", campanaIds, "*", STABLE_PAGED_READ)
    : [];
  promociones.sort((left, right) => String(left.created_at || "").localeCompare(String(right.created_at || "")));

  const promotionIds = promociones.map((item) => item.id).filter(Boolean);
  const [detalles, lineComments, activityComments] = await Promise.all([
    promotionIds.length
      ? selectRowsByValues(connection, "promociones_detalle", "promocion_id", promotionIds, "*", STABLE_PAGED_READ)
      : [],
    promotionIds.length
      ? selectRowsByValues(connection, "comentarios", "promocion_id", promotionIds, "*", STABLE_PAGED_READ)
      : [],
    campanaIds.length
      ? selectRowsByValues(connection, "comentarios", "campana_id", campanaIds, "*", STABLE_PAGED_READ)
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
  const hierarchyByDepId = buildHierarchyByDepId(jerarquias);

  return {
    actividades: campanas.map((item) => toActividad(item, compradorById)),
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
    responsables_solicitudes: responsables,
  };
}

export async function loadPromotionScopeFromSupabase(connection, { actividadId, comprador, tipoPromo } = {}) {
  const cleanActividadId = String(actividadId || "").trim();
  const cleanComprador = String(comprador || "").trim();
  const cleanTipoPromo = String(tipoPromo || "").trim();
  if (!cleanActividadId || !cleanComprador || !cleanTipoPromo) {
    return { promociones: [], promociones_detalle: [], comentarios: [] };
  }

  const [campanas, compradores, jerarquias] = await Promise.all([
    selectAll(connection, "campanas", {
      select: "id,legacy_actividad_id",
      legacy_actividad_id: `eq.${cleanActividadId}`,
      limit: 1,
    }),
    selectAll(connection, "compradores", {
      select: "id,comprador,comprador_id,division",
      comprador: `eq.${cleanComprador}`,
      limit: 1,
    }),
    selectAll(connection, "jerarquia_categorias", { order: "dep_id.asc" }),
  ]);

  const campana = Array.isArray(campanas) ? campanas[0] : null;
  const buyer = Array.isArray(compradores) ? compradores[0] : null;
  if (!campana?.id || !buyer?.id) return { promociones: [], promociones_detalle: [], comentarios: [] };

  const promociones = await selectAll(connection, "promociones", {
    campana_id: `eq.${campana.id}`,
    buyer_id: `eq.${buyer.id}`,
    tipo_promo: `eq.${cleanTipoPromo}`,
    order: "created_at.asc,id.asc",
  });
  const promotionIds = promociones.map((item) => item.id).filter(Boolean);
  const [detalles, comentarios] = await Promise.all([
    promotionIds.length
      ? selectRowsByValues(connection, "promociones_detalle", "promocion_id", promotionIds, "*", STABLE_PAGED_READ)
      : [],
    promotionIds.length
      ? selectRowsByValues(connection, "comentarios", "promocion_id", promotionIds, "*", STABLE_PAGED_READ)
      : [],
  ]);
  detalles.sort((left, right) => String(left.created_at || "").localeCompare(String(right.created_at || "")));
  comentarios.sort((left, right) => String(left.fecha || left.created_at || "").localeCompare(String(right.fecha || right.created_at || "")));

  const compradorById = keyBy([buyer], "id");
  const campanaById = keyBy([campana], "id");
  const promoById = keyBy(promociones, "id");
  const hierarchyByDepId = buildHierarchyByDepId(jerarquias);

  return {
    promociones: promociones.map((item) => toPromotionRow(item, campanaById, compradorById, hierarchyByDepId)),
    promociones_detalle: detalles.map((item) => {
      const promo = promoById[item.promocion_id] || {};
      const currentCampana = campanaById[promo.campana_id] || {};
      return {
        detalle_id: item.id,
        row_id: promo.legacy_row_id || "",
        actividad_id: currentCampana.legacy_actividad_id || "",
        oferta_id: promo.oferta_id || "",
        grupo_oferta: promo.grupo_oferta || "",
        tipo_promo: promo.tipo_promo || "",
        campo: item.campo,
        valor: item.valor,
      };
    }),
    comentarios: comentarios.map((item) => {
      const promo = promoById[item.promocion_id] || {};
      const currentCampana = campanaById[promo.campana_id] || {};
      return {
        comentario_id: item.legacy_comentario_id || item.id,
        actividad_id: currentCampana.legacy_actividad_id || "",
        row_id: item.legacy_row_id || promo.legacy_row_id || "",
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
  };
}

async function loadOptionalView(connection, view, params = {}) {
  try {
    return await selectAll(connection, view, params);
  } catch {
    // La vista aun no existe en esta base (script SQL pendiente): la pantalla usa su respaldo.
    return [];
  }
}

/**
 * Promociones, detalle y comentarios de un conjunto de campañas (uuid).
 * Detalle y comentarios de linea se filtran por campaña uniendo con promociones;
 * si la union no esta disponible, se usa el camino anterior (por promocion).
 */
async function loadPromotionBlock(connection, timer, campanaIds) {
  if (!campanaIds.length) return { promociones: [], detalles: [], comentarios: [] };
  const loadByCampaignJoin = (table) => selectRowsByValues(connection, table, "promociones.campana_id", campanaIds, "*,promociones!inner(campana_id)", STABLE_PAGED_READ)
    .then((rows) => rows.map(({ promociones: _join, ...row }) => row));

  const [promociones, joined] = await Promise.all([
    timer.track("promociones", () => selectRowsByValues(connection, "promociones", "campana_id", campanaIds, "*", STABLE_PAGED_READ)),
    Promise.all([
      timer.track("promociones_detalle", () => loadByCampaignJoin("promociones_detalle")),
      timer.track("comentarios (línea)", () => loadByCampaignJoin("comentarios")),
      timer.track("comentarios (actividad)", () => selectRowsByValues(connection, "comentarios", "campana_id", campanaIds, "*", STABLE_PAGED_READ)),
    ]).catch((error) => {
      if (typeof console !== "undefined") console.warn("[carga] Union por campaña no disponible; se usa la carga por promocion.", error);
      return null;
    }),
  ]);

  let detalles;
  let lineComments;
  let activityComments;
  if (joined) {
    [detalles, lineComments, activityComments] = joined;
  } else {
    const promotionIds = promociones.map((item) => item.id).filter(Boolean);
    [detalles, lineComments, activityComments] = await timer.phase("Ronda 3 (respaldo por promoción)", () => Promise.all([
      timer.track("promociones_detalle (respaldo)", () => (promotionIds.length
        ? selectRowsByValues(connection, "promociones_detalle", "promocion_id", promotionIds, "*", STABLE_PAGED_READ)
        : [])),
      timer.track("comentarios línea (respaldo)", () => (promotionIds.length
        ? selectRowsByValues(connection, "comentarios", "promocion_id", promotionIds, "*", STABLE_PAGED_READ)
        : [])),
      timer.track("comentarios actividad (respaldo)", () => selectRowsByValues(connection, "comentarios", "campana_id", campanaIds, "*", STABLE_PAGED_READ)),
    ]));
  }

  const comentariosById = new Map();
  [...lineComments, ...activityComments].forEach((item) => {
    if (item?.id) comentariosById.set(item.id, item);
  });
  return { promociones, detalles, comentarios: Array.from(comentariosById.values()) };
}

/** Convierte promociones, detalle y comentarios de Supabase al formato de la app. */
function mapPromotionBlock({ promociones, detalles, comentarios }, { campanaById, compradorById, hierarchyByDepId }) {
  const sortedPromos = [...promociones].sort((left, right) => String(left.created_at || "").localeCompare(String(right.created_at || "")));
  const sortedDetails = [...detalles].sort((left, right) => String(left.created_at || "").localeCompare(String(right.created_at || "")));
  const sortedComments = [...comentarios].sort((left, right) => String(left.fecha || left.created_at || "").localeCompare(String(right.fecha || right.created_at || "")));
  const promoById = keyBy(promociones, "id");
  return {
    promociones: sortedPromos.map((item) => toPromotionRow(item, campanaById, compradorById, hierarchyByDepId)),
    promociones_detalle: sortedDetails.map((item) => {
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
    comentarios: sortedComments.map((item) => {
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
  };
}

/**
 * Carga inicial. Con `includePromotions: false` (carga por campaña) no trae promociones,
 * detalle ni comentarios: devuelve listas vacias y los resumenes que usa Inicio.
 * Cada pantalla pide despues sus campañas con loadCampaignsFromSupabase.
 */
export async function loadCatalogFromSupabase(connection, { includePromotions = true } = {}) {
  const timer = createLoadTimer(includePromotions ? "datos operativos" : "datos operativos (carga por campaña)");
  const [
    compradores,
    allCampanas,
    segmentos,
    responsables,
    jerarquias,
    config,
  ] = await timer.phase("Ronda 1 (maestros y campañas)", () => Promise.all([
    timer.track("compradores", () => selectAll(connection, "compradores", { order: "comprador.asc" })),
    timer.track("campañas abiertas", () => loadOpenCampanas(connection)),
    timer.track("segmentos_clientes", () => selectAll(connection, "segmentos_clientes", { order: "orden.asc" })),
    timer.track("responsables_solicitudes", () => selectAll(connection, "responsables_solicitudes", { order: "nombre.asc" })),
    timer.track("jerarquia_categorias", () => selectAll(connection, "jerarquia_categorias", { order: "dep_id.asc" })),
    timer.track("configuracion", () => selectAll(connection, "configuracion")),
  ]));

  const campanas = allCampanas || [];
  const campanaIds = campanas.map((item) => item.id).filter(Boolean);

  const [avances, notificaciones, catalogoResumen, comentariosActividad, block] = await timer.phase(
    includePromotions ? "Rondas 2 y 3 (en paralelo)" : "Ronda 2 (resumenes)",
    () => Promise.all([
      timer.track("avances_catalogo", () => (campanaIds.length
        ? selectRowsByValues(connection, "avances_catalogo", "campana_id", campanaIds)
        : [])),
      timer.track("notificaciones", () => (campanaIds.length
        ? selectRowsByValues(connection, "notificaciones", "campana_id", campanaIds)
        : [])),
      timer.track("v_catalogo_resumen", () => loadCatalogSummary(connection)),
      includePromotions ? [] : timer.track("v_comentarios_actividad_abiertos", () => loadOptionalView(connection, "v_comentarios_actividad_abiertos")),
      includePromotions
        ? loadPromotionBlock(connection, timer, campanaIds)
        : { promociones: [], detalles: [], comentarios: [] },
    ]),
  );

  const compradorById = keyBy(compradores, "id");
  const campanaById = keyBy(campanas, "id");
  const hierarchyByDepId = buildHierarchyByDepId(jerarquias);
  const mapped = mapPromotionBlock(block, { campanaById, compradorById, hierarchyByDepId });

  const result = {
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
    catalogo_resumen: catalogoResumen,
    comentarios_actividad_abiertos: comentariosActividad,
    compradores,
    responsables_solicitudes: responsables,
    jerarquia_categorias: jerarquias,
    ...mapped,
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
    notificaciones: notificaciones.map((item) => ({
      actividad_id: campanaById[item.campana_id]?.legacy_actividad_id || "",
      correo: item.correo,
      activo: item.activo,
    })),
  };
  timer.finish();
  return result;
}

/** Totales por campaña para Seguimiento (vista v_seguimiento_resumen, paso 40). */
export function loadSeguimientoResumenFromSupabase(connection) {
  return loadOptionalView(connection, "v_seguimiento_resumen");
}

/**
 * Carga por campaña: promociones, detalle y comentarios solo de las actividades pedidas
 * (IDs de actividad de la app, p. ej. "CAT-2026-10"). `actividades` del resultado lista
 * las que existen en Supabase; una actividad nueva sin guardar no aparece y no se toca.
 */
export async function loadCampaignsFromSupabase(connection, actividadIds = []) {
  const ids = Array.from(new Set((actividadIds || []).map((value) => String(value || "").trim()).filter(Boolean)));
  if (!ids.length) return { actividades: [], promociones: [], promociones_detalle: [], comentarios: [] };
  const timer = createLoadTimer(`campañas ${ids.join(", ")}`);
  const [campanas, compradores, jerarquias] = await timer.phase("Campañas y maestros", () => Promise.all([
    timer.track("campanas", () => selectRowsByValues(connection, "campanas", "legacy_actividad_id", ids, "id,legacy_actividad_id")),
    timer.track("compradores", () => selectAll(connection, "compradores", { select: "id,comprador,comprador_id,division", order: "comprador.asc" })),
    timer.track("jerarquia_categorias", () => selectAll(connection, "jerarquia_categorias", { order: "dep_id.asc" })),
  ]));
  const campanaIds = campanas.map((item) => item.id).filter(Boolean);
  const block = await timer.phase("Promociones de las campañas", () => loadPromotionBlock(connection, timer, campanaIds));
  const mapped = mapPromotionBlock(block, {
    campanaById: keyBy(campanas, "id"),
    compradorById: keyBy(compradores, "id"),
    hierarchyByDepId: buildHierarchyByDepId(jerarquias),
  });
  timer.finish();
  return {
    actividades: campanas.map((item) => String(item.legacy_actividad_id || "").trim()).filter(Boolean),
    ...mapped,
  };
}

export async function loadLogsFromSupabase(connection, options = {}) {
  const pageSize = Math.max(10, Math.min(100, Number(options.pageSize || 25)));
  const page = Math.max(1, Number(options.page || 1));
  const offset = (page - 1) * pageSize;
  const logs = await selectAll(connection, "logs", {
    select: "id,created_at,usuario,rol,entidad,entidad_id,registro,campana_id,promocion_id,accion,campo,valor_anterior,valor_nuevo,request_id,operation_id,origen,contexto,fecha_cierre",
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
        rol: item.rol || "",
        entidad: item.entidad || "",
        entidad_id: item.entidad_id || "",
        registro: item.registro || "",
        catalogo: campana.legacy_actividad_id || "",
        accion: item.accion,
        row_id: promo.legacy_row_id || "",
        campo: item.campo,
        valor_anterior: item.valor_anterior,
        valor_nuevo: item.valor_nuevo,
        operation_id: item.operation_id || "",
        origen: item.origen || "",
        contexto: item.contexto || {},
        fecha_cierre: item.fecha_cierre || "",
      };
    }),
  };
}
