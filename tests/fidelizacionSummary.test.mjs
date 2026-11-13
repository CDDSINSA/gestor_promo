import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSummary, offerStatus, managuaDate } from '../src/features/fidelizacion/summary/summaryModel.js';
const row = (offer = '10', segment = '1002', extra = {}) => ({ canal: 'comasa', sku: 'SKU', segmento_id: segment, estatus: 'Activo', descuento: 20, promo_id_orce: '1', oferta_id_orce: offer, estado_conciliacion_orce: 'CONCILIADO', ...extra });
const request = (extra = {}) => ({ canal: 'comasa', legacy_actividad_id: 'ESP-1', tipo_actividad: 'ESPECIAL', estado: 'Finalizado', fecha_inicio: '2026-10-01', fecha_fin: '2026-10-31', promo_ids: '1, 2', oferta_ids: '10, 20', ...extra });
const build = (data) => buildSummary({ channel: 'comasa', today: '2026-10-01', ...data });
test('Unique IDs across SKUs, segments and sources; special offers stay unassigned', () => {
 const result = build({ canasto: [row(), row('010'), row('10','1003')], requests: [request(),request()] });
 assert.equal(result.promotions,2); assert.equal(result.offers,2);
 assert.deepEqual(result.segments.map(s=>s.count),[1,1]); assert.equal(result.unassigned,2);
});
test('Current records exclude inactive, zero discounts, pending reconciliation, other channels and FID headers', () => {
 const result=build({canasto:[row(),row('11','1002',{estatus:'Inactivo'}),row('12','1002',{descuento:0}),row('13','1002',{estado_conciliacion_orce:'PENDIENTE'}),row('14','1002',{canal:'retail'})],requests:[request({legacy_actividad_id:'FID-1',oferta_ids:'90'}),request({estado:'Nuevo',oferta_ids:'91'})]});
 assert.equal(result.offers,1); assert.equal(result.pending,1); assert.equal(result.currentRequests,0);
});
test('Inclusive validity dates, expired/future exclusions and undated requests', () => {
 const result=build({requests:[request({estado:'Archivado',fecha_fin:'2026-10-01'}),request({fecha_inicio:'2026-09-01',fecha_fin:'2026-09-30',oferta_ids:'30'}),request({fecha_inicio:'2026-10-02',oferta_ids:'40'}),request({fecha_inicio:''}),request({fecha_fin:'2026-02-30'})]});
 assert.equal(result.currentRequests,1); assert.equal(result.offers,2); assert.equal(result.undatedRequests,2);
});
test('Load references do not count as IDs; missing mapping and IDs stay visible', () => {
 const result=build({canasto:[row('10','')],requests:[request({promo_ids:'ORCE-CARGADO',oferta_ids:'OFERTA-X'})]});
 assert.equal(result.promotions,1); assert.equal(result.offers,1); assert.equal(result.unassigned,1); assert.equal(result.missingIdsRequests,1);
});
test('Capacity boundaries and overflow are exact; zero segments remain visible', () => {
 for(const [count,level] of [[449,'normal'],[450,'warning'],[499,'warning'],[500,'danger'],[501,'danger']]) assert.equal(offerStatus(count).level,level);
 const result=build({canasto:Array.from({length:501},(_,i)=>row(String(i+1))),segments:[{canal:'comasa',legacy_segmento_id:'1003',nombre_segmento:'Foraneo'}]});
 assert.equal(result.alerts[0].count,501); assert.equal(result.segments[1].count,0);
});
test('Business date uses Managua and empty input has no fabricated activity', () => {
 assert.equal(managuaDate(new Date('2026-10-02T02:00:00Z')),'2026-10-01');
 assert.equal(build({}).offers,0); assert.equal(build({}).alerts.length,0);
});
