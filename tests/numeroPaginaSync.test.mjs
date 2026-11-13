import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";

// Carga módulos de src/ con imports sin extensión (como los resuelve Vite).
const context = createContext({ console, crypto: globalThis.crypto, Intl, Date });
const cache = new Map();
function resolveFile(specifier, parentUrl) {
  const base = fileURLToPath(new URL(specifier, parentUrl));
  for (const candidate of [base, `${base}.js`, `${base}.jsx`, `${base}/index.js`]) {
    if (/\.(js|jsx|mjs)$/.test(candidate) && existsSync(candidate)) return pathToFileURL(candidate).href;
  }
  throw new Error(`No se pudo resolver ${specifier} desde ${parentUrl}`);
}
async function load(url) {
  if (cache.has(url)) return cache.get(url);
  const module = new SourceTextModule(await readFile(new URL(url), "utf8"), { context, identifier: url });
  cache.set(url, module);
  return module;
}
// Paquetes de node_modules (p. ej. lucide-react) se cargan normal y se envuelven.
async function loadPackage(specifier) {
  if (cache.has(specifier)) return cache.get(specifier);
  const real = await import(specifier);
  const keys = Object.keys(real);
  const module = new SyntheticModule(keys, function () { for (const key of keys) this.setExport(key, real[key]); }, { context, identifier: specifier });
  cache.set(specifier, module);
  return module;
}
async function importSrc(relative) {
  const module = await load(new URL(relative, import.meta.url).href);
  if (module.status === "unlinked") await module.link((specifier, referencing) => specifier.startsWith(".")
    ? load(resolveFile(specifier, referencing.identifier))
    : loadPackage(specifier));
  if (module.status !== "evaluated") await module.evaluate();
  return module.namespace;
}

test("Cambiar el N° de página de una promoción guardada se detecta como cambio", async () => {
  const { getPromotionSyncSnapshot, getPromotionSyncSignature } = await importSrc("../src/app/sync/syncOptions.js");
  const { toAppRow, toExcelRow } = await importSrc("../src/utils/promoHelpers.js");
  const saved = toAppRow({ row_id: "R1", actividad_id: "CAT", sku: "100", numero_pagina: 1, tipo_promo: "Descuento", precio_ahora: 10 });
  const snapshot = getPromotionSyncSnapshot(saved);
  // Lo que hace la grilla al editar la celda (usePromos): actualiza los tres alias.
  const edited = toAppRow({ ...saved, numPagina: "3", numero_pagina: "3", num_pagina: "3" });
  assert.notEqual(getPromotionSyncSignature(toExcelRow(edited)), snapshot.signature);
  assert.equal(String(toExcelRow(edited).numero_pagina), "3");
  // Sin cambios, la firma es igual (no marca todo como modificado).
  assert.equal(getPromotionSyncSignature(toExcelRow(toAppRow({ ...saved }))), snapshot.signature);
});
