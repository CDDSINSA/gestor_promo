import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";
import * as permissions from "../src/constants/permissions.js";

async function service({ rpcError, rows = [] } = {}) {
  let localAccess = 0;
  const context = createContext({ console, localStorage: {
    getItem() { localAccess++; return "[]"; }, setItem() { localAccess++; },
  } });
  const stub = async (exports) => {
    const module = new SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
    await module.link(() => {}); await module.evaluate(); return module;
  };
  const http = await stub({
    callRpc: async () => { if (rpcError) throw rpcError; return { success: true }; },
    selectAll: async () => { if (rpcError) throw rpcError; return rows; },
  });
  const module = new SourceTextModule(await readFile(new URL("../src/services/fidelizacionService.js", import.meta.url), "utf8"), {
    context, importModuleDynamically: async () => http,
  });
  await module.link((name) => {
    if (name.includes("permissions")) return stub(permissions);
    if (name.includes("seedData")) return stub({ canastoFidelizacionInicial: [], segmentosClientesIniciales: [] });
    if (name.includes("excelService")) return stub({ loadXlsx: async () => {} });
    if (name.includes("promoHelpers")) return stub({ formatDateKey: () => "20260929" });
    if (name === "./supabase") return stub({ hasSupabaseConnection: () => true });
    throw new Error(name);
  });
  await module.evaluate();
  return { api: module.namespace, localAccess: () => localAccess };
}

const request = { actividadId: "FID-A", deltas: [{ sku: "A", segmento_id: "1002", descuento_anterior: 0, descuento_solicitado: 20, tipo_cambio: "NUEVO" }] };

test("Denied and failed remote Fidelizacion operations never fall back to local success", async () => {
  const denied = new Error("permission denied");
  const { api, localAccess } = await service({ rpcError: denied });
  for (const rol of ["ADMIN", "BUYER", "OPER"]) {
    const connection = { appUser: { rol } };
    await assert.rejects(api.loadCanastoFidelizacion(connection), denied);
    await assert.rejects(api.loadSolicitudFidelizacionDetalle(connection, "FID-A"), denied);
    await assert.rejects(api.finalizarSolicitudFidelizacion(connection, "FID-A"), rol === "BUYER" ? /Solo Ejecutor/ : denied);
    await assert.rejects(api.createSolicitudFidelizacion(connection, request), rol === "ADMIN" ? /únicamente/ : denied);
  }
  assert.equal(localAccess(), 0);
});

test("Unauthorized roles blocked and empty remote results do not expose cached rows", async () => {
  const { api, localAccess } = await service();
  for (const rol of ["MARK", "AUD", "DISENADOR", ""]) {
    await assert.rejects(api.loadCanastoFidelizacion({ appUser: { rol } }), /únicamente/);
    await assert.rejects(api.finalizarSolicitudFidelizacion({ appUser: { rol } }, "FID-A"), /únicamente/);
  }
  assert.equal((await api.loadSolicitudFidelizacionDetalle({ appUser: { rol: "BUYER" } }, "FID-A")).length, 0);
  const result = await api.createSolicitudFidelizacion({ appUser: { rol: "BUYER" } }, request);
  assert.equal(result.actividad.actividad_id, "FID-A");
  assert.ok(Array.isArray(result.stagingRecords));
  assert.equal(localAccess(), 0);
});
