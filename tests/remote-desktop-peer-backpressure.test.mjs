import assert from 'node:assert/strict';
import test from 'node:test';
import { compileModule, dataModule, realModule } from './helpers/module-bench.mjs';

const source = process.env.W4B_SOURCE_BASE || '.';
const api = await import(await compileModule(`${source}/src/api/remote-desktop.ts`, {
  '../lib/auth/client': dataModule('export async function accessToken(){return "fixture-token";}'),
  '../lib/auth/config': dataModule('export const GATEWAY_BASE="https://fixture.invalid";'),
  './device-settings': dataModule('export function controllerHeaders(){return {"X-OceanLeo-Controller":"fixture"};} export function registerController(){}'),
  './remote-desktop-scheduler': realModule(`${source}/src/api/remote-desktop-scheduler.ts`),
  './remote-desktop-retry': realModule('src/api/remote-desktop-retry.ts'),
  './remote-desktop-control-timing': realModule('src/api/remote-desktop-control-timing.ts'),
  './remote-desktop-diagnostics': realModule('src/api/remote-desktop-diagnostics.ts'),
}));

class Socket {
  static OPEN=1; static latest;
  readyState=1; bufferedAmount=0; sent=[];
  constructor(){Socket.latest=this;}
  send(payload){this.sent.push(JSON.parse(payload));}
  close(){this.readyState=3;}
  message(value){this.onmessage?.({data:JSON.stringify(value)});}
}
const inputs=h=>h.socket.sent.filter(m=>m.type==='input');
const peer=()=>({sent:[],send(payload){this.sent.push(JSON.parse(payload));return true;}});
const motion=x=>({kind:'move',x,y:.5});
async function harness(t){
  t.mock.timers.enable({apis:['Date','setInterval','setTimeout'],now:1000});
  globalThis.window={location:{href:'https://fixture.invalid/devices'}};globalThis.WebSocket=Socket;
  const errors=[],callbacks=[];
  const pending=api.remoteDesktopClient.openStream('fixture-device','fixture-session',{state:s=>callbacks.push(['state',s]),frame(){},media:()=>callbacks.push(['media']),inputDiagnostics:()=>callbacks.push(['input_diagnostics']),error:e=>{errors.push(e);callbacks.push(['error',e]);}});
  await new Promise(setImmediate);const socket=Socket.latest;socket.onopen();socket.message({type:'state',state:'active',acked_seq:0});
  const stream=(await pending).data;
  const h={socket,stream,errors,callbacks,acked:0,step(ms=25){t.mock.timers.tick(ms);},
    report(admitted,completed){socket.message({type:'state',state:'active',acked_seq:h.acked,media:null,media_status:{state:'publishing',metrics:{version:1,...(admitted===undefined?{}:{dc_input_seq:admitted}),...(completed===undefined?{}:{input_completed_seq:completed})}}});},
    retireWs(seq){socket.message({type:'input_ack',seq});h.acked=Math.max(h.acked,seq);socket.message({type:'state',state:'active',acked_seq:h.acked});},
    stop(){stream.close();t.mock.timers.reset();}};
  t.after(()=>h.stop());return h;
}
function trust(h,p,completed=2){h.stream.attachDataChannel(p);h.stream.send(motion(0));assert.equal(p.sent[0].a.kind,'release_all');h.retireWs(2);h.report(1,completed);h.step();}

test('continuous input pauses new WS writes at trusted handover and eventually moves the shared queue to DC',async t=>{
  const h=await harness(t),p=peer();h.stream.attachDataChannel(p);h.stream.send(motion(0));
  for(let i=1;i<20;i++)h.stream.send(motion(i/20));
  const earlier=inputs(h).map(m=>m.seq);assert.equal(earlier.length,8);h.report(1,0);
  for(const seq of earlier){for(let i=0;i<20;i++)h.stream.send(motion(.9));h.retireWs(seq);}
  h.step();
  assert.equal(inputs(h).length,earlier.length,'trust latches a handover; new motion cannot refill WS');
  assert.equal(p.sent.at(-1).a.kind,'move');assert.equal(p.sent.at(-1).a.x,.9);assert.equal(h.stream.inputPath(),'data_channel');assert.deepEqual(h.errors,[]);
});
test('completion-supported DC has at most eight actual pending writes while unsent motion coalesces',async t=>{
  const h=await harness(t),p=peer();trust(h,p,0);p.sent.length=0;
  for(let i=0;i<1000;i++)assert.equal(h.stream.send(motion(i/1000)),true);
  assert.equal(p.sent.length,8);assert.equal(inputs(h).length,1);assert.equal(h.stream.diagnostics().outstanding_count,8);assert.equal(h.stream.diagnostics().queued_count,1);
  h.report(10,0);h.step();assert.equal(p.sent.length,8,'admission cannot release completion credits');
  h.report(10,3);h.step();assert.equal(p.sent.length,9);assert.equal(p.sent.at(-1).a.x,.999);assert.equal(h.stream.diagnostics().outstanding_count,8);
});
test('soft coalescing under full peer credits preserves key/click/text barriers and wheel distance',async t=>{
  const h=await harness(t),p=peer();trust(h,p);p.sent.length=0;
  for(let i=0;i<8;i++)h.stream.send(motion(i/10));
  for(let i=0;i<100;i++)h.stream.send(motion(i/100));
  for(const action of [{kind:'key_down',key:'Shift'},{kind:'pointer_down',x:.2,y:.2},{kind:'type',text:'hello'}])h.stream.send(action);
  for(let i=0;i<100;i++)h.stream.send({kind:'scroll',deltaY:1});
  h.stream.send({kind:'pointer_up',x:.2,y:.2});h.stream.send({kind:'key_up',key:'Shift'});
  assert.equal(p.sent.length,8);h.report(10,10);h.step();
  assert.deepEqual(p.sent.slice(8).map(m=>m.a.kind),['move','key_down','pointer_down','type','scroll','pointer_up','key_up']);
  assert.equal(p.sent[8].a.x,.99);assert.equal(p.sent[12].a.deltaY,100);assert.equal(new Set(p.sent.map(m=>m.seq)).size,p.sent.length);assert.equal(inputs(h).length,1);
});
test('first completion zero upgrades legacy admission credit and stale completion cannot release credits',async t=>{
  const h=await harness(t),p=peer();trust(h,p,null);p.sent.length=0;
  for(let i=0;i<8;i++)h.stream.send({kind:'keypress',key:'ArrowRight'});
  h.report(10);h.step();h.report(10,0);
  h.stream.send({kind:'keypress',key:'Enter'});h.report(10,0);h.step();
  assert.equal(p.sent.length,8,'earlier legacy writes must retire before upgraded sends');
  h.report(10,10);h.step();assert.equal(p.sent.length,9);assert.equal(p.sent.at(-1).a.key,'Enter');
  for(let i=0;i<20;i++)h.stream.send(motion(.4));h.report(p.sent.at(-1).seq,10);h.step();assert.equal(h.stream.diagnostics().outstanding_count,8);
});
test('an oversized action waits for prior peer retirement and later DC waits for the WS action to retire',async t=>{
  const h=await harness(t),p=peer();trust(h,p);p.sent.length=0;
  h.stream.send({kind:'key_down',key:'Shift'});const prior=p.sent.at(-1).seq;
  h.stream.send({kind:'type',text:'长'.repeat(400)});h.stream.send({kind:'key_up',key:'Shift'});
  assert.equal(inputs(h).length,1);assert.equal(p.sent.length,1);
  h.report(prior,prior);h.step();const text=inputs(h).at(-1);assert.equal(text.action.kind,'type');assert.ok(text.seq>prior);assert.equal(p.sent.length,1);
  h.retireWs(text.seq);h.step();assert.equal(p.sent.at(-1).a.kind,'key_up');assert.ok(p.sent.at(-1).seq>text.seq);assert.deepEqual(h.errors,[]);
});
test('a detached peer fences queued WS fallback behind every earlier peer write',async t=>{
  const h=await harness(t),p=peer();trust(h,p);p.sent.length=0;
  h.stream.send({kind:'pointer_down',x:.2,y:.2});const prior=p.sent.at(-1).seq;
  h.stream.attachDataChannel(null);h.stream.send({kind:'pointer_up',x:.2,y:.2});assert.equal(inputs(h).length,1);
  h.report(prior,prior-1);h.step();assert.equal(inputs(h).length,1);h.report(prior,prior);h.step();
  assert.equal(inputs(h).at(-1).action.kind,'pointer_up');assert.ok(inputs(h).at(-1).seq>prior);assert.deepEqual(h.errors,[]);
});
test('a definitely unwritten false peer send can use WS once, after prior peer retirement',async t=>{
  const h=await harness(t),p=peer();trust(h,p);p.sent.length=0;
  h.stream.send({kind:'key_down',key:'Control'});const prior=p.sent.at(-1).seq;p.send=()=>false;
  h.stream.send({kind:'key_up',key:'Control'});assert.equal(inputs(h).length,1);
  h.report(prior,prior);h.step();assert.deepEqual(inputs(h).slice(1).map(m=>m.action),[{kind:'key_up',key:'Control'}]);assert.deepEqual(h.errors,[]);
});
test('a peer throw after possible side effect is never replayed on WS and consumes its sequence',async t=>{
  const h=await harness(t),p=peer();trust(h,p);p.sent.length=0;
  p.send=function(payload){this.sent.push(JSON.parse(payload));throw new Error('possibly-written');};
  h.stream.send({kind:'key_down',key:'Shift'});await new Promise(setImmediate);h.step();
  const attempted=p.sent.find(m=>m.a.kind==='key_down');assert.ok(attempted);assert.equal(inputs(h).some(m=>m.action.kind==='key_down'),false);
  assert.deepEqual(h.errors,['input_ack_unknown']);assert.ok(inputs(h).at(-1).seq>attempted.seq);assert.equal(inputs(h).at(-1).action.kind,'release_all');assert.equal(h.socket.readyState,3);
});
test('partial completion progress cannot reset the original oldest outstanding deadline',async t=>{
  const h=await harness(t),p=peer();trust(h,p);p.sent.length=0;
  for(let i=0;i<8;i++)h.stream.send({kind:'keypress',key:'ArrowRight'});
  h.step(800);h.report(10,3);h.step(800);
  assert.deepEqual(h.errors,['input_ack_unknown']);assert.equal(inputs(h).filter(m=>m.action.kind==='keypress').length,0);assert.equal(h.socket.readyState,3);
});
test('explicit handoff drains peer retirement before WS release and completes only on WS retirement',async t=>{
  const h=await harness(t),p=peer();trust(h,p);p.sent.length=0;
  h.stream.send({kind:'key_down',key:'Control'});const seq=p.sent.at(-1).seq;
  let done=false;const wait=h.stream.releaseForHandoff().then(()=>{done=true;});void wait.catch(()=>{});
  assert.equal(h.stream.send(motion(.5)),false);assert.equal(inputs(h).length,1);h.report(seq,seq);h.step();
  const release=inputs(h).at(-1);assert.equal(release.action.kind,'release_all');assert.ok(release.seq>seq);
  h.socket.message({type:'input_ack',seq:release.seq});await Promise.resolve();assert.equal(done,false);
  h.acked=release.seq;h.socket.message({type:'state',state:'active',acked_seq:release.seq});await wait;assert.equal(done,true);
  assert.equal(h.stream.send(motion(.6)),false);h.stream.finishHandoff();assert.equal(h.stream.send(motion(.7)),true);
});
test('a completion frontier beyond the local sequence fails closed rather than granting future credit',async t=>{
  const h=await harness(t),p=peer();trust(h,p);h.report(1,100);h.step();
  assert.deepEqual(h.errors,['input_ack_unknown']);assert.equal(h.socket.readyState,3);
});
test('invalid completion types do not negotiate retirement support or release a full legacy peer window',async t=>{
  const h=await harness(t),p=peer();trust(h,p,null);p.sent.length=0;
  for(let i=0;i<9;i++)h.stream.send({kind:'keypress',key:'Enter'});
  for(const invalid of [true,'10',-1,Number.MAX_SAFE_INTEGER+1])h.report(undefined,invalid);
  h.step();assert.equal(p.sent.length,8);assert.deepEqual(h.errors,[]);h.report(10);h.step();assert.equal(p.sent.length,9);
});
test('definitely rejected WS retries keep their original lane/sequence during trusted peer handover',async t=>{
  const h=await harness(t),p=peer();h.stream.attachDataChannel(p);h.stream.send({kind:'keypress',key:'ArrowDown'});
  h.socket.message({type:'input_rejected',seq:2,error:'rate_limited',retry_after_ms:25});h.report(1,0);h.stream.send(motion(.9));
  h.step(24);assert.equal(inputs(h).length,1);h.step(1);assert.deepEqual(inputs(h).map(m=>m.seq),[2,2]);
  assert.equal(p.sent.length,1);h.retireWs(2);h.step();assert.equal(p.sent.at(-1).seq,3);assert.equal(p.sent.at(-1).a.kind,'move');assert.deepEqual(h.errors,[]);
});
test('completion carried only in input_diagnostics releases the same bounded peer credits',async t=>{
  const h=await harness(t),p=peer();trust(h,p,0);p.sent.length=0;
  for(let i=0;i<9;i++)h.stream.send(motion(i/10));assert.equal(p.sent.length,8);
  h.socket.message({type:'state',state:'active',acked_seq:2,input_diagnostics:{input_completed_seq:3}});h.step();
  assert.equal(p.sent.length,9);assert.equal(p.sent.at(-1).a.x,.8);assert.equal(h.stream.diagnostics().outstanding_count,8);
});
test('a WS send throwing after a possible write is not retried and keeps the reconnect floor above its seq',async t=>{
  const h=await harness(t),p=peer();trust(h,p);
  const original=h.socket.send.bind(h.socket);let attempted=0;
  h.socket.send=function(payload){const message=JSON.parse(payload);original(payload);if(message.type==='input'&&message.action.kind==='type'){attempted=message.seq;throw new Error('possibly-written');}};
  h.stream.send({kind:'type',text:'长'.repeat(400)});await new Promise(setImmediate);h.step();
  assert.ok(attempted);assert.equal(inputs(h).filter(m=>m.action.kind==='type').length,1);assert.ok(h.stream.lastSequence()>=attempted);assert.deepEqual(h.errors,['input_ack_unknown']);assert.equal(h.socket.readyState,3);
});
test('a replacement lane can be probed after all real peer credits retire without confusing WS bookkeeping',async t=>{
  const h=await harness(t),first=peer(),second=peer();trust(h,first);h.stream.send(motion(.3));const seq=first.sent.at(-1).seq;
  h.report(seq,seq);h.stream.attachDataChannel(second);h.stream.send(motion(.4));
  assert.deepEqual(second.sent.map(m=>[m.seq,m.a.kind]),[[seq+1,'release_all']]);assert.equal(inputs(h).at(-1).seq,seq+2);assert.deepEqual(h.errors,[]);
});
test('a late-attached lane drains prior WS under continuous motion and gets a probe despite queued unsent motion',async t=>{
  const h=await harness(t),p=peer();
  for(let i=0;i<20;i++)h.stream.send(motion(i/20));const prior=inputs(h).map(m=>m.seq);assert.equal(prior.length,8);
  h.stream.attachDataChannel(p);
  for(const seq of prior){for(let i=0;i<20;i++)h.stream.send(motion(.9));h.retireWs(seq);h.step();}
  assert.equal(p.sent.length,1,'late attach must not wait for the unsent gesture queue to become empty');
  const probe=p.sent[0];assert.equal(probe.a.kind,'release_all');assert.ok(probe.seq>Math.max(...prior));
  const following=inputs(h).filter(m=>m.seq>probe.seq);assert.ok(following.length,'WS resumes while proof is pending');
  assert.equal(new Set([...inputs(h),...p.sent].map(m=>m.seq)).size,inputs(h).length+p.sent.length,'probe cannot collide with an offered queue entry');
  h.report(probe.seq,probe.seq);for(const m of following)h.retireWs(m.seq);h.stream.send(motion(.95));h.step();
  assert.equal(p.sent.at(-1).a.kind,'move');assert.equal(p.sent.at(-1).a.x,.95);assert.deepEqual(h.errors,[]);
});
test('an unproven late-attach probe allows WS motion and retries after lost startup probes under continuous input',async t=>{
  const h=await harness(t),p=peer();for(let i=0;i<12;i++)h.stream.send(motion(i/12));h.stream.attachDataChannel(p);
  for(let round=0;round<5;round++){
    for(let i=0;i<40;i++)h.stream.send(motion(i/40));
    for(const item of inputs(h).filter(m=>m.seq>h.acked))h.retireWs(item.seq);h.step();
    assert.equal(p.sent.length,round+1,'one new harmless probe per failed receipt interval');
    const before=inputs(h).length;for(let i=0;i<20;i++){h.stream.send(motion(i/20));for(const item of inputs(h).filter(m=>m.seq>h.acked))h.retireWs(item.seq);h.step();}
    assert.ok(inputs(h).length>before,'an unproven probe cannot freeze WS motion');
    if(round<4)h.step(1600);
  }
  assert.deepEqual(p.sent.map(m=>m.a.kind),Array(5).fill('release_all'));assert.deepEqual(h.errors,[]);
});
test('late attachment never probes away a held key or button and retires the real release before probing',async t=>{
  const h=await harness(t),p=peer();h.stream.send({kind:'key_down',key:'Shift'});h.stream.send({kind:'pointer_down',x:.2,y:.2});
  for(const item of inputs(h))h.retireWs(item.seq);h.stream.attachDataChannel(p);
  for(let i=0;i<20;i++){h.stream.send(motion(.3));h.retireWs(inputs(h).at(-1).seq);h.step();}
  assert.equal(p.sent.length,0,'actual held input forbids release_all probe');
  h.socket.bufferedAmount=65001;h.stream.send({kind:'key_up',key:'Shift'});h.stream.send({kind:'pointer_up',x:.2,y:.2});h.step();
  assert.equal(p.sent.length,0,'queued logical releases are not actual released state');
  h.socket.bufferedAmount=0;h.step();const releases=inputs(h).filter(m=>['key_up','pointer_up'].includes(m.action.kind));assert.equal(releases.length,2);
  assert.equal(p.sent.length,0);for(const item of releases)h.retireWs(item.seq);h.stream.send(motion(.4));h.step();
  assert.equal(p.sent.length,1);assert.ok(p.sent[0].seq>releases.at(-1).seq);assert.deepEqual(h.errors,[]);
});
test('late probe drain requires prior WS retirement and cannot substitute acceptance or an empty queue',async t=>{
  const h=await harness(t),p=peer();for(let i=0;i<4;i++)h.stream.send(motion(i/4));const prior=inputs(h).map(m=>m.seq);
  h.stream.attachDataChannel(p);for(let i=0;i<50;i++)h.stream.send(motion(.8));
  for(const seq of prior)h.socket.message({type:'input_ack',seq});h.step();
  assert.equal(p.sent.length,0);assert.equal(inputs(h).length,prior.length,'new soft WS writes pause until retirement');
  h.acked=prior.at(-1);h.socket.message({type:'state',state:'active',acked_seq:h.acked});h.step();
  assert.equal(p.sent.length,1);assert.ok(p.sent[0].seq>h.acked);assert.ok(inputs(h).at(-1).seq>p.sent[0].seq);assert.deepEqual(h.errors,[]);
});
test('queued reliable barriers drain over WS before a late probe even when desired held state is empty',async t=>{
  const h=await harness(t),p=peer();for(let i=0;i<12;i++)h.stream.send(motion(i/12));h.stream.attachDataChannel(p);
  h.stream.send({kind:'key_down',key:'Control'});h.stream.send({kind:'key_up',key:'Control'});h.stream.send(motion(.9));
  assert.equal(h.stream.diagnostics().held_key_count,0);h.socket.message({type:'input_ack',seq:1});h.socket.message({type:'input_ack',seq:2});h.socket.message({type:'input_ack',seq:3});
  const keys=inputs(h).filter(m=>m.action.kind.startsWith('key_'));assert.deepEqual(keys.map(m=>m.action.kind),['key_down','key_up']);assert.equal(p.sent.length,0);
  for(const item of inputs(h))h.retireWs(item.seq);h.step();
  assert.equal(p.sent.length,1);assert.ok(p.sent[0].seq>keys.at(-1).seq);assert.deepEqual(h.errors,[]);
});
test('a pending explicit handoff drains its real WS release without inserting an untrusted probe',async t=>{
  const h=await harness(t),p=peer();for(let i=0;i<8;i++)h.stream.send(motion(i/8));h.stream.attachDataChannel(p);h.stream.send(motion(.9));
  let done=false;const wait=h.stream.releaseForHandoff().then(()=>{done=true;});void wait.catch(()=>{});
  for(const item of inputs(h))h.retireWs(item.seq);h.step();assert.equal(p.sent.length,0);
  const release=inputs(h).find(m=>m.action.kind==='release_all');assert.ok(release);assert.equal(done,false);h.retireWs(release.seq);await wait;
  assert.equal(done,true);assert.equal(p.sent.length,0);assert.deepEqual(h.errors,[]);
});
test('continuous atomic keypress input can drain for a late probe without losing or coalescing reliable actions',async t=>{
  const h=await harness(t),p=peer(),accepted=[];const offer=i=>{const action={kind:'keypress',key:['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'][i%4]};if(h.stream.send(action))accepted.push(action.key);};
  for(let i=0;i<20;i++)offer(i);const prior=inputs(h).map(m=>m.seq);h.stream.attachDataChannel(p);for(let i=20;i<60;i++)offer(i);
  for(const seq of prior){h.retireWs(seq);h.step();}assert.equal(p.sent.length,1,'never-written atomic keypresses cannot starve the probe');
  const probe=p.sent[0];h.report(probe.seq,probe.seq);for(const item of inputs(h).filter(m=>m.seq>probe.seq))h.retireWs(item.seq);h.step();
  for(let round=0;round<10&&h.stream.diagnostics().queued_count;round++){const latest=p.sent.at(-1).seq;h.report(latest,latest);h.step();assert.ok(h.stream.diagnostics().outstanding_count<=8);}
  const actual=[...inputs(h).map(m=>({seq:m.seq,action:m.action})),...p.sent.map(m=>({seq:m.seq,action:m.a}))].filter(m=>m.action.kind==='keypress').sort((a,b)=>a.seq-b.seq);
  assert.deepEqual(actual.map(m=>m.action.key),accepted);assert.equal(h.stream.diagnostics().queued_count,0);assert.deepEqual(h.errors,[]);
});
for(const branch of ['input_diagnostics','media_completion','media_admission'])test(`terminal ahead ${branch} receipt cannot emit active or media callbacks after failure`,async t=>{
  const h=await harness(t),p=peer();trust(h,p);h.callbacks.length=0;
  if(branch==='input_diagnostics')h.socket.message({type:'state',state:'active',acked_seq:h.acked,input_diagnostics:{input_completed_seq:100},media:null,media_status:{state:'publishing',metrics:{version:1}}});
  else h.report(branch==='media_admission'?100:1,branch==='media_completion'?100:2);
  assert.deepEqual(h.errors,['input_ack_unknown']);const terminal=h.callbacks.findIndex(event=>event[0]==='error');assert.ok(terminal>=0);
  assert.deepEqual(h.callbacks.slice(terminal+1),[],'terminal receipt failure cannot continue dispatching this state');
  const count=h.callbacks.length;h.socket.message({type:'state',state:'active',acked_seq:0,media:null,media_status:{state:'publishing',metrics:{version:1}}});h.step(2000);
  assert.equal(h.callbacks.length,count);assert.equal(h.stream.send(motion(.8)),false);assert.equal(h.socket.readyState,3);
});
test('a refused last WS write cannot stall the probe or later motion after input is allowed again',async t=>{
  const h=await harness(t),p=peer();
  h.stream.send(motion(.1));const refused=inputs(h).at(-1).seq;
  h.socket.message({type:'input_rejected',seq:refused,error:'input_not_allowed'});
  h.stream.attachDataChannel(p);
  const retireAll=()=>{for(const m of inputs(h))if(m.seq!==refused&&m.seq>h.acked)h.retireWs(m.seq);};
  for(let i=0;i<300;i++){h.stream.send(motion(i/300));retireAll();h.step(16);}
  assert.ok(p.sent.some(m=>m.a.kind==='release_all'),'the refused seq is not a retirement fence for the probe');
  assert.ok(inputs(h).filter(m=>m.seq>refused).length+p.sent.filter(m=>m.a.kind==='move').length>0,'motion resumes after the refusal');
  assert.deepEqual(h.errors,[]);
});
test('a host report that drops completion falls back to admission credit instead of closing',async t=>{
  const h=await harness(t),p=peer();trust(h,p,0);p.sent.length=0;
  for(let i=0;i<20;i++)h.stream.send(motion(i/20));
  assert.equal(p.sent.length,8);const top=p.sent.at(-1).seq;
  h.report(top);h.step();
  for(let i=0;i<4;i++){h.stream.send(motion(.7));h.report(p.sent.at(-1).seq);h.step(600);}
  assert.deepEqual(h.errors,[],'completion gap is not input_ack_unknown');
  assert.ok(p.sent.length>8,'admission credit keeps DC moving');assert.equal(h.stream.inputPath(),'data_channel');
});
