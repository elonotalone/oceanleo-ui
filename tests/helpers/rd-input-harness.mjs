import { compileModule, dataModule } from './module-bench.mjs';
export const api = await import(await compileModule('src/api/remote-desktop.ts', {
  '../lib/auth/client': dataModule('export async function accessToken(){return "fixture";}'),
  '../lib/auth/config': dataModule('export const GATEWAY_BASE="https://fixture.invalid";'),
  './device-settings': dataModule('export function controllerHeaders(){return {"X-OceanLeo-Controller":"fixture"};} export function registerController(){}'),
}));
class Socket {
  static OPEN=1; static latest;
  readyState=1; bufferedAmount=0; sent=[];
  constructor(){Socket.latest=this;}
  send(raw){this.sent.push(JSON.parse(raw));}
  message(data){this.onmessage({data:typeof data==='object'&&!(data instanceof ArrayBuffer)?JSON.stringify(data):data});}
  close(){this.readyState=3;}
}
export async function harness(t,{floor=0}={}){
  let now=100;
  t.mock.method(performance,'now',()=>now);
  globalThis.window={location:{href:'https://fixture.invalid/devices'}};
  globalThis.WebSocket=Socket;
  const samples=[],errors=[],states=[];
  const opening=api.remoteDesktopClient.openStream('device','session',{state:(...v)=>states.push(v),frame(){throw Error('JPEG must not render');},error:v=>errors.push(v),controlTiming:v=>samples.push(v)},{sequenceFloor:floor});
  await new Promise(setImmediate);
  const socket=Socket.latest;socket.onopen();socket.message({type:'state',state:'active'});
  const stream=(await opening).data;
  let listener;
  const peer={sent:[],send(raw){this.sent.push(JSON.parse(raw));return true;},subscribe(fn){listener=fn;return()=>{listener=null;};},emit(value){listener?.({v:1,sid:'session',...value});}};
  stream.attachDataChannel(peer);
  t.after(()=>stream.close());
  return {stream,socket,peer,samples,errors,states,advance(ms){now+=ms;},receipt(seq,status='executed',extra={}){peer.emit({t:'rd.input_receipt',seq,status,executed_at_ms:1800000000000,...extra});}};
}
