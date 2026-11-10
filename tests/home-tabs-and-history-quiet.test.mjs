/**
 * 左栏「我的任务」的「加载…」只准出现一次：首屏还没拿到任何数据的时候。
 *
 * 之后无论是 HISTORY_CHANGED 事件、翻译函数换了引用（词典对象重新下发）、
 * 还是列表被卸载重挂（侧栏收成 rail 再展开、布局重排），都只在后台刷新，
 * 已有列表继续显示——用户在右栏切页签时左栏不得闪「加载…」。
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = {
  id: canvasEntry,
  filename: canvasEntry,
  loaded: true,
  exports: {},
};
const { JSDOM } = await import(
  pathToFileURL(fabricRequire.resolve("jsdom")).href
);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://image.oceanleo.com/workspace/poster",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  CustomEvent: window.CustomEvent,
  MouseEvent: window.MouseEvent,
  localStorage: window.localStorage,
  sessionStorage: window.sessionStorage,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
window.Element.prototype.scrollIntoView = function () {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

globalThis.React = React;
globalThis.__historyGate = { listCalls: 0, release: null, ttSeq: 0 };

function session(id, title) {
  return {
    id,
    site_id: "image",
    app_id: "poster",
    surface: "app",
    status: "active",
    title,
    snapshot: {},
    schema_version: 1,
    revision: 1,
    created_at: "2026-09-05T00:00:00Z",
    updated_at: "2026-09-05T00:00:00Z",
    last_activity_at: "2026-09-05T00:00:00Z",
    first_output_at: "2026-09-05T00:00:00Z",
  };
}
globalThis.__historyItems = [session("s-1", "第一条任务")];

const historyStubs = {
  "../i18n/ui/useUI": dataModule(`
    // 每次渲染都返回一个新函数，模拟词典对象换引用后 useUI 的 memo 失效。
    export function useUI(){ globalThis.__historyGate.ttSeq += 1; return (value) => value; }
  `),
  "next/navigation": dataModule(`
    export function usePathname(){ return globalThis.__historyPath || "/workspace/poster"; }
    export function useSearchParams(){ return new URLSearchParams(window.location.search); }
    export function useRouter(){ return { push(href){ globalThis.__historyPushed = href; }, replace(){}, prefetch(){} }; }
  `),
  "./WorkspaceSelection": dataModule(`
    export function useWorkspaceSelection(){ return globalThis.React.useState(globalThis.__historySelected || null); }
  `),
  "./AgentChat": dataModule(`export function AgentChat(){ return null; }`),
  "./library-task-history": dataModule(`export function LibraryTaskHistoryWorkspace(){return null;}`),
  "./WorkspaceSession": dataModule(
    `export function WorkspaceSessionProvider({ children }){ return children; }`,
  ),
  "./HistoryRowActions": dataModule(`
    export function HistoryRowMenu(p){return globalThis.React.createElement('div',null,
      globalThis.React.createElement('button',{onClick:p.onDelete},'test-delete'),
      globalThis.React.createElement('button',{onClick:p.onRename},'test-rename'));}
    export function MoveTaskProjectDialog(){return null;}
  `),
  "../ui": dataModule(`export function ConfirmDialog(p){return globalThis.React.createElement('button',{onClick:p.onConfirm},'test-confirm');} export function SkeletonCard(){return null;} export function SkeletonLine(){return null;}`),
  // HistoryDetail 现在会为 mode=shell 的任务渲染 ShellTaskView，其 cloud-computer-api
  // 依赖还从这里取 accessToken；bench 补上这个导出，历史列表本身不碰它。
  "../lib/auth/client": dataModule(`
    export function browserClient(){ return null; }
    export async function accessToken(){ return null; }
  `),
  "../lib/agent": dataModule(`
    export async function listTasks(){const r=await fetch('/tasks');return r.json();}
    export async function deleteTask(){throw new Error('Network error');}
    export async function getTask(){return {ok:false,status:404};}
    export function taskCostYuan(){return 0;}
  `),
  "../lib/app-session": dataModule(`
    export function isAppSessionApiUnavailableStatus(s){return s===404;}
    export async function listAppSessions(){const r=await fetch('/sessions');return r.json();}
    export async function getAppSession(){return {ok:false,status:404};}
    export async function deleteAppSession(){return {ok:false,error:"Network error: can't reach the AI gateway."};}
    export async function updateAppSessionMetadata(){return {ok:false,error:"加载超时，请重试。"};}
  `),
};
const historyUrl = await compileModule("src/shell/HistoryMasterDetail.tsx", historyStubs);
const { HistoryPage } = await import(await compileModule("src/shell/HistoryPage.tsx", historyStubs));

const { HistorySubNav } = await import(historyUrl);
const { HomeAssetCards } = await import(await compileModule("src/shell/HomeAssetCards.tsx", {
  "../i18n/ui/useUI": dataModule(`export function useUI(){return value=>value;}`),
  "./HomePromptModals": dataModule(`export function AddPromptModal(){return null;} export function PromptCardModal(){return null;}`),
}));
const { createRoot } = await import("react-dom/client");
async function mount(Component, props){
  const container=document.createElement('div');document.body.append(container);
  const root=createRoot(container);
  await act(async()=>root.render(React.createElement(Component,props)));
  return {container,root,async dispose(){await act(async()=>root.unmount());container.remove();}};
}
async function click(node){assert.ok(node);await act(async()=>node.click());}
const text=(panel)=>panel.container.textContent;
const quiet=(panel)=>assert.doesNotMatch(text(panel),/Network error|网络错误|加载超时|无法读取本机任务/);
const originalError=console.error;
let errors=[];
test.beforeEach(()=>{errors=[];console.error=(...args)=>errors.push(args.map(String).join(' '));});
test.afterEach(()=>{console.error=originalError;assert.deepEqual(errors,[]);});

test('real home tabs load, click Image, and arrow through exactly one labelled panel',async()=>{
  const props={sections:[],loading:true,siteId:'oceanleo',onPick(){},onOpenAsset(){}};
  const panel=await mount(HomeAssetCards,props);
  try{
    assert.match(text(panel),/正在加载/);
    const sections=['video','image','website','essay'].map(id=>({id,items:[{ref:{kind:'platform',id},title:id+' card',preview:{}}]}));
    await act(async()=>panel.root.render(React.createElement(HomeAssetCards,{...props,sections,loading:false})));
    const tabs=[...panel.container.querySelectorAll('[role="tab"]')];
    const check=(id)=>{
      assert.equal(panel.container.querySelectorAll('[role="tabpanel"]').length,1);
      const content=panel.container.querySelector('[role="tabpanel"]');
      assert.equal(content.dataset.homeAssetSection,id);
      const tab=tabs.find(t=>t.getAttribute('aria-selected')==='true');
      assert.equal(content.getAttribute('aria-labelledby'),tab.id);
      assert.match(content.textContent,new RegExp(id+' card'));
      assert.equal(panel.container.querySelectorAll('[data-home-asset-ref]').length,1);
    };
    check('video');await click(tabs[1]);check('image');
    await act(async()=>tabs[1].dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));
    check('website');assert.equal(document.activeElement,tabs[2]);
    await act(async()=>tabs[2].dispatchEvent(new window.KeyboardEvent('keydown',{key:'End',bubbles:true})));
    check('essay');
    await act(async()=>tabs[3].dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));
    check('video');
    await act(async()=>tabs[0].dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true})));
    check('essay');
  }finally{await panel.dispose();}
});

test('real My Tasks quietly retries rejection, deadline, success; later failures keep rows and delete is friendly',async()=>{
  const savedFetch=globalThis.fetch,savedTimeout=globalThis.setTimeout,savedWindowTimeout=window.setTimeout;
  let phase='network';const retry=[];
  globalThis.setTimeout=(fn,ms,...args)=>savedTimeout(fn,ms===12000?20:ms,...args);
  window.setTimeout=(fn,ms,...args)=>{
    if(ms>=2000&&ms<=60000){retry.push({fn,ms});return 987654;}
    return savedWindowTimeout.call(window,fn,ms,...args);
  };
  globalThis.fetch=async(url)=>{
    if(phase==='network')throw new Error("Network error: can't reach the AI gateway.");
    if(phase==='timeout')return new Promise(()=>{});
    return new Response(JSON.stringify({ok:true,data:{items:url==='/tasks'?[]:[session('quiet-task','Recovered task')]}}));
  };
  let panel;
  try{
    panel=await mount(HistorySubNav,{siteId:'quiet-network'});
    quiet(panel);assert.match(text(panel),/加载…/);assert.equal(retry[0].ms,2000);
    phase='timeout';await act(async()=>{retry.shift().fn();await new Promise(r=>savedTimeout(r,40));});
    quiet(panel);assert.match(text(panel),/加载…/);assert.equal(retry[0].ms,4000);
    phase='success';await act(async()=>{retry.shift().fn();await new Promise(r=>savedTimeout(r,5));});
    quiet(panel);assert.match(text(panel),/Recovered task/);assert.doesNotMatch(text(panel),/加载…/);
    phase='network';await act(async()=>window.dispatchEvent(new Event('focus')));
    quiet(panel);assert.match(text(panel),/Recovered task/);
    await act(async()=>window.dispatchEvent(new Event('online')));
    quiet(panel);assert.match(text(panel),/Recovered task/);
    await click([...panel.container.querySelectorAll('button')].find(n=>n.textContent==='test-delete'));
    await click([...panel.container.querySelectorAll('button')].find(n=>n.textContent==='test-confirm'));
    quiet(panel);assert.match(text(panel),/删除失败，请重试。/);assert.match(text(panel),/Recovered task/);
    await click([...panel.container.querySelectorAll('button')].find(n=>n.textContent==='test-rename'));
    const input=panel.container.querySelector('form input');assert.ok(input);
    await act(async()=>{
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'Changed title');
      input.dispatchEvent(new Event('input',{bubbles:true}));
    });
    await act(async()=>panel.container.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    quiet(panel);assert.match(text(panel),/操作失败，请稍后重试。/);assert.match(text(panel),/Recovered task/);
  }finally{if(panel)await panel.dispose();globalThis.fetch=savedFetch;globalThis.setTimeout=savedTimeout;window.setTimeout=savedWindowTimeout;}
});

test('local My Tasks keeps loading on read failure, recovers online and preserves rows',async()=>{
  const saved=globalThis.__OCEANLEO_CLIENT_HOST_CONFIG__, savedFetch=globalThis.fetch;
  let failed=true;
  globalThis.__OCEANLEO_CLIENT_HOST_CONFIG__={family:'com',portalOrigin:'https://oceanleo.com',gatewayOrigin:'https://api.dev.oceanleo.com',identityOrigin:'https://auth.oceanleo.com',platform:'desktop',localWorkspace:{listTasks:async()=>{
    if(failed)throw new Error('local read failure');
    return [{id:'local-quiet',title:'Local recovered',stage:'queued',path:'',summary:'',failure:'',canCancel:false}];
  }}};
  globalThis.fetch=async()=>new Response(JSON.stringify({ok:true,data:{items:[]}}));
  const panel=await mount(HistorySubNav,{siteId:'oceanleo'});
  try{
    quiet(panel);assert.match(text(panel),/加载…/);assert.doesNotMatch(text(panel),/还没有任务/);
    failed=false;await act(async()=>window.dispatchEvent(new Event('online')));
    quiet(panel);assert.match(text(panel),/Local recovered/);assert.doesNotMatch(text(panel),/加载…/);
    failed=true;await act(async()=>window.dispatchEvent(new Event('focus')));
    quiet(panel);assert.match(text(panel),/Local recovered/);assert.doesNotMatch(text(panel),/加载…/);
  }finally{await panel.dispose();globalThis.__OCEANLEO_CLIENT_HOST_CONFIG__=saved;globalThis.fetch=savedFetch;}
});

test('signed-out My Tasks retains its sign-in message',async()=>{
  const savedFetch=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({ok:false,status:401,error:'Unauthorized'}));
  const panel=await mount(HistorySubNav,{siteId:'signed-out-quiet'});
  try{assert.match(text(panel),/登录后即可查看我的任务/);quiet(panel);}
  finally{await panel.dispose();globalThis.fetch=savedFetch;}
});

test('real HistoryPage retries quietly, keeps recovered rows and reports a friendly failed delete',async()=>{
  const savedFetch=globalThis.fetch;let failed=true;
  globalThis.fetch=async()=>{
    if(failed)throw new Error('Network error');
    return new Response(JSON.stringify({ok:true,data:{items:[{id:'page-task',title:'Page recovered',status:'completed',created_at:'2026-11-10T00:00:00Z'}]}}));
  };
  const panel=await mount(HistoryPage,{siteId:'quiet-page',onOpen(){}});
  try{
    quiet(panel);assert.ok(panel.container.querySelector('.animate-pulse'));
    failed=false;await act(async()=>window.dispatchEvent(new Event('online')));
    assert.match(text(panel),/Page recovered/);assert.equal(panel.container.querySelector('.animate-pulse'),null);
    failed=true;await act(async()=>window.dispatchEvent(new Event('focus')));
    quiet(panel);assert.match(text(panel),/Page recovered/);
    await click(panel.container.querySelector('[aria-label="删除"]'));
    await click([...panel.container.querySelectorAll('button')].find(n=>n.textContent==='test-confirm'));
    quiet(panel);assert.match(text(panel),/删除失败，请重试。/);assert.match(text(panel),/Page recovered/);
  }finally{await panel.dispose();globalThis.fetch=savedFetch;}
});
