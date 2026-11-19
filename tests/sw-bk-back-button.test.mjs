import assert from 'node:assert/strict';
import test from 'node:test';
import React, {act, createRef} from 'react';
import './helpers/w1-jsdom-window.mjs';
import {compileModule, dataModule} from './helpers/module-bench.mjs';
const {createRoot} = await import('react-dom/client');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const {BackButton} = await import(await compileModule('src/ui/BackButton.tsx'));
const ui = dataModule('export function useUI(){return s=>({"返回":"Back","返回列表":"Back to list"}[s]||s)}');
const {PageHeader} = await import(await compileModule('src/pages/PageHeader.tsx', {'../i18n/ui/useUI':ui}));
const {SettingsBackButton} = await import(await compileModule('src/pages/settings/SettingsBackButton.tsx', {'../../i18n/ui/useUI':ui}));
const {MessageSettingsHeader} = await import(await compileModule('src/shell/messages/MessageSettingsFrame.tsx', {
  '../../i18n/ui/useUI':ui,
  '../../ui':dataModule('export function Modal({children}){return children}'),
}));
async function mount(Component, props) {
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  await act(async()=>root.render(React.createElement(Component,props)));
  return {host, update:async props=>act(async()=>root.render(React.createElement(Component,props))),close:async()=>{await act(async()=>root.unmount());host.remove()}};
}
function standard(button,label) {
  assert.ok(button);
  for(const name of ['grid','h-8','w-8','shrink-0','place-items-center','rounded-lg','border'])assert.ok(button.classList.contains(name),name);
  assert.equal(button.getAttribute('aria-label'),label);
  assert.equal(button.title,label);
  assert.equal(button.textContent,'');
  const svg=button.querySelector('svg');
  assert.equal(svg.getAttribute('stroke-width'),'1.8');
  assert.equal(svg.getAttribute('aria-hidden'),'true');
  assert.ok(svg.classList.contains('h-4')&&svg.classList.contains('w-4'));
  assert.equal(svg.querySelector('path').getAttribute('d'),'M15 18l-6-6 6-6');
}
test('button preserves callback, ref, data attributes and disabled state',async()=>{
  const ref=createRef();let clicks=0;
  const props={label:'Back to list',ref,onClick:()=>clicks++,'data-destination':'library'};
  const view=await mount(BackButton,props);
  try {
    const button=view.host.querySelector('button');standard(button,'Back to list');
    assert.equal(ref.current,button);assert.equal(button.type,'button');assert.equal(button.dataset.destination,'library');
    await act(async()=>button.click());assert.equal(clicks,1);
    await view.update({...props,disabled:true});await act(async()=>button.click());assert.equal(clicks,1);assert.equal(button.disabled,true);
  } finally {await view.close()}
});
test('link keeps destination and click event; disabled links cannot navigate or invoke callback',async()=>{
  const ref=createRef();let clicks=0;
  const props={label:'Presentations',href:'?category=presentations',ref,onClick:event=>{event.preventDefault();clicks++}};
  const view=await mount(BackButton,props);
  try {
    const link=view.host.querySelector('a');standard(link,'Presentations');assert.equal(ref.current,link);
    assert.equal(link.getAttribute('href'),props.href);
    await act(async()=>link.click());assert.equal(clicks,1);
    await view.update({...props,disabled:true});
    assert.equal(link.hasAttribute('href'),false);assert.equal(link.getAttribute('aria-disabled'),'true');assert.equal(link.tabIndex,-1);
    await act(async()=>link.click());assert.equal(clicks,1);
    await view.update(props);assert.equal(link.getAttribute('href'),props.href);
  } finally {await view.close()}
});
test('dark surface changes semantic colors while retaining shape and icon',async()=>{
  const view=await mount(BackButton,{label:'Back',surface:'dark'});
  try {const button=view.host.querySelector('button');standard(button,'Back');assert.match(button.style.getPropertyValue('--border'),/back-dark-border/);assert.match(button.style.getPropertyValue('--muted'),/back-dark-muted/)}finally{await view.close()}
});
for(const [name,Component,props,label] of [
  ['PageHeader',PageHeader,{title:'Page'},'Back'],
  ['SettingsBackButton',SettingsBackButton,{label:'Account'},'Account'],
  ['MessageSettingsHeader',MessageSettingsHeader,{title:'Notifications',backButtonProps:{'data-test-back':'kept'}},'Back'],
])test(`${name} wraps the same primitive and preserves its back callback`,async()=>{
  let calls=0;const view=await mount(Component,{...props,onClick:()=>calls++,onBack:()=>calls++});
  try{const button=view.host.querySelector('[data-back-button]');standard(button,label);await act(async()=>button.click());assert.equal(calls,1);if(name==='MessageSettingsHeader')assert.equal(button.dataset.testBack,'kept')}finally{await view.close()}
});
