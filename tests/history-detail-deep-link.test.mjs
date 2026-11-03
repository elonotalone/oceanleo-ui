import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import "./helpers/w1-jsdom-window.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const reads = [];
const sessionReads = [];
const nativeReads = [];
let authGate;
globalThis.__detailReadTask = async (id) => {
  reads.push(id);
  if (authGate) await authGate;
  return { ok: true, data: { task: { id, mode: "computer", site_id: "oceanleo", status: "done", title: id }, messages: [], artifacts: [] } };
};
globalThis.__detailReadSession = async (id) => {
  sessionReads.push(id);
  return { ok: true, data: { id, site_id: "oceanleo", app_id: "home-agent", task_id: `task-for-${id}`, status: "active", snapshot: {}, revision: 1, schema_version: 1 } };
};
globalThis.__detailNativeRead = (id) => nativeReads.push(id);
const history = await import(await compileModule("src/shell/HistoryMasterDetail.tsx", {
  "../i18n/ui/useUI": dataModule("export function useUI(){return value=>value;}"),
  "next/navigation": dataModule(`
    export function usePathname(){return window.location.pathname;}
    export function useSearchParams(){return globalThis.__detailSearchReady === false ? null : new URLSearchParams(window.location.search);}
    export function useRouter(){return globalThis.__detailRouter;}
  `),
  "./WorkspaceSelection": dataModule("export function useWorkspaceSelection(){return [globalThis.__detailSelection || null, ()=>{}];}"),
  "./AgentChat": dataModule("export function AgentChat({taskId}){return globalThis.React.createElement('section',{'data-test-native-pane':taskId},taskId);}"),
  "./WorkspaceSession": dataModule("export function WorkspaceSessionProvider({children}){return children;}"),
  "./library-task-history": dataModule("export function LibraryTaskHistoryWorkspace(){return null;}"),
  "./LocalWorkspace": dataModule("export function useLocalTasks(){return {tasks:[],loading:false,workspace:null};} export function LocalTaskDetail(){return null;} export function LocalTaskRows(){return null;}"),
  "./cloud-computer/ShellTaskView": dataModule("export function ShellTaskView(){return null;}"),
  "./HistoryRowActions": dataModule("export function HistoryRowMenu(){return null;} export function MoveTaskProjectDialog(){return null;}"),
  "./nav-source/route-boundary": dataModule("export function RoutePageSkeleton(){return globalThis.React.createElement('span',null,'Loading');}"),
  "../ui": dataModule("export function ConfirmDialog(){return null;}"),
  "../lib/auth/client": dataModule("export function browserClient(){return null;}"),
  "../lib/agent": dataModule(`
    export function getTask(id){return globalThis.__detailReadTask(id);}
    export async function listTasks(){return {ok:true,data:{items:[]}};}
    export async function deleteTask(){return {ok:true};}
  `),
  "../lib/app-session": dataModule(`
    export function getAppSession(id){return globalThis.__detailReadSession(id);}
    export async function listAppSessions(){return {ok:true,data:{items:[]}};}
    export function isAppSessionApiUnavailableStatus(status){return [404,405,501].includes(status);}
    export async function deleteAppSession(){return {ok:true};}
    export async function updateAppSessionMetadata(){return {ok:true};}
  `),
  "./task-open-cache": dataModule(`
    export function prefetchHistoryOpen(){}
    export async function readHistorySession(){return undefined;}
    export async function readTaskDetail(){return undefined;}
    export function openTaskFirstPage(id){return globalThis.__detailReadTask(id);}
    export function rememberHistorySession(){}
    export function takeAppSessionPrefetch(){return null;}
  `),
  "../lib/computer-task-api": dataModule(`
    export function knownComputerTaskSessions(){return null;}
    export function latestComputerTaskSession(){return null;}
    export async function listComputerTaskSessions(id){globalThis.__detailNativeRead(id);return {sessions:[]};}
  `),
}));
globalThis.__detailRouter = { push(){}, replace(){}, prefetch(){} };

async function mount(url) {
  window.history.replaceState({}, "", url);
  reads.length = 0; sessionReads.length = 0; nativeReads.length = 0;
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let rerender;
  function Bed(){const [,bump]=React.useState(0);rerender=()=>bump(n=>n+1);return React.createElement(history.HistoryDetail,{siteId:"oceanleo"});}
  await act(async () => root.render(React.createElement(Bed)));
  return { container, async refresh(){await act(async()=>{rerender();});}, async unmount(){await act(async()=>root.unmount());container.remove();} };
}

test("a query deep-link restores detail while auth and sidebar selection are still hydrating", async () => {
  let release;
  authGate = new Promise(resolve => { release = resolve; });
  globalThis.__detailSelection = null;
  globalThis.__detailSearchReady = false;
  const view = await mount("/history?task=auth-deep-task&computerSession=cts-auth-deep");
  try {
    assert.deepEqual(reads, ["auth-deep-task"]);
    assert.deepEqual(nativeReads, ["auth-deep-task"]);
    assert.deepEqual(sessionReads, []);
    release(); authGate = null;
    globalThis.__detailSearchReady = true;
    await view.refresh();
    assert.equal(view.container.querySelector("[data-test-native-pane]")?.getAttribute("data-test-native-pane"), "auth-deep-task");
    assert.equal(view.container.querySelector("[data-task-loading-gate]")?.getAttribute("data-task-loading-gate"), "ready");
  } finally { release(); authGate = null; await view.unmount(); }
});

test("query navigation wins over stale selection without a sidebar mount", async () => {
  globalThis.__detailSelection = "stale-context-task";
  globalThis.__detailSearchReady = true;
  const view = await mount("/history?task=url-task-one");
  try {
    assert.equal(view.container.querySelector("[data-test-native-pane]")?.getAttribute("data-test-native-pane"), "url-task-one");
    window.history.replaceState({}, "", "/history?task=url-task-two");
    await view.refresh();
    assert.equal(view.container.querySelector("[data-test-native-pane]")?.getAttribute("data-test-native-pane"), "url-task-two");
    assert.deepEqual(reads, ["url-task-one", "url-task-two"]);
    assert.deepEqual(sessionReads, []);
  } finally { await view.unmount(); }
});

test("a dynamic session route keeps precedence over query and context selection", async () => {
  globalThis.__detailSelection = "stale-context-task";
  globalThis.__detailSearchReady = true;
  const view = await mount("/history/path-session?task=wrong-query-task");
  try {
    assert.deepEqual(sessionReads, ["path-session"]);
    assert.equal(view.container.querySelector("[data-test-native-pane]")?.getAttribute("data-test-native-pane"), "task-for-path-session");
    assert.deepEqual(reads, []);
  } finally { await view.unmount(); }
});
