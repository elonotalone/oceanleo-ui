import assert from 'node:assert/strict';
import test from 'node:test';
import {compileModule,dataModule} from './helpers/module-bench.mjs';
const {WorkingCopySaver,WorkingCopyError,workingCopyTransport}=await import(await compileModule('src/shell/editor-working-copy.ts',{
 '../lib/auth/client':dataModule('export const accessToken=async()=>"test-token";'),
 '../lib/auth/config':dataModule('export const GATEWAY_BASE="https://gateway.invalid";'),
}));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const settle=async()=>{for(let n=0;n<40;n++)await Promise.resolve();};
const copy=seq=>({schema:'test',seq,published_seq:0,base_revision_id:'r1',saved_at:new Date().toISOString(),doc:{text:'old server state'}});
function setup(over={}){let document={text:'merged first'},gets=0;const puts=[],restored=[];const saver=new WorkingCopySaver({schema:'test',baseRevision:'r1',collaborative:()=>true,capture:()=>structuredClone(document),restore:d=>restored.push(d),measure:()=>{},transport:{get:async()=>{gets++;return null;},put:async(d,seq)=>{puts.push([d,seq]);return {ok:true,seq:1};},published:async()=>{},...over.transport},...over});return {saver,puts,restored,setDoc:d=>document=d,get gets(){return gets;}};}

test('room stale409 immediately reuses its seq and recaptures merged edits without another GET',async()=>{
 const collision=deferred(),ack=deferred();let reads=0,attempts=0,active=0,maxActive=0;const seen=[];
 const b=setup({transport:{get:async()=>{reads++;return null;},put:async(d,seq)=>{seen.push([d,seq]);maxActive=Math.max(maxActive,++active);try{if(++attempts===1){await collision.promise;throw new WorkingCopyError('stale',409,7);}return await ack.promise;}finally{active--; }},published:async()=>{}}});
 try{await b.saver.initialize();b.saver.edit();await settle();b.setDoc({text:'merged first + peer + newest local'});b.saver.edit();collision.resolve();await settle();assert.equal(reads,1);assert.deepEqual(seen[1],[{text:'merged first + peer + newest local'},7]);assert.equal(maxActive,1);assert.equal(b.saver.snapshot().state,'saving');assert.equal(b.saver.snapshot().pending,true);ack.resolve({ok:true,seq:8});await b.saver.flush();assert.equal(b.saver.snapshot().state,'saved');assert.equal(b.saver.snapshot().seq,8);assert.deepEqual(b.restored,[]);}finally{collision.resolve();ack.resolve({ok:true,seq:8});b.saver.dispose();}
});

test('room CAS retry is bounded to three PUT attempts, with no GET between them',async()=>{
 let reads=0,attempts=0;const seqs=[];const b=setup({transport:{get:async()=>{reads++;return null;},put:async(_doc,seq)=>{seqs.push(seq);throw new WorkingCopyError('stale',409,++attempts);},published:async()=>{}}});
 try{await b.saver.initialize();b.saver.edit();await b.saver.flush();assert.equal(attempts,3);assert.equal(reads,1);assert.deepEqual(seqs,[null,1,2]);assert.equal(b.saver.snapshot().state,'conflict');assert.equal(b.saver.snapshot().pending,true);assert.equal(await b.saver.retry(),false);}finally{b.saver.dispose();}
});

test('outside a room, even a valid stale seq stays a conflict without retry or overwrite',async()=>{
 let reads=0,attempts=0;const b=setup({collaborative:()=>false,transport:{get:async()=>{reads++;return null;},put:async()=>{attempts++;throw new WorkingCopyError('stale',409,7);},published:async()=>{}}});
 try{await b.saver.initialize();b.saver.edit();await b.saver.flush();assert.equal(attempts,1);assert.equal(reads,1);assert.equal(b.saver.snapshot().state,'conflict');assert.equal(b.saver.snapshot().pending,true);}finally{b.saver.dispose();}
});

test('an incompatible schema in the opening copy stays a conflict before any PUT',async()=>{
 let attempts=0;const b=setup({transport:{get:async()=>({...copy(9),schema:'different'}),put:async()=>{attempts++;return {ok:true,seq:10};},published:async()=>{}}});
 try{await b.saver.initialize();b.saver.edit();await b.saver.flush();assert.equal(attempts,0);assert.equal(b.saver.snapshot().state,'conflict');assert.equal(b.saver.snapshot().pending,true);}finally{b.saver.dispose();}
});

test('room edits during opening GET adopt its seq and persist the merged model without overwriting it',async()=>{
 const reading=deferred(),seen=[];const b=setup({transport:{get:()=>reading.promise,put:async(d,seq)=>{seen.push([d,seq]);return {ok:true,seq:18};},published:async()=>{}}});
 try{const opening=b.saver.initialize();b.setDoc({text:'current merged peer edit'});b.saver.edit();reading.resolve(copy(17));await opening;await b.saver.flush();assert.deepEqual(seen,[[{text:'current merged peer edit'},17]]);assert.deepEqual(b.restored,[]);assert.equal(b.saver.snapshot().state,'saved');}finally{b.saver.dispose();}
});

test('a failed retry PUT stays unsaved and uses the ordinary network backoff without a GET',async()=>{
 let reads=0,attempts=0;const timers=[];const b=setup({setTimer:(_run,ms)=>{timers.push(ms);return 1;},clearTimer:()=>{},transport:{get:async()=>{reads++;return null;},put:async()=>{if(++attempts===1)throw new WorkingCopyError('stale',409,7);throw new TypeError('Failed to fetch');},published:async()=>{}}});
 try{await b.saver.initialize();b.saver.edit();await b.saver.flush();assert.equal(attempts,2);assert.equal(reads,1);assert.equal(b.saver.snapshot().state,'error');assert.equal(b.saver.snapshot().pending,true);assert.deepEqual(timers,[1000]);}finally{b.saver.dispose();}
});

test('the real C1 transport retains a valid stale409 sequence for an immediate merged retry',async()=>{
 const old=globalThis.fetch,seen=[];globalThis.fetch=async(_url,init)=>{seen.push(init.method);return Response.json({ok:false,code:'stale',seq:7},{status:409});};
 try{await assert.rejects(workingCopyTransport('root','test','r1').put({},null),e=>e instanceof WorkingCopyError&&e.status===409&&e.seq===7);assert.deepEqual(seen,['PUT']);}finally{globalThis.fetch=old;}
});

test('missing, invalid or non-stale409 seq fails closed with no room retry and no GET',async()=>{
 const old=globalThis.fetch;
 try{for(const body of [{code:'stale'},{code:'stale',seq:null},{code:'stale',seq:0},{code:'stale',seq:-1},{code:'stale',seq:1.5},{code:'stale',seq:'7'},{code:'stale',seq:Number.MAX_SAFE_INTEGER+1},{code:'different',seq:7},'invalid-json']){
  const methods=[];globalThis.fetch=async(_url,init)=>{methods.push(init.method);return init.method==='GET'?new Response('',{status:404}):body==='invalid-json'?new Response('{',{status:409}):Response.json(body,{status:409});};
  const b=setup({transport:workingCopyTransport('root','test','r1')});try{await b.saver.initialize();b.saver.edit();await b.saver.flush();assert.equal(b.saver.snapshot().state,'conflict',JSON.stringify(body));assert.equal(b.saver.snapshot().pending,true);assert.deepEqual(methods,['GET','PUT'],JSON.stringify(body));}finally{b.saver.dispose();}
 }}finally{globalThis.fetch=old;}
});

test('one room collision at150ms RTT needs two PUTs and no sequence GET',async()=>{
 const delay=()=>new Promise(r=>setTimeout(r,150));let reads=0,attempts=0;
 const b=setup({transport:{get:async()=>{reads++;return null;},put:async()=>{await delay();if(++attempts===1)throw new WorkingCopyError('stale',409,7);return {ok:true,seq:8};},published:async()=>{}}});
 try{await b.saver.initialize();const start=performance.now();b.saver.edit();await b.saver.flush();const elapsed=performance.now()-start;assert.equal(b.saver.snapshot().state,'saved');assert.equal(attempts,2);assert.equal(reads,1);assert.ok(elapsed<=500,`room collision acknowledgement ${elapsed.toFixed(1)}ms`);console.log(`Room collision at150ms RTT: ${elapsed.toFixed(1)}ms, 2 PUT attempts, no sequence GET`);}finally{b.saver.dispose();}
});
