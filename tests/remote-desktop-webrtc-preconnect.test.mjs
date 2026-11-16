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
function setup(t){t.mock.timers.enable({apis:['setInterval']});t.mock.property(globalThis,'WebSocket',Socket);Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{href:'https://oceanbizs.com/devices'}}});t.after(()=>delete globalThis.window);Socket.all=[];}
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
