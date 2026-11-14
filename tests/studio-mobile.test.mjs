import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import React, {act} from 'react';
import './helpers/w1-jsdom-window.mjs';
import {compileModule, dataModule} from './helpers/module-bench.mjs';
const {createRoot}=await import('react-dom/client');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const react=pathToFileURL(createRequire(import.meta.url).resolve('react')).href;
const split=dataModule(`import React from ${JSON.stringify(react)};
 export function SplitWorkspace({left,right,className}) {return React.createElement('div',{'data-workspace-split':true,className:'test-split '+className,style:{height:'600px'}},React.createElement('section',{'data-workspace-pane':'left','data-workspace-pane-state':'open'},React.createElement('div',null,React.createElement('div',null,left))),React.createElement('section',{'data-workspace-pane':'main','data-workspace-pane-state':'open'},right));}`);
const {Studio}=await import(await compileModule('src/shell/Studio.tsx',{'./SplitWorkspace':split,'../i18n/ui/useUI':dataModule('export const useUI=()=>text=>text;')}));
const css=readFileSync(new URL('../src/shell/studio-mobile.css',import.meta.url),'utf8');
const threshold=Number(/max-width:\s*(\d+)px/.exec(css)[1]);
const mobile=/@media[^\{]+\{([\s\S]*)\}\s*$/.exec(css)[1];
function Form(){const [value,setValue]=React.useState('');return React.createElement('input',{value,onChange:e=>setValue(e.target.value),'aria-label':'Topic'});}

test('real Studio at 390px stacks form before results, has touch targets and sticky submit; desktop remains side by side',async()=>{
 const errors=[],original=console.error;console.error=(...args)=>errors.push(args.join(' '));
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container);const style=document.createElement('style');document.head.append(style);
 try{
  // jsdom has no media-query layout engine. Activate the real stylesheet's
  // declared media block at the requested viewport, then inspect computed CSS.
  window.innerWidth=390;style.textContent='.test-split {display:flex;flex-direction:row;}'+mobile;
  await act(async()=>root.render(React.createElement(Studio,{ops:React.createElement(React.Fragment,null,React.createElement(Form),React.createElement('button',{type:'submit'},'Run')),canvas:React.createElement('div',null,'Result')})));
  const panes=container.querySelectorAll('[data-workspace-pane]');assert.equal(panes[0].dataset.workspacePane,'left');assert.equal(panes[1].dataset.workspacePane,'main');
  assert.equal(window.getComputedStyle(container.querySelector('[data-workspace-split]')).flexDirection,'column');
  assert.equal(window.getComputedStyle(container.querySelector('button')).minHeight,'44px');assert.equal(window.getComputedStyle(container.querySelector('button')).position,'sticky');
  const input=container.querySelector('input');const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
  await act(async()=>{setter.call(input,'A report');input.dispatchEvent(new window.Event('input',{bubbles:true}));});
  const before=container.querySelector('input');window.innerWidth=1280;style.textContent='.test-split {display:flex;flex-direction:row;}';
  await act(async()=>window.dispatchEvent(new window.Event('resize')));
  assert.ok(390<=threshold&&1280>threshold);assert.equal(container.querySelector('input'),before);
  assert.equal(window.getComputedStyle(container.querySelector('[data-workspace-split]')).flexDirection,'row');assert.deepEqual(errors,[]);
 }finally{await act(async()=>root.unmount());container.remove();style.remove();console.error=original;}
});
