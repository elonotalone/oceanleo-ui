import assert from 'node:assert/strict';
import test from 'node:test';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
const preparation=[];
globalThis.__r8Prepare=(id,options)=>{const row={id,options,closed:0};preparation.push(row);return()=>row.closed++;};
const intents=[];
globalThis.__r9Intent=(...args)=>{intents.push(args);return true;};
const api=await import(await compileModule('src/api/remote-desktop-webrtc-standby.ts',{
  './remote-desktop-webrtc-preconnect':dataModule('export function prepareRemoteWebRtcSocket(...args){return globalThis.__r8Prepare(...args);} export function queuePreparedRemoteWebRtcStart(...args){return globalThis.__r9Intent(...args);}'),
}));
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function setup(t){
  t.mock.timers.enable({apis:['setInterval','setTimeout']});const doc=new EventTarget();doc.visibilityState='visible';
  const previous=Object.getOwnPropertyDescriptor(globalThis,'document');Object.defineProperty(globalThis,'document',{configurable:true,value:doc});
  t.after(()=>{if(previous)Object.defineProperty(globalThis,'document',previous);else delete globalThis.document;});return doc;
}
function client(){
  let accept;const log={creates:[],opens:[],closed:[],activated:[],renew:0,streamClose:0};
  const stream={transport:'webrtc-v1',activateStandby:(...args)=>log.activated.push(args),renewStandby:()=>{log.renew++;return true;},close:()=>log.streamClose++};
  const c={log,stream,createSession:(id,options)=>{log.creates.push({id,options});return new Promise(resolve=>{accept=resolve;});},
    openStream:async(id,sid,handlers,options)=>{log.opens.push({id,sid,handlers,options});handlers.state('connecting');return{ok:true,data:stream};},
    closeSession:async(id,sid)=>{log.closed.push(sid);return{ok:true,data:{closed:true}};}};
  return {c,accept:()=>accept({ok:true,data:{session_id:'standby-session',transport:'webrtc-v1',state:'connecting',standby:true}})};
}
test('immediate click joins the preconnecting promise and adopts exactly one session and stream',async t=>{
  setup(t);const {c,accept}=client();const release=api.prepareRemoteDesktopStandby('instant',c);t.after(release);
  assert.equal(c.log.creates.length,0);const promise=api.claimRemoteDesktopStandbySession('instant',{requestId:'click_request',clickedAt:100});assert.ok(promise);
  preparation.at(-1).options.ready(['remote-desktop-standby-v1']);assert.equal(c.log.creates.length,1);assert.equal(c.log.creates[0].options.standby,true);
  assert.equal(c.log.closed.length,0,'claim does not create or close another session');
  accept();const session=await promise;assert.equal(session.data.session_id,'standby-session');await settle();
  const states=[];const opened=await api.claimRemoteDesktopStandbyStream('instant','standby-session',{state:s=>states.push(s)},{});
  assert.equal(c.log.opens.length,1);assert.deepEqual(states,['connecting']);assert.deepEqual(c.log.activated,[['click_request',100]]);
  c.log.opens[0].handlers.webrtcPresentation({presented_at_ms:145});assert.equal(api.inspectRemoteDesktopStandby('instant').first_presented_ms,45);
  opened.data.close();assert.equal(api.inspectRemoteDesktopStandby('instant'),null);assert.equal(c.log.streamClose,1);
});
test('ready standby renews only while visible and closes on hidden without starting host media',async t=>{
  const doc=setup(t);const {c,accept}=client();const release=api.prepareRemoteDesktopStandby('visible',c);t.after(release);
  preparation.at(-1).options.ready(['remote-desktop-standby-v1']);accept();await settle();
  t.mock.timers.tick(10_000);assert.equal(c.log.renew,1);assert.equal(c.log.activated.length,0);
  doc.visibilityState='hidden';doc.dispatchEvent(new Event('visibilitychange'));await settle();
  assert.deepEqual(c.log.closed,['standby-session']);assert.equal(c.log.streamClose,1);assert.equal(api.inspectRemoteDesktopStandby('visible'),null);
  t.mock.timers.tick(20_000);assert.equal(c.log.renew,1);
});
test('legacy ready and socket failure resolve the shared promise for cold fallback without a standby create',async t=>{
  setup(t);for(const event of ['legacy','failure']){
    const {c}=client();const release=api.prepareRemoteDesktopStandby(event,c);t.after(release);
    const pending=api.claimRemoteDesktopStandbySession(event,{requestId:'legacy_click'});
    const callbacks=preparation.at(-1).options;if(event==='legacy')callbacks.ready([]);else callbacks.unavailable();
    assert.equal((await pending).ok,false);await settle();assert.equal(c.log.creates.length,0);assert.equal(api.inspectRemoteDesktopStandby(event),null);
  }
});
test('one visible device replaces the earlier standby and unmount cancels an in-flight create',async t=>{
  setup(t);const first=client(),second=client();const release1=api.prepareRemoteDesktopStandby('first',first.c);t.after(release1);
  preparation.at(-1).options.ready(['remote-desktop-standby-v1']);
  const release2=api.prepareRemoteDesktopStandby('second',second.c);t.after(release2);assert.equal(first.c.log.creates[0].options.signal.aborted,true);
  first.accept();await settle();assert.deepEqual(first.c.log.closed,['standby-session']);assert.equal(api.inspectRemoteDesktopStandby('first'),null);
  release2();await settle();assert.equal(api.inspectRemoteDesktopStandby('second'),null);
});
test('hidden documents never open a socket and stalled preconnection expires locally',async t=>{
  const doc=setup(t);const {c}=client();doc.visibilityState='hidden';const n=preparation.length;api.prepareRemoteDesktopStandby('hidden',c);assert.equal(preparation.length,n);
  doc.visibilityState='visible';const release=api.prepareRemoteDesktopStandby('stalled',c);t.after(release);const promise=api.claimRemoteDesktopStandbySession('stalled',{requestId:'stall_click'});
  t.mock.timers.tick(10_000);assert.equal((await promise).ok,false);assert.equal(c.log.creates.length,0);
});

test('claimed but not approved standby closes when hidden or its visible owner unmounts',async t=>{
  const doc=setup(t);
  for(const reason of ['hidden','unmount']){
    doc.visibilityState='visible';const {c,accept}=client();const release=api.prepareRemoteDesktopStandby(reason,c);t.after(release);
    const pending=api.claimRemoteDesktopStandbySession(reason,{requestId:'pending_click'});
    preparation.at(-1).options.ready(['remote-desktop-standby-v1']);
    if(reason==='hidden'){doc.visibilityState='hidden';doc.dispatchEvent(new Event('visibilitychange'));}else release();
    assert.equal((await pending).ok,false);assert.equal(c.log.creates[0].options.signal.aborted,true);
    accept();await settle();assert.deepEqual(c.log.closed,['standby-session']);assert.equal(c.log.activated.length,0);
  }
});

test('click intent reaches an in-flight create immediately and keeps the same key in stream/DC adoption',async t=>{
  setup(t);const {c,accept}=client();const release=api.prepareRemoteDesktopStandby('intent-inflight',c);t.after(release);
  preparation.at(-1).options.ready(['remote-desktop-standby-v1','remote-desktop-start-intent-v1']);
  const pending=api.claimRemoteDesktopStandbySession('intent-inflight',{requestId:'inflight_click_key',clickedAt:123});
  assert.deepEqual(intents.at(-1),['intent-inflight','inflight_click_key']);
  assert.equal(c.log.creates[0].options.activationRequestId,'inflight_click_key','late click remains readable while controller registration is in flight');
  accept();await pending;await settle();
  assert.equal(c.log.opens[0].options.activationRequestId,'inflight_click_key');
  assert.equal(c.log.opens[0].options.standbyStartIntent,true);
  const opened=await api.claimRemoteDesktopStandbyStream('intent-inflight','standby-session',{state(){}},{});
  assert.deepEqual(c.log.activated,[['inflight_click_key',123]]);opened.data.close();
});
test('a pre-create click is attached to the eventual create only after capability negotiation',async t=>{
  setup(t);for(const supported of [true,false]){
    const {c,accept}=client();const id=`before-create-${supported}`,release=api.prepareRemoteDesktopStandby(id,c);t.after(release);
    const pending=api.claimRemoteDesktopStandbySession(id,{requestId:'precreate_click_key'});
    preparation.at(-1).options.ready(['remote-desktop-standby-v1',...(supported?['remote-desktop-start-intent-v1']:[])]);
    assert.equal(c.log.creates[0].options.activationRequestId,'precreate_click_key');
    assert.equal(c.log.creates[0].options.standbyStartIntent,supported);accept();await pending;await settle();release();
  }
});
