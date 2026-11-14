import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { dirname, relative } from "node:path";
import React, { act, useMemo, useRef } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

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
const { EditBarDocumentSegment } = await compiled("src/shell/plugin-chrome/EditBarDocumentSegment.tsx");
const { RichDocControls } = await compiled("src/shell/doc-editors/RichDocControls.tsx");
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
const { PdfSelectionBar } = await compiled("src/shell/media-editors/PdfSelectionBar.tsx");
const { SelectionToolbar } = await compiled("src/shell/SelectionToolbar.tsx");
const { AnchoredPopover } = await compiled("src/shell/anchored-popover.tsx");
const { gridUniverSelectionContext } = await compiled("src/shell/doc-editors/grid-univer/stage-plan.ts");
moduleOverrides.set("src/shell/plugin-chrome/agent-drawer-panel.tsx",dataModule(`import React from ${react}; export function createPluginAgentDrawer(){return {id:'agent',label:'AI',content:React.createElement('div',{'data-chrome-agent':true},'AI')}}`));
const { PluginChromeFrame, usePluginChromePanelHost } = await compiled("src/shell/plugin-chrome/PluginChromeFrame.tsx");

const rect = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height, width, height, x: left, y: top, toJSON(){} });
window.HTMLElement.prototype.getBoundingClientRect = function() {
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
async function mount(element) {
  const node = document.createElement("div"); document.body.append(node);
  const root = createRoot(node); await act(async () => root.render(element));
  return { node, async destroy(){ await act(async () => root.unmount()); node.remove(); } };
}
async function click(node) { assert.ok(node, "click target exists"); await act(async () => node.dispatchEvent(new MouseEvent("click", { bubbles: true }))); }
const textButton = (root, label) => [...root.querySelectorAll("button")].find(node => node.textContent.trim() === label || node.getAttribute("aria-label") === label);
const floating = () => document.querySelector("[data-edit-bar-floating-panel]");
const currentBody = () => floating()?.querySelector('[data-edit-bar-panel-current="true"]');
const item = { id: "a", artifactId: "a", kind: "document", title: "Document", meta: {} };
function Harness({ body, id = "editor-global", adapterId = "richdoc", onReady, materials, toolbar, stageContent }) {
  const pane = useWorkspacePane(); const stageRef = useRef(null); const layerRef = useRef(null);
  const adapter = useMemo(() => ({ id: adapterId, label: "Editor", drawers: [{ id, label: "插入", icon: "add", content: body }], upload: { onFiles(){} } }), [adapterId, body, id]);
  const panels = useInlineAdvancedPanels({ adapter, item, siteId: "oceanleo", accent: "#456", ownerId: "test-editor", pluginThemeId: "richdoc", workbenchMaterials: materials ?? null, showWorkspaceDetail: pane?.showDetail, clearWorkspaceDetail: pane?.clearDetail, workspaceLeftHidden: pane?.leftHidden, ownedWorkspaceDetailId: pane?.detail?.ownerId === "test-editor" ? pane.detail.id : null, onLocalUpload: () => onReady?.upload?.() });
  const library = useInlineLibraryPanels({ panels, item, siteId: "oceanleo", mineLabel: "我的库", activateMineItem: async () => ({ok:true}) });
  const layout = useMemo(() => ({ hostPanelVisible: Boolean(panels.floatingPanels.active), editorToolActive: Boolean(panels.floatingPanels.active), activeDrawerId: panels.activeDrawerId, activeTransientPanelId: panels.transientPanel?.id ?? "", openDrawer: panels.openDrawer, openTransientPanel: panels.openTransientPanel, updateTransientPanel: panels.updateTransientPanel, closeDrawer: panels.closeDrawer }), [panels]);
  if (typeof onReady === "function") onReady({ panels, library, pane });
  return React.createElement(EditBarPanelContext.Provider,{value:panels.floatingPanels}, React.createElement(AdvancedLayoutContext.Provider, { value: layout }, React.createElement("div", { ref: layerRef, "data-edit-bar-layer-root":true },
    React.createElement("div", { "data-workspace-edit-bar":true }, toolbar,
      React.createElement(EditBarDocumentSegment, { actions: [], onTrigger(){}, drawers: panels.editBarDrawers, activeDrawerId: library.openDrawerId, onToggleDrawer: library.toggleDrawer }),
      React.createElement("button", { "data-assets-button": true, onClick: e => library.openLibraryPanel("materials", e.currentTarget) }, "素材库"),
      React.createElement("button", { "data-ai-button": true, onClick: () => panels.openDrawer("agent") }, "AI")),
    React.createElement("div", { ref:stageRef, "data-editor-canvas": true }, stageContent ?? "Canvas"),
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
    let api; let font;
    const chain = new Proxy({}, {get:(_,name) => name === "run" ? () => true : value => { if(name === "setFontFamily") font=value; return chain; }});
    const state = { editor:{getAttributes:()=>({}), chain:()=>chain}, importing:false };
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
      await click(textButton(currentBody(), "查找和替换（Ctrl/Cmd+F）"));
      assert.ok(currentBody().querySelector('[aria-label="查找内容"]'));
      await click([...currentBody().querySelectorAll("button")].find(b => b.textContent.includes("Aptos")));
      assert.match(font,/Aptos/);
      await act(async () => document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true})));
      assert.equal(floating(),null); assert.equal(document.activeElement,trigger);
      await click(trigger); await click(trigger); assert.equal(floating(),null,"same button closes");
      await click(trigger); await act(async()=>document.body.dispatchEvent(new MouseEvent("pointerdown",{bubbles:true}))); assert.equal(floating(),null,"outside closes");
      await click(trigger); await click(textButton(floating(),"关闭")); assert.equal(floating(),null);
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

test("PDF annotation opacity inspector opens in the floating host and edits the annotation",async()=>{
  const updates=[]; const toolbar=React.createElement(PdfSelectionBar,{bridge:{updateAnnotation:(_s,p)=>updates.push(p)},selected:{id:"note",type:1,contents:"Hello",opacity:1},activeTool:null,version:1,readOnly:false,accent:"#456"});
  const m=await mount(React.createElement(Harness,{body:null,toolbar,adapterId:"pdf"}));
  try{const buttons=[...m.node.querySelectorAll("button")];const trigger=buttons.find(b=>/透明度/.test(b.getAttribute("aria-label")??b.textContent));await click(trigger);assert.ok(floating());const number=currentBody().querySelector('input[type="number"]');assert.ok(number);await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set.call(number,"50");number.dispatchEvent(new Event("input",{bubbles:true}));number.dispatchEvent(new Event("change",{bubbles:true}));});await act(async()=>number.dispatchEvent(new Event("blur",{bubbles:true})));assert.ok(currentBody().textContent.includes("透明度")); assert.ok(updates.length > 0,"opacity gesture reaches the PDF bridge");}finally{await m.destroy();}
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
  try{assert.ok(m.node.querySelector('[data-inline-editor] [data-document-stage]'));const trigger=m.node.querySelector('[data-edit-bar-drawer="editor-global"]');await click(trigger);assert.equal(floating()?.dataset.editBarFloatingPanel,'editor-global');assert.equal(floating().closest('aside'),null);assert.ok(currentBody().textContent.includes('文档来源'));await click(trigger);assert.equal(floating(),null);}finally{await m.destroy();}
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
