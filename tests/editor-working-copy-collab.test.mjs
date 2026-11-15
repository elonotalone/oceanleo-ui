import assert from 'node:assert/strict';
import test from 'node:test';
import {compileModule,dataModule} from './helpers/module-bench.mjs';
const {WorkingCopySaver,WorkingCopyError}=await import(await compileModule('src/shell/editor-working-copy.ts',{
 '../lib/auth/client':dataModule('export const accessToken=async()=>"test-token";'),
 '../lib/auth/config':dataModule('export const GATEWAY_BASE="https://gateway.invalid";'),
}));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const settle=async()=>{for(let n=0;n<40;n++)await Promise.resolve();};
const copy=seq=>({schema:'test',seq,published_seq:0,base_revision_id:'r1',saved_at:new Date().toISOString(),doc:{text:'old server state'}});
function setup(over={}){let document={text:'merged first'},gets=0;const puts=[],restored=[];const saver=new WorkingCopySaver({schema:'test',baseRevision:'r1',collaborative:()=>true,capture:()=>structuredClone(document),restore:d=>restored.push(d),measure:()=>{},transport:{get:async()=>{gets++;return null;},put:async(d,seq)=>{puts.push([d,seq]);return {ok:true,seq:1};},published:async()=>{},...over.transport},...over});return {saver,puts,restored,setDoc:d=>document=d,get gets(){return gets;}};}

test('room CAS collision GETs the sequence and recaptures the current merged document without restoring stale JSON',async()=>{
 const reading=deferred(),ack=deferred();let reads=0,attempts=0;const seen=[];
 const b=setup({transport:{get:async()=>++reads===1?null:reading.promise,put:async(d,seq)=>{seen.push([d,seq]);if(++attempts===1)throw new WorkingCopyError('stale',409);return ack.promise;},published:async()=>{}}});
 try{await b.saver.initialize();b.saver.edit();await settle();assert.equal(reads,2);assert.equal(b.saver.snapshot().state,'saving');b.setDoc({text:'merged first + peer + newest local'});b.saver.edit();reading.resolve(copy(7));await settle();assert.deepEqual(seen[1],[{text:'merged first + peer + newest local'},7]);assert.equal(b.saver.snapshot().state,'saving');assert.equal(b.saver.snapshot().pending,true);ack.resolve({ok:true,seq:8});await b.saver.flush();assert.equal(b.saver.snapshot().state,'saved');assert.equal(b.saver.snapshot().seq,8);assert.deepEqual(b.restored,[]);}finally{b.saver.dispose();}
});

test('room CAS retry is bounded to three PUT attempts, then an unsaved conflict requires reload',async()=>{
 let reads=0,attempts=0;const b=setup({transport:{get:async()=>++reads===1?null:copy(reads),put:async()=>{attempts++;throw new WorkingCopyError('stale',409);},published:async()=>{}}});
 try{await b.saver.initialize();b.saver.edit();await b.saver.flush();assert.equal(attempts,3);assert.equal(reads,3);assert.equal(b.saver.snapshot().state,'conflict');assert.equal(b.saver.snapshot().pending,true);assert.equal(await b.saver.retry(),false);}finally{b.saver.dispose();}
});

test('outside a room, stale PUT stays a conflict without any sequence refresh or overwrite',async()=>{
 let reads=0,attempts=0;const b=setup({collaborative:()=>false,transport:{get:async()=>{reads++;return null;},put:async()=>{attempts++;throw new WorkingCopyError('stale',409);},published:async()=>{}}});
 try{await b.saver.initialize();b.saver.edit();await b.saver.flush();assert.equal(attempts,1);assert.equal(reads,1);assert.equal(b.saver.snapshot().state,'conflict');assert.equal(b.saver.snapshot().pending,true);}finally{b.saver.dispose();}
});

test('schema mismatch during room sequence refresh is a conflict, never an incompatible overwrite',async()=>{
 let reads=0,attempts=0;const b=setup({transport:{get:async()=>++reads===1?null:{...copy(9),schema:'different'},put:async()=>{attempts++;throw new WorkingCopyError('stale',409);},published:async()=>{}}});
 try{await b.saver.initialize();b.saver.edit();await b.saver.flush();assert.equal(attempts,1);assert.equal(b.saver.snapshot().state,'conflict');assert.equal(b.saver.snapshot().pending,true);}finally{b.saver.dispose();}
});

test('room edits during opening GET adopt its seq and persist the merged model without overwriting it',async()=>{
 const reading=deferred(),seen=[];const b=setup({transport:{get:()=>reading.promise,put:async(d,seq)=>{seen.push([d,seq]);return {ok:true,seq:18};},published:async()=>{}}});
 try{const opening=b.saver.initialize();b.setDoc({text:'current merged peer edit'});b.saver.edit();reading.resolve(copy(17));await opening;await b.saver.flush();assert.deepEqual(seen,[[{text:'current merged peer edit'},17]]);assert.deepEqual(b.restored,[]);assert.equal(b.saver.snapshot().state,'saved');}finally{b.saver.dispose();}
});

test('failed room sequence GET remains an unsaved network error, without an unbounded CAS loop',async()=>{
 let reads=0,attempts=0;const b=setup({setTimer:()=>1,clearTimer:()=>{},transport:{get:async()=>{if(++reads>1)throw new TypeError('Failed to fetch');return null;},put:async()=>{attempts++;throw new WorkingCopyError('stale',409);},published:async()=>{}}});
 try{await b.saver.initialize();b.saver.edit();await b.saver.flush();assert.equal(attempts,1);assert.equal(reads,2);assert.equal(b.saver.snapshot().state,'error');assert.equal(b.saver.snapshot().pending,true);}finally{b.saver.dispose();}
});

test('one room collision at 150ms RTT finishes GET/retry acknowledgement within 500ms',async()=>{
 const delay=()=>new Promise(r=>setTimeout(r,150));let reads=0,attempts=0;
 const b=setup({transport:{get:async()=>{await delay();return ++reads===1?null:copy(7);},put:async()=>{await delay();if(++attempts===1)throw new WorkingCopyError('stale',409);return {ok:true,seq:8};},published:async()=>{}}});
 try{await b.saver.initialize();const start=performance.now();b.saver.edit();await b.saver.flush();const elapsed=performance.now()-start;assert.equal(b.saver.snapshot().state,'saved');assert.equal(attempts,2);assert.ok(elapsed<=500,`room collision acknowledgement ${elapsed.toFixed(1)}ms`);console.log(`Room collision at 150ms RTT: ${elapsed.toFixed(1)}ms, 2 PUT attempts + 1 sequence GET`);}finally{b.saver.dispose();}
});
