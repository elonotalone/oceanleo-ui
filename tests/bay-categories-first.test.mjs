import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import "./helpers/w1-jsdom-window.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { BAY_ASSET_TYPE_ORDER } from "../src/shell/bay/asset/library-client.ts";
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
// Keep the pure helpers real without loading network modules through the stub graph.
const pure = await compileModule("src/shell/bay/shell/bay-ready-files.ts", {
 "../../../lib/bay/assets":dataModule('export async function resolveBayAsset(ref){return globalThis.__readyRaw(ref);}'),
 "../../../lib/bay/feed":dataModule('export async function fetchBayFeed(){return globalThis.__readyFeed();}'),
 "../../asset-detail/resolve":dataModule('export async function resolveAssetDetail(ref){return globalThis.__readyResolve(ref);}'),
 "../asset/bay-template-shelf":dataModule('export async function listBayOfficialTemplates(){return {items:[]};}'),
 "../asset/library-client":dataModule(`export const BAY_ASSET_TYPE_ORDER=${JSON.stringify(BAY_ASSET_TYPE_ORDER)}; export async function searchBayLibrary(params){return globalThis.__readyLegacy(params);}`),
});
const helpers = await import(pure);
const loads = dataModule(`
 const s=globalThis.__readyBay;
 export async function loadReadyOfficial(type,options){s.calls.push([type,options]);return s.sources[type]||[];}
 export async function loadReadyLegacyPpt(){return s.legacy;}
 export async function loadReadySellers(){s.calls.push(["sellers"]);return s.sellers;}
 export {readyShelfCover,readyTypeFromSearch} from ${JSON.stringify(pure)};
`);
const libraryUrl = await compileModule("src/shell/bay/asset/BayAssetLibrary.tsx", {
 "../../../i18n/ui/useUI":ui, "../shell/bay-state":state, "./BayArtifactDeepLink":routeUrl,
 "../shell/bay-ready-files":loads,
 "./BayAssetCard":dataModule(`export function BayAssetCard({asset,onOpen,view}){return globalThis.__readyReact.createElement("button",{"data-bay-asset-card":asset.id,"data-view":view,onClick:()=>onOpen(asset)},asset.title);}`),
 "./BayLicensesView":dataModule('export function BayLicensesView(){return null;}'),
});
const { BayAssetLibrary } = await import(libraryUrl);
const { LeoBayPage } = await import(await compileModule("src/shell/bay/shell/LeoBayPage.tsx", {
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
 window.history.replaceState({},"",search); ready.enabled=enabled;ready.calls=[];
 ready.sources={document:[asset("template:doc-no-cover","document"),asset("template:doc","document","https://example.test/doc.png")],image:[],ppt:[asset("template:deck","ppt")],website:[asset("template:web","website")],game:[asset("template:game","game")]};
 ready.legacy=[asset("library:ppt","ppt")];ready.sellers=[asset("listing:seller","ppt")];ready.filter={kind:"asset"};ready.current={kind:"feed"};
}
async function mount(element){const host=document.createElement("div");document.body.append(host);const root=createRoot(host);await act(async()=>root.render(element));return {host,root,async close(){await act(async()=>root.unmount());host.remove();}};}
async function click(node){assert.ok(node,"click target exists");await act(async()=>node.click());}
const library = (extra={}) => h(BayAssetLibrary,{siteKey:"oceanleo",filter:{kind:"asset"},...extra});

test("成品种类只来自批准的十一类，旧类型 URL 可以安全落回总货架",()=>{
 assert.deepEqual(BAY_ASSET_TYPE_ORDER,["document","image","poster","ppt","vector","3d","grid","pdf","audio","website","game"]);
 for(const type of ["workflow","video","font","sticker","chart","prompt","interactive_doc"]){
   assert.equal(helpers.readyTypeFromSearch(`?type=${type}&view=live`),null);
   assert.equal(helpers.readyTypeForEntry({kind:"file",libraryItem:{artifactType:type,kind:"file"}}),null);
 }
 assert.equal(helpers.readyTypeForEntry({kind:"image",libraryItem:{artifactType:"composite_image",kind:"image"}}),"poster");
 assert.equal(helpers.readyTypeForEntry({kind:"ppt",libraryItem:{artifactType:"deck",kind:"ppt"}}),"ppt");
});

test("0 件不出种类卡；封面取首个有预览图的成品；默认按类型分栏",async()=>{
 reset();const v=await mount(library());try{
  assert.deepEqual([...v.host.querySelectorAll("[data-bay-ready-kind]")].map(n=>n.dataset.bayReadyKind),["document","ppt","website","game"]);
  assert.equal(v.host.querySelector('[data-bay-ready-kind="document"] img').src,"https://example.test/doc.png");
  assert.equal(v.host.querySelectorAll("[data-bay-ready-shelf]").length,4);
  assert.equal(v.host.querySelector('[data-bay-ready-kind="ppt"]').textContent,"PPT3 件");
  for(const name of ["type","view","cat","industry","series"]){assert.equal(v.host.querySelector(`[data-bay-filter="${name}"]`),null);}
  for(const text of ["开源专区","实时搜索","我上传的","Prompt 示例","工作流"]){assert.ok(!v.host.textContent.includes(text));}
 }finally{await v.close();}
});

test("货架查看全部 / 种类卡进入网格；再次点击与全部返回；官方 deck + 旧 PPT + 卖家同栏",async()=>{
 reset();const v=await mount(library());try{
  await click(v.host.querySelector('[data-bay-ready-see-all="ppt"]'));
  assert.ok(v.host.querySelector('[data-bay-ready-grid="ppt"]'));
  assert.deepEqual([...v.host.querySelectorAll("[data-bay-asset-card]")].map(n=>n.dataset.bayAssetCard),["template:deck","library:ppt","listing:seller"]);
  assert.equal(new URLSearchParams(window.location.search).get("type"),"ppt");
  await click(v.host.querySelector('[data-bay-ready-kind="ppt"]'));assert.ok(v.host.querySelector("[data-bay-ready-shelves]"));
  await click(v.host.querySelector('[data-bay-ready-kind="document"]'));await click(v.host.querySelector("[data-bay-ready-all]"));assert.ok(v.host.querySelector("[data-bay-ready-shelves]"));
 }finally{await v.close();}
});

test("种类网格分页与搜索，旧 view/zone 参数不引入基础素材",async()=>{
 reset("/bay?type=document&view=live&zone=stocked&cat=official-templates");ready.sources.document=Array.from({length:35},(_,i)=>asset(`template:doc-${i}`,"document"));
 const v=await mount(library());try{
  assert.equal(v.host.querySelectorAll("[data-bay-asset-card]").length,30);
  await click([...v.host.querySelectorAll("button")].find(n=>n.textContent==="加载更多"));
  assert.equal(v.host.querySelectorAll("[data-bay-asset-card]").length,35);
  await act(async()=>v.root.render(library({filter:{kind:"asset",q:"doc-34"}})));
  assert.equal(v.host.querySelectorAll("[data-bay-asset-card]").length,1);
 }finally{await v.close();}
});

for(const ref of ["template:deck","library:ppt","listing:seller","template:web","template:game"]){
 test(`${ref} 深链只渲染详情；返回恢复类型，浏览页头两行才出现`,async()=>{
  reset(`/bay?type=ppt&view=owned&asset=${ref}`);const v=await mount(h(LeoBayPage,{siteKey:"oceanleo"}));try{
   assert.equal(v.host.querySelector("[data-bay-page-hero]"),null);assert.equal(v.host.querySelector("[data-bay-page-toolbar]"),null);
   assert.equal(v.host.querySelectorAll("[data-asset-detail]").length,1);assert.equal(v.host.querySelectorAll("[data-detail-back]").length,1);
   await click(v.host.querySelector("[data-detail-back]"));
   assert.ok(v.host.querySelector("[data-bay-page-hero]"));assert.equal(v.host.querySelectorAll("[data-bay-kind-tab]").length,5);
   assert.ok(v.host.querySelector('[data-bay-ready-grid="ppt"]'));assert.equal(v.host.querySelector('[data-bay-filter="category"]'),null);
  }finally{await v.close();}
 });
}

test("从网格点开详情再用历史返回，保留种类、分页与滚动位置",async()=>{
 reset("/bay?kind=asset&type=document");ready.sources.document=Array.from({length:35},(_,i)=>asset(`template:doc-${i}`,"document"));
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

test("境内形态只有种类卡和货架，打开素材仍独占详情",async()=>{
 reset("/bay",false);const v=await mount(h(LeoBayPage,{siteKey:"oceanleo"}));try{
  assert.ok(v.host.querySelector('[data-bay-page="materials-only"]'));
  assert.ok(v.host.querySelector("[data-bay-ready-kinds]"));assert.ok(v.host.querySelector("[data-bay-ready-shelves]"));
  assert.equal(v.host.querySelector("[data-bay-view]"),null);assert.equal(ready.calls.some(([key])=>key==="sellers"),false);
  await click(v.host.querySelector('[data-bay-asset-card="template:deck"]'));
  assert.equal(v.host.querySelectorAll("[data-asset-detail]").length,1);assert.equal(v.host.querySelector("[data-bay-page-hero]"),null);
 }finally{await v.close();}
});

test("旧 PPT 只请求一级 ppt 的自有作品并读完分页，绝不请求基础类型",async()=>{
 const calls=[];globalThis.__readyLegacy=async(params)=>{calls.push(params);return {items:[{...asset(`library:${params.page}`,"ppt"),origin:"first-party"}],has_more:params.page===1};};
 const items=await helpers.loadReadyLegacyPpt(new AbortController().signal);assert.equal(items.length,2);
 assert.deepEqual(calls.map(p=>[p.type,p.origin,p.page]),[["ppt","first-party",1],["ppt","first-party",2]]);
});

test("卖家通过真实作品类型归类，排除工作流且始终用 listing 身份打开",async()=>{
 globalThis.__readyFeed=async()=>({items:[{id:"a",title:"卖家设计",author:{display_name:"卖家"}},{id:"b",title:"工作流",author:{display_name:"卖家"}}],next_cursor:null});
 globalThis.__readyRaw=async()=>({artifactRef:{artifactId:"a",revisionId:"r"},actionContext:{}});
 globalThis.__readyResolve=async(ref)=>({entry:{kind:"image",libraryItem:{artifactType:ref.id==="a"?"composite_image":"workflow",kind:"image"}},actionContext:{}});
 const items=await helpers.loadReadySellers(new AbortController().signal);assert.equal(items.length,1);assert.equal(items[0].type,"poster");assert.equal(items[0].id,"listing:a");
});

test("BAY 回归：未购买卖家的多图层、矢量与 PDF 不被预览外形误归为图片或文档",async()=>{
 globalThis.__readyFeed=async()=>({items:[{id:"layered",title:"设计稿",author:{}},{id:"vector",title:"矢量图",author:{}},{id:"pdf",title:"PDF",author:{}}],next_cursor:null});
 globalThis.__readyResolve=async(ref)=>({entry:{kind:ref.id==="pdf"?"document":"image",libraryItem:{kind:ref.id==="pdf"?"document":"image",meta:{}}},actionContext:{}});
 globalThis.__readyRaw=async(ref)=>({asset:{...asset(ref.id,{layered:"composite_image",vector:"vector_image",pdf:"pdf"}[ref.id]),origin:"first-party"},actionContext:{rights:{canView:true}}});
 const items=await helpers.loadReadySellers(new AbortController().signal);
 assert.deepEqual(items.map(item=>item.type),["poster","vector","pdf"]);
});

test("新增中文文案补齐 16 语，保留件数占位符",()=>{
 for(const locale of LOCALES){
  assert.ok(UI_MESSAGES[locale]["设计稿（多图层）"]);assert.ok(UI_MESSAGES[locale]["{n} 件"]?.includes("{n}"));
 }
});
