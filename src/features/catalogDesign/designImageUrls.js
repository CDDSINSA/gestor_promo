export const DESIGN_URL_TTL_SECONDS = 3600;

export function createDesignImageUrlCache(sign, now = Date.now) {
  const entries = new Map();
  return async (path) => {
    const entry = entries.get(path);
    if (entry && now() < entry.renewAt) return entry.expiresAt > now() ? entry : { ...entry, url: "" };
    const requestedAt = now();
    try {
      const url = await sign(path, DESIGN_URL_TTL_SECONDS);
      if (!url) throw new Error("No se recibió el enlace de la imagen.");
      const next = { url, error: "", renewAt: requestedAt + (DESIGN_URL_TTL_SECONDS - 300) * 1000, expiresAt: requestedAt + DESIGN_URL_TTL_SECONDS * 1000 };
      entries.set(path, next);
      return next;
    } catch {
      const next = { url: entry?.expiresAt > now() ? entry.url : "", error: "No se pudo renovar la imagen. Revise la conexión o sus permisos.", renewAt: now() + 60000, expiresAt: entry?.expiresAt || 0 };
      entries.set(path, next);
      return next;
    }
  };
}
