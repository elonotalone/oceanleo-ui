import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './helpers/rd-input-harness.mjs';

test('a thousand unsent moves coalesce behind eight exact terminal credits',async t=>{
 const h=await harness(t);for(let i=0;i<1000;i++)h.stream.send({kind:'move',x:i/1000,y:.5});
 assert.equal(h.peer.sent.length,8);assert.equal(h.stream.diagnostics().queued_soft_count,1);
 h.receipt(1,'merged');assert.equal(h.peer.sent.length,9);assert.equal(h.peer.sent.at(-1).a.x,.999);
});
test('soft coalescing preserves pointer/key/text barriers and total scroll distance',async t=>{
 const h=await harness(t);for(let i=0;i<8;i++)h.stream.send({kind:'keypress',key:'Enter'});
 const queue=[{kind:'pointer_down',x:0,y:0},{kind:'move',x:.2,y:.2},{kind:'move',x:.5,y:.5},{kind:'scroll',deltaY:2},{kind:'scroll',deltaY:3},{kind:'type',text:'hello'},{kind:'pointer_up',x:1,y:1}];
 for(const a of queue)h.stream.send(a);for(let i=1;i<=8;i++)h.receipt(i);
 assert.deepEqual(h.peer.sent.slice(8).map(x=>x.a.kind),['pointer_down','move','scroll','type','pointer_up']);assert.equal(h.peer.sent[9].a.x,.5);assert.equal(h.peer.sent[10].a.deltaY,5);
});
test('a detached DC never sends new input on the control websocket or replays written seqs',async t=>{
 const h=await harness(t);h.stream.send({kind:'key_down',key:'Shift'});h.stream.attachDataChannel(null);
 assert.equal(h.stream.send({kind:'type',text:'unsent'}),false);assert.ok(h.errors.includes('media_data_channel_unavailable'));
 assert.equal(h.socket.sent.some(x=>x.type==='input'),false);assert.equal(h.peer.sent.filter(x=>x.seq===1).length,1);
});
test('oversized input is refused without WS fallback or consuming a sequence',async t=>{
 const h=await harness(t);assert.equal(h.stream.send({kind:'type',text:'x'.repeat(2000)}),false);assert.equal(h.peer.sent.length,0);assert.equal(h.stream.lastSequence(),0);
 assert.equal(h.socket.sent.some(x=>x.type==='input'),false);assert.equal(h.stream.send({kind:'keypress',key:'Enter'}),true);assert.equal(h.peer.sent[0].seq,1);
});
test('a throwing DC write reserves its sequence and never replays the business action',async t=>{
 const h=await harness(t);let calls=0;h.peer.send=()=>{calls++;throw Error('unknown write');};
 assert.equal(h.stream.send({kind:'click',x:.5,y:.5}),false);assert.ok(h.errors.includes('input_ack_unknown'));assert.equal(h.stream.lastSequence()>=1,true);
 assert.equal(h.socket.sent.some(x=>x.type==='input'),false);assert.equal(h.stream.send({kind:'click',x:.5,y:.5}),false);
});
test('legacy cumulative metrics cannot release any receipt credit',async t=>{
 const h=await harness(t);for(let i=0;i<9;i++)h.stream.send({kind:'keypress',key:'Enter'});
 h.socket.message({type:'state',state:'active',acked_seq:999,input_receipt_version:1,input_diagnostics:{input_completed_seq:999},media_status:{state:'publishing',metrics:{dc_input_seq:999,input_completed_seq:999}}});
 assert.equal(h.peer.sent.length,8);assert.equal(h.stream.diagnostics().outstanding_count,8);h.receipt(4,'rejected');assert.equal(h.peer.sent.length,9);
});
test('close releases held input over DC only and disposes the listener',async t=>{
 const h=await harness(t);h.stream.send({kind:'pointer_down',x:.5,y:.5});h.stream.close();
 assert.equal(h.peer.sent.at(-1).a.kind,'release_all');assert.equal(h.peer.sent.at(-1).seq>1,true);assert.equal(h.socket.sent.some(x=>x.type==='input'),false);
 h.receipt(1);assert.equal(h.samples.length,0);
});
