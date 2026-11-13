import assert from "node:assert/strict";
import { test } from "node:test";
import { PERMISSIONS, ROLES, roleHasPermission } from "../src/constants/permissions.js";
import { HOME_PROCESS_MODULE_IDS, getFirstName, getGreeting, getHomeModules, getRoleIntro } from "../src/features/home/homeModules.js";

const items = [
  { id: "ajustes", permission: PERMISSIONS.MANAGE_SETTINGS },
  { id: "home", permission: PERMISSIONS.VIEW_HOME },
  { id: "fidelizacion", permission: PERMISSIONS.VIEW_FIDELIZACION },
  { id: "consulta", permission: PERMISSIONS.VIEW_CONSULTA },
  { id: "solicitudes", permission: PERMISSIONS.VIEW_SOLICITUDES },
  { id: "seguimiento", permission: PERMISSIONS.VIEW_SEGUIMIENTO },
  { id: "logs", permission: PERMISSIONS.VIEW_LOGS },
];
const canFor = (role) => (permission) => roleHasPermission(role, permission);

test("Todos los roles tienen Inicio", () => {
  for (const role of Object.values(ROLES)) {
    assert.equal(roleHasPermission(role, PERMISSIONS.VIEW_HOME), true, role);
  }
});

test("Las tarjetas de módulos siguen los permisos del rol y nunca incluyen Inicio", () => {
  const aud = getHomeModules(items, canFor(ROLES.AUD)).map((item) => item.id);
  assert.deepEqual(aud, ["seguimiento", "logs"]);
  const oper = getHomeModules(items, canFor(ROLES.OPER)).map((item) => item.id);
  assert.deepEqual(oper, ["fidelizacion", "consulta", "solicitudes", "seguimiento"]);
  assert.ok(getHomeModules(items, canFor(ROLES.AUD))[0].description);
});

test("Con tarjetas de procesos, los accesos directos no repiten Fidelización ni Solicitudes", () => {
  const ids = getHomeModules(items, canFor(ROLES.ADMIN), { excludeIds: HOME_PROCESS_MODULE_IDS }).map((item) => item.id);
  assert.deepEqual(ids, ["ajustes", "consulta", "seguimiento", "logs"]);
});

test("Saludo según la hora y primer nombre del usuario", () => {
  assert.equal(getGreeting(new Date(2026, 9, 28, 8)), "Buenos días");
  assert.equal(getGreeting(new Date(2026, 9, 28, 14)), "Buenas tardes");
  assert.equal(getGreeting(new Date(2026, 9, 28, 20)), "Buenas noches");
  assert.equal(getFirstName({ nombre: "ARLEN AGUILAR" }), "Arlen");
  assert.equal(getFirstName({ email: "arlen.aguilar@sinsa.com.ni" }), "Arlen");
  assert.equal(getFirstName({}), "");
  assert.match(getRoleIntro("MERCADEO"), /diseño/);
  assert.ok(getRoleIntro("desconocido"));
});
