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
for (const name of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "CustomEvent", "MouseEvent"]) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: dom.window[name] || dom.window });
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
 './workspace-panels/SettingsWorkspacePanel':dataModule('export function SettingsWorkspacePanel(){return null;}'),
 './workbench-material-provider':dataModule(`const actions=[];export function useWorkbenchMaterialActions(){return {actions,perform(){},canPerform(){return false;},availability:{},beginMaterialDrag(){},endMaterialDrag(){}};}`),
});
const {ResultCanvas}=await import(canvasUrl);
const {SplitWorkspace}=await import(splitUrl);

const {registerWorkspacePanel, resetWorkspacePanelsForTests} = await import('../src/shell/workspace-panels/registry.ts');
const {normalizeWorkspaceAction} = await import('../src/shell/workspace-actions.ts');
const shellUrl = await compileModule('src/shell/TaskWorkspaceShell.tsx', {
 ...libraryOverrides, './ResultCanvas':canvasUrl, './SplitWorkspace':splitUrl,
 './WorkspaceSession':dataModule(`export function WorkspaceSessionProvider({children}){return children;}`),
 './workspace-session-context':noop,
});
const {TaskWorkspaceShell,useTaskWorkspaceState}=await import(shellUrl);
const {openTaskWorkspaceLibrary}=await import(await compileModule('src/shell/task-attachment-open.ts',{
 ...libraryOverrides, './TaskWorkspaceShell':shellUrl,
 './task-attachment-library-link':dataModule('export function withTaskAttachmentActions(value){return value;}'),
}));
let workspace;
function Host(){
 workspace=useTaskWorkspaceState({defaultOpen:true});
 return React.createElement(TaskWorkspaceShell,{state:workspace,left:React.createElement('div',null,'Chat'),tabs:[],canvas:{taskId:'task-1'},fillParent:true});
}
const requests=[];
let projectGate;
function Projects({projectId,requestNonce,onBackChange,onOpenLibraryItem,onOpenLibrary,taskId}){
 const [selected,setSelected]=React.useState(null);
 const [loaded,setLoaded]=React.useState(false);
 React.useEffect(()=>{let live=true;projectGate.promise.then(()=>{if(live)setLoaded(true);});return()=>{live=false;};},[]);
 React.useEffect(()=>{requests.push({projectId,requestNonce,taskId});setSelected(projectId||null);},[projectId,requestNonce,taskId]);
 React.useEffect(()=>{onBackChange(selected?()=>setSelected(null):null);return()=>onBackChange(null);},[selected,onBackChange]);
 if(!loaded)return React.createElement('p',{'data-project-loading':true},'Loading projects');
 return React.createElement('section',{'data-test-projects':true,'data-selected':selected||''},selected
  ? React.createElement(React.Fragment,null,
    React.createElement('p',null,'Configuration '+selected),
    React.createElement('button',{'data-asset':true,onClick:()=>onOpenLibraryItem('link-work:older')},'Asset'),
    React.createElement('button',{'data-all-assets':true,onClick:onOpenLibrary},'All assets'))
  : React.createElement('button',{'data-select-project':true,onClick:()=>setSelected('chosen-project')},'Choose project'));
}
async function projectScenario(run,{fallback=false,...options}={}){
 resetWorkspacePanelsForTests();requests.length=0;projectGate=deferred();
 const unregister=fallback?()=>{}:registerWorkspacePanel('projects',Projects);
 try{await scenario(async calls=>{const mounted=await render(React.createElement(Host));try{await run(mounted,calls);}finally{projectGate.resolve();await dispose(mounted);}},options);}
 finally{unregister();resetWorkspacePanelsForTests();}
}
const headerBack=host=>host.querySelector('[data-workspace-view-header] [data-workspace-back]');
const selectedProject=host=>host.querySelector('[data-test-projects]').getAttribute('data-selected');
async function openProject(id){await act(async()=>{openTaskWorkspaceLibrary(workspace,{version:2,tab:'projects',...(id?{projectId:id}:{})});await pause();});}
async function loadProjects(){await act(async()=>{projectGate.resolve();await pause();});}

test('C1 parser bounds a nonempty project id, keeps legacy validation and ignores unknown fields',()=>{
 assert.equal(normalizeWorkspaceAction({version:2,tab:'projects',projectId:'  demo-project  ',extra:'ignored'}).projectId,'demo-project');
 assert.equal(normalizeWorkspaceAction({version:2,tab:'projects',projectId:'x'.repeat(100)}).projectId.length,80);
 for(const projectId of ['', '  ',42,{},null])assert.equal(normalizeWorkspaceAction({version:2,tab:'projects',projectId}).projectId,undefined);
 assert.equal(normalizeWorkspaceAction({version:2,tab:'projects',extra:'ignored'}).extra,undefined);
 assert.equal(normalizeWorkspaceAction({version:1,tab:'projects'}),null);
 assert.equal(normalizeWorkspaceAction({version:1,tab:'mine',projectId:'demo-project'}).projectId,undefined);
});
test('real shell card/header copy, loading then list, selected project inner Back then card home',async()=>projectScenario(async({host})=>{
 const card=host.querySelector('[data-workspace-card="projects"]');assert.ok(card);assert.match(card.textContent,/项目配置/);assert.match(card.textContent,/查看和修改各个项目的配置/);assert.doesNotMatch(card.textContent,/Projects|管理项目和任务归属/);
 await click(card);assert.match(host.querySelector('[data-workspace-view-header]').textContent,/项目配置/);assert.ok(host.querySelector('[data-project-loading]'));
 await loadProjects();await click(host.querySelector('[data-select-project]'));assert.equal(selectedProject(host),'chosen-project');
 await click(headerBack(host));assert.equal(selectedProject(host),'');assert.equal(host.querySelector('[data-workspace-view]').getAttribute('data-workspace-view'),'projects');
 await click(headerBack(host));assert.equal(host.querySelector('[data-workspace-view]').getAttribute('data-workspace-view'),'home');
}));
test('C1 direct open passes project/task and unique nonce; same id reselects after inner Back',async()=>projectScenario(async({host})=>{
 await openProject('project-a');await loadProjects();assert.equal(selectedProject(host),'project-a');assert.equal(requests.at(-1).taskId,'task-1');const first=requests.at(-1).requestNonce;assert.ok(first);
 await click(headerBack(host));assert.equal(selectedProject(host),'');
 await openProject('project-a');assert.equal(selectedProject(host),'project-a');assert.notEqual(requests.at(-1).requestNonce,first);
 await openProject('project-b');assert.equal(selectedProject(host),'project-b');
}));
test('C2 asset uses standard direct Library detail and header Back restores the same selected configuration',async()=>projectScenario(async({host},calls)=>{
 await openProject('project-a');await loadProjects();const nonce=requests.at(-1).requestNonce;
 await click(host.querySelector('[data-asset]'));assert.equal(host.querySelector('[data-workspace-view]').getAttribute('data-workspace-view'),'mine');assert.ok(host.querySelector('[data-asset-detail]'));assert.match(host.querySelector('[data-asset-detail]').textContent,/Older link/);assert.ok(calls.some(c=>c.path==='/v1/works/older'));
 await click(headerBack(host));assert.equal(host.querySelector('[data-workspace-view]').getAttribute('data-workspace-view'),'projects');assert.equal(selectedProject(host),'project-a');assert.equal(requests.at(-1).requestNonce,nonce);
 await click(host.querySelector('[data-all-assets]'));assert.equal(host.querySelector('[data-asset-detail]'),null);assert.match(host.querySelector('[data-workspace-slot-panel="mine"]').textContent,/Live dashboard/);
 await click(headerBack(host));assert.equal(selectedProject(host),'project-a');
 await click(headerBack(host));assert.equal(selectedProject(host),'');
}));
test('C2 all assets loads the normal Library list and header Back restores configuration',async()=>{
 const gate=deferred();await projectScenario(async({host})=>{
 await openProject('project-a');await loadProjects();await click(host.querySelector('[data-all-assets]'));
 const mine=host.querySelector('[data-workspace-slot-panel="mine"]');assert.equal(mine.hidden,false);assert.match(mine.textContent,/正在加载/);
 await act(async()=>{gate.resolve();await pause();});assert.match(mine.textContent,/Live dashboard/);assert.equal(host.querySelector('[data-asset-detail]'),null);
 await click(headerBack(host));assert.equal(selectedProject(host),'project-a');assert.equal(host.querySelector('[data-workspace-view]').getAttribute('data-workspace-view'),'projects');
 },{delay:gate});
});
test('a new C1 during a Library visit takes precedence and changes the configuration',async()=>projectScenario(async({host})=>{
 await openProject('project-a');await loadProjects();await click(host.querySelector('[data-asset]'));await openProject('project-b');
 assert.equal(host.querySelector('[data-workspace-view]').getAttribute('data-workspace-view'),'projects');assert.equal(selectedProject(host),'project-b');
 await click(headerBack(host));assert.equal(selectedProject(host),'');
}));
test('a project chosen from the list survives Library without a C1 project id',async()=>projectScenario(async({host})=>{
 await click(host.querySelector('[data-workspace-card="projects"]'));await loadProjects();await click(host.querySelector('[data-select-project]'));
 await click(host.querySelector('[data-all-assets]'));await click(headerBack(host));assert.equal(selectedProject(host),'chosen-project');
 await click(headerBack(host));assert.equal(selectedProject(host),'');await click(headerBack(host));
 await click(host.querySelector('[data-workspace-card="mine"]'));await click(headerBack(host));assert.equal(host.querySelector('[data-workspace-view]').getAttribute('data-workspace-view'),'home');
}));
test('unregistered fallback has no Projects/New project header row',async()=>projectScenario(async({host})=>{
 await openProject();await act(async()=>{await new Promise(r=>setTimeout(r,350));});const panel=host.querySelector('[data-workspace-projects-panel]');assert.ok(panel);assert.equal(panel.querySelector('h2'),null);assert.doesNotMatch(panel.textContent,/Projects|New project|新建项目/);assert.match(panel.textContent,/查看和修改各个项目的配置/);
},{fallback:true}));
