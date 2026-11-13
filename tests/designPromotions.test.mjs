import assert from "node:assert/strict";
import { test } from "node:test";
import { getDesignCatalogPromotions, getDesignPagePromotions, getDesignPromoPage } from "../src/features/catalogDesign/designPromotions.js";

const rows = [
  { id: "other-page", catalogo_id: "A", sku: "123", numero_pagina: 6 },
  { id: "other-catalog", catalogo_id: "B", sku: "123", numero_pagina: 5 },
  { id: "unassigned", actividad_id: "A", sku: "123" },
  { id: "current", actividadId: "A", sku: "123", numPagina: "05" },
  { id: "second-offer", catalogoId: "A", sku: "123", num_pagina: 5 },
  { id: "partial", catalogo_id: "A", sku: "1234", numero_pagina: 5 },
  { id: "no-catalog", sku: "123", numero_pagina: 5 },
];
const ids = (list) => list.map((row) => row.id);

test("catalog scope excludes other catalogs and unassociated rows, including empty results", () => {
  assert.deepEqual(ids(getDesignCatalogPromotions(rows, " A ")), ["other-page", "unassigned", "current", "second-offer", "partial"]);
  for (const catalog of ["missing", "", undefined]) assert.deepEqual(getDesignCatalogPromotions(rows, catalog), []);
});

// Comportamiento actual de la vista de diseño: primero las promociones de la página y luego el resto
// del catálogo ("asociadas a esta página + catálogo"), recortando el resto con el límite de "ver más".
test("without a query, page promotions come first followed by the rest of the catalog", () => {
  const scoped = getDesignCatalogPromotions(rows, "A");
  assert.deepEqual(ids(getDesignPagePromotions(scoped, 5)), ["current", "second-offer", "partial", "other-page", "unassigned"]);
  assert.deepEqual(ids(getDesignPagePromotions(scoped, "6")), ["other-page", "unassigned", "current", "second-offer", "partial"]);
  // Sin códigos asociados a la página: se muestran las promociones del catálogo en edición.
  assert.deepEqual(ids(getDesignPagePromotions(scoped, 7)), ids(scoped));
  assert.deepEqual(ids(getDesignPagePromotions(scoped, undefined)), ids(scoped));
  assert.deepEqual(getDesignPagePromotions([], 5), []);
  // El límite recorta solo las de otras páginas; las de la página siempre se muestran completas.
  assert.deepEqual(ids(getDesignPagePromotions(scoped, 6, "", 2)), ["other-page", "unassigned", "current"]);
  const many = Array.from({ length: 25 }, (_, id) => ({ id, numero_pagina: 5 }));
  assert.equal(getDesignPagePromotions(many, 5, "", 10).length, 25);
});

test("SKU search prioritizes current page, includes prefix matches and respects the limit for other pages", () => {
  const scoped = getDesignCatalogPromotions(rows, "A");
  assert.deepEqual(ids(getDesignPagePromotions(scoped, 5, " 123 ")), ["current", "second-offer", "partial", "other-page", "unassigned"]);
  assert.deepEqual(ids(getDesignPagePromotions(scoped, 6, "123")), ["other-page", "unassigned", "current", "second-offer", "partial"]);
  assert.deepEqual(ids(getDesignPagePromotions(scoped, 5, "12")), ["current", "second-offer", "partial", "other-page", "unassigned"]);
  assert.deepEqual(ids(getDesignPagePromotions(scoped, 6, "123", 1)), ["other-page", "unassigned"]);
  assert.deepEqual(getDesignPagePromotions(scoped, 5, "999"), []);
});

test("page aliases normalize numeric strings and reject invalid assignments", () => {
  assert.equal(getDesignPromoPage({ numero_pagina: "", num_pagina: " 05 " }), 5);
  assert.equal(getDesignPromoPage({ numPagina: 6 }), 6);
  for (const value of [undefined, "", " ", 0, -1, 1.5, "abc"]) {
    assert.equal(getDesignPromoPage({ numero_pagina: value }), null);
  }
});

// --- Agrupación por oferta (panel de SKU de Diseño) ---
import { buildDesignOffers, getDesignLineBenefit, getDesignOfferKey, getDesignOfferLabel, getDesignPageOffers } from "../src/features/catalogDesign/designPromotions.js";

const comboRows = [
  { id: "c1-reg", tipoPromo: "Combo", grupoOferta: "combo-1", tipoSku: "regalia", oferta_id: "OFE-A-combo-B1-combo-1", comprador_id: "B1", comprador: "Ana", sku: "900", descripcion: "Llave", numero_pagina: 3, descuento: "100%" },
  { id: "c1-pri", tipoPromo: "Combo", grupoOferta: "combo-1", tipoSku: "principal", oferta_id: "OFE-A-combo-B1-combo-1", comprador_id: "B1", comprador: "Ana", sku: "127292688", descripcion: "Cerradura digital", numero_pagina: 3, precioAhora: "4827" },
  { id: "c1-other-buyer", tipoPromo: "Combo", grupoOferta: "combo-1", tipoSku: "principal", oferta_id: "OFE-A-combo-combo-1", comprador_id: "B2", comprador: "Luis", sku: "555", numero_pagina: 8, precioAhora: "10" },
  { id: "c1-other-buyer-ben", tipoPromo: "Combo", grupoOferta: "combo-1", tipoSku: "beneficio", oferta_id: "OFE-A-combo-combo-1", comprador_id: "B2", comprador: "Luis", sku: "556", numero_pagina: 8, descuento: "20" },
  { id: "simple-1", tipoPromo: "Descuento", sku: "777", numero_pagina: 3, precioAhora: "90", descuento: "10%" },
  { id: "simple-2", tipoPromo: "Precio fijo", sku: "778", numero_pagina: 9, precioAhora: "50" },
];

test("complex promotions group by offer id + buyer; simple rows stay one card each", () => {
  const { offers } = buildDesignOffers(comboRows);
  assert.equal(offers.length, 4);
  assert.deepEqual(offers[0].lines.map((r) => r.id), ["c1-pri", "c1-reg"], "principal first");
  assert.deepEqual(offers[1].lines.map((r) => r.id), ["c1-other-buyer", "c1-other-buyer-ben"], "same combo-1 from another buyer is a separate offer");
  assert.notEqual(getDesignOfferKey(comboRows[0]), getDesignOfferKey(comboRows[2]));
  assert.equal(getDesignOfferLabel(comboRows[0]), "Combo 1");
  assert.equal(offers[0].buyer, "Ana");
});

test("search returns the whole offer once, marks matches and puts current-page offers first", () => {
  const { offers, total } = getDesignPageOffers(comboRows, 8, "cerradura");
  assert.equal(total, 1);
  assert.equal(offers[0].lines.length, 2);
  assert.deepEqual(Array.from(offers[0].matchedRows).map((r) => r.id), ["c1-pri"]);

  const both = getDesignPageOffers(comboRows, 3, "55").offers;
  assert.equal(both.length, 1, "two matching SKUs of the same combo -> one card");
  assert.equal(both[0].matchedRows.size, 2);

  const noQuery = getDesignPageOffers(comboRows, 3, "", 1);
  assert.deepEqual(noQuery.offers.map((o) => o.lines[0].id), ["c1-pri", "simple-1", "c1-other-buyer"], "page offers complete, others limited");
  assert.equal(noQuery.total, 4);
});

test("line benefit: discount promos hide Ahora, 100% or zero price is Regalía, fixed price unchanged", () => {
  assert.deepEqual(getDesignLineBenefit(comboRows[4]), { kind: "descuento", label: "Desc.", value: "10%" });
  assert.equal(getDesignLineBenefit(comboRows[0]).value, "Regalía");
  assert.equal(getDesignLineBenefit({ tipoPromo: "Combo", tipoSku: "regalia", precioAhora: "0" }).kind, "regalia");
  assert.deepEqual(getDesignLineBenefit(comboRows[3]), { kind: "descuento", label: "Desc.", value: "20%" });
  assert.deepEqual(getDesignLineBenefit(comboRows[5]), { kind: "precio", label: "Ahora", value: "50" });
  assert.deepEqual(getDesignLineBenefit(comboRows[1]), { kind: "precio", label: "Ahora", value: "4827" });
});
