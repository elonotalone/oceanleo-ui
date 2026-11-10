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
const ui = dataModule(`export function useUI(){return (value, vars) => String(value).replace(/\\{(\\w+)\\}/g, (_, k) => vars?.[k] ?? k);}`);
const view = await compileModule("src/shell/workspace-library-view.tsx", {
  "../i18n/ui/useUI": ui,
  "./collection-items": dataModule(`export function CollectionItemCard(){return null;} export function CollectionItemRow(){return null;}`),
  "./library-viewers": dataModule(`export function LibraryItemViewer({item}){return React.createElement("article", {"data-viewer": item.title}, item.content || item.title);}`),
  "./workspace-library-model": dataModule(`export const WORKSPACE_KIND_LABELS={};`),
  "./workspace-library-thumbnail": dataModule(`export function WorkspaceThumbnail(){return null;}`),
  "./works/link-work-item": dataModule(`export function linkWorkFromLibraryItem(){return null;}`),
  "./library-project-membership": dataModule(`import { createContext } from ${JSON.stringify(pathToFileURL(require.resolve("react")).href)};export const LibraryProjectContext=createContext(new Map());export function projectNames(){return [];}`),
  "./library-sections": dataModule(`export function librarySourceLabel(){return "项目文件";}`),
  "./library-editor-category": dataModule(`export function libraryEditorLabel(){return "文档";} export function libraryCategoryLabel(){return "文档";} export function translateLibraryTypeLabel(_tt,v){return v;}`),
});
const { WorkspaceLibraryEmpty, WorkspaceLibraryEntryViewer } = await import(view);
const { createRoot } = await import("react-dom/client");

async function render(element) {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  await act(async () => root.render(element));
  return { host, root };
}

test("real sidebar viewer renders project markdown content and empty copy", async () => {
  const entry = { id: "a1", title: "notes.md", content: "hello from project", libraryItem: null };
  const mounted = await render(React.createElement(WorkspaceLibraryEntryViewer, { entry }));
  try { assert.match(mounted.host.textContent, /hello from project/); } finally { await act(async () => mounted.root.unmount()); mounted.host.remove(); }
  const empty = await render(React.createElement(WorkspaceLibraryEmpty, { title: "这个项目还没有素材", description: "上传素材后会显示在这里" }));
  try { assert.match(empty.host.textContent, /这个项目还没有素材/); } finally { await act(async () => empty.root.unmount()); empty.host.remove(); }
});

// Mount the real list, shelf, cards, project hook and menu. Only external data and
// editor routes are replaced; the loading/filter/action behavior stays real.
const reactUrl = pathToFileURL(require.resolve('react')).href;
const auth = dataModule(`export const AUTH_STATE_EVENT='test-auth'; export async function accessToken(){return null;} export async function getUserIdSnapshot(){return {available:true,userId:'test-owner'};}`);
const client = dataModule(`
 export const ARTIFACT_LIBRARY_CHANGE_EVENT='test-library';
 export async function listMyArtifacts(options){ const response=await fetch('/v1/library/mine'+(options.cursor?'?cursor='+options.cursor:''),{signal:options.signal}); return response.json(); }
 export async function listFavoriteArtifacts(){return {ok:true,data:{ownerPrincipalId:'test-owner',items:[],nextCursor:null}};}
 export async function getCurrentArtifactItem(){return {ok:false,status:404};}
 export async function ensureArtifact(){return {ok:false};} export async function retireArtifact(){return {ok:false};}
`);
const myLibraryUrl = await compileModule('src/shell/MyLibrary.tsx', {
 '../i18n/ui/useUI': ui,
 '../lib/auth/client': auth,
 '../lib/auth/config': dataModule(`export function gatewayBase(){return '';}`),
 './artifact-client': client,
 '../lib/database': dataModule(`export function humanLibraryUploadError(v){return v;} export async function normalizeUploadIdempotencyKey(){return '';} export async function uploadFile(){return {ok:false};}`),
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
});
const { MyLibrary } = await import(myLibraryUrl);
const projectId = '550e8400-e29b-41d4-a716-446655440000';
const title = 'oceandino · 仪表盘 · 实时：注册 / 在线 / 消费';
const link = { id:'w1', title, kind:'website', links:[{label:'Live',url:'https://example.com'}], updated_at:'2026-10-03T00:00:00Z' };
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
function json(value){return new Response(JSON.stringify(value));}
function minePage(){return {ok:true,data:{ownerPrincipalId:'test-owner',items:[],serverWorks:[{...link,link_work:link}],nextCursor:null}};}
async function dispose(mounted){await act(async()=>mounted.root.unmount());mounted.host.remove();}
for (const scoped of [false,true]) {
 test(`real MyLibrary delayed ${scoped?'project':'full'} search stays loading then finds the link`, async () => {
  const gate=deferred(); const originalFetch=globalThis.fetch; const errors=[]; const originalError=console.error;
  console.error=(...args)=>errors.push(args.map(String).join(' '));
  globalThis.fetch=async(url)=>{
   const path=String(url);
   if(path.startsWith('/v1/library/mine')){await gate.promise;const page=minePage();return json(page);}
   if(path.endsWith('/library-items')){await gate.promise;return json({items:[{kind:'work',id:'w1',item:{title,link_work:link}}]});}
   if(path.includes('/assets?'))return json({items:[]});
   if(path.endsWith('/access'))return json({role:'edit'});
   return json({});
  };
  let mounted;
  try {
   mounted=await render(React.createElement(MyLibrary,scoped?{action:{nonce:'scope',action:{version:1,tab:'mine',projectId,projectName:'仪表盘'}}}:{}));
   const input=mounted.host.querySelector('input'); assert.ok(input);
   await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'仪表盘');input.dispatchEvent(new Event('input',{bubbles:true}));});
   assert.match(mounted.host.textContent,/正在加载/);assert.doesNotMatch(mounted.host.textContent,/没有匹配内容|这里还没有内容/);
   await act(async()=>{gate.resolve();await new Promise(r=>setTimeout(r,30));});
   assert.equal(input.value,'仪表盘');
   assert.match(mounted.host.textContent,new RegExp(title));
   assert.doesNotMatch(mounted.host.textContent,/正在加载/);
   await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'absent-query');input.dispatchEvent(new Event('input',{bubbles:true}));});
   assert.match(mounted.host.textContent,/没有匹配内容/);
   assert.equal(mounted.host.querySelector('[data-collection-infinite-sentinel]'),null);
   assert.deepEqual(errors,[]);
  } finally {gate.resolve();if(mounted)await dispose(mounted);globalThis.fetch=originalFetch;console.error=originalError;}
 });
}

test('full Library pagination spinner clears after the final page',async()=>{
 const originalFetch=globalThis.fetch,originalError=console.error;const errors=[];console.error=(...args)=>errors.push(args.map(String).join(' '));const gate=deferred();let mounted;
 globalThis.fetch=async(url)=>{if(String(url).includes('?cursor=')){await gate.promise;return json(minePage());}const page=minePage();page.data.nextCursor='next';return json(page);};
 try{
  mounted=await render(React.createElement(MyLibrary));await act(async()=>{await new Promise(r=>setTimeout(r,20));});
  const more=mounted.host.querySelector('[data-collection-load-more]');assert.ok(more);
  await act(async()=>more.click());assert.match(mounted.host.querySelector('[data-collection-infinite-sentinel]').textContent,/正在加载/);
  await act(async()=>{gate.resolve();await new Promise(r=>setTimeout(r,20));});assert.equal(mounted.host.querySelector('[data-collection-infinite-sentinel]'),null);
  assert.deepEqual(errors,[]);
 }finally{gate.resolve();if(mounted)await dispose(mounted);globalThis.fetch=originalFetch;console.error=originalError;}
});
