import assert from 'node:assert/strict';
import test from 'node:test';
import {FakeVideo,harness} from './helpers/remote-desktop-webrtc.mjs';

for(const label of ['rd-input','rd-fast','rd-ctl'])for(const failure of ['close','error'])test(`${label} ${failure}: picture continues, only failed channel is replaced, release_all sent`,async t=>{
  const h=await harness(t);await h.viewer.start();h.open();const pc=h.viewer.pc;h.viewer.send({kind:'key_down',key:'Shift'});h.receipt(h.viewer.lastSequence());
  const old=pc.channel(label);old[failure]();assert.equal(pc.closed,0);assert.equal(h.states.at(-1).state,'input_reconnecting');
  const video=new FakeVideo();h.viewer.attachVideo(video);video.frame({expectedDisplayTime:110,receiveTime:90});assert.equal(h.frames.length,1);
  await h.advance(200);const replacement=pc.channel(label);assert.notEqual(replacement,old);replacement.open();
  assert.equal(pc.closed,0);assert.equal(h.viewer.gen,1);assert.equal(h.terminals.length,0);
  assert.ok(pc.channels.filter(c=>c.label==='rd-input').flatMap(c=>c.sent).some(message=>message.a?.kind==='release_all'));
});
test('ambiguous send failure never replays the failed action or closes the peer',async t=>{
  const h=await harness(t);await h.viewer.start();h.open();const pc=h.viewer.pc;pc.channel('rd-input').throwSend=true;
  h.viewer.send({kind:'type',text:'never twice'});await h.advance(200);pc.channel('rd-input').open();
  assert.equal(pc.closed,0);assert.equal(h.viewer.gen,1);assert.equal(pc.channel('rd-input').sent.some(x=>x.a.kind==='type'),false);assert.equal(pc.channel('rd-input').sent[0].a.kind,'release_all');
});
test('missing reliable receipt and host executor rejection recover channel on the same connection',async t=>{
  const h=await harness(t);await h.viewer.start();h.open();const pc=h.viewer.pc;h.viewer.send({kind:'keypress',key:'A'});
  await h.advance(1500);assert.equal(pc.closed,0);assert.equal(h.states.at(-1).state,'input_reconnecting');await h.advance(200);pc.channel('rd-input').open();h.receipt(h.viewer.lastSequence());
  h.viewer.send({kind:'keypress',key:'B'});h.receipt(h.viewer.lastSequence(),'rejected',{reason:'input_executor_failed'});assert.equal(pc.closed,0);assert.equal(h.states.at(-1).state,'input_reconnecting');
});
test('unreliable move receipts may disappear without causing input recovery',async t=>{
  const h=await harness(t);await h.viewer.start();h.open();const pc=h.viewer.pc;h.viewer.send({kind:'move',x:.2,y:.4});await h.advance(2000);
  assert.equal(pc.channel('rd-fast').closeCount,0);assert.equal(pc.channels.length,3);assert.equal(pc.closed,0);
});
test('buffer backpressure keeps 32 non-move actions and coalesces moves without receipt credits',async t=>{
  const h=await harness(t);await h.viewer.start();h.open();const pc=h.viewer.pc;const reliable=pc.channel('rd-input'),fast=pc.channel('rd-fast');reliable.bufferedAmount=fast.bufferedAmount=256*1024+1;
  for(let i=0;i<32;i++)assert.equal(h.viewer.send({kind:'keypress',key:String(i)}),true);
  assert.equal(h.viewer.send({kind:'keypress',key:'overflow'}),false);
  for(let i=0;i<100;i++)assert.equal(h.viewer.send({kind:'move',x:i/100,y:.5}),true);
  assert.equal(h.viewer.lastSequence(),0);reliable.low();fast.low();assert.equal(reliable.sent.length,32);assert.equal(fast.sent.length,1);assert.equal(fast.sent[0].a.x,.99);
  h.viewer.send({kind:'keypress',key:'no credit gate'});assert.equal(reliable.sent.length,33);
});
test('16KiB UTF-8 packet limit is independent of removed ARTC 1KiB cap',async t=>{
  const h=await harness(t);await h.viewer.start();h.open();assert.equal(h.viewer.send({kind:'type',text:'中'.repeat(1000)}),true);
  assert.equal(h.viewer.send({kind:'type',text:'中'.repeat(6000)}),false);assert.equal(h.viewer.lastSequence(),1);
});
test('handoff waits for exact executed release, ignores forged/duplicate receipts, freezes until finish',async t=>{
  const h=await harness(t);await h.viewer.start();h.open();h.viewer.send({kind:'key_down',key:'Shift'});let done=false;
  const handoff=h.viewer.releaseForHandoff().then(()=>done=true);const seq=h.viewer.lastSequence();h.receipt(seq+1);h.receipt(seq,'executed',{sid:'wrong'});h.receipt(seq,'executed',{v:2});
  await Promise.resolve();assert.equal(done,false);assert.equal(h.viewer.send({kind:'keypress',key:'B'}),false);
  h.receipt(seq);await handoff;h.receipt(seq,'rejected');assert.equal(done,true);assert.equal(h.viewer.send({kind:'keypress',key:'B'}),false);
  h.viewer.finishHandoff();assert.equal(h.viewer.send({kind:'keypress',key:'B'}),true);
});
for(const status of ['merged','rejected'])test(`handoff ${status} rejects exact barrier and resumes input`,async t=>{
  const h=await harness(t);await h.viewer.start();h.open();const handoff=h.viewer.releaseForHandoff();h.receipt(h.viewer.lastSequence(),status);await assert.rejects(handoff,{message:`input_receipt_${status}`});assert.equal(h.viewer.send({kind:'keypress',key:'B'}),true);
});
test('handoff timeout rejects and recovers input without closing picture',async t=>{
  const h=await harness(t);await h.viewer.start();h.open();const handoff=h.viewer.releaseForHandoff();const rejected=assert.rejects(handoff,/timeout/);await h.advance(1500);await rejected;assert.equal(h.viewer.pc.closed,0);
});
test('control backpressure drops ping/report without blocking input or replacing channel',async t=>{
  const h=await harness(t);await h.viewer.start();h.open();const pc=h.viewer.pc;pc.channel('rd-ctl').bufferedAmount=300000;
  assert.equal(h.viewer.sendControl({t:'rd.viewer_report'}),false);assert.equal(h.viewer.send({kind:'keypress',key:'A'}),true);h.receipt(h.viewer.lastSequence());await h.advance(1200);
  assert.equal(pc.channels.length,3);assert.equal(pc.channel('rd-ctl').closeCount,0);
});
test('slow replacement channel is allowed to open and old channel handlers cannot recover again',async t=>{
  const h=await harness(t);await h.viewer.start();h.open();const pc=h.viewer.pc;const old=pc.channel('rd-fast');old.error();await h.advance(200);const replacement=pc.channel('rd-fast');await h.advance(300);replacement.open();await h.advance(1000);
  assert.equal(pc.channels.filter(c=>c.label==='rd-fast').length,2);assert.equal(replacement.closeCount,0);assert.equal(old.onclose,null);
});
test('control channel reconnect delays do not cascade into reliable input timeout faults',async t=>{
  const h=await harness(t);await h.viewer.start();h.open();const pc=h.viewer.pc;pc.channel('rd-ctl').close();await h.advance(1800);
  assert.equal(pc.channels.filter(c=>c.label==='rd-input').length,1);assert.equal(pc.channel('rd-input').closeCount,0);
  pc.channel('rd-ctl').open();h.receipt(h.viewer.lastSequence());assert.equal(pc.closed,0);
});
test('explicit stream reattachment starts sequence above the prior engine floor',async t=>{
  const h=await harness(t,{sequenceFloor:123});await h.viewer.start();h.open();h.viewer.send({kind:'keypress',key:'A'});assert.equal(h.viewer.lastSequence(),124);assert.equal(h.viewer.pc.channel('rd-input').sent[0].seq,124);
});
