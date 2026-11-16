import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { dirname, relative } from "node:path";
import React, { act, useMemo, useRef } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { compileSelectionAdapterHost, compileDocumentToolsHost } from "./helpers/selection-adapter-host.mjs";

const require = createRequire(import.meta.url);
const fr = createRequire(require.resolve("fabric/node"));
const canvas = fr.resolve("canvas");
const cached = require.cache[canvas];
require.cache[canvas] = { id: canvas, filename: canvas, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fr.resolve("jsdom")).href);
if (cached) require.cache[canvas] = cached; else delete require.cache[canvas];
const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://editor.dev.oceanleo.com/library?item=a" });
for (const name of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "Element", "Node", "Event", "MouseEvent", "KeyboardEvent", "CustomEvent", "MutationObserver", "localStorage", "getComputedStyle"]) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "window" ? dom.window : dom.window[name] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
let nativeEventCheckpoints = false;
const addListener = window.EventTarget.prototype.addEventListener;
window.EventTarget.prototype.addEventListener = function(type, listener, options) {
  const capture = typeof options === "boolean" ? options : options?.capture;
  return addListener.call(this, type, type === "click" && !capture && typeof listener === "function"
    ? event => nativeEventCheckpoints ? queueMicrotask(() => listener.call(this, event)) : listener.call(this, event)
    : listener, options);
};
const { createRoot } = await import("react-dom/client");
const react = JSON.stringify(pathToFileURL(require.resolve("react")).href);
const ui = dataModule(`const tt = (s, vars) => String(s).replace(/\\{(\\w+)\\}/g, (m,k) => vars?.[k] ?? m); export function useUI(){return tt}`);
const theme = dataModule(`import React from ${react}; export const PluginThemePortalContext=React.createContext(null); export function pluginThemeIdForAdapter(id){return id.split('@')[0]} export function PluginThemeScope({children,pluginId}){return React.createElement('div',{'data-test-plugin-theme':pluginId},children)} export function usePluginThemePortal(){return null} export function usePluginTheme(){return {theme:'light',accent:'#456'}} export function pluginWorkbenchStyle(){return {}}`);
const moduleOverrides = new Map([
  ["src/i18n/ui/useUI.ts", ui], ["src/shell/plugin-theme.tsx", theme],
]);
const moduleUrl = async path => {
  const stubs = Object.fromEntries([...moduleOverrides].map(([target,url]) => {
    const key = relative(dirname(path),target); return [key.startsWith(".") ? key : `./${key}`,url];
  }));
  return compileModule(path,stubs);
};
const compiled = async path => import(await moduleUrl(path));
const floatingUrl = await moduleUrl("src/shell/EditBarFloatingPanel.tsx");
moduleOverrides.set("src/shell/EditBarFloatingPanel.tsx",floatingUrl);
const { EditBarFloatingPanel, EditBarPanelContext, EditBarPanelRequest, useEditBarPanelStack } = await import(floatingUrl);
const { editBarPanelGeometry } = await compiled("src/shell/edit-bar-panel-geometry.ts");
const splitUrl = await moduleUrl("src/shell/SplitWorkspace.tsx");
moduleOverrides.set("src/shell/SplitWorkspace.tsx",splitUrl);
const { SplitWorkspace, useWorkspacePane } = await import(splitUrl);
const layoutUrl = await moduleUrl("src/shell/advanced-layout-context.tsx");
moduleOverrides.set("src/shell/advanced-layout-context.tsx",layoutUrl);
const { AdvancedLayoutContext } = await import(layoutUrl);
moduleOverrides.set("src/shell/InlineEditorMaterialPanel.tsx",dataModule(`import React from ${react}; export function InlineEditorMaterialPanel({materials}){return React.createElement('button',{'data-material-insert':true,onClick:()=>materials.perform('insert',{id:'image-1'})},'Insert material')}`));
moduleOverrides.set("src/shell/plugin-chrome/PluginAgentPanel.tsx",dataModule(`import React from ${react}; export function PluginAgentPanel(){return React.createElement('div',{'data-agent-conversation':true},'Agent')}`));
const { useInlineAdvancedPanels } = await compiled("src/shell/use-inline-advanced-panels.tsx");
const { useInlineLibraryPanels } = await compiled("src/shell/use-inline-library-panels.tsx");
const { editBarDocumentTools } = await compiled("src/shell/plugin-chrome/EditBarDocumentSegment.tsx");
const { creationToolControl } = await compiled("src/shell/creation-tools.ts");
const { resolveSelectionAdapterContext } = await compiled("src/shell/selection-adapter.ts");
const { RichDocControls } = await compiled("src/shell/doc-editors/RichDocControls.tsx");
const { useRichDocSelectionAdapter } = await compiled("src/shell/doc-editors/use-rich-doc-selection-adapter.ts");
function RichDocContextToolbar(props) { const a=useRichDocSelectionAdapter(props); return React.createElement(SelectionToolbar,{context:resolveSelectionAdapterContext(a.context),onCommand:a.dispatch}); }
const { DeckElementsPanel } = await compiled("src/shell/doc-editors/DeckControls.tsx");
const { FabricImageShapePanel } = await compiled("src/shell/image-editor/FabricImageCreationPanels.tsx");
moduleOverrides.set("src/shell/media-editors/AudioWorkbench.tsx",dataModule("export function useAudioWorkbench(){throw new Error('real waveform not used by controls')}"));
const { AudioControls } = await compiled("src/shell/media-editors/AudioWorkbenchView.tsx");
const { VideoTimelineControls } = await compiled("src/shell/video-editor/VideoTimelineControls.tsx");
const { Model3DControls } = await compiled("src/shell/media-editors/Model3DControls.tsx");
const { PdfFindBar } = await compiled("src/shell/media-editors/PdfFindBar.tsx");
moduleOverrides.set("src/lib/auth/client.ts",dataModule("export async function getUserId(){return null}"));
const { PdfSignatureDialog } = await compiled("src/shell/media-editors/PdfSignatureDialog.tsx");
moduleOverrides.delete("src/lib/auth/client.ts");
const { PdfToolPalette } = await compiled("src/shell/media-editors/PdfToolPalette.tsx");
const { usePdfSelectionAdapter } = await compiled("src/shell/media-editors/use-pdf-selection-adapter.ts");
function PdfSelectionBar(props) { const a=usePdfSelectionAdapter(props); return React.createElement(SelectionToolbar,{context:resolveSelectionAdapterContext(a.context),onCommand:a.dispatch}); }
const { SelectionToolbar } = await compiled("src/shell/SelectionToolbar.tsx");
const { EditBarRow } = await compiled("src/shell/FloatingContextToolbar.tsx");
function EditBarDocumentSegment(props) {
  const tools=editBarDocumentTools(props);
  return React.createElement(SelectionToolbar,{context:{version:1,kind:'creation',id:'test-creation',controls:tools.map(t=>creationToolControl(t))},onCommand:(c,anchor)=>tools.find(t=>t.id===c.controlId)?.execute?.(anchor)});
}

const { buildFabricImageToolbarControls } = await compiled("src/shell/image-editor/fabric-image-toolbar-controls.ts");
const { AnchoredPopover } = await compiled("src/shell/anchored-popover.tsx");
const { gridUniverSelectionContext, gridUniverCommandArgsFromValue } = await compiled("src/shell/doc-editors/grid-univer/stage-plan.ts");
const { runGridUniverCommand } = await compiled("src/shell/doc-editors/grid-univer/facade-commands.ts");
moduleOverrides.set("src/shell/plugin-chrome/agent-drawer-panel.tsx",dataModule(`import React from ${react}; export function createPluginAgentDrawer(){return {id:'agent',label:'AI',content:React.createElement('div',{'data-chrome-agent':true},'AI')}}`));
const { PluginChromeFrame, usePluginChromePanelHost } = await compiled("src/shell/plugin-chrome/PluginChromeFrame.tsx");

const rect = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height, width, height, x: left, y: top, toJSON(){} });
window.HTMLElement.prototype.getBoundingClientRect = function() {
  if (this.hasAttribute("data-selection-toolbar-viewport-capacity")) return rect(0,0,992,28);
  if (this.hasAttribute("data-selection-measure-control-id")) return rect(0,0,28,28);
  if (this.hasAttribute("data-selection-toolbar-suffix")) return rect(0,0,32,28);
  if (this.hasAttribute("data-workspace-edit-bar")) return rect(600, 90, 380, 40);
  if (this.hasAttribute("data-editor-canvas") || this.hasAttribute("data-plugin-chrome-stage")) return rect(600, 130, 400, 570);
  if (this.hasAttribute("data-edit-bar-layer-root") || this.hasAttribute("data-plugin-chrome")) return rect(600, 40, 400, 660);
  if (this.tagName === "BUTTON") return rect(680, 95, 70, 30);
  return rect(0, 0, 0, 0);
};
window.HTMLElement.prototype.scrollTo = () => {};
let errors = [];
const originalError = console.error;
test.beforeEach(() => { errors = []; console.error = (...args) => errors.push(args.map(String).join(" ")); });
test.afterEach(() => { console.error = originalError; assert.deepEqual(errors, [], "React render must not log errors"); });
async function mount(element, { nativeCheckpoints = false } = {}) {
  const node = document.createElement("div"); document.body.append(node);
  // Native browser dispatch can drain microtasks between the document capture
  // listener and React's delegated bubble listener. jsdom dispatchEvent keeps
  // one JS stack, so explicitly give that bubble listener the same checkpoint.
  nativeEventCheckpoints = nativeCheckpoints;
  const root = createRoot(node); await act(async () => root.render(element));
  return { node, async destroy(){ await act(async () => root.unmount()); node.remove(); nativeEventCheckpoints = false; } };
}
async function click(node) { assert.ok(node, "click target exists"); await act(async () => node.dispatchEvent(new MouseEvent("click", { bubbles: true }))); }
const textButton = (root, label) => [...root.querySelectorAll("button")].find(node => node.textContent.trim() === label || node.getAttribute("aria-label") === label);
const floating = () => document.querySelector("[data-edit-bar-floating-panel]");
const currentBody = () => floating()?.querySelector('[data-edit-bar-panel-current="true"]');
function assertInsertBody() {
  assert.match(currentBody().textContent, /插入内容/);
  for (const label of ["表格", "分割线", "代码块", "引用块", "上传本地图片"]) {
    assert.ok(textButton(currentBody(), label), `Insert keeps ${label}`);
  }
  assert.ok(currentBody().querySelector('[aria-label="图片 URL"]'));
  assert.doesNotMatch(currentBody().textContent, /文档来源|查找和替换|Aptos/);
}
const item = { id: "a", artifactId: "a", kind: "document", title: "Document", meta: {} };
function Harness({ body, id = "editor-global", adapterId = "richdoc", onReady, materials, toolbar, stageContent, adapterInput, hideDocumentTools = false }) {
  const pane = useWorkspacePane(); const stageRef = useRef(null); const layerRef = useRef(null);
  const adapter = useMemo(() => adapterInput ?? ({ id: adapterId, label: "Editor", drawers: [{ id, label: "插入", icon: "add", content: body }], upload: { onFiles(){} } }), [adapterId, body, id, adapterInput]);
  const panels = useInlineAdvancedPanels({ adapter, item, siteId: "oceanleo", accent: "#456", ownerId: "test-editor", pluginThemeId: "richdoc", workbenchMaterials: materials ?? null, showWorkspaceDetail: pane?.showDetail, clearWorkspaceDetail: pane?.clearDetail, workspaceLeftHidden: pane?.leftHidden, ownedWorkspaceDetailId: pane?.detail?.ownerId === "test-editor" ? pane.detail.id : null, onLocalUpload: () => onReady?.upload?.() });
  const library = useInlineLibraryPanels({ panels, item, siteId: "oceanleo", mineLabel: "我的库", activateMineItem: async () => ({ok:true}) });
  const layout = useMemo(() => ({ hostPanelVisible: Boolean(panels.floatingPanels.active), editorToolActive: Boolean(panels.floatingPanels.active), activeDrawerId: panels.activeDrawerId, activeTransientPanelId: panels.transientPanel?.id ?? "", openDrawer: panels.openDrawer, openTransientPanel: panels.openTransientPanel, updateTransientPanel: panels.updateTransientPanel, closeDrawer: panels.closeDrawer }), [panels]);
  if (typeof onReady === "function") onReady({ panels, library, pane });
  return React.createElement(EditBarPanelContext.Provider,{value:panels.floatingPanels}, React.createElement(AdvancedLayoutContext.Provider, { value: layout }, React.createElement("div", { ref: layerRef, "data-edit-bar-layer-root":true },
    React.createElement("div", { "data-workspace-edit-bar":true }, toolbar,
      !hideDocumentTools && React.createElement(EditBarDocumentSegment, { actions: adapter.actions ?? [], onTrigger(action,anchor){ if(action.panelId) panels.openDrawer(action.panelId,undefined,anchor); else action.onTrigger?.(); }, drawers: panels.editBarDrawers, activeDrawerId: library.openDrawerId, onToggleDrawer: library.toggleDrawer }),
      React.createElement("button", { "data-assets-button": true, onClick: e => library.openLibraryPanel("materials", e.currentTarget) }, "素材库"),
      React.createElement("button", { "data-ai-button": true, onClick: () => panels.openDrawer("agent") }, "AI")),
    React.createElement("div", { ref:stageRef, "data-editor-canvas": true }, stageContent ?? adapterInput?.stage ?? "Canvas"),
    React.createElement(EditBarFloatingPanel, { controller:panels.floatingPanels, containerRef:stageRef, editBarRef:layerRef, pluginThemeId:"richdoc" }),
    panels.fallbackDetail && React.createElement("aside", null, panels.fallbackDetail.content))));
}

const geometryInput = { anchor: rect(950, 90, 50, 40), container: rect(600, 130, 400, 570), viewport: rect(0, 0, 1024, 768), barBottom:130 };
test("geometry clamps the right and bottom edges without covering the edit bar", () => {
  const p = editBarPanelGeometry(geometryInput);
  assert.deepEqual(p, { left:676, top:136, width:320, maxHeight:537.5999999999999 });
  const low = editBarPanelGeometry({ ...geometryInput, container:rect(600, 130, 400, 80) });
  assert.equal(low.top,136); assert.equal(low.maxHeight,70);
});
test("geometry shrinks for a narrow sidebar and caps at 70vh", () => {
  const p = editBarPanelGeometry({ ...geometryInput, container:rect(600,130,190,570), width:420 });
  assert.equal(p.width,182); assert.equal(p.left,604); assert.ok(p.top+p.maxHeight <= 700);
});
test("geometry uses viewport coordinates after scrolling and visual viewport shifts", () => {
  const p = editBarPanelGeometry({ anchor:rect(270,-80,40,40), container:rect(200,-100,500,1200), viewport:rect(240,150,420,400), barBottom:170 });
  assert.equal(p.left,270); assert.equal(p.top,176); assert.equal(p.maxHeight,280);
});

test("RichDoc Insert floats at its button in Library, task sidebar and project hosts; all close paths restore focus", async () => {
  for (const host of ["library", "task", "project"]) {
    let api; const tables = [];
    const chain = new Proxy({}, {get:(_,name) => name === "run" ? () => true : value => { if(name === "insertTable") tables.push(value); return chain; }});
    const state = { editor:{isEditable:true, chain:()=>chain}, importing:false };
    const body = React.createElement(RichDocControls, { editor:state });
    const editor = React.createElement(Harness, { body, onReady: value => {api=value;} });
    const m = await mount(host === "library" ? editor : React.createElement(SplitWorkspace, { left:"Conversation", right:editor, library:{open:true}, fillParent:true }));
    try {
      const trigger = m.node.querySelector('[data-edit-bar-drawer="editor-global"]');
      await click(trigger);
      assert.ok(floating()); assert.equal(floating().closest("aside"),null); assert.equal(floating().closest('[data-workspace-pane="left"]'),null);
      assert.equal(floating().style.left,"676px"); assert.equal(floating().style.top,"136px");
      assert.ok(floating().parentElement.closest('[data-test-plugin-theme="richdoc"]'));
      assert.equal(api.pane?.detail ?? null, null);
      assertInsertBody();
      await click(textButton(currentBody(), "表格"));
      assert.ok(currentBody().querySelector('[aria-label="行数"]'));
      assert.ok(currentBody().querySelector('[aria-label="列数"]'));
      await click(textButton(currentBody(), "插入表格"));
      assert.deepEqual(tables,[{rows:3,cols:3,withHeaderRow:true}]);
      await act(async () => document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true})));
      assert.equal(floating(),null); assert.equal(document.activeElement,trigger);
      await click(trigger); await click(trigger); assert.equal(floating(),null,"same button closes"); assert.equal(document.activeElement,trigger);
      await click(trigger); await act(async()=>document.body.dispatchEvent(new MouseEvent("pointerdown",{bubbles:true}))); assert.equal(floating(),null,"outside closes"); assert.equal(document.activeElement,trigger);
      await click(trigger); await click(textButton(floating(),"关闭")); assert.equal(floating(),null); assert.equal(document.activeElement,trigger);
    } finally { await m.destroy(); }
  }
});

test("nested panel replaces the visible body, offers back, preserves parent state and restores the root trigger", async () => {
  let api;
  function Nested(){ const [value,setValue] = React.useState(0); return React.createElement("div",null,React.createElement("button",{onClick:()=>setValue(value+1)},`Count ${value}`),React.createElement("button",{onClick:e=>api.panels.openTransientPanel("nested","Nested",React.createElement("input",{defaultValue:"Child"}),e.currentTarget)},"Details")); }
  const body=React.createElement(Nested);
  const m=await mount(React.createElement(Harness,{body,onReady:v=>{api=v;}}));
  try { const trigger=m.node.querySelector("[data-edit-bar-drawer]"); await click(trigger); await click(textButton(currentBody(),"Count 0")); await click(textButton(currentBody(),"Details"));
    assert.equal(document.querySelectorAll("[data-edit-bar-floating-panel]").length,1); assert.equal(floating().dataset.editBarFloatingPanel,"nested"); assert.equal(currentBody().querySelector("input").value,"Child");
    await click(floating().querySelector("[data-edit-bar-panel-back]")); assert.ok(textButton(currentBody(),"Count 1"));
    await click(textButton(floating(),"关闭")); assert.equal(document.activeElement,trigger);
    await click(trigger); await click(textButton(currentBody(),"Details")); await click(trigger); assert.equal(floating(),null,"same root button closes a nested panel too");
  } finally {await m.destroy();}
});

test("Deck Elements keeps shape insertion working in the floating panel", async()=>{
  const added=[];const body=React.createElement(DeckElementsPanel,{editor:{addShapeElement:v=>added.push(v)}});
  const m=await mount(React.createElement(Harness,{body,id:"deck-elements",adapterId:"deck"}));
  try {await click(m.node.querySelector("[data-edit-bar-drawer]"));await click(textButton(currentBody(),"矩形"));assert.equal(added.length,1);}finally{await m.destroy();}
});
test("Image Shapes inserts the selected shape through the same floating panel",async()=>{
  const added=[];const body=React.createElement(FabricImageShapePanel,{editor:{addShape:v=>added.push(v)}});
  const m=await mount(React.createElement(Harness,{body,id:"image-shapes",adapterId:"image"}));
  try{await click(m.node.querySelector("[data-edit-bar-drawer]"));await click(textButton(currentBody(),"圆形"));assert.deepEqual(added,["circle"]);}finally{await m.destroy();}
});
test("Audio toolbox plays the loaded track without opening a sidebar",async()=>{
  let plays=0;const body=React.createElement(AudioControls,{editor:{loading:false,playing:false,speed:1,currentTime:0,duration:5,volume:100,zoom:30,playPause:()=>plays++}});
  const m=await mount(React.createElement(Harness,{body,adapterId:"audio"}));
  try{await click(m.node.querySelector("[data-edit-bar-drawer]"));await click(textButton(currentBody(),"播放"));assert.equal(plays,1);}finally{await m.destroy();}
});
test("Video toolbox adds a text clip and keeps nested URL fields inside the panel",async()=>{
  let adds=0;const body=React.createElement(VideoTimelineControls,{state:{sourceReady:true,doc:{width:1920,height:1080,fps:30},addTextClip:()=>adds++}});
  const m=await mount(React.createElement(Harness,{body,adapterId:"video-timeline"}));
  try{await click(m.node.querySelector("[data-edit-bar-drawer]"));await click(textButton(currentBody(),"添加文字"));assert.equal(adds,1);await click(textButton(currentBody(),"粘贴 URL"));assert.ok(currentBody().querySelector('input[placeholder="https://…"]'));}finally{await m.destroy();}
});
test("3D Scene toolbox adds a camera and keeps the director controls usable",async()=>{
  let adds=0;const editor={materials:[],sceneNodes:[],annotations:[],animations:[],director:{shots:[],scene:{}},directorDepthOfFieldAvailability:{enabled:false},directorScreenshotAvailability:{enabled:false},directorPlayblastAvailability:{enabled:false},modelLoaded:true,azimuth:0,elevation:90,zoom:100,exposure:1,environmentUrl:"",environmentIntensity:1,shadowIntensity:1,shadowSoftness:0.5,background:"#ffffff", annotationDraft:"",addCamera:()=>adds++};
  const body=React.createElement(Model3DControls,{editor,showDeliveryActions:false});const m=await mount(React.createElement(Harness,{body,adapterId:"threed"}));
  try{await click(m.node.querySelector("[data-edit-bar-drawer]"));await click(textButton(currentBody(),"添加相机"));assert.equal(adds,1);assert.ok(currentBody().querySelector('[data-testid="model3d-director-panel"]'));}finally{await m.destroy();}
});

test("PDF annotation opacity uses the shared compact percentage control and edits the annotation",async()=>{
  const updates=[]; const toolbar=React.createElement(PdfSelectionBar,{bridge:{updateAnnotation:(_s,p)=>updates.push(p)},selected:{id:"note",type:1,contents:"Hello",opacity:1},activeTool:null,version:1,readOnly:false,accent:"#456"});
  const m=await mount(React.createElement(Harness,{body:null,toolbar,adapterId:"pdf"}));
  try{const control=m.node.querySelector('[data-selection-control-id="opacity"]');assert.ok(control);assert.equal(control.querySelector('[aria-haspopup="dialog"]'),null);const number=control.querySelector('input[type="number"]');assert.equal(number.valueAsNumber,100);assert.deepEqual([number.min,number.max,number.step],["10","100","1"]);assert.match(control.textContent,/%/);await click(control.querySelector('button[aria-label="不透明度 -"]'));assert.deepEqual(updates.at(-1),{opacity:0.99},"the real scalar command reaches the PDF bridge in native 0–1 units");assert.equal(floating(),null,"opacity does not open a separate inspector");}finally{await m.destroy();}
});
test("Grid selection inspector uses the shared floating host and dispatches its real field action",async()=>{
  const commands=[];const context={...gridUniverSelectionContext({revision:1,kind:"grid-cell",tt:s=>s}),bar:"text"};
  const toolbar=React.createElement(SelectionToolbar,{context,onCommand:c=>commands.push(c)});const m=await mount(React.createElement(Harness,{body:null,toolbar,adapterId:"grid"}));
  try{await click([...m.node.querySelectorAll("button")].find(b=>(b.getAttribute("aria-label")??b.textContent).includes("更多")));
    await click([...currentBody().querySelectorAll("button")].find(b=>(b.getAttribute("aria-label")??b.textContent).includes("数字格式")));
    assert.ok(floating()); assert.ok(floating().textContent.includes("数字格式"));
    const number=currentBody().querySelector('input[type="number"]'); assert.ok(number);
    await act(async()=>number.focus());
    await act(async()=>number.blur());
    assert.ok(commands.some(command=>command.controlId === "decimals"), "real grid formatting commands remain connected");
    assert.ok(floating().querySelector("[data-edit-bar-panel-back]"));
    await click(floating().querySelector("[data-edit-bar-panel-back]"));
    assert.ok(currentBody().textContent.includes("行操作"));}finally{await m.destroy();}
});

test("materials stay exclusive with drawers, use 420px within the canvas, and preserve insert/upload callbacks",async()=>{
  let inserts=0,uploads=0;let api;const ready=v=>{api=v;};ready.upload=()=>uploads++;
  const m=await mount(React.createElement(Harness,{body:React.createElement("p",null,"Insert"),onReady:ready,materials:{actions:["insert"],perform:()=>{inserts++;}}}));
  try{await click(m.node.querySelector("[data-edit-bar-drawer]"));await click(m.node.querySelector("[data-assets-button]"));assert.equal(floating().dataset.editBarFloatingPanel,"materials");assert.equal(floating().style.width,"392px");await click(floating().querySelector("[data-material-insert]"));assert.equal(inserts,1);await click(floating().querySelector("[data-workspace-local-upload]"));assert.equal(uploads,1);await click(m.node.querySelector("[data-assets-button]"));assert.equal(floating(),null);assert.equal(api.library.activeLibraryPanelId,null);}finally{await m.destroy();}
});
test("AI retains the existing left conversation; opening tools never puts content in that column",async()=>{
  let focus=0;const m=await mount(React.createElement(SplitWorkspace,{left:React.createElement("div",{"data-conversation":true},"Chat"),right:React.createElement(Harness,{body:React.createElement("p",null,"Tools")}),onAgentFocus:()=>focus++,library:{open:true},fillParent:true}));
  try{await click(m.node.querySelector("[data-ai-button]"));assert.equal(focus,1);assert.ok(m.node.querySelector('[data-workspace-pane="left"] [data-conversation]'));assert.equal(floating(),null);await click(m.node.querySelector("[data-edit-bar-drawer]"));assert.ok(floating());assert.equal(m.node.querySelector('[data-workspace-pane="left"] [data-edit-bar-floating-panel]'),null);}finally{await m.destroy();}
});
function ChromeButtons(){const host=usePluginChromePanelHost();return React.createElement("button",{onClick:()=>host.togglePanel("tools"),"data-chrome-tools":true},"Tools");}
test("design/video canvas chrome uses the same floating component and keeps only AI in its aside",async()=>{
  const panels=[{id:"tools",label:"Tools",content:React.createElement("button",null,"Create")}];
  const m=await mount(React.createElement(PluginChromeFrame,{pluginId:"image",title:"Canvas",showLibrary:false,panels,editBar:React.createElement(ChromeButtons)},React.createElement("p",null,"Scene")));
  try{await click(m.node.querySelector("[data-chrome-tools]"));assert.equal(floating()?.dataset.editBarFloatingPanel,"tools");assert.equal(m.node.querySelector("aside").getAttribute("data-plugin-chrome-panel"),null);await click(m.node.querySelector("[data-chrome-tools]"));assert.equal(floating(),null);await click(m.node.querySelector("[data-edit-bar-agent]"));assert.equal(m.node.querySelector("aside").getAttribute("data-plugin-chrome-panel"),"agent");assert.ok(m.node.querySelector("aside [data-chrome-agent]"));}finally{await m.destroy();}
});


test("edit-bar menus and nested menus share one host, Back preserves the parent, and outside click resets the source", async()=>{
  let picked=0;
  function Menu({nested=false}){
    const anchor=useRef(null);const [open,setOpen]=React.useState(false);
    return React.createElement(React.Fragment,null,
      React.createElement("button",{ref:anchor,onClick:()=>setOpen(value=>!value),"data-test-menu":nested?"child":"root"},nested?"Child menu":"Font menu"),
      React.createElement(AnchoredPopover,{open,anchorRef:anchor,id:nested?"child-menu":"font-menu",ariaLabel:nested?"Child":"Font",onClose:()=>setOpen(false)},
        nested?React.createElement("button",{onClick:()=>{picked++;setOpen(false);}},"Apply font"):React.createElement(Menu,{nested:true})));
  }
  const m=await mount(React.createElement(Harness,{body:null,toolbar:React.createElement(Menu)}));
  try{
    const root=m.node.querySelector('[data-test-menu="root"]');await click(root);
    assert.equal(floating()?.dataset.editBarFloatingPanel,"font-menu");
    assert.equal(document.querySelector("[data-anchored-popover]"),null,"editor menu is rendered by the shared host");
    await click(currentBody().querySelector('[data-test-menu="child"]'));
    assert.equal(document.querySelectorAll("[data-edit-bar-floating-panel]").length,1);
    assert.equal(floating().dataset.editBarFloatingPanel,"child-menu");
    await click(floating().querySelector("[data-edit-bar-panel-back]"));
    assert.equal(floating().dataset.editBarFloatingPanel,"font-menu");
    await click(currentBody().querySelector('[data-test-menu="child"]'));
    await click(textButton(currentBody(),"Apply font"));assert.equal(picked,1);
    assert.equal(floating().dataset.editBarFloatingPanel,"font-menu");
    await act(async()=>document.body.dispatchEvent(new MouseEvent("click",{bubbles:true})));
    assert.equal(floating(),null);await click(root);assert.equal(floating().dataset.editBarFloatingPanel,"font-menu");
    await click(root);assert.equal(floating(),null);
  }finally{await m.destroy();}
});

test("PDF Find stage state is hosted below the bar, searches and closes without a separate stage overlay",async()=>{
  let stops=0;let visible=true;const bridge={stopFind(){stops++;},find:async()=>({total:1,active:0}),stepFind:()=>0};
  function StageFind(){const [open,setOpen]=React.useState(false);visible=open;return React.createElement(React.Fragment,null,React.createElement("button",{"data-find-source":true,onClick:()=>setOpen(v=>!v)},"Find"),open?React.createElement(EditBarPanelRequest,{id:"pdf-find",label:"查找",triggerSelector:'[data-edit-bar-drawer="editor-global"]',onClose:()=>setOpen(false)},React.createElement(PdfFindBar,{inline:true,bridge,onClose:()=>setOpen(false)})):null);}
  const stageContent=React.createElement(StageFind);const m=await mount(React.createElement(Harness,{body:null,stageContent,adapterId:"pdf"}));
  try{await click(m.node.querySelector("[data-find-source]"));assert.equal(floating().dataset.editBarFloatingPanel,"pdf-find");assert.ok(currentBody().querySelector('[aria-label="在文档里查找"]'));assert.equal(currentBody().querySelector('[data-pdf-find-bar]').className.includes("absolute"),false);await click(textButton(currentBody(),"关闭查找"));assert.equal(visible,false);assert.ok(stops>0);}finally{await m.destroy();}
});


test("standalone design/video chrome has a floating material library even without a workspace-left host",async()=>{
  const m=await mount(React.createElement(PluginChromeFrame,{pluginId:"image",title:"Canvas",showLibrary:true,onOpenLibrary(){throw new Error("external left-column delegate must not run")}},React.createElement("p",null,"Canvas")));
  try{await click(m.node.querySelector('[data-workspace-library-panel="materials"]'));assert.equal(floating()?.dataset.editBarFloatingPanel,"materials");assert.equal(m.node.querySelector('[data-workspace-library-panel="materials"]').getAttribute("aria-pressed"),"true");assert.ok(floating().querySelector("[data-material-insert]"));assert.equal(m.node.querySelector('aside [data-material-insert]'),null);await click(m.node.querySelector('[data-workspace-library-panel="materials"]'));assert.equal(floating(),null);}finally{await m.destroy();}
});

test("the real InlineAdvancedWorkbenchShell mounts the floating host for RichDoc Insert on Library detail",async()=>{
  moduleOverrides.set("src/shell/FloatingContextToolbar.tsx",dataModule(`import React from ${react}; export function useFloatingContextToolbar(){return {mode:'docked',dropActive:false,leading:null}} export function FloatingContextToolbar({documentSegment,children}){return React.createElement('div',{'data-workspace-edit-bar':true},documentSegment,children)}`));
  moduleOverrides.set("src/shell/use-advanced-autosave.ts",dataModule(`const saved={state:'saved',retry:async()=>({ok:true}),flushLatest:async()=>({ok:true}),handOffToBackground(){}}; export function useAdvancedAutoSave(){return saved}`));
  moduleOverrides.set("src/shell/InlineAdvancedWorkbenchHeader.tsx",dataModule(`import React from ${react}; export function InlineAdvancedWorkbenchHeader(){return React.createElement('div',{'data-real-shell-header':true},'Document')}`));
  const {InlineAdvancedWorkbenchShell}=await compiled("src/shell/InlineAdvancedWorkbenchShell.tsx");
  const body=React.createElement(RichDocControls,{editor:{editor:null,importing:false}});
  const adapter={id:'richdoc',label:'Document',stage:React.createElement('div',{'data-document-stage':true},'Saved document'),drawers:[{id:'editor-global',label:'插入',icon:'add',content:body}]};
  const m=await mount(React.createElement(InlineAdvancedWorkbenchShell,{item:{...item,meta:{advanced_editor_route:"richdoc"}},adapter,onClose(){}}));
  try{assert.ok(m.node.querySelector('[data-inline-editor] [data-document-stage]'));const trigger=m.node.querySelector('[data-edit-bar-drawer="editor-global"]');if(!trigger){const more=textButton(m.node,"更多属性");await click(more);} const actualTrigger=trigger || document.querySelector('[data-edit-bar-drawer="editor-global"]');assert.ok(actualTrigger,"创建工具应可在工具条或More访问");await click(actualTrigger);assert.equal(floating()?.dataset.editBarFloatingPanel,'editor-global');assert.equal(floating().closest('aside'),null);assertInsertBody();await click(actualTrigger);assert.equal(floating(),null);}finally{await m.destroy();}
});


test("PDF Signature renders its real inline body in the shared host and Cancel closes it",async()=>{
  const originalContext=window.HTMLCanvasElement.prototype.getContext;
  window.HTMLCanvasElement.prototype.getContext=()=>({clearRect(){},fillText(){}});
  let api; const body=React.createElement(PdfSignatureDialog,{inline:true,onPlace(){},onClose:()=>api.panels.closeDetail()});
  const m=await mount(React.createElement(Harness,{body,adapterId:"pdf",onReady:v=>{api=v;}}));
  try{await click(m.node.querySelector("[data-edit-bar-drawer]"));const signature=currentBody().querySelector('[data-pdf-signature-dialog]');assert.ok(signature);assert.equal(signature.getAttribute("aria-modal"),null);assert.equal(signature.parentElement.className.includes("absolute"),false);await click([...currentBody().querySelectorAll('[role="tab"]')].find(b=>b.textContent==='打字'));assert.ok(currentBody().querySelector('input[placeholder="输入你的名字"]'));await click(textButton(currentBody(),"取消"));assert.equal(floating(),null);}finally{await m.destroy();window.HTMLCanvasElement.prototype.getContext=originalContext;}
});


test("C3 rectangle anchors clamp inside the editor and a programmatic open still closes on outside click",async()=>{
  let api;const m=await mount(React.createElement(Harness,{body:React.createElement('p',null,'Tools'),onReady:v=>{api=v;}}));
  try{await act(async()=>api.panels.openDrawer('editor-global',undefined,rect(950,90,50,40)));assert.equal(floating().style.left,'676px');await act(async()=>document.body.dispatchEvent(new MouseEvent('click',{bubbles:true})));assert.equal(floating(),null);}finally{await m.destroy();}
});


test("PDF tool colors use the floating host, apply colors, and outside close preserves the drawing tool",async()=>{
  const changes=[];let toolChanges=0;const bridge={toolDefaults:()=>({strokeColor:'#FFCD45'}),setToolDefaults:(tool,patch)=>changes.push({tool,patch}),setTool(){toolChanges++;}};
  const stageContent=React.createElement(PdfToolPalette,{inline:true,bridge,activeTool:'highlight',triggerId:'editor-global'});
  const m=await mount(React.createElement(Harness,{body:null,stageContent,adapterId:'pdf'}));
  try{assert.equal(floating()?.dataset.editBarFloatingPanel,'pdf-tool-palette-highlight');await click(currentBody().querySelector('[role="radio"][aria-label="#597CE2"]'));assert.equal(changes[0].tool,'highlight');assert.equal(changes[0].patch.strokeColor,'#597CE2');await act(async()=>document.body.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true})));assert.equal(floating(),null);assert.equal(toolChanges,0,'closing a palette must not turn off the active drawing tool');}finally{await m.destroy();}
});


// Browser clicks include pointer/mouse events and native focus. Existing click-only
// tests never mounted conditionally opened controls through Strict Mode replay.
async function browserClick(target) {
  assert.ok(target, "browser click target exists");
  await act(async () => {
    const pointer = new MouseEvent("pointerdown", { bubbles:true, cancelable:true, button:0 });
    const pointerAllowed = target.dispatchEvent(pointer);
    if (pointerAllowed && target.dispatchEvent(new MouseEvent("mousedown", {bubbles:true,cancelable:true,button:0}))) target.focus();
  });
  await act(async () => {
    target.dispatchEvent(new MouseEvent("pointerup", {bubbles:true,cancelable:true,button:0}));
    target.dispatchEvent(new MouseEvent("mouseup", {bubbles:true,cancelable:true,button:0}));
    target.dispatchEvent(new MouseEvent("click", {bubbles:true,cancelable:true,button:0,detail:1}));
  });
}
const strict = children => React.createElement(React.StrictMode,null,children);

test("browser regression: More properties survives StrictMode effect replay and closes on its next real click",async()=>{
  const context={...gridUniverSelectionContext({revision:1,kind:"grid-cell",tt:s=>s}),bar:"text"};
  const toolbar=React.createElement(SelectionToolbar,{context,onCommand(){}});
  const m=await mount(strict(React.createElement(Harness,{body:null,toolbar,adapterId:"grid"})));
  try{
    const more=[...m.node.querySelectorAll("button")].find(b=>(b.getAttribute("aria-label")??'').includes("更多"));
    assert.equal(more.getAttribute("aria-expanded"),"false");
    await browserClick(more);
    assert.equal(more.getAttribute("aria-expanded"),"true");
    assert.ok(floating());assert.ok(currentBody().textContent.includes("数字格式"));
    await browserClick(more);assert.equal(more.getAttribute("aria-expanded"),"false");assert.equal(floating(),null);
    await act(async()=>new Promise(requestAnimationFrame));assert.equal(document.activeElement,more);
  }finally{await m.destroy();}
});

test("browser regression: narrow edit-bar More keeps the Insert creation tool reachable in StrictMode",async()=>{
  const originalRect=window.HTMLElement.prototype.getBoundingClientRect;
  window.HTMLElement.prototype.getBoundingClientRect=function(){
    if(this.hasAttribute('data-workspace-edit-bar')) return rect(600,90,60,40);
    if(this.hasAttribute('data-selection-measure-control-id')) return rect(0,0,100,28);
    return originalRect.call(this);
  };
  let api;
  const insert=creationToolControl({id:'creation:drawer:editor-global',tool:'elements',label:'插入',panelId:'editor-global'});
  const controls=[...Array.from({length:8},(_,i)=>({id:`extra-${i}`,kind:'action',label:`Extra ${i}`})),insert];
  const toolbar=React.createElement(EditBarRow,{controller:{},assistant:null},React.createElement(SelectionToolbar,{context:{version:1,kind:'creation',id:'narrow-creation',controls},onCommand:(command,anchor)=>{if(command.controlId===insert.id) api.library.toggleDrawer('editor-global',anchor);}}));
  const m=await mount(strict(React.createElement(Harness,{body:React.createElement(RichDocControls,{editor:{editor:null}}),toolbar,hideDocumentTools:true,onReady:v=>{api=v;}})));
  try{
    assert.equal(m.node.querySelector('[data-edit-bar-document-more]'),null);
    const more=m.node.querySelector('[aria-label="更多属性"]');assert.ok(more);
    await browserClick(more);assert.equal(more.getAttribute('aria-expanded'),'true');assert.ok(floating());
    const insertButton=document.querySelector('[data-selection-overflow-control][data-selection-control-id="creation:drawer:editor-global"] button');assert.ok(insertButton, '创建入口在窄栏时必须进入同一个More');await browserClick(insertButton);
    assert.equal(floating()?.dataset.editBarFloatingPanel,'editor-global');assertInsertBody();
  }finally{await m.destroy();window.HTMLElement.prototype.getBoundingClientRect=originalRect;}
});

test("browser regression: PDF Find and Signature stay open after their edit-bar click under StrictMode",async()=>{
  const originalContext=window.HTMLCanvasElement.prototype.getContext;
  window.HTMLCanvasElement.prototype.getContext=()=>({clearRect(){},fillText(){}});
  const bridge={stopFind(){},find:async()=>({total:0,active:-1})};
  function PdfTools(){
    const [find,setFind]=React.useState(false),[signature,setSignature]=React.useState(false);
    const actions=[{id:'pdf-tool-find',label:'查找',group:'edit',onTrigger:()=>setFind(v=>!v)},{id:'pdf-tool-signature',label:'签名',group:'edit',onTrigger:()=>setSignature(v=>!v)}];
    const stage=React.createElement(React.Fragment,null,
      find&&React.createElement(EditBarPanelRequest,{id:'pdf-find',label:'查找',triggerSelector:'[data-workspace-action-id="pdf-tool-find"]',onClose:()=>setFind(false)},React.createElement(PdfFindBar,{inline:true,bridge,onClose:()=>setFind(false)})),
      signature&&React.createElement(EditBarPanelRequest,{id:'pdf-signature',label:'签名',triggerSelector:'[data-workspace-action-id="pdf-tool-signature"]',onClose:()=>setSignature(false)},React.createElement(PdfSignatureDialog,{inline:true,onPlace(){},onClose:()=>setSignature(false)})));
    return React.createElement(Harness,{adapterInput:{id:'pdf',label:'PDF',actions,stage},body:null});
  }
  const m=await mount(strict(React.createElement(PdfTools)));
  try{
    for(const [id,panel,selector] of [['find','pdf-find','[data-pdf-find-bar]'],['signature','pdf-signature','[data-pdf-signature-dialog]']]){
      const button=m.node.querySelector(`[data-workspace-action-id="pdf-tool-${id}"]`);
      await browserClick(button);assert.equal(floating()?.dataset.editBarFloatingPanel,panel);assert.ok(currentBody().querySelector(selector));
      await browserClick(button);assert.equal(floating(),null,'same PDF edit-bar action closes its panel');
      await act(async()=>new Promise(requestAnimationFrame));assert.equal(document.activeElement,button);
      await browserClick(button);assert.equal(floating()?.dataset.editBarFloatingPanel,panel);
      await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(floating(),null);
    }
  }finally{await m.destroy();window.HTMLCanvasElement.prototype.getContext=originalContext;}
});

test("browser regression: the real image Replace control closes its material panel on the second click",async()=>{
  const controls=buildFabricImageToolbarControls({selected:{id:'image',kind:'image',locked:false,shadow:{enabled:false}},sourceReady:true,tt:s=>s});
  const replace=controls.find(control=>control.id==='replace');assert.ok(replace);
  const context={version:1,kind:'image-object',bar:'image',id:'image',controls:[replace]};
  const toolbar=React.createElement(SelectionToolbar,{context,onCommand(){}});
  let api;
  const m=await mount(strict(React.createElement(Harness,{body:null,toolbar,adapterId:'image',onReady:v=>{api=v;},materials:{actions:['insert','replace'],perform(){}}})));
  try{
    const trigger=[...m.node.querySelectorAll('button')].find(b=>(b.getAttribute('aria-label')??'').includes('替换'));
    await browserClick(trigger);assert.equal(floating()?.dataset.editBarFloatingPanel,'materials');
    assert.equal(api.panels.activeMaterialAction,'replace');
    await browserClick(trigger);assert.equal(floating(),null);assert.equal(api.panels.activeMaterialAction,'insert','closing Replace restores the normal insert action for later drops');
    await browserClick(trigger);assert.equal(floating()?.dataset.editBarFloatingPanel,'materials');
  }finally{await m.destroy();}
});

test("VP run 2: Sheet More → Number format survives native event checkpoints and keeps Back",async()=>{
  const commands=[],formats=[];
  function Sheet(){
    const [revision,setRevision]=React.useState(1);
    const context={...gridUniverSelectionContext({revision,kind:"grid-cell",tt:s=>s}),bar:"text"};
    // The real GridUniverStage routes every inspector command through this
    // executor; its Facade mutation updates the live context revision.
    const onCommand=command=>{
      commands.push(command);
      runGridUniverCommand(command.controlId,{range:{setNumberFormat(pattern){formats.push(pattern);setRevision(v=>v+1);}}},gridUniverCommandArgsFromValue(command.value));
    };
    return React.createElement(Harness,{body:null,toolbar:React.createElement(SelectionToolbar,{context,onCommand}),adapterId:"grid"});
  }
  const m=await mount(strict(React.createElement(Sheet)),{nativeCheckpoints:true});
  try{
    const more=[...m.node.querySelectorAll("button")].find(b=>(b.getAttribute("aria-label")??"").includes("更多"));
    await browserClick(more);
    const parent=floating().dataset.editBarFloatingPanel;
    await browserClick(textButton(currentBody(),"数字格式"));
    assert.equal(floating()?.dataset.editBarFloatingPanel,"selection-inspector-grid-number-format");
    const number=currentBody().querySelector('input[type="number"]');assert.ok(number);
    await act(async()=>{
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set.call(number,"3");
      number.dispatchEvent(new Event("input",{bubbles:true}));
    });
    await act(async()=>new Promise(requestAnimationFrame));
    assert.ok(formats.includes("#,##0.000"),"format change reaches the real sheet executor");
    assert.equal(currentBody().querySelector('input[type="number"]'),number,"live formatting keeps the focused field mounted");
    await act(async()=>number.blur());
    assert.ok(commands.some(command=>command.controlId==="decimals"));
    await browserClick(floating().querySelector("[data-edit-bar-panel-back]"));
    assert.equal(floating().dataset.editBarFloatingPanel,parent);
    assert.equal(more.getAttribute("aria-expanded"),"true");
    assert.ok(textButton(currentBody(),"数字格式"));
  }finally{await m.destroy();}
});

test("VP run 2: Sheet overflow inspectors retain their parent, position and commands through Back",async()=>{
  const commands=[];
  const context={...gridUniverSelectionContext({revision:1,kind:"grid-cell",tt:s=>s}),bar:"text"};
  const toolbar=React.createElement(SelectionToolbar,{context,onCommand:c=>commands.push(c)});
  const m=await mount(strict(React.createElement(Harness,{body:null,toolbar,adapterId:"grid"})),{nativeCheckpoints:true});
  try{
    const more=[...m.node.querySelectorAll("button")].find(b=>(b.getAttribute("aria-label")??"").includes("更多"));
    await browserClick(more);
    const parent=floating().dataset.editBarFloatingPanel;
    const position={left:floating().style.left,top:floating().style.top};
    for(const label of ["行操作","列操作","排序与筛选","条件格式","数据验证"]){
      const trigger=textButton(currentBody(),label);assert.ok(trigger,label);
      trigger.getBoundingClientRect=()=>rect(610,200,80,30);
      await browserClick(trigger);
      assert.ok(floating()?.querySelector("[data-edit-bar-panel-back]"),`${label} keeps Back`);
      assert.deepEqual({left:floating().style.left,top:floating().style.top},position,`${label} stays at its parent`);
      assert.equal(document.querySelectorAll("[data-edit-bar-floating-panel]").length,1);
      if(label==="行操作") await browserClick(textButton(currentBody(),"上方插入行"));
      await browserClick(floating().querySelector("[data-edit-bar-panel-back]"));
      assert.equal(floating().dataset.editBarFloatingPanel,parent);
      assert.ok(textButton(currentBody(),label));
    }
    assert.ok(commands.some(command=>command.controlId==="row-before"));
    await browserClick(more);assert.equal(floating(),null);
  }finally{await m.destroy();}
});

test("VP run 2: real document Link, Paragraph settings and Review keep Back at their overflow parent's position",async()=>{
  const actions=[];
  const chain=new Proxy({}, {get:(_,name)=>name==="run"?()=>true:(...args)=>{actions.push([name,...args]);return chain;}});
  const editor={state:{selection:{from:1,to:1},doc:{textBetween:()=>""}},isActive:()=>false,getAttributes:()=>({}),on(){},off(){},chain:()=>chain};
  const toolbar=React.createElement(RichDocContextToolbar,{editor:{editor,editRevision:1}});
  const m=await mount(strict(React.createElement(Harness,{body:null,toolbar})),{nativeCheckpoints:true});
  try{
    const more=[...m.node.querySelectorAll("button")].find(b=>(b.getAttribute("aria-label")??"").includes("更多"));
    await browserClick(more);
    const parent=floating().dataset.editBarFloatingPanel;
    const position={left:floating().style.left,top:floating().style.top};
    for(const label of ["超链接","段落设置","批注与修订"]){
      const trigger=textButton(currentBody(),label);assert.ok(trigger,label);
      trigger.getBoundingClientRect=()=>rect(610,240,80,30);
      await browserClick(trigger);
      assert.ok(floating()?.querySelector("[data-edit-bar-panel-back]"),`${label} keeps Back`);
      assert.deepEqual({left:floating().style.left,top:floating().style.top},position,`${label} stays at its parent`);
      if(label==="段落设置") {
        const field=[...currentBody().querySelectorAll("label")].find(node=>node.querySelector("span")?.textContent.trim()==="段前");
        const input=field?.querySelector('input[type="number"]');
        assert.ok(input,"段落设置 keeps the paragraph spacing control");
        await act(async()=>{
          input.focus();
          Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set.call(input,"3");
          input.dispatchEvent(new Event("input",{bubbles:true}));
        });
        await act(async()=>input.blur());
      }
      await browserClick(floating().querySelector("[data-edit-bar-panel-back]"));
      assert.equal(floating().dataset.editBarFloatingPanel,parent);
      assert.ok(textButton(currentBody(),label));
    }
    assert.ok(actions.some(([name,type,attrs])=>name==="updateAttributes"&&type==="paragraph"&&attrs.spaceBefore===3));
    await browserClick(more);assert.equal(floating(),null);
  }finally{await m.destroy();}
});

test("VP run 2: a nested panel replaces the body without moving to the child button",async()=>{
  let api;
  const body=React.createElement("button",{onClick:e=>api.panels.openTransientPanel("child","Child",React.createElement("input"),e.currentTarget)},"Child");
  const m=await mount(strict(React.createElement(Harness,{body,onReady:v=>{api=v;}})));
  try{
    await browserClick(m.node.querySelector("[data-edit-bar-drawer]"));
    const position={left:floating().style.left,top:floating().style.top};
    const child=textButton(currentBody(),"Child");child.getBoundingClientRect=()=>rect(610,240,80,30);
    await browserClick(child);
    assert.ok(floating().querySelector("[data-edit-bar-panel-back]"));
    assert.deepEqual({left:floating().style.left,top:floating().style.top},position);
  }finally{await m.destroy();}
});

test("VP run 2: changing selection or available controls still closes the old inspector and cancels its gesture",async()=>{
  for(const change of ["id","kind","epoch","controls"]){
    let changeSelection;const commands=[];
    const initial={...gridUniverSelectionContext({revision:1,kind:"grid-cell",tt:s=>s}),bar:"text"};
    function Sheet(){
      const [context,setContext]=React.useState(initial);
      changeSelection=()=>setContext(current=>({...current,[change]:change==="controls"?current.controls.filter(control=>control.id!=="decimals"):"different"}));
      return React.createElement(Harness,{body:null,toolbar:React.createElement(SelectionToolbar,{context,onCommand:c=>commands.push(c)}),adapterId:"grid"});
    }
    const m=await mount(strict(React.createElement(Sheet)),{nativeCheckpoints:true});
    try{
      await browserClick([...m.node.querySelectorAll("button")].find(b=>(b.getAttribute("aria-label")??"").includes("更多")));
      await browserClick(textButton(currentBody(),"数字格式"));
      assert.ok(commands.some(command=>command.phase==="start"));
      await act(async()=>changeSelection());
      assert.equal(floating(),null,`${change} invalidates the previous inspector`);
      assert.ok(commands.some(command=>command.phase==="cancel"),`${change} cancels the old field gesture`);
    }finally{await m.destroy();}
  }
});

test("VP run 2: nested placement stays clamped at the parent in all three hosts at 1440 and 1280",async()=>{
  const originalRect=window.HTMLElement.prototype.getBoundingClientRect;
  const originalWidth=window.innerWidth,originalHeight=window.innerHeight;
  try{
    for(const host of ["library","task","project"]) for(const width of [1440,1280]){
      Object.defineProperty(window,"innerWidth",{configurable:true,value:width});
      Object.defineProperty(window,"innerHeight",{configurable:true,value:width===1440?900:720});
      const left=host==="library"?262:739.515625;
      window.HTMLElement.prototype.getBoundingClientRect=function(){
        if(this.hasAttribute("data-editor-canvas")) return rect(left,110,width-6-left,window.innerHeight-154);
        if(this.hasAttribute("data-workspace-edit-bar")) return rect(left+20,66,width-46-left,38);
        if(this.hasAttribute("data-edit-bar-layer-root")) return rect(left,6,width-6-left,window.innerHeight-12);
        if(this.hasAttribute("data-edit-bar-drawer")) return rect(width-80,70,40,28);
        return originalRect.call(this);
      };
      let api;
      const body=React.createElement("button",{onClick:e=>api.panels.openTransientPanel("child","Child",React.createElement("input"),e.currentTarget)},"Child");
      const editor=React.createElement(Harness,{body,onReady:v=>{api=v;}});
      const m=await mount(strict(host==="library"?editor:React.createElement(SplitWorkspace,{left:"Conversation",right:editor})));
      try{
        await browserClick(m.node.querySelector("[data-edit-bar-drawer]"));
        const position={left:floating().style.left,top:floating().style.top};
        assert.equal(position.left,`${width-330}px`);
        assert.equal(position.top,"116px");
        const child=textButton(currentBody(),"Child");child.getBoundingClientRect=()=>rect(left+5,250,100,30);
        await browserClick(child);
        assert.deepEqual({left:floating().style.left,top:floating().style.top},position,`${host}/${width}`);
        await browserClick(floating().querySelector("[data-edit-bar-panel-back]"));
        assert.deepEqual({left:floating().style.left,top:floating().style.top},position);
      }finally{await m.destroy();}
    }
  }finally{
    window.HTMLElement.prototype.getBoundingClientRect=originalRect;
    Object.defineProperty(window,"innerWidth",{configurable:true,value:originalWidth});
    Object.defineProperty(window,"innerHeight",{configurable:true,value:originalHeight});
  }
});


test("instant inspector actions preserve the selection epoch",async()=>{
  const commands=[];
  const context={version:1,kind:'canvas-node',id:'node:epoch',revision:4,epoch:9,controls:[{id:'apply-local',kind:'action',label:'Apply locally',slot:'inspector',inspectorGroup:'adjust',inspectorLabel:'调色'}]};
  const toolbar=React.createElement(SelectionToolbar,{context,onCommand:command=>commands.push(command)});
  const m=await mount(React.createElement(Harness,{body:null,toolbar,hideDocumentTools:true}));
  try{
    const trigger=m.node.querySelector('[data-edit-bar-inspector-trigger]') || textButton(m.node,'调色');
    await click(trigger);
    await click(textButton(currentBody(),'Apply locally'));
    assert.equal(commands.length,1);
    assert.equal(commands[0].selectionRevision,4);
    assert.equal(commands[0].selectionEpoch,9);
  }finally{await m.destroy();}
});
