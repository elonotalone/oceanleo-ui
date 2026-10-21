import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];
const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://dev.example.test/library" });
for (const name of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "MouseEvent", "CustomEvent", "localStorage"]) {
  Object.defineProperty(globalThis, name, { configurable: true, value: name === "window" ? dom.window : dom.window[name] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const splitUrl = await compileModule("src/shell/SplitWorkspace.tsx", {
  "../i18n/ui/useUI": dataModule(`export function useUI(){ return value=>value; }`),
  "./icons": dataModule(`export function IconLibrary(){return null;}`),
  "./AdvancedEditorIcon": dataModule(`export function AdvancedEditorIcon(){return null;}`),
  "./EditBarDockHost": dataModule(`export function EditBarDockHost(){return null;}`),
});
const { SplitWorkspace, useRightPaneSlot } = await import(splitUrl);
globalThis.__splitEditorMounts = 0;
const editorUrl = dataModule(`
  import React, { useEffect, useState } from ${JSON.stringify(reactUrl)};
  import { useConsoleAgentFocus } from ${JSON.stringify(splitUrl)};
  export function AdvancedContentWorkbench(props){
    const focus = useConsoleAgentFocus();
    const [text,setText] = useState('unsaved draft');
    useEffect(()=>{globalThis.__splitEditorMounts++;},[]);
    return React.createElement('div',{'data-editor':props.item.id},
      React.createElement('input',{'data-draft':true,defaultValue:text}),
      React.createElement('button',{'data-ai':true,onClick:()=>focus.focusAgent()},'AI'),
      React.createElement('button',{'data-save':true,onClick:()=>props.onSavedItem({...props.item, revisionId:'revision-2'})},'save'));
  }
`);
// Only conversation transport is stubbed; both paths below use the real split
// and its real focus context, visibility, chrome and mounted pane lifecycle.
const agentUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  import { SplitWorkspace } from ${JSON.stringify(splitUrl)};
  export function AgentChat(p){ return React.createElement(SplitWorkspace,{
    left:React.createElement('div',{'data-conversation':true},p.taskId),
    right:p.workspaceContent,leftHidden:!p.workspaceAgentVisible,
    onAgentFocus:p.onWorkspaceAgentFocus,fillParent:true,
    library:{open:p.workspaceOpen,onOpenChange:p.onWorkspaceOpenChange}
  }); }
`);
const { MaterialStandaloneEditor } = await import(await compileModule("src/shell/material-library-standalone.tsx", {
  "./AdvancedContentWorkbench": editorUrl, "./SplitWorkspace": splitUrl, "./AgentChat": agentUrl,
  "./WorkspaceSession": dataModule(`export function useOptionalWorkspaceSession(){return null;} export function WorkspaceSessionProvider({children}){return children;}`),
}));
const { createRoot } = await import("react-dom/client");

async function mount(component) {
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  await act(async()=>root.render(component));
  return { container, root, async destroy(){await act(async()=>root.unmount()); container.remove();} };
}
const click = async button => { assert.ok(button); await act(async()=>button.dispatchEvent(new MouseEvent("click",{bubbles:true}))); };
const base = { item:{id:"asset-1",artifactId:"artifact-1",type:"document",title:"Draft",siteId:"document"},taskId:"task-preserved",siteId:"document",appId:"library",accent:"#123456",onSavedItem(){},onClose(){} };

test("Library AI reveals the existing split conversation without replacing editor or draft", async()=>{
  globalThis.__splitEditorMounts = 0;
  function Host(){const [item,setItem]=React.useState(base.item); return React.createElement(MaterialStandaloneEditor,{...base,item,onSavedItem:setItem});}
  const m = await mount(React.createElement(Host));
  try {
    assert.equal(m.container.querySelectorAll("[data-workspace-split]").length,1);
    const editor=m.container.querySelector("[data-editor]");
    const input=m.container.querySelector("input"); input.value="local edit";
    assert.ok(m.container.querySelector('[data-workspace-pane="left"]').classList.contains("hidden"));
    await click(m.container.querySelector("[data-ai]"));
    assert.equal(m.container.querySelector("[data-conversation]").textContent,"task-preserved");
    assert.equal(m.container.querySelector('[data-workspace-pane="left"]').classList.contains("hidden"),false);
    await click(m.container.querySelector("[data-save]"));
    assert.equal(m.container.querySelector("[data-editor]"),editor);
    assert.equal(m.container.querySelector("input"),input);
    assert.equal(input.value,"local edit");
    assert.equal(globalThis.__splitEditorMounts,1);
    const conversation=m.container.querySelector("[data-conversation]");
    await click(m.container.querySelector('[aria-label="关闭右侧面板"]'));
    assert.equal(m.container.querySelector('[data-workspace-pane="main"]').classList.contains("hidden"),true);
    assert.equal(m.container.querySelector("[data-conversation]"),conversation);
    await click(m.container.querySelector('[aria-label="展开"]'));
    assert.equal(m.container.querySelector('[data-workspace-pane="main"]').classList.contains("hidden"),false);
    assert.equal(m.container.querySelector("input"),input);
    assert.equal(globalThis.__splitEditorMounts,1);
  } finally {await m.destroy();}
});

test("task Library reuses its current split and conversation", async()=>{
  globalThis.__splitEditorMounts=0;
  const m=await mount(React.createElement(SplitWorkspace,{left:React.createElement("div",{"data-task-chat":true},"existing task"),right:React.createElement(MaterialStandaloneEditor,base),onAgentFocus(){},library:{open:true},fillParent:true}));
  try {
    assert.equal(m.container.querySelectorAll("[data-workspace-split]").length,1);
    assert.equal(m.container.querySelector("[data-library-editor-host]").dataset.libraryEditorHost,"existing-workspace");
    await click(m.container.querySelector("[data-ai]"));
    assert.equal(m.container.querySelector("[data-task-chat]").textContent,"existing task");
    assert.equal(globalThis.__splitEditorMounts,1);
  } finally {await m.destroy();}
});

test("common right chrome maximizes, restores and closes while preserving mounted conversation/editor",async()=>{
  function Host(){const [open,setOpen]=React.useState(true);return React.createElement(SplitWorkspace,{left:React.createElement("div",{"data-chat":true},"chat"),right:React.createElement("input",{"data-edit":true,defaultValue:"draft"}),library:{open,onOpenChange:setOpen},fillParent:true});}
  const m=await mount(React.createElement(Host));
  try {
    const chat=m.container.querySelector("[data-chat]"); const editor=m.container.querySelector("input");
    await click(m.container.querySelector('[aria-label="右侧全屏"]'));
    assert.equal(m.container.querySelector('[data-workspace-pane="left"]').classList.contains("hidden"),true);
    await click(m.container.querySelector('[aria-label="退出右侧全屏"]'));
    await click(m.container.querySelector('[aria-label="关闭右侧面板"]'));
    assert.equal(m.container.querySelector('[data-workspace-pane="main"]').classList.contains("hidden"),true);
    assert.equal(m.container.querySelector("[data-chat]"),chat);
    assert.equal(m.container.querySelector("input"),editor);
  } finally {await m.destroy();}
});

test("Library home retains window actions when content requests a frameless pane",async()=>{
  function Home(){const pane=useRightPaneSlot();React.useLayoutEffect(()=>{pane.setRightFrameless(true);return()=>pane.setRightFrameless(false);},[pane]);return React.createElement("div",{"data-home":true},"home");}
  let closed=false;
  const m=await mount(React.createElement(SplitWorkspace,{left:"conversation",right:React.createElement(Home),library:{open:true,onOpenChange:open=>{closed=!open;}},fillParent:true}));
  try {
    assert.equal(m.container.querySelectorAll("[data-right-pane-actions]").length,1);
    await click(m.container.querySelector('[aria-label="右侧全屏"]'));
    assert.equal(m.container.querySelector('[data-workspace-pane="left"]').classList.contains("hidden"),true);
    await click(m.container.querySelector('[aria-label="关闭右侧面板"]'));
    assert.equal(closed,true);
  } finally {await m.destroy();}
});
