import test from 'node:test';
import assert from 'node:assert/strict';
import { mountRoute } from './e9-richdoc-harness.mjs';

async function mountReadyRoute(saveOverride) {
  const host = mountRoute(saveOverride);
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  host.render();
  host.message({ type: 'ready' });
  host.render();
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
  host.render();
  return host;
}

test('real RichDoc route saves cached dirty document after unmount', async () => {
  const host=await mountReadyRoute();
  host.message({type:'dirty',dirty:true,revision:1});
  const capture=host.posted.findLast(m=>m.type==='recovery-capture');
  assert.ok(capture,'dirty must proactively capture document');
  host.message({type:'recovery-snapshot',ok:true,recoveryId:capture.recoveryId,snapshot:{revision:1,payload:{text:'latest'}}});
  const adapter=host.render(); assert.equal(adapter.persistence.dirty,true,'snapshot is not a server save');
  host.unmount(); const result=await adapter.persistence.flush();
  assert.equal(result.ok,true); assert.deepEqual(JSON.parse(JSON.stringify(host.saved)),[{text:'latest'}]); assert.equal(host.reports.length,1);
});

test('real RichDoc route refuses stale cache after unmount', async () => {
  const host=await mountReadyRoute(); host.message({type:'dirty',dirty:true,revision:1});
  const capture=host.posted.findLast(m=>m.type==='recovery-capture'); assert.ok(capture);
  host.message({type:'recovery-snapshot',ok:true,recoveryId:capture.recoveryId,snapshot:{revision:1,payload:{text:'old'}}});
  host.message({type:'dirty',dirty:true,revision:2}); const adapter=host.render();
  const capturesBeforeUnmount=host.posted.filter(m=>m.type==='recovery-capture').length;
  host.unmount();
  const result=await adapter.persistence.flush(); assert.equal(result.ok,false);assert.equal(host.saved.length,0);assert.equal(host.reports.length,0);
  assert.equal(host.posted.filter(m=>m.type==='recovery-capture').length,capturesBeforeUnmount,'unmounted route must not request a new iframe snapshot');
});


test('RichDoc repeats a committed flush without uploading another revision', async () => {
  const host=await mountReadyRoute();host.message({type:'dirty',dirty:true,revision:1});
  const request=host.posted.findLast(m=>m.type==='recovery-capture');
  host.message({type:'recovery-snapshot',ok:true,recoveryId:request.recoveryId,snapshot:{revision:1,payload:{text:'one'}}});
  const adapter=host.render();assert.equal((await adapter.persistence.flush()).ok,true);
  assert.ok(host.posted.findLast(m=>m.type==='save-result').saveId);
  host.unmount();assert.equal((await adapter.persistence.flush()).ok,true);assert.equal(host.saved.length,1);
});

test('RichDoc concurrent flush shares upload and commits latest edit using committed base', async () => {
  const pending=[];const bases=[];
  const host=await mountReadyRoute(input=>{bases.push(input.item);return new Promise(resolve=>{pending.push(resolve);});});
  host.message({type:'dirty',dirty:true,revision:1});
  let request=host.posted.findLast(m=>m.type==='recovery-capture');
  host.message({type:'recovery-snapshot',ok:true,recoveryId:request.recoveryId,snapshot:{revision:1,payload:{text:'one'}}});
  let adapter=host.render();const first=adapter.persistence.flush();const second=adapter.persistence.flush();assert.equal(first,second);
  host.message({type:'dirty',dirty:true,revision:2});
  request=host.posted.findLast(m=>m.type==='recovery-capture');
  host.message({type:'recovery-snapshot',ok:true,recoveryId:request.recoveryId,snapshot:{revision:2,payload:{text:'two'}}});
  pending[0]({ok:true,item:{key:'doc',revisionId:'committed-one'}});
  for(let i=0;i<20&&pending.length<2;i+=1) await new Promise(resolve=>setImmediate(resolve));
  assert.equal(bases[1].revisionId,'committed-one');
  pending[1]({ok:true,item:{key:'doc',revisionId:'committed-two'}});
  const result=await first;
  assert.equal(result.ok,true,result.error);assert.equal(result.item.revisionId,'committed-two');
  assert.equal(host.render().persistence.dirty,false);assert.equal(host.reports.length,1);
  assert.deepEqual(JSON.parse(JSON.stringify(host.saved)),[{text:'one'},{text:'two'}]);
  assert.equal(first,second);
  host.unmount();
});

test('RichDoc rejects uncorrelated or mismatched revision snapshots', async()=>{
  for(const kind of ['id','revision']) {
    const host=await mountReadyRoute();host.message({type:'dirty',dirty:true,revision:4});const request=host.posted.findLast(m=>m.type==='recovery-capture');
    host.message({type:'recovery-snapshot',ok:true,recoveryId:kind==='id'?'foreign':request.recoveryId,snapshot:{revision:kind==='revision'?3:4,payload:{text:'wrong'}}});
    const adapter=host.render();const capturesBeforeUnmount=host.posted.filter(m=>m.type==='recovery-capture').length;host.unmount();
    assert.equal((await adapter.persistence.flush()).ok,false);assert.equal(host.saved.length,0);
    assert.equal(host.posted.filter(m=>m.type==='recovery-capture').length,capturesBeforeUnmount);
  }
});


test('RichDoc hidden/pagehide saves dirty cached edits once and ignores clean events', async()=>{
  for (const trigger of ['hide', 'pagehide']) {
    let finish;
    const host=await mountReadyRoute(()=>new Promise(resolve=>{finish=resolve;}));
    host[trigger]();assert.equal(host.saved.length,0);assert.equal(host.posted.filter(m=>m.type==='recovery-capture').length,0);
    host.message({type:'dirty',dirty:true,revision:1});const request=host.posted.findLast(m=>m.type==='recovery-capture');
    host.message({type:'recovery-snapshot',ok:true,recoveryId:request.recoveryId,snapshot:{revision:1,payload:{text:'background'}}});
    host.render();host[trigger]();
    assert.equal(host.saved.length,1,'dirty background event must start saving');
    host.hide();host.pagehide();assert.equal(host.saved.length,1,'simultaneous events share the upload');
    finish({ok:true,item:{key:'doc',revisionId:'background-saved'}});await new Promise(resolve=>setImmediate(resolve));
    host.hide();host.pagehide();assert.equal(host.saved.length,1,'committed edit is not uploaded again');
    host.unmount();host.hide();host.pagehide();assert.equal(host.saved.length,1,'listeners removed on unmount');
  }
});
