import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {writeFileSync, unlinkSync} from "node:fs";
import {createRequire} from "node:module";
import {pathToFileURL} from "node:url";
import test from "node:test";
import React, {act} from "react";
import "./helpers/w1-jsdom-window.mjs";
import {compileModule, dataModule} from "./helpers/module-bench.mjs";
import {W4_SIDEBAR_STUBS} from "./helpers/w4-sidebar-stubs.mjs";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
for (const name of ["CustomEvent", "MouseEvent", "Event", "localStorage", "sessionStorage"]) {
  Object.defineProperty(globalThis, name, {configurable:true,writable:true,value:window[name]});
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
window.Element.prototype.scrollIntoView = function() {};
const splitStubUrl = dataModule(`export function useRightPaneSlot(){return null;} export function useWorkspacePane(){return null;}`);
const guideStubUrl = dataModule(`export function useFunctionGuide(){return null;}`);
const hydrationStubUrl = dataModule(`export function useWorkspaceRuntimeHydration(){return null;}`);
const sessionStubUrl = dataModule(`export function useOptionalWorkspaceSession(){return null;}`);
const panelStubUrl = dataModule(`
  export function NavigatorGuide(){return null;} export function MaterialLibrary(){return null;}
  export function AdvancedContentWorkbench(){return null;} export function WorkspaceEntryCanvas(){return null;}
`);
const materialActionsStubUrl = dataModule(`const actions=[];export function useWorkbenchMaterialActions(){
  return {actions,perform(){},canPerform(){return false;},availability:{},beginMaterialDrag(){},endMaterialDrag(){}};}`);
const routeStubUrl = dataModule(`export function editorCapabilityFor(){return {available:false};}`);
const advancedSessionStubUrl = dataModule(`
  export function advancedRootItemId(item){return String(item?.id || "item");}
  export function inlineEditorItemsFromSession(){return [];}
  export function savedEditorRevisionTransition(){return {ok:true,durableCommit:true};}
`);
const legacyStubUrl = dataModule(`
  export function adaptLegacyWorkspaceSurfaceTabs(){return {groups:{template:[],preview:[],materials:[],mine:[],browser:[]}};}
  export function legacyWorkspaceEntry(tab){return {id:tab.id,title:tab.label || tab.id,libraryItem:tab.libraryItem};}
`);
const surfaceModelStubUrl = dataModule(`
  export function buildWorkspaceSurfaceModel(tabs){return {tabs};}
  export function workspaceSurfaceCallerId(_model,id){return id;}
  export function workspaceSurfacePrimaryTab(){return null;}
  export function workspaceSurfaceSlotForId(_model,id,fallback){return ["template","preview","materials","mine","browser"].includes(id)?id:fallback(id);}
`);
const bayStateStubUrl = dataModule(`export function useBayEnabled(){return true;}
  export function attachBayDeepLinks(){return ()=>{};}export function openBay(){}
  export function useBaySignedIn(){return true;}export function setBayTaskContext(){}`);
const bayPanelStubUrl = dataModule(`export function BayPanel(){return null;}`);
const leoChatPanelStubUrl = dataModule(`export function LeoChatPanel(){return null;}`);
const imClientStubUrl = dataModule(`export function useImEnabled(){return false;}export class ImApiError extends Error{}
  export async function imFetch(path){return (await globalThis.fetch("https://gateway.test"+path)).json();}`);
const imUnreadStubUrl = dataModule(`export function useImUnread(){return null;}`);
const bayIconsStubUrl = dataModule(`export function BayIcon(){return null;}`);

// Set U2_BASELINE_REF to the pre-wave commit to run the same fake gateway and
// virtual minute against those exact components. Temporary sources are removed.
const baseline = process.env.U2_BASELINE_REF;
const temporary = [];
function source(path) {
  if (!baseline) return path;
  const local = path.replace(/([^/]+)$/, ".pw-u2-baseline-$1");
  writeFileSync(local, execFileSync("git", ["show", `${baseline}:${path}`]));
  temporary.push(local);
  return local;
}
const ui = dataModule(`const tt = value => value; export function useUI(){ return tt; }`);
const auth = dataModule(`
  export const AUTH_STATE_EVENT = "oceanleo:auth-state";
  export function browserClient(){ return null; }
  export async function accessToken(){ return "test-owner"; }
  export function cachedAccessToken(){ return "test-owner"; }
  export async function getUserIdSnapshot(){return {available:true,userId:"owner"};}
  export async function getUserId(){return "owner";}
`);
const originalArtifact = new URL("../src/shell/artifact-client.ts", import.meta.url).href;
const api = dataModule(`
  export * from ${JSON.stringify(originalArtifact)};
  export async function listMyArtifacts(options = {}) {
    const query = new URLSearchParams({limit:String(options.limit || 100)});
    if(options.artifactType) query.set("artifactType",options.artifactType);
    await globalThis.fetch("https://gateway.test/v1/library/mine?" + query);
    return {ok:true,data:{items:[],ownerPrincipalId:"owner",nextCursor:null,total:0}};
  }
  export async function listFavoriteArtifacts() {
    await globalThis.fetch("https://gateway.test/v1/library/favorites?limit=100");
    return {ok:true,data:{items:[],ownerPrincipalId:"owner",nextCursor:null,total:0}};
  }
`);
const browserApi = dataModule(`
  export async function listCloudBrowsers(limit=50,taskId) {
    const p = new URLSearchParams({limit:String(limit)});
    if(taskId)p.set("task_id",taskId);
    const res = await globalThis.fetch("https://gateway.test/v1/browser/sessions?"+p);
    return {ok:true,data:await res.json()};
  }
  export async function getCloudBrowserSession(){ return {ok:false,status:404}; }
  export async function listCloudBrowserCheckpoints(){return {ok:true,data:{items:[]}};}
`);
const browserHook = await compileModule(source("src/shell/cloud-browser-session-data.ts"), {"../lib/browser":browserApi});
const browserPanel = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  import {useCloudBrowserSessionData} from ${JSON.stringify(browserHook)};
  const tt = value => value;
  export function CloudBrowserPanel({taskId}) {
    const [error,setError] = React.useState("");
    useCloudBrowserSessionData({effectiveTaskId:taskId || "",liveRequested:false,tt,setError});
    return React.createElement("div",null,error);
  }
`);
const common = {
  ...W4_SIDEBAR_STUBS,
  "../i18n/ui/useUI": ui,
  "../lib/auth/client": auth,
  "./SplitWorkspace": splitStubUrl,
  "./guide-context": guideStubUrl,
  "./NavigatorGuide":panelStubUrl,
  "./MaterialLibrary":panelStubUrl,
  "./workspace-runtime-hydration": hydrationStubUrl,
  "./workspace-session-context": sessionStubUrl,
  "./AdvancedContentWorkbench": panelStubUrl,
  "./WorkspaceEntryCanvas": panelStubUrl,
  "./workbench-material-provider": materialActionsStubUrl,
  "./bay/shell/bay-state": bayStateStubUrl,
  "./bay/panel": bayPanelStubUrl,
  "./leochat/LeoChatPanel": leoChatPanelStubUrl,
  "../lib/im/client": imClientStubUrl,
  "./messages/realtime/hooks": imUnreadStubUrl,
  "./messages/conversation/AttachmentView":dataModule(`export const safeMediaUrl = value => value;`),
  "./bay/shell/bay-icons": bayIconsStubUrl,
  "./artifact-client": api,
  "./editor-preload": dataModule(`export async function preloadEditorFor(){return {};}`),
  "./WorkspaceLibrary": dataModule(`export function WorkspaceLibrary(){return null;}export function workspaceEntryFromLibraryItem(item){return {id:item.id,libraryItem:item};}`),
  "next/navigation": dataModule(`
    export function usePathname(){return "/tasks/task-new";}
    export function useSearchParams(){return new URLSearchParams();}
    export function useRouter(){return {push(){},replace(){},prefetch(){}};}
  `),
};
let ResultCanvas, HistoryInlineList;
try {
  await import(await compileModule("src/shell/library-chat-files.ts", common));
  const library = await compileModule("src/shell/MyLibrary.tsx", common);
  ({ ResultCanvas } = await import(await compileModule(source("src/shell/ResultCanvas.tsx"), {
    ...common,
    "./MyLibrary":library,
    "./CloudBrowserPanel":browserPanel,
    "./workbench-routes":routeStubUrl,
    "./advanced-session":advancedSessionStubUrl,
    "./legacy-workspace-surface-adapter":legacyStubUrl,
    "./workspace-surface-model":surfaceModelStubUrl,
    "./workspace-panels/DevicesWorkspacePanel":dataModule(`export function DevicesWorkspacePanel(){return null;}`),
  })));
  ({ HistoryInlineList } = await import(await compileModule(source("src/shell/HistoryMasterDetail.tsx"), {
    ...common,
    "./AgentChat":dataModule(`export function AgentChat(){return null;}`),
    "./library-task-history":dataModule(`export function LibraryTaskHistoryWorkspace(){return null;}`),
    "./WorkspaceSelection":dataModule(`import React from ${JSON.stringify(reactUrl)};export function useWorkspaceSelection(){return React.useState(null);}`),
    "./WorkspaceSession":dataModule(`export function WorkspaceSessionProvider({children}){return children;}`),
    "./HistoryRowActions":dataModule(`export function HistoryRowMenu(){return null;}export function MoveTaskProjectDialog(){return null;}`),
    "../ui":dataModule(`export function ConfirmDialog(){return null;}export function SkeletonCard(){return null;}export function SkeletonLine(){return null;}`),
    "../lib/agent":dataModule(`
      export async function listTasks(){const r=await globalThis.fetch("https://gateway.test/v1/agent/tasks");return {ok:true,data:await r.json()};}
      export async function getTask(){return {ok:false,status:404};}export async function deleteTask(){return {ok:true};}
      export function taskCostYuan(){return 0;}
    `),
    "../lib/app-session":dataModule(`
      export function isAppSessionApiUnavailableStatus(s){return s===404;}
      export async function listAppSessions(){const r=await globalThis.fetch("https://gateway.test/v1/agent/sessions");return {ok:true,data:await r.json()};}
      export async function getAppSession(){return {ok:false,status:404};}export async function deleteAppSession(){return {ok:true};}
      export async function updateAppSessionMetadata(){return {ok:true};}
    `),
  })));
} finally { for (const path of temporary) unlinkSync(path); }

function task(working = true) {
  return {id:"task-new",title:"first task",mode:"computer",status:working?"running":"done",working,open_turn:working,
    activity_state:working?"working":"idle",last_activity_at:"2026-11-15T10:00:00Z",created_at:"2026-11-15T10:00:00Z"};
}

// Only component-owned window timers are virtual. Node deadlines keep their
// real clock, so a hung fake gateway still fails normally.
function clock() {
  const before = [window.setTimeout, window.clearTimeout, window.setInterval, window.clearInterval, globalThis.setInterval, globalThis.clearInterval];
  let now = 0, id = 0;
  const queue = new Map();
  window.setTimeout = (fn, delay=0) => {queue.set(++id,{fn,at:now+delay});return id;};
  window.setInterval = (fn, delay=0) => {queue.set(++id,{fn,at:now+delay,interval:delay});return id;};
  window.clearTimeout = window.clearInterval = key => queue.delete(key);
  globalThis.setInterval = window.setInterval;
  globalThis.clearInterval = window.clearInterval;
  return {
    async advance(ms) {
      const end = now+ms;
      for (;;) {
        const next = [...queue.entries()].sort((a,b)=>a[1].at-b[1].at)[0];
        if (!next || next[1].at>end) break;
        now=next[1].at;queue.delete(next[0]);
        if(next[1].interval)queue.set(next[0],{...next[1],at:now+next[1].interval});
        await act(async()=>{next[1].fn();await Promise.resolve();});
      }
      now=end;
    },
    restore(){[window.setTimeout,window.clearTimeout,window.setInterval,window.clearInterval,globalThis.setInterval,globalThis.clearInterval]=before;},
  };
}

async function scenario(run) {
  const calls = [];
  let working = true;
  const previousFetch = globalThis.fetch;
  Object.defineProperty(document,"hidden",{configurable:true,value:false});
  globalThis.fetch = async (url, init={}) => {
    const path = new URL(String(url),"https://gateway.test").pathname;
    calls.push({path,url:String(url),method:init.method || "GET"});
    let data = {items:[],next:null};
    if(path==="/v1/agent/tasks") data={items:[task(working)]};
    return new Response(JSON.stringify(data),{status:200,headers:{"content-type":"application/json"}});
  };
  const timer=clock();
  const {createRoot}=await import("react-dom/client");
  const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
  function Home() {
    const [sent,setSent]=React.useState(false);
    if(!sent)return React.createElement("button",{onClick:()=>{void fetch("https://gateway.test/v1/tasks/task-new/send",{method:"POST"});setSent(true);}},"Send first message");
    return React.createElement(React.Fragment,null,React.createElement(HistoryInlineList,{siteId:"u2-"+Math.random()}),
      React.createElement(ResultCanvas,{tabs:[],siteId:"oceanleo",taskId:"task-new",workspaceOpen:false}));
  }
  try {
    await act(async()=>root.render(React.createElement(Home)));
    await act(async()=>host.querySelector("button").click());
    for(let n=0;n<8;n++)await act(async()=>{await new Promise(resolve=>setImmediate(resolve));});
    await run({calls,timer,host,end(){working=false;},hidden(value){Object.defineProperty(document,"hidden",{configurable:true,value});document.dispatchEvent(new window.Event("visibilitychange"));}});
  } finally {await act(async()=>root.unmount());host.remove();timer.restore();globalThis.fetch=previousFetch;}
}

test("send first message from home, then leave it visible for 60 seconds",async()=>{
  await scenario(async({calls,timer})=>{
    await timer.advance(60000);
    const counts=Object.fromEntries([...new Set(calls.map(c=>c.path))].map(path=>[path,calls.filter(c=>c.path===path).length]));
    console.log("U2_GATEWAY_MINUTE",JSON.stringify({baseline:baseline || false,total:calls.length,counts}));
    assert.equal(calls.filter(c=>c.method==="POST").length,1);
    if(!baseline) {
      assert.equal(calls.filter(c=>/library|purchases|browser/.test(c.path)).length,0,"closed panels make zero reads");
      assert.ok(calls.filter(c=>c.path==="/v1/agent/tasks").length<=5,"working rows back off instead of polling forever");
    } else {
      assert.ok(calls.some(c=>c.path==="/v1/library/mine"),"baseline Library mounts eagerly");
      assert.ok(calls.filter(c=>c.path==="/v1/browser/sessions").length>=24,"baseline browser keeps polling");
    }
  });
});

test("hidden task pauses reads; visibility/focus and stream end refresh the row",async(t)=>{
  if (baseline) return t.skip("Baseline predates visibility-aware reads");
  await scenario(async({calls,timer,host,end,hidden})=>{
    await act(async()=>hidden(true));
    const count=calls.length;
    await timer.advance(60000);
    assert.equal(calls.length,count);
    await act(async()=>{window.dispatchEvent(new window.Event("focus"));window.dispatchEvent(new window.Event("oceanleo:history-changed"));});
    assert.equal(calls.length,count,"hidden notifications do not start reads");
    await act(async()=>hidden(false));
    assert.equal(calls.length,count+2);
    const beforeEnd=calls.length;
    await act(async()=>{end();window.dispatchEvent(new window.Event("oceanleo:history-changed"));});
    assert.equal(calls.length,beforeEnd+2,"stream end requests both current sources immediately");
    assert.equal(host.querySelector("[data-history-working]"),null);
  });
});

test("other tasks that end without an open stream are refreshed within 30 seconds",async(t)=>{
  if (baseline) return t.skip("Baseline predates idle list backoff");
  await scenario(async({calls,timer,host,end})=>{
    await timer.advance(60000);
    assert.ok(host.querySelector("[data-history-working]"));
    end();
    const count=calls.length;
    await timer.advance(30000);
    assert.equal(host.querySelector("[data-history-working]"),null);
    assert.ok(calls.length >= count+2 && calls.length <= count+4, "the next read catches the end within 30 seconds, then resets its quiet backoff");
  });
});
