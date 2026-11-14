import assert from 'node:assert/strict';
import test, { beforeEach, afterEach } from 'node:test';
import { mountStream, window, document, act, settle } from './helpers/remote-desktop-stream-view.mjs';

let view, callbacks, errors, originalError;
const media = { provider:'artc', transport:'artc-v1', app_id:'app', channel_id:'channel', user_id:'viewer', publisher_id:'desktop', token:'fixture-only', expires_at:new Date(Date.now()+120000).toISOString(), role:'viewer', track:'screen', camera:false, microphone:false };
beforeEach(() => {
  errors=[]; originalError=console.error; console.error=(...args)=>errors.push(args);
  globalThis.__remoteMediaTestStart=async (_descriptor,_video,handlers)=>{ callbacks=handlers; return {async close(){}}; };
});
afterEach(async()=>{ await view?.unmount(); view=null; delete globalThis.__remoteMediaTestStart; console.error=originalError; assert.deepEqual(errors,[], 'real panel must not emit console.error'); });
async function mount(status=null, extra={}) {
  view=await mountStream({overrides:{ async negotiateMedia(){return {ok:true,data:{media,media_status:status}};},...extra}});
  return view;
}
const handle=()=>view.screen().querySelector('[data-remote-toolbar-handle]');
const panel=()=>view.screen().querySelector('[data-remote-toolbar]');
test('97 decoded frames show immediately with missing/late/wrong publisher geometry; toolbar opens only on purpose',async()=>{
  await mount();
  assert.equal(view.input().disabled,true); assert.equal(panel(),null);
  assert.equal(view.screen().querySelector('[data-remote-toolbar-dock]').getAttribute('data-remote-toolbar-dock'),'right');
  await view.pointer('pointermove',420,10);
  await act(async()=>window.dispatchEvent(new window.Event('blur')));
  assert.equal(panel(),null,'top pointer and window blur never open controls');
  await act(async()=>{for(let i=0;i<97;i++)callbacks.frame(1440,900);});
  assert.equal(view.screen().getAttribute('data-remote-video-ready'),'true');
  assert.equal(view.screen().querySelector('video').style.opacity,'1');
  assert.equal(view.input().disabled,false);
  assert.equal(view.screen().querySelector('[data-remote-media-notice]'),null);
  await act(async()=>view.handlers().media(media,{state:'publishing',geometry:{display_id:'late',width:1920,height:1080}}));
  await act(async()=>view.handlers().media(media,null));
  assert.equal(view.input().disabled,false); assert.equal(panel(),null);
  await act(async()=>handle().click()); assert.ok(panel());
  assert.match(panel().textContent,/Studio.*已连接.*1440×900.*画面延迟未知/s);
  assert.doesNotMatch(view.screen().textContent,/原始大小|适应窗口|移动画面/);
  await view.pointer('pointerdown'); assert.equal(panel(),null);
  await view.key('keydown','Escape',{ctrlKey:true,altKey:true,shiftKey:true}); assert.ok(panel());
  await view.key('keydown','Escape'); assert.equal(panel(),null);
  await act(async()=>handle().click()); await act(async()=>handle().click()); assert.equal(panel(),null);
  await act(async()=>view.handlers().state('reconnecting')); assert.equal(panel(),null);
  await act(async()=>view.handlers().state('active')); assert.equal(panel(),null);
  await act(async()=>view.handlers().error('input_ack_unknown')); assert.equal(panel(),null);
  await view.openToolbar(); assert.ok(panel().querySelector('[data-remote-connect]'));
});
test('drag docks to edges and remembers a separate position for each account across reconnects/remounts',async()=>{
  await mount();
  const identity=userId=>window.dispatchEvent(new window.CustomEvent('oceanleo:auth-state',{detail:{userId}}));
  await act(async()=>identity('rdv-fixture-a'));
  const fire=(type,x,y)=>view.fire(handle(),new window.PointerEvent(type,{bubbles:true,cancelable:true,pointerId:1,clientX:x,clientY:y}));
  await fire('pointerdown',window.innerWidth-16,window.innerHeight/2);
  await fire('pointermove',8,window.innerHeight*.7); await fire('pointerup',8,window.innerHeight*.7);
  await act(async()=>handle().click()); assert.equal(panel(),null,'drag does not also open');
  assert.equal(view.screen().querySelector('[data-remote-toolbar-dock]').getAttribute('data-remote-toolbar-dock'),'left');
  assert.deepEqual(JSON.parse(window.localStorage.getItem('oceanleo:remote-toolbar:rdv-fixture-a')),{edge:'left',offset:Math.trunc(window.innerHeight*.7)/window.innerHeight});
  await act(async()=>view.handlers().state('reconnecting')); await act(async()=>view.handlers().state('active'));
  assert.equal(view.screen().querySelector('[data-remote-toolbar-dock]').getAttribute('data-remote-toolbar-dock'),'left');
  await view.unmount(); await mount(); await act(async()=>identity('rdv-fixture-a'));
  assert.equal(view.screen().querySelector('[data-remote-toolbar-dock]').getAttribute('data-remote-toolbar-dock'),'left');
  await act(async()=>window.dispatchEvent(new window.CustomEvent('oceanleo:auth-state',{detail:{event:'TOKEN_REFRESHED'}})));
  assert.equal(view.screen().querySelector('[data-remote-toolbar-dock]').getAttribute('data-remote-toolbar-dock'),'left','an identity-free refresh cannot reset a known dock preference');
  await act(async()=>identity('rdv-fixture-b'));
  assert.equal(view.screen().querySelector('[data-remote-toolbar-dock]').getAttribute('data-remote-toolbar-dock'),'right');
  await act(async()=>identity(null)); assert.equal(window.localStorage.getItem('oceanleo:remote-toolbar:null'),null);
});
test('decoder statistics remain single flight for a simulated hour; relative RTP age is never reported as capture age',async t=>{
  await mount();
  await act(async()=>callbacks.frame(1440,900,{rtp_timestamp_90:0,presentation_time_ms:0}));
  // The actual RemoteDesktopVideo timer reads this deferred viewer stats once, regardless of duration.
  await view.unmount();
  let calls=0, resolveStats; const windows=[];
  globalThis.__remoteMediaTestStart=async(_descriptor,_video,handlers)=>{callbacks=handlers;return {close:async()=>{},stats(){calls++;return new Promise(resolve=>resolveStats=resolve);}};};
  t.mock.timers.enable({apis:['setInterval','Date'],now:100000});
  try {
    await mount(null,{async reportQualityWindow(value){windows.push(value);return {ok:true};}});
    await act(async()=>callbacks.publisherStats({push_buffer_full:7,push_backoff_ms:17,sdk_encode_fps:30}));
    await act(async()=>{for(let second=0;second<3600;second++)t.mock.timers.tick(1000);});
    assert.equal(windows.length,360);
    assert.ok(windows.every(value=>value.viewer.seq>=1&&!Object.keys(value.viewer).some(key=>/^(age_|picture_age_|input_to_picture_)/.test(key))));
    assert.ok(windows.every(value=>value.publisher.push_buffer_full===7&&value.publisher.push_backoff_ms===17));
    assert.equal(calls,1,'a stuck stats read creates no more promises/listeners');
    await act(async()=>resolveStats([]));
    await act(async()=>t.mock.timers.tick(1000)); assert.equal(calls,2);
  } finally {t.mock.timers.reset();}
});

test('measurement is opt-in; its switch sends C6 commands and reads only the tiny marker without restarting media',async()=>{
  await mount();
  const sent=[],listeners=new Set();
  const lane={send(text){sent.push(JSON.parse(text));return true;},subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}};
  await act(async()=>callbacks.dataChannel(lane));
  await act(async()=>callbacks.frame(1440,900));
  assert.equal(sent.length,0,'off by default: no measurement traffic');
  await view.openToolbar();
  const receiver=callbacks;
  const checkbox=panel().querySelector('[data-remote-measure]');
  await act(async()=>checkbox.click());
  assert.equal(callbacks,receiver,'toggle must not recreate the receiver');
  assert.ok(sent.some(v=>v.t==='rd.measure'&&v.on===true));assert.ok(sent.some(v=>v.t==='rd.ping'));
  const getContext=window.HTMLCanvasElement.prototype.getContext;let reads=0;
  window.HTMLCanvasElement.prototype.getContext=function(){assert.equal(this.width,8);assert.equal(this.height,7);return {drawImage(){},getImageData(){reads++;return {data:new Uint8ClampedArray(224)};}};};
  try{
    await act(async()=>callbacks.frame(1440,900));assert.equal(reads,1);assert.equal(view.input().disabled,false);
    await act(async()=>checkbox.click());assert.ok(sent.some(v=>v.t==='rd.measure'&&v.on===false));
    await act(async()=>callbacks.frame(1440,900));assert.equal(reads,1,'off stops reading pixels');
  }finally{window.HTMLCanvasElement.prototype.getContext=getContext;}
});
