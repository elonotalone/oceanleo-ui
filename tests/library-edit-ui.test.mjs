// Unit DOM only: no browser, Playwright or network calls.
import './helpers/w1-jsdom-window.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
import { LibraryEditFlow } from '../src/shell/plugin-command/library-edit-flow.ts';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.__UAI_REACT=React;
const registry=dataModule(`export function currentEditorContext(){return globalThis.__UAI_UI.surface} export function subscribeEditorContext(){return ()=>{}}`);
const runtime=dataModule(`export function currentLibraryEdit(){return {flow:globalThis.__UAI_UI.flow,binding:globalThis.__UAI_UI.binding}} export function libraryEditFlow(){return globalThis.__UAI_UI.flow} export function bindLibraryEditor(){return ()=>{}}`);
const workspace=dataModule(`export function useOptionalWorkspaceSession(){return {activeFileScopeId:'scope',sessionId:'session'}}`);
const stubs={'./registry':registry,'./library-edit-runtime':runtime,'../workspace-session-context':workspace,'../../i18n/ui/useUI':dataModule(`export function useUI(){return key=>key}`)};
const {EditorLibraryEditEntry}=await import(await compileModule('src/shell/plugin-command/LibraryEditEntry.tsx',stubs));
const {useLibraryEditReadOnly,useLibraryEditReload}=await import(await compileModule('src/shell/plugin-command/use-library-edit.tsx',stubs));
const item=revisionId=>({id:'a',artifactId:'a',revisionId,title:'Report',kind:'document',meta:{}});
function harness(){
 const queue=[],events=[];let mounts=0;
 const h={item:item('r1'),surface:{editorId:'richdoc',target:()=>({artifactId:'a',workspaceScopeId:'scope'})}};
 h.binding={item:()=>h.item,writable:()=>true,context:()=>({selection:{kind:'text',from:1,to:4},excerpt:{ready:true,kind:'text',content:'selected'}}),save:async()=>{events.push('save');const next=item(h.item.revisionId==='r1'?'r2':h.item.revisionId);h.setItem(next);h.item=next;return next}};
 h.flow=new LibraryEditFlow(h.item,{create:async()=>{events.push('task');return 't1'},status:async()=>({status:'done',note:'Changed only the selected paragraph'}),head:async()=>item('r3'),stop:async()=>{events.push('stop')},restore:async()=>item('r4'),schedule:fn=>queue.push(fn)});
 globalThis.__UAI_UI=h;
 function Editor({revisionId,readOnly}){useEffect(()=>{mounts++},[]);return React.createElement('input',{'data-editor-input':revisionId,readOnly});}
 function Host(){const [current,setItem]=useState(h.item);h.setItem=setItem;h.item=current;const epoch=useLibraryEditReload(current,setItem);const readOnly=useLibraryEditReadOnly(current);return React.createElement('div',null,React.createElement(Editor,{key:epoch,revisionId:current.revisionId,readOnly}),React.createElement(EditorLibraryEditEntry,{editorId:'richdoc'}));}
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 return {h,events,queue,host,root,Host,mounts:()=>mounts,close:()=>{act(()=>root.unmount());host.remove()}};
}
test('real entry renders a request, locks while running, survives drawer remount and reloads once with revision note and undo',async()=>{
 const t=harness();try{
 act(()=>t.root.render(React.createElement(t.Host)));
 assert.ok(t.host.querySelector('textarea'));assert.match(t.host.textContent,/让 AI 修改/);
 await act(async()=>{await t.h.flow.start('Improve selected paragraph',t.h.binding)});
 assert.deepEqual(t.events,['save','task']);assert.ok(t.host.querySelector('[data-editor-input]').readOnly);assert.ok(t.host.querySelector('textarea').disabled);assert.match(t.host.textContent,/编辑器暂时只读/);assert.ok([...t.host.querySelectorAll('button')].some(b=>b.textContent==='停止'));
 // The flow belongs to the workbench, not the panel mount.
 act(()=>t.root.render(React.createElement(t.Host)));assert.equal(t.h.flow.getSnapshot().taskId,'t1');
 await act(async()=>{await t.h.flow.poll()});
 assert.equal(t.host.querySelector('[data-editor-input]').getAttribute('data-editor-input'),'r3');assert.equal(t.mounts(),2);assert.equal(t.host.querySelector('[data-editor-input]').readOnly,false);assert.match(t.host.textContent,/Changed only the selected paragraph/);assert.ok([...t.host.querySelectorAll('button')].some(b=>b.textContent==='撤销 AI 修改'));
 await act(async()=>{const button=[...t.host.querySelectorAll('button')].find(b=>b.textContent==='撤销 AI 修改');button.click();await Promise.resolve()});
 assert.equal(t.host.querySelector('[data-editor-input]').getAttribute('data-editor-input'),'r4');assert.match(t.host.textContent,/已恢复 AI 修改前的版本/);
 }finally{t.close()}
});
test('Stop button requests cancellation without prematurely unlocking the editor',async()=>{
 const t=harness();try{act(()=>t.root.render(React.createElement(t.Host)));await act(async()=>{await t.h.flow.start('Edit',t.h.binding)});await act(async()=>{[...t.host.querySelectorAll('button')].find(b=>b.textContent==='停止').click();await Promise.resolve()});assert.equal(t.h.flow.getSnapshot().phase,'stopping');assert.ok(t.host.querySelector('[data-editor-input]').readOnly);assert.equal(t.events.filter(e=>e==='stop').length,1)}finally{t.close()}
});
const {AssetDetail}=await import(await compileModule('src/shell/asset-detail/AssetDetail.tsx',{
 ...stubs,
 '../../i18n/ui/useUI':dataModule(`export function useUI(){return key=>key}`),
 '../workspace-library-view':dataModule(`export function WorkspaceLibraryEntryViewer({entry}){return globalThis.__UAI_REACT.createElement('span',{'data-preview-revision':entry.libraryItem.revisionId},entry.libraryItem.revisionId)}`),
 '../library-editor-category':dataModule(`export function libraryEditorLabel(){return 'Document'}export function translateLibraryTypeLabel(tt,label){return label}`),
 '../workspace-library-model':dataModule(`export const WORKSPACE_KIND_LABELS={};`),
 './AssetInfo':dataModule(`export function AssetInfo(){return null}`),
 '../bay/asset/BayListingContent':dataModule(`export function BayListingContent(){return null}`),
}));
for (const surface of ['library','bay','home','task',undefined]) {
 test(`${surface || 'legacy Library'} asset detail has no AI edit entry and displays the host revision`,()=>{
  const t=harness();try{
   const entry={id:'a',title:'Report',libraryItem:{...t.h.item,artifact:{owner:{visibility:'private'},access:{canEdit:true}}}};
   const props={actionContext:surface?{surface,owned:true,rights:{canUseInTask:true},ref:{kind:'artifact',artifactId:'a'}}:undefined,onBack:()=>{}};
   act(()=>t.root.render(React.createElement(AssetDetail,{...props,entry})));
   assert.doesNotMatch(t.host.textContent,/让 AI 修改/);
   assert.equal(t.host.querySelector('textarea'),null);
   assert.equal(t.host.querySelector('[data-library-ai-entry]'),null);
   assert.equal(t.host.querySelector('[data-editor-input]'),null);
   assert.deepEqual(t.events,[]);
   act(()=>t.root.render(React.createElement(AssetDetail,{...props,entry:{...entry,libraryItem:item('r3')}})));
   assert.equal(t.host.querySelector('[data-preview-revision]').getAttribute('data-preview-revision'),'r3');
  }finally{t.close()}
 });
}
