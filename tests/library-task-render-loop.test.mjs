import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import "./helpers/w1-jsdom-window.mjs";
import { normalizeArtifactProjectionResult } from "../src/shell/artifact-contract.ts";
import { artifactProjectionToLibraryItem } from "../src/shell/library-data.ts";
const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.requestAnimationFrame=window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame=window.cancelAnimationFrame.bind(window);
globalThis.ResizeObserver=class {observe(){} unobserve(){} disconnect(){}};
const uiStubUrl=dataModule(`const tt=(value)=>value;export function useUI(){return tt;}`);
const splitUrl=await compileModule("src/shell/SplitWorkspace.tsx", {"../i18n/ui/useUI":uiStubUrl,"./EditBarDockHost":dataModule(`export function EditBarDockHost(){return null;}`)});
const {createRoot}=await import("react-dom/client");
window.HTMLElement.prototype.scrollTo=function scrollTo(){};
window.HTMLElement.prototype.scrollIntoView=function scrollIntoView(){};
async function mount(child){
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
 const render=async content=>act(async()=>root.render(React.createElement(SplitWorkspace,{left:React.createElement('div',null,'task chat'),right:content,library:{open:true},fillParent:true})));
 await render(child);return {container,render,async unmount(){await act(async()=>root.unmount());container.remove();}};
}
const raw = JSON.parse(readFileSync(new URL("./fixtures/oceanleo-artifact-library-pages.json", import.meta.url), "utf8"));
const item = artifactProjectionToLibraryItem(normalizeArtifactProjectionResult(raw.publicPage.items[0]).data);
globalThis.__renderLoopItem = item;
globalThis.__renderLoopFailList = false;
globalThis.__renderLoopCurrentArtifactRequests = [];
const historyTaskId = "dbec388c-aeae-400b-b905-48ab28cc1d96";
const historyArtifactId = "21c1e4d9-0818-4bbe-ae33-b4d01a5beafd";
const historyItem = {
 ...item,
 id: historyArtifactId,
 artifactId: historyArtifactId,
 title: "需签字盖章页清单（只打第3页）",
 kind: "document",
 meta: {
  ...item.meta,
  advanced_editor_route: "richdoc",
  source_format: "text/markdown",
 },
};
const historyMessages = [
 {id:1,role:"user",kind:"text",content:"hi",meta:{model_selection:{}}},
 {id:2,role:"assistant",kind:"text",content:"你好！有什么我可以帮你？",meta:{done:true,suggestions:["帮我整理一份文档","帮我分析一个问题","告诉我你能做什么"],first_token_ms:250}},
];
globalThis.__renderLoopHistoryMessages = historyMessages;
const api = dataModule(`
 export * from ${JSON.stringify(new URL("../src/shell/artifact-client.ts",import.meta.url).href)};
 export const ARTIFACT_LIBRARY_CHANGE_EVENT='oceanleo:artifact-library-change';
 export async function listMyArtifacts(){return globalThis.__renderLoopFailList ? {ok:false,status:0,error:'network unavailable'} : {ok:true,data:{items:[],ownerPrincipalId:'user-1',nextCursor:null,total:0,invalidItems:[]}};}
 export const listFavoriteArtifacts=listMyArtifacts;
 export async function getCurrentArtifactItem(id){globalThis.__renderLoopCurrentArtifactRequests.push(id);return {ok:true,data:globalThis.__renderLoopItem};}
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
const resultCanvasUrl = await compileModule("src/shell/ResultCanvas.tsx", {
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
});
const { ResultCanvas } = await import(resultCanvasUrl);
const { SplitWorkspace } = await import(splitUrl);

// The earlier regression only mounted ResultCanvas. `/history?task=…&item=…`
// reaches it through the real AgentChat fallback, so keep that integration
// branch in this non-browser harness too. The left chat itself is real; only
// network/editor integrations unrelated to the render lifecycle are stubbed.
const agentLib = dataModule(`
 export async function getTask(id){return {ok:true,data:{task:{id,status:'done',site_id:'oceanleo',mode:'agent',title:'hi',session_id:null,project_id:null},messages:globalThis.__renderLoopHistoryMessages,artifacts:[]}};}
 export async function createTask(){throw new Error('unexpected write');}
 export async function branchTask(){throw new Error('unexpected write');}
 export async function followUp(){throw new Error('unexpected write');}
 export async function stopTask(){return {ok:true};}
`);
const markdownUrl = await compileModule("src/shell/Markdown.tsx", {
 "./share/katex-runtime": dataModule(`export const KATEX_OPTIONS={}; export function hasMathDelimiters(){return false;}`),
});
const transcriptUrl = await compileModule("src/shell/AgentTranscriptBubble.tsx", {
 "../i18n/ui/useUI": uiStubUrl,
 "./Markdown": markdownUrl,
 "./share/ShareActionBar": dataModule(`export function ShareCheckbox(){return null;}`),
 "./share/share-clipboard": dataModule(`export async function writeClipboardText(){return false;}`),
 "./ApprovalCard": dataModule(`export function ApprovalCard(){return null;} export function parseApprovalMessage(){return null;}`),
});
const agentNoop = dataModule(`
 import { createElement, forwardRef } from ${JSON.stringify(reactUrl)};
 export function AgentTranscriptBubble(){return null;}
 export function agentArtifactLabels(){return {};}
 export function AgentProgress(){return null;}
 export function CollabTaskPresence(){return null;}
 export function CloudBrowserPanel(){return null;}
 export function MaterialLibrary(){return null;}
 export function ArtifactRenderer(){return null;}
 export function artifactToLibraryItem(){return {};}
 export function ShareActionBar(){return null;}
 export function ShareEntryButton(){return null;}
 export function ShareCardPreview(){return null;}
 export function useShareMode(){return {active:false,selectable:[],selectedIds:new Set(),enter(){},preview:null,closePreview(){}};}
 export function EditorCommandNotes(){return null;}
 export function useEditorCommandBridge(){return {contextFor(){return '';},captureContext(){return {context:'',filePin:null};},pending:null,busy:false,notes:[],card:null,noteUserTurn(){},noteOwnTask(){},ingest(){}};}
 export function currentPluginCommandSurface(){return null;}
 export function AgentReviewPanel(){return null;}
 export function assembleAgentEditorContext(){return '';}
 export function createReviewGatedReader(){return null;}
 export const hostReviewSession={};
 export function installAgentReviewGate(){}
 export function installSelectionBridge(){}
 export function readAgentSelection(){return null;}
 export function readMentionCatalog(){return [];}
 export function refreshAgentSelectionFromDom(){}
 export function useHostReviewActions(){return {busy:false,accept(){},reject(){},rollback(){}};}
 export function QuickActionChips(){return null;}
 export function HumanHandoffStatus(){return null;}
 export function CallHumanIcon(){return null;}
 export function openBay(){}
 export function setBayTaskContext(){}
 export function useBayEnabled(){return false;}
 export function RestartDraftButton(){return null;}
 export function useAttachments(){return {handleAttachFiles(){},composerAttachments:[],removeAttachment(){}};}
 export const IconSearch=()=>null;
 export const PromptHighlightArea=forwardRef(function PromptHighlightArea(){return createElement('textarea');});
 export const TemplateFillArea=PromptHighlightArea;
 export function templateSegments(){return [];}
 export function highlightSegments(){return [];}
 export function stripPromptPlaceholders(value){return value;}
`);
const leoComposer = dataModule(`
 import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
 export function LeoComposer(props){return jsx('textarea',{value:props.value,onChange:props.onChange,readOnly:true});}
`);
const workspaceSessionStub = dataModule(`
 export function WorkspaceSessionProvider({children}){return children;}
 export function useOptionalWorkspaceSession(){return null;}
`);
const agentChatUrl = await compileModule("src/shell/AgentChat.tsx", {
  "../i18n/ui/useUI": uiStubUrl,
  "next/navigation": dataModule(`export function useRouter(){return {push(){},replace(){}};} export function usePathname(){return '/history';}`),
  "./SplitWorkspace": splitUrl,
  "./ResultCanvas": resultCanvasUrl,
  "./WorkspaceSession": workspaceSessionStub,
  "./CloudBrowserPanel": agentNoop,
  "./MaterialLibrary": agentNoop,
  "./ArtifactRenderer": agentNoop,
  "./AgentTranscriptBubble": transcriptUrl,
  "./AgentProgress": agentNoop,
  "./collab/CollabActionSlot": agentNoop,
  "./LeoComposer": leoComposer,
  "./share/ShareActionBar": agentNoop,
  "./share/ShareCard": agentNoop,
  "./share/useShareMode": agentNoop,
  "./FunctionAgentChat": agentNoop,
  "./plugin-command": agentNoop,
  "./agent-review": agentNoop,
  "./quick-actions": agentNoop,
  "./HumanHandoffStatus": agentNoop,
  "./bay/shell/bay-icons": agentNoop,
  "./bay/shell/bay-state": agentNoop,
  "./RestartDraftButton": agentNoop,
  "./useAttachments": agentNoop,
  "./icons": agentNoop,
  "./PromptHighlightArea": agentNoop,
  "../lib/agent": agentLib,
  "../lib/database": dataModule(`export async function deleteArtifact(){throw new Error('unexpected write');}`),
}, { missingPackageStub: dataModule(`const noop=()=>null; export default new Proxy(noop,{get:()=>noop}); export const __stub=true;`) });
const { AgentChat } = await import(agentChatUrl);
const historySelection = dataModule(`
 export function useWorkspaceSelection(){return [new URLSearchParams(globalThis.window.location.search).get('task'),()=>{}];}
`);
const historyApi = dataModule(`
 export async function getAppSession(){return {ok:false,status:503,error:'session API unavailable'};}
 export function isAppSessionApiUnavailableStatus(status){return status===503;}
 export async function listAppSessions(){return {ok:false,status:503};}
 export async function deleteAppSession(){return {ok:true};}
 export async function updateAppSessionMetadata(){return {ok:true};}
`);
const historyAgentApi = dataModule(`
 export async function getTask(id){return {ok:true,data:{task:{id,status:'done',site_id:'oceanleo',mode:'agent',tier:'lite',title:'hi',session_id:null,project_id:null,root_task_id:null,parent_task_id:null,branch_message_id:null},messages:globalThis.__renderLoopHistoryMessages,artifacts:[]}};}
 export async function listTasks(){return {ok:true,data:{items:[]}};}
 export async function deleteTask(){return {ok:true};}
 export function taskCostYuan(){return 0;}
 export async function createTask(){throw new Error('unexpected write');}
 export async function branchTask(){throw new Error('unexpected write');}
 export async function followUp(){throw new Error('unexpected write');}
 export async function stopTask(){return {ok:true};}
`);
const historyNoop = dataModule(`export function ConfirmDialog(){return null;} export function HistoryRowMenu(){return null;} export function MoveTaskProjectDialog(){return null;} export function ShellTaskView(){return null;}`);
const historyModel = dataModule(`
 export function canDeleteHistoryEntry(){return false;}
 export function historyPollDelayMs(){return 60000;}
 export const HISTORY_WORKING_POLL_MS=3000;
 export function isHistoryEntryWorking(){return false;}
 export function isRestorableAppSession(){return false;}
 export function isShellTask(){return false;}
 export function isTaskThreadSession(){return false;}
 export function mergeHistoryEntries(){return [];}
 export function shellSessionFromTask(){return null;}
 export function withLinkedAgentTask(session){return session;}
`);
const historyRoutes = dataModule(`
 export function historySessionHref(){return '/history';}
 export function historySessionIdFromPath(){return null;}
 export function withFusionMountPrefix(path){return path;}
`);
const historyNavigation = dataModule(`
 const router={push(){},replace(){}};
 export function usePathname(){return '/history';}
 export function useRouter(){return router;}
`);
const historyDetailUrl = await compileModule("src/shell/HistoryMasterDetail.tsx", {
  // This legacy-task test intentionally isolates Library-session restoration;
  // the latter is exercised by the native-ESM one-task acceptance harness.
  "./library-task-history": dataModule(`export function LibraryTaskHistoryWorkspace(){return null;}`),
  "next/navigation": historyNavigation,
  "./AgentChat": agentChatUrl,
  "./WorkspaceSelection": historySelection,
  "../lib/agent": historyAgentApi,
  "../lib/app-session": historyApi,
  "../ui": historyNoop,
  "../lib/auth/client": dataModule(`export const browserClient=null;`),
  "../i18n/ui/useUI": uiStubUrl,
  "./WorkspaceSession": workspaceSessionStub,
  "./cloud-computer/ShellTaskView": historyNoop,
  "../lib/computer-task-api": dataModule(`export async function listComputerTaskSessions(){return {sessions:[]};}`),
  "./history-model": historyModel,
  "./workspace-route": historyRoutes,
  "../lib/history-events": dataModule(`export const HISTORY_CHANGED_EVENT='history-changed';`),
  "../lib/money": dataModule(`export function formatMoney(){return '';} export function useLedgerCurrency(){return 'CNY';}`),
  "./HistoryRowActions": historyNoop,
}, { missingPackageStub: dataModule(`const noop=()=>null; export default new Proxy(noop,{get:()=>noop}); export const __stub=true;`) });
const { HistoryDetail } = await import(historyDetailUrl);

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

test("real AgentChat + ResultCanvas keeps the history task/item route renderable when Library lists time out", async () => {
  window.history.replaceState(null,"",`/history?task=eaf3b3ab-b1e2-44f2-a8c5-33e436b90135&item=${item.artifactId}`);
  globalThis.__renderLoopFailList = true;
  const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
  const errors=[];
  const priorConsoleError=console.error;
  console.error=(...args)=>{errors.push(args.map(String).join(' '));priorConsoleError(...args);};
  try {
    await act(async()=>root.render(React.createElement(AgentChat,{taskId:'eaf3b3ab-b1e2-44f2-a8c5-33e436b90135',siteId:'oceanleo',libraryTabs:{materials:[],showFiles:true,showBrowser:true}})));
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,40));});
    assert.ok(container.querySelector('[data-workspace-split]'));
    assert.doesNotMatch(container.textContent,/Too many re-renders/);
    assert.doesNotMatch(errors.join('\n'),/Too many re-renders/);
  } finally {
    console.error=priorConsoleError;
    await act(async()=>root.unmount());container.remove();
  }
});

test("real HistoryDetail legacy-task fallback + AgentChat survives an item query and Library timeout", async () => {
  window.history.replaceState(null,"",`/history?task=${historyTaskId}&item=${historyArtifactId}`);
  globalThis.__renderLoopFailList = true;
  globalThis.__renderLoopItem = historyItem;
  const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
  const errors=[];
  const priorConsoleError=console.error;
  console.error=(...args)=>{errors.push(args.map(String).join(' '));priorConsoleError(...args);};
  try {
    await act(async()=>root.render(React.createElement(HistoryDetail,{siteId:'oceanleo'})));
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,60));});
    assert.ok(container.querySelector('[data-workspace-split]'));
    assert.match(container.textContent,/hi/);
    assert.match(container.textContent,/你好！有什么我可以帮你？/);
    assert.match(container.textContent,/帮我整理一份文档/);
    assert.doesNotMatch(container.textContent,/Too many re-renders/);
    assert.doesNotMatch(errors.join('\n'),/Too many re-renders/);
  } finally {
    console.error=priorConsoleError;
    await act(async()=>root.unmount());container.remove();
  }
});

test("exact completed legacy history survives /history → task → selected item without remount using real transcript and Markdown", async () => {
  globalThis.__renderLoopFailList = true;
  globalThis.__renderLoopItem = historyItem;
  globalThis.__renderLoopCurrentArtifactRequests = [];
  window.history.replaceState(null,"","/history");
  const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
  const errors=[];
  const priorConsoleError=console.error;
  console.error=(...args)=>{errors.push(args.map(String).join(' '));priorConsoleError(...args);};
  const render=()=>act(async()=>root.render(React.createElement(HistoryDetail,{siteId:'oceanleo'})));
  const settle=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,60));});
  try {
    await render();
    assert.match(container.textContent,/在左侧选择一个任务/);

    window.history.replaceState(null,"",`/history?task=${historyTaskId}`);
    await render();
    await settle();
    assert.ok(container.querySelector('[data-workspace-split]'));
    assert.match(container.textContent,/你好！有什么我可以帮你？/);
    assert.match(container.textContent,/帮我整理一份文档/);

    window.history.replaceState(null,"",`/history?task=${historyTaskId}&item=${historyArtifactId}`);
    await render();
    await settle();
    await render();
    assert.ok(container.querySelector('[data-workspace-split]'));
    assert.match(container.textContent,/你好！有什么我可以帮你？/);
    assert.ok(globalThis.__renderLoopCurrentArtifactRequests.includes(historyArtifactId));
    assert.doesNotMatch(container.textContent,/Too many re-renders/);
    assert.doesNotMatch(errors.join('\n'),/Too many re-renders/);
  } finally {
    console.error=priorConsoleError;
    await act(async()=>root.unmount());container.remove();
    globalThis.__renderLoopItem = item;
  }
});
