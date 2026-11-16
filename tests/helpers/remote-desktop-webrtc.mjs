import { WebRtcRemoteDesktopViewer } from '../../src/api/remote-desktop-webrtc.ts';

export const WALL = 1_800_000_000_000;
export function descriptor(extra = {}) {
  return { transport:'webrtc-v1',role:'viewer',session_id:'sid',display_id:null,
    ice_servers:[{urls:['stun:fixture.invalid:3478']}],ice_expires_at:new Date(WALL+3600000).toISOString(),
    server_now:WALL/1000,lease_expires_at:new Date(WALL+120000).toISOString(),...extra };
}
export class FakeChannel {
  readyState='connecting';bufferedAmount=0;bufferedAmountLowThreshold=0;sent=[];closeCount=0;
  constructor(label,options){this.label=label;this.options=options;}
  open(){this.readyState='open';this.onopen?.({});}
  send(raw){if(this.throwSend)throw Error('ambiguous');this.sent.push(JSON.parse(raw));}
  close(){this.closeCount++;this.readyState='closed';this.onclose?.({});}
  error(){this.onerror?.({});}
  message(data){this.onmessage?.({data:typeof data==='string'?data:JSON.stringify({v:1,sid:'sid',...data})});}
  low(){this.bufferedAmount=0;this.onbufferedamountlow?.({});}
}
export class FakePeer {
  connectionState='new';iceConnectionState='new';channels=[];offers=[];candidates=[];closed=0;statsEntries=[];
  constructor(configuration){this.configuration=configuration;}
  addTransceiver(kind,options){this.transceiver={kind,options,receiver:{jitterBufferTarget:99},setCodecPreferences:codecs=>{this.codecs=codecs;}};return this.transceiver;}
  createDataChannel(label,options){const channel=new FakeChannel(label,options);this.channels.push(channel);return channel;}
  async createOffer(options){this.offers.push(options);return {type:'offer',sdp:'v=0\r\nfixture-offer'};}
  async setLocalDescription(description){this.localDescription=description;}
  async setRemoteDescription(description){this.remoteDescription=description;}
  async addIceCandidate(candidate){if(this.rejectCandidate)throw Error('bad');this.candidates.push(candidate);}
  setConfiguration(configuration){this.configuration=configuration;}
  getConfiguration(){return this.configuration;}
  async getStats(){return new Map(this.statsEntries.map(entry=>[entry.id,entry]));}
  channel(label){return this.channels.filter(c=>c.label===label).at(-1);}
  open(){for(const channel of this.channels)if(channel.readyState==='connecting')channel.open();this.connect();}
  connect(){this.connectionState='connected';this.iceConnectionState='connected';this.onconnectionstatechange?.({});this.oniceconnectionstatechange?.({});}
  ice(state){this.iceConnectionState=state;this.oniceconnectionstatechange?.({});}
  state(state){this.connectionState=state;this.onconnectionstatechange?.({});}
  close(){this.closed++;this.connectionState='closed';this.onconnectionstatechange?.({});}
}
export class FakeVideo {
  videoWidth=1280;videoHeight=720;callbacks=new Map();next=0;srcObject=null;plays=0;
  play(){this.plays++;return Promise.resolve();}
  requestVideoFrameCallback(callback){const id=++this.next;this.callbacks.set(id,callback);return id;}
  cancelVideoFrameCallback(id){this.callbacks.delete(id);}
  frame(metadata){const [id,callback]=this.callbacks.entries().next().value;this.callbacks.delete(id);callback(metadata.expectedDisplayTime??0,metadata);}
}
export async function settle(){for(let i=0;i<8;i++)await Promise.resolve();}
export async function harness(t, options={}) {
  let now=options.initialNow??100;let wall=WALL;const timers=new Map();let timerId=0;
  t.mock.method(globalThis,'setInterval',(callback,ms)=>{const id=++timerId;timers.set(id,{callback,ms,due:now+ms});return id;});
  t.mock.method(globalThis,'clearInterval',id=>timers.delete(id));
  const peers=[],signals=[],states=[],frames=[],terminals=[],reports=[];
  let signalAvailable=true;
  const viewer=new WebRtcRemoteDesktopViewer({descriptor:descriptor(),deviceId:'device',clickedAt:0,
    now:()=>now,wallNow:()=>wall,createPeer:configuration=>{const pc=new FakePeer(configuration);peers.push(pc);return pc;},
    sendSignal:data=>{if(!signalAvailable)return false;signals.push(data);return true;},onState:(state,path)=>states.push({state,path}),
    onFrame:(...args)=>frames.push(args),onTerminal:reason=>terminals.push(reason),onReport:(report,final)=>reports.push({report,final}),...options});
  t.after(()=>viewer.close());
  const advance=async ms=>{const target=now+ms;while(now<target){const step=Math.min(100,target-now);now+=step;wall+=step;for(const timer of timers.values())if(now>=timer.due){timer.due+=timer.ms;timer.callback();}await settle();}};
  const receipt=(seq,status='executed',extra={})=>peers.at(-1).channel('rd-ctl').message({t:'rd.input_receipt',seq,status,executed_at_ms:wall,...extra});
  return {viewer,peers,signals,states,frames,terminals,reports,advance,receipt,
    now:()=>now,wall:()=>wall,signalAvailable(value){signalAvailable=value;},open:()=>peers.at(-1).open()};
}
