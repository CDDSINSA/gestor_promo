export const ACTIVITY_SUGGESTION_LIMIT = 30;

export function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Coincidencias de actividades/catálogos para el autocompletado.
 * Busca por nombre o ID, sin acentos ni mayúsculas, y con todas las palabras escritas
 * en cualquier orden. Primero las que empiezan con el texto, luego las que lo contienen.
 */
export function matchActivityOptions(options = [], query = "", { tipoActividad = "Todos", limit = ACTIVITY_SUGGESTION_LIMIT } = {}) {
  const words = normalizeSearchText(query).split(" ").filter(Boolean);
  if (!words.length) return [];
  const phrase = words.join(" ");
  return options
    .filter((item) => !tipoActividad || tipoActividad === "Todos" || item.tipo === tipoActividad)
    .map((item) => {
      const name = normalizeSearchText(item.nombre);
      const id = normalizeSearchText(item.id);
      const haystack = `${name} ${id}`;
      if (!words.every((word) => haystack.includes(word))) return null;
      const rank = id === phrase ? 0 : name.startsWith(phrase) || id.startsWith(phrase) ? 1 : haystack.includes(phrase) ? 2 : 3;
      return { item, rank };
    })
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank || a.item.nombre.localeCompare(b.item.nombre, "es"))
    .slice(0, limit)
    .map(({ item }) => item);
}
