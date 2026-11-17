import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require=createRequire(import.meta.url);
const reactUrl=pathToFileURL(require.resolve('react')).href;
const fabricRequire=createRequire(require.resolve('fabric/node'));
const canvasEntry=fabricRequire.resolve('canvas');
const previousCanvas=require.cache[canvasEntry];
require.cache[canvasEntry]={id:canvasEntry,filename:canvasEntry,loaded:true,exports:{}};
const {JSDOM}=await import(pathToFileURL(fabricRequire.resolve('jsdom')).href);
if(previousCanvas)require.cache[canvasEntry]=previousCanvas;else delete require.cache[canvasEntry];
import { compileModule, dataModule } from './helpers/module-bench.mjs';
import { CLIENT_EXPORT_TARGETS } from '../src/shell/doc-editors/export-targets.ts';
const tt=dataModule('export function useUI(){return (s,v)=>String(s).replace(/\\{(\\w+)\\}/g,(m,k)=>v?.[k]??m);}');
const client=dataModule(`
export async function loadExportCapabilities(){return {sources:{docx:[{target:'pdf',where:'server',label:'PDF'}],pptx:[{target:'pdf',where:'server',label:'PDF'},{target:'png-zip',where:'server',label:'PNG ZIP'},{target:'png-long',where:'server',label:'long'}],xlsx:[{target:'pdf',where:'server',label:'PDF'}],pdf:[{target:'docx',where:'server',label:'Word'},{target:'png-zip',where:'server',label:'PNG ZIP'}],mp4:[{target:'webm',where:'server',label:'WebM'},{target:'gif',where:'server',label:'GIF'},{target:'mp3',where:'server',label:'MP3'}],wav:[{target:'mp3',where:'server',label:'MP3'},{target:'wav',where:'server',label:'WAV'},{target:'m4a',where:'server',label:'M4A'}]}};}
export async function convertExportFile(file,target){globalThis.__udlMenu.conversions.push({file,target});return new Blob(['converted']);}
export async function saveExportToLibrary(file,target,item){globalThis.__udlMenu.saves.push({file,target,item});return {artifactId:'new-item',revisionId:'r-new'};}
export function libraryExportHref(){return '/library?item=new-item&revisionId=r-new';}
`);
const {useExportDownloads}=await import(await compileModule('src/shell/doc-editors/use-export-downloads.ts',{
  './export-client':client,
  '../advanced-draft-gates':dataModule(`export async function flushAdvancedDraftGate(){if(globalThis.__udlMenu.denyFlush)return {ok:false,errorMessage:"flush failed"};return {ok:true,item:{title:'Saved parent',artifactId:'parent',revisionId:'r-after-flush'}};}`),
  './doc-io':dataModule(`export function downloadBlob(filename,blob){globalThis.__udlMenu.downloads.push({filename,blob});}`),
}));
const {PluginMoreMenu}=await import(await compileModule('src/shell/plugin-chrome/PluginMoreMenu.tsx',{
  '../../i18n/ui/useUI':tt,
  '../editor-item-social-chrome':dataModule(`export function useEditorItemSocial(){return {shareAvailable:false,favoriteAvailable:false,error:'',notice:'',busy:''};}`),
  '../anchored-popover':dataModule(`import {createElement} from ${JSON.stringify(reactUrl)};export function AnchoredPopover({open,children,attributes,role,id}){return open?createElement('div',{...attributes,role,id},children):null;}`),
  '../../ui/Button':dataModule(`import {createElement,forwardRef} from ${JSON.stringify(reactUrl)};export const Button=forwardRef(function Button({children,variant,block,align,selected,...props},ref){return createElement('button',{...props,ref,type:'button'},children);});export const IconButton=forwardRef(function IconButton({label,icon,variant,...props},ref){return createElement('button',{...props,ref,type:'button','aria-label':label},icon);});`),
  '../AdvancedEditorIcon':dataModule(`import {createElement} from ${JSON.stringify(reactUrl)};export function AdvancedEditorIcon({name}){return createElement('span',{'data-icon':name});}`),
}));
function EditorMenu({editor,empty=false}) {
  const item={id:'parent',key:'artifact:parent',title:'Draft',artifactId:'parent',revisionId:'old-r',meta:{}};
  const downloads=useExportDownloads({editor,item,generate:async(target)=>({filename:`live.${CLIENT_EXPORT_TARGETS[editor][0]?.target||'wav'}`,blob:new Blob(empty ? [] : [`current ${editor} edits`])})});
  globalThis.__udlMenu.actions=downloads;
  return React.createElement(PluginMoreMenu,{item,downloads,defaultDownloadId:downloads[0]?.id,onDownload:action=>action.onTrigger()});
}
async function withDom(run) {
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://ui.test',pretendToBeVisual:true});
  const names=['window','document','navigator','HTMLElement','HTMLButtonElement','Node','IS_REACT_ACT_ENVIRONMENT'];
  const saved=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  for(const name of names)Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[name]});
  const root=createRoot(dom.window.document.getElementById('root'));
  const click=async(selector)=>{const node=dom.window.document.querySelector(selector);assert.ok(node,selector);await act(async()=>node.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));};
  globalThis.__udlMenu={saves:[],downloads:[],conversions:[]};
  try{await run({root,doc:dom.window.document,click});}finally{await act(async()=>root.unmount());for(const[name,descriptor]of saved)descriptor?Object.defineProperty(globalThis,name,descriptor):delete globalThis[name];dom.window.close();delete globalThis.__udlMenu;}
}
for(const editor of Object.keys(CLIENT_EXPORT_TARGETS))test(`${editor}: every target row offers download and save; save uses edited bytes and flushed parent revision`,async()=>withDom(async({root,doc,click})=>{
  await act(async()=>{root.render(React.createElement(EditorMenu,{editor}));await new Promise(resolve=>setTimeout(resolve,0));});
  await click('[data-workspace-more-launcher]');await click('[data-workspace-download-launcher]');
  const downloadButtons=[...doc.querySelectorAll('[data-workspace-export-action-id]')];
  const saveButtons=[...doc.querySelectorAll('[data-workspace-save-export-action-id]')];
  assert.ok(downloadButtons.length>0);assert.equal(downloadButtons.length,saveButtons.length);
  const selector=`[data-workspace-save-export-action-id="${saveButtons[0].dataset.workspaceSaveExportActionId}"]`;
  await click(selector);
  const state=globalThis.__udlMenu;assert.equal(state.saves.length,1);assert.equal(state.downloads.length,0);
  assert.equal(await state.saves[0].file.blob.text(),`current ${editor} edits`);
  assert.equal(state.saves[0].item.revisionId,'r-after-flush');
  assert.equal(doc.querySelector('[data-export-result-toast] a').getAttribute('href'),'/library?item=new-item&revisionId=r-new');
}));

test('save refuses failed draft receipts and empty generated files before any upload',async()=>withDom(async({root,doc,click})=>{
  await act(async()=>root.render(React.createElement(EditorMenu,{editor:'richdoc'})));
  globalThis.__udlMenu.denyFlush=true;
  await click('[data-workspace-more-launcher]');await click('[data-workspace-download-launcher]');
  await click('[data-workspace-save-export-action-id="richdoc-export-docx"]');
  assert.equal(globalThis.__udlMenu.saves.length,0);assert.match(doc.querySelector('[data-export-result-toast]').textContent,/flush failed/);
  globalThis.__udlMenu.denyFlush=false;
  await act(async()=>root.render(React.createElement(EditorMenu,{editor:'richdoc',empty:true})));
  await click('[data-workspace-more-launcher]');await click('[data-workspace-download-launcher]');
  await click('[data-workspace-save-export-action-id="richdoc-export-docx"]');
  assert.equal(globalThis.__udlMenu.saves.length,0);assert.match(doc.querySelector('[data-export-result-toast]').textContent,/导出失败/);
}));
test('rapid duplicate save calls upload only once',async()=>withDom(async({root})=>{
  await act(async()=>root.render(React.createElement(EditorMenu,{editor:'image'})));
  const action=globalThis.__udlMenu.actions[0];
  await act(async()=>Promise.all([action.onSave(),action.onSave()]));
  assert.equal(globalThis.__udlMenu.saves.length,1);
}));
