import assert from "node:assert/strict";
import test from "node:test";
import "./helpers/w1-jsdom-window.mjs";
const { default: React, act } = await import("react");
const { createRoot } = await import("react-dom/client");
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__fuSearch = { calls: [] };
const targets = await import(await compileModule("src/shell/forward/forward-targets.ts", {
  "../../lib/im/client": dataModule(`export class ImApiError extends Error {} export async function imFetch(path){
    globalThis.__fuSearch.calls.push(["im",path]);
    if(path==="/v1/projects")return {items:Array.from({length:15},(_,i)=>({id:"p"+i,name:"Project "+i}))};
    return {sessions:[{id:path.split("/")[3]+"s",title:"Older session",can_write:true}]};
  }`),
  "../../lib/agent": dataModule('export async function listTasks(...args){globalThis.__fuSearch.calls.push(["tasks",...args]);return {ok:true,data:{items:[{id:"old-task",title:"Older task",mode:"agent"}]}}}'),
  "../../lib/app-session": dataModule('export async function listAppSessions(options){globalThis.__fuSearch.calls.push(["apps",options]);return {ok:true,data:{items:[]}}}'),
  "../../lib/im/inbox-api": dataModule('export async function fetchConversations(filter,cursor,q){globalThis.__fuSearch.calls.push(["chats",filter,cursor,q]);const n=cursor?Number(cursor):0;return {items:[{id:"chat"+n,title:"Older chat",kind:"group"}],next_cursor:n<3?String(n+1):null}}'),
}));

test("target reads send the query to both task reads and every chat cursor page", async () => {
  globalThis.__fuSearch.calls = [];
  assert.ok((await targets.loadForwardTasks("Older" )).some(row => row.taskId === "old-task"));
  const chats = await targets.loadForwardChats("source", "Older");
  const calls = globalThis.__fuSearch.calls;
  assert.equal(calls.find(c => c[0] === "tasks").at(-1).q, "Older");
  assert.equal(calls.find(c => c[0] === "apps")[1].q, "Older");
  assert.equal(calls.filter(c => c[0] === "chats").length, 4);
  assert.ok(calls.filter(c => c[0] === "chats").every(c => c[3] === "Older"));
  assert.ok(chats.some(row => row.id === "chat3"), "beyond the old two-page cap");
  assert.ok(chats.some(row => row.id === "p14s"), "sessions beyond the old twelve-project cap");
});

const api = await import(await compileModule("src/lib/im/inbox-api.ts", { "./client": dataModule('export async function imFetch(path){globalThis.__fuSearch.path=path;return {items:[]}}') }));
test("conversation query reaches the wire with encoding and cursor preserved", async () => {
  await api.fetchConversations("all", "next", "  Ann & Bo  ");
  const params = new URL(globalThis.__fuSearch.path, "https://example.test").searchParams;
  assert.equal(params.get("q"), "Ann & Bo"); assert.equal(params.get("cursor"), "next");
});

const pickerTargets = dataModule(`
  export async function loadForwardTasks(q){globalThis.__fuSearch.calls.push(["picker-tasks",q]);return q?[{taskId:"old",title:q+" remote task"}]:[]}
  export async function loadForwardChats(id,q){globalThis.__fuSearch.calls.push(["picker-chats",q]);return q?[{id:"old-chat",title:q+" remote chat",kind:"chat"}]:[]}
  export function forwardClientId(){return "cid"}export function forwardFailureOf(){return "failed"}
  export async function createChatBundle(){}export async function postQuoteCard(){}
`);
const { ForwardPicker } = await import(await compileModule("src/shell/forward/index.tsx", {
  "./forward-targets": pickerTargets,
  "../../i18n/ui/useUI": dataModule('export function useUI(){return text=>text}'),
  "../../ui/Toast": dataModule('export function useToast(){return {success(){}}}'),
}));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test("typing debounces server search and finds targets absent from the initial lists", async () => {
  globalThis.__fuSearch.calls = [];
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const type = async value => { await act(async () => {
    const input = host.querySelector('input');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set.call(input,value);
    input.dispatchEvent(new window.Event("input",{bubbles:true}));
  }); };
  try {
    await act(async () => { root.render(React.createElement(ForwardPicker,{source:{conversationId:"src",title:""},messageIds:["m"],onDone(){},onCancel(){}})); });
    await act(async () => wait(10));
    globalThis.__fuSearch.calls = [];
    await type("Ol"); await act(async () => wait(80)); await type("Older");
    await act(async () => wait(100));
    assert.equal(globalThis.__fuSearch.calls.length,0,"no request for each keystroke");
    await act(async () => wait(180));
    assert.deepEqual(globalThis.__fuSearch.calls,[["picker-tasks","Older"],["picker-chats","Older"]]);
    assert.match(host.textContent,/Older remote task/); assert.match(host.textContent,/Older remote chat/);
  } finally { await act(async () => root.unmount()); host.remove(); }
});
