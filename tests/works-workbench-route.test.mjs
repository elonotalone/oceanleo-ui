// UC-NONE: Library access/copy flow with controlled API results; no live artifacts or device sessions.
import assert from "node:assert/strict";
import test from "node:test";
import React,{act} from "react";
import "./helpers/w1-jsdom-window.mjs";
import {compileModule,dataModule} from "./helpers/module-bench.mjs";
const {createRoot}=await import("react-dom/client");
globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.__uwRouteReact=React;
const tierPicker=await compileModule("src/shell/website-platform/HostingTierChoice.tsx",{
  "./website-preview-i18n":dataModule('export const useWebsiteUI=()=>s=>s; export const useWebsiteLanguage=()=>"zh";'),
  "../../api/website-connectors":dataModule('export const websiteConnectorsApi={tiers:async()=>["static","request_billed","server","heavy","own_accounts"].map(id=>({id,label:id,available:true}))};'),
});
const {WorkWorkbenchRoute}=await import(await compileModule("src/shell/works-workbench/WorkWorkbenchRoute.tsx",{
  "../website-platform/HostingTierChoice":tierPicker,
  "../AdvancedWorkbenchShell":dataModule('export function AdvancedWorkbenchShell(props){globalThis.__uwShell=props;return props.adapter.stage;}'),
  "../artifact-client":dataModule('export async function getArtifactWebsitePreview(item){globalThis.__uwRoutePreviewCalls.push(item.artifactId);return {ok:true,data:{status:"ready",url:"https://public.ws.oceanleo.app/page/",expiresAt:new Date(Date.now()+600000).toISOString()}};} export async function forkArtifact(item){globalThis.__uwRouteCalls.push(["fork",item.artifactId]);return {ok:true,data:globalThis.__uwCopiedItem};}'),
  "../library-data":dataModule('export function isDurableLibraryItem(item){return !!item.artifact;}'),
  "../../lib/works-api":dataModule('export const worksApi={async open(id,revision,signal,tier){globalThis.__uwRouteCalls.push(["open",id,revision]);if(globalThis.__uwNeedsTier&&!tier)throw {code:"tier_required"};if(tier)globalThis.__uwChosenTier=tier;return globalThis.__uwRouteWorks[id];}};'),
  "./WorkWorkbench":dataModule('export function WorkWorkbench(props){globalThis.__uwMountedWork=props;return globalThis.__uwRouteReact.createElement("div",{"data-work-stage":props.workId});}'),
  "../website-platform/website-preview-i18n":dataModule('export function useWebsiteUI(){return s=>s;}'),
}));
function item(id,canFork){return {artifactId:id,revisionId:"r1",key:id,title:"Work",kind:"game",artifact:{artifactId:id,revisionId:"r1",access:{canEdit:false,canFork}}};}
async function mount(value){const host=document.createElement("div");document.body.append(host);const root=createRoot(host);const saved=[];await act(async()=>root.render(React.createElement(WorkWorkbenchRoute,{item:value,taskId:"agent-1",onClose(){},onSavedItem:item=>saved.push(item)})));return {host,saved,async close(){await act(async()=>root.unmount());host.remove();}};}
for(const access of ["owner","fork","view-only"])test(`Library ${access} opens through C7 in existing shell`,async()=>{
 globalThis.__uwRouteCalls=[];globalThis.__uwRoutePreviewCalls=[];globalThis.__uwRouteWorks={a:{id:"cloud:a",kind:"game",access:access==="owner"?"owner":"view"},copy:{id:"cloud:copy",kind:"game",access:"owner"}};globalThis.__uwCopiedItem=item("copy",false);
 const m=await mount(item("a",access==="fork"));try{
  assert.deepEqual(globalThis.__uwRouteCalls,[["open","a","r1"]]);assert.equal(globalThis.__uwShell.taskId,"agent-1");assert.equal(globalThis.__uwShell.adapter.id,"none");assert.equal(globalThis.__uwShell.adapter.persistence,undefined);assert.deepEqual(globalThis.__uwShell.adapter.pages,{activePageId:"artifact",aux:[]});
  assert.equal(globalThis.__uwMountedWork.readOnly,access!=="owner");assert.deepEqual(globalThis.__uwRoutePreviewCalls,access==="owner"?[]:["a"]);const copy=[...m.host.querySelectorAll("button")].find(b=>b.textContent==="创建副本");assert.equal(!!copy,access==="fork");
  if(copy){await act(async()=>copy.click());assert.deepEqual(globalThis.__uwRouteCalls,[["open","a","r1"],["fork","a"],["open","copy","r1"]]);assert.equal(globalThis.__uwMountedWork.readOnly,false);assert.equal(m.saved[0].artifactId,"copy");}
  if(access==="view-only")assert.match(m.host.textContent,/不能修改或创建副本/);
 }finally{await m.close();}
});


test("first Library open asks for tier and creates only after form submission",async()=>{
 globalThis.__uwRouteCalls=[];globalThis.__uwNeedsTier=true;globalThis.__uwChosenTier="";
 globalThis.__uwRouteWorks={a:{id:"cloud:a",kind:"website",access:"owner"}};
 const m=await mount(item("a",false));try{
  assert.equal(m.host.querySelectorAll('input:checked').length,0);
  assert.equal(m.host.querySelector('[type=submit]').disabled,true);
  await act(async()=>m.host.querySelector('input[value=heavy]').click());
  assert.equal(globalThis.__uwRouteCalls.length,1);
  await act(async()=>m.host.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(globalThis.__uwChosenTier,"heavy");assert.ok(m.host.querySelector('[data-work-stage]'));
 }finally{delete globalThis.__uwNeedsTier;await m.close();}
});
