import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import * as permissions from '../src/constants/permissions.js';
async function service({ fail = false, connected = true, incomplete = false } = {}) {
 const calls=[]; const context=createContext({});
 const stub=async(exports)=>{const m=new SyntheticModule(Object.keys(exports),function(){for(const[k,v]of Object.entries(exports))this.setExport(k,v);},{context});await m.link(()=>{});await m.evaluate();return m;};
 const m=new SourceTextModule(await readFile(new URL('../src/services/fidelizacionSummaryService.js',import.meta.url),'utf8'),{context});
 await m.link(name=>name.includes('permissions')?stub(permissions):name.endsWith('/http')?stub({selectAll:async(connection,table,params,options)=>{calls.push({table,params,options});if(fail)throw new Error('Consulta rechazada');return incomplete?null:[];}}):stub({hasSupabaseConnection:()=>connected}));await m.evaluate();return{api:m.namespace,calls};
}
test('Only ADMIN and OPER read the summary, all queries use pagination and cancellation',async()=>{
 for(const rol of ['ADMIN','OPER']){const{api,calls}=await service();const controller=new AbortController();await api.loadFidelizacionSummary({appUser:{rol}},'comasa',controller.signal);assert.equal(calls.length,3);for(const call of calls){assert.equal(call.params.limit,undefined);assert.equal(call.options.signal,controller.signal);assert.equal(call.params.order,'id.asc');}}
 for(const rol of ['BUYER','MARK','AUD','DISENADOR','']){const{api,calls}=await service();await assert.rejects(api.loadFidelizacionSummary({appUser:{rol}},'comasa'),/Administrador y Ejecutor/);assert.equal(calls.length,0);}
});
test('Failed, disconnected or incomplete queries never become zero-count success',async()=>{
 for(const config of [{fail:true},{connected:false},{incomplete:true}]){const{api}=await service(config);await assert.rejects(api.loadFidelizacionSummary({appUser:{rol:'ADMIN'}},'comasa'));}
});
test('Unknown channels are rejected before querying',async()=>{const{api,calls}=await service();await assert.rejects(api.loadFidelizacionSummary({appUser:{rol:'ADMIN'}},'unknown'),/Canal/);assert.equal(calls.length,0);});
