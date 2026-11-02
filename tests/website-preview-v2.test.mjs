import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import "./helpers/w1-jsdom-window.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { RUNTIME_STATES, appendRuntimeLogs, previewPathUrl } from "../src/shell/website-platform/website-preview-model.ts";
import { insertPreviewReference } from "../src/shell/website-platform/website-preview-reference.ts";
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const i18n = dataModule('const tt=(s,v)=>v?s.replace(/\\{(\\w+)\\}/g,(_,k)=>v[k]):s; export function useWebsiteUI(){return tt;}');
const panelModule = await compileModule("src/shell/website-platform/WebsitePanelView.tsx", {"./website-preview-i18n":i18n});
const { WebsitePanelView, WebsitePanelDataView } = await import(panelModule);
const { WebsitePreviewWorkbench } = await import(await compileModule("src/shell/website-platform/WebsitePreviewWorkbench.tsx", {
  "./website-preview-i18n":i18n, "./WebsitePanelView":panelModule,
  "../../api/website-runtime":dataModule("export const websiteRuntimeApi={};"),
  "../../api/website-panels":dataModule("export const websitePanelsApi={};"),
  "./WebsitePreviewPicker":dataModule("export function WebsitePreviewPicker(){return null;}"),
  "../../lib/history-events":dataModule("export function notifyHistoryChanged(){}"),
}));
const { createRoot } = await import("react-dom/client");
const states = ["stopped", "installing", "starting", "running", "crashed", "sleeping"];
test("C3 mapping contains every runtime state and distinct readable labels", () => {
  assert.deepEqual(Object.keys(RUNTIME_STATES).sort(), states.toSorted());
  assert.equal(new Set(Object.values(RUNTIME_STATES).map(s=>s.label)).size, 6);
  for (const state of states) { assert.match(RUNTIME_STATES[state].color,/^#[a-f0-9]{6}$/); assert.ok(RUNTIME_STATES[state].description); }
});
for (const state of states) test("toolbar and preview display honest runtime state: "+state, async () => {
  const host=document.createElement("div"); document.body.append(host); const root=createRoot(host);
  const runtimeApi={get:async()=>({state,preview_url:"https://p-test.ws.oceanleo.app/",last_error:state==="crashed"?"build failed":null}),logs:async()=>({lines:[],cursor:null})};
  await act(async()=>root.render(React.createElement(WebsitePreviewWorkbench,{projectId:"p",runtimeApi,panelsApi:{list:async()=>[]}})));
  assert.ok(host.querySelector('[role="toolbar"]').textContent.includes(RUNTIME_STATES[state].label));
  assert.equal(!!host.querySelector("iframe"),state==="running");
  if(state==="crashed") assert.match(host.textContent,/build failed/);
  if(["installing","starting","sleeping"].includes(state)) assert.ok(host.querySelector("progress"));
  await act(async()=>root.unmount()); host.remove();
});
test("cursor log append keeps genuine repeated lines but drops repeated pages and bounds memory",()=>{
  const line={ts:"1",stream:"install",text:"same output"};
  const first=appendRuntimeLogs({lines:[],cursor:null},{lines:[line],cursor:"a"});
  assert.equal(appendRuntimeLogs(first,{lines:[line],cursor:"a"}),first);
  const second=appendRuntimeLogs(first,{lines:[line],cursor:"b"});
  assert.equal(second.lines.length,2);
  assert.equal(appendRuntimeLogs(second,{lines:Array(2100).fill(line),cursor:"c"}).lines.length,2000);
});
test("UC-1 preview URL accepts isolated HTTPS content and same-site paths only",()=>{
  // docs/architecture/oceanleo-untrusted-content-isolation.md UC-1
  const base="https://p-test.ws.oceanleo.app/";
  assert.equal(previewPathUrl(base,"/admin?tab=users#x"),base+"admin?tab=users#x");
  for(const path of ["//evil.test","https://evil.test","/\\evil.test","javascript:alert(1)"]) assert.equal(previewPathUrl(base,path),"");
  for(const base of ["http://a.oceanleo.app","https://oceanleo.app","https://a.oceanleo.com","https://evil-oceanleo.app","https://user:pass@a.oceanleo.app","https://a.oceanleo.app:444"]) assert.equal(previewPathUrl(base,"/"),"");
});
test("C7 table and metrics render escaped values and totals",()=>{
  const table=renderToStaticMarkup(React.createElement(WebsitePanelDataView,{data:{kind:"table",columns:[{key:"name",label:"Name",type:"text"}],rows:[{name:"<script>bad</script>"}],total:1}}));
  assert.match(table,/<table/); assert.match(table,/&lt;script&gt;/); assert.match(table,/共 1 条/);
  const metric=renderToStaticMarkup(React.createElement(WebsitePanelDataView,{data:{kind:"metric",items:[{label:"Memory",value:1536,unit:"MiB",hint:"reserved"}]}}));
  assert.match(metric,/1536/); assert.match(metric,/MiB/); assert.match(metric,/reserved/);
});
for(const chart of ["line","bar","pie"]) test("C7 "+chart+" chart renders SVG and accessible values",()=>{
  const html=renderToStaticMarkup(React.createElement(WebsitePanelDataView,{data:{kind:"chart",chart,series:[{name:"Visits",points:[{x:"Mon",y:2},{x:"Tue",y:4}]}]}}));
  assert.match(html,/<svg/); assert.match(html,/Visits/); assert.match(html,/Mon: 2/); assert.doesNotMatch(html,/NaN|Infinity/);
});
test("not_wired app panel offers wiring, error panel displays reason and never displays data",()=>{
  const panel={id:"users",title:"Users",kind:"table",source:"app",state:"not_wired"};
  const html=renderToStaticMarkup(React.createElement(WebsitePanelView,{panel,onWire(){}}));
  assert.match(html,/让 agent 配置此看板/);
  const error=renderToStaticMarkup(React.createElement(WebsitePanelView,{panel:{...panel,state:"error",error:"upstream timeout"},onWire(){}}));
  assert.match(error,/upstream timeout/); assert.doesNotMatch(error,/<table/);
});
test("UC-3 preview keeps scripts without same-origin, no frame messaging or inline editing",()=>{
  // docs/architecture/oceanleo-untrusted-content-isolation.md UC-3 / UC-6
  const source=readFileSync("src/shell/website-platform/WebsitePreviewWorkbench.tsx","utf8");
  assert.match(source,/sandbox="allow-forms allow-modals allow-popups allow-presentation allow-scripts"/);
  assert.doesNotMatch(source,/allow-same-origin|postMessage|contentEditable|dangerouslySetInnerHTML/);
  const shell=readFileSync("src/shell/InlineAdvancedWorkbenchShell.tsx","utf8");
  assert.match(shell,/editBarSuppressed = websitePreviewOnly \|\|/);
});
test("picker inserts a coordinate reference through the existing composer transaction bridge and preserves draft",()=>{
  const host=document.createElement("div");
  host.setAttribute("data-oceanleo-leo-entry-root","");
  const input=document.createElement("div"); input.setAttribute("data-oc-slot-editor","");
  host.append(input); document.body.append(host);
  host.getClientRects=()=>[{}];
  let draft="Please adjust";
  input.__ocGetText=()=>draft; input.__ocSetText=text=>{draft=text;};
  const ok=insertPreviewReference({projectId:"p",url:"https://p.ws.oceanleo.app/admin",x:20.3,y:40,width:390,height:700});
  assert.equal(ok,true); assert.match(draft,/Please adjust/); assert.match(draft,/"x": 20/);
  assert.match(draft,/unavailable_cross_origin/); assert.match(draft,/\/admin/); host.remove();
});
test("runtime logs use cursor and fix shows returned task next to the composer",async()=>{
  const host=document.createElement("div"); document.body.append(host);
  const composer=document.createElement("div"); composer.setAttribute("data-oceanleo-leo-entry-root",""); composer.getClientRects=()=>[{}]; document.body.append(composer);
  const root=createRoot(host); const cursors=[];
  const runtimeApi={get:async()=>({state:"crashed",preview_url:null,last_error:"bad command"}),logs:async(_id,cursor)=>{cursors.push(cursor);return {lines:[{ts:"now",stream:"stderr",text:"failure details"}],cursor:"cursor-1"};},fix:async()=>({task_id:"task-fixed"})};
  await act(async()=>root.render(React.createElement(WebsitePreviewWorkbench,{projectId:"p",runtimeApi,panelsApi:{list:async()=>[]}})));
  await act(async()=>host.querySelector('button[title="查看运行日志"]').click());
  assert.deepEqual(cursors,[null]); assert.match(host.querySelector('[role="log"]').textContent,/failure details/);
  await act(async()=>Array.from(host.querySelectorAll("button")).find(b=>b.textContent==="让 agent 修复").click());
  assert.equal(composer.querySelector("a").getAttribute("href"),"/tasks/task-fixed");
  await act(async()=>root.unmount()); host.remove(); composer.remove();
});
test("C3 and C7 clients encode ids and log cursors, use gateway auth and preserve task ids",async()=>{
  const calls=[];
  const original=globalThis.fetch;
  globalThis.fetch=async(url,init)=>{calls.push({url,init});return {ok:true,json:async()=>({task_id:"new-task"})};};
  try {
    const auth=dataModule('export async function accessToken(){return "test-only";}');
    const config=dataModule('export const GATEWAY_BASE="https://gateway.invalid";');
    const runtimeModule=await compileModule("src/api/website-runtime.ts",{"../lib/auth/client":auth,"../lib/auth/config":config});
    const {websiteRuntimeApi}=await import(runtimeModule);
    const {websitePanelsApi}=await import(await compileModule("src/api/website-panels.ts",{"./website-runtime":runtimeModule}));
    await websiteRuntimeApi.get("id/one");
    await websiteRuntimeApi.logs("id/one","cursor&two");
    await websiteRuntimeApi.action("id/one","restart");
    assert.deepEqual(await websiteRuntimeApi.fix("id/one","Write run manifest"),{task_id:"new-task"});
    await websitePanelsApi.list("id/one"); await websitePanelsApi.data("id/one","users/all"); await websitePanelsApi.wire("id/one","users/all");
    assert.equal(calls[0].url,"https://gateway.invalid/v1/website-projects/id%2Fone/runtime");
    assert.equal(new URL(calls[1].url).searchParams.get("since"),"cursor&two");
    assert.equal(new URL(calls[1].url).searchParams.get("limit"),"200");
    assert.equal(calls[2].init.method,"POST");
    assert.equal(JSON.parse(calls[3].init.body).prompt,"Write run manifest");
    assert.match(calls[5].url,/\/panels\/users%2Fall\/data$/);
    assert.match(calls[6].url,/\/panels\/users%2Fall\/wire$/);
    for(const call of calls) {assert.equal(call.init.headers.Authorization,"Bearer test-only");assert.equal(call.init.cache,"no-store");}
  } finally {globalThis.fetch=original;}
});
test("English preview vocabulary covers every runtime state, panel state and interpolated total",async()=>{
  const {WEBSITE_PREVIEW_EN}=await import(await compileModule("src/shell/website-platform/website-preview-i18n.ts",{
    "next-intl":dataModule('export function useLocale(){return "en";}'),
    "../../i18n/ui/useUI":dataModule("export function useUI(){return s=>s;}"),
  }));
  for(const meta of Object.values(RUNTIME_STATES)) {assert.ok(WEBSITE_PREVIEW_EN[meta.label]);assert.ok(WEBSITE_PREVIEW_EN[meta.description]);}
  for(const label of ["未接线","已接线","错误","共 {total} 条"]) assert.ok(WEBSITE_PREVIEW_EN[label]);
});
test("C7 not_wired dropdown invokes wire and exposes the returned task",async()=>{
  const host=document.createElement("div"); document.body.append(host);
  const root=createRoot(host); const wired=[];
  const panelsApi={
    list:async()=>[{id:"users",title:"Users",kind:"table",state:"not_wired",source:"app"}],
    wire:async(id,panel)=>{wired.push([id,panel]);return {task_id:"wire-task"};}
  };
  await act(async()=>root.render(React.createElement(WebsitePreviewWorkbench,{projectId:"p",runtimeApi:{get:async()=>({state:"running",preview_url:"https://p.ws.oceanleo.app/"})},panelsApi})));
  await act(async()=>{const select=host.querySelector("select");select.value="users";select.dispatchEvent(new window.Event("change",{bubbles:true}));});
  assert.match(host.textContent,/未接线/);
  await act(async()=>Array.from(host.querySelectorAll("button")).find(b=>b.textContent==="让 agent 配置此看板").click());
  assert.deepEqual(wired,[["p","users"]]); assert.equal(host.querySelector('[data-testid="website-agent-task"] a').getAttribute("href"),"/tasks/wire-task");
  await act(async()=>root.unmount()); host.remove();
});
test("screenshot file uses the existing composer paste intake alongside the reference",()=>{
  const oldTransfer=globalThis.DataTransfer, oldClipboard=globalThis.ClipboardEvent;
  class Transfer {items={add:file=>{this.file=file;}}}
  class Paste extends window.Event {constructor(type,init){super(type,init);this.clipboardData=init.clipboardData;}}
  globalThis.DataTransfer=Transfer; globalThis.ClipboardEvent=Paste;
  const host=document.createElement("div");host.setAttribute("data-oceanleo-leo-entry-root","");host.getClientRects=()=>[{}];
  const input=document.createElement("div");input.setAttribute("data-oc-slot-editor","");input.__ocGetText=()=>"";input.__ocSetText=()=>{};
  host.append(input);document.body.append(host);
  const file=new File(["png"],"website-preview.png",{type:"image/png"});let pasted;
  host.addEventListener("paste",event=>{pasted=event.clipboardData.file;});
  try {assert.equal(insertPreviewReference({projectId:"p",url:"https://p.ws.oceanleo.app/",x:1,y:2,width:3,height:4,screenshot:file}),true);assert.equal(pasted,file);}
  finally {host.remove();globalThis.DataTransfer=oldTransfer;globalThis.ClipboardEvent=oldClipboard;}
});
