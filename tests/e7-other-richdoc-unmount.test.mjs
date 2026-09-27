import test from 'node:test';
import assert from 'node:assert/strict';
import { mountRoute } from './e9-richdoc-harness.mjs';

test('real RichDoc route saves cached dirty document after unmount', async () => {
  const host=mountRoute();
  host.message({type:'dirty',dirty:true,revision:1});
  const capture=host.posted.findLast(m=>m.type==='recovery-capture');
  assert.ok(capture,'dirty must proactively capture document');
  host.message({type:'recovery-snapshot',ok:true,recoveryId:capture.recoveryId,snapshot:{revision:1,payload:{text:'latest'}}});
  const adapter=host.render(); assert.equal(adapter.persistence.dirty,true,'snapshot is not a server save');
  host.unmount(); const result=await adapter.persistence.flush();
  assert.equal(result.ok,true); assert.deepEqual(JSON.parse(JSON.stringify(host.saved)),[{text:'latest'}]); assert.equal(host.reports.length,1);
});

test('real RichDoc route refuses stale cache after unmount', async () => {
  const host=mountRoute(); host.message({type:'dirty',dirty:true,revision:1});
  const capture=host.posted.findLast(m=>m.type==='recovery-capture'); assert.ok(capture);
  host.message({type:'recovery-snapshot',ok:true,recoveryId:capture.recoveryId,snapshot:{revision:1,payload:{text:'old'}}});
  host.message({type:'dirty',dirty:true,revision:2}); const adapter=host.render();host.unmount();
  const result=await adapter.persistence.flush(); assert.equal(result.ok,false);assert.equal(host.saved.length,0);assert.equal(host.reports.length,0);
});


test('RichDoc repeats a committed flush without uploading another revision', async () => {
  const host=mountRoute();host.message({type:'dirty',dirty:true,revision:1});
  const request=host.posted.findLast(m=>m.type==='recovery-capture');
  host.message({type:'recovery-snapshot',ok:true,recoveryId:request.recoveryId,snapshot:{revision:1,payload:{text:'one'}}});
  const adapter=host.render();assert.equal((await adapter.persistence.flush()).ok,true);
  assert.ok(host.posted.findLast(m=>m.type==='save-result').saveId);
  host.unmount();assert.equal((await adapter.persistence.flush()).ok,true);assert.equal(host.saved.length,1);
});

test('RichDoc concurrent flush shares upload; newer edit stays dirty and next save uses committed base', async () => {
  let finish;const bases=[];
  const host=mountRoute(input=>{bases.push(input.item);return new Promise(resolve=>{finish=resolve;});});
  host.message({type:'dirty',dirty:true,revision:1});
  let request=host.posted.findLast(m=>m.type==='recovery-capture');
  host.message({type:'recovery-snapshot',ok:true,recoveryId:request.recoveryId,snapshot:{revision:1,payload:{text:'one'}}});
  let adapter=host.render();const first=adapter.persistence.flush();const second=adapter.persistence.flush();assert.equal(first,second);
  host.message({type:'dirty',dirty:true,revision:2});finish({ok:true,item:{key:'doc',revisionId:'committed-one'}});
  assert.equal((await first).ok,false);assert.equal(host.render().persistence.dirty,true);assert.equal(host.reports.length,0);
  request=host.posted.findLast(m=>m.type==='recovery-capture');
  host.message({type:'recovery-snapshot',ok:true,recoveryId:request.recoveryId,snapshot:{revision:2,payload:{text:'two'}}});
  adapter=host.render();host.unmount();const latest=adapter.persistence.flush();assert.equal(bases[1].revisionId,'committed-one');finish({ok:true,item:{key:'doc',revisionId:'committed-two'}});assert.equal((await latest).ok,true);
});

test('RichDoc rejects uncorrelated or mismatched revision snapshots', async()=>{
  for(const kind of ['id','revision']) {
    const host=mountRoute();host.message({type:'dirty',dirty:true,revision:4});const request=host.posted.findLast(m=>m.type==='recovery-capture');
    host.message({type:'recovery-snapshot',ok:true,recoveryId:kind==='id'?'foreign':request.recoveryId,snapshot:{revision:kind==='revision'?3:4,payload:{text:'wrong'}}});
    const adapter=host.render();host.unmount();assert.equal((await adapter.persistence.flush()).ok,false);assert.equal(host.saved.length,0);
  }
});


test('RichDoc hidden/pagehide saves dirty cached edits once and ignores clean events', async()=>{
  for (const trigger of ['hide', 'pagehide']) {
    let finish;
    const host=mountRoute(()=>new Promise(resolve=>{finish=resolve;}));
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
