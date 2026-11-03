import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import "./helpers/w1-jsdom-window.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
for (const [name, value] of Object.entries({
  getSelection: window.getSelection.bind(window), MutationObserver: window.MutationObserver,
  getComputedStyle: window.getComputedStyle.bind(window),
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
})) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
for (const name of ["innerHeight", "innerWidth", "scrollX", "scrollY", "pageXOffset", "pageYOffset"])
  Object.defineProperty(globalThis, name, { configurable: true, get: () => window[name] });
document.elementFromPoint = () => null;
window.Range.prototype.getBoundingClientRect = () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
window.Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} });

const noop = (name) => dataModule(`export function ${name}(){return null;}`);
// Use the actual TemplateFillArea, Tiptap and ProseMirror keymaps, all from ESM.
const tiptap = ["@tiptap/react", "@tiptap/core", "@tiptap/pm/state", "@tiptap/extension-document",
  "@tiptap/extension-paragraph", "@tiptap/extension-text", "@tiptap/extension-placeholder", "@tiptap/extension-history"];
const { LeoComposer } = await import(await compileModule("src/shell/LeoComposer.tsx", {
  ...Object.fromEntries(tiptap.map((name) => [name, import.meta.resolve(name)])),
  "../lib/attachment-url": dataModule("export const PRIVATE_ATTACHMENT_MAX_BYTES=20*1024*1024;"),
  "../i18n/ui/useUI": dataModule("export function useUI(){return text=>text;}"),
  "./guide-context": dataModule("export function useFillNonce(){return 0;}export function useFillTemplate(){return null;}"),
  "./mobile-native-actions": dataModule("export function useNativeAttachActions(){return [];}export function useNativeHandoffEntry(){return {action:null,panel:null};}export function useNativeTaskNotifications(){}export function requestTaskNotificationsOnce(){}"),
  "../lib/upload/use-attachment-intake": dataModule("export function useAttachmentIntake(){return {compressing:false,pending:[],inFlight:[],emit(){},handlePaste(){}};}"),
  "./workspace-runtime-hydration": dataModule("export function useWorkspaceRuntimeHydration(){return null;}"),
  "./composer-draft": dataModule("export function useComposerDraft(){return {markSubmitted(){}};}"),
  "./composer-max-height": dataModule("export function useComposerMaxHeight(){return 280;}"),
  "./composer-skill-slash": dataModule("export function composerSlashAdapter(){return {};}export function useComposerSkillSlash(){return {onKeyDown(){return false;},popover:null};}"),
  ...Object.fromEntries([["./LeoEntryButton","LeoEntryButton"],["./AttachmentStrip","AttachmentStrip"],
    ["./ModelPicker","ModelGroupPicker"],["./PluginsPopover","PluginsPopover"],["./PayerSelector","PayerSelector"],
    ["./mcp-apps","ComposerAppsBar"],["./cloud-computer/ComputerDock","ComputerDock"],["./ComposerLibraryPicker","ComposerLibraryPicker"]]
    .map(([path,name]) => [path,noop(name)])),
}));

async function mount({ value = "", ...config } = {}) {
  const container = document.createElement("div");document.body.append(container);const root = createRoot(container);
  const actions = { stopped: 0, sent: [] };let currentValue = value;
  function Host({ options }) {
    const [draft,setDraft] = React.useState(value);currentValue = draft;
    return React.createElement(LeoComposer, { loading: true, showComputerDock: false, showModelPicker: false,
      showPayerSelector: false, showPlugins: false, showAppsBar: false, ...options,
      value: draft, onChange: setDraft, onStop() {actions.stopped++;}, onSubmit(text) {actions.sent.push(text);setDraft("");} });
  }
  const render = async () => act(async () => root.render(React.createElement(Host,{options:config})));
  await render();
  for(let i=0;i<50 && !container.querySelector('[role="textbox"]')?.editor;i++)
    await act(async()=>new Promise(resolve=>setTimeout(resolve,10)));
  const box = container.querySelector('[role="textbox"]');
  assert.ok(box?.editor,"actual Tiptap editor mounted");
  assert.equal(box.tagName,"DIV");assert.equal(box.getAttribute("contenteditable"),"true");
  await act(async()=>{box.editor.commands.focus("end");await new Promise(resolve=>setTimeout(resolve,30));});
  assert.equal(document.activeElement,box,"physical key target is the focused real textbox");
  return { container,box,actions,get value(){return currentValue;},
    async key(key,extra={}) {
      const code=key==="Escape"?27:13;
      const event=new window.KeyboardEvent("keydown",{key,code:key,keyCode:code,which:code,bubbles:true,cancelable:true,...extra});
      assert.equal(event.keyCode,code,"exercise ProseMirror's physical keyCode path");
      await act(async()=>box.dispatchEvent(event));return event;
    },
    async update(patch){Object.assign(config,patch);await render();},
    async close(){await act(async()=>root.unmount());container.remove();},
  };
}

for (const kind of ["oceanleo","native"]) for (const value of ["","follow-up"]) {
  test(`real ${kind} contenteditable Escape27 stops once with ${value?"Send":"Stop"} visible`,async()=>{
    const conversation=kind==="native"?{kind,computerId:"cc-test",program:"codex",view:"chat"}:{kind,target:{kind:"cloud"}};
    const view=await mount({value,conversation});try {
      assert.ok(view.container.querySelector(value?'[data-composer-send]':'[data-composer-stop]'));
      const event=await view.key("Escape");
      assert.equal(view.actions.stopped,1,"Escape reaches Stop before ProseMirror consumes keyCode27");
      assert.deepEqual(view.actions.sent,[]);assert.equal(view.value,value);assert.equal(event.defaultPrevented,true);
    }finally{await view.close();}
  });
}

test("real contenteditable Enter13 sends once and Escape27 stops the continuing run after its draft clears",async()=>{
  const view=await mount({value:"send this"});try {
    await view.key("Enter");assert.deepEqual(view.actions.sent,["send this"]);assert.equal(view.value,"");
    assert.equal(view.box.querySelectorAll("p").length,1,"host Enter creates no transient extra paragraph");
    await view.key("Escape");assert.equal(view.actions.stopped,1);
  }finally{await view.close();}
});

test("real editor Escape ignores composition, a stop in flight, and an idle run",async()=>{
  const view=await mount();try {
    await view.key("Escape",{isComposing:true});assert.equal(view.actions.stopped,0);
    await view.update({stopping:true});await view.key("Escape");assert.equal(view.actions.stopped,0);
    await view.update({stopping:false,loading:false});await view.key("Escape");assert.equal(view.actions.stopped,0);
  }finally{await view.close();}
});

test("real contenteditable physical Shift+Enter does not submit",async()=>{
  const view=await mount({value:"first line"});try {
    await view.key("Enter",{shiftKey:true});assert.deepEqual(view.actions.sent,[]);
  }finally{await view.close();}
});
