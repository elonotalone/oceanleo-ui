import assert from 'node:assert/strict';
import test, {afterEach} from 'node:test';
import {mountStream, act, settle, window} from './helpers/remote-desktop-stream-view.mjs';
import {RD_BROKER_COPY as copy, RD_BROKER_MESSAGES, rdBrokerErrorCopy} from '../src/i18n/ui/messages/rd-broker-copy.ts';
const mounted=[];
afterEach(async()=>{while(mounted.length) await mounted.pop().unmount();});
const snapshot=(state='locked',extra={})=>({deviceId:'d-1',generation:3,state,role:'broker',online:true,enabled:true,controlSupported:['locked','loggedOut'].includes(state),captureVerified:false,inputVerified:false,reason:'broker_device_verification_required',...extra});
const frame={image:'data:image/jpeg;base64,/9j/AAAA',width:1920,height:1080,sequence:1};
async function mount(state='locked',options={}){
  const log={status:0,create:0,frames:0,inputs:[],closes:[],legacy:0};
  let current=snapshot(state,options.status), nextFrame={ok:true,data:{state:'active',frame}};
  const broker={
    async getStatus(){log.status++;return options.statusError??{ok:true,data:current}},
    async createSession(){log.create++;return options.createError??{ok:true,data:{session_id:'broker-session',state:'connecting',transport:'secure-broker-http-v1'}}},
    async getFrame(){log.frames++;return nextFrame},
    async sendInput(_d,_s,seq,action){log.inputs.push({seq,action});return options.inputError??{ok:true,data:{accepted:true,seq}}},
    async closeSession(_d,s){log.closes.push(s);return {ok:true,data:{closed:true}}},
  };
  const view=await mountStream({pending:true,overrides:{broker,brokerConfigured:options.brokerConfigured !== false,async createSession(){log.legacy++;return {ok:true,data:{session_id:'legacy',state:'connecting',transport:'websocket-v2'}}}}});
  mounted.push(view);
  Object.assign(view,{brokerLog:log,async report(value){current=value;await settle(1550)},async response(value){nextFrame=value;await settle(20)},async decode(){const img=view.image();assert.ok(img);img.getBoundingClientRect=()=>({left:100,top:50,width:640,height:360});await view.fire(img,new window.Event('load'));}});
  return view;
}

test('ordinary devices skip the optional secure-broker preflight',async()=>{
  const view=await mount('locked',{brokerConfigured:false});
  assert.equal(view.brokerLog.status,0);
  assert.equal(view.brokerLog.legacy,1);
  await view.unmount();
});

test('locked state uses broker HTTP, attaches frame viewer first and waits for actual image decode before input',async()=>{
  const view=await mount();
  assert.equal(view.brokerLog.create,1);assert.equal(view.brokerLog.legacy,0);assert.ok(view.brokerLog.frames>0);
  assert.equal(view.screen().dataset.remoteTransport,'secure-broker-http-v1');
  assert.match(view.screen().querySelector('[data-remote-broker-status]').textContent,/已锁屏，正在确认/);
  assert.doesNotMatch(view.screen().textContent,/可以尝试解锁/);
  assert.equal(view.input().disabled,true);
  await view.pointer('pointerdown');assert.equal(view.brokerLog.inputs.some(x=>x.action.kind==='pointer_down'),false);
  await view.decode();assert.equal(view.input().disabled,false);
  await view.pointer('pointerdown',260,140);await view.pointer('pointerup',260,140);
  await view.key('keydown','a',{code:'KeyA'});await view.key('keyup','a',{code:'KeyA'});
  assert.deepEqual(view.brokerLog.inputs.filter(x=>x.action.kind!=='release_all').map(x=>x.action.kind),['pointer_down','pointer_up','key_down','key_up']);
  assert.equal(view.brokerLog.inputs.find(x=>x.action.kind==='key_down').action.code,'KeyA');
  await view.unmount();assert.deepEqual(view.brokerLog.closes,['broker-session']);assert.deepEqual(view.log.closes,[]);
});

test('logged-out state says sign-in screen without promising unverified control',async()=>{
  const view=await mount('loggedOut');
  assert.equal(view.brokerLog.create,1);assert.match(view.screen().textContent,/停在登录界面，正在确认/);
  assert.doesNotMatch(view.screen().textContent,/可以尝试登录/);
});

test('verified capture and input permit truthful unlock copy only after a reported update',async()=>{
  const view=await mount();await view.decode();
  await view.report(snapshot('locked',{captureVerified:true,inputVerified:true}));
  assert.match(view.screen().textContent,/已确认可以显示画面和接收输入/);
  assert.match(view.screen().textContent,/可以尝试解锁/);
});

test('pre-boot is explicitly unavailable and sends no session request',async()=>{
  const view=await mount('preBoot');
  assert.equal(view.brokerLog.create,0);assert.equal(view.brokerLog.legacy,0);
  assert.equal(view.screen().dataset.remotePhase,'error');
  assert.match(view.screen().textContent,/还未进入操作系统/);
});

test('signed-in and unknown states fall back to the existing legacy stream',async()=>{
  for(const state of ['loggedIn','unknown']){
    const view=await mount(state);
    assert.equal(view.brokerLog.create,0);assert.equal(view.brokerLog.legacy,1);
    assert.ok(view.handlers());assert.equal(view.screen().dataset.remoteTransport,undefined);
    assert.equal(view.screen().dataset.remoteDeviceState,state);
    await view.unmount();
  }
});

test('older/unprovisioned gateways fall back without inventing a locked state',async()=>{
  for(const statusError of [{ok:false,status:404,error:'Not Found'},{ok:false,status:404,error:'broker_device_not_owned'},{ok:false,status:503,error:'broker_authority_unavailable'}]){
    const view=await mount('unknown',{statusError});
    assert.equal(view.brokerLog.legacy,1);assert.equal(view.brokerLog.create,0);
    assert.equal(view.screen().querySelector('[data-remote-broker-status]'),null);
    await view.unmount();
  }
});

test('Mac login-window and disabled lock access do not create a legacy session',async()=>{
  for(const status of [{controlSupported:false,reason:'macos_loginwindow_not_supported'},{enabled:false,controlSupported:false}]){
    const view=await mount('loggedOut',{status});
    assert.equal(view.brokerLog.create,0);assert.equal(view.brokerLog.legacy,0);
    assert.match(view.screen().textContent,status.enabled===false?/锁屏远程访问已关闭/:/Mac 的登录界面暂不支持/);
    await view.unmount();
  }
});

test('broker lease errors are localized without raw server text',async()=>{
  const view=await mount('locked',{createError:{ok:false,status:409,error:'broker_lease_expired'}});
  assert.match(view.screen().textContent,/锁屏控制权限已过期/);
  assert.doesNotMatch(view.screen().textContent,/broker_lease_expired/);
});

test('capture gaps keep the existing picture and block input until a current decoded frame returns',async()=>{
  const view=await mount();await view.decode();const image=view.image();
  await view.response({ok:true,data:{state:'connecting',frame:null}});
  assert.equal(view.image(),image);assert.equal(view.input().disabled,true);
  const before=view.brokerLog.inputs.length;await view.key('keydown','a',{code:'KeyA'});
  assert.equal(view.brokerLog.inputs.slice(before).some(x=>x.action.kind==='key_down'),false);
  await view.response({ok:true,data:{state:'active',frame}});
  assert.equal(view.image(),image);assert.equal(view.input().disabled,false);
});

test('paste, wheel, and secure attention do not become privileged input',async()=>{
  const view=await mount();await view.decode();
  const paste=new window.Event('paste',{bubbles:true,cancelable:true});
  Object.defineProperty(paste,'clipboardData',{value:{getData:()=> 'private password'}});
  await view.fire(view.input(),paste);
  await view.fire(view.stage(),new window.WheelEvent('wheel',{bubbles:true,cancelable:true,clientX:420,clientY:230,deltaY:50}));
  await view.key('keydown','Delete',{code:'Delete',ctrlKey:true,altKey:true});
  assert.equal(view.brokerLog.inputs.some(x=>['type','scroll'].includes(x.action.kind)||x.action.code==='Delete'),false);
  assert.match(view.screen().textContent,/不支持粘贴、输入法或滚轮/);
});

test('broker input denial preserves view-only pixels',async()=>{
  const view=await mount('locked',{inputError:{ok:false,status:403,error:'broker_input_not_allowed'}});await view.decode();
  await view.key('keydown','a',{code:'KeyA'});
  assert.ok(view.image());assert.equal(view.screen().dataset.remotePhase,'active');
  assert.match(view.screen().textContent,/暂未允许远程输入/);
});

test('state handoff closes the broker and requires a new explicit connection',async()=>{
  const view=await mount();await view.decode();
  await view.report(snapshot('loggedIn'));
  assert.match(view.screen().textContent,/登录状态已变化/);
  assert.equal(view.brokerLog.legacy,0);assert.deepEqual(view.brokerLog.closes,['broker-session']);
});

test('broker copy is fully translated in zh, en, zh-TW and English for all other locales',()=>{
  for(const [locale,messages] of Object.entries(RD_BROKER_MESSAGES)){
    assert.equal(Object.keys(messages).length,Object.keys(copy).length);
    for(const value of Object.values(messages)) if(!['zh','zh-TW'].includes(locale)) assert.doesNotMatch(value,/[\u3400-\u9fff]/);
  }
  assert.equal(rdBrokerErrorCopy('untrusted message'),null);
  assert.equal(rdBrokerErrorCopy('broker_internal_arbitrary'),copy.refused);
});

test('a generation replacement closes the old broker session without a silent new session',async()=>{
  const view=await mount();await view.decode();
  await view.report(snapshot('locked',{generation:4}));
  assert.equal(view.screen().dataset.remotePhase,'error');
  assert.equal(view.brokerLog.create,1);assert.equal(view.brokerLog.legacy,0);
  assert.deepEqual(view.brokerLog.closes,['broker-session']);
});

test('physical right-side modifier releases retain their scan-code identity',async()=>{
  const view=await mount();await view.decode();
  await view.key('keydown','Shift',{code:'ShiftRight',shiftKey:true});
  await view.pointer('pointerdown',260,140,{shiftKey:false});
  const keys=view.brokerLog.inputs.map(x=>x.action).filter(x=>x.kind.startsWith('key_'));
  assert.deepEqual(keys,[{kind:'key_down',key:'Shift',code:'ShiftRight'},{kind:'key_up',key:'Shift',code:'ShiftRight'}]);
});

test('blur releases held broker input on the same session',async()=>{
  const view=await mount();await view.decode();
  await view.key('keydown','a',{code:'KeyA'});
  await view.fire(window,new window.Event('blur'));
  assert.equal(view.brokerLog.inputs.at(-1).action.kind,'release_all');
});

test('lost presence is shown as unknown without asserting logout or pre-boot',async()=>{
  const view=await mount();await view.decode();
  await view.report(snapshot('unknown',{online:false,controlSupported:false}));
  assert.match(view.screen().textContent,/尚未收到这台电脑当前的登录或锁屏状态/);
  assert.doesNotMatch(view.screen().textContent,/登录状态已变化|停在登录界面|还未进入操作系统/);
  assert.deepEqual(view.brokerLog.closes,['broker-session']);
});

test('fixed broker frame refusals terminate immediately instead of retrying an invalid lease',async()=>{
  const view=await mount();await view.decode();
  await view.response({ok:false,status:409,error:'broker_lease_expired'});
  assert.equal(view.screen().dataset.remotePhase,'error');
  assert.match(view.screen().textContent,/锁屏控制权限已过期/);
  assert.deepEqual(view.brokerLog.closes,['broker-session']);
});

test('new geometry requires actual decode and never maps a held gesture to old dimensions',async()=>{
  const view=await mount();await view.decode();
  await view.pointer('pointerdown',260,140);
  await view.response({ok:true,data:{state:'active',frame:{...frame,width:1280,height:720,sequence:2}}});
  assert.equal(view.input().disabled,true);
  assert.equal(view.brokerLog.inputs.at(-1).action.kind,'release_all');
  const before=view.brokerLog.inputs.length;
  await view.pointer('pointerup',260,140);
  assert.equal(view.brokerLog.inputs.slice(before).some(x=>x.action.kind==='pointer_up'),false);
  await view.decode();assert.equal(view.input().disabled,false);
});

test('broker idle confirmation asks for real supported input instead of claiming a no-op release was executed',async()=>{
  const view=await mount();await view.decode();
  await view.response({ok:true,data:{state:'active',frame,activity:{idle_confirmation_required:true,idle_remaining_s:30,reconnect_remaining_s:null}}});
  const prompt=view.screen().querySelector('[data-remote-idle-confirm]');
  assert.ok(prompt);assert.match(prompt.textContent,/移动鼠标或按一个实体键盘按键/);
  assert.equal(prompt.querySelector('button'),null);
});
