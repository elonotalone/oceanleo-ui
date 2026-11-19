import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import "./helpers/w1-jsdom-window.mjs";
import { TaskAccessMock, ownerAccess } from "./helpers/task-access-mock.ts";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = () => {};
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
const { TaskActionsMenu } = await import(await compileModule("src/shell/TaskActionsMenu.tsx", {
  "../i18n/ui/useUI": overrides["../../i18n/ui/useUI"],
  "../contracts/domain-family": dataModule('export function runtimePageOrigin(){return "https://oceanleo.test";} export function sharedCookieDomainFor(){return undefined;}'),
}));
const { TaskSharePanel } = await import(await compileModule("src/shell/share/TaskSharePanel.tsx", overrides));
const { TaskAccessComposer } = await import(await compileModule("src/shell/access/TaskAccessComposer.tsx", { ...overrides, "./task-access-client": clientUrl }));

async function mount(component, props) {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(component, props)));
  return { host, async close() { await act(async () => root.unmount()); host.remove(); } };
}
async function click(node) { assert.ok(node, "button exists"); await act(async () => { node.click(); await new Promise(resolve => setTimeout(resolve, 0)); }); }
const button = text => [...document.querySelectorAll("[data-access-popover] button")].find(node => (node.textContent === text || node.getAttribute("aria-label") === text)) ?? [...document.querySelectorAll("button:not([data-share-entry])")].find(node => (node.textContent === text || node.getAttribute("aria-label") === text));
const shareState = () => ({ active: false, selectable: [{ id: 1 }], selectedCount: 1, selectedIds: new Set([1]), allSelected: true, busy: null, notice: null,
  enter() {}, exit() {}, toggleAll() {}, snapshotLink: null, async loadSnapshot() {}, async setSnapshotEnabled() {}, copyText() {}, generateImage() {}, generateDocument() {} });

test("two menu entries open separate pages without publishing the live task", async () => {
  const client = new TaskAccessMock();
  const copied = [];
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { async writeText(value) { copied.push(value); } } });
  const view = await mount(TaskSharePanel, { taskId: "t", taskUrl: "https://oceanleo.test/tasks/t", access: client.access, share: shareState(), client });
  try {
    await click(view.host.querySelector("[data-share-entry]"));
    assert.deepEqual([...document.querySelectorAll("[data-task-share-actions] > button")].map(node => node.textContent), ["分享链接", "共同协作", "复制文本", "生成长图", "生成文档", "取消全选"]);
    assert.equal(client.calls.length, 0);
    await click(button("共同协作"));
    assert.deepEqual(client.calls.map(c => c.action), ["members"]);
    assert.equal(document.querySelector('[data-access-popover]').style.width, "288px");
    assert.ok(document.querySelector('input[type="email"]'));
    assert.match(document.querySelector('[data-task-share-page]').textContent, /有权访问的人/);
    assert.equal(document.querySelector("select"), null);
    assert.equal(document.querySelector('[aria-haspopup="menu"][aria-label*="权限"]'), null);
    await click(document.querySelector('button[aria-label="协作规则"]'));
    assert.match(document.querySelector('[data-task-collaboration-rules]').textContent, /费用由所有者承担/);
    await click(button("复制任务链接"));
    assert.deepEqual(copied, ["https://oceanleo.test/tasks/t"]);
    await click(button("返回"));
    await click(button("分享链接"));
    assert.equal(document.querySelector('[role="switch"]').checked, false);
    assert.equal(button("复制链接").disabled, true);
    assert.equal(client.access.general_access, "private");
  } finally { await view.close(); }
});

test("snapshot switch creates, copies and revokes only the snapshot; existing shares load without writes", async () => {
  const client = new TaskAccessMock(), calls = [], copied = [];
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { async writeText(value) { copied.push(value); } } });
  function SnapshotPanel() {
    const [snapshotLink, setLink] = React.useState(null);
    return React.createElement(TaskSharePanel, {taskId:"t", taskUrl:"/tasks/t", access:client.access, client, share:{...shareState(), snapshotLink,
      async loadSnapshot(){calls.push("GET");}, async setSnapshotEnabled(enabled){calls.push(enabled ? "POST" : "DELETE"); setLink(enabled ? {shareId:"abc123",url:"https://oceanleo.test/share/abc123"} : null);}}});
  }
  const view = await mount(SnapshotPanel, {});
  try {
    await click(view.host.querySelector('[data-share-entry]')); await click(button("分享链接"));
    assert.deepEqual(calls,["GET"]);
    await click(document.querySelector('[role="switch"]'));
    assert.equal(button("复制链接").disabled,false);
    await click(button("复制链接"));
    assert.deepEqual(copied,["https://oceanleo.test/share/abc123"]);
    await click(document.querySelector('[role="switch"]'));
    assert.equal(button("复制链接").disabled,true);
    assert.deepEqual(calls,["GET","POST","DELETE"]);
    assert.equal(client.calls.length,0);
  } finally {await view.close();}
});

test("a failed snapshot read keeps loading and recovers automatically without publishing", async () => {
  const client = new TaskAccessMock();
  let reads=0;
  const share = {...shareState(), async loadSnapshot(){reads++;throw Error("offline");}};
  const view = await mount(TaskSharePanel,{taskId:"t",taskUrl:"/tasks/t",access:client.access,share,client});
  try {
    await click(view.host.querySelector('[data-share-entry]')); await click(button("分享链接"));
    assert.ok(document.querySelector('[data-auto-recovery="temporary"][aria-busy="true"]'));
    assert.equal(button("重试"),undefined);
    await act(async()=>window.dispatchEvent(new window.Event("online")));
    assert.equal(reads,2);
    assert.equal(document.querySelector('[role="switch"]').disabled,true);
    assert.equal(button("复制链接").disabled,true);
    assert.equal(client.calls.length,0);
  } finally {await view.close();}
});

test("only a message select control is exempt from outside dismissal; blank transcript exits selection", async () => {
  const client = new TaskAccessMock(); let exits=0, toggles=0;
  const stream = document.createElement("div"); stream.setAttribute("data-agent-stream","");
  const select = document.createElement("button"); select.setAttribute("data-share-select-control",""); select.onclick=()=>toggles++;
  const blank = document.createElement("div"); stream.append(select,blank); document.body.append(stream);
  const view = await mount(TaskSharePanel,{taskId:"t",taskUrl:"/tasks/t",access:client.access,share:{...shareState(),exit(){exits++;}},client});
  const pointer = async node => act(async()=>node.dispatchEvent(new Event("pointerdown",{bubbles:true})));
  try {
    await click(view.host.querySelector('[data-share-entry]'));
    await pointer(select); await click(select);
    assert.equal(toggles,1); assert.equal(exits,0); assert.ok(document.querySelector('[data-access-popover]'));
    await pointer(blank);
    assert.equal(exits,1);
    assert.equal(view.host.querySelector('[data-share-entry]').getAttribute("aria-expanded"),"false");
    assert.equal(document.querySelector('[data-access-popover]').hidden,true);
  } finally {await view.close();stream.remove();}
});

test("collaborators can read participant names and rules but have no management or snapshot controls", async () => {
  const client = new TaskAccessMock();
  client.rows=[{id:"other",name:"Other",role:"collaborate",status:"accepted"}];
  const view = await mount(TaskSharePanel,{taskId:"t",taskUrl:"/tasks/t",access:{...client.access,role:"collaborate",state:"member",can_manage:false},share:shareState(),client});
  try {
    await click(view.host.querySelector('[data-share-entry]'));
    assert.equal(button("分享链接"),undefined);
    await click(button("共同协作"));
    assert.match(document.querySelector('[data-member-panel]').textContent,/Other/);
    assert.equal(document.querySelector('input[type="email"]'),null);
    assert.equal(document.querySelector('button[aria-label="移除 Other"]'),null);
    assert.ok(document.querySelector('button[aria-label="协作规则"]'));
  } finally {await view.close();}
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


test("Share and task actions use identical container, row, icon and separator classes", async () => {
  const client = new TaskAccessMock();
  const menu = await mount(TaskActionsMenu, { open: true, onOpenChange() {}, href: "/tasks/t" });
  const menuElement = document.querySelector('[role="menu"]');
  const expected = {
    container: menuElement.className,
    row: menuElement.querySelector('[role="menuitem"]').className,
    icon: menuElement.querySelector('[role="menuitem"] > [aria-hidden="true"]').className,
    separator: menuElement.querySelector('[role="separator"]').className,
  };
  await menu.close();
  const view = await mount(TaskSharePanel, { taskId: "t", taskUrl: "/tasks/t", access: client.access, share: shareState(), client });
  try {
    const entry = view.host.querySelector('[data-share-entry]');
    assert.equal(entry.textContent, "", "Share has no visible label");
    assert.equal(entry.getAttribute('aria-label'), "分享");
    assert.equal(entry.querySelector('path').getAttribute('d'), "M4 12v-1a7 7 0 0 1 7-7h8m0 0-4-4m4 4-4 4");
    await click(entry);
    const panel = document.querySelector('[data-access-popover]');
    assert.equal(panel.id, entry.getAttribute('aria-controls'));
    assert.equal(panel.className, expected.container);
    for (const row of panel.querySelectorAll('[role="menuitem"]')) {
      assert.equal(row.className, expected.row);
      assert.equal(row.querySelector('[aria-hidden="true"]').className, expected.icon);
      assert.ok(row.querySelector('svg'));
    }
    for (const separator of panel.querySelectorAll('[role="separator"]')) assert.equal(separator.className, expected.separator);
    assert.match(panel.textContent, /已选 1 条/);
    assert.doesNotMatch(panel.textContent, /清除选择/);
    await click(button("共同协作"));
    const memberPage = document.querySelector('[data-access-popover]');
    assert.equal(memberPage.className, expected.container);
    assert.equal(memberPage.id, panel.id, "members open inside the same popover");
    for (const node of [memberPage, ...memberPage.querySelectorAll('[class]')]) {
      assert.doesNotMatch(node.getAttribute("class") || "", /var\(--(?:background|foreground|border)\)/);
    }
  } finally { await view.close(); }
});

test("empty selections disable exports while collaborators can copy their task link", async () => {
  const client = new TaskAccessMock();
  const view = await mount(TaskSharePanel,{taskId:"t",taskUrl:"/tasks/t",access:{...client.access,role:"collaborate",state:"member",can_manage:false},share:{...shareState(),selectedCount:0},client});
  try {
    await click(view.host.querySelector('[data-share-entry]'));
    for (const text of ["复制文本","生成长图","生成文档"]) assert.equal(button(text).disabled,true);
    await click(button("共同协作"));
    assert.equal(button("复制任务链接").disabled,false);
  } finally {await view.close();}
});
