import assert from "node:assert/strict";
import { test } from "node:test";
import {
  collectActivityIds,
  describeCampaignTypes,
  getModuleCampaignScope,
  getPendingCampaignIds,
  isCampaignLoadingEnabled,
  replaceActivityItems,
} from "../src/app/sync/campaignLoading.js";
import { buildSeguimientoItems } from "../src/features/seguimiento/ganttModel.js";

test("bandera: apagada por defecto; env y localStorage la controlan", () => {
  assert.equal(isCampaignLoadingEnabled({ env: undefined, override: null }), false);
  assert.equal(isCampaignLoadingEnabled({ env: "true", override: null }), true);
  assert.equal(isCampaignLoadingEnabled({ env: "true", override: "off" }), false);
  assert.equal(isCampaignLoadingEnabled({ env: "false", override: "on" }), true);
});

test("cada modulo pide solo lo que usa", () => {
  const cat = { id: "CAT-1" };
  assert.deepEqual(getModuleCampaignScope("promos", { catalogoActivo: cat }), { type: "campaigns", ids: ["CAT-1"] });
  assert.deepEqual(getModuleCampaignScope("promos", {}), { type: "none" });
  assert.deepEqual(getModuleCampaignScope("avances", { catalogoAvanceActivo: cat }), { type: "campaigns", ids: ["CAT-1"] });
  assert.equal(getModuleCampaignScope("solicitudes").type, "especiales");
  assert.equal(getModuleCampaignScope("especial").type, "especiales");
  assert.equal(getModuleCampaignScope("export").type, "all");
  for (const module of ["home", "seguimiento", "catalogDesign", "margenes", "logs", "fidelizacion", "consolidado", "ajustes", "consulta"]) assert.equal(getModuleCampaignScope(module).type, "none");
});

test("el aviso de carga dice que tipo de actividades se cargan", () => {
  const actividades = [
    ...Array.from({ length: 7 }, (_, i) => ({ actividad_id: `CAT-${i}`, tipo_actividad: "CATALOGO" })),
    { actividad_id: "ESP-1", tipo_actividad: "ESPECIAL" },
  ];
  assert.equal(describeCampaignTypes(actividades.map((a) => a.actividad_id), actividades), "7 catálogos y 1 solicitud especial");
  assert.equal(describeCampaignTypes(["CAT-0", "CAT-1"], actividades), "2 catálogos");
});

test("pendientes: sin repetidos ni ya cargadas", () => {
  assert.deepEqual(getPendingCampaignIds(["A", "B", "A", " ", "C"], new Set(["B"])), ["A", "C"]);
});

test("reemplazar filas de una actividad deja intactas las demas", () => {
  const rows = [{ actividadId: "A", id: 1 }, { actividad_id: "B", id: 2 }, { actividadId: "A", id: 3 }];
  const next = replaceActivityItems(rows, new Set(["A"]), [{ actividadId: "A", id: 9 }]);
  assert.deepEqual(next.map((row) => row.id), [2, 9]);
  assert.deepEqual(Array.from(collectActivityIds(next)).sort(), ["A", "B"]);
});

test("Seguimiento usa el resumen del servidor solo para actividades sin filas en memoria", () => {
  const actividades = [
    { actividad_id: "CAT-1", nombre_actividad: "Uno", comprador: "" },
    { actividad_id: "CAT-2", nombre_actividad: "Dos", comprador: "" },
  ];
  const rows = [{ actividad_id: "CAT-1", comprador: "Ana", tipo_promo: "Descuento", sku: "1", oferta_id: "O1" }];
  const resumen = [
    { actividad_id: "CAT-1", compradores: ["Otro"], tipos_promo: ["Combo"], tiendas: [], segmentos: [], skus_count: 50, ofertas_count: 9, promociones_count: 60 },
    { actividad_id: "CAT-2", compradores: ["Luis"], tipos_promo: ["Combo"], tiendas: ["T01"], segmentos: ["Mayoristas"], skus_count: 700, ofertas_count: 40, promociones_count: 720 },
  ];
  const items = buildSeguimientoItems({ actividades, rows, catalogos: [], resumen });
  const uno = items.find((item) => item.id === "CAT-1");
  const dos = items.find((item) => item.id === "CAT-2");
  assert.deepEqual(uno.compradores, ["Ana"]);
  assert.equal(uno.rowCount, 1);
  assert.deepEqual(dos.compradores, ["Luis"]);
  assert.deepEqual(dos.tiendas, ["T01"]);
  assert.equal(dos.skuCount, 700);
  assert.equal(dos.offerCount, 40);
  assert.equal(dos.rowCount, 720);
  const sinResumen = buildSeguimientoItems({ actividades, rows, catalogos: [] }).find((item) => item.id === "CAT-2");
  assert.equal(sinResumen.rowCount, 0);
});
