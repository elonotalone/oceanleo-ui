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
window.scrollTo = () => {};
window.Range.prototype.getBoundingClientRect = () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
window.Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} });

const noop = (name) => dataModule(`export function ${name}(){return null;}${name === "ComposerLibraryPicker" ? "export function warmComposerLibraryFiles(){}" : ""}`);
// Use the actual TemplateFillArea, Tiptap and ProseMirror keymaps, all from ESM.
const tiptap = ["@tiptap/react", "@tiptap/core", "@tiptap/pm/state", "@tiptap/extension-document",
  "@tiptap/extension-paragraph", "@tiptap/extension-text", "@tiptap/extension-placeholder", "@tiptap/extension-history"];
const dockModuleUrl = await compileModule("src/shell/cloud-computer/ComputerDock.tsx", {
  "../../lib/auth/client":dataModule("export async function getUserId(){return 'owner';}"),
  "../../i18n/ui/useUI":dataModule("export function useUI(){return text=>text;}"),
  "../../lib/cloud-computer-api":dataModule(`
    const computer={id:"cc-home",name:"Laptop",status:"active",node_online:true,source:"byo",enrolled_at:"now",confirmed_at:"now"};
    export const cloudComputerApi={async listComputers(){return {items:[computer]};},async getComputer(){return computer;},async listCliPrograms(){return {programs:[{id:"claude",installed:true,logged_in:true,version:"1"}]};}};
    export function writeMountedComputerId(){}export function writeMountedComputerName(){}
  `),
  "../../api/devices":dataModule("export async function listDevices(){return {ok:true,data:[]};}"),
  "../../lib/cloud-agent-api":dataModule("export async function listCloudAgentAvailability(){return {kind:'absent'};}"),
  "next/navigation":dataModule("export function useRouter(){return {push(){}};}"),
});
const composerModuleUrl = await compileModule("src/shell/LeoComposer.tsx", {
  "./cloud-computer/ComputerDock":dockModuleUrl,
  ...Object.fromEntries(tiptap.map((name) => [name, import.meta.resolve(name)])),
  "../i18n/ui/useUI": dataModule("export function useUI(){return text=>text;}"),
  "./mobile-native-actions": dataModule("export function useNativeAttachActions(){return [];}export function useNativeHandoffEntry(){return {action:null,panel:null};}export function useNativeTaskNotifications(){}export function requestTaskNotificationsOnce(){}"),
  "../lib/upload/use-attachment-intake": dataModule("export function useAttachmentIntake(){return {compressing:false,pending:[],inFlight:[],emit(){},handlePaste(){}};}"),
  "./composer-max-height": dataModule("export function useComposerMaxHeight(){return 280;}"),
  ...Object.fromEntries([["./LeoEntryButton","LeoEntryButton"],["./AttachmentStrip","AttachmentStrip"],
    ["./ModelPicker","ModelGroupPicker"],["./PluginsPopover","PluginsPopover"],["./PayerSelector","PayerSelector"],
    ["./mcp-apps","ComposerAppsBar"],["./ComposerLibraryPicker","ComposerLibraryPicker"]]
    .map(([path,name]) => [path,noop(name)])),
});
const { LeoComposer } = await import(composerModuleUrl);

async function mount({ value = "", ...config } = {}) {
  const container = document.createElement("div");document.body.append(container);const root = createRoot(container);
  const actions = { stopped: 0, sent: [] };let currentValue = value;
  function Host({ options }) {
    const [draft,setDraft] = React.useState(value);currentValue = draft;
    return React.createElement(LeoComposer, { loading: true, showComputerDock: false, showModelPicker: false,
      showPayerSelector: false, showPlugins: false, showAppsBar: false, ...options,
      modelPickerSlot: options.Picker ? React.createElement(options.Picker) : undefined,
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

test("home native conversation keeps a controlled real editor stable while typing", async () => {
  const view = await mount({ loading: false, conversation: {kind: "native", computerId: "cc-test", computerName: "Laptop", program: "claude", view: "chat"} });
  try {
    for (const char of "Repro home-back") {
      await act(async () => view.box.editor.commands.insertContent(char));
    }
    assert.equal(view.value, "Repro home-back");
    assert.equal(document.activeElement, view.box);
  } finally { await view.close(); }
});

const catalogModuleUrl = await compileModule("src/shell/acp-task/useAcpCatalogPicker.tsx", {
  "../../i18n/ui/useUI": dataModule("export function useUI(){return text=>text;}"),
  "../../lib/acp-frames-api": dataModule(`
    export * from ${JSON.stringify(new URL("../src/lib/acp-frames-api.ts", import.meta.url).href)};
    export function acpErrorText(error){return String(error);}
    export async function getCatalog(){await globalThis.__homeCatalogGate;return {models:{currentModelId:"selected", availableModels:[{modelId:"selected",name:"Selected model"}]}};}
  `),
  "../../lib/program-choice-api": dataModule("export function programChoiceFrom(){return {};}export async function getProgramChoice(){return {};}export async function putProgramChoice(){return {};}"),
  "../cloud-computer/native-surface/useProgramAccess": dataModule(`
    export function useProgramAccess(){return {programs:[],install:{},login:{},logout:{},setLoginCodeDraft(){},retryConnect(){}};}
  `),
});
const { useAcpCatalogPicker } = await import(catalogModuleUrl);
function HomeModelPicker(){ return useAcpCatalogPicker({computerId:"cc-home",program:"claude"}).picker; }

test("home native model pill and real controlled editor remain stable through typing and re-renders", async () => {
  const view = await mount({ loading:false, showModelPicker:true, Picker:HomeModelPicker,
    conversation:{kind:"native", computerId:"cc-home",computerName:"Laptop",program:"claude",view:"chat"} });
  try {
    for (const char of "Typing after computer selection") await act(async () => view.box.editor.commands.insertContent(char));
    assert.equal(view.value,"Typing after computer selection");
    assert.match(view.container.querySelector("[data-native-model-trigger]")?.textContent || "",/Selected model/);
  } finally { await view.close(); }
});

// Exercise the portal's real home hook too: its typing callbacks re-render the
// whole host, unlike a standalone editor. Keep network boundaries local.
const { pairedRepoUrl } = await import("./helpers/paired-repo-url.mjs");
const { fileURLToPath } = await import("node:url");
const { useTaskComposer } = await import(await compileModule(fileURLToPath(pairedRepoUrl("oceanleo", "app/_components/task-composer.tsx")), {
  "next/navigation":dataModule("export function usePathname(){return '/';}export function useRouter(){return {push(){}};}"),
  "@/lib/oceanleo-ai":dataModule("export async function getUserId(){return 'owner';}export async function isSignedIn(){return true;}export async function createAgentTask(){throw Error('unexpected create');}export async function transcribeAudioUrl(){throw Error('unexpected audio');}"),
  "@oceanleo/ui/shell":dataModule(`
    import React from ${JSON.stringify(import.meta.resolve("react"))};
    import {LeoComposer as RealComposer} from ${JSON.stringify(composerModuleUrl)};
    export {useAcpCatalogPicker} from ${JSON.stringify(catalogModuleUrl)};
    export {useTaskPending,putPending,settlePending} from ${JSON.stringify(new URL("../src/shell/acp-task/pending-send.ts",import.meta.url).href)};
    export function LeoComposer(props){globalThis.__homeComposerProps=props;return React.createElement(RealComposer,{...props,showAppsBar:false,showPlugins:false});}
    export function originalForPreparedFile(){} export function dimensionsForPreparedFile(){} export async function uploadComposerFile(){throw Error("unexpected upload");}
  `),
  "@oceanleo/ui/lib":dataModule(`
    export function parseTaskLink(){return null;}export function attachmentRef(){return null;}
    export const PRIVATE_ATTACHMENT_MAX_BYTES=20*1024*1024,PRIVATE_ATTACHMENT_TOO_LARGE="Too large";
    export function acpErrorText(e){return String(e);}export async function uploadFile(){throw Error("unexpected upload");}
    export async function createComputerTaskSession(){throw Error("unexpected create");}export async function send(){throw Error("unexpected send");}
    export function knownComputer(id){return id?{id,name:"Laptop",node_online:true}:null;}export const lastKnownComputer=knownComputer;
    export async function loadComputer(id){return knownComputer(id);}export function watchComputer(){return ()=>{};}
  `),
  "@oceanleo/ui/i18n":dataModule("const tr=text=>text;export function useT(){return tr;}export function useUI(){return tr;}"),
  "./auth-modal":dataModule("export function AuthModal(){return null;}"),
  "./pending-task-conversation":dataModule("export function PendingTaskConversation(){return null;}"),
  "sonner":dataModule("export const toast={error(){}};"),
}));

test("real home hook: native DOM typing and a late catalog preserve the editor and draft",async()=>{
  const container=document.createElement("div");document.body.append(container);const root=createRoot(container);
  function Home(){return useTaskComposer({siteId:"oceanleo",openAttachment(){}}).composer;}
  const originalError=console.error;
  const depthErrors=[];
  console.error=(...args)=>{
    const message=args.map(String).join(" ");
    if(/Maximum update depth|Minified React error #185/.test(message)) depthErrors.push(message);
    originalError(...args);
  };
  let releaseCatalog;
  globalThis.__homeCatalogGate=new Promise(resolve=>{releaseCatalog=resolve;});
  const {readComposerDraft,clearComposerDraft}=await import(await compileModule("src/shell/composer-draft.ts"));
  clearComposerDraft("home");
  try {
    await act(async()=>root.render(React.createElement(Home)));
    async function click(selector){
      for(let i=0;i<50&&!document.querySelector(selector);i++) await act(async()=>new Promise(resolve=>setTimeout(resolve,10)));
      const node=document.querySelector(selector);assert.ok(node,selector);
      await act(async()=>node.click());
    }
    await click("[data-oceanleo-cc-dock-trigger]");
    await click('[data-oceanleo-cc-switch-item="cc-home"]');
    await click('[data-dock-program-row="claude"]');
    await click('[data-dock-view="chat"]');
    for(let i=0;i<50&&!container.querySelector('[role="textbox"]')?.editor;i++) await act(async()=>new Promise(resolve=>setTimeout(resolve,10)));
    const box=container.querySelector('[role="textbox"]');assert.ok(box?.editor);
    // Native typing changes the DOM before ProseMirror reads it. Editor commands
    // alone miss the browser's MutationObserver / selection / controlled-value path.
    const text="Repro home-back: reply with the single word OK. Do not use any tools.";
    await act(async()=>{box.editor.commands.focus("end");await new Promise(resolve=>setTimeout(resolve,30));});
    for(const [index,char] of [...text].entries()) await act(async()=>{
      if(index===10) releaseCatalog();
      const paragraph=box.querySelector("p");
      paragraph.textContent=(paragraph.textContent || "")+char;
      document.getSelection().collapse(paragraph.firstChild,paragraph.textContent.length);
      box.dispatchEvent(new window.InputEvent("input",{bubbles:true,inputType:"insertText",data:char}));
      await new Promise(resolve=>setTimeout(resolve,0));
    });
    assert.equal(globalThis.__homeComposerProps.value,text);
    assert.equal(box.editor.getText(),text);
    assert.equal(document.activeElement,box);
    assert.match(container.querySelector("[data-native-model-trigger]")?.textContent || "",/Selected model/);
    assert.equal(readComposerDraft("home")?.text,text,"the real home draft follows native DOM input");
    assert.deepEqual(depthErrors,[],"React must not recover from an update-depth loop while typing");
  } finally {releaseCatalog();delete globalThis.__homeCatalogGate;await act(async()=>root.unmount());container.remove();clearComposerDraft("home");delete globalThis.__homeComposerProps;console.error=originalError;}
});
