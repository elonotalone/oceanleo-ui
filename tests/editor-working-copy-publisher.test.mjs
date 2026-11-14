import assert from 'node:assert/strict';
import test from 'node:test';
import { createBackgroundPublisher, resetBackgroundSaverForTests, shouldWarnBeforeUnload } from '../src/shell/advanced-background-saver.ts';
const settle=async()=>{for(let i=0;i<35;i++)await Promise.resolve();};
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve};};
function bed(){
 const calls=[],published=[];let seq=1, pending=false, source='first';
 const saver={flush:async()=>{pending=false;return true;},snapshot:()=>({seq,pending}),freeze:()=>calls.push('freeze'),dispose:()=>calls.push('dispose')};
 const publisher=createBackgroundPublisher({saver,transport:{published:async(s,r)=>published.push([s,r])},prepare:()=>{const captured=source;calls.push(`capture:${captured}`);return async()=>{calls.push(`publish:${captured}`);return {ok:true,item:{revisionId:captured}};};},record:async()=>{calls.push('record')}});
 return {publisher,saver,calls,published,edit:v=>{source=v;seq++;pending=true;},setSource:v=>source=v};
}
test.afterEach(()=>resetBackgroundSaverForTests());
test('export after edit: gate waits for working copy and Library publication, then records published seq',async()=>{
 const b=bed();b.edit('export');b.publisher.saved();const result=await b.publisher.publish();assert.equal(result.ok,true);assert.deepEqual(b.published,[[2,'export']]);assert.deepEqual(b.calls,['capture:export','publish:export','record']);
});
test('agent send/new conversation uses same publication gate, duplicate gates reuse receipt',async()=>{
 const b=bed();b.publisher.saved();await b.publisher.publish();await b.publisher.publish();assert.equal(b.calls.filter(v=>v.startsWith('publish:')).length,1);
});
test('close with unsaved edit captures immediately and publishes after UI destruction',async()=>{
 const b=bed();b.edit('last');b.publisher.close();b.setSource('destroyed');assert.deepEqual(b.calls,['freeze','capture:last']);await settle();assert.equal(b.calls.includes('publish:last'),true);assert.equal(b.calls.includes('publish:destroyed'),false);assert.equal(shouldWarnBeforeUnload(false),false);
});
test('close during previous publication serializes latest prepared snapshot',async()=>{
 const first=deferred();let value='first';const calls=[];let seq=1;
 const saver={snapshot:()=>({seq,pending:false}),flush:async()=>true,freeze:()=>{},dispose:()=>{}};
 const pub=createBackgroundPublisher({saver,transport:{published:async()=>{}},record:async()=>{},prepare:()=>{const captured=value;return async()=>{calls.push(captured);if(captured==='first')await first.promise;return {ok:true,item:{revisionId:captured}};};}});
 pub.saved();const run=pub.publish();await settle();value='latest';seq=2;pub.saved();pub.close();value='destroyed';first.resolve();await run;await settle();assert.deepEqual(calls,['first','latest']);
});
test('publishing an earlier snapshot never marks newer edit published',async()=>{
 const ack=deferred();const receipts=[];let seq=1;
 const saver={snapshot:()=>({seq,pending:false}),flush:async()=>true,freeze:()=>{},dispose:()=>{}};
 const pub=createBackgroundPublisher({saver,transport:{published:async(s,r)=>receipts.push([s,r])},record:async()=>{},prepare:()=>async()=>{seq=2;await ack.promise;return {ok:true,item:{revisionId:'r2'}};}});pub.saved();const run=pub.publish();await settle();ack.resolve();await run;assert.deepEqual(receipts,[[1,'r2']]);
});
test('idle publication runs at 10 seconds, never starts sooner',async(t)=>{
 t.mock.timers.enable({apis:['setTimeout']});const b=bed();b.publisher.saved();t.mock.timers.tick(9999);await settle();assert.equal(b.published.length,0);t.mock.timers.tick(1);await settle();assert.equal(b.published.length,1);
});
test('failed publication retries with original prepared snapshot after close',async(t)=>{
 t.mock.timers.enable({apis:['setTimeout']});let runs=0,source='snapshot';const captured=[];const saver={flush:async()=>true,snapshot:()=>({seq:1,pending:true}),freeze:()=>{},dispose:()=>{}};
 const pub=createBackgroundPublisher({saver,transport:{published:async()=>{}},record:async()=>{},prepare:()=>{const value=source;return async()=>{captured.push(value);return ++runs===1?{ok:false,error:'offline'}:{ok:true,item:{revisionId:'r2'}};};}});pub.saved();pub.close();source='destroyed';await settle();assert.equal(runs,1);t.mock.timers.tick(1000);await settle();assert.deepEqual(captured,['snapshot','snapshot']);
});

test('session or published-marker retry reuses committed Library receipt without another file build',async(t)=>{
 t.mock.timers.enable({apis:['setTimeout']});let builds=0,records=0,markers=0;
 const saver={flush:async()=>true,snapshot:()=>({seq:1,pending:false}),freeze:()=>{},dispose:()=>{}};
 const pub=createBackgroundPublisher({saver,prepare:()=>async()=>{builds++;return {ok:true,item:{revisionId:'r2'}};},record:async()=>{if(++records===1)throw Error('session outage');},transport:{published:async()=>{if(++markers===1)throw Error('marker outage');}}});pub.saved();assert.equal((await pub.publish()).ok,false);t.mock.timers.tick(1000);await settle();assert.equal(builds,1);t.mock.timers.tick(2000);await settle();assert.equal(builds,1);assert.equal(records,3);assert.equal(markers,2);
});

test('reopen waits for the closing instance pending PUT before reading the working copy',async()=>{
 const {waitForClosingWorkingCopy}=await import('../src/shell/advanced-background-saver.ts');let pending=true;const ack=deferred();const saver={flush:async()=>{await ack.promise;pending=false;return true;},snapshot:()=>({seq:1,pending}),freeze:()=>{},dispose:()=>{}};
 const pub=createBackgroundPublisher({root:'reopen-root',saver,transport:{published:async()=>{}},record:async()=>{},prepare:()=>async()=>({ok:true})});pub.close();let read=false;const reopening=waitForClosingWorkingCopy('reopen-root').then(()=>{read=true;});await settle();assert.equal(read,false);ack.resolve();await reopening;assert.equal(read,true);
});

test('export/new-conversation gate drains edits arriving while its previous publication is running',async()=>{
 let seq=1,text='first';const barrier=deferred(),calls=[];
 const saver={flush:async()=>true,snapshot:()=>({seq,pending:false}),freeze:()=>{},dispose:()=>{}};
 const pub=createBackgroundPublisher({saver,transport:{published:async()=>{}},record:async()=>{},prepare:()=>{const value=text;return async()=>{calls.push(value);if(value==='first')await barrier.promise;return {ok:true,item:{revisionId:value}};};}});pub.saved();const gate=pub.flushLatest();await settle();seq=2;text='latest';pub.saved();barrier.resolve();const result=await gate;assert.equal(result.item.revisionId,'latest');assert.deepEqual(calls,['first','latest']);
});
