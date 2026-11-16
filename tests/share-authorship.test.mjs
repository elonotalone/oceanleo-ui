import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import "./helpers/w1-jsdom-window.mjs";
import { reduceRows } from "../src/acp/reduce.ts";
import { viewBlocks } from "../src/acp/messages.ts";
import { canDeleteHistoryEntry, historyEntrySharedBy, historySharedByName, mergeHistoryEntries } from "../src/shell/history-model.ts";

globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const tt = dataModule(`export function useUI(){return (value,vars)=>value.replace(/\\{(\\w+)\\}/g,(_,key)=>String(vars?.[key]??"{"+key+"}"));}`);
const { AgentTranscriptBubble } = await import(await compileModule("src/shell/AgentTranscriptBubble.tsx", {
  "../i18n/ui/useUI": tt,
  "./Markdown": dataModule(`export const Markdown=({children})=>children; export const TypewriterMarkdown=({children})=>children; export const HighlightedText=({text})=>text;`),
  "next/link": dataModule(`export default function Link(p){return globalThis.React.createElement("a",p,p.children);}`),
}));
const { AcpTranscript } = await import(await compileModule("src/acp/AcpTranscript.tsx", {
  "../i18n/ui/useUI": tt,
  "./Markdown": dataModule(`export const Markdown=({children})=>children; export const TypewriterMarkdown=({children})=>children; export const HighlightedText=({text})=>text;`),
  "next/link": dataModule(`export default function Link(p){return globalThis.React.createElement("a",p,p.children);}`),
}));
const author = { user_id: "viewer-id", name: "Alex", initial: "A" };
const owner = { name: "River", initial: "R" };
const message = { id: 11, role: "user", kind: "text", content: "Continue this task", author };
const markup = (props) => renderToStaticMarkup(React.createElement(AgentTranscriptBubble, { message, ...props }));
const prompt = (id, displayAuthor) => ({ id, direction: "client", node_seq: null, received_at: "2026-11-16T10:00:00Z", author: displayAuthor,
  raw: JSON.stringify({jsonrpc:"2.0",id,method:"session/prompt",params:{sessionId:"s1",prompt:[{type:"text",text:"Continue"}]}}) });
const labels = { gap: String, oversize: String, exit: String, stopReason: String, cancelled: "Stopped", permissionPrompt: "Confirm" };

test("single-participant bubbles stay unlabelled; shared user messages show sending account name and initial", () => {
  assert.doesNotMatch(markup({}), /data-message-author/);
  const shared = markup({ showAuthors: true });
  assert.match(shared, /data-message-author/);
  assert.match(shared, />A<.*>Alex</);
  assert.doesNotMatch(markup({ showAuthors: true, message: { ...message, role: "assistant" } }), /data-message-author/);
});

test("legacy shared user messages use owner identity, while known sender IDs without names do not impersonate owner", () => {
  assert.match(markup({ showAuthors: true, ownerAuthor: owner, message: { ...message, author: undefined } }), /River/);
  const unnamed = markup({ showAuthors: true, ownerAuthor: owner, message: { ...message, author: {user_id:"other"} } });
  assert.match(unnamed, /参与者/);
  assert.doesNotMatch(unnamed, /River/);
});

test("ACP prompt rows retain authors through reducer and transcript view model", () => {
  const rows = [prompt(31, owner), prompt(32, author)];
  const view = reduceRows(rows, "claude");
  assert.deepEqual(view.turns[0].author, owner);
  assert.deepEqual(view.turns[1].author, author);
  const users = viewBlocks(view, labels).filter(block => block.type === "bubble" && block.message.role === "user");
  assert.deepEqual(users.map(block => block.message.author), [owner, author]);
  const html = renderToStaticMarkup(React.createElement(AcpTranscript, {rows, program:"claude",showAuthors:true,ownerAuthor:owner}));
  assert.equal((html.match(/data-message-author=/g) || []).length, 2);
  assert.match(html, /River/);
  assert.match(html, /Alex/);
});

test("ACP memoized bubbles update when a task becomes shared and when author display identity changes", async () => {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async()=>root.render(React.createElement(AcpTranscript,{rows:[prompt(1,author)],program:"claude"})));
    assert.equal(host.querySelector("[data-message-author]"),null);
    await act(async()=>root.render(React.createElement(AcpTranscript,{rows:[prompt(1,author)],program:"claude",showAuthors:true})));
    assert.match(host.querySelector("[data-message-author]").textContent,/Alex/);
    await act(async()=>root.render(React.createElement(AcpTranscript,{rows:[prompt(1,{...author,name:"Alexandra"})],program:"claude",showAuthors:true})));
    assert.match(host.querySelector("[data-message-author]").textContent,/Alexandra/);
  } finally { await act(async()=>root.unmount()); host.remove(); }
});

const task = (id, extra={})=>({id,title:id,status:"done",mode:"agent",created_at:"2026-11-16T10:00:00Z",...extra});
test("accepted shared tasks remain in My Tasks when the owner's session is not available",()=>{
  const [entry]=mergeHistoryEntries([], [task("shared",{session_id:"owners-session",shared_by:owner})]);
  assert.equal(entry.id,"shared");
  assert.deepEqual(historyEntrySharedBy(entry),owner);
  assert.equal(historySharedByName(entry),"River");
  assert.equal(canDeleteHistoryEntry(entry),false);
});

test("session-backed shared rows keep owner attribution and hide deletion without duplicating the task",()=>{
  const [entry,...rest]=mergeHistoryEntries([{id:"s",app_id:"agent",site_id:"oceanleo",title:"Shared",status:"active"}], [task("shared",{session_id:"s",shared_by:owner})]);
  assert.equal(entry.kind,"session");
  assert.deepEqual(historyEntrySharedBy(entry),owner);
  assert.equal(canDeleteHistoryEntry(entry),false);
  assert.equal(rest.length,0);
  const own=mergeHistoryEntries([], [task("mine")])[0];
  assert.equal(canDeleteHistoryEntry(own),true);
  assert.equal(historySharedByName({...own,shared_by:"private@example.test"}),"");
});

let token = null;
const requests = [];
globalThis.__authorshipToken = () => token;
globalThis.__authorshipFetch = async(url,init)=>{requests.push({url,init});return new Response(JSON.stringify({task:task("public"),messages:[],artifacts:[]}),{status:200,headers:{"Content-Type":"application/json"}});};
const api = await import(await compileModule("src/lib/agent.ts", {
  "./auth/client":dataModule(`export async function accessToken(){return globalThis.__authorshipToken();} export function cachedAccessToken(){return globalThis.__authorshipToken();} export function getUserId(){return null;}`),
  "./auth/config":dataModule(`export function gatewayBase(){return "https://gateway.test";}`),
  "./shared-get":dataModule(`export async function sharedGatewayFetch(...args){return globalThis.__authorshipFetch(...args);}`),
}));
test("anonymous task details reach gateway access enforcement; writes still reject anonymous locally",async()=>{
  token=null; requests.length=0;
  const read=await api.getTask("public");
  assert.equal(read.ok,true);
  assert.equal(requests.length,1);
  assert.equal(requests[0].init.headers.Authorization,undefined);
  assert.match(requests[0].url,/\/v1\/agent\/tasks\/public$/);
  const write=await api.authed("/v1/agent/tasks/public/stop",{method:"POST"});
  assert.equal(write.status,401);
  assert.equal(requests.length,1);
  token="signed-in";
  await api.getTask("public");
  assert.equal(requests[1].init.headers.Authorization,"Bearer signed-in");
});

const { HistoryPage }=await import(await compileModule("src/shell/HistoryPage.tsx",{
  "../i18n/ui/useUI":tt,
  "../lib/agent":dataModule(`export async function listTasks(){return {ok:true,data:{items:globalThis.__sharingHistoryRows}};} export async function deleteTask(){throw new Error("shared tasks must not be deletable");}`),
  "./AppPageHeader":dataModule(`export const APP_PAGE_FRAME_CLASS=""; export const AppPageHeader=({children})=>children;`),
  "./LibraryLayout":dataModule(`export function LibraryToolbar(){return null;}`),
  "../ui":dataModule(`export function ConfirmDialog(){return null;}`),
}));
test("task rows display shared-by name and hide owner-only deletion",async()=>{
  globalThis.__sharingHistoryRows=[task("shared",{shared_by:owner}),task("mine")];
  const host=document.createElement("div");document.body.append(host);
  const root=createRoot(host);
  try{
    await act(async()=>{root.render(React.createElement(HistoryPage,{onOpen(){}}));await new Promise(resolve=>setTimeout(resolve,0));});
    assert.equal(host.querySelector("[data-task-shared-by]").textContent,"由 River 分享");
    assert.equal(host.querySelectorAll('button[aria-label="删除"]').length,1);
  }finally{await act(async()=>root.unmount());host.remove();}
});
