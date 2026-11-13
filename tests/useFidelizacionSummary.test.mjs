import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
async function harness() {
 const context=createContext({AbortController,Date});const slots=[];let cursor=0,effects=[],dirty=false,result;const calls=[];
 const props={connection:{appUser:{rol:'ADMIN'}},channel:'comasa',allowed:true};
 const stub=(values)=>new SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});
 const react=stub({useState(initial){const i=cursor++;slots[i]??={value:initial};return[slots[i].value,next=>{slots[i].value=typeof next==='function'?next(slots[i].value):next;dirty=true;}];},useRef(initial){const i=cursor++;slots[i]??={current:initial};return slots[i];},useEffect(fn,deps){const i=cursor++;if(slots[i]?.deps?.every((v,j)=>v===deps[j]))return;const old=slots[i];slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}});
 const service=stub({loadFidelizacionSummary:(connection,channel,signal)=>new Promise((resolve,reject)=>calls.push({connection,channel,signal,resolve,reject}))});
 const model=stub({buildSummary:data=>({channel:data.channel}),managuaDate:()=> '2026-10-01'});
 const m=new SourceTextModule(await readFile(new URL('../src/features/fidelizacion/summary/useSummary.js',import.meta.url),'utf8'),{context});await m.link(name=>name==='react'?react:name.includes('Service')?service:model);await m.evaluate();
 const render=()=>{cursor=0;dirty=false;result=m.namespace.useSummary(props);const pending=effects;effects=[];pending.forEach(fn=>fn());};
 const flush=async()=>{for(let i=0;i<8;i++){await Promise.resolve();if(dirty)render();}};
 render();await flush();return{props,calls,render,flush,get value(){return result;},unmount(){slots.forEach(s=>s.cleanup?.());}};
}
test('No load on mount, rerender or context change; explicit refresh loads once',async()=>{
 const h=await harness();assert.equal(h.calls.length,0);h.render();await h.flush();assert.equal(h.calls.length,0);
 const pending=h.value.refresh();await h.flush();assert.equal(h.calls.length,1);assert.equal(h.value.state.loading,true);
 h.calls[0].resolve({});await pending;await h.flush();assert.equal(h.value.state.summary.channel,'comasa');
 h.props.channel='retail';h.render();await h.flush();assert.equal(h.calls.length,1);assert.equal(h.value.state.summary,undefined);
 h.props.connection={appUser:{rol:'ADMIN'}};h.render();await h.flush();assert.equal(h.calls.length,1);
});
test('Context changes and unmount abort requests and reject stale results',async()=>{
 const h=await harness();const pending=h.value.refresh();h.props.channel='retail';h.render();await h.flush();assert.equal(h.calls[0].signal.aborted,true);h.calls[0].resolve({});await pending;await h.flush();assert.equal(h.value.state.summary,undefined);
 const next=h.value.refresh();h.unmount();assert.equal(h.calls[1].signal.aborted,true);h.calls[1].resolve({});await next;
});
test('Error requires explicit retry; denied role never loads',async()=>{
 const h=await harness();const pending=h.value.refresh();h.calls[0].reject(new Error('Sin conexión'));await pending;await h.flush();assert.equal(h.value.state.error,'Sin conexión');h.render();await h.flush();assert.equal(h.calls.length,1);
 const retry=h.value.refresh();h.calls[1].resolve({});await retry;await h.flush();assert.ok(h.value.state.summary);
 h.props.allowed=false;h.render();await h.flush();await h.value.refresh();assert.equal(h.calls.length,2);assert.equal(h.value.state.summary,undefined);
});
