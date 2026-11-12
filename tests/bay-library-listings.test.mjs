// UC-4 README skips raw HTML; UC-3/UC-6 typed previews retain the existing isolated viewer.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React, { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
import { normalizeDigitalWorks } from '../src/shell/bay/form/bay-digital-works.ts';

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve('fabric/node'));
const canvas = fabricRequire.resolve('canvas');
const previous = require.cache[canvas];
require.cache[canvas] = { id: canvas, filename: canvas, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve('jsdom')).href);
if (previous) require.cache[canvas] = previous; else delete require.cache[canvas];
const dom = new JSDOM('<!doctype html><html><body><main></main></body></html>', { url: 'https://dev.oceanleo.com' });
for (const key of ['window','document','navigator','HTMLElement','HTMLInputElement','Element','Node','Event','MouseEvent']) Object.defineProperty(globalThis,key,{ configurable:true, writable:true,value: key === 'window' ? dom.window : key === 'document' ? dom.window.document : dom.window[key] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import('react-dom/client');
const ui = dataModule(`export const useUI = () => (key,vars) => vars ? key.replace(/\\{(\\w+)\\}/g,(m,k)=>String(vars[k] ?? m)) : key;`);
const stubs = {
 '../../skills/kit/folder-api':dataModule(`export const gatewayAbsoluteUrl=url=>url;export const isGatewayUrl=()=>false;export const downloadFromGateway=async()=>({ok:true});`),
 '../../../i18n/ui/useUI': ui,
 '../../../lib/auth/client': dataModule(`export const getUserId = async () => 'buyer';`),
 '../../../lib/bay/assets': dataModule(`
 export const getBayAssetEntitlement = async () => globalThis.__entitlement;
 export const getBayListing = async () => ({ asset: globalThis.__asset });
 export const openBayPurchase = async id => { globalThis.__calls.push(['open',id]); return { libraryIdentity:{kind:'artifact',id:'mine'},downloadUrl:'https://cdn.example.com/item.zip' }; };
 export const copyBayPurchase = async id => { globalThis.__calls.push(['copy',id]); return { libraryIdentity:{kind:'artifact',id:'copy'} }; };
 export const publishBayVersion = async id => globalThis.__calls.push(['version',id]);
 export const updateBayPurchase = async id => globalThis.__calls.push(['update',id]);
 export const draftBayListing = async work => { if(globalThis.__refusal) throw new Error(globalThis.__refusal); return {title:'简介标题',summary:'摘要',description:'从库中读取的简介'}; };
 `),
 '../../workspace-actions': dataModule(`export const dispatchWorkspaceAction = value => globalThis.__calls.push(['workspace',value]);`),
 '../form/BayTypedPreview': dataModule(`export function BayTypedPreview(){ return null; }`),
 '../form/BayImageGallery': dataModule(`export function BayImageStage(){ return null; }`),
 './BayMergeComposer': dataModule(`import React from ${JSON.stringify(pathToFileURL(require.resolve('react')).href)}; export function BayMergeComposer(props){ return React.createElement('textarea',{'data-merge-draft':'',defaultValue:JSON.stringify(props)}); }`),
 '../../library-folders': dataModule(`export function LibraryFolderDetail(){return null;}`),
};
const { libraryWorkRef } = await import(await compileModule('src/lib/bay/library.ts', { '../agent': dataModule(`export const listTasks = async () => ({ok:true,data:{items:[]}});`), './http': dataModule(`export class BayApiError extends Error {}`) }));
const content = await import(await compileModule('src/shell/bay/asset/BayListingContent.tsx',stubs));
const facts = {kind:'folder',bytes:456,fileCount:3,pages:null,durationSeconds:null,width:null,height:null,formats:['md','ts'],license:'commercial',version:'r2',updatedAt:'2026-11-13'};
function mount(component) { const node=document.createElement('div');document.body.append(node);const root=createRoot(node);return {node, root, async render(){ await act(async()=>{root.render(component);}); },async close(){await act(async()=>root.unmount());node.remove();}}; }
function button(node,label){return [...node.querySelectorAll('button')].find(b=>b.textContent===label);}
async function click(node,label){const b=button(node,label);assert.ok(Boolean(b),label);await act(async()=>b.click());}

test('folder and typed Library selections retain canonical kinds',()=>{
 for (const kind of ['folder','artifact']) {
  const selected=libraryWorkRef({kind,id:kind,title:'素材',site_key:'oceanleo'});
  assert.equal(normalizeDigitalWorks([selected])[0].kind,kind);
 }
});
test('facts are read-only, preserve zero, omit null and display license/version',()=>{
 const html=renderToStaticMarkup(React.createElement(content.BayFacts,{facts:{...facts,bytes:0}}));
 assert.match(html,/库中信息/);assert.match(html,/>0</);assert.match(html,/可商用/);assert.match(html,/r2/);assert.doesNotMatch(html,/<input|时长（秒）|页数/);
});
test('UC-4 folder tree and README render markdown and discard raw HTML',()=>{
 const html=renderToStaticMarkup(React.createElement(content.BayFolderPreview,{preview:{tree:[{path:'src/main.ts'},{path:'<img onerror=evil>'}],readme:'# 用法\n\n**安装**\n\n<script>evil()</script><img src=x onerror=evil()>'}}));
 assert.match(html,/src\/main.ts/);assert.match(html,/<h1[^>]*>用法/);assert.match(html,/<strong>安装/);assert.match(html,/&lt;img onerror/);assert.doesNotMatch(html,/<script|<img src="x"|onerror="evil/);
});
test('purchased item offers update, open, download and editable copy; merge only opens prefilled draft',async()=>{
 globalThis.__calls=[];let refresh=0;
 const view=mount(React.createElement(content.BayPurchaseControls,{listingId:'sale',title:'源码',entitlement:{entitled:true,updateAvailable:true,latestRevisionId:'r3',editedCopies:[{id:'my-edit'}]},onRefresh:()=>refresh++}));await view.render();
 assert.match(view.node.textContent,/已在你的库里/);assert.ok(Boolean(button(view.node,'下载')));
 await click(view.node,'有新版本 · 更新');await click(view.node,'打开');await click(view.node,'另存一份可编辑的');
 assert.deepEqual(globalThis.__calls.filter(v=>v[0]!=='workspace'),[['update','sale'],['open','sale'],['copy','sale']]);assert.equal(refresh,3);
 await click(view.node,'让 agent 合并到我改过的版本');
 const draft=view.node.querySelector('[data-merge-draft]').value;assert.match(draft,/my-edit/);assert.match(draft,/r3/);assert.equal(globalThis.__calls.filter(v=>v[0]==='createTask').length,0);await view.close();
});
test('seller can publish newer Library revision and sees server failures',async()=>{
 globalThis.__calls=[];const view=mount(React.createElement(content.BayPurchaseControls,{listingId:'sale',title:'素材',entitlement:null,sellerUpdateAvailable:true,onRefresh:()=>{}}));await view.render();await click(view.node,'上架新版本');assert.deepEqual(globalThis.__calls,[['version','sale']]);await view.close();
});
test('no delivery-method copy or selector anywhere in Bay source',()=>{
 const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(`${dir}/${entry.name}`):/\.tsx?$/.test(entry.name)?[`${dir}/${entry.name}`]:[]);
 for (const file of walk('src/shell/bay')) assert.doesNotMatch(readFileSync(file,'utf8'),/交付方式|name="bay-delivery-mode"|交付在平台外完成/,file);
});

const pickerStubs = {
 './need-ui': dataModule(`export const BTN_SECONDARY='';export const INPUT='';export const errorText=(tt,error,fallback)=>error?.message || fallback;`),
 '../../MyLibrary': dataModule(`export const canonicalUploadLibraryItem=()=>null;export const legacyUploadTransient=()=>null;`),
 '../../../i18n/ui/useUI':ui,
 '../../../ui': dataModule(`import React from ${JSON.stringify(pathToFileURL(require.resolve('react')).href)}; export const Modal = ({children})=>React.createElement('div',null,children);`),
 '../../artifact-client': dataModule(`export const listMyArtifacts = async () => ({ok:true,data:{items:[{id:'art',artifactId:'art',revisionId:'r1',title:'设计稿',kind:'image'}],nextCursor:null}}); export const getCurrentArtifactItem=async()=>({ok:false});`),
 '../../library-data': dataModule(`export const isDurableLibraryItem = item=>Boolean(item.artifactId && item.revisionId);`),
 '../../skills/kit/folder-api': dataModule(`export const listFolders=async()=>({ok:true,data:[{id:'folder',title:'源码文件夹',created_at:'2026-11-13'}]});`),
 '../shell/bay-state': dataModule(`export const requireBayLogin=()=>true;`),
 '../../../lib/bay/library': dataModule(`export const filterLibraryWorks=(works,q)=>works.filter(w=>!q || w.title.includes(q)); export const libraryWorkRef=w=>({kind:w.kind,id:w.id,title:w.title});`),
 '../../../lib/database': dataModule(`export const getStorageUsage=async()=>({ok:true});export const uploadFile=async()=>({ok:false});`),
 './BayWorkShowcase':dataModule(`export function BayWorkShowcase(){return null;}`),
};
const picker = await import(await compileModule('src/shell/bay/needs/LibraryWorkPicker.tsx',pickerStubs));
const { BayDigitalWorksField } = await import(await compileModule('src/shell/bay/form/BayDigitalWorksField.tsx',{...stubs,...pickerStubs}));

test('existing Library picker selects a folder and a typed item',async()=>{
 const view=mount(React.createElement(picker.LibraryWorkPickerHost));await view.render();
 for(const [id,kind] of [['folder','folder'],['art','artifact']]) {
  let picked;await act(async()=>{picked=picker.pickLibraryWork();});
  await act(async()=>view.node.querySelector(`[data-bay-library-work="${id}"]`).click());
  assert.deepEqual(await picked,{id,kind,title:id==='folder'?'源码文件夹':'设计稿'});
 }
 await view.close();
});
test('draft description fills seller form and refusal appears next to selected item',async()=>{
 let written;globalThis.__refusal='';
 const view=mount(React.createElement(BayDigitalWorksField,{works:[{id:'folder',kind:'folder',title:'素材'}],onChange:()=>{},onDraft:value=>written=value,refusal:'购买的素材不能上架'}));await view.render();
 assert.match(view.node.querySelector('[data-bay-work-refusal]').textContent,/购买的素材不能上架/);
 await click(view.node,'让 agent 写简介');assert.equal(written.description,'从库中读取的简介');
 globalThis.__refusal='这份素材没有转售权限';await click(view.node,'让 agent 写简介');assert.match(view.node.textContent,/这份素材没有转售权限/);globalThis.__refusal='';await view.close();
});

test('merge prompt composer opens without creating a task',async()=>{
 let created=0;
 globalThis.__mergeCreate=()=>created++;
 const { BayMergeComposer } = await import(await compileModule('src/shell/bay/asset/BayMergeComposer.tsx',{
  '../../../i18n/ui/useUI':ui,
  '../../../ui':pickerStubs['../../../ui'],
  '../../../lib/agent':dataModule(`export const createTask=async()=>{globalThis.__mergeCreate();return {ok:true,data:{task_id:'new'}};};`),
  '../../LeoComposer':dataModule(`import React from ${JSON.stringify(pathToFileURL(require.resolve('react')).href)};export const LeoComposer=({value,onChange})=>React.createElement('textarea',{value,onChange:e=>onChange(e.target.value)});`),
 }));
 const view=mount(React.createElement(BayMergeComposer,{listingId:'sale',title:'游戏',copyId:'my-game',revisionId:'r3',onClose:()=>{}}));await view.render();
 for(let i=0;i<5&&!view.node.querySelector('textarea');i++) await act(async()=>{await new Promise(resolve=>setTimeout(resolve,10));});
 const value=view.node.querySelector('textarea').value;assert.match(value,/游戏/);assert.match(value,/my-game/);assert.match(value,/r3/);assert.match(value,/保留我的修改/);assert.equal(created,0);await view.close();
});

test('I6 client maps resolve facts/preview and uses exact draft/open/copy/version/update routes',async()=>{
 const calls=[];globalThis.__i6call=(method,path,body)=>{calls.push({method,path,body});return method==='GET'&&path.includes('/resolve?')?{asset:{id:'sale',title:'源码'},facts,preview:{kind:'folder',tree:[{path:'README.md'}]},description:'卖家简介',sellerUpdateAvailable:true}:{};};
 const api=await import(await compileModule('src/lib/bay/assets.ts',{'./http':dataModule(`export const bayGet=async(path)=>globalThis.__i6call('GET',path);export const bayPost=async(path,body)=>globalThis.__i6call('POST',path,body);`)}));
 const result=await api.getBayListing('a/b');assert.equal(result.asset.facts.fileCount,3);assert.equal(result.asset.preview.kind,'folder');assert.equal(result.asset.description,'卖家简介');assert.equal(result.asset.sellerUpdateAvailable,true);
 await api.draftBayListing({kind:'folder',id:'f'});await api.openBayPurchase('a/b');await api.copyBayPurchase('a/b');await api.publishBayVersion('a/b');await api.updateBayPurchase('a/b');
 assert.deepEqual(calls.map(c=>[c.method,c.path]),[['GET','/v1/bay/assets/resolve?kind=listing&id=a%2Fb'],['POST','/v1/bay/assets/draft'],['GET','/v1/bay/assets/a%2Fb/open'],['POST','/v1/bay/assets/a%2Fb/copy'],['POST','/v1/bay/assets/a%2Fb/version'],['POST','/v1/bay/assets/a%2Fb/update']]);assert.deepEqual(calls[1].body,{digital_work:{kind:'folder',id:'f'}});
});

test('new Bay copy is registered in every locale',async()=>{
 const { BAY_LIBRARY_MESSAGES }=await import('../src/i18n/ui/messages/bay-library-copy.ts');
 assert.equal(Object.keys(BAY_LIBRARY_MESSAGES).length,17);
 for(const [locale,messages] of Object.entries(BAY_LIBRARY_MESSAGES)) { assert.equal(Object.keys(messages).length,12,locale); assert.ok(Object.values(messages).every(value=>typeof value==='string'&&value.length>0),locale); }
});
