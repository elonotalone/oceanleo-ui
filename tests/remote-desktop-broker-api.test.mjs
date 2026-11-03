import assert from 'node:assert/strict';
import test from 'node:test';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
const api = await import(await compileModule('src/api/remote-desktop.ts', {
  '../lib/auth/client': dataModule('export async function accessToken(){return "owner-jwt"}'),
  '../lib/auth/config': dataModule('export const GATEWAY_BASE="https://gateway.test"'),
  './device-settings': dataModule('export function controllerHeaders(){return {"X-OceanLeo-Controller":"controller-proof"}}; export async function registerController(){return {ok:true}}'),
}));
const broker = api.remoteDesktopClient.broker;
const status = (extra = {}) => ({ deviceId:'d/1', generation:3, state:'locked', role:'broker', online:true, enabled:true, controlSupported:true, captureVerified:false, inputVerified:false, reason:'broker_device_verification_required', ...extra });
function mock(handler) {
  const calls=[];
  globalThis.fetch=async (url,init={})=> { calls.push({url,init}); const reply=await handler(url,init); return {ok:(reply.status??200)<400,status:reply.status??200,json:async()=>reply.body}; };
  return calls;
}
const created = {session_id:'broker-session',state:'connecting',transport:'secure-broker-http-v1',expires_at:''};
async function create() { return broker.createSession('d/1',{requestId:'request_1234',ownerDirect:true}); }

test('broker status parses all five exact reported states and never infers capability from online', async()=>{
  for (const state of ['loggedIn','locked','loggedOut','preBoot','unknown']) {
    mock(()=>({body:status({state})}));
    const result=await broker.getStatus('d/1');
    assert.equal(result.data.state,state);
    assert.equal(result.data.controlSupported,['locked','loggedOut'].includes(state));
    assert.equal(result.data.inputVerified,false);
  }
  assert.equal(api.parseBrokerStatus(status({online:false,state:'locked',inputVerified:true,captureVerified:true}),'d/1').state,'unknown');
  assert.equal(api.parseBrokerStatus(status({captureVerified:false,inputVerified:true}),'d/1').inputVerified,false);
  assert.equal(api.parseBrokerStatus(status({role:'userAgent'}),'d/1').controlSupported,false);
  for(const extra of [{deviceId:'other'},{state:'LOCKED'},{generation:NaN},{online:'true'},{inputVerified:undefined}]) assert.equal(api.parseBrokerStatus(status(extra),'d/1'),null);
  assert.equal(api.parseBrokerStatus(status({reason:'arbitrary server message'}),'d/1').reason,null);
});

test('broker routes use only account/controller proof and private frame/input/delete paths',async()=>{
  const calls=mock((url,init)=>({body:url.endsWith('/status')?status():url.endsWith('/sessions')?created:url.endsWith('/frame')?{state:'active',frame:{image:'data:image/jpeg;base64,/9j/AAAA',width:100,height:50,sequence:2}}:url.endsWith('/input')?{accepted:true,sequence:JSON.parse(init.body).sequence}:{closed:true}}));
  assert.equal((await broker.getStatus('d/1')).ok,true);
  assert.equal((await create()).data.transport,'secure-broker-http-v1');
  assert.equal((await broker.getFrame('d/1','broker-session')).data.frame.sequence,2);
  assert.equal((await broker.sendInput('d/1','broker-session',1,{kind:'pointer_down',x:.25,y:.5,button:'right'})).ok,true);
  assert.equal((await broker.sendInput('d/1','broker-session',2,{kind:'key_down',key:'A',code:'KeyA'})).ok,true);
  assert.equal((await broker.sendInput('d/1','broker-session',3,{kind:'release_all'})).ok,true);
  await broker.closeSession('d/1','broker-session');
  assert.ok(calls.every(c=>c.url.startsWith('https://gateway.test/v1/secure-broker/devices/d%2F1/')));
  for(const {init} of calls) { assert.equal(init.headers.Authorization,'Bearer owner-jwt'); assert.equal(init.headers['X-OceanLeo-Controller'],'controller-proof'); assert.equal(init.headers['X-OceanLeo-Device'],undefined); assert.equal(init.cache,'no-store'); }
  assert.deepEqual(JSON.parse(calls[1].init.body),{requestId:'request_1234'});
  const inputs=calls.filter(c=>c.url.endsWith('/input')).map(c=>JSON.parse(c.init.body));
  assert.deepEqual(inputs.map(x=>x.sequence),[1,2,3,4,5]);
  assert.deepEqual(inputs.map(x=>x.event),[{kind:'pointer',x:16384,y:32768},{kind:'button',button:1,down:true},{kind:'key',scan:30,extended:false,down:true},{kind:'button',button:1,down:false},{kind:'key',scan:30,extended:false,down:false}]);
  assert.equal(calls.at(-1).init.method,'DELETE');
});

test('replayed broker create without a transport stays on the authenticated broker path',async()=>{
  mock(()=>({body:{...created,transport:undefined}}));
  assert.equal((await create()).data.transport,'secure-broker-http-v1');
  await broker.closeSession('d/1','broker-session');
});

test('broker input rejects unsupported operations, unknown physical keys and malformed positions without sending',async()=>{
  const calls=mock(()=>({body:created})); await create(); calls.length=0;
  for (const action of [{kind:'type',text:'private password'},{kind:'scroll',deltaY:2},{kind:'keypress',key:'Enter'},{kind:'click',x:0,y:0},{kind:'key_down',key:'A'},{kind:'key_down',code:'Unknown'},{kind:'move',x:NaN,y:0},{kind:'move',x:2,y:0}]) {
    assert.equal((await broker.sendInput('d/1','broker-session',1,action)).error,'broker_input_unsupported');
  }
  assert.equal(calls.length,0);
  assert.deepEqual(api.brokerInputEvents({kind:'key_up',code:'ArrowLeft'}),[{kind:'key',scan:75,extended:true,down:false}]);
  await broker.closeSession('d/1','broker-session');
});

test('input ACK must match the actual expanded wire sequence; errors never replay commands',async()=>{
  mock(()=>({body:created})); await create();
  let calls=mock(()=>({body:{accepted:true,sequence:999}}));
  assert.equal((await broker.sendInput('d/1','broker-session',1,{kind:'pointer_down',x:0,y:0})).error,'response_malformed');
  assert.equal(calls.length,1,'second event is not sent after an unknown ACK');
  calls=mock(()=>({status:409,body:{detail:{code:'broker_lease_expired'}}}));
  assert.equal((await broker.sendInput('d/1','broker-session',2,{kind:'key_down',code:'Enter'})).error,'broker_lease_expired');
  assert.equal(calls.length,1);
  await broker.closeSession('d/1','broker-session');
});

test('broker frame refuses malformed images and preserves exact fixed errors',async()=>{
  mock(()=>({body:{state:'active',frame:{image:'https://public.test/pixels',width:2,height:2,sequence:1}}}));
  assert.equal((await broker.getFrame('d/1','s')).error,'response_malformed');
  mock(()=>({status:403,body:{detail:{code:'broker_disabled'}}}));
  assert.equal((await broker.getStatus('d/1')).error,'broker_disabled');
});

test('broker replay with the API v1 legacy HTTP marker remains broker transport',async()=>{
  mock(()=>({body:{...created,transport:'http-v1'}}));
  assert.equal((await create()).data.transport,'secure-broker-http-v1');
  await broker.closeSession('d/1','broker-session');
});

test('one lost broker create response retries the identical request id and never replays input',async()=>{
  const calls=mock((_url,_init)=>{ if(calls.length===1)throw new TypeError('lost reply'); return {body:created}; });
  assert.equal((await create()).ok,true);
  assert.equal(calls.length,2);assert.equal(calls[0].init.body,calls[1].init.body);
  await broker.closeSession('d/1','broker-session');
});

test('legacy status retains the parent last_seen_at and allowlisted reason parsing',async()=>{
  mock(()=>({body:{supported:true,enabled:true,online:false,session_id:null,last_seen_at:'2026-11-03T08:00:00Z',reason:'remote_desktop_device_reconnecting'}}));
  const result=await api.remoteDesktopClient.getStatus('d/1');
  assert.equal(result.data.last_seen_at,'2026-11-03T08:00:00Z');
  assert.equal(result.data.reason,'remote_desktop_device_reconnecting');
});
