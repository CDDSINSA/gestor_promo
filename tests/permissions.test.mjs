import assert from "node:assert/strict";
import { test } from "node:test";
import { PERMISSIONS, ROLES, roleHasPermission } from "../src/constants/permissions.js";

test("Ejecutor changes status without general request management or bulk synchronization", () => {
  assert.equal(roleHasPermission(ROLES.OPER, PERMISSIONS.CHANGE_REQUEST_STATUS), true);
  assert.equal(roleHasPermission(ROLES.OPER, PERMISSIONS.MANAGE_SOLICITUDES), false);
  assert.equal(roleHasPermission(ROLES.OPER, PERMISSIONS.SYNC_SUPABASE), false);
  assert.equal(roleHasPermission(ROLES.ADMIN, PERMISSIONS.CHANGE_REQUEST_STATUS), true);
  assert.equal(roleHasPermission(ROLES.BUYER, PERMISSIONS.CHANGE_REQUEST_STATUS), false);
});

test("Ejecutor ve y exporta Consolidado y ve Consulta SKU, sin editar", () => {
  assert.equal(roleHasPermission(ROLES.OPER, PERMISSIONS.VIEW_CONSOLIDADO), true);
  assert.equal(roleHasPermission(ROLES.OPER, PERMISSIONS.VIEW_CONSULTA), true);
  assert.equal(roleHasPermission("PRICING", PERMISSIONS.VIEW_CONSOLIDADO), true);
  assert.equal(roleHasPermission(ROLES.OPER, PERMISSIONS.MANAGE_MARKETING_COMMENTS), false);
  assert.equal(roleHasPermission(ROLES.OPER, PERMISSIONS.EXPORT_CONSOLIDADO), true);
  assert.equal(roleHasPermission(ROLES.OPER, PERMISSIONS.EDIT_PROMOS), false);
});

test("Auditor no accede a Diseño de Catálogos; conserva Seguimiento y Logs", () => {
  assert.equal(roleHasPermission(ROLES.AUD, PERMISSIONS.VIEW_CATALOG_DESIGN), false);
  assert.equal(roleHasPermission("AUDITOR", PERMISSIONS.VIEW_CATALOG_DESIGN), false);
  assert.equal(roleHasPermission(ROLES.AUD, PERMISSIONS.VIEW_SEGUIMIENTO), true);
  assert.equal(roleHasPermission(ROLES.AUD, PERMISSIONS.VIEW_LOGS), true);
});

test("Admin views Fidelizacion; only Comprador and Ejecutor create requests", () => {
  for (const role of [...Object.values(ROLES), "", "unknown", "PRICING", "PLANIMETRIA", "COMPRADOR"]) {
    const allowed = [ROLES.BUYER, ROLES.OPER, "PRICING", "PLANIMETRIA", "COMPRADOR"].includes(role);
    assert.equal(roleHasPermission(role, PERMISSIONS.VIEW_FIDELIZACION), allowed || role === ROLES.ADMIN, role);
    assert.equal(roleHasPermission(role, PERMISSIONS.MANAGE_FIDELIZACION), allowed, role);
  }
});

test("Promociones no aparece en el menú: se abre solo desde Inicio o Avances", async () => {
  const { MOBILE_NAV_ITEMS, NAV_PARENT_MODULE, SIDEBAR_NAV_ITEMS } = await import("../src/constants/ui.js");
  assert.equal(SIDEBAR_NAV_ITEMS.some((item) => item.id === "promos"), false);
  assert.equal(MOBILE_NAV_ITEMS.some((item) => item.id === "promos"), false);
  assert.equal(NAV_PARENT_MODULE.promos, "home");
});
