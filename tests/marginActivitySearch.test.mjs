import assert from "node:assert/strict";
import { test } from "node:test";
import { matchActivityOptions } from "../src/features/margins/marginActivitySearch.js";

const options = [
  { id: "CAT-1026-01", nombre: "Renueva y construye", tipo: "CATALOGO" },
  { id: "CAT-1126-01", nombre: "Navidad en casa", tipo: "CATALOGO" },
  { id: "ESP-1026-04", nombre: "Fin de semana de herramientas", tipo: "ESPECIAL" },
  { id: "ESP-1026-05", nombre: "Construcción pesada", tipo: "ESPECIAL" },
];

test("busca por nombre o ID sin acentos ni mayúsculas y con palabras en cualquier orden", () => {
  assert.deepEqual(matchActivityOptions(options, "construccion").map((item) => item.id), ["ESP-1026-05"]);
  assert.deepEqual(matchActivityOptions(options, "esp-1026").map((item) => item.id).sort(), ["ESP-1026-04", "ESP-1026-05"]);
  assert.deepEqual(matchActivityOptions(options, "semana herramientas").map((item) => item.id), ["ESP-1026-04"]);
  assert.deepEqual(matchActivityOptions(options, "herramientas semana").map((item) => item.id), ["ESP-1026-04"]);
});

test("prioriza coincidencias al inicio, respeta el tipo y el límite; texto vacío no sugiere", () => {
  assert.equal(matchActivityOptions(options, "constru")[0].id, "ESP-1026-05");
  assert.deepEqual(matchActivityOptions(options, "1026", { tipoActividad: "CATALOGO" }).map((item) => item.id), ["CAT-1026-01"]);
  assert.equal(matchActivityOptions(options, "a", { limit: 2 }).length, 2);
  assert.deepEqual(matchActivityOptions(options, "  "), []);
});
