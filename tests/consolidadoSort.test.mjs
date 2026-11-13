import assert from "node:assert/strict";
import { test } from "node:test";

// El Consolidado cambió localeCompare(..., "es", opciones) por un Intl.Collator compartido.
// Deben ordenar igual.
test("Intl.Collator ordena igual que localeCompare con las mismas opciones", () => {
  const values = ["Catálogo 10", "catalogo 2", "Árbol", "arbol", "B-100", "b-20", "", "Ñandú", "nandu", "Zeta", "SKU 0012", "sku 12"];
  const options = { numeric: true, sensitivity: "base" };
  const collator = new Intl.Collator("es", options);
  const byLocale = [...values].sort((a, b) => a.localeCompare(b, "es", options));
  const byCollator = [...values].sort((a, b) => collator.compare(a, b));
  assert.deepEqual(byCollator, byLocale);
});
