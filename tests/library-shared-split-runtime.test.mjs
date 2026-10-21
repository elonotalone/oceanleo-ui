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
const { SplitWorkspace, useRightPaneSlot, useWorkspacePane } = await import(splitUrl);
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
const inlinePanelsUrl = await compileModule("src/shell/use-inline-advanced-panels.tsx", {
  "../i18n/ui/useUI": dataModule(`export function useUI(){return value=>value;}`),
  "../ui/Button": dataModule(`export function Button(){return null;}`),
  "./AdvancedEditorIcon": dataModule(`export function AdvancedEditorIcon(){return null;}`),
  "./InlineEditorMaterialPanel": dataModule(`
    import React from ${JSON.stringify(reactUrl)};
    export function InlineEditorMaterialPanel(){return React.createElement('div',{'data-materials-panel':true},'Assets');}
  `),
  "./inline-advanced-shell-helpers": dataModule(`
    export function resolveActiveMaterialAction(){return undefined;}
    export function resolveInlineAdvancedDrawers(adapter){return adapter.drawers || [];}
  `),
  "./plugin-chrome/PluginAgentPanel": dataModule(`export function PluginAgentPanel(){return null;}`),
  "./plugin-chrome/agent-drawer": dataModule(`export const PLUGIN_AGENT_DRAWER_ID='agent';`),
  "./plugin-theme": dataModule(`export function PluginThemeScope({children}){return children;}`),
  "./agent-conversation-layout": dataModule(`export const AGENT_CONVERSATION_HOST_STRETCH_CLASS='';`),
  "./live-react-node": dataModule(`
    export function createLiveReactNodeStore(){return {node:null};}
    export function publishLiveReactNode(store,node){store.node=node;}
    export function LiveReactNode({store}){return store.node;}
  `),
  "./SplitWorkspace": splitUrl,
});
const { useInlineAdvancedPanels } = await import(inlinePanelsUrl);
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;
const artifactLibraryUrl = await compileModule("src/shell/ArtifactLibrary.tsx", {
  "../lib/auth/client": dataModule(`export function browserClient(){return null;}`),
  "../lib/virtual": dataModule(`export function pixelsPerRem(){return 16;} export function useVirtualGrid(){return {windowed:false,items:[]};}`),
  "./Markdown": dataModule(`export function Markdown(){return null;}`),
  "../ui": dataModule(`export function Modal({children}){return children;} export function SkeletonCard(){return null;} export function EmptyState(){return null;} export function timeAgo(){return "";}`),
  "../i18n/ui/useUI": dataModule(`export function useUI(){return value=>value;}`),
  "./LibraryLayout": dataModule(`export function LibraryToolbar(){return null;}`),
  "./collection-chrome": dataModule(`export const COLLECTION_CARD_GRID_CLASS=""; export const COLLECTION_CARD_GRID_STYLE={}; export function CollectionCardGrid({children}){return children;} export function CollectionFilterRow(){return null;} export function CollectionFilterSelect(){return null;} export function CollectionInfiniteSentinel(){return null;} export const COLLECTION_ACTION_BTN_PRIMARY="";`),
  "./inline-editor-mine-activate": dataModule(`export function useStandaloneMineEditReceipt(){return null;}`),
  "./MyLibrary": dataModule(`
    import {jsx,jsxs} from ${JSON.stringify(jsxRuntimeUrl)};
    export function MyLibrary(props){
      globalThis.__artifactLibraryMyLibraryProps=props;
      return jsxs('div',{'data-my-library':true,'data-editor-class':props.className,children:[
        jsx('button',{type:'button','data-open-editor':true,onClick:()=>props.onEditorOpenChange?.(true)}),
        jsx('button',{type:'button','data-close-editor':true,onClick:()=>props.onEditorOpenChange?.(false)})
      ]});
    }
  `),
  "./StorageCapacityStrip": dataModule(`export function StorageCapacityStrip(){return null;}`),
  "./AppPageHeader": dataModule(`export const APP_PAGE_FRAME_CLASS="max-w-6xl px-4 pt-3 pb-5"; export const APP_PAGE_TITLE_CLASS=""; export function AppPageHeader(){return null;}`),
});
const { ArtifactLibrary } = await import(artifactLibraryUrl);
const { createRoot } = await import("react-dom/client");

async function mount(component) {
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  await act(async()=>root.render(component));
  return { container, root, async destroy(){await act(async()=>root.unmount()); container.remove();} };
}
const click = async button => { assert.ok(button); await act(async()=>button.dispatchEvent(new MouseEvent("click",{bubbles:true}))); };
const base = { item:{id:"asset-1",artifactId:"artifact-1",type:"document",title:"Draft",siteId:"document"},taskId:"task-preserved",siteId:"document",appId:"library",accent:"#123456",onSavedItem(){},onClose(){} };

test("full-page Library drops collection max-width only while an editor is open", async()=>{
  const m=await mount(React.createElement(ArtifactLibrary,{}));
  try {
    const frame=m.container.querySelector("[data-library-layout]");
    assert.equal(frame.dataset.libraryLayout,"collection");
    assert.match(frame.className,/max-w-6xl/,"collection layout keeps its existing page frame");
    assert.equal(globalThis.__artifactLibraryMyLibraryProps.className,"");
    await click(m.container.querySelector("[data-open-editor]"));
    assert.equal(frame.dataset.libraryLayout,"editor");
    assert.doesNotMatch(frame.className,/max-w-6xl|px-4/,"editor workspace must not inherit collection constraints");
    assert.match(globalThis.__artifactLibraryMyLibraryProps.className,/w-full/);
    assert.match(globalThis.__artifactLibraryMyLibraryProps.className,/min-w-0/);
    await click(m.container.querySelector("[data-close-editor]"));
    assert.equal(frame.dataset.libraryLayout,"collection","closing the editor restores collection framing");
  } finally {await m.destroy();}
});

test("standalone Library editor opens with the existing Agent visible and preserves editor state", async()=>{
  globalThis.__splitEditorMounts = 0;
  function Host(){const [item,setItem]=React.useState(base.item); return React.createElement(MaterialStandaloneEditor,{...base,item,onSavedItem:setItem});}
  const m = await mount(React.createElement(Host));
  try {
    assert.equal(m.container.querySelectorAll("[data-workspace-split]").length,1);
    const editor=m.container.querySelector("[data-editor]");
    const input=m.container.querySelector("input"); input.value="local edit";
    const left=m.container.querySelector('[data-workspace-pane="left"]');
    assert.equal(left.classList.contains("hidden"),false,"Library editor must show the Agent on its first frame");
    assert.equal(m.container.querySelector("[data-conversation]").textContent,"task-preserved");
    assert.ok(left.classList.contains("rounded-2xl"),"Agent island must keep Task's rounded frame");
    const right=m.container.querySelector('[data-workspace-pane="main"]');
    assert.ok(right.classList.contains("rounded-2xl"),"editor island must keep Task's rounded frame");
    const divider=m.container.querySelector('[role="separator"][aria-orientation="vertical"]');
    assert.ok(divider,"Library editor must reuse Task's draggable divider");
    const split=m.container.querySelector("[data-workspace-split]");
    split.getBoundingClientRect=()=>({left:0,top:0,right:1000,bottom:700,width:1000,height:700,x:0,y:0,toJSON(){}});
    await act(async()=>divider.dispatchEvent(new dom.window.MouseEvent("pointerdown",{bubbles:true,clientX:330})));
    await act(async()=>window.dispatchEvent(new dom.window.MouseEvent("pointermove",{clientX:600})));
    assert.equal(left.style.flexBasis,"60%","dragging the shared divider must move the left island");
    await act(async()=>window.dispatchEvent(new dom.window.MouseEvent("pointerup",{bubbles:true})));
    await click(m.container.querySelector("[data-ai]"));
    assert.equal(m.container.querySelector("[data-conversation]").textContent,"task-preserved");
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
    assert.equal(m.container.querySelector('[data-workspace-pane="left"]').classList.contains("hidden"),false);
    await click(m.container.querySelector("[data-ai]"));
    assert.equal(m.container.querySelector("[data-task-chat]").textContent,"existing task");
    assert.equal(globalThis.__splitEditorMounts,1);
  } finally {await m.destroy();}
});

test("editor Assets replaces the Agent body in the shared left island and Agent returns to chat", async()=>{
  let focusedAgent=0;
  function EditorPanels(){
    const pane=useWorkspacePane();
    const panels=useInlineAdvancedPanels({
      adapter:{id:"image",label:"Image"},item:base.item,siteId:"document",accent:"#123456",
      ownerId:"editor-panel-test",pluginThemeId:null,workbenchMaterials:null,
      showWorkspaceDetail:pane?.showDetail,clearWorkspaceDetail:pane?.clearDetail,
    });
    return React.createElement("div",null,
      React.createElement("button",{ "data-open-assets":true,onClick:()=>panels.openDrawer("materials")},"Assets"),
      React.createElement("button",{ "data-open-agent":true,onClick:()=>panels.openDrawer("agent")},"Agent"));
  }
  const m=await mount(React.createElement(SplitWorkspace,{
    left:React.createElement("div",{"data-task-chat":true},"existing task conversation"),
    right:React.createElement(EditorPanels),
    onAgentFocus(){focusedAgent+=1;},library:{open:true},fillParent:true,
  }));
  try {
    await click(m.container.querySelector("[data-open-assets]"));
    assert.equal(m.container.querySelector('[data-workspace-pane="left"]').dataset.leftPanel,"tool-detail");
    assert.ok(m.container.querySelector('[data-workspace-pane="left"] [data-materials-panel]'));
    assert.equal(m.container.querySelectorAll("[data-workspace-split]").length,1,"tool panels must not add another split");
    await click(m.container.querySelector("[data-open-agent]"));
    assert.equal(focusedAgent,1);
    assert.equal(m.container.querySelector('[data-workspace-pane="left"]').dataset.leftPanel,"app");
    assert.equal(m.container.querySelector("[data-task-chat]").textContent,"existing task conversation");
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
