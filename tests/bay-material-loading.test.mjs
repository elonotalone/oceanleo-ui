import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import "./helpers/w1-jsdom-window.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
const { createRoot } = await import("react-dom/client");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__loadingReact = React;
const ui = dataModule('export function useUI(){return key=>key;}');
const taxonomy = { version:1, shelves:[{id:"deck",labels:{zh:"演示",en:"Presentations"},artifactTypes:["deck"],categories:[{id:"deck-reports",labels:{zh:"报告",en:"Reports"},contentTypes:[{id:"deck-reports-duty",labels:{zh:"述职",en:"Duty report"}}]}]}],tagVocabularies:{} };
const asset = { id:"library:deck", templateId:null, assetRef:{kind:"platform",id:"deck"}, artifactType:"deck",title:"Official report", previewMediaUrl:"https://example.test/deck.png" };
const official = {items:[asset],categoryCounts:{"deck-reports":1},categoryCovers:{"deck-reports":asset},categoryFacets:{},contentTypePreviews:{"deck-reports-duty":[asset]}};
let mode;
globalThis.__loadingAuthed = async (path,init) => {
 if(mode==="auth-hung" || (mode==="taxonomy-hung" && path.endsWith("taxonomy")) || (mode==="official-hung" && path.startsWith("/v1/materials?")) || (mode==="seller-hung" && path.startsWith("/v1/talent"))) return new Promise(()=>{});
 if(mode==="fallback") return {ok:false,status:401};
 return {ok:true,data:path.endsWith("taxonomy")?taxonomy:path.startsWith("/v1/materials?")?official:{items:[],categoryCounts:{}}};
};
const httpUrl = await compileModule("src/lib/bay/http.ts", {
 "../agent":dataModule('export function authed(path,init){return globalThis.__loadingAuthed(path,init);}'),
 "../auth/config":dataModule('export const GATEWAY_BASE="https://api.example.test";'),
});
const http = await import(httpUrl);
const clientUrl = await compileModule("src/shell/bay/shell/material-shelf-client.ts", {
 "../../../lib/bay/http":httpUrl,
 "../../material-library-template-source":dataModule('export function normalizeTemplateMaterial(){throw new Error("not a template fixture");}'),
 "../asset/bay-template-shelf":dataModule('export function templateMaterialToBayAsset(){throw new Error("not a template fixture");}'),
});
const { ReadyMaterialCatalog } = await import(await compileModule("src/shell/bay/shell/ReadyMaterialCatalog.tsx", {
 "../../../i18n/ui/useUI":ui,"./material-shelf-client":clientUrl,
 "next-intl":dataModule('export function useLocale(){return "en";}'),
 "../asset/BayAssetCard":dataModule('export function BayAssetCard({asset}){return globalThis.__loadingReact.createElement("div",{"data-bay-asset-card":asset.id},asset.title);}'),
}));
async function mount(t, nextMode){
 mode=nextMode;t.mock.timers.enable({apis:["setTimeout"]});
 window.history.replaceState({},"","/bay?type=deck&cat=deck-reports&contentType=deck-reports-duty");
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 await act(async()=>root.render(React.createElement(ReadyMaterialCatalog,{siteKey:"oceanleo",query:"",view:"grid",sellers:true,online:false,onOnlineChange(){},onOpen(){}})));
 return {host,async close(){await act(async()=>root.unmount());host.remove();t.mock.timers.reset();}};
}
async function timeout(t){await act(async()=>{t.mock.timers.tick(http.BAY_GET_TIMEOUT_MS+1);});}

test("hung seller feed reaches its deadline, preserves official material and recovers automatically",async t=>{
 const v=await mount(t,"seller-hung");try{
  assert.ok(v.host.querySelector("[data-bay-ready-loading]"));
  await timeout(t);
  assert.equal(v.host.querySelector("[data-bay-ready-loading]"),null);
  assert.ok(v.host.querySelector('[data-bay-asset-card="library:deck"]'));
  assert.ok(v.host.querySelector('[data-bay-recovery="temporary"][aria-busy="true"]'));
  assert.equal(v.host.querySelector('[data-bay-recovery] button'),null);
  mode="ok";await act(async()=>window.dispatchEvent(new window.Event("online")));
  assert.equal(v.host.querySelector("[data-bay-recovery]"),null);
  assert.ok(v.host.querySelector("[data-bay-asset-card]"));
 }finally{await v.close();}
});
for (const nextMode of ["official-hung", "taxonomy-hung"]) test(`${nextMode} stays loading and recovers automatically after the deadline`,async t=>{
 const v=await mount(t,nextMode);try{
  await timeout(t);
  assert.ok(v.host.querySelector('[data-bay-recovery="temporary"][aria-busy="true"]'));
  assert.equal(v.host.querySelector('[data-bay-recovery] button'),null);
  assert.equal(v.host.querySelector("[data-bay-asset-card]"),null);
  mode="ok";await act(async()=>window.dispatchEvent(new window.Event("online")));
  assert.equal(v.host.querySelector("[data-bay-recovery]"),null);
  assert.ok(v.host.querySelector('[data-bay-asset-card="library:deck"]'));
 }finally{await v.close();}
});
test("GET deadline also bounds authenticated calls and anonymous response decoding",async t=>{
 t.mock.timers.enable({apis:["setTimeout"]});const originalFetch=globalThis.fetch;
 try{
  mode="auth-hung";
  const pending=http.bayGet("/private");const check=assert.rejects(pending,{code:"timeout"});
  t.mock.timers.tick(http.BAY_GET_TIMEOUT_MS);await check;
  mode="fallback";let transportSignal;
  globalThis.fetch=async(_,init)=>{transportSignal=init.signal;return {ok:true,json:()=>new Promise(()=>{})};};
  const decoding=http.bayGet("/public",{anonymous:true});
  const decoded=assert.rejects(decoding,{code:"timeout"});
  await Promise.resolve();await Promise.resolve();
  t.mock.timers.tick(http.BAY_GET_TIMEOUT_MS);await decoded;
  assert.equal(transportSignal.aborted,true);
 }finally{globalThis.fetch=originalFetch;t.mock.timers.reset();}
});
test("caller cancellation rejects a transport that ignores abort",async()=>{
 mode="auth-hung";const controller=new AbortController();
 const pending=http.bayGet("/private",{signal:controller.signal});controller.abort();
 await assert.rejects(pending,{name:"AbortError"});
});
