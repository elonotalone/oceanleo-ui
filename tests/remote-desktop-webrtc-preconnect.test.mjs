import assert from 'node:assert/strict';
import test from 'node:test';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
const api = await import(await compileModule('src/api/remote-desktop-webrtc-preconnect.ts', {
  '../lib/auth/client': dataModule('export async function accessToken(){return "local-token";}'),
  '../lib/auth/config': dataModule('export const GATEWAY_BASE="https://gateway.test";'),
  './device-settings': dataModule('export function controllerHeaders(){return {"X-OceanLeo-Controller":"controller"};}'),
}));
class Socket {
  static OPEN=1; static all=[]; readyState=0; sent=[];
  constructor(url){this.url=url;Socket.all.push(this);}
  send(raw){this.sent.push(JSON.parse(raw));}
  open(){this.readyState=1;this.onopen?.();}
  ready(){this.onmessage?.({data:JSON.stringify({type:'ready',transport:'webrtc-v1',v:1})});}
  close(){this.readyState=3;this.onclose?.();}
}
const drain=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function setup(t){t.mock.timers.enable({apis:['setInterval','setTimeout']});t.mock.property(globalThis,'WebSocket',Socket);Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{href:'https://oceanbizs.com/devices'}}});t.after(()=>delete globalThis.window);Socket.all=[];}
test('preparing authenticates before click without creating or attaching any session',async t=>{
  setup(t);const release=api.prepareRemoteWebRtcSocket('warm-one');t.after(release);await drain();
  const ws=Socket.all[0];assert.match(ws.url,/viewer-stream$/);ws.open();ws.ready();
  assert.deepEqual(ws.sent,[{type:'auth',token:'local-token',controller:'controller'}]);
  assert.equal(api.takePreparedRemoteWebRtcSocket('warm-one','controller'),ws);
  release();assert.equal(ws.readyState,1);assert.equal(api.takePreparedRemoteWebRtcSocket('warm-one','controller'),null);
});
test('unready and wrong-controller sockets cannot be consumed',async t=>{
  setup(t);const release=api.prepareRemoteWebRtcSocket('warm-two');t.after(release);await drain();const ws=Socket.all[0];ws.open();
  assert.equal(api.takePreparedRemoteWebRtcSocket('warm-two','controller'),null);ws.ready();
  assert.equal(api.takePreparedRemoteWebRtcSocket('warm-two','other'),null);release();assert.equal(ws.readyState,3);
});
test('old gateway rejection removes warm connection for legacy fallback',async t=>{
  setup(t);const release=api.prepareRemoteWebRtcSocket('warm-three');await drain();const ws=Socket.all[0];ws.close();
  assert.equal(api.takePreparedRemoteWebRtcSocket('warm-three','controller'),null);release();
});
test('unmount during token read prevents a socket opening later',async t=>{
  setup(t);const release=api.prepareRemoteWebRtcSocket('warm-four');release();await drain();assert.equal(Socket.all.length,0);
});

test('create reuses warm socket and preserves early stream events until adoption',async t=>{
  setup(t);const release=api.prepareRemoteWebRtcSocket('warm-create');t.after(release);await drain();const ws=Socket.all[0];ws.open();ws.ready();
  const body={request_id:'stable-id',transports:['webrtc-v1'],owner_direct:true};
  const promise=api.createPreparedRemoteWebRtcSession('warm-create',body);
  await drain();assert.deepEqual(ws.sent.at(-1),{type:'create',body});
  const session={session_id:'session-id',state:'connecting',transport:'webrtc-v1'};
  ws.onmessage({data:JSON.stringify({type:'created',session})});assert.deepEqual(await promise,session);
  ws.onmessage({data:JSON.stringify({type:'state',state:'connecting'})});
  const adopted=api.takeCreatedRemoteWebRtcSocket('session-id','controller');assert.equal(adopted.socket,ws);assert.equal(adopted.messages.length,1);
  assert.equal(api.takeCreatedRemoteWebRtcSocket('session-id','controller'),null);ws.close();
});
test('warm create timeout allows HTTP fallback with the same idempotency body',async t=>{
  setup(t);const release=api.prepareRemoteWebRtcSocket('warm-timeout');t.after(release);await drain();const ws=Socket.all[0];ws.open();ws.ready();
  const body={request_id:'same-request-id'};const promise=api.createPreparedRemoteWebRtcSession('warm-timeout',body);await drain();
  t.mock.timers.tick(8000);assert.equal(await promise,null);assert.deepEqual(ws.sent.at(-1),{type:'create',body});assert.equal(ws.readyState,3);
});
class InitialPeer {
  static all=[];closed=0;channels=[];
  constructor(configuration){this.configuration=configuration;InitialPeer.all.push(this);}
  addTransceiver(){return {receiver:{},setCodecPreferences(){}};}
  createDataChannel(label,options){const channel={label,options};this.channels.push(channel);return channel;}
  async createOffer(){return {type:'offer',sdp:'prepared-sdp'};}
  close(){this.closed++;}
}
function preparedPeer(t){
  InitialPeer.all=[];
  for(const [key,value] of Object.entries({RTCPeerConnection:InitialPeer,RTCRtpReceiver:{getCapabilities:()=>({codecs:[{mimeType:'video/VP8'}]})}})){
    const previous=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
    t.after(()=>{if(previous)Object.defineProperty(globalThis,key,previous);else delete globalThis[key];});
  }
}
test('warm create carries SDP before descriptor arrives and transfers that peer with its stream',async t=>{
  setup(t);preparedPeer(t);const release=api.prepareRemoteWebRtcSocket('warm-offer');t.after(release);await drain();const ws=Socket.all[0];ws.open();ws.ready();
  const promise=api.createPreparedRemoteWebRtcSession('warm-offer',{request_id:'offer-id'});await drain();
  assert.deepEqual(ws.sent.at(-1),{type:'create',body:{request_id:'offer-id'},offer:{k:'offer',gen:1,sdp:'prepared-sdp'}});
  const pc=InitialPeer.all[0];assert.deepEqual(pc.configuration.iceServers,[]);assert.equal(pc.localDescription,undefined);
  ws.onmessage({data:JSON.stringify({type:'pong'})});assert.equal(ws.readyState,1);
  ws.onmessage({data:JSON.stringify({type:'created',session:{session_id:'offered-session',transport:'webrtc-v1'}})});await promise;
  ws.onmessage({data:JSON.stringify({type:'signal',data:{k:'answer',gen:1,sdp:'early-answer'}})});
  const adopted=api.takeCreatedRemoteWebRtcSocket('offered-session','controller');assert.equal(adopted.initialPeer.pc,pc);
  assert.equal(adopted.messages.length,1);assert.equal(pc.closed,0);pc.close();ws.close();
});
test('warm create failure closes its speculative peer and retains ordinary HTTP fallback',async t=>{
  setup(t);preparedPeer(t);const release=api.prepareRemoteWebRtcSocket('warm-offer-fail');t.after(release);await drain();const ws=Socket.all[0];ws.open();ws.ready();
  const promise=api.createPreparedRemoteWebRtcSession('warm-offer-fail',{request_id:'same-id'});await drain();ws.close();
  assert.equal(await promise,null);assert.equal(InitialPeer.all[0].closed,1);
});
test('unclaimed create disposes its prepared peer after the adoption deadline',async t=>{
  setup(t);preparedPeer(t);const release=api.prepareRemoteWebRtcSocket('warm-offer-unused');t.after(release);await drain();const ws=Socket.all[0];ws.open();ws.ready();
  const promise=api.createPreparedRemoteWebRtcSession('warm-offer-unused',{});await drain();
  ws.onmessage({data:JSON.stringify({type:'created',session:{session_id:'unclaimed-session',transport:'webrtc-v1'}})});await promise;
  t.mock.timers.tick(10000);assert.equal(ws.readyState,3);assert.equal(InitialPeer.all[0].closed,1);
});
test('standby subscribes to a socket warmed during list-status fetch and shares an in-flight handshake',async t=>{
  setup(t);const warm=api.prepareRemoteWebRtcSocket('status-overlap');t.after(warm);await drain();const ws=Socket.all[0];const events=[];
  const standby=api.prepareRemoteWebRtcSocket('status-overlap',{ready:c=>events.push(c)});t.after(standby);await drain();assert.equal(Socket.all.length,1);
  warm();assert.equal(ws.readyState,0,'standby subscription retains the same connecting socket');ws.open();ws.onmessage({data:JSON.stringify({type:'ready',transport:'webrtc-v1',capabilities:['remote-desktop-standby-v1']})});
  assert.deepEqual(events,[['remote-desktop-standby-v1']]);assert.equal(api.takePreparedRemoteWebRtcSocket('status-overlap','controller'),ws);standby();assert.equal(ws.readyState,1);ws.close();
});
test('already-ready signalling can be subscribed without another socket or session create',async t=>{
  setup(t);const warm=api.prepareRemoteWebRtcSocket('already-warm');t.after(warm);await drain();const ws=Socket.all[0];ws.open();ws.ready();let count=0;
  const standby=api.prepareRemoteWebRtcSocket('already-warm',{ready:()=>count++});t.after(standby);await drain();assert.equal(count,1);assert.equal(Socket.all.length,1);assert.ok(ws.sent.every(v=>v.type!=='create'));
});
