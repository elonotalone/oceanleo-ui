import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import "./helpers/w1-jsdom-window.mjs";
import { TaskAccessMock, ownerAccess } from "./helpers/task-access-mock.ts";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
for (const key of ["HTMLButtonElement", "HTMLInputElement", "KeyboardEvent", "CustomEvent", "Event"]) globalThis[key] = window[key];
const clientUrl = await compileModule("src/shell/access/task-access-client.ts", {
  "../../lib/auth/client": dataModule("export async function accessToken(){return 't';}"),
  "../../lib/auth/config": dataModule("export const GATEWAY_BASE='https://gateway.test';"),
});
const authDialogStub = dataModule(`import React from ${JSON.stringify(import.meta.resolve("react"))}; export function AuthDialog(p){return React.createElement("div",{role:"dialog","aria-label":"sign in"},React.createElement("button",{onClick:p.onSuccess},"signed in"));}`);
const overrides = {
  "../../pages/AuthDialog": authDialogStub,
  "../../i18n/ui/useUI": dataModule("export function useUI(){return (text, params={}) => text.replace(/\\{(\\w+)\\}/g,(_,k)=>params[k] ?? k);}"),
  "../access/task-access-client": clientUrl,
};
const { TaskSharePanel } = await import(await compileModule("src/shell/share/TaskSharePanel.tsx", overrides));
const { TaskAccessComposer } = await import(await compileModule("src/shell/access/TaskAccessComposer.tsx", { ...overrides, "./task-access-client": clientUrl }));

async function mount(component, props) {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(component, props)));
  return { host, async close() { await act(async () => root.unmount()); host.remove(); } };
}
async function click(node) { assert.ok(node, "button exists"); await act(async () => { node.click(); await new Promise(resolve => setTimeout(resolve, 0)); }); }
const button = text => [...document.querySelectorAll("[data-access-popover] button")].find(node => node.textContent === text) ?? [...document.querySelectorAll("button:not([data-share-entry])")].find(node => node.textContent === text);
const shareState = () => ({ active: false, selectable: [{ id: 1 }], selectedCount: 1, selectedIds: new Set([1]), allSelected: true, busy: null, notice: null,
  enter() {}, exit() {}, toggleAll() {}, copyText() {}, generateImage() {}, generateDocument() {} });

test("actions panel publishes only when owner enters Share, copies the task URL, and has a back page", async () => {
  const client = new TaskAccessMock();
  const copied = [];
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { async writeText(value) { copied.push(value); } } });
  const view = await mount(TaskSharePanel, { taskId: "t", taskUrl: "https://oceanleo.test/tasks/t", access: client.access, share: shareState(), client });
  try {
    await click(view.host.querySelector("[data-share-entry]"));
    assert.deepEqual([...document.querySelectorAll("[data-task-share-actions] > button")].map(node => node.textContent), ["分享", "复制文本", "生成长图", "生成文档", "清除选择"]);
    assert.equal(client.calls.length, 0, "opening the actions panel leaves task private");
    await click(button("分享"));
    assert.equal(client.calls.filter(call => call.action === "setAccess").length, 1);
    assert.equal(client.access.general_access, "public_view");
    assert.ok(document.querySelector("[data-task-share-members]"));
    await click(button("复制链接"));
    assert.equal(copied.at(-1), "https://oceanleo.test/tasks/t");
    await click(document.querySelector('[aria-label="返回"]'));
    await click(button("分享"));
    assert.equal(client.calls.filter(call => call.action === "setAccess").length, 1, "returning to members never republishes");
  } finally { await view.close(); }
});

test("failed first-publication stays private, exposes retry, and rolls back general access on errors", async () => {
  const client = new TaskAccessMock(); client.fail = "setAccess";
  const view = await mount(TaskSharePanel, { taskId: "t", taskUrl: "/tasks/t", access: client.access, share: shareState(), client });
  try {
    await click(view.host.querySelector("[data-share-entry]")); await click(button("分享"));
    assert.equal(client.access.general_access, "private"); assert.ok(document.querySelector('[role="alert"]'));
    client.fail = null; await click(button("重试"));
    const select = document.querySelector("[data-task-share-members] select");
    assert.equal(select.value, "public_view"); client.fail = "setAccess";
    await act(async () => { select.value = "restricted"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    assert.equal(select.value, "public_view");
  } finally { await view.close(); }
});

test("read-only visitor never receives Share management entry", async () => {
  const client = new TaskAccessMock();
  const view = await mount(TaskSharePanel, { taskId: "t", taskUrl: "/tasks/t", access: { ...client.access, state: "public", role: "view", can_manage: false }, share: shareState(), client });
  try { await click(view.host.querySelector("[data-share-entry]")); assert.equal(button("分享"), undefined); assert.equal(client.calls.length, 0); }
  finally { await view.close(); }
});

test("view-only, removed and anonymous public visitors can continue; anonymous action requests sign-in", async () => {
  for (const state of ["member", "removed", "public"]) {
    const client = new TaskAccessMock(); let forked = ""; let signIns = 0;
    const guest = state === "public";
    const access = { ...ownerAccess(), state, role: "view", can_send: false, can_manage: false, can_fork: !guest };
    const view = await mount(TaskAccessComposer, { taskId: "t", access, signedIn: !guest, client, onRefresh: async () => {}, onSignIn: () => signIns++, onFork: id => { forked = id; } });
    try {
      await click(button("作为我的任务继续"));
      assert.equal(guest ? signIns : forked, guest ? 1 : "forked-task");
      assert.equal(client.calls.filter(call => call.action === "fork").length, guest ? 0 : 1);
    } finally { await view.close(); }
  }
});

test("narrow Share is a top sheet whose height stops before the composer; Escape restores focus", async () => {
  const width = window.innerWidth;
  Object.defineProperty(window,"innerWidth",{configurable:true,value:390});
  const footer = document.createElement("div"); footer.setAttribute("data-agent-chat-footer","");
  footer.getBoundingClientRect = () => ({top:300,bottom:700,left:0,right:390,width:390,height:400}); document.body.append(footer);
  const client = new TaskAccessMock();
  const view = await mount(TaskSharePanel,{taskId:"t",taskUrl:"/tasks/t",access:client.access,share:shareState(),client});
  try {
    const entry = view.host.querySelector("[data-share-entry]");
    entry.getBoundingClientRect = () => ({top:12,bottom:48,left:330,right:380,width:50,height:36});
    await click(entry);
    const panel = document.querySelector('[data-access-popover="sheet"]');
    assert.ok(panel);
    assert.ok(parseFloat(panel.style.maxHeight) <= 244, "panel ends before the footer begins");
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true})));
    assert.equal(entry.getAttribute("aria-expanded"),"false");
    assert.equal(document.activeElement,entry);
  } finally { await view.close(); footer.remove(); Object.defineProperty(window,"innerWidth",{configurable:true,value:width}); }
});


test("anonymous Continue opens the shared sign-in dialog in place and refreshes after sign-in", async () => {
  let refreshed=0;
  const access={...ownerAccess(),state:"public",role:"view",can_send:false,can_manage:false,can_fork:false};
  const view=await mount(TaskAccessComposer,{taskId:"t",access,signedIn:false,onRefresh:async()=>{refreshed++;}});
  try {
    await click(button("作为我的任务继续"));
    for (let attempt=0;attempt<50 && !document.querySelector('[role="dialog"][aria-label="sign in"]');attempt++) {
      await act(async()=>new Promise(resolve=>setTimeout(resolve,10)));
    }
    assert.ok(document.querySelector('[role="dialog"][aria-label="sign in"]'));
    await click(button("signed in"));
    assert.equal(refreshed,1);
    assert.equal(document.querySelector('[aria-label="sign in"]'),null);
  } finally {await view.close();}
});

test("accepting an invitation refreshes My Tasks immediately",async()=>{
 const client=new TaskAccessMock();client.access={...ownerAccess(),state:"invited",role:"view",can_send:false,can_manage:false,invite_role:"view"};
 let changes=0;const changed=()=>{changes++;};window.addEventListener("oceanleo:history-changed",changed);
 const view=await mount(TaskAccessComposer,{taskId:"t",access:client.access,signedIn:true,client,onRefresh:async()=>{}});
 try {await click(button("接受邀请"));assert.equal(changes,1);}
 finally {await view.close();window.removeEventListener("oceanleo:history-changed",changed);}
});
