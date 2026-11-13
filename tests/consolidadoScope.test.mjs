import assert from "node:assert/strict";
import { test } from "node:test";
import { CONSOLIDADO_DEFAULT_FILTERS, getConsolidadoCampaignIds, hasConsolidadoFilters } from "../src/features/consolidado/consolidadoScope.js";

const activities = [
  { actividad_id: "CAT-NAV", nombre_actividad: "Catálogo Navidad", tipo_actividad: "CATALOGO", canal: "Tiendas" },
  { actividad_id: "CAT-ESC", nombre_actividad: "Regreso a clases", tipo_actividad: "CATALOGO", canal: "Online" },
  { actividad_id: "ESP-1", nombre_actividad: "Solicitud ferretería", tipo_actividad: "ESPECIAL", canal: "", comprador: "Luis" },
];
const resumen = [
  { actividad_id: "CAT-NAV", comprador: "Ana", promociones_count: 700 },
  { actividad_id: "CAT-ESC", comprador: "Luis", promociones_count: 650 },
  { actividad_id: "CAT-ESC", comprador: "Ana", promociones_count: 0 },
];
const filters = (changes) => ({ ...CONSOLIDADO_DEFAULT_FILTERS, ...changes });

test("sin filtros no hay filtros activos", () => {
  assert.equal(hasConsolidadoFilters(filters({})), false);
  assert.equal(hasConsolidadoFilters(filters({ sku: " 123 " })), true);
});

test("actividad, tipo de actividad y canal reducen las campañas a cargar", () => {
  assert.deepEqual(getConsolidadoCampaignIds(filters({ actividadCatalogo: "navidad" }), activities), ["CAT-NAV"]);
  assert.deepEqual(getConsolidadoCampaignIds(filters({ tipoActividad: "ESPECIAL" }), activities), ["ESP-1"]);
  assert.deepEqual(getConsolidadoCampaignIds(filters({ canal: "Online" }), activities), ["CAT-ESC"]);
  assert.deepEqual(getConsolidadoCampaignIds(filters({ canal: "Sin canal" }), activities), ["ESP-1"]);
});

test("comprador usa el resumen del servidor y el comprador de la actividad", () => {
  assert.deepEqual(getConsolidadoCampaignIds(filters({ comprador: "Luis" }), activities, { resumen }), ["CAT-ESC", "ESP-1"]);
  assert.deepEqual(getConsolidadoCampaignIds(filters({ comprador: "Ana" }), activities, { resumen }), ["CAT-NAV"]);
  // Sin resumen no se puede descartar: se cargan todas.
  assert.equal(getConsolidadoCampaignIds(filters({ comprador: "Ana" }), activities, { resumen: [] }).length, 3);
});

test("filtros por linea no descartan campañas (se aplican despues)", () => {
  assert.equal(getConsolidadoCampaignIds(filters({ sku: "123", tipo: "Combo", alcance: "TIENDA" }), activities).length, 3);
});

test("una actividad elegida en la lista carga solo esa (ID exacto)", () => {
  const conIdParecido = [...activities, { actividad_id: "CAT-NAV-2", nombre_actividad: "Catálogo Navidad 2", tipo_actividad: "CATALOGO", canal: "Tiendas" }];
  assert.deepEqual(getConsolidadoCampaignIds(filters({ actividadCatalogo: "CAT-NAV" }), conIdParecido), ["CAT-NAV"]);
  // Texto libre sigue siendo "contiene".
  assert.deepEqual(getConsolidadoCampaignIds(filters({ actividadCatalogo: "navidad" }), conIdParecido), ["CAT-NAV", "CAT-NAV-2"]);
});
