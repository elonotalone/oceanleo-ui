import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import "./helpers/w1-jsdom-window.mjs";
import { normalizeArtifactProjectionResult } from "../src/shell/artifact-contract.ts";
import { artifactProjectionToLibraryItem } from "../src/shell/library-data.ts";
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.requestAnimationFrame=window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame=window.cancelAnimationFrame.bind(window);
globalThis.ResizeObserver=class {observe(){} unobserve(){} disconnect(){}};
const uiStubUrl=dataModule(`const tt=(value)=>value;export function useUI(){return tt;}`);
const splitUrl=await compileModule("src/shell/SplitWorkspace.tsx", {"../i18n/ui/useUI":uiStubUrl,"./EditBarDockHost":dataModule(`export function EditBarDockHost(){return null;}`)});
const {createRoot}=await import("react-dom/client");
async function mount(child){
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
 const render=async content=>act(async()=>root.render(React.createElement(SplitWorkspace,{left:React.createElement('div',null,'task chat'),right:content,library:{open:true},fillParent:true})));
 await render(child);return {container,render,async unmount(){await act(async()=>root.unmount());container.remove();}};
}
const raw = JSON.parse(readFileSync(new URL("./fixtures/oceanleo-artifact-library-pages.json", import.meta.url), "utf8"));
const item = artifactProjectionToLibraryItem(normalizeArtifactProjectionResult(raw.publicPage.items[0]).data);
globalThis.__renderLoopItem = item;
globalThis.__renderLoopFailList = false;
const api = dataModule(`
 export * from ${JSON.stringify(new URL("../src/shell/artifact-client.ts",import.meta.url).href)};
 export const ARTIFACT_LIBRARY_CHANGE_EVENT='oceanleo:artifact-library-change';
 export async function listMyArtifacts(){return globalThis.__renderLoopFailList ? {ok:false,status:0,error:'network unavailable'} : {ok:true,data:{items:[],ownerPrincipalId:'user-1',nextCursor:null,total:0,invalidItems:[]}};}
 export const listFavoriteArtifacts=listMyArtifacts;
 export async function getCurrentArtifactItem(){return {ok:true,data:globalThis.__renderLoopItem};}
 export async function ensureArtifact(){throw new Error('unexpected write');}
 export async function retireArtifact(){throw new Error('unexpected write');}
 export function artifactDownloadEvidence(){return {available:false};}
 export async function getArtifactDownload(){return {ok:false};}
 export async function prepareArtifactForAction(){return {ok:false};}
 export async function setArtifactFavorite(){throw new Error('unexpected write');}
`);
const noop = dataModule(`
 export function CloudBrowserPanel(){return null;}
 export function NavigatorGuide(){return null;}
 export function MaterialLibrary(){return null;}
 export function BayPanel(){return null;}
 export function LeoChatPanel(){return null;}
 export function MaterialStandaloneEditor(){return null;}
 export function useBayEnabled(){return false;}
 export function useFunctionGuide(){return null;}
 export function useWorkspaceRuntimeHydration(){return null;}
 export function useOptionalWorkspaceSession(){return null;}
 export async function preloadEditorFor(){return {};}
 export function LibraryItemViewer(){return null;}
 export function WorkspaceEntryCanvas(){return null;}
 export function AdvancedContentWorkbench(){return null;}
`);
const { ResultCanvas } = await import(await compileModule("src/shell/ResultCanvas.tsx", {
 "./SplitWorkspace": splitUrl,
 "../i18n/ui/useUI": uiStubUrl,
 "./artifact-client": api,
 "../lib/auth/client": dataModule(`export * from ${JSON.stringify(new URL("../src/lib/auth/client.ts",import.meta.url).href)};export const AUTH_STATE_EVENT='oceanleo:auth-state';export async function accessToken(){return 'test';}export async function getUserIdSnapshot(){return {available:true,userId:'user-1'};} export async function getUserId(){return 'user-1';}`),
 "./CloudBrowserPanel": noop, "./NavigatorGuide": noop, "./MaterialLibrary": noop,
 "./bay/panel": noop, "./leochat/LeoChatPanel": noop, "./bay/shell/bay-state": noop,
 "./guide-context": noop, "./workspace-runtime-hydration": noop,
 "./workspace-session-context": noop, "./material-library-standalone": noop,
 "./editor-preload": noop, "./library-viewers": noop,
 "./WorkspaceEntryCanvas": noop, "./AdvancedContentWorkbench": noop,
 "next/navigation": dataModule(`export function usePathname(){return globalThis.window.location.pathname;} export function useRouter(){return {push(){},replace(){}};}`),
 "./workbench-material-provider": dataModule(`const actions=[];export function useWorkbenchMaterialActions(){return {actions,perform(){},canPerform(){return false;},availability:{},beginMaterialDrag(){},endMaterialDrag(){}};}`),
}));
const { SplitWorkspace } = await import(splitUrl);

for (const pathname of ["/tasks/eaf3b3ab-b1e2-44f2-a8c5-33e436b90135", "/history"]) {
 for (const failList of [false, true]) {
  test(`real ResultCanvas/MyLibrary/WorkspaceLibrary stays renderable at ${pathname} with deep item and list failure=${failList}`, async () => {
   window.history.replaceState(null,"",`${pathname}?item=${item.artifactId}`);
   globalThis.__renderLoopFailList=failList;
   const props={tabs:[],active:"mine",showTemplate:false,siteId:"oceanleo",taskId:"eaf3b3ab-b1e2-44f2-a8c5-33e436b90135"};
   const m=await mount(React.createElement(ResultCanvas,props));
   try {
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,30));});
    assert.ok(m.container.querySelector('[data-workspace-split]'));
    assert.match(m.container.textContent,new RegExp(item.title));
    assert.doesNotMatch(m.container.textContent,/Too many re-renders/);
    await m.render(React.createElement(ResultCanvas,{...props,focusNonce:2}));
    assert.ok(m.container.querySelector('[data-workspace-split]'));
   } finally {await m.unmount();}
  });
 }
}
