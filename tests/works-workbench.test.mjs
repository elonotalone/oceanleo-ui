// UC-1/UC-3/UC-6: oceandino/docs/architecture/oceanleo-untrusted-content-isolation.md.
// Render and source assertions keep all untrusted frames isolated; no browser or device is opened.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import React, { act } from "react";
import "./helpers/w1-jsdom-window.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { previewReferenceText } from "../src/shell/website-platform/website-preview-reference.ts";
import { DEFAULT_KIND_DEFINITION } from "../src/shell/works/kinds.ts";
import { normalizeWork } from "../src/shell/works/model.ts";
const { createRoot } = await import("react-dom/client");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const h = React.createElement;
globalThis.__uwReact = React;
const i18n = dataModule('const tt=(s,v)=>v?s.replace(/\\{(\\w+)\\}/g,(_,k)=>v[k]):s; export function useWebsiteUI(){return tt;} export function useWebsiteLanguage(){return "zh";}');
const apiModule = dataModule('export const worksApi={get:(...a)=>globalThis.__uwApi.get(...a),kinds:(...a)=>globalThis.__uwApi.kinds(...a),open:(...a)=>globalThis.__uwApi.open(...a)};');
const screenStub = dataModule('const React=globalThis.__uwReact; export function WorkScreenPreview(props){globalThis.__uwScreen=props;return React.createElement("div",{"data-screen-source":props.deviceId});}');
const module = await compileModule("src/shell/works-workbench/WorkWorkbench.tsx", {
  "../website-platform/website-preview-i18n": i18n,
  "../../lib/works-api": apiModule,
  "../works-workbench/WorkScreenPreview": screenStub,
  "../../api/devices": dataModule('export async function listDevices(){return {ok:true,data:[{device_id:"server-1",device_name:"My server",platform:"linux",online:true}]};}'),
  "../../api/website-runtime": dataModule('export const websiteRuntimeApi={get:async()=>({state:"running",preview_url:"https://uw.ws.oceanleo.app/"}),checkpoint:async()=>{},logs:async()=>({lines:[],cursor:null}),fix:async()=>({task_id:"fix"})}; export async function websiteRequest(){throw Object.assign(new Error("missing"),{status:404});} export class WebsiteRequestError extends Error{}'),
  "../website-platform/WebsiteConfiguration": dataModule('const React=globalThis.__uwReact; export function WebsiteConfiguration(props){globalThis.__uwConfiguration=props;return React.createElement("div",{"data-configuration":props.projectId});}'),
  "../website-platform/WebsiteDashboard": dataModule('const React=globalThis.__uwReact; export function WebsiteDashboard(props){globalThis.__uwDashboard=props;return React.createElement("div",{"data-dashboard":props.projectId});}'),
});
const { WorkWorkbench } = await import(module);
function work(overrides = {}) { return { id:"cloud:project-1",title:"My work",kind:"website",access:"owner",home:{type:"cloud",project_id:"project-1"},preview:{available:true,url:"https://uw.ws.oceanleo.app/"},status:"running",links:[],updated_at:"now",...overrides }; }
function source(type = "url", state = "ready") { return {preview_source: type === "url" ? {type,path:"/"} : type === "screen" ? {type,device_id:"server-1",display_id:null} : {type},resolved:{type,state,url:"https://uw.ws.oceanleo.app/",device_name:"My server",detail:""}}; }
function apiFor(item, config = DEFAULT_KIND_DEFINITION, initial = source()) {
  const calls=[]; let current=initial;
  return { calls, get:async id=>{calls.push(["get",id]);return item;}, kinds:async()=>[config],
    previewSource:async id=>{calls.push(["source",id]);return current;},
    setPreviewSource:async(id,next)=>{calls.push(["put",id,next]);current=source(next.type,next.type === "none" ? "not_wired" : "ready");return current;},
    preview:async id=>{calls.push(["start",id]);return {status:"ready",url:"https://server.ws.oceanleo.app/"};},stop:async id=>{calls.push(["stop",id]);current=source("url","not_wired");return {ok:true};},
  };
}
async function mount(api, extra={}) {
  const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
  await act(async()=>root.render(h(WorkWorkbench,{workId:extra.initialWork?.id || "cloud:project-1",api,...extra})));
  return {host,root,async close(){await act(async()=>root.unmount());host.remove();}};
}
function button(host,text){return [...host.querySelectorAll("button")].find(node=>node.textContent===text);}
for(const [type,state] of [["url","ready"],["screen","ready"],["none","not_wired"],["url","not_wired"]]) test(`preview source ${type}/${state} renders honestly`,async()=>{
  const api=apiFor(work(),undefined,source(type,state));const m=await mount(api);
  try {
    assert.equal(m.host.querySelectorAll('[role="tab"]').length,3);
    if(type === "url" && state === "ready") {
      assert.match(m.host.querySelector("iframe").src,/^https:\/\/uw\.ws\.oceanleo\.app\//);
      assert.equal(m.host.querySelector("iframe").getAttribute("sandbox"),"allow-forms allow-modals allow-popups allow-presentation allow-scripts");
      assert.equal(m.host.querySelector("iframe").style.pointerEvents,"auto");
    } else if(type === "screen") {assert.equal(m.host.querySelector("[data-screen-source]").dataset.screenSource,"server-1");assert.equal(m.host.querySelector("iframe"),null);}
    else {assert.match(m.host.querySelector('[data-testid="work-preview-not-wired"]').textContent,/未接入.*agent/s);assert.equal(m.host.querySelector('[role="alert"]'),null);}
  } finally {await m.close();}
});
const cases=[
  ["website","browser","any",1440,900], ["game","game","landscape",1280,720],
  ["app","phone","portrait",390,844],["miniprogram","phone","portrait",390,844],["other","browser","any",1440,900],
];
test("work kind preview defaults cover all five kinds", () => {
  assert.equal(cases.length, 5);
  assert.deepEqual(cases.map(([kind]) => kind), ["website", "game", "app", "miniprogram", "other"]);
});
for(const [id,frame,orientation,width,height] of cases) test(`kind ${id} gets its catalog frame and boards without a default tier`,async()=>{
  const config={kind:id,label:`Label ${id}`,label_zh:`Label ${id}`,preview:{frame,orientation},default_preset:"small_app",default_boards:["users","storage"]};
  const api=apiFor(work({kind:id}),config);const m=await mount(api);
  try {
    const iframe=m.host.querySelector("iframe");assert.equal(iframe.width,String(width));assert.equal(iframe.height,String(height));assert.match(m.host.textContent,new RegExp(`Label ${id}`));
    assert.equal(!!m.host.querySelector('[aria-label="预览路径"]'),frame!=="game");
    if(frame==="game") {assert.ok(button(m.host,"全屏"));const first=iframe;await act(async()=>button(m.host,"重新开始").click());assert.notEqual(m.host.querySelector("iframe"),first);}
    await act(async()=>m.host.querySelector('[data-testid="website-view-configuration"]').click());assert.equal(globalThis.__uwConfiguration.defaultPreset,undefined,"a legacy catalog default never preselects a hosting tier");
    await act(async()=>m.host.querySelector('[data-testid="website-view-dashboard"]').click());assert.deepEqual(globalThis.__uwDashboard.defaultBoards,["users","storage"]);
  } finally {await m.close();}
});
test("frame choice follows catalog rather than kind name and missing catalog uses browser defaults",async()=>{
  const api=apiFor(work({kind:"game"}),{...DEFAULT_KIND_DEFINITION,kind:"game",preview:{frame:"phone",orientation:"portrait"}});const m=await mount(api);
  try {assert.equal(m.host.querySelector("iframe").width,"390");await act(async()=>button(m.host,"平板").click());assert.equal(m.host.querySelector("iframe").width,"820");}finally{await m.close();}
  const fallback=apiFor(work({kind:"app"}));fallback.kinds=async()=>{throw new Error("offline");};const n=await mount(fallback);
  try{assert.equal(n.host.querySelector("iframe").width,"1440");}finally{await n.close();}
});
test("source switch PUTs none, screen and own address through the same API",async()=>{
  const api=apiFor(work());const m=await mount(api);
  try{for(const value of ["none","screen:server-1","url"]){await act(async()=>{const select=m.host.querySelector('[aria-label="预览来源"]');select.value=value;select.dispatchEvent(new window.Event("change",{bubbles:true}));});}
    assert.deepEqual(api.calls.filter(call=>call[0]==="put"),[["put","cloud:project-1",{type:"none"}],["put","cloud:project-1",{type:"screen",device_id:"server-1",display_id:null}],["put","cloud:project-1",{type:"url",path:"/"}]]);
  }finally{await m.close();}
});
test("server work has optional dashboard/configuration and uses existing preview start/stop",async()=>{
  const item=work({id:"server-work",kind:"app",home:{type:"server",computer_id:"s",computer_name:"Server",path:"/work"}});const api=apiFor(item,undefined,source("url","not_wired"));const m=await mount(api,{workId:item.id});
  try{
    for(const page of ["dashboard","configuration"]){await act(async()=>m.host.querySelector(`[data-testid="website-view-${page}"]`).click());assert.ok(m.host.querySelector(`[data-testid="work-${page}-not-wired"]`));assert.equal(m.host.querySelector('[role="alert"]'),null);}
    await act(async()=>m.host.querySelector('[data-testid="website-view-preview"]').click());await act(async()=>button(m.host,"打开预览").click());assert.match(m.host.querySelector("iframe").src,/server\.ws\.oceanleo\.app/);
    await act(async()=>button(m.host,"停止").click());assert.equal(m.host.querySelector("iframe"),null);assert.deepEqual(api.calls.filter(call=>["start","stop"].includes(call[0])),[["start",item.id],["stop",item.id]]);
  }finally{await m.close();}
});
// UC-1/UC-3: docs/architecture/oceanleo-untrusted-content-isolation.md.
// A public viewer uses only its supplied isolated preview and cannot create an authenticated owner session.
test("view access shows only the supplied public preview and never creates owner sessions",async()=>{
  const item=work({access:"view",play_url:"https://play.ws.oceanleo.app/game/index.html?level=1"});const api=apiFor(item);const m=await mount(api,{initialWork:item,readOnly:true});
  try{assert.equal(m.host.querySelector('[role="tablist"]'),null);assert.equal(m.host.querySelector('[aria-label="预览来源"]'),null);assert.match(m.host.querySelector("iframe").src,/\/game\/index.html\?level=1$/);assert.deepEqual(api.calls,[]);}finally{await m.close();}
});
// UC-NONE: docs/architecture/oceanleo-untrusted-content-isolation.md.
// Reference serialization strips URL credentials and sensitive query keys; it does not change cookie scope or render executable content.
test("C6 references share work/source/coordinates/DOM shape and strip URL credentials",()=>{
  const ref={workId:"cloud:w",source:"url",url:"https://user:password@p.ws.oceanleo.app/a?__oceanleo_owner=hidden&token=hidden2&tab=x",x:14.3,y:22.8,width:1440,height:900};
  const text=previewReferenceText(ref);assert.match(text,/^\[Preview reference\]\n/);const value=JSON.parse(text.split("\n").slice(1).join("\n"));
  assert.deepEqual(value,{work_id:"cloud:w",source:"url",url:"https://p.ws.oceanleo.app/a?tab=x",point:{x:14,y:23},viewport:{width:1440,height:900},dom:"unavailable"});
  const screen=JSON.parse(previewReferenceText({...ref,source:"screen"}).split("\n").slice(1).join("\n"));assert.equal(screen.source,"screen");assert.equal("url" in screen,false);
  const dom=JSON.parse(previewReferenceText({...ref,tag:"button",text:"Go",className:"cta",selector:"#go"}).split("\n").slice(1).join("\n"));assert.deepEqual(dom.dom,{tag:"button",text:"Go",class:"cta",selector:"#go"});
});
// UC-3: docs/architecture/oceanleo-untrusted-content-isolation.md.
// Alongside catalog normalization, the existing source assertion pins a script-only sandbox and rejects same-origin/message/HTML sinks.
test("miniprogram survives normalization; work kind names never choose implementation outside catalog",()=>{
  assert.equal(normalizeWork(work({kind:"miniprogram"})).kind,"miniprogram");
  const dirs=["src/shell/works","src/shell/works-workbench","src/shell/website-platform"];
  for(const dir of dirs)for(const file of readdirSync(dir).filter(name=>/\.tsx?$/.test(name)&&name!=="kinds.ts")){
    const text=readFileSync(`${dir}/${file}`,"utf8");assert.doesNotMatch(text,/(?:\.kind|\bkind)\s*(?:===|!==)\s*["'](?:website|game|app|miniprogram|other)["']/u,`${dir}/${file}`);
  }
  const code=readFileSync("src/shell/website-platform/WebsitePreviewWorkbench.tsx","utf8");
  const locked=source=>{assert.match(source,/sandbox="allow-forms allow-modals allow-popups allow-presentation allow-scripts"/);assert.doesNotMatch(source,/allow-same-origin|postMessage|dangerouslySetInnerHTML/);};locked(code);assert.throws(()=>locked(code.replace('allow-scripts"','allow-scripts allow-same-origin"')));
});

test("agent preview-source changes become visible even while the current source is none",async(t)=>{
  t.mock.timers.enable({apis:["setTimeout"]});let next=source("none","not_wired");const api=apiFor(work());api.previewSource=async()=>next;
  const m=await mount(api);
  try{assert.ok(m.host.querySelector('[data-testid="work-preview-not-wired"]'));next=source("screen");await act(async()=>t.mock.timers.tick(3001));assert.ok(m.host.querySelector('[data-screen-source="server-1"]'));assert.equal(api.calls.filter(call=>call[0]==="put").length,0);}finally{await m.close();t.mock.timers.reset();}
});
