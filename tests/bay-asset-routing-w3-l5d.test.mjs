import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React, { act } from "react";
import "./helpers/w1-jsdom-window.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { bayAssetToLibraryEntry } from "../src/shell/bay/asset/library-entry-adapter.ts";
import { ASSET_DETAIL_MESSAGES } from "../src/i18n/ui/messages/asset-detail-copy.ts";
import { W3_L5D_MESSAGES } from "../src/i18n/ui/messages/w3-l5d-copy.ts";
import { MATERIAL_INDUSTRY_SUB_LABELS, MATERIAL_SHAPE_LABELS, MATERIAL_SKIN_LABELS } from "../src/shell/material-library-facets.ts";
import { ASSET_ACTIONS_MESSAGES } from "../src/i18n/ui/messages/asset-actions-copy.ts";
const { createRoot } = await import("react-dom/client");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.Event = window.Event;
globalThis.__w3Messages = { ...ASSET_DETAIL_MESSAGES.en, ...ASSET_ACTIONS_MESSAGES.en, ...W3_L5D_MESSAGES.en };
const reactUrl = pathToFileURL(createRequire(import.meta.url).resolve("react")).href;
const ui = dataModule(`export function useUI(){return (key, vars={}) => (globalThis.__w3Messages[key] || ({"返回列表":"Back to list","正在打开这份素材…":"Opening asset…","素材没读出来，请稍后再试。":"Could not open this asset. Try again.","重试":"Retry","图片":"Image","网站":"Website","版本":"Version","换一个版本":"Choose a version","看第 {n} 个版本，共 {total} 个":"Version {n} of {total}"})[key] || key).replace(/\\{(\\w+)\\}/g, (_, key) => vars[key] ?? key);}`);
const viewer = dataModule(`import { createElement as h } from ${JSON.stringify(reactUrl)};
 export function WorkspaceLibraryEntryViewer({entry}){return h("div", {"data-viewer":entry.id}, entry.libraryItem?.kind === "image" ? h("img", {src:entry.libraryItem.url,alt:entry.title}) : h("div", {"data-website-preview":entry.libraryItem?.previewUrl}, entry.title));}
 export function WorkspaceCard({entry,onOpen}){return h("button", {"data-card":entry.id,onClick:onOpen},entry.title);}
 export const WorkspaceListRow=WorkspaceCard;`);
const stubs = {
 "../../../i18n/ui/useUI": ui,
 "../../i18n/ui/useUI": ui,
 "../i18n/ui/useUI": ui,
 "next-intl": dataModule('export function useLocale(){return "en";}'),
 "../../workspace-library-view": viewer,
 "../workspace-library-view": viewer,
 "../ArtifactActions": dataModule('export function ArtifactActionButtons(){return null;} export function artifactActionMatrix(){return {};}'),
 "../artifact-client": dataModule('export function artifactDownloadEvidence(){return {available:false};} export async function prepareArtifactForAction(_,item){return {ok:true,data:item};}'),
 "../../asset-detail/resolve": dataModule('export function resolveAssetDetail(...args){return globalThis.__w3Resolve(...args);}'),
 "../../material-library-standalone": dataModule('export function MaterialStandaloneEditor(){return null;}'),
 "../../lib/bay/http": dataModule('export async function bayPost(){throw Error("Unexpected real mutation");}'),
};
const routeModule = await compileModule("src/shell/bay/asset/BayArtifactDeepLink.tsx", stubs);
const { BayArtifactDeepLink, bayAssetRefFromSearch, bayAssetRefForCard, bayAssetSearchWithRef, useBayAssetRoute } = await import(routeModule);
const { BayAssetCard } = await import(await compileModule("src/shell/bay/asset/BayAssetCard.tsx", stubs));
const { BayWebsiteCatalog, bayWebsiteCatalog, bayWebsiteSelection } = await import(await compileModule("src/shell/bay/asset/BayWebsiteCatalog.tsx", {
 ...stubs,
 "../shell/BayFilterSelect": dataModule('export function BayFilterSelect(){return null;}'),
 "../../collection-chrome": dataModule(`import {createElement as h} from ${JSON.stringify(reactUrl)}; export function CollectionCardGrid({children,...props}){return h("div",props,children);}`),
 "../../collection-items": dataModule(`import {createElement as h} from ${JSON.stringify(reactUrl)}; export function CollectionItemList({children,...props}){return h("div",props,children);}`),
}));
const asset = {id:"library:e11", type:"image", title:"E11 forest", source:"oceanleo", origin:"first-party", author:"OceanLeo", created_at:"2026-07-02T18:36:00.885642Z", thumb_url:"https://assets.example/thumb.jpg", preview_url:"https://assets.example/preview.jpg", full_url:"https://assets.example/full.jpg", price_fen:0, currency:"USD", license:{code:"OceanLeo-Free-1.0"}};
function context(ref={kind:"platform",id:"e11"}, extra={}) {return {surface:"bay",ref,owned:false,author:{name:"OceanLeo"},createdAt:asset.created_at,license:{code:"OceanLeo-Free-1.0"},commerce:{priceFen:0,currency:"USD",free:true,purchaseState:"none"},rights:{canView:true,canDownload:false,canDownloadSource:false,canEdit:false,canUseInTask:false,canAddToLibrary:false},...extra};}
function resolved(ref, extra={}) { const actionContext=context(ref,extra);return {entry:bayAssetToLibraryEntry({...asset,action_context:actionContext}),actionContext}; }
async function mount(component) { const container=document.createElement("div");document.body.append(container);const root=createRoot(container);await act(async()=>root.render(component));return {container,root,async close(){await act(async()=>root.unmount());container.remove();}}; }
async function click(node) { assert.ok(node,"click target exists"); await act(async()=>node.click()); }

for (const [search, expected] of [
 ["?asset=library:e11",{kind:"platform",id:"e11"}],
 ["?asset=platform_assets:e11",{kind:"platform",id:"e11"}],
 ["?asset=template-material:catalog-1",{kind:"template",id:"catalog-1"}],
 ["?asset=template:catalog-1",{kind:"template",id:"catalog-1"}],
 ["?asset=listing:seller-1",{kind:"listing",id:"seller-1"}],
 ["?listingId=seller-1",{kind:"listing",id:"seller-1"}],
 ["?artifactId=a1&revisionId=r2",{kind:"artifact",artifactId:"a1",revisionId:"r2"}],
 ["?asset=artifact:a1:r2",{kind:"artifact",artifactId:"a1",revisionId:"r2"}],
]) test(`deep link ${search} retains its own identity`,()=>assert.deepEqual(bayAssetRefFromSearch(search),expected));

test("selecting a ref clears conflicting detail keys and preserves browse query/hash-independent parameters",()=>{
 const search=bayAssetSearchWithRef("?type=website&view=owned&q=law&websiteSkin=glass&asset=library:old&artifactId=wrong&revisionId=old",{kind:"listing",id:"new"});
 assert.deepEqual(bayAssetRefFromSearch(search),{kind:"listing",id:"new"});
 assert.equal(new URLSearchParams(search).get("q"),"law");assert.equal(new URLSearchParams(search).get("websiteSkin"),"glass");
 assert.equal(new URLSearchParams(bayAssetSearchWithRef(search,null)).get("asset"),null);
});
test("cards use catalog identities; fixed typed revisions win, catalog-only rows use catalog resolution",()=>{
 assert.deepEqual(bayAssetRefForCard({...asset,catalogIdentities:[{catalogId:"cat",artifactId:"a",revisionId:null}]}),{kind:"template",id:"cat"});
 assert.deepEqual(bayAssetRefForCard({...asset,catalogIdentities:[{catalogId:"cat",artifactId:"a",revisionId:null},{artifactId:"a",revisionId:"fixed"}]}),{kind:"artifact",artifactId:"a",revisionId:"fixed"});
 assert.deepEqual(bayAssetRefForCard({...asset,entry:{libraryItem:{artifactId:"a",revisionId:"displayed"}},catalogIdentities:[{artifactId:"a",revisionId:"older"},{artifactId:"a",revisionId:"displayed"}]}),{kind:"artifact",artifactId:"a",revisionId:"displayed"});
 assert.deepEqual(bayAssetRefForCard({...asset,id:"artifact:mine:r1",openHref:"/workspace/ignored"}),{kind:"artifact",artifactId:"mine",revisionId:"r1"});
});
test("official cards keep the exact entry and invoke the host for grid and list, ignoring old navigation hrefs",async()=>{
 for(const view of ["grid","list"]){let opened;const catalogAsset={...asset,entry:{id:"catalog:1",title:"Actual projection",kind:"image"},openHref:"/wrong"};
 const host=await mount(React.createElement(BayAssetCard,{asset:catalogAsset,view,onOpen:(value)=>opened=value}));
 try{assert.equal(host.container.querySelector("[data-card]").dataset.card,"catalog:1");await click(host.container.querySelector("button"));assert.strictEqual(opened,catalogAsset);assert.equal(host.container.querySelector("a"),null);}finally{await host.close();}}
});
test("E11 resolves into the in-page picture/time/license and free Get becomes server-confirmed ownership",async()=>{
 const ref={kind:"platform",id:"e11"};let claims=0;let owned=false;
 const resolve=async()=>resolved(ref,owned?{owned:true,commerce:{priceFen:0,currency:"USD",free:true,purchaseState:"settled"},rights:{canView:true,canDownload:true,canDownloadSource:false,canEdit:false,canUseInTask:true,canAddToLibrary:false}}:{});
 const host=await mount(React.createElement(BayArtifactDeepLink,{target:ref,resolve,services:{claim:async()=>{claims++;owned=true;return ref;}}}));
 try{assert.equal(host.container.querySelector("img").src,asset.full_url);assert.match(host.container.textContent,/2026/);assert.match(host.container.textContent,/OceanLeo-Free-1.0/);assert.equal(host.container.querySelectorAll("[data-asset-detail]").length,1);assert.equal(host.container.querySelector('[role="dialog"]'),null);
 await click(host.container.querySelector('[data-asset-action="get"]'));assert.equal(claims,1);assert.equal(host.container.querySelector('[data-asset-action="get"]'),null);assert.ok(host.container.querySelector('[data-asset-action="download"]'));}finally{await host.close();}
});
test("paid listing opens existing checkout; refresh replaces both preview and settled rights",async()=>{
 const ref={kind:"listing",id:"paid"};let settled=false;const checkouts=[];
 const resolve=async()=>{const detail=resolved(ref,{owned:settled,commerce:{priceFen:1500,currency:"USD",free:false,purchaseState:settled?"settled":"none",listingId:"paid"},rights:{canView:true,canDownload:settled,canDownloadSource:false,canEdit:false,canUseInTask:settled,canAddToLibrary:false}});if(settled)detail.entry={...detail.entry,title:"Purchased preview"};return detail;};
 const host=await mount(React.createElement(BayArtifactDeepLink,{target:ref,resolve,services:{checkout:async(id)=>checkouts.push(id)}}));
 try{assert.match(host.container.textContent,/15\.00/);await click(host.container.querySelector('[data-asset-action="buy"]'));assert.deepEqual(checkouts,["paid"]);settled=true;await click(host.container.querySelector('[data-asset-action="refresh"]'));assert.match(host.container.textContent,/Purchased preview/);assert.ok(host.container.querySelector('[data-asset-action="download"]'));}finally{await host.close();}
});
test("owned website uses the same detail viewer and permitted host actions",async()=>{
 const ref={kind:"artifact",artifactId:"website",revisionId:"fixed"};let uses=0,edits=0;
 const detail=resolved(ref,{owned:true,commerce:undefined,rights:{canView:true,canDownload:false,canDownloadSource:false,canEdit:true,canUseInTask:true,canAddToLibrary:false}});
 detail.entry={id:"artifact:website:fixed",title:"Website",kind:"website",libraryItem:{kind:"website",previewUrl:"https://preview.oceanleo.app/site",meta:{}}};
 const host=await mount(React.createElement(BayArtifactDeepLink,{target:ref,resolve:async()=>detail,onUseInTask:()=>uses++,onEdit:()=>edits++}));
 try{assert.equal(host.container.querySelector('[data-website-preview]').dataset.websitePreview,"https://preview.oceanleo.app/site");await click(host.container.querySelector('[data-asset-action="use"]'));await click(host.container.querySelector('[data-asset-action="edit"]'));for(let attempt=0;attempt<40&&!edits;attempt++)await act(async()=>{await new Promise((done)=>setTimeout(done,2));});assert.equal(uses,1);assert.equal(edits,1);}finally{await host.close();}
});
test("unknown prices never become free, and failed resolution exposes retry plus back",async()=>{
 const ref={kind:"platform",id:"missing"};let tries=0,backs=0;
 const host=await mount(React.createElement(BayArtifactDeepLink,{target:ref,onBack:()=>backs++,resolve:async()=>{if(++tries===1)throw Error("secret_internal_receipt");return resolved(ref,{commerce:{priceFen:null,currency:"USD",free:false,purchaseState:"none"}});}}));
 try{assert.doesNotMatch(host.container.textContent,/secret_internal_receipt/);await click([...host.container.querySelectorAll("button")].find((node)=>node.textContent==="Retry"));assert.ok(host.container.querySelector('[data-asset-action="refresh"]'));assert.equal(host.container.querySelector('[data-asset-action="get"]'),null);await click(host.container.querySelector('button[aria-label="Back to list"]'));assert.equal(backs,1);}finally{await host.close();}
});
test("a stale resolver response cannot replace a newer selected identity",async()=>{
 let finish;const pending=new Promise((done)=>finish=done);const a={kind:"platform",id:"a"},b={kind:"platform",id:"b"};
 const resolve=(ref)=>ref.id==="a"?pending:Promise.resolve({...resolved(b),entry:{...resolved(b).entry,title:"Newest"}});
 const host=await mount(React.createElement(BayArtifactDeepLink,{target:a,resolve}));
 try{await act(async()=>host.root.render(React.createElement(BayArtifactDeepLink,{target:b,resolve})));await act(async()=>finish({...resolved(a),entry:{...resolved(a).entry,title:"Stale"}}));assert.match(host.container.textContent,/Newest/);assert.doesNotMatch(host.container.textContent,/Stale/);}finally{await host.close();}
});

function website(id,skin,tpl,cover=false){const entry={id,title:"Website",kind:"website",keywords:["industry:business","sub:law","shape:s3",`skin:${skin}`,"group:law-s3",`tpl:${tpl}`,...(cover?["groupcover:1"]:[])],libraryItem:{kind:"website",meta:{}}};return {...asset,id,type:"website",entry,catalogIdentities:[{artifactId:id,revisionId:`r-${id}`} ]};}
test("website facets group row versions without collapsing equal skins; selected version opens exact revision",async()=>{
 const assets=[website("a","paper","first",true),website("b","glass","second"),website("c","glass","third")];let selected=bayWebsiteSelection("?websiteIndustry=business&websiteSub=law&websiteSkin=glass");let opened;
 const shelf=bayWebsiteCatalog(assets,selected);assert.equal(shelf.items.length,1);assert.equal(shelf.items[0].chips.length,3);assert.equal(shelf.items[0].asset.id,"b");assert.equal(shelf.skins.find((option)=>option.value==="glass").count,1);
 function Host(){const [selection,set]=React.useState(selected);return React.createElement(BayWebsiteCatalog,{assets,selection,onChange:set,onOpen:(asset)=>opened=asset});}
 const host=await mount(React.createElement(Host));try{await click(host.container.querySelector('[aria-label="Version 3 of 3"]'));await click(host.container.querySelector('[data-card]'));assert.deepEqual(bayAssetRefForCard(opened),{kind:"artifact",artifactId:"c",revisionId:"r-c"});}finally{await host.close();}
 assert.equal(bayWebsiteCatalog(assets,{...selected,shape:"s5"}).items.length,0);
});
test("website filters and per-card versions can be restored from the URL",()=>{
 const selection=bayWebsiteSelection(`?websiteIndustry=business&websiteSub=law&websiteShape=s3&websiteSkin=glass&websiteVersions=${encodeURIComponent(JSON.stringify({"law-s3":"third"}))}`);
 assert.equal(selection.variants["law-s3"],"third");assert.equal(bayWebsiteCatalog([website("a","glass","first"),website("b","glass","third")],selection).items[0].asset.id,"b");assert.deepEqual(bayWebsiteSelection("?websiteVersions=bad").variants,{});
});
test("history open/back/forward preserves filters, selected identity and scroll in a nested page",async()=>{
 window.history.replaceState({},"","/bay?kind=asset&type=image&view=owned&cat=forest&q=trees#catalog");let route;
 function Host(){const ref=React.useRef(null);route=useBayAssetRoute(ref);return React.createElement("div",{ref,"data-route":route.target?.kind||"browse"});}
 const host=await mount(React.createElement(Host));
 const settleHistory=async(fn)=>{await act(async()=>{await new Promise((done)=>{window.addEventListener("popstate",done,{once:true});fn();});});};
 try{host.container.scrollTop=423;await act(async()=>route.open({kind:"platform",id:"e11"}));assert.equal(route.target.id,"e11");assert.equal(window.location.hash,"#catalog");assert.equal(host.container.scrollTop,0);await settleHistory(()=>route.close());assert.equal(route.target,null);assert.equal(new URLSearchParams(window.location.search).get("cat"),"forest");assert.equal(new URLSearchParams(window.location.search).get("q"),"trees");assert.equal(host.container.scrollTop,423);await settleHistory(()=>window.history.forward());assert.equal(route.target.id,"e11");await settleHistory(()=>window.history.back());}finally{await host.close();}
});
test("a refreshed direct detail link closes in place and retains browse filters",async()=>{
 window.history.replaceState({},"","/bay?kind=asset&type=website&asset=library:e11&websiteSkin=glass");let route;
 function Host(){route=useBayAssetRoute();return null;}const host=await mount(React.createElement(Host));
 try{assert.equal(route.target.id,"e11");await act(async()=>route.close());assert.equal(route.target,null);assert.equal(new URLSearchParams(window.location.search).get("websiteSkin"),"glass");}finally{await host.close();}
});
test("owned routes contain no modal/portal/body lock and no unsafe asset casts or navigation-away",()=>{
 const source=(name)=>readFileSync(new URL(`../src/shell/bay/asset/${name}.tsx`,import.meta.url),"utf8");
 for(const name of ["BayAssetLibrary","BayArtifactDeepLink","BayAssetCard"]){assert.doesNotMatch(source(name),/fixed inset|createPortal|document\.body\.style\.overflow|as never|as unknown as|window\.location\.assign/);}
 const library=source("BayAssetLibrary");assert.match(library,/siteKey,\s+context,\s+q: query/g);assert.match(library,/data-bay-asset-seller-item/);assert.match(library,/target=\{route\.target\}/);assert.match(library,/hidden=\{Boolean\(route\.target\)\}/);
});

// Exercise the actual catalog host as well as its detail component. Only data
// sources and unrelated shelf widgets are substituted; navigation/actions stay real.
globalThis.__w3CatalogCalls=[];
globalThis.__w3Official=[];
globalThis.__w3Mine=[];
globalThis.__w3LegacyOpens=0;
const originUrl = pathToFileURL(new URL("../src/shell/bay/asset/origin-index.ts",import.meta.url).pathname).href;
const { BayAssetLibrary } = await import(await compileModule("src/shell/bay/asset/BayAssetLibrary.tsx", {
 ...stubs,
 "./BayArtifactDeepLink": routeModule,
 "../shell/bay-state": dataModule('export function bayEnabledHere(){return true;} export function useBaySignedIn(){return true;}'),
 "../shell/BayMine": dataModule(`import {createElement as h} from ${JSON.stringify(reactUrl)};export function BaySignInPrompt({text}){return h("div",null,text);}`),
 "../shell/use-bay-data": dataModule('export function useBayFeed(){return {loaded:true,items:[]};}'),
 "../shell/BayFilterSelect": dataModule(`import {createElement as h} from ${JSON.stringify(reactUrl)};
 export function BayToolbarFilters({children}){return h("div",{"data-toolbar":true},children);}
 export function BayFilterSelect({name,value,options,onChange,allLabel,label}){return h("select",{"data-filter":name,"aria-label":label,value,onChange:(event)=>onChange(event.target.value)},h("option",{value:""},allLabel||"All"),...options.map((option)=>h("option",{key:option.value,value:option.value},option.label)));}`),
 "../../collection-chrome": dataModule(`import {createElement as h} from ${JSON.stringify(reactUrl)};export function CollectionCardGrid({children,...props}){return h("div",props,children);}`),
 "../../collection-items": dataModule(`import {createElement as h} from ${JSON.stringify(reactUrl)};export function CollectionItemList({children,...props}){return h("div",props,children);}`),
 "./BayAssetSellers": dataModule(`import {createElement as h} from ${JSON.stringify(reactUrl)};export function BayAssetSellerSite(){return null;}export function BayAssetSellers(){return h("div",{"data-bay-asset-seller-item":"seller-42"},h("button",{onClick:()=>globalThis.__w3LegacyOpens++},"Seller file"));}`),
 "./BayAssetLive": dataModule('export function BayAssetLive(){return null;}'),
 "./BayAssetSeries": dataModule('export function BayAssetSeries(){return null;}'),
 "./BayLicensesView": dataModule('export function BayLicensesView(){return null;}'),
 "./origin-index": dataModule(`export * from ${JSON.stringify(originUrl)};
 export async function loadTypeOriginIndex(type){return {type,categories:[],totalByOrigin:{"first-party":0,external:0},shelfTotal:0};}
 export async function searchAssetsInZone(){return {items:[],has_more:false};}export function resetOriginIndexCache(){}`),
 "./bay-template-shelf": dataModule(`export const BAY_OFFICIAL_PREVIEW_COUNT=4,BAY_TEMPLATE_PAGE_SIZE=30,OFFICIAL_TEMPLATE_CATEGORY="official-templates";
 export function templateArtifactTypeForBay(type){return type==="website"?"website":"single_file_image";}
 export function mergeOwnedAssets(a,b){return [...a,...b.filter((item)=>!a.some((other)=>other.id===item.id))];}
 export async function listBayOfficialTemplates(options){globalThis.__w3CatalogCalls.push(options);const items=globalThis.__w3Official.map((item)=>options.offset?{...item,id:item.id+"-page2",entry:item.entry?{...item.entry,id:item.entry.id+"-page2"}:undefined}:item);return {items,total:options.type==="website"?items.length:60,hasMore:options.type!=="website"&&!options.offset,unavailableSources:[]};}
 export async function listBayMineArtifacts(){return {items:globalThis.__w3Mine,total:globalThis.__w3Mine.length,hasMore:false,unauthenticated:false};}`),
}));
function resetCatalog(search){window.history.replaceState({},"",`/bay${search}`);globalThis.__w3CatalogCalls=[];globalThis.__w3Official=[];globalThis.__w3Mine=[];globalThis.__w3Resolve=async(ref)=>resolved(ref);}
async function historyClose(host){await act(async()=>{await new Promise((done)=>{window.addEventListener("popstate",done,{once:true});host.container.querySelector('button[aria-label="Back to list"]').click();});});}
test("catalog initial/load-more calls carry exact app/site context; official click and back keep page data",async()=>{
 resetCatalog("?kind=asset&type=image&view=owned&cat=official-templates&app=draw");
 globalThis.__w3Official=[{...asset,id:"template-material:cat",entry:{id:"template-material:cat",title:"Official card",kind:"image"},catalogIdentities:[{catalogId:"cat",artifactId:"official",revisionId:null}]}];
 const host=await mount(React.createElement(BayAssetLibrary,{siteKey:"image",filter:{q:"forest"}}));
 try{assert.equal(globalThis.__w3CatalogCalls.length,1);const initial=globalThis.__w3CatalogCalls[0];assert.deepEqual(initial.context,{contextId:"olctx:v1:image:app:draw",siteKey:"image",appId:"draw"});assert.equal(initial.siteKey,"image");assert.equal(initial.q,"forest");
 await click([...host.container.querySelectorAll("button")].find((node)=>node.textContent==="加载更多"));assert.equal(globalThis.__w3CatalogCalls.length,2);assert.deepEqual(globalThis.__w3CatalogCalls[1].context,initial.context);assert.equal(globalThis.__w3CatalogCalls[1].siteKey,"image");assert.equal(globalThis.__w3CatalogCalls[1].q,"forest");
 let selected;globalThis.__w3Resolve=async(ref)=>{selected=ref;return resolved(ref);};await click(host.container.querySelector('[data-bay-asset-card] button'));assert.deepEqual(selected,{kind:"template",id:"cat"});assert.equal(host.container.querySelector('[data-bay-asset-browse]').hidden,true);assert.equal(host.container.querySelector('[data-toolbar]').textContent,"");
 await historyClose(host);assert.equal(host.container.querySelector('[data-bay-asset-browse]').hidden,false);assert.equal(host.container.querySelector('[data-filter="cat"]').value,"official-templates");assert.equal(globalThis.__w3CatalogCalls.length,2);
 }finally{await host.close();}
});
test("Mine cards open their artifact in place; seller buttons are intercepted before legacy listing dispatch",async()=>{
 resetCatalog("?kind=asset&type=image&view=mine");globalThis.__w3Mine=[{...asset,id:"artifact:mine:r-fixed",openHref:"/wrong-workspace"}];let selected;
 globalThis.__w3Resolve=async(ref)=>{selected=ref;return resolved(ref);};let host=await mount(React.createElement(BayAssetLibrary,{siteKey:"image",filter:{}}));
 try{await click(host.container.querySelector('[data-bay-asset-card] button'));assert.deepEqual(selected,{kind:"artifact",artifactId:"mine",revisionId:"r-fixed"});assert.equal(window.location.pathname,"/bay");await historyClose(host);}finally{await host.close();}
 resetCatalog("?kind=asset&type=image&view=sellers");globalThis.__w3LegacyOpens=0;globalThis.__w3Resolve=async(ref)=>{selected=ref;return resolved(ref);};host=await mount(React.createElement(BayAssetLibrary,{siteKey:"image",filter:{}}));
 try{await click(host.container.querySelector('[data-bay-asset-seller-item] button'));assert.deepEqual(selected,{kind:"listing",id:"seller-42"});assert.equal(globalThis.__w3LegacyOpens,0);await historyClose(host);}finally{await host.close();}
});
test("website catalog requests the full scoped set and retains filters/version choice after detail back",async()=>{
 resetCatalog("?kind=asset&type=website&view=owned&websiteIndustry=business&websiteSub=law&websiteSkin=glass");globalThis.__w3Official=[website("a","glass","first",true),website("b","glass","second")];let selected;globalThis.__w3Resolve=async(ref)=>{selected=ref;return resolved(ref);};
 const host=await mount(React.createElement(BayAssetLibrary,{siteKey:"website",context:{contextId:"actual-context",siteKey:"website",appId:"law"},filter:{}}));
 try{assert.equal(globalThis.__w3CatalogCalls[0].limit,undefined);assert.equal(globalThis.__w3CatalogCalls[0].context.contextId,"actual-context");assert.ok(host.container.querySelector('[data-filter="website-skin"]'));
 await click(host.container.querySelector('[aria-label="Version 2 of 2"]'));assert.equal(JSON.parse(new URLSearchParams(window.location.search).get("websiteVersions"))["law-s3"],"second");await click(host.container.querySelector('[data-bay-asset-card] button'));assert.deepEqual(selected,{kind:"artifact",artifactId:"b",revisionId:"r-b"});await historyClose(host);assert.equal(host.container.querySelector('[aria-label="Version 2 of 2"]').getAttribute("aria-pressed"),"true");assert.equal(host.container.querySelector('[data-filter="website-skin"]').value,"glass");
 }finally{await host.close();}
});


test("all website facet/version/loading copy has Chinese, Traditional Chinese and non-Chinese fallbacks",()=>{
 const labels=[...Object.values(MATERIAL_INDUSTRY_SUB_LABELS),...Object.values(MATERIAL_SHAPE_LABELS),...Object.values(MATERIAL_SKIN_LABELS),"全部子类","全部行业","全部页数","全部外观","换一个版本","看第 {n} 个版本，共 {total} 个","正在打开这份素材…"];
 for(const [locale,dictionary] of Object.entries(W3_L5D_MESSAGES))for(const label of labels){assert.ok(dictionary[label],`${locale}: ${label}`);if(!locale.startsWith("zh"))assert.doesNotMatch(dictionary[label],/[\u3400-\u9fff]/);}
});
