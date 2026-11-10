import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvas = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM, VirtualConsole } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvas) require.cache[canvasEntry] = previousCanvas; else delete require.cache[canvasEntry];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', error => { if (error.type !== 'css parsing') throw error; });
const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://example.test/library", virtualConsole });
for (const name of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "MouseEvent"]) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: dom.window[name] || dom.window });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const ui = dataModule(`const tt=(value, vars) => String(value).replace(/\\{(\\w+)\\}/g, (_, k) => vars?.[k] ?? k);export function useUI(){return tt;}`);
const { createRoot } = await import("react-dom/client");

async function render(element) {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  await act(async () => root.render(element));
  return { host, root };
}

// Mount the real list, shelf, cards, project hook and menu. Only external data and
// editor routes are replaced; the loading/filter/action behavior stays real.
const reactUrl = pathToFileURL(require.resolve('react')).href;
const auth = dataModule(`export * from ${JSON.stringify(new URL('../src/lib/auth/client.ts',import.meta.url).href)};export const AUTH_STATE_EVENT='test-auth'; export async function accessToken(){return null;} export async function getUserIdSnapshot(){return {available:true,userId:'test-owner'};}`);
const client = dataModule(`
 export * from ${JSON.stringify(new URL("../src/shell/artifact-client.ts",import.meta.url).href)};
 export const ARTIFACT_LIBRARY_CHANGE_EVENT='test-library';
 export async function listMyArtifacts(options){ const response=await fetch('/v1/library/mine'+(options.cursor?'?cursor='+options.cursor:''),{signal:options.signal}); return response.json(); }
 export async function listFavoriteArtifacts(){return {ok:true,data:{ownerPrincipalId:'test-owner',items:[],nextCursor:null}};}
 export async function getCurrentArtifactItem(id){return (await fetch("/v1/library/items/"+id)).json();}
 export async function ensureArtifact(){return {ok:false};} export async function retireArtifact(){return {ok:false};}
`);
const libraryOverrides = {
 '../i18n/ui/useUI': ui,
 '../lib/auth/client': auth,
 '../lib/auth/config': dataModule(`export * from ${JSON.stringify(new URL('../src/lib/auth/config.ts',import.meta.url).href)};export function gatewayBase(){return '';}`),
 './artifact-client': client,
 '../lib/database': dataModule(`export * from ${JSON.stringify(new URL('../src/lib/database.ts',import.meta.url).href)};export function humanLibraryUploadError(v){return v;} export async function normalizeUploadIdempotencyKey(){return '';} export async function uploadFile(){return {ok:false};}`),
 './library-standalone-editor-host': dataModule(`export function MaterialStandaloneEditor(){return null;}`),
 './editor-preload': dataModule(`export function preloadEditorFor(){}`),
 './library-edit-intent': dataModule(`export function useLibraryEditIntent(){}`),
 './library-chat-files': dataModule(`export async function listLibraryChatFiles(){return {ok:true,items:[]};} export function chatFileMatches(){return false;} export function chatFileLibraryItem(){return null;}`),
 './library-memo/LibraryMemoPage': dataModule(`export function LibraryMemoPage(){return null;}`),
 './library-detail-app-actions': dataModule(`export function useMaterialDetailAppPlan(){return {item:null,editRoute:null};} export function MaterialOwningAppEdit(){return null;} export function MaterialOwningAppList(){return null;}`),
 './ArtifactActions': dataModule(`export function ArtifactActionButtons(){return null;} export function artifactActionMatrix(){return {};}`),
 './library-viewers': dataModule(`import React from ${JSON.stringify(reactUrl)}; export function LibraryItemViewer({item}){return React.createElement('article',null,item.content||item.title);}`),
 './workspace-library-thumbnail': dataModule(`export function WorkspaceThumbnail(){return null;}`),
 './task-attachment-library-link': dataModule(`export function TaskAttachmentLibraryLink(){return null;}`),
};
const myLibraryUrl = await compileModule('src/shell/MyLibrary.tsx', libraryOverrides);
const { MyLibrary } = await import(myLibraryUrl);
const projectId = '550e8400-e29b-41d4-a716-446655440000';
const title = 'Live dashboard';
const link = { id:'w1', title, kind:'website', links:[{label:'Live',url:'https://example.com'}], updated_at:'2026-10-03T00:00:00Z' };
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
function json(value){return new Response(JSON.stringify(value));}
function minePage(){return {ok:true,data:{ownerPrincipalId:'test-owner',items:[],serverWorks:[{...link,link_work:link}],nextCursor:null}};}
async function dispose(mounted){await act(async()=>mounted.root.unmount());mounted.host.remove();}

const pause = () => new Promise(r => setTimeout(r, 30));
const click = async node => { assert.ok(node); await act(async () => { node.click(); await pause(); }); };
const menuItem = text => [...document.querySelectorAll('[role="menuitem"]')].find(n => n.textContent.includes(text));
async function search(host, text) { const input=host.querySelector('input');await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,text);input.dispatchEvent(new Event('input',{bubbles:true}));}); }
async function scenario(run, {membershipFailure=false, delay=null, membershipDelay=null, failMutations=false}={}) {
 const oldFetch=globalThis.fetch,oldError=console.error;const errors=[],calls=[];let members=[{kind:'work',id:'w1',projects:[{id:projectId,name:'仪表盘'}]}];
 console.error=(...args)=>errors.push(args.map(String).join(' '));
 globalThis.fetch=async(url,init={})=>{
  const path=String(url);calls.push({path,method:init.method||'GET',body:init.body});
  if(path.startsWith('/v1/library/mine')){if(delay)await delay.promise;return json(minePage());}
  if(path==='/v1/library/project-memberships'){if(membershipDelay)await membershipDelay.promise;return membershipFailure ? new Response('{}',{status:500}) : json({items:members});}
  if(path==='/v1/projects')return json({items:[{id:projectId,name:'仪表盘',role:'edit'},{id:'p2',name:'基础设施',role:'owner'},{id:'p3',name:'Read only',role:'view'}]});
  if(failMutations && ['POST','DELETE'].includes(init.method))return new Response('{}',{status:500});
  if(init.method==='POST'){members=[{kind:'work',id:'w1',projects:[...members[0].projects,{id:'p2',name:'基础设施'}]}];return json({});}
  if(init.method==='DELETE'){members=[{kind:'work',id:'w1',projects:members[0].projects.filter(p=>p.id!==projectId)}];return json({});}
  if(path==='/v1/works/older')return json({work:{...link,id:'older',title:'Older link'}});
  if(path==='/v1/library/items/older-artifact')return json({ok:true,data:globalThis.__oneLibraryArtifact});
  if(path.startsWith('/v1/library/items/'))return json({ok:false,status:404});
  return json({});
 };
 try {await run(calls);assert.deepEqual(errors,[]);} finally {globalThis.fetch=oldFetch;console.error=oldError;}
}
for(const scoped of [false,true]) test(`normal full list, project captions and search with legacy project action=${scoped}`,async()=>{
 const gate=deferred();await scenario(async calls=>{
  const mounted=await render(React.createElement(MyLibrary,scoped?{action:{nonce:'one-'+scoped,action:{version:1,tab:'mine',projectId,projectName:'仪表盘'}}}:{}));
  try {
   assert.match(mounted.host.textContent,/正在加载/);await act(async()=>{gate.resolve();await pause();});
   assert.match(mounted.host.textContent,/Live dashboard/);assert.match(mounted.host.textContent,/仪表盘/);
   assert.doesNotMatch(mounted.host.textContent,/显示整个 Library|回到项目|项目「|这个项目还没有素材/);
   await search(mounted.host,'仪表盘');assert.match(mounted.host.textContent,/Live dashboard/);
   await search(mounted.host,'not present');assert.doesNotMatch(mounted.host.textContent,/Live dashboard/);
   assert.equal(calls.filter(c=>c.path==='/v1/library/project-memberships').length,1);
   assert.equal(calls.some(c=>c.path.includes('/assets')||c.path.endsWith('/library-items')),false);
  } finally {gate.resolve();await dispose(mounted);}
 },{delay:gate});
});
test('membership 500 leaves the full list usable without error copy',async()=>scenario(async()=>{
 const mounted=await render(React.createElement(MyLibrary));try{await act(pause);assert.match(mounted.host.textContent,/Live dashboard/);assert.doesNotMatch(mounted.host.textContent,/仪表盘|失败|500|无法加载/);}finally{await dispose(mounted);}
},{membershipFailure:true}));
test('same card menu checks membership, filters viewers and toggles references with immediate captions',async()=>scenario(async calls=>{
 const mounted=await render(React.createElement(MyLibrary,{pageTitle:'我的库'}));try{
  await act(pause);await click(mounted.host.querySelector('[aria-label="更多操作"]'));await click(menuItem('加入项目'));
  assert.match(menuItem('仪表盘').textContent,/✓/);assert.equal(menuItem('Read only'),undefined);
  await click(menuItem('仪表盘'));assert.doesNotMatch(mounted.host.textContent,/仪表盘/);
  assert.ok(calls.some(c=>c.method==='DELETE'&&c.path.endsWith('/library-items/work/w1')));
  await click(mounted.host.querySelector('[aria-label="更多操作"]'));await click(menuItem('加入项目'));await click(menuItem('基础设施'));
  assert.match(mounted.host.textContent,/基础设施/);assert.ok(calls.some(c=>c.method==='POST'&&c.body===JSON.stringify({kind:'work',id:'w1'})));
 }finally{await dispose(mounted);}
}));

// The real sidebar host passes the same action into the real MyLibrary/shelf.
// Network, unrelated panels and editors are stubbed, not the Library detail shell.
globalThis.requestAnimationFrame=window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame=window.cancelAnimationFrame.bind(window);
globalThis.ResizeObserver=class {observe(){} unobserve(){} disconnect(){}};
window.HTMLElement.prototype.scrollTo=function(){};
window.HTMLElement.prototype.scrollIntoView=function(){};
const noop = dataModule(`
 export function CloudBrowserPanel(){return null;} export function NavigatorGuide(){return null;}
 export function BayAssetLibrary(){return null;} export function BayPanel(){return null;}
 export function LeoChatPanel(){return null;} export function useBayEnabled(){return false;}
 export function useImEnabled(){return false;} export function useFunctionGuide(){return null;}
 export function useWorkspaceRuntimeHydration(){return null;} export function useOptionalWorkspaceSession(){return null;}
 export function WorkspaceEntryCanvas(){return null;} export function AdvancedContentWorkbench(){return null;}
 export function EditBarDockHost(){return null;}
`);
const splitUrl=await compileModule('src/shell/SplitWorkspace.tsx',{'../i18n/ui/useUI':ui,'./EditBarDockHost':noop});
const canvasUrl=await compileModule('src/shell/ResultCanvas.tsx',{
 ...libraryOverrides, './MyLibrary':myLibraryUrl, './SplitWorkspace':splitUrl,
 './CloudBrowserPanel':noop, './NavigatorGuide':noop, './bay/asset/BayAssetLibrary':noop,
 './bay/panel':noop,'./leochat/LeoChatPanel':noop,'./bay/shell/bay-state':dataModule(`export * from ${JSON.stringify(new URL('../src/shell/bay/shell/bay-state.ts',import.meta.url).href)};export function useBayEnabled(){return false;}`),
 './guide-context':noop,'./workspace-runtime-hydration':noop,
 './WorkspaceEntryCanvas':noop,'./AdvancedContentWorkbench':noop,
 'next/navigation':dataModule(`export function usePathname(){return '/library';}export function useRouter(){return {push(){},replace(){}};}`),
 './workspace-panels/DevicesWorkspacePanel':dataModule('export function DevicesWorkspacePanel(){return null;}'),
 './workspace-panels/ProjectsWorkspacePanel':dataModule('export function ProjectsWorkspacePanel(){return null;}'),
 './workspace-panels/SettingsWorkspacePanel':dataModule('export function SettingsWorkspacePanel(){return null;}'),
 './workbench-material-provider':dataModule(`const actions=[];export function useWorkbenchMaterialActions(){return {actions,perform(){},canPerform(){return false;},availability:{},beginMaterialDrag(){},endMaterialDrag(){}};}`),
});
const {ResultCanvas}=await import(canvasUrl);
const {SplitWorkspace}=await import(splitUrl);
const {readFileSync}=await import('node:fs');
const {normalizeArtifactProjectionResult}=await import('../src/shell/artifact-contract.ts');
const {artifactProjectionToLibraryItem}=await import('../src/shell/library-data.ts');
const raw=JSON.parse(readFileSync(new URL('./fixtures/oceanleo-artifact-library-pages.json',import.meta.url),'utf8'));
const projection=normalizeArtifactProjectionResult(raw.publicPage.items[0]).data;
const artifact=artifactProjectionToLibraryItem({...projection,artifactId:'older-artifact',title:'Older document'});
globalThis.__oneLibraryArtifact=artifact;
for(const [id,title] of [['older-artifact','Older document'],['link-work:older','Older link'],['missing-artifact',null]]) test(`real ResultCanvas resolves ${id} beyond page one into standard detail`,async()=>scenario(async calls=>{
 const action={nonce:`detail-${id}`,action:{version:1,tab:'mine',itemId:id,projectId,projectName:'仪表盘'}};
 const child=React.createElement(ResultCanvas,{tabs:[],active:'mine',action});
 const mounted=await render(React.createElement(SplitWorkspace,{left:React.createElement('div',null,'Chat'),right:child,library:{open:true},fillParent:true}));
 try {
  await act(pause);
  if(title){assert.ok(mounted.host.querySelector('[data-asset-detail]'));assert.match(mounted.host.textContent,new RegExp(title));}
  else {assert.equal(mounted.host.querySelector('[data-asset-detail]'),null);assert.match(mounted.host.textContent,/Live dashboard/);assert.doesNotMatch(mounted.host.textContent,/失败|404/);}
  assert.ok(calls.some(c=>c.path===(id.startsWith('link-work:')?'/v1/works/older':`/v1/library/items/${id}`)));
 }finally{await dispose(mounted);}
}));

test('project captions cap visible names at three in both grid and list cards',async()=>{
 const {WorkspaceCard,WorkspaceListRow}=await import(await compileModule('src/shell/workspace-library-view.tsx',libraryOverrides));
 const {linkWorkLibraryItem}=await import('../src/shell/works/link-work-item.ts');
 const item=linkWorkLibraryItem(link);item.meta.library_projects=['One','Two','Three','Four'].map((name,id)=>({id:String(id),name}));
 const entry={id:item.key,title:item.title,libraryItem:item};
 for(const Component of [WorkspaceCard,WorkspaceListRow]){
  const mounted=await render(React.createElement(Component,{entry,onOpen(){},accent:'#000'}));
  try{assert.match(mounted.host.textContent,/One、Two、Three等 4 个项目/);assert.doesNotMatch(mounted.host.textContent,/Four/);}finally{await dispose(mounted);}
 }
});

test('slow membership reads never hold up the Library cards',async()=>{
 const gate=deferred();await scenario(async()=>{
  const mounted=await render(React.createElement(MyLibrary));try{await act(pause);assert.match(mounted.host.textContent,/Live dashboard/);assert.doesNotMatch(mounted.host.textContent,/正在加载|仪表盘/);await act(async()=>{gate.resolve();await pause();});assert.match(mounted.host.textContent,/仪表盘/);}finally{gate.resolve();await dispose(mounted);}
 },{membershipDelay:gate});
});
test('failed reference mutation preserves caption and shows human error copy',async()=>scenario(async()=>{
 const mounted=await render(React.createElement(MyLibrary));try{
  await act(pause);await click(mounted.host.querySelector('[aria-label="更多操作"]'));await click(menuItem('加入项目'));await click(menuItem('仪表盘'));
  assert.match(mounted.host.textContent,/仪表盘/);assert.match(mounted.host.textContent,/项目更新失败，请重试。/);assert.doesNotMatch(mounted.host.textContent,/500|request failed/);
 }finally{await dispose(mounted);}
},{failMutations:true}));

test('missing item action closes a previously open detail quietly',async()=>scenario(async()=>{
 const element=id=>React.createElement(MyLibrary,{action:{nonce:`replace-${id}`,action:{version:1,tab:'mine',itemId:id}}});
 const mounted=await render(element('link-work:older'));
 try{
  await act(pause);assert.ok(mounted.host.querySelector('[data-asset-detail]'));
  await act(async()=>{mounted.root.render(element('missing-artifact'));await pause();});
  assert.equal(mounted.host.querySelector('[data-asset-detail]'),null);assert.match(mounted.host.textContent,/Live dashboard/);assert.doesNotMatch(mounted.host.textContent,/404|失败/);
 }finally{await dispose(mounted);}
}));
