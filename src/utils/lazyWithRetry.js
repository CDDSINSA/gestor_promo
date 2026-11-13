import React from "react";

// Tras un nuevo despliegue en Vercel, los chunks con hash anterior dejan de existir.
// Una pestaña abierta con la versión vieja falla al importar un módulo diferido
// ("error loading dynamically imported module" / "Failed to fetch dynamically imported module").
// En ese caso recargamos la página una sola vez para obtener el index.html nuevo.

const RELOAD_KEY = "gc:chunk-reload-at";
const RELOAD_WINDOW_MS = 30_000;

export function isChunkLoadError(error) {
  const message = String(error?.message || error || "");
  return /dynamically imported module|Importing a module script failed|Failed to fetch dynamically|error loading dynamically|ChunkLoadError|Unable to preload CSS/i.test(message);
}

function readLastReload() {
  try {
    return Number(window.sessionStorage.getItem(RELOAD_KEY)) || 0;
  } catch {
    return 0;
  }
}

// Devuelve true si se disparó la recarga; false si ya se intentó hace poco (evita bucles).
export function reloadOnceForNewVersion() {
  if (typeof window === "undefined") return false;
  if (Date.now() - readLastReload() < RELOAD_WINDOW_MS) return false;
  try {
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // sin sessionStorage: recargamos igual, el guard por tiempo no aplica
  }
  window.location.reload();
  return true;
}

export function lazyWithRetry(importer) {
  return React.lazy(async () => {
    try {
      return await importer();
    } catch (error) {
      if (isChunkLoadError(error) && reloadOnceForNewVersion()) {
        // Mantiene el Suspense en "cargando" mientras el navegador recarga.
        return new Promise(() => {});
      }
      throw error;
    }
  });
}
