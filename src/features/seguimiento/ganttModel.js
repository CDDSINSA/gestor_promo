const DAY_MS = 24 * 60 * 60 * 1000;

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function firstFilled(...values) {
  const match = values.find(hasValue);
  return match === undefined ? "" : match;
}

function parseDate(value) {
  if (!hasValue(value)) return null;
  const text = String(value).trim();
  const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const parsed = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  next.setHours(0, 0, 0, 0);
  return next;
}

function dayDiff(start, end) {
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

function uniqueValues(values) {
  const seen = new Set();
  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function formatShortDate(date) {
  if (!date) return "Sin fecha";
  return new Intl.DateTimeFormat("es-NI", { day: "2-digit", month: "short" }).format(date);
}

function formatLongDate(date) {
  if (!date) return "Sin fecha";
  return new Intl.DateTimeFormat("es-NI", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function getActivityId(activity) {
  return firstFilled(activity.actividad_id, activity.actividadId, activity.catalogo_id, activity.id);
}

function getRowActivityId(row) {
  return firstFilled(row.actividad_id, row.actividadId, row.catalogo_id, row.catalogoId);
}

function getActivityName(activity, catalogById) {
  const activityId = getActivityId(activity);
  const catalogo = catalogById.get(activityId) || {};
  return firstFilled(
    activity.nombre_actividad,
    activity.nombreActividad,
    activity.nombre,
    catalogo.nombre,
    activityId,
    "Actividad sin nombre"
  );
}

function getActivityType(activity) {
  return firstFilled(activity.tipo_actividad, activity.tipoActividad, "CATALOGO").toUpperCase();
}

function getActivityDates(activity, catalogById) {
  const activityId = getActivityId(activity);
  const catalogo = catalogById.get(activityId) || {};
  const start = parseDate(firstFilled(activity.fecha_inicio, activity.fechaInicio, catalogo.vigencia_inicio, catalogo.fecha_inicio));
  const end = parseDate(firstFilled(activity.fecha_fin, activity.fechaFin, catalogo.vigencia_fin, catalogo.fecha_fin));
  if (start && end && end < start) return { start: end, end: start, hasDates: true };
  return {
    start: start || end,
    end: end || start,
    hasDates: Boolean(start || end),
  };
}

function getRowBuyer(row) {
  return firstFilled(row.comprador, row.comprador_nombre, row.buyer);
}

function getActivityBuyer(activity) {
  return firstFilled(activity.comprador, activity.solicitante);
}

function getSegmentValue(row, activity) {
  const applies = firstFilled(row.aplica_segmento, row.aplicaSegmento, activity.aplica_segmento).toUpperCase();
  const segment = firstFilled(row.segmento_cliente, row.segmentoCliente, row.segmento, activity.segmento_cliente);
  if (applies === "SI" && segment) return segment;
  return segment && String(segment).toLowerCase() !== "todos" ? segment : "";
}

function getStoreValue(row, activity) {
  const scopeType = firstFilled(row.alcance_tipo, row.alcanceTipo, activity.alcance_tipo).toUpperCase();
  const scopeValue = firstFilled(row.alcance_valor, row.alcanceValor, activity.alcance_valor);
  if (["TIENDA", "TIENDAS", "SUCURSAL"].includes(scopeType)) return scopeValue;
  return "";
}

function buildFallbackActivities(catalogos = []) {
  return catalogos.map((catalogo) => ({
    ...catalogo,
    actividad_id: firstFilled(catalogo.id, catalogo.catalogo_id),
    nombre_actividad: catalogo.nombre,
    tipo_actividad: "CATALOGO",
    fecha_inicio: catalogo.vigencia_inicio,
    fecha_fin: catalogo.vigencia_fin,
  }));
}

export function buildSeguimientoItems({ actividades = [], rows = [], catalogos = [] }) {
  const catalogById = new Map(catalogos.map((catalogo) => [firstFilled(catalogo.id, catalogo.catalogo_id), catalogo]));
  const sourceActivities = actividades.length ? actividades : buildFallbackActivities(catalogos);
  const rowsByActivity = new Map();

  rows.forEach((row) => {
    const activityId = getRowActivityId(row);
    if (!activityId) return;
    if (!rowsByActivity.has(activityId)) rowsByActivity.set(activityId, []);
    rowsByActivity.get(activityId).push(row);
  });

  return sourceActivities
    .map((activity, index) => {
      const activityId = getActivityId(activity);
      const activityRows = rowsByActivity.get(activityId) || [];
      const dates = getActivityDates(activity, catalogById);
      const compradores = uniqueValues([getActivityBuyer(activity), ...activityRows.map(getRowBuyer)]);
      const tiposPromo = uniqueValues(activityRows.map((row) => firstFilled(row.tipoPromo, row.tipo_promo)));
      const tiendas = uniqueValues(activityRows.map((row) => getStoreValue(row, activity)));
      const segmentos = uniqueValues(activityRows.map((row) => getSegmentValue(row, activity)));
      const skus = uniqueValues(activityRows.map((row) => firstFilled(row.sku, row.SKU)));
      const ofertas = uniqueValues(activityRows.map((row) => firstFilled(row.ofertaId, row.oferta_id, row.grupoOferta, row.grupo_oferta)));

      return {
        id: activityId || `actividad-${index}`,
        name: getActivityName(activity, catalogById),
        type: getActivityType(activity),
        channel: firstFilled(activity.canal, catalogById.get(activityId)?.canal),
        status: firstFilled(activity.estado, "Borrador"),
        buyerLabel: compradores.length ? compradores.join(", ") : "Sin comprador",
        compradores,
        tiposPromo,
        tiendas,
        segmentos,
        skuCount: skus.length,
        offerCount: ofertas.length,
        rowCount: activityRows.length,
        start: dates.start,
        end: dates.end,
        hasDates: dates.hasDates,
      };
    })
    .sort((a, b) => {
      const aTime = a.start?.getTime() || Number.MAX_SAFE_INTEGER;
      const bTime = b.start?.getTime() || Number.MAX_SAFE_INTEGER;
      return aTime - bTime || a.name.localeCompare(b.name);
    });
}

export function buildTimelineModel(items = [], today = new Date()) {
  const datedItems = items.filter((item) => item.start && item.end);
  const todayDate = parseDate(today) || new Date();
  let minDate = datedItems.reduce((min, item) => !min || item.start < min ? item.start : min, null);
  let maxDate = datedItems.reduce((max, item) => !max || item.end > max ? item.end : max, null);

  if (!minDate || !maxDate) {
    minDate = addDays(todayDate, -7);
    maxDate = addDays(todayDate, 21);
  }

  minDate = addDays(minDate, -2);
  maxDate = addDays(maxDate, 2);
  const totalDays = Math.max(1, dayDiff(minDate, maxDate) + 1);
  const step = totalDays > 95 ? 7 : totalDays > 55 ? 3 : 1;
  const ticks = [];

  for (let offset = 0; offset < totalDays; offset += step) {
    const date = addDays(minDate, offset);
    ticks.push({
      key: date.toISOString(),
      label: step === 1 ? String(date.getDate()).padStart(2, "0") : formatShortDate(date),
      month: new Intl.DateTimeFormat("es-NI", { month: "short" }).format(date),
      isMonthStart: date.getDate() === 1 || offset === 0,
      gridColumn: `${offset + 1} / span ${Math.min(step, totalDays - offset)}`,
    });
  }

  const todayOffset = dayDiff(minDate, todayDate);

  return {
    start: minDate,
    end: maxDate,
    totalDays,
    ticks,
    todayOffset: todayOffset >= 0 && todayOffset < totalDays ? todayOffset : null,
    minWidth: Math.max(760, totalDays * 30),
  };
}

export function getItemGridPosition(item, timeline) {
  if (!item.start || !item.end) return { gridColumn: "1 / span 1", missing: true };
  const start = Math.max(0, dayDiff(timeline.start, item.start));
  const end = Math.min(timeline.totalDays - 1, dayDiff(timeline.start, item.end));
  return {
    gridColumn: `${start + 1} / span ${Math.max(1, end - start + 1)}`,
    missing: false,
  };
}

export function formatSeguimientoDateRange(item) {
  if (!item.hasDates) return "Sin fechas configuradas";
  return `${formatLongDate(item.start)} - ${formatLongDate(item.end)}`;
}

export function formatTimelineRange(timeline) {
  return `${formatShortDate(timeline.start)} - ${formatShortDate(timeline.end)}`;
}

export function getUniqueBuyers(items = []) {
  return uniqueValues(items.flatMap((item) => item.compradores));
}

export function getUniqueTypes(items = []) {
  return uniqueValues(items.map((item) => item.type));
}
