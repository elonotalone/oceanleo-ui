import './helpers/w1-jsdom-window.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
import { startAutoRecovery, useAutoRecovery } from '../src/lib/auto-recovery.ts';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const settle = async () => { for(let i=0;i<10;i++) await Promise.resolve(); };

function timerBench(t) {
  let id=0; const timers=new Map();
  t.mock.method(globalThis,'setTimeout',(fn,ms)=>{timers.set(++id,{fn,ms});return id;});
  t.mock.method(globalThis,'clearTimeout',key=>timers.delete(key));
  return {timers, async tick(ms){const [key,timer]=[...timers.entries()].find(([,timer])=>timer.ms===ms)??[];assert.ok(timer,`scheduled ${ms}ms`);timers.delete(key);await timer.fn();await settle();}};
}

test('recovery backs off indefinitely, pauses offline/hidden and wakes on online/visible/focus',async t=>{
  const b=timerBench(t);let calls=0;
  Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
  Object.defineProperty(navigator,'onLine',{configurable:true,value:true});
  const stop=startAutoRecovery(()=>{calls++;});
  try {
    await b.tick(1000);await b.tick(2000);await b.tick(4000);
    assert.equal(calls,3);
    Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});
    document.dispatchEvent(new window.Event('visibilitychange'));
    assert.equal(b.timers.size,0);
    Object.defineProperty(navigator,'onLine',{configurable:true,value:false});
    Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
    document.dispatchEvent(new window.Event('visibilitychange'));await settle();assert.equal(calls,3);
    Object.defineProperty(navigator,'onLine',{configurable:true,value:true});
    window.dispatchEvent(new window.Event('online'));await settle();assert.equal(calls,4);
    await b.tick(15000);await b.tick(30000);await b.tick(30000);
    window.dispatchEvent(new window.Event('focus'));await settle();assert.equal(calls,8);
  } finally { stop(); }
  assert.equal(b.timers.size,0);
  window.dispatchEvent(new window.Event('focus'));await settle();assert.equal(calls,8);
});

test('in-flight recovery is serial; cleanup does not leave a timer or event subscription',async t=>{
  const b=timerBench(t);let calls=0,release;
  const stop=startAutoRecovery(()=>{calls++;return new Promise(resolve=>release=resolve);});
  const entry=[...b.timers.values()][0];entry.fn();await settle();
  window.dispatchEvent(new window.Event('focus'));window.dispatchEvent(new window.Event('online'));await settle();
  assert.equal(calls,1);stop();release();await settle();assert.equal(b.timers.size,0);
});

test('hook keeps draft content and increasing backoff across saving/loading renders',async t=>{
  const b=timerBench(t);const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  let enabled=true,calls=0;
  function Editor(){ const [draft]=React.useState('unsaved changes');useAutoRecovery(enabled,()=>{calls++;});return React.createElement('textarea',{defaultValue:draft}); }
  try {
    await act(async()=>root.render(React.createElement(Editor)));
    await act(async()=>b.tick(1000));enabled=false;await act(async()=>root.render(React.createElement(Editor)));
    enabled=true;await act(async()=>root.render(React.createElement(Editor)));
    await act(async()=>b.tick(2000));assert.equal(calls,2);assert.equal(host.querySelector('textarea').value,'unsaved changes');
  } finally { await act(async()=>root.unmount());host.remove(); }
  assert.equal(b.timers.size,0);
});

const resolver=await import(await compileModule('src/shell/asset-detail/resolve.ts',{
  '../../lib/bay/assets': dataModule('export const resolveBayAsset=async()=>{if(globalThis.__resolveError)throw globalThis.__resolveError;return {artifactRef:{artifactId:"root",revisionId:"revision"},actionContext:{}};}'),
  '../artifact-client': dataModule('export const getArtifactItem=async()=>globalThis.__artifactResult;'),
  '../bay/asset/library-entry-adapter': dataModule('export const bayAssetToLibraryEntry=x=>x;'),
  '../workspace-library-model': dataModule('export const workspaceEntryFromLibraryItem=x=>x;'),
}));
test('resolver preserves status and classifies both API hops, while abort stays abort',async()=>{
  for(const [status,kind] of [[404,'not-found'],[401,'no-access'],[403,'no-access'],[409,'temporary'],[503,'temporary'],[0,'temporary']]){
    globalThis.__resolveError=Object.assign(new Error('upstream'),{status});
    await assert.rejects(resolver.resolveAssetDetail({kind:'template',id:'slug'}),e=>e.kind===kind&&e.status===status&&e.cause===globalThis.__resolveError);
    globalThis.__resolveError=null;globalThis.__artifactResult={ok:false,status};
    await assert.rejects(resolver.resolveAssetDetail({kind:'template',id:'slug'}),e=>e.kind===kind&&e.status===status);
  }
  const abort=Object.assign(new Error('abort'),{name:'AbortError'});globalThis.__resolveError=abort;
  await assert.rejects(resolver.resolveAssetDetail({kind:'template',id:'slug'}),e=>e===abort);
  globalThis.__resolveError=null;globalThis.__artifactResult={ok:true,data:{artifactId:'root',revisionId:'other'}};
  await assert.rejects(resolver.resolveAssetDetail({kind:'template',id:'slug'}),e=>e.kind==='temporary');
});

const useUI=dataModule('export const useUI=()=>s=>s;');
const {EditorSourceFailurePanel}=await import(await compileModule('src/shell/doc-editors/EditorSourceFailurePanel.tsx',{'../../i18n/ui/useUI':useUI}));
test('editor source failure renders loading without exposing raw errors or a recovery control',()=>{
  const html=renderToStaticMarkup(React.createElement(EditorSourceFailurePanel,{message:'secret chunk https://cdn.test/failed.js',onReload(){}}));
  assert.match(html,/aria-busy="true"/);assert.doesNotMatch(html,/<button|secret|https:|重新载入|重试/);
});

const {AdvancedWorkspaceActionBar}=await import(await compileModule('src/shell/AdvancedWorkspaceActionBar.tsx',{
  '../i18n/ui/useUI':useUI,
  './SplitWorkspace':dataModule('export const useRightPaneSlot=()=>null;'),
}));
const {WORKING_COPY_CONFLICT}=await import('../src/shell/editor-working-copy.ts');
test('real save status retries automatically and leaves a true conflict for an explicit choice',async t=>{
  const b=timerBench(t);const host=document.createElement('div');document.body.append(host);const root=createRoot(host);let retries=0;
  const noop=()=>{};
  const props={adapter:{id:'deck',label:'PPT',stage:null,persistence:{dirty:true,editRevision:1,flush:noop,recovery:{key:'draft',ready:true,capture:noop,restore:noop}}},
    autoSaveState:'error',activeLibraryPanelId:null,onBack:noop,onOpenLibrary:noop,onRetrySave:()=>retries++,onTriggerAction:noop};
  try {
    await act(async()=>root.render(React.createElement(AdvancedWorkspaceActionBar,props)));
    assert.match(host.textContent,/保存未完成，将自动重试/);assert.doesNotMatch(host.textContent,/点击重试/);
    await act(async()=>b.tick(1000));assert.equal(retries,1);
    await act(async()=>root.render(React.createElement(AdvancedWorkspaceActionBar,{...props,autoSaveError:WORKING_COPY_CONFLICT})));
    assert.equal(b.timers.size,0,'conflict must never auto-discard local work');
    assert.match(host.textContent,/文件已被他人修改/);
    await act(async()=>host.querySelector('[data-workspace-save-launcher]').click());
    const choice=document.querySelector('[data-workspace-save-action-id="choose-latest"]');
    assert.ok(choice);assert.match(choice.textContent,/放弃本地改动，使用最新版本/);
    assert.equal(retries,1);
  } finally {await act(async()=>root.unmount());host.remove();}
});

const {LibraryPdfReader}=await import(await compileModule('src/shell/LibraryPdfReader.tsx',{
  '../i18n/ui/useUI':useUI,
  './media-editors/pdf-engine-host':dataModule('export const openPdfEngineDocument=async()=>({numPages:0,doc:{pages:[]},close:async()=>{}});export const paintImageData=()=>{};'),
  './media-editors/pdf-workbench-utils':dataModule('export const pdfErrorMessage=()=>"temporary read failure";'),
}));
test('PDF retry re-runs its own source loader without requiring a parent remount or a retry button',async t=>{
  const b=timerBench(t);const host=document.createElement('div');document.body.append(host);const root=createRoot(host);let reads=0;
  try {
    await act(async()=>root.render(React.createElement(LibraryPdfReader,{title:'Document',loadBlob:async()=>{if(++reads===1)throw Error('network');return new Blob(['bytes']);}})));
    assert.equal(reads,1);assert.equal(host.querySelector('button'),null);
    await act(async()=>b.tick(1000));assert.equal(reads,2);assert.ok(host.querySelector('[data-library-pdf-reader]'));
    assert.equal(host.querySelector('button'),null);
  } finally {await act(async()=>root.unmount());host.remove();}
});
