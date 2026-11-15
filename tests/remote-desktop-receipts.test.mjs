import assert from 'node:assert/strict';
import test from 'node:test';
import { harness, api } from './helpers/rd-input-harness.mjs';
import { REMOTE_MEDIA_FRAME_TIMEOUT_MS } from '../src/pages/remote-desktop-media.ts';

test('eight DC credits retire only by exact terminal seq, once for each outcome',async t=>{
 const h=await harness(t);for(let i=0;i<10;i++)h.stream.send({kind:'keypress',key:'Enter'});
 assert.equal(h.peer.sent.length,8);h.receipt(8,'merged');assert.equal(h.peer.sent.length,9);
 h.receipt(8);assert.equal(h.peer.sent.length,9);h.receipt(3,'rejected');assert.equal(h.peer.sent.length,10);
 assert.deepEqual(h.samples.map(x=>[x.seq,x.status]),[[8,'merged'],[3,'rejected']]);
 assert.equal(h.stream.diagnostics().outstanding_count,8);assert.equal(h.socket.sent.some(x=>x.type==='input'),false);
});
test('receipt RTT uses the viewer monotonic clock and terminal outcomes cannot be overwritten',async t=>{
 const h=await harness(t);h.stream.send({kind:'move',x:.1,y:.2});h.advance(23);h.receipt(1,'executed',{executed_at_ms:9000000000000});h.receipt(1,'rejected');
 assert.equal(h.samples.length,1);assert.equal(h.samples[0].elapsedMs,23);assert.equal(h.stream.inputHistory.get(1).receipt.status,'executed');
});
test('future, wrong-session, wrong-version and malformed terminal receipts grant no credit',async t=>{
 const h=await harness(t,{floor:40});for(let i=0;i<9;i++)h.stream.send({kind:'keypress',key:'Enter'});
 for(const seq of [1,40,100])h.receipt(seq);h.receipt(41,'executed',{sid:'other'});h.receipt(41,'executed',{v:2});h.receipt(41,'executed',{executed_at_ms:-1});
 assert.equal(h.peer.sent.length,8);assert.equal(h.samples.length,0);h.receipt(41);assert.equal(h.peer.sent.length,9);
});
test('handoff freezes input until the exact release_all executed and confirmed CAS finishes',async t=>{
 const h=await harness(t);h.stream.send({kind:'key_down',key:'Shift'});let done=false;
 const p=h.stream.releaseForHandoff().then(()=>{done=true;});const release=h.peer.sent.at(-1);assert.equal(release.a.kind,'release_all');
 h.receipt(release.seq+1);h.receipt(1);await Promise.resolve();assert.equal(done,false);assert.equal(h.stream.send({kind:'keypress',key:'Enter'}),false);
 h.receipt(release.seq);await p;assert.equal(h.stream.send({kind:'keypress',key:'Enter'}),false);h.stream.finishHandoff();assert.equal(h.stream.send({kind:'keypress',key:'Enter'}),true);
});
for(const status of ['merged','rejected'])test(`handoff ${status} releases the freeze without resuming AI`,async t=>{
 const h=await harness(t);const p=h.stream.releaseForHandoff();h.receipt(h.peer.sent.at(-1).seq,status);await assert.rejects(p,new RegExp(status));assert.equal(h.stream.send({kind:'keypress',key:'Enter'}),true);
});
test('WS cannot deliver receipts or JPEG, and HTTP media/input APIs no longer exist',async t=>{
 const h=await harness(t);assert.equal(api.parseBinaryFrame,undefined);assert.equal(api.parseFrame,undefined);assert.equal(api.remoteDesktopClient.getFrame,undefined);assert.equal(api.remoteDesktopClient.sendInput,undefined);
 h.stream.send({kind:'keypress',key:'Enter'});h.socket.message({type:'input_receipt',session_id:'session',seq:1,status:'executed',executed_at_ms:1});assert.deepEqual(h.errors,['response_malformed']);assert.equal(h.samples.length,0);
});
test('binary JPEG from a control websocket is rejected before rendering',async t=>{const h=await harness(t);h.socket.message(new ArrayBuffer(32));assert.deepEqual(h.errors,['response_malformed']);});
test('first-frame timeout retains native capture recovery margin',()=>{assert.ok(REMOTE_MEDIA_FRAME_TIMEOUT_MS>=15000);});

test('live view-only access discards unsent input and DC loss does not force a read-only reconnect',async t=>{
 const h=await harness(t);for(let i=0;i<10;i++)h.stream.send({kind:'keypress',key:'Enter'});
 h.socket.message({type:'state',state:'active',access:{input_allowed:false,audio:true}});
 assert.equal(h.stream.diagnostics().queued_count,0);h.stream.attachDataChannel(null);assert.deepEqual(h.errors,[]);
 h.receipt(1);assert.equal(h.peer.sent.length,8);assert.equal(h.stream.send({kind:'type',text:'blocked'}),false);
});
