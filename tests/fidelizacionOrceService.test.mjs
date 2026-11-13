import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";
import * as permissions from "../src/constants/permissions.js";
import * as model from "../src/features/fidelizacion/orceReconciliation.js";

async function service() {
  const calls = [], cache = new Map();
  let failBatch = false;
  const context = createContext({ Intl, Date });
  const stub = async (exports) => {
    const m = new SyntheticModule(Object.keys(exports), function () { for (const [k, v] of Object.entries(exports)) this.setExport(k, v); }, { context });
    await m.link(() => {}); await m.evaluate(); return m;
  };
  const m = new SourceTextModule(await readFile(new URL('../src/services/fidelizacionOrceService.js', import.meta.url), 'utf8'), { context });
  await m.link((name) => {
    if (name.includes('permissions')) return stub(permissions);
    if (name.endsWith('/supabase')) return stub({ hasSupabaseConnection: () => true });
    if (name.includes('/http')) return stub({ callRpc: async (_c, name, args) => {
      calls.push({ name, ...args });
      if (failBatch && args.p_lote.endsWith('000000000001')) { failBatch = false; throw new Error('Interrupción'); }
      if (!cache.has(args.p_lote)) cache.set(args.p_lote, { updated: args.p_filas.length, rows: args.p_filas.map((r) => ({ ...r, status: 'ACTUALIZADO' })) });
      return cache.get(args.p_lote);
    } });
    if (name.includes('fidelizacionService')) return stub({ extractRowsFromExcel: async () => [], loadCanastoFidelizacion: async () => [] });
    if (name.includes('orceReconciliation')) return stub(model);
    throw new Error(name);
  });
  await m.evaluate();
  return { api: m.namespace, calls, cache, fail: () => { failBatch = true; } };
}
const connection = { appUser: { rol: 'OPER' } };
const operation = '4af32472-5555-4444-8888-111111111111';
const preview = { rows: Array.from({ length: 501 }, (_, i) => ({ sku: String(i), segmento_id: '1102', canal: 'comasa', descuento: 20,
  promo_id_orce: '1297', oferta_id_orce: '28920', revision_esperada: 0, status: 'LISTO' })) };

test('Reconciliation batches large files and retries the same operation without duplicate writes', async () => {
  const { api, fail, calls, cache } = await service();
  fail();
  await assert.rejects(api.saveOrceImport(connection, 'report.xlsx', preview, operation), /Interrupción/);
  assert.equal(cache.size, 1);
  const result = await api.saveOrceImport(connection, 'report.xlsx', preview, operation);
  assert.equal(result.rows.length, 501); assert.equal(result.updated, 501); assert.equal(cache.size, 2);
  assert.equal(calls[0].p_lote, calls[2].p_lote);
  assert.equal(calls[1].p_lote, calls[3].p_lote);
  assert.ok(calls.every(c => c.p_filas.length <= 500));
});

test('Only Ejecutor and Admin import; missing migration blocks writes and conflicts never enter payload', async () => {
  const { api, calls } = await service();
  for (const rol of ['BUYER', 'MARK', 'AUD', 'DISENADOR', '']) {
    await assert.rejects(api.saveOrceImport({ appUser: { rol } }, 'report.xlsx', preview, operation), /Solo Ejecutor/);
  }
  await assert.rejects(api.saveOrceImport(connection, 'report.xlsx', { rows: [{ ...preview.rows[0], revision_esperada: null }] }, operation), /migración/);
  assert.equal(calls.length, 0);
  await api.saveOrceImport(connection, 'report.xlsx', { rows: [preview.rows[0], { ...preview.rows[1], status: 'CONFLICTO' }] }, operation);
  assert.equal(calls[0].p_filas.length, 1);
});

test('Admin can preview and save ORCE reconciliation', async () => {
  const { api, calls } = await service();
  const admin = { appUser: { rol: 'ADMIN' } };
  // Admin reaches file validation instead of failing the permission gate.
  await assert.rejects(api.previewOrceImport(admin, {}, []), /El reporte debe contener/);
  const result = await api.saveOrceImport(admin, 'report.xlsx', { rows: [preview.rows[0]] }, operation);
  assert.equal(result.updated, 1);
  assert.equal(calls[0].name, 'conciliar_fidelizacion_orce');
});
