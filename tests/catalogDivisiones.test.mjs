import assert from "node:assert/strict";
import { test } from "node:test";
import { getCatalogosSinDivisiones, stripCatalogDraftFlags } from "../src/features/catalogSettings/catalogDivisiones.js";

test("Un catálogo sin divisiones no se puede guardar; Todas ([]) sí", () => {
  const catalogos = [
    { id: "a", nombre: "Todas", divisiones: [] },
    { id: "b", nombre: "Nuevo", divisiones: [], divisionesPendientes: true },
    { id: "c", nombre: "Algunas", divisiones: ["Ferreteria"], divisionesPendientes: false },
  ];
  assert.deepEqual(getCatalogosSinDivisiones(catalogos).map((cat) => cat.id), ["b"]);
});

test("La marca de pantalla no se guarda", () => {
  const saved = stripCatalogDraftFlags([{ id: "c", divisiones: ["X"], divisionesPendientes: false }, { id: "d", divisiones: [] }]);
  assert.deepEqual(saved, [{ id: "c", divisiones: ["X"] }, { id: "d", divisiones: [] }]);
});
