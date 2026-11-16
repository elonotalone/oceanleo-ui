import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { LOCALES } from "../src/i18n/config.ts";
import { SHARE_ACCESS_COPY_SOURCE, SHARE_ACCESS_MESSAGES } from "../src/i18n/ui/messages/share-access-copy.ts";
import "./helpers/w1-jsdom-window.mjs";

const { createRoot } = await import("react-dom/client");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.React = React;
const uiStub = dataModule('export function useUI(){ return (text, vars) => text.replace(/\\{(\\w+)\\}/g, (_,key) => String(vars?.[key] ?? "{"+key+"}")); }');
const { MemberPanel } = await import(await compileModule("src/shell/access/MemberPanel.tsx", {
  "../../i18n/ui/useUI": uiStub,
  "../anchored-popover": dataModule('export function AnchoredPopover(p){ return p.open ? globalThis.React.createElement("div", {role:p.role, "aria-label":p.ariaLabel, "aria-labelledby":p.ariaLabelledBy,"aria-modal":p.ariaModal}, p.children) : null; }'),
}));
const owner = { name: "Owner Name", initial: "O", email: "owner@example.test" };
const member = { id: "m1", name: "Mira", initial: "M", email: "mira@example.test", role: "view", status: "invited" };
const defer = () => { let resolve, reject; const promise = new Promise((yes,no) => { resolve=yes; reject=no; }); return {promise,resolve,reject}; };
async function render(extra = {}) {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  let props = { owner, members:[member], canManage:true, async onInvite(email,role){ return {...member,id:"m2",email,name:null,role}; }, async onChangeRole(){}, async onRemove(){}, ...extra };
  await act(async () => root.render(React.createElement(MemberPanel,props)));
  return { host, async update(next){ props={...props,...next}; await act(async () => root.render(React.createElement(MemberPanel, props))); }, async close(){await act(async () => root.unmount());host.remove();} };
}
async function click(node) { assert.ok(node,"expected an actionable element"); await act(async () => node.click()); }
const byText = (host, text) => [...host.querySelectorAll("button")].find(node=>node.textContent===text);
const row = (view,id="m1") => view.host.querySelector(`[data-member-id="${id}"]`);
async function email(view,value) {
  const input=view.host.querySelector('input[type="email"]');
  await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set.call(input,value); input.dispatchEvent(new window.Event("input",{bubbles:true})); });
}
async function submit(view) { await act(async () => view.host.querySelector("form").dispatchEvent(new window.Event("submit",{bubbles:true,cancelable:true}))); }

test("every access string is translated in all 17 locales and retains interpolation",()=>{
  const interpolation=text=>[...text.matchAll(/\{\w+\}/g)].map(match=>match[0]).sort();
  for(const locale of LOCALES) for(const source of Object.values(SHARE_ACCESS_COPY_SOURCE)) {
    const translated=SHARE_ACCESS_MESSAGES[locale][source]; assert.ok(translated?.trim(),`${locale}: ${source}`);
    assert.deepEqual(interpolation(translated),interpolation(source),`${locale}: ${source}`);
  }
  assert.match(SHARE_ACCESS_MESSAGES.en[SHARE_ACCESS_COPY_SOURCE.collaborateDescription],/your own computer/);
  assert.match(SHARE_ACCESS_MESSAGES.en[SHARE_ACCESS_COPY_SOURCE.collaborateDescription],/You pay/);
});

test("owner is first, invitation is labelled, removed rows and owner controls stay absent",async()=>{
  const view=await render({members:[member,{...member,id:"old",status:"removed"},{...member,id:"owner",role:"owner"}]});
  try {
    assert.equal(view.host.querySelector("li").getAttribute("data-member-owner"),"");
    assert.match(row(view).textContent,/已邀请/);assert.match(view.host.textContent,/所有者/);
    assert.equal(row(view,"old"),null);assert.equal(row(view,"owner"),null);
    assert.equal(view.host.querySelector('[data-member-owner] button'),null);
    assert.equal(view.host.querySelector("select"),null,"roles use a descriptive menu");
  }finally{await view.close();}
});

test("read-only members see roles and owner name, with no invite or destructive controls or owner email",async()=>{
  const view=await render({canManage:false});
  try{assert.equal(view.host.querySelector("input"),null);assert.equal(view.host.querySelector("button"),null);assert.match(view.host.textContent,/仅查看/);assert.doesNotMatch(view.host.textContent,/owner@example/);}finally{await view.close();}
});

test("invitation defaults to View only, normalizes email and rolls an optimistic row back on failure",async()=>{
  const pending=defer();const calls=[];const view=await render({onInvite:(...args)=>{calls.push(args);return pending.promise;}});
  try{
    await email(view," New@Example.test ");await submit(view);
    assert.deepEqual(calls,[["new@example.test","view"]]);assert.ok(row(view,"pending:new@example.test"));
    assert.equal(view.host.querySelector("input").value,"");assert.equal(view.host.querySelector('button[type="submit"]').disabled,true);
    await act(async()=>pending.reject(Error("private backend detail")));
    assert.equal(row(view,"pending:new@example.test"),null);assert.equal(view.host.querySelector("input").value,"new@example.test");
    assert.match(view.host.querySelector('[role="alert"]').textContent,/未能保存/);assert.doesNotMatch(view.host.textContent,/private backend/);
  }finally{await view.close();}
});

test("accepted invitation result replaces temporary identity and duplicate email doesn't add a row",async()=>{
  const pending=defer();const view=await render({onInvite:(email)=>email === "mira@example.test" ? Promise.resolve(member) : pending.promise});
  try{
    await email(view,"friend@example.test");await submit(view);assert.ok(row(view,"pending:friend@example.test"));
    await act(async()=>pending.resolve({...member,id:"friend",name:"Friend",email:"friend@example.test"}));
    assert.equal(row(view,"pending:friend@example.test"),null);assert.ok(row(view,"friend"));
    await email(view,"MIRA@example.test");await submit(view);
    assert.equal(view.host.querySelectorAll("[data-member-id]").length,2,"existing email remains one row");
  }finally{await view.close();}
});

test("role menu exposes checked options, full computer and billing warning, keyboard movement and rollback",async()=>{
  const pending=defer();let changed;const view=await render({onChangeRole:(...args)=>{changed=args;return pending.promise;}});
  try{
    const trigger=row(view).querySelector('[aria-haspopup="menu"]');await click(trigger);
    assert.equal(trigger.getAttribute("aria-expanded"),"true");
    const options=[...view.host.querySelectorAll('[role="menuitemradio"]')];assert.equal(options.length,2);
    assert.equal(options[0].getAttribute("aria-checked"),"true");assert.match(options[1].textContent,/你的电脑/);assert.match(options[1].textContent,/费用由你承担/);
    await act(async()=>{options[0].focus();options[0].dispatchEvent(new window.KeyboardEvent("keydown",{key:"ArrowDown",bubbles:true,cancelable:true}));});
    assert.equal(document.activeElement,options[1]);await click(options[1]);
    assert.deepEqual(changed,["m1","collaborate"]);assert.match(row(view).textContent,/协作/);
    await act(async()=>pending.reject(Error("no")));assert.match(row(view).textContent,/仅查看/);assert.ok(view.host.querySelector('[role="alert"]'));
  }finally{await view.close();}
});

test("removal requires confirmation; cancel sends nothing; failed removal restores the row",async()=>{
  const pending=defer();const calls=[];const view=await render({onRemove:id=>{calls.push(id);return pending.promise;}});
  try{
    await click(row(view).querySelector('button[aria-label="移除 Mira"]'));
    const dialog=view.host.querySelector('[role="dialog"]');assert.ok(dialog);assert.equal(dialog.getAttribute("aria-modal"),"true");
    assert.equal(document.getElementById(dialog.getAttribute("aria-labelledby"))?.textContent,"确认移除");
    await click(byText(dialog,"取消"));assert.equal(calls.length,0);assert.ok(row(view));
    await click(row(view).querySelector('button[aria-label="移除 Mira"]'));await click(byText(view.host.querySelector('[role="dialog"]'),"移除"));
    assert.deepEqual(calls,["m1"]);assert.equal(row(view),null);
    await act(async()=>pending.reject(Error("no")));assert.ok(row(view));assert.ok(view.host.querySelector('[role="alert"]'));
  }finally{await view.close();}
});

test("incoming access changes during a save are applied after the mutation settles",async()=>{
  const pending=defer();const view=await render({onChangeRole:()=>pending.promise});
  try{
    await click(row(view).querySelector('[aria-haspopup="menu"]'));await click(view.host.querySelectorAll('[role="menuitemradio"]')[1]);
    await view.update({members:[],canManage:false});
    await act(async()=>pending.resolve());assert.equal(row(view),null);assert.equal(view.host.querySelector("button"),null);
  }finally{await view.close();}
});

test("real nested confirmation keeps the Share panel open, traps focus and restores the remove trigger on Escape",async()=>{
  globalThis.requestAnimationFrame=window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame=window.cancelAnimationFrame.bind(window);
  const originalScrollTo=window.scrollTo;window.scrollTo=()=>{};
  // jsdom lacks CSS @starting-style; motion itself has separate shared tests.
  const existingMotion=document.getElementById("leo-overlay-motion");
  const motion=existingMotion ?? Object.assign(document.createElement("style"),{id:"leo-overlay-motion"});
  if(!existingMotion)document.head.append(motion);
  const stubs={"../../i18n/ui/useUI":uiStub};
  const {AnchoredPopover}=await import(await compileModule("src/shell/anchored-popover.tsx",stubs));
  const {MemberPanel:RealMemberPanel}=await import(await compileModule("src/shell/access/MemberPanel.tsx",stubs));
  function SharedPanel(){
    const anchorRef=React.useRef(null);const [open,setOpen]=React.useState(true);
    return React.createElement(React.Fragment,null,
      React.createElement("button",{ref:anchorRef,type:"button"},"Share"),
      React.createElement(AnchoredPopover,{open,anchorRef,role:"dialog",ariaLabel:"Share panel",onClose:()=>setOpen(false)},
        React.createElement(RealMemberPanel,{owner,members:[member],canManage:true,onInvite:async()=>{},onChangeRole:async()=>{},onRemove:async()=>{}})));
  }
  const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
  try{
    await act(async()=>root.render(React.createElement(SharedPanel)));
    await act(async()=>new Promise(resolve=>window.requestAnimationFrame(resolve)));
    const outer=document.querySelector('[role="dialog"][aria-label="Share panel"]');assert.ok(outer);
    const removeTrigger=outer.querySelector('button[aria-label="移除 Mira"]');await click(removeTrigger);
    await act(async()=>new Promise(resolve=>window.requestAnimationFrame(resolve)));
    const nested=[...document.querySelectorAll('[role="dialog"]')].find(dialog=>dialog.getAttribute("aria-modal")==="true");assert.ok(nested);
    const buttons=[...nested.querySelectorAll("button")];
    await act(async()=>{buttons.at(-1).focus();buttons.at(-1).dispatchEvent(new window.KeyboardEvent("keydown",{key:"Tab",bubbles:true,cancelable:true}));});
    assert.equal(document.activeElement,buttons[0]);
    await act(async()=>{buttons[0].dispatchEvent(new window.MouseEvent("pointerdown",{bubbles:true}));});
    assert.equal(outer.hidden,false,"dialog interaction must not close outer panel");
    await act(async()=>buttons[0].dispatchEvent(new window.KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true})));
    assert.equal(outer.hidden,false);assert.equal(document.activeElement,removeTrigger);
    assert.equal([...document.querySelectorAll('[role="dialog"]')].filter(dialog=>dialog.getAttribute("aria-modal")==="true").length,0);
  }finally{await act(async()=>root.unmount());host.remove();window.scrollTo=originalScrollTo;if(!existingMotion)motion.remove();}
});
