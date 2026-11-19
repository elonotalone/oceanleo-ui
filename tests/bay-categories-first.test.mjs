import { PAGE_WORKSPACE_STUBS } from "./helpers/page-workspace-stubs.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import "./helpers/w1-jsdom-window.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { UI_MESSAGES } from "../src/i18n/ui/messages/index.ts";
import { LOCALES } from "../src/i18n/config.ts";

const { createRoot } = await import("react-dom/client");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.Event = window.Event;
globalThis.__readyReact = React;
const h = React.createElement;
const ui = dataModule('export function useUI(){return (key,vars={})=>key.replace(/\\{(\\w+)\\}/g,(_,k)=>vars[k]??k);}');
const ready = { enabled: true, sources: {}, legacy: [], sellers: [], calls: [], current: {kind:"feed"}, filter: {kind:"asset"}, listeners: new Set() };
globalThis.__readyBay = ready;
const state = dataModule(`
 const R=globalThis.__readyReact, s=globalThis.__readyBay;
 const subscribe=(fn)=>{s.listeners.add(fn);return()=>s.listeners.delete(fn);};
 export function bayEnabledHere(){return s.enabled;}
 export function useBaySignedIn(){return false;}
 export function useBayFilter(){return R.useSyncExternalStore(subscribe,()=>s.filter,()=>s.filter);}
 export function useBayState(){return R.useSyncExternalStore(subscribe,()=>s.current,()=>s.current) && {current:s.current};}
 export function useBaySiteKey(){return "oceanleo";}
 export function setBayFilter(filter){s.filter=filter;s.listeners.forEach(fn=>fn());}
 export function openBay(){} export function requireBayLogin(){return true;}
 export function setBaySiteKey(){} export function registerBayPage(){return()=>{};} export function bayBack(){}
`);
const data = dataModule(`export function useBayFeed(){return {items:[],loaded:true,loading:false,error:null,hasMore:false};}
 export function useBayCategories(){return {categories:[],loading:false,failed:false};}`);
const routeUrl = await compileModule("src/shell/bay/asset/BayArtifactDeepLink.tsx", {
 "../../../i18n/ui/useUI":ui,
 "../../asset-detail/AssetDetail":dataModule(`export function AssetDetail({entry,onBack}){return globalThis.__readyReact.createElement("article", {"data-asset-detail":""}, globalThis.__readyReact.createElement("header",{},globalThis.__readyReact.createElement("button",{onClick:onBack,"data-detail-back":""},"返回"),entry.title));}`),
 "../../asset-detail/BayAssetActions":dataModule('export function BayAssetActions(){return null;}'),
 "../../asset-detail/resolve":dataModule('export async function resolveAssetDetail(ref){return {entry:{id:JSON.stringify(ref),title:"成品详情",kind:"document"},actionContext:{}};}'),
 "../../material-library-standalone":dataModule('export function MaterialStandaloneEditor(){return null;}'),
});
const taxonomy = {version:1,shelves:["deck","design","document","sheet","website","game","video","model_3d","audio"].map(id=>({
 id,labels:{zh:id==="sheet"?"Sheet":id,en:id},artifactTypes:id==="document"?["document","pdf"]:[id],
 categories:[{id:id+"-empty",labels:{zh:"空分类",en:"Empty"},contentTypes:[]},{id:id+"-category",labels:{zh:"分类",en:"Category"},contentTypes:[{id:id+"-content",labels:{zh:"内容",en:"Content"}}]}],
})),tagVocabularies:{industry:[{id:"education",labels:{zh:"教育",en:"Education"}}]}};
const loads = dataModule(`
 export async function fetchMaterialTaxonomy(){return globalThis.__readyBay.taxonomy;}
 export async function fetchMaterialShelf(request,options){
   const s=globalThis.__readyBay;s.calls.push([request,options]);
   let items=s.sources[request.shelfType]||[];
   if(request.q)items=items.filter(row=>row.title.includes(request.q));
   const offset=options.officialOffset||0;
   return {items:items.slice(offset,offset+request.limit),
     categoryCovers:items.length?{[request.shelfType+"-category"]:{...items[0],thumb_url:"https://example.test/cover.png"}}:{},
     categoryFacets:{[request.shelfType+"-category"]:{industry:["education"]}},
     contentTypePreviews:{[request.shelfType+"-content"]:items.slice(0,4)},categoryCounts:{[request.shelfType+"-category"]:items.length},
     nextOfficial:offset+request.limit<items.length?offset+request.limit:null,nextSeller:null,unavailable:false};
 }
`);
const card = dataModule(`export function BayAssetCard({asset,onOpen,view}){return globalThis.__readyReact.createElement("button",{"data-bay-asset-card":asset.id,"data-view":view,onClick:()=>onOpen(asset)},asset.title);}`);
const catalogUrl = await compileModule("src/shell/bay/shell/ReadyMaterialCatalog.tsx", {
 "../../../i18n/ui/useUI":ui, "./material-shelf-client":loads, "../asset/BayAssetCard":card,
 "next-intl":dataModule('export function useLocale(){return "zh";}'),
});
const libraryUrl = await compileModule("src/shell/bay/asset/BayAssetLibrary.tsx", {
 "../../../i18n/ui/useUI":ui, "../shell/bay-state":state, "./BayArtifactDeepLink":routeUrl,
 "./LiveMaterialSearch":dataModule('export function LiveMaterialSearch({initialQuery}){return globalThis.__readyReact.createElement("div", {"data-live-material-search":true},initialQuery);}'),
 "../shell/ReadyMaterialCatalog":catalogUrl,
 "./BayAssetCard":card,
 "./BayLicensesView":dataModule('export function BayLicensesView(){return null;}'),
});
const { BayAssetLibrary } = await import(libraryUrl);
const { LeoBayPage } = await import(await compileModule("src/shell/bay/shell/LeoBayPage.tsx", {
    ...PAGE_WORKSPACE_STUBS,
 "../../../i18n/ui/useUI":ui, "./bay-state":state, "./use-bay-data":data,
 "next-intl":dataModule('export function useLocale(){return "zh";}'),
 "../asset/BayAssetLibrary":libraryUrl, "../asset/BayArtifactDeepLink":routeUrl,
 "./BayDetail":dataModule('export function BayDetailPane(){return null;} export function bayDetailTitleKey(){return "";}'),
 "../needs/LibraryWorkPicker":dataModule('export function LibraryWorkPickerHost(){return null;}'),
 "./bay-auth-host":dataModule('export function BayAuthHost(){return null;}'),
 "../apps/BayAppShelf":dataModule('export function BayAppShelf(){return null;}'),
 "../lessons/BayLessonShelf":dataModule('export function BayLessonShelf(){return null;}'),
}));
function asset(id,type,thumb="") { return {id,type,title:id,author:"OceanLeo",thumb_url:thumb,preview_url:"",full_url:"",tags:[]}; }
function reset(search="/bay",enabled=true) {
 window.history.replaceState({},"",search); ready.enabled=enabled;ready.calls=[];ready.taxonomy=taxonomy;
 ready.sources={document:[asset("template:doc-no-cover","document"),asset("template:doc","document")],deck:[asset("template:deck","ppt")],website:[asset("template:web","website")],game:[asset("template:game","game")]};
 ready.filter={kind:"asset"};ready.current={kind:"feed"};
}
async function mount(element){const host=document.createElement("div");document.body.append(host);const root=createRoot(host);await act(async()=>root.render(element));return {host,root,async close(){await act(async()=>root.unmount());host.remove();}};}
async function click(node){assert.ok(node,"click target exists");await act(async()=>node.click());}
const library = (extra={}) => h(BayAssetLibrary,{siteKey:"oceanleo",filter:{kind:"asset"},...extra});

test("navigation always shows the nine API shelf types plus Online materials",async()=>{
 reset();const v=await mount(library());try{
  assert.deepEqual([...v.host.querySelectorAll("[data-bay-ready-kind]")].map(n=>n.dataset.bayReadyKind),taxonomy.shelves.map(row=>row.id));
  assert.equal(v.host.querySelectorAll("[data-bay-ready-shelf]").length,0);
  assert.equal(new URLSearchParams(window.location.search).get("type"),"deck");
  assert.equal(v.host.querySelector("[data-bay-ready-all]"),null);
  assert.equal(v.host.querySelector("[data-bay-filter]"),null);
  assert.equal(v.host.querySelector("[data-bay-asset-card]"),null);
  assert.equal(v.host.querySelector('[data-bay-ready-category="deck-empty"]'),null);
  assert.equal(v.host.querySelectorAll("[data-bay-ready-category] img").length,1);
  const kinds=v.host.querySelector("[data-bay-ready-kinds]");
  assert.match(kinds.className,/flex-nowrap/);
  assert.ok([...kinds.querySelectorAll("button")].every(n=>!n.className.includes("border")&&!n.className.includes("rounded-full")));
  assert.ok([...kinds.querySelectorAll("button")].every(n=>n.querySelector("svg")));
  assert.ok([...v.host.querySelectorAll("button")].some(n=>n.textContent==="在线素材"));
  assert.ok(!v.host.textContent.includes("工作流"));
 }finally{await v.close();}
});

test("category tiles enter the sub-page with scoped dropdowns and horizontal shelves; back restores main",async()=>{
 reset();const v=await mount(library());try{
  await click(v.host.querySelector('[data-bay-ready-kind="document"]'));
  assert.equal(v.host.querySelectorAll("[data-bay-asset-card]").length,0);
  await click(v.host.querySelector('[data-bay-ready-category="document-category"]'));
  assert.equal(new URLSearchParams(window.location.search).get("cat"),"document-category");
  assert.ok(v.host.querySelector('[data-bay-filter="contentType"]'));
  assert.ok(v.host.querySelector('[data-bay-filter="industry"]'));
  assert.equal(v.host.querySelector('[data-bay-filter="format"]'),null);
  assert.equal(v.host.querySelector('[data-bay-ready-kinds]'),null);
  assert.equal(v.host.querySelector('[data-bay-ready-categories]'),null);
  assert.equal(v.host.querySelectorAll('[data-bay-asset-shelf] [data-bay-asset-card]').length,2);
  await click([...v.host.querySelectorAll("button")].find(n=>n.textContent==="查看全部"));
  assert.equal(new URLSearchParams(window.location.search).get("contentType"),"document-content");
  assert.ok(v.host.querySelector('[data-bay-ready-grid="document"]'));
  await click(v.host.querySelector('header a'));
  assert.equal(new URLSearchParams(window.location.search).get("cat"),null);
  assert.ok(v.host.querySelector('[data-bay-ready-category="document-category"]'));
 }finally{await v.close();}
});

test("browser back returns from a category to its type",async()=>{
 reset("/bay?type=document");const v=await mount(library());try{
  await click(v.host.querySelector('[data-bay-ready-category="document-category"]'));
  await act(async()=>{window.history.back();await new Promise(done=>setTimeout(done,40));});
  assert.equal(v.host.querySelector('[data-bay-ready-shelves]'),null);
  assert.ok(v.host.querySelector('[data-bay-ready-categories]'));
 }finally{await v.close();}
});

test("empty video, 3D and audio types remain available with one plain empty sentence",async()=>{
 reset();const v=await mount(library());try{
  for(const id of ["video","model_3d","audio"]){
   await click(v.host.querySelector(`[data-bay-ready-kind="${id}"]`));
   assert.ok(v.host.querySelector(`[data-bay-ready-kind="${id}"]`));
   assert.ok(v.host.textContent.includes("这里还没有这个分类的素材。"));
   assert.equal(v.host.querySelector('[data-bay-ready-category]'),null);
  }
 }finally{await v.close();}
});

test("pagination requests the next source page; searching reloads the selected shelf",async()=>{
 reset("/bay?type=document&cat=document-category&contentType=document-content");ready.sources.document=Array.from({length:35},(_,i)=>asset(`template:doc-${i}`,"document"));
 const v=await mount(library());try{
  assert.equal(v.host.querySelectorAll("[data-bay-asset-card]").length,30);
  await click([...v.host.querySelectorAll("button")].find(n=>n.textContent==="加载更多"));
  assert.equal(v.host.querySelectorAll("[data-bay-asset-card]").length,35);
  await act(async()=>v.root.render(library({filter:{kind:"asset",q:"doc-34"}})));
  assert.equal(v.host.querySelectorAll("[data-bay-asset-card]").length,1);
  assert.ok(ready.calls.some(([request,options])=>options.officialOffset===30));
 }finally{await v.close();}
});

for(const ref of ["template:deck","listing:seller","template:web","template:game"]){
 test(`${ref} detail keeps the listing chrome hidden and restores the selected shelf`,async()=>{
  reset(`/bay?type=deck&asset=${ref}`);const v=await mount(h(LeoBayPage,{siteKey:"oceanleo"}));try{
   assert.equal(v.host.querySelector("[data-bay-page-hero]"),null);
   assert.equal(v.host.querySelectorAll("[data-asset-detail]").length,1);
   await click(v.host.querySelector("[data-detail-back]"));
   assert.ok(v.host.querySelector("[data-bay-page-hero]"));
   assert.ok(v.host.querySelector('[data-bay-ready-category="deck-category"]'));
  }finally{await v.close();}
 });
}

test("history restores category filters and the fully loaded grid after opening a detail",async()=>{
 reset("/bay?kind=asset&type=document&cat=document-category&contentType=document-content");ready.sources.document=Array.from({length:35},(_,i)=>asset(`template:doc-${i}`,"document"));
 const v=await mount(h(LeoBayPage,{siteKey:"oceanleo"}));try{
  await click([...v.host.querySelectorAll("button")].find(n=>n.textContent==="加载更多"));
  const scroller=v.host.querySelector("[data-bay-page-feed]");scroller.scrollTop=512;
  await act(async()=>scroller.dispatchEvent(new window.Event("scroll",{bubbles:true})));
  await click(v.host.querySelector('[data-bay-asset-card="template:doc-34"]'));
  assert.equal(v.host.querySelector("[data-bay-page-hero]"),null);
  await act(async()=>{window.history.back();await new Promise(done=>setTimeout(done,40));});
  assert.ok(v.host.querySelector("[data-bay-page-hero]"));assert.equal(scroller.scrollTop,512);
  assert.equal(v.host.querySelectorAll("[data-bay-asset-card]").length,35);
 }finally{await v.close();}
});

test("CN material view uses taxonomy navigation and does not request seller data",async()=>{
 reset("/bay",false);const v=await mount(h(LeoBayPage,{siteKey:"oceanleo"}));try{
  assert.ok(v.host.querySelector('[data-bay-page="materials-only"]'));
  assert.equal(v.host.querySelectorAll("[data-bay-ready-kind]").length,9);
  assert.ok(ready.calls.every(([,options])=>options.sellers===false));
 }finally{await v.close();}
});

test("online picker stays shared and returning to a type restores its official/seller shelf",async()=>{
 reset("/bay?type=deck");const v=await mount(library());try{
  await click([...v.host.querySelectorAll("button")].find(node=>node.textContent==="在线素材"));
  assert.ok(v.host.querySelector("[data-live-material-search]"));
  assert.equal(new URLSearchParams(window.location.search).get("view"),"online");
  await click(v.host.querySelector('[data-bay-ready-kind="deck"]'));
  assert.equal(v.host.querySelector("[data-live-material-search]"),null);
  assert.equal(v.host.querySelectorAll("[data-bay-ready-category]").length,1);
 }finally{await v.close();}
});


test("a narrow sidebar keeps one scrollable type row with working overflow arrows",async()=>{
 reset();const v=await mount(h("div",{style:{width:"360px"}},library()));try{
  const row=v.host.querySelector("[data-bay-ready-kinds]");
  Object.defineProperties(row,{clientWidth:{value:360},scrollWidth:{value:1040}});
  row.scrollBy=({left})=>{row.scrollLeft=Math.max(0,Math.min(680,row.scrollLeft+left));row.dispatchEvent(new window.Event("scroll"));};
  await act(async()=>window.dispatchEvent(new window.Event("resize")));
  await click(v.host.querySelector('[aria-label="向右滚动"]'));
  assert.equal(row.scrollLeft,300);
  assert.ok(v.host.querySelector('[aria-label="向左滚动"]'));
  await click(v.host.querySelector('[aria-label="向左滚动"]'));
  assert.equal(row.scrollLeft,0);
  assert.equal(v.host.querySelector('[aria-label="向左滚动"]'),null);
  assert.ok(v.host.querySelector('[data-bay-ready-categories]').style.gridTemplateColumns.includes("min(100%"));
 }finally{await v.close();}
});
