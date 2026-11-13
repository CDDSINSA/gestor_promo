import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildInitialProject,
  buildPageTitle,
  clampZoom,
  formatSkuInfoValue,
  getCatalogoId,
  getPromoField,
  isCatalogoTrabajable,
} from "../src/features/catalogDesign/catalogDesignProject.js";
import {
  SIMPLE_PROMO_MODAL_TYPES,
  createSimplePromoDraft,
  getAuditUserLabel,
} from "../src/features/promotions/application/simplePromoDraft.js";

// Estas utilidades se movieron sin cambios desde CatalogDesignPage y PromosPage.

test("buildPageTitle arma el código de página con mes y año del catálogo", () => {
  assert.equal(buildPageTitle(3, { nombre: "BIF Octubre 2026" }), "Pag-3_BIF_OCT_26");
  assert.equal(buildPageTitle(1, { nombre: "Catalogo Diciembre 25" }), "Pag-1_CAT_DIC_25");
});

test("buildInitialProject usa el primer catálogo no cerrado", () => {
  const project = buildInitialProject([
    { id: "A", estado: "cerrado", nombre: "Viejo" },
    { id: "B", estado: "activo", nombre: "Nuevo" },
  ]);
  assert.equal(project.catalogo_id, "B");
  assert.equal(project.nombre_proyecto, "Diseño Nuevo");
  assert.equal(isCatalogoTrabajable({ catalogo_id: "X", estado: "Cerrado" }), false);
  assert.equal(getCatalogoId({ catalogo_id: " C1 " }), "C1");
});

test("clampZoom, getPromoField y formatSkuInfoValue", () => {
  assert.equal(clampZoom(10), 25);
  assert.equal(clampZoom(500), 220);
  assert.equal(getPromoField({ a: "", b: "valor" }, "a", "b"), "valor");
  assert.equal(formatSkuInfoValue(""), "Sin dato");
});

test("createSimplePromoDraft limita el tipo a los tipos simples", () => {
  assert.deepEqual(SIMPLE_PROMO_MODAL_TYPES, ["Descuento", "Precio fijo"]);
  assert.equal(createSimplePromoDraft("Precio fijo").tipoPromo, "Precio fijo");
  assert.equal(createSimplePromoDraft("Combo").tipoPromo, "Descuento");
  assert.deepEqual(createSimplePromoDraft("Descuento", "x").segmentos, []);
  assert.equal(getAuditUserLabel({ email: "a@b.com" }), "a@b.com");
});

test("normalizeTipoCantidad repara los valores dañados de tipo de cantidad", async () => {
  const { normalizeTipoCantidad, TIPOS_CANTIDAD } = await import("../src/features/promotions/application/tipoCantidad.js");
  assert.deepEqual(TIPOS_CANTIDAD, ["Exacta", "Mínimo"]);
  assert.equal(normalizeTipoCantidad("MÃ­nimo"), "Mínimo"); // "MÃ­nimo" que guardaba la grilla
  assert.equal(normalizeTipoCantidad("M\\u00ednimo"), "Mínimo"); // texto literal que guardaba el modal de promo simple
  assert.equal(normalizeTipoCantidad("minimo"), "Mínimo");
  assert.equal(normalizeTipoCantidad(" exacta "), "Exacta");
  assert.equal(normalizeTipoCantidad(""), "");
  assert.equal(normalizeTipoCantidad("Otro"), "Otro");
});
