const text = (value) => String(value ?? "").trim();
const header = (value) => text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ");
export const orceKey = (row) => `${row.canal}|${row.sku}|${row.segmento_id}`;

export const ORCE_STATUS_LABELS = {
  LISTO: "Listo para actualizar", ACTUALIZADO: "Actualizado", SIN_CAMBIO: "Sin cambios",
  CONFLICTO: "Conflicto en el reporte", INVALIDO: "Dato inválido",
  NO_ENCONTRADO: "Combinación no encontrada", DESCUENTO_DISTINTO: "Descuento diferente",
  CAMBIO_CONCURRENTE: "Cambió desde la vista previa",
};

function dateKey(value) {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : "";
}

// Modelo puro: el reporte nunca crea combinaciones ni cambia descuentos.
export function parseOrceReportRows(rawRows, segments, today) {
  const required = ["id de oferta", "id de promo", "articulo", "detail change percent", "segmento"];
  const headerIndex = rawRows.findIndex((row) => required.every((name) => row.some((cell) => header(cell) === name)));
  if (headerIndex < 0) throw new Error("El reporte debe contener Id de oferta, Id de promo, Articulo, Detail change percent y Segmento.");
  const names = rawRows[headerIndex].map(header);
  if (required.some((name) => names.filter((n) => n === name).length !== 1)) throw new Error("El reporte contiene encabezados duplicados.");
  const read = (row, name) => row[names.indexOf(name)];
  const catalog = new Map();
  segments.filter((s) => s.activo !== false).forEach((s) => {
    const id = text(s.segmento_id);
    const channels = catalog.get(id) || new Set();
    channels.add(text(s.canal).toLowerCase()); catalog.set(id, channels);
  });
  const groups = new Map();
  const invalid = [];
  let sourceRows = 0;
  for (let i = headerIndex + 1; i < rawRows.length; i++) {
    const raw = rawRows[i];
    // El reporte incluye una segunda línea de encabezado y filas vacías.
    if (required.every((name) => !text(read(raw, name)))) continue;
    sourceRows++;
    const segmentText = text(read(raw, "segmento"));
    const segmento_id = segmentText.match(/(?:^|\D)(\d+)\s*$/)?.[1] || "";
    const channels = catalog.get(segmento_id);
    const canal = channels?.size === 1 ? [...channels][0] : "";
    const row = { source_row: i + 1, sku: text(read(raw, "articulo")), segmento_id, canal,
      promo_id_orce: text(read(raw, "id de promo")), oferta_id_orce: text(read(raw, "id de oferta")), warnings: [] };
    const value = text(read(raw, "detail change percent")).replace(/%$/, "").trim().replace(",", ".");
    row.descuento = /^\d+(?:\.\d{1,2})?$/.test(value) ? Number(value) : NaN;
    const errors = [];
    if (!row.sku) errors.push("SKU vacío");
    if (!canal || !["comasa", "retail"].includes(canal)) errors.push("Segmento desconocido o canal ambiguo");
    const namedChannel = segmentText.match(/\b(comasa|retail)\b/i)?.[1].toLowerCase();
    if (namedChannel && canal && namedChannel !== canal) errors.push("El texto del segmento no coincide con su canal");
    if (!/^\d+$/.test(row.promo_id_orce) || !/^\d+$/.test(row.oferta_id_orce)) errors.push("IDs de promo/oferta inválidos");
    if (!Number.isFinite(row.descuento) || row.descuento < 0 || row.descuento > 100) errors.push("Descuento inválido (0–100, máximo dos decimales)");
    const type = text(read(raw, "tipo de descuento"));
    if (type && type.toUpperCase() !== "PERCENT_OFF") errors.push("El descuento no es porcentual");
    for (const [name, future] of [["fecha inicial", true], ["fecha final", false]]) {
      const date = dateKey(read(raw, name));
      if (!date) row.warnings.push(`Sin ${name} válida`);
      else if (future ? date > today : date < today) row.warnings.push(future ? "Vigencia futura" : "Vigencia vencida");
    }
    row.message = errors.join(". ");
    row.status = errors.length ? "INVALIDO" : "LISTO";
    if (!row.sku || !canal) invalid.push(row);
    else {
      const key = orceKey(row);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
  }
  let duplicateCount = 0;
  const rows = [...invalid];
  groups.forEach((group) => {
    const signatures = new Set(group.map((r) => JSON.stringify([r.descuento, r.promo_id_orce, r.oferta_id_orce])));
    const bad = group.some((r) => r.status === "INVALIDO");
    const conflict = group.length > 1 && (bad || signatures.size > 1);
    const first = { ...group[0], source_rows: group.map((r) => r.source_row),
      warnings: [...new Set(group.flatMap((r) => r.warnings))] };
    if (conflict) {
      first.status = "CONFLICTO";
      first.message = `Filas ${first.source_rows.join(", ")}: descuentos, IDs contradictorios o datos inválidos. No se actualizará esta combinación.`;
    } else if (!bad) duplicateCount += group.length - 1;
    rows.push(first);
  });
  return { rows: rows.sort((a, b) => a.source_row - b.source_row), sourceRows, duplicateCount };
}

export function buildOrcePreview(report, canasto) {
  const current = new Map(canasto.map((row) => [orceKey(row), row]));
  return { ...report, rows: report.rows.map((row) => {
    if (row.status !== "LISTO") return row;
    const match = current.get(orceKey(row));
    if (!match) return { ...row, status: "NO_ENCONTRADO" };
    if (Number(match.descuento) !== row.descuento) return { ...row, status: "DESCUENTO_DISTINTO", message: `Descuento del canasto: ${match.descuento}%` };
    const desiredStatus = row.descuento === 0 ? "NO_APLICA" : "CONCILIADO";
    const same = match.promo_id_orce === row.promo_id_orce && match.oferta_id_orce === row.oferta_id_orce && match.estado_conciliacion_orce === desiredStatus;
    return { ...row, revision_esperada: match.revision_orce ?? null, status: same ? "SIN_CAMBIO" : "LISTO" };
  }) };
}

export function orceStatusLabel(row) {
  if (Number(row.descuento) === 0) return "Inactivo · IDs conservados";
  return row.estado_conciliacion_orce === "CONCILIADO" ? "Conciliado" : "Pendiente de conciliación";
}
