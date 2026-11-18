import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import React, { act, useState } from 'react';
import './helpers/w1-jsdom-window.mjs';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
const { createRoot } = await import('react-dom/client');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
window.scrollTo = () => {};
// jsdom 20 lacks @starting-style parsing. Keep real style installation/lifecycle,
// and filter only that known parser diagnostic (all other errors still surface).
const virtualConsole=window._virtualConsole, priorErrors=virtualConsole.listeners('jsdomError');
virtualConsole.removeAllListeners('jsdomError');
virtualConsole.on('jsdomError',error=>{
 if(error.type==='css parsing' && String(error.detail).includes('@starting-style'))return;
 for(const listener of priorErrors)listener.call(virtualConsole,error);
});
after(()=>{virtualConsole.removeAllListeners('jsdomError');for(const listener of priorErrors)virtualConsole.on('jsdomError',listener);});

const hook = dataModule('export function useUI(){return (s,v)=>s.replace(/\\{(\\w+)\\}/g,(_,k)=>v?.[k]??"{"+k+"}");}');
// One real helper module means nested locks share the production depth counter.
const anchor = await compileModule('src/shell/anchored-popover.tsx');
const primitives = await compileModule('src/ui/index.tsx', {
 '../shell/anchored-popover': anchor,
 '../i18n/ui/useUI': hook,
});
const { Modal } = await import(primitives);
const frame = await compileModule('src/shell/messages/MessageSettingsFrame.tsx', {
 '../../ui': primitives, '../../i18n/ui/useUI': hook,
});
const client = dataModule(`
 export class ImApiError extends Error {}
 export async function imFetch(path, init={}) {
  if (init.method && init.method !== 'GET') throw new Error('No mutation in lifecycle tests');
  if (path.startsWith('/v1/im/profiles')) return {items:[{user_id:'peer',display_name:'Peer',relation:'contact',avatar_url:null}]};
  if (path === '/v1/im/me') return {profile:{user_id:'self',display_name:'Self'}};
  if (path === '/v1/im/blocks') return {items:[]};
  throw new Error('Unexpected fake request: '+path);
 }
`);
const { AttachmentView } = await import(await compileModule('src/shell/messages/conversation/AttachmentView.tsx', {
 '../../../ui': primitives, '../MessageSettingsFrame': frame, '../../../i18n/ui/useUI': hook,
}));
const reportUrl = await compileModule('src/shell/messages/report/ReportDialog.tsx', {
 '../MessageSettingsFrame': frame, '../../anchored-popover': anchor,
 '../../../i18n/ui/useUI': hook, '../../../lib/im/client': client,
});
const { ReportDialog } = await import(reportUrl);
const { ProfileCard } = await import(await compileModule('src/shell/messages/people/ProfileCard.tsx', {
 '../MessageSettingsFrame': frame, '../../anchored-popover': anchor,
 '../../../i18n/ui/useUI': hook, '../../../lib/im/client': client,
 '../realtime/hooks': dataModule('export function usePresence(){return {}};'),
 '../report/ReportDialog': reportUrl,
}));
const { DiagDialog } = await import(await compileModule('src/shell/messages/call/diagnostics/layer.tsx', {
 '../../MessageSettingsFrame': frame, '../../../anchored-popover': anchor,
}));
const h = React.createElement;
const keys = (target, key, shiftKey = false) => {
 const event = new window.KeyboardEvent('keydown', {key,shiftKey,bubbles:true,cancelable:true});
 target.dispatchEvent(event);return event;
};
const focusables = panel => [...panel.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(el=>!el.disabled);
async function trap(panel) {
 const items=focusables(panel);assert.ok(items.length);
 const first=items[0],last=items.at(-1);
 last.focus();let event;
 await act(async()=>{event=keys(last,'Tab');});assert.equal(event.defaultPrevented,true);assert.equal(document.activeElement,first);
 first.focus();await act(async()=>{event=keys(first,'Tab',true);});assert.equal(event.defaultPrevented,true);assert.equal(document.activeElement,last);
}
async function until(check) {
 for(let i=0;i<25;i++){
  if(check())return;
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,5));});
 }
 assert.ok(check(),'modal transition completed');
}
async function mount(element) {
 const prior = {position:document.body.style.position,overflow:document.body.style.overflow};
 document.body.style.position='relative';document.body.style.overflow='auto';
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 await act(async()=>{root.render(element);});
 return {host,root, async close(){await act(async()=>root.unmount());host.remove();assert.equal(document.body.style.position,'relative');assert.equal(document.body.style.overflow,'auto');Object.assign(document.body.style,prior);}};
}
function SurfaceHarness({Surface,props={}}) {
 const [open,setOpen]=useState(false);
 return h(React.Fragment,null,h('button',{'data-trigger':'',onClick:()=>setOpen(true)},'Open'),open?h(Surface,{...props,onClose:()=>setOpen(false)}):null);
}
const surfaces = [
 ['profile',ProfileCard,{userId:'peer',onOpenConversation(){}}],
 ['report',ReportDialog,{target:{kind:'user',id:'peer',label:'Peer'}}],
 ['diagnostics',DiagDialog,{labelledBy:'diagnostic-heading',children:h(React.Fragment,null,h('h2',{id:'diagnostic-heading'},'Diagnostics'),h('button',null,'First'),h('button',null,'Last'),h('button',{disabled:true},'Disabled'))}],
];
test('surfaces inventory stays complete',()=>assert.equal(surfaces.length,3));
for(const mode of ['Escape','Close','backdrop']) test(`lightbox real Modal traps focus, locks scroll and restores its trigger after ${mode}`,async()=>{
 const view=await mount(h(AttachmentView,{attachment:{kind:'image',url:'https://oceanleo.app/image.png',name:'Image'}}));
 try{
  const trigger=view.host.querySelector('button');trigger.focus();await act(async()=>trigger.click());
  const dialog=document.querySelector('[role=dialog][aria-modal=true]');assert.ok(dialog);assert.ok(dialog.classList.contains('z-[1000]'));
  const panel=dialog.querySelector('.leo-overlay-panel');assert.ok(panel.classList.contains('!h-[calc(100dvh-2rem)]'));assert.ok(panel.classList.contains('!w-[calc(100dvw-2rem)]'));assert.equal(panel.querySelector('[data-message-settings-frame]'),null);
  assert.equal(document.getElementById(dialog.getAttribute('aria-labelledby')).textContent,'Image');
  assert.ok(panel.contains(document.activeElement));assert.equal(document.body.style.position,'fixed');assert.equal(document.body.style.overflow,'hidden');
  await trap(panel);
  await act(async()=>panel.querySelector('img').dispatchEvent(new window.MouseEvent('mousedown',{bubbles:true})));assert.ok(document.querySelector('[role=dialog]'),'image interaction does not dismiss');
  await act(async()=>{
   if(mode==='Escape')keys(document.activeElement,'Escape');
   else if(mode==='Close')panel.querySelector('button').click();
   else dialog.dispatchEvent(new window.MouseEvent('mousedown',{bubbles:true}));
  });
  await until(()=>!document.querySelector('[role=dialog]'));
  assert.equal(document.activeElement,trigger);assert.equal(document.body.style.overflow,'auto');assert.equal(document.body.style.position,'relative');
 }finally{await view.close();}
});
for(const [name,Surface,props] of surfaces) test(`${name} custom modal uses real focus trap, scroll lock and trigger restoration`,async()=>{
 const view=await mount(h(SurfaceHarness,{Surface,props}));
 try{
  const trigger=view.host.querySelector('[data-trigger]');trigger.focus();await act(async()=>trigger.click());
  const dialog=document.querySelector('[role=dialog][aria-modal=true]');assert.ok(dialog);assert.ok(dialog.contains(document.activeElement));assert.equal(document.body.style.overflow,'hidden');
  await trap(dialog);
  await act(async()=>keys(document.activeElement,'Escape'));
  assert.equal(document.querySelector('[role=dialog][aria-modal=true]'),null);assert.equal(document.activeElement,trigger);assert.equal(document.body.style.overflow,'auto');
 }finally{await view.close();}
});
function NestedHarness({Inner,props}) {
 const [outer,setOuter]=useState(false),[inner,setInner]=useState(false);
 return h(React.Fragment,null,h('button',{'data-outer-trigger':'',onClick:()=>setOuter(true)},'Outer'),outer?h(Modal,{onClose:()=>setOuter(false)},h('button',{'data-inner-trigger':'',onClick:()=>setInner(true)},'Inner'),inner?h(Inner,{...props,onClose:()=>setInner(false)}):null):null);
}
for(const [name,Inner,props] of surfaces.slice(0,2)) test(`${name} nested under real Modal keeps the outer lock and focus when closed`,async()=>{
 const view=await mount(h(NestedHarness,{Inner,props}));
 try{
  const outerTrigger=view.host.querySelector('[data-outer-trigger]');outerTrigger.focus();await act(async()=>outerTrigger.click());
  const innerTrigger=document.querySelector('[data-inner-trigger]');innerTrigger.focus();await act(async()=>innerTrigger.click());
  const inner=name==='report'?document.querySelector('[data-report-dialog]'):document.querySelector('[data-profile-card]');assert.ok(inner);await trap(inner);
  // The child handles Escape; the real parent Modal must stay mounted.
  await act(async()=>keys(document.activeElement,'Escape'));assert.equal(document.querySelector(name==='report'?'[data-report-dialog]':'[data-profile-card]'),null);
  assert.ok(document.querySelector('[data-inner-trigger]'));assert.equal(document.body.style.overflow,'hidden');assert.equal(document.activeElement,innerTrigger);
  await act(async()=>keys(innerTrigger,'Escape'));await until(()=>!document.querySelector('[role=dialog]'));assert.equal(document.body.style.overflow,'auto');assert.equal(document.activeElement,outerTrigger);
 }finally{await view.close();}
});

test('profile-to-report transition preserves the modal lock and returns to the original profile trigger',async()=>{
 const view=await mount(h(SurfaceHarness,{Surface:ProfileCard,props:{userId:'peer',onOpenConversation(){}}}));
 try{
  const trigger=view.host.querySelector('[data-trigger]');trigger.focus();await act(async()=>trigger.click());
  let profile=document.querySelector('[data-profile-card]');assert.ok(profile);
  await act(async()=>profile.querySelector('[aria-haspopup=menu]').click());
  await act(async()=>profile.querySelector('[data-action=report]').click());
  const report=document.querySelector('[data-report-dialog]');assert.ok(report);assert.equal(document.querySelector('[data-profile-card]'),null);assert.equal(document.body.style.overflow,'hidden');await trap(report);
  await act(async()=>keys(document.activeElement,'Escape'));
  profile=document.querySelector('[data-profile-card]');assert.ok(profile);assert.equal(document.querySelector('[data-report-dialog]'),null);assert.equal(document.body.style.overflow,'hidden');assert.ok(profile.contains(document.activeElement));
  await act(async()=>keys(document.activeElement,'Escape'));
  assert.equal(document.querySelector('[data-profile-card]'),null);assert.equal(document.body.style.overflow,'auto');assert.equal(document.activeElement,trigger);
 }finally{await view.close();}
});
