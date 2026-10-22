const DAY_MS = 86400000;
export const CATALOG_TIME_ZONE = "America/Managua";

const PROFILES = {
  general: { id: "general", label: "General", offsets: [22, 12, 7] },
  short: { id: "short", label: "Galerón / Ferrex", offsets: [16, 10, 6] },
};

// Date-only arithmetic avoids UTC/local parsing shifts and daylight-saving changes.
function dayNumber(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const milliseconds = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString().slice(0, 10) !== value) return null;
  return milliseconds / DAY_MS;
}

export function catalogToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CATALOG_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function getCatalogProfiles(channel) {
  const channels = String(channel || "").split(/[;|,]/).map((value) => value.trim()).filter(Boolean);
  const ids = channels.map((value) => {
    const key = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return ["galeron", "galerones", "ferrex"].includes(key) ? "short" : "general";
  });
  return [...new Set(ids)].map((id) => PROFILES[id]);
}

export function getCatalogSchedules(catalog, today = catalogToday()) {
  const start = dayNumber(catalog.vigencia_inicio);
  const current = dayNumber(today);
  const end = dayNumber(catalog.vigencia_fin);
  if (start === null || current === null || (catalog.vigencia_fin && end === null) || (end !== null && end < start)) return [];
  return getCatalogProfiles(catalog.canal).map((profile) => {
    const milestones = ["Preliminar", "Precios finales", "Entrega a imprenta", "Inicio de vigencia"].map((label, index) => {
      const day = start - (profile.offsets[index] || 0);
      return { label, date: new Date(day * DAY_MS).toISOString().slice(0, 10), days: day - current };
    });
    // A passed deadline is not a confirmed delivery. Only the next calendar cut is shown.
    const next = milestones.find((milestone) => milestone.days >= 0);
    const message = next
      ? next.days === 0 ? "Hoy" : `Falta${next.days === 1 ? "" : "n"} ${next.days} día${next.days === 1 ? "" : "s"}`
      : end !== null && current > end ? "Vigencia finalizada" : "Vigencia iniciada";
    return {
      profile, milestones, next, message,
      tone: next ? next.days <= 2 ? "urgent" : next.days <= 5 ? "soon" : "neutral" : "neutral",
    };
  });
}

export function formatCatalogDate(value) {
  return new Intl.DateTimeFormat("es-NI", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}
