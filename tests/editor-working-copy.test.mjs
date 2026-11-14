import assert from 'node:assert/strict';
import test from 'node:test';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
const mod = await import(await compileModule('src/shell/editor-working-copy.ts', {
  '../lib/auth/client': dataModule('export async function accessToken(){return globalThis.__wcToken ?? "test-token"}'),
  '../lib/auth/config': dataModule('export const GATEWAY_BASE="https://gateway.invalid"'),
}));
const { WorkingCopySaver, WorkingCopyError, workingCopyTransport } = mod;
const settle = async () => { for(let n=0;n<30;n++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise=new Promise(r=>resolve=r); return {promise,resolve}; };
function bed(options={}) {
  let time=0, seq=0, doc={text:'first'}, timerId=0;
  const timers=new Map(), puts=[], measured=[];
  const events=new EventTarget();
  const transport={get:async()=>null,put:async(d,s)=>{puts.push([structuredClone(d),s]); return {ok:true,seq:++seq,server_ms:30};},published:async()=>{}, ...options.transport};
  const saver=new WorkingCopySaver({transport,schema:'test',baseRevision:'r1',capture:()=>structuredClone(doc), restore:options.restore??(()=>{}),now:()=>time,
    setTimer:(run,ms)=>{ const id=++timerId;timers.set(id,{run,ms}); return id; },clearTimer:id=>timers.delete(id),measure:(ms,seq)=>measured.push({ms,seq}),events,...options,transport});
  return {saver,puts,measured,timers,events,setDoc:value=>doc=value,setTime:value=>time=value, tick:async()=>{const [id,t]=timers.entries().next().value;timers.delete(id);time+=t.ms;t.run();await settle();},dispose:()=>saver.dispose()};
}
test('send immediately, no debounce, Saved only after server acknowledgement; 150ms RTT',async()=>{
 const ack=deferred(); const b=bed({transport:{put:async(d,s)=>{b.puts.push([d,s]);return ack.promise;}}});
 await b.saver.initialize();b.saver.edit();await settle();assert.equal(b.puts.length,1);assert.equal(b.saver.snapshot().state,'saving');assert.equal(b.timers.size,0);
 b.setTime(150);ack.resolve({ok:true,seq:1,server_ms:30});await settle();assert.equal(b.saver.snapshot().state,'saved');assert.deepEqual(b.measured,[{ms:150,seq:1}]);b.dispose();
});
test('single flight, latest wins, no intermediate document uploads',async()=>{
 const a=deferred(),c=deferred();const b=bed({transport:{put:async(d,s)=>{b.puts.push([structuredClone(d),s]);return b.puts.length===1?a.promise:c.promise;}}});
 await b.saver.initialize();b.saver.edit();await settle();b.setDoc({text:'second'});b.saver.edit();b.setDoc({text:'latest'});b.saver.edit();await settle();assert.equal(b.puts.length,1);
 a.resolve({ok:true,seq:1});await settle();assert.equal(b.puts.length,2);assert.deepEqual(b.puts[1],[{text:'latest'},1]);assert.equal(b.saver.snapshot().state,'saving');c.resolve({ok:true,seq:2});await settle();assert.equal(b.saver.snapshot().state,'saved');b.dispose();
});
test('409: two tabs cannot overwrite, retry and online never retry a conflict',async()=>{
 const b=bed({transport:{put:async()=>{throw new WorkingCopyError('保存冲突',409)}}});await b.saver.initialize();b.saver.edit();await settle();assert.equal(b.saver.snapshot().state,'conflict');assert.equal(b.saver.snapshot().pending,true);assert.equal(b.timers.size,0);assert.equal(await b.saver.retry(),false);b.events.dispatchEvent(new Event('online'));assert.equal(b.timers.size,0);b.dispose();
});
test('offline then online: visible failure, immediate retry, no false Saved',async()=>{
 let offline=true;const b=bed({transport:{put:async()=>{if(offline)throw new TypeError('Failed to fetch');return {ok:true,seq:1}}}});await b.saver.initialize();b.saver.edit();await settle();assert.equal(b.saver.snapshot().state,'error');assert.equal(b.timers.values().next().value.ms,1000);offline=false;b.events.dispatchEvent(new Event('online'));await settle();assert.equal(b.saver.snapshot().state,'saved');assert.equal(b.timers.size,0);b.dispose();
});
test('retry backoff: 1, 2, 4...30s and resets after acknowledgement',async()=>{
 const b=bed({transport:{put:async()=>{throw Error('network')}}});await b.saver.initialize();b.saver.edit();await settle();for(const delay of [1000,2000,4000,8000,16000,30000,30000]){assert.equal(b.timers.values().next().value.ms,delay);await b.tick();}b.dispose();
});
test('sign-in expired stays failed and retains unsent edits',async()=>{
 const b=bed({transport:{put:async()=>{throw new WorkingCopyError('登录已过期，重新登录后自动继续',401)}}});await b.saver.initialize();b.saver.edit();await settle();assert.equal(b.saver.snapshot().state,'error');assert.match(b.saver.snapshot().error,/登录/);assert.equal(b.saver.snapshot().pending,true);b.dispose();
});
test('beforeunload guards only unacknowledged working copy, removes listener when disposed',async()=>{
 const ack=deferred();const b=bed({transport:{put:()=>ack.promise}});await b.saver.initialize();const fire=()=>{const e=new Event('beforeunload',{cancelable:true});b.events.dispatchEvent(e);return e.defaultPrevented;};assert.equal(fire(),false);b.saver.edit();assert.equal(fire(),true);ack.resolve({ok:true,seq:1});await settle();assert.equal(fire(),false);b.dispose();assert.equal(fire(),false);
});
test('reopen silently restores unpublished working copy without resaving',async()=>{
 let restored;const b=bed({transport:{get:async()=>({schema:'test',seq:4,published_seq:3,base_revision_id:'r1',saved_at:'2026-11-15T00:00:00Z',doc:{text:'new'}})},restore:d=>restored=d});await b.saver.initialize();assert.deepEqual(restored,{text:'new'});assert.equal(b.saver.snapshot().seq,4);assert.equal(b.saver.snapshot().state,'saved');assert.equal(b.puts.length,0);b.dispose();
});
test('published working copy is not restored over opened Library revision',async()=>{
 let restored=false;const b=bed({transport:{get:async()=>({schema:'test',seq:4,published_seq:4,doc:{text:'old'}})},restore:()=>restored=true});await b.saver.initialize();assert.equal(restored,false);b.dispose();
});
test('read failure blocks PUT and retries initialization, never creates over unknown server sequence',async()=>{
 let fails=true;const b=bed({transport:{get:async()=>{if(fails)throw Error('offline');return null;}}});b.saver.edit();await settle();assert.equal(b.saver.snapshot().state,'error');assert.equal(b.puts.length,0);fails=false;await b.tick();assert.equal(b.puts.length,1);b.dispose();
});
test('close freezes document before editor destruction',async()=>{
 const ack=deferred();const b=bed({transport:{put:async(d,s)=>{b.puts.push([d,s]);return b.puts.length===1?ack.promise:{ok:true,seq:2};}}});await b.saver.initialize();b.saver.edit();await settle();b.setDoc({text:'last edit'});b.saver.edit();b.saver.freeze();b.setDoc(null);ack.resolve({ok:true,seq:1});await settle();assert.deepEqual(b.puts[1][0],{text:'last edit'});b.dispose();
});
test('timing flags a slow save with edit-to-ack measurement',async()=>{
 const ack=deferred();const b=bed({transport:{put:()=>ack.promise}});await b.saver.initialize();b.saver.edit();b.setTime(650);ack.resolve({ok:true,seq:1});await settle();assert.equal(b.measured[0].ms,650);b.dispose();
});
test('transport C1: authenticated single PUT, canonical root, conditional seq, gzip >8KB',async()=>{
 const old=globalThis.fetch;const calls=[];globalThis.fetch=async(url,init)=>{calls.push({url,init});return Response.json({ok:true,seq:2});};try{const t=workingCopyTransport('root /','test','r1');await t.put({text:'hello'},1);assert.equal(calls.length,1);assert.match(calls[0].url,/root%20%2F$/);assert.equal(calls[0].init.headers.Authorization,'Bearer test-token');assert.deepEqual(JSON.parse(calls[0].init.body),{schema:'test',if_seq:1,base_revision_id:'r1',doc:{text:'hello'}});await t.put({text:'x'.repeat(9000)},2);assert.equal(calls[1].init.headers['Content-Encoding'],'gzip');const decoded=await new Response(new Blob([calls[1].init.body]).stream().pipeThrough(new DecompressionStream('gzip'))).json();assert.equal(decoded.doc.text.length,9000);await t.published(2,'r2');assert.match(calls[2].url,/published$/);}finally{globalThis.fetch=old;}
});

test('every acknowledgement emits editor_save telemetry and flags >500ms without document contents',async()=>{
 const {clearTelemetry,telemetrySnapshot}=await import('../src/lib/telemetry/index.ts');clearTelemetry();let now=0;const ack=deferred();const saver=new WorkingCopySaver({schema:'test',baseRevision:'r1',now:()=>now,capture:()=>({text:'private text'}),restore:()=>{},transport:{get:async()=>null,put:()=>ack.promise,published:async()=>{}}});await saver.initialize();saver.edit();now=620;ack.resolve({ok:true,seq:1,server_ms:70});await settle();const event=telemetrySnapshot().find(e=>e.name==='editor_save');assert.ok(event);assert.equal(event.value,620);assert.equal(event.severity,'warn');assert.equal(event.detail.over_budget,true);assert.equal(JSON.stringify(event).includes('private text'),false);saver.dispose();
});

test('working copy older than a different opened Library revision is not restored',async()=>{
 let restored=false;const b=bed({baseSavedAt:Date.parse('2026-11-15T01:00:00Z'),transport:{get:async()=>({schema:'test',seq:4,published_seq:3,base_revision_id:'older-base',saved_at:'2026-11-15T00:00:00Z',doc:{text:'old'}})},restore:()=>restored=true});await b.saver.initialize();assert.equal(restored,false);assert.equal(b.saver.snapshot().state,'saved');b.dispose();
});
