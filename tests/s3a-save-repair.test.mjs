/** Real routes and real editor hooks. Only canvas/WASM UI, network and host chrome are replaced. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, basename, resolve } from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import React, { act } from "react";
import { PDFDocument } from "pdf-lib";
import { Doc, applyUpdate } from "yjs";
import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import { compileModule, dataModule, realModule } from "./helpers/module-bench.mjs";
import { inlineSaveHost, tabContextUrl, TabContext } from "./helpers/s3a-inline-save-host.mjs";
import { createPdfViewerBridge } from "../src/shell/media-editors/pdf-viewer-bridge.ts";
import { normalizeDeckDocument } from "../src/shell/doc-editors/deck-schema.ts";
import { DECK_WORKING_COPY_SCHEMA } from "../src/shell/doc-editors/deck-working-copy.ts";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvas = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvas) require.cache[canvasEntry] = previousCanvas; else delete require.cache[canvasEntry];
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://example.invalid/workspace", pretendToBeVisual: true });
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, Event: dom.window.Event, localStorage: dom.window.localStorage })) Object.defineProperty(globalThis, key, { configurable: true, value });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
const { createRoot } = await import("react-dom/client");
const probe = globalThis.__s3a = { adapter: null, deck: null, input: null, saved: [], uploaded: [], release: null, fail: false, remote: null, pdfDoc: null };
const empty = (...names) => dataModule(names.map((name) => `export function ${name}(){return null;}`).join("\n"));
// Read S2's exact shared sources for integration verification without editing its files.
const sharedPath=(path)=>resolve(process.env.S3A_SHARED_REPAIR_DIR||".",path);
const authStubs = {
  "./plugin-command/use-library-edit": dataModule(`export function useLibraryEditReadOnly(){return false;}export function useLibraryEditReload(){return 0;}export function useLibraryEditorBinding(item){return {phase:'idle',item,reload:0};}export function useLibraryEditState(item){return [null,{phase:'idle',item,reload:0}];}export function LibraryEditStatus(){return null;}`),
  "../lib/auth/client": dataModule('export async function accessToken(){return "test";}'),
  "../lib/auth/config": dataModule('export function isLeoDevPreviewHost(){return false;} export const GATEWAY_BASE="https://gateway.invalid",SUPABASE_URL="https://database.invalid";'),
  "./user-edit-session": realModule("src/shell/user-edit-session.ts"),
};
const hookUrl = await compileModule(sharedPath("src/shell/use-advanced-autosave.ts"), authStubs);
const inlineUrl = await inlineSaveHost(hookUrl, authStubs, sharedPath);
const backgroundUrl = await compileModule(sharedPath("src/shell/advanced-background-saver.ts"), authStubs);
const { resetBackgroundSaverForTests } = await import(backgroundUrl);
const collabIndex = dataModule(`
  import {useContext,useSyncExternalStore} from ${JSON.stringify(reactUrl)};
  import {TabContext} from ${JSON.stringify(tabContextUrl)};
  import {canSaveVersion,isCollabReadOnly} from ${JSON.stringify(realModule("src/shell/collab/provider.ts"))};
  export {bindJsonState} from ${JSON.stringify(realModule("src/shell/collab/bind-json-state.ts"))};
  export function useCollabRoom(){return useContext(TabContext)?.room??globalThis.__s3a.room??null;}
  export function useCollabRoomVersion(room){return useSyncExternalStore(cb=>room?.subscribe(cb)??(()=>{}),()=>room?.version??0,()=>0);}
  export function useCollabReadOnly(room){useCollabRoomVersion(room);return isCollabReadOnly(room);}
  export function useCollabSaveGate(room){useCollabRoomVersion(room);return canSaveVersion(room);}
`);
const collabStubs={"../index":collabIndex,"../../../lib/im/client":dataModule('export function useImEnabled(){return true;}'),"../../../i18n/ui/useUI":dataModule('const tt=x=>x;export function useUI(){return tt;}')};
const pdfCollabUrl=await compileModule("src/shell/collab/adapters/use-pdf-collab.ts",collabStubs);
const entityCollabUrl=await compileModule("src/shell/collab/adapters/use-entity-collab.ts",collabStubs);
const baseline = process.env.S3A_REPAIR_BASELINE === "1";
const temporaryFiles=[];process.on("exit",()=>temporaryFiles.forEach(file=>{try{unlinkSync(file);}catch{}}));
async function fromBaseline(path, overrides) {
  const file = resolve(dirname(path), `.s3a-baseline-${basename(path)}`);
  writeFileSync(file, execFileSync("git",["show",`c74d903c:${path}`]));
  temporaryFiles.push(file);return compileModule(file, overrides);
}
const stubs = {
  "../plugin-command/use-library-edit": dataModule(`export function useLibraryEditReadOnly(){return false;}export function useLibraryEditReload(){return 0;}export function useLibraryEditorBinding(item){return {phase:'idle',item,reload:0};}export function useLibraryEditState(item){return [null,{phase:'idle',item,reload:0}];}export function LibraryEditStatus(){return null;}`),
  "./plugin-command/use-library-edit": dataModule(`export function useLibraryEditReadOnly(){return false;}export function useLibraryEditReload(){return 0;}export function useLibraryEditorBinding(item){return {phase:'idle',item,reload:0};}export function useLibraryEditState(item){return [null,{phase:'idle',item,reload:0}];}export function LibraryEditStatus(){return null;}`),
  "../../i18n/ui/useUI": dataModule('const tt=(s)=>s; export function useUI(){return tt;}'),
  "../AdvancedWorkbenchShell": dataModule(`import {createElement,useContext} from ${JSON.stringify(reactUrl)};import {TabContext} from ${JSON.stringify(tabContextUrl)};import {useAdvancedAutoSave} from ${JSON.stringify(hookUrl)};import {InlineAdvancedWorkbenchShell} from ${JSON.stringify(inlineUrl)};function Bench({adapter,item}) {const p=adapter.persistence;const save=useAdvancedAutoSave({item,editorId:adapter.id,dirty:p.dirty,revision:p.editRevision,flush:p.flush,preparePublish:p.preparePublish,recovery:p.recovery,session:null});globalThis.__s3a.save=save;return createElement("div",{"data-save-state":save.state},adapter.stage);}export function AdvancedWorkbenchShell(props){const tab=useContext(TabContext);if(tab)tab.adapter=props.adapter;globalThis.__s3a.adapter=props.adapter;return createElement(globalThis.__s3a.inline?InlineAdvancedWorkbenchShell:Bench,props);}`),
  "../advanced-session-context": dataModule('export function useAdvancedSession(){return null;}'),
  "../office-editor": dataModule('export function useOfficeArtifactSource(item){return {item, loading:false,error:"",resourceFailed(){},retry(){}};}'),
  "../collab/adapters/use-entity-collab": dataModule(`import {useEntityCollab as useReal} from ${JSON.stringify(entityCollabUrl)};export function useEntityCollab(options){globalThis.__s3a.remote=options.applyRemote;return useReal(options);}`),
  "../collab/adapters/visual-selection": dataModule('export function useCollabSelections(){return [];}'),
  "../plugin-command": dataModule('export function useEditorContext(){}'),
  "../doc-editors/use-deck-material-adapter": empty("useDeckMaterialAdapter"),
  "../doc-editors/DeckStage": dataModule(`import {createElement,useContext} from ${JSON.stringify(reactUrl)};import {TabContext} from ${JSON.stringify(tabContextUrl)}; export function DeckStage({editor}) {const tab=useContext(TabContext);if(tab)tab.editor=editor;globalThis.__s3a.deck=editor;return createElement("button",{"data-edit":"deck",onClick:()=>editor.setTitle("Edited slides")},"Edit slides");}`),
  "../doc-editors/use-deck-selection-adapter": dataModule('export function useDeckSelectionAdapter(){return {context:null,dispatch(){}};}'),
  "../doc-editors/DeckCreationPanels": empty("DeckDrawPanel", "DeckLinePanel", "DeckNotesPanel"),
  "../doc-editors/DeckControls": empty("DeckDesignPanel", "DeckElementsPanel", "DeckTextPanel"),
  "../doc-editors/DeckPresenterView": empty("DeckPresenterView", "openDeckPresenterWindow"),
  "./office-file": dataModule('export async function fetchValidatedOfficePackage(){return {arrayBuffer:new ArrayBuffer(4)};} export function notifyOfficeAccessDenied(){} export async function validateOfficePackageBlob(){return new ArrayBuffer(4);}'),
  "./pptx-deck-import": dataModule(`import {normalizeDeckDocument} from ${JSON.stringify(realModule("src/shell/doc-editors/deck-schema.ts"))}; export async function importPptxDeck(){if(globalThis.__s3a.fixtureDeck)return globalThis.__s3a.fixtureDeck;return normalizeDeckDocument({title:"Opened slides",slides:[{id:"slide",elements:[{id:"text",type:"text",text:"Hello"},{id:"picture",type:"image",src:"https://example.invalid/media.png"}]}]});}`),
  "./doc-io": dataModule(`export * from ${JSON.stringify(realModule("src/shell/doc-editors/doc-io.ts"))};import {saveFileToLibraryWithDependencies} from ${JSON.stringify(realModule("src/shell/doc-editors/doc-io.ts"))}; export async function saveFileToLibrary(input){if(globalThis.__s3a.publicationDeps)return saveFileToLibraryWithDependencies(input,globalThis.__s3a.publicationDeps);return {ok:true,item:{...input.item,revisionId:"published"},url:"https://example.invalid/published.pptx",versionId:"published",revisionId:"published"};}`),
  "./editor-preview-raster": dataModule('export async function renderDeckPreviewPng(doc){globalThis.__s3a.frozenDeck=structuredClone(doc);return new Blob(["preview"]);}'),
  "./editor-insert-media": dataModule('export async function uploadEditorMedia(blob,name){globalThis.__s3a.uploaded.push({blob,name});return "https://example.invalid/upload.png";} export async function durableEditorMediaUrl(url){if(!/^(data:|blob:)/.test(url))return url;globalThis.__s3a.uploaded.push(url);return "https://example.invalid/upload.png";}'),
  "../collab/adapters/use-pdf-collab": pdfCollabUrl,
  "../plugin-theme": dataModule('export function PluginThemeScope({ children }) { return children; }\n  export function usePluginTheme(){return {theme:"light"};}'),
  "../workbench-material-provider": dataModule('export function useWorkbenchMaterialAdapter(){}'),
  "../media-editors/PdfControls": dataModule(`import {createElement} from ${JSON.stringify(reactUrl)};export function PdfControls({onRotate}){return createElement("button",{"data-rotate":"pdf",onClick:()=>onRotate(0)},"Rotate");}`),
  "../media-editors/PdfFindBar": empty("PdfFindBar"),
  "../media-editors/use-pdf-selection-adapter": dataModule('export function usePdfSelectionAdapter(){return {context:null,dispatch(){}};}'),
  "../media-editors/PdfToolPalette": dataModule('export function PdfToolPalette(){return null;}export function pdfSelectionBarVisible(){return false;}'),
  "../media-editors/PdfSignatureDialog": empty("PdfSignatureDialog"),
  "./pdf-cjk-appearance": dataModule("export async function fixPdfCjkFreeTextAppearances(bytes){return {bytes,fixed:0};}"),
  "./pdf-source": dataModule('export async function loadInitialPdfSource(){const fixture=globalThis.__s3a.fixturePdf;return {bytes:fixture?.bytes??new Uint8Array([1,2,3]),durableUrl:"https://example.invalid/source.pdf",pageCount:fixture?.pages.length??3,blank:false};}'),
  "./pdf-working-copy-publish": dataModule('export async function applyPdfPageOperations(bytes){return bytes;}export async function pdfWorkingSource(){return new Uint8Array([1,2,3]);}export async function buildPdfWorkingCopy(doc){globalThis.__s3a.buildCalls++;if(globalThis.__s3a.visualBarrier)await globalThis.__s3a.visualBarrier;return new Uint8Array([1,2,3]);}'),
  "./pdf-library-save": dataModule('export async function savePdfBytesToLibrary(input){globalThis.__s3a.input=input;return {ok:true,url:"https://example.invalid/saved.pdf",versionId:"pdf-2",revisionId:"pdf-2",item:{...input.item,revisionId:"pdf-2",url:"https://example.invalid/saved.pdf"}};}'),
  "./pdf-operations": dataModule('export async function inspectPdf(){return 3;}export async function rotatePdfPage(bytes){return bytes;}export async function deletePdfPage(bytes){return bytes;}export async function movePdfPage(bytes){return bytes;}'),
};

stubs["../doc-editors/editor-insert-media"] = stubs["./editor-insert-media"];

function makePdfStageHandle() {
  let objects = [];
  const hooks = new Set();
  let active = "pdf";
  const task = (value) => ({ toPromise: async () => value });
  const emit = () => hooks.forEach((cb) => cb({ documentId: active }));
  const scope = {
    getState: () => ({ activeToolId: null, selectedUids: [] }), getSelectedAnnotation: () => null,
    getAnnotations: () => objects.map((object) => ({ object })), setActiveTool() {}, setLocked() {},
    createAnnotation(_page, object) { objects.push(object); emit(); },
    updateAnnotation(_page, id, patch) { objects = objects.map((object) => object.id === id ? { ...object, ...patch } : object); emit(); },
    deleteAnnotation(_page, id) { objects = objects.filter((object) => object.id !== id); emit(); },
    selectAnnotation() {}, commit: () => task(true), exportAnnotations: () => task([]),
  };
  const pages = probe.fixturePdf?.pages ?? Array.from({ length: 3 }, (_, index) => ({ index, rotation: 0, size: { width: 400, height: 600 } }));
  const plugins = {
    export: {forDocument:()=>({saveAsCopy:()=>{probe.exports++;return {toPromise:async()=>{if(probe.visualBarrier)await probe.visualBarrier;return new ArrayBuffer(3);}};}})},
    "document-manager": { getActiveDocumentId: () => active, getActiveDocument: () => ({ pages }), onDocumentOpened: () => () => {}, openDocumentBuffer: () => task({ documentId: "restored", task: task(undefined) }), setActiveDocument(id) { active = id; objects = []; }, closeDocument: () => task(undefined) },
    history: { forDocument: () => ({ canUndo: () => objects.length > 0, canRedo: () => false }), onHistoryChange(cb) { hooks.add(cb); return () => hooks.delete(cb); } },
    annotation: { forDocument: () => scope, onStateChange: () => () => {}, getTool: () => ({ defaults: {} }) },
    form: { forDocument: () => ({ getFormValues: () => ({}), setFormValues: () => task(true) }) },
  };
  const bridge = createPdfViewerBridge({ getPlugin: (id) => plugins[id] ? { provides: () => plugins[id] } : null }, "PDF");
  return { bridge, viewport: () => null };
}
probe.makePdfStageHandle = makePdfStageHandle;
stubs["next/dynamic"] = dataModule(`import {createElement,useEffect,useState} from ${JSON.stringify(reactUrl)}; export default function dynamic(){return function Stage({bytes,onHandle}) {useEffect(()=>{if(!bytes)return;const handle=globalThis.__s3a.makePdfStageHandle();globalThis.__s3a.pdfBridge=handle.bridge;onHandle(handle);return ()=>onHandle(null);},[bytes,onHandle]);return createElement("button",{"data-edit":"pdf",onClick:()=>globalThis.__s3a.pdfBridge.createAnnotation(0,{id:"edited",type:3,pageIndex:0,contents:"Edited PDF",rect:{origin:{x:10,y:10},size:{width:100,height:30}}})},"Edit PDF");};}`);
if (baseline) {
  stubs["./DeckMutationPolicy"] = await fromBaseline("src/shell/doc-editors/DeckMutationPolicy.ts", stubs);
  stubs["../doc-editors/use-deck-editor"] = await fromBaseline("src/shell/doc-editors/use-deck-editor.ts", stubs);
  stubs["../media-editors/use-pdf-workbench"] = await fromBaseline("src/shell/media-editors/use-pdf-workbench.ts", stubs);
}
const { DeckRoute } = await import(await compileModule("src/shell/advanced-routes/DeckRoute.tsx", stubs));
const { PdfRoute } = await import(await compileModule("src/shell/advanced-routes/PdfRoute.tsx", stubs));

const item = (kind) => ({ key: `library:${kind}`, id: "initial", artifactId: `${kind}-root`, revisionId: "initial", title: kind, source: "library", kind, url: `https://example.invalid/source.${kind === "ppt" ? "pptx" : "pdf"}`, meta: {} });
async function mount(Component, source, tab=null) {
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  const element=(source)=>React.createElement(TabContext.Provider,{value:tab},React.createElement(Component,{item:source,onClose(){}}));
  await act(async () => { root.render(element(source)); });
  for (let i = 0; i < 30 && !(tab?.adapter??probe.adapter)?.persistence?.recovery?.ready; i++) await tick();
  await tick();
  return { container, async render(source) { await act(async () => root.render(element(source))); await tick(); }, async unmount() { await act(async () => root.unmount()); container.remove(); } };
}
async function tick() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); }
async function noErrors(run) {
  const errors = []; const previous = console.error; console.error = (...args) => errors.push(args.join(" "));
  try { await run(); assert.deepEqual(errors, [], errors.join("\n")); } finally { console.error = previous; }
}


const wait = (ms) => new Promise((done) => setTimeout(done, ms));
const tickUntil = async (condition) => { for(let n=0;n<100&&!condition();n++) await act(async()=>{await wait(5);});assert.ok(condition()); };
let copy = null, puts = [], getDelay = 0;
probe.putDelay=0;probe.exports=0;probe.buildCalls=0;
globalThis.fetch = async (url,init={}) => {
  const method=init.method||"GET";
  if(String(url).includes("editor-working-copies")) {
    if(method==="GET") {if(getDelay)await wait(getDelay);return new Response(copy?JSON.stringify(copy):"{}",{status:copy?200:404});}
    if(method==="POST") {probe.pointers.push(JSON.parse(init.body));return new Response("{}");}
    if(method==="PUT") {
      const at=performance.now();
      let text;
      if(typeof init.body==="string")text=init.body;
      else {const {gunzipSync}=await import("node:zlib");text=gunzipSync(new Uint8Array(init.body)).toString();}
      const body=JSON.parse(text);
      const sender=init.headers.Authorization==="Bearer test-a"?"a":init.headers.Authorization==="Bearer test-b"?"b":"default";
      puts.push({at,body,sender});
      if(probe.putDelay)await wait(probe.putDelay);
      if(probe.cas&&body.if_seq!==(copy?.seq??null)){probe.collisions++;return new Response(JSON.stringify({ok:false,code:"stale",seq:copy?.seq??0,saved_at:copy?.saved_at??new Date().toISOString()}),{status:409});}
      const seq=(copy?.seq||0)+1;
      copy={schema:body.schema,seq,published_seq:0,base_revision_id:body.base_revision_id,saved_at:new Date().toISOString(),doc:body.doc};
      probe.acks.push({sender,seq,doc:body.doc});
      return new Response(JSON.stringify({ok:true,seq,saved_at:copy.saved_at,server_ms:0}));
    }
  }
  throw new Error("Unexpected network endpoint");
};
function reset(){resetBackgroundSaverForTests();copy=null;puts=[];getDelay=0;probe.putDelay=0;probe.exports=0;probe.buildCalls=0;probe.visualBarrier=null;probe.cas=false;probe.collisions=0;probe.acks=[];probe.pointers=[];}
async function close(view){probe.visualBarrier=null;await view.unmount();await act(async()=>{await wait(20);});resetBackgroundSaverForTests();}

function room(options={}) {
  const listeners=new Set();
  return {doc:new Doc(),role:"editor",status:"synced",isSaver:true,needsSeed:false,version:0,self:{id:"self",name:"Editor"},lock:null,
    subscribe(cb){listeners.add(cb);return ()=>listeners.delete(cb);},
    acquireLock:async()=>false,releaseLock(){},onExternalRevision:()=>()=>{},markSaved(){},completeSeed(){},
    ...options};
}

function deckPublication(source) {
  const staged=new Map(),commits=[];
  return {staged,commits,dependencies:{
    now:()=>new Date("2026-11-15T01:30:00Z"),
    uploadFile(){throw new Error("typed Deck uses private staging");},
    saveCreations(){throw new Error("publishing must retain the same root");},
    async stageArtifactBlob(root,file){
      assert.equal(root,source.artifactId);
      const bytes=new Uint8Array(await file.arrayBuffer());
      const blobId=`blob-${staged.size+1}`,digest=createHash("sha256").update(bytes).digest("hex");
      staged.set(blobId,{file,bytes,digest});
      return {ok:true,data:{blobId,digest}};
    },
    async createArtifactRevision(root,commit){
      commits.push(commit);const revisionId=`published-${commits.length}`;
      if(probe.publishBarrier)await probe.publishBarrier;
      const rendition=(part,purpose)=>({purpose,revisionId,digest:part.digest,url:`https://example.invalid/${revisionId}/${purpose}`,mediaType:purpose==="preview"?"image/png":"application/vnd.openxmlformats-officedocument.presentationml.presentation"});
      assert.equal(staged.get(commit.source.blobId||commit.source.url).digest,commit.source.digest);
      return {ok:true,data:{...source,artifactId:root,revisionId,artifactType:"deck",meta:{},artifact:{sourceFormat:"pptx",renditions:{source:rendition(commit.source,"source"),...Object.fromEntries(commit.renditions.map(part=>[part.purpose,rendition(part,part.purpose)]))}}}};
    },
  }};
}

test("run4 native Deck source/full and bitmap cover satisfy the actual backend contract without a manifest",()=>{
  const script=`
from app.typed_artifact_models import ArtifactContentInput
from pydantic import ValidationError
a,b,c='a'*64,'b'*64,'c'*64
mime='application/vnd.openxmlformats-officedocument.presentationml.presentation'
blob=lambda sha,media:{'sha256':sha,'byte_size':1000,'media_type':media,'storage_bucket':'project-assets','storage_key':'tests/'+sha}
rendition=lambda purpose,sha,media,fmt:{'purpose':purpose,'blob_sha256':sha,'media_type':media,'format':fmt,'metadata':{'derivation':{'sourceDigest':a}}}
doc={'title':'Native Deck','artifact_type':'deck','roles':['document'],'editability':'native','editor_capability':'deck-editor','source_format':'pptx','content_digest':a,'blobs':[blob(a,mime),blob(b,'image/png')],'renditions':[rendition('source',a,mime,'pptx'),rendition('full',a,mime,'pptx'),rendition('preview',b,'image/png','png'),rendition('thumbnail',b,'image/png','png')],'provenance':{'source_kind':'user_upload','rights_asserted':True}}
ArtifactContentInput.model_validate(doc)
doc['blobs'].append(blob(c,'application/json'))
doc['renditions'].append(rendition('editor_manifest',c,'application/json','oceanleo.deck.v1'))
try:
 ArtifactContentInput.model_validate(doc)
 raise AssertionError('legacy Deck manifest unexpectedly accepted')
except ValidationError as error:
 assert 'deck editor manifests are no longer supported' in str(error),str(error)
print('native Deck accepted; obsolete manifest rejected')
`;
  const out=execFileSync("/root/projects/oceanleo/backend/.venv/bin/python",["-c",script],{env:{...process.env,PYTHONPATH:"/root/projects/oceanleo/backend",PYTHONDONTWRITEBYTECODE:"1"},encoding:"utf8"});
  assert.match(out,/native Deck accepted/);
});

for(const slides of [3,40])test(`run4 Deck ${slides}: idle publication completes from PPTX and cover through real doc-io`,async()=>noErrors(async()=>{
  reset();probe.inline=true;
  probe.fixtureDeck=normalizeDeckDocument({title:"Opened Deck",slides:Array.from({length:slides},(_,n)=>({id:`pub-${n}`,elements:[{id:`t-${n}`,type:"text",text:`Page ${n}`}]}))});
  const source={...item("ppt"),artifactId:`pub-root-${slides}`,artifactType:"deck"};
  const publication=deckPublication(source);probe.publicationDeps=publication.dependencies;
  const originalSet=globalThis.setTimeout;let idle;
  globalThis.setTimeout=function(run,ms,...args){if(ms===10000){idle=()=>run(...args);return originalSet(()=>{},0);}return originalSet(run,ms,...args);};
  let view;
  try {
    view=await mount(DeckRoute,source);
    await act(async()=>probe.deck.setTitle(`Published Deck ${slides}`));
    await tickUntil(()=>puts.length===1&&probe.save.state==="saved");
    assert.equal(typeof idle,"function","an acknowledged edit schedules idle publication");
    await act(async()=>idle());
    await tickUntil(()=>publication.commits.length>0||Boolean(probe.deck.error));
    assert.equal(publication.commits.length,1,probe.deck.error||"native Deck publication must reach the revision API");
    await tickUntil(()=>probe.pointers.length===1);
    assert.equal(probe.save.state,"saved","publication never changes working-copy acknowledgement");
    assert.equal(probe.pointers[0].seq,1);assert.equal(probe.pointers[0].revision_id,"published-1");
    const commit=publication.commits[0];
    assert.deepEqual(commit.renditions.map(part=>part.purpose).sort(),["full","preview"]);
    assert.equal(commit.source.format,"pptx");
    const bytes=publication.staged.get(commit.source.blobId).bytes;
    assert.equal(Object.keys(unzipSync(bytes)).filter(path=>/^ppt\/slides\/slide\d+\.xml$/.test(path)).length,slides);
  } finally {globalThis.setTimeout=originalSet;if(view)await close(view);probe.publicationDeps=null;probe.fixtureDeck=null;probe.inline=false;}
}));

test("run4 Deck remote edits arriving during publication cannot reuse the earlier publication receipt",async()=>noErrors(async()=>{
  reset();const source={...item("ppt"),artifactId:"remote-during-publish",artifactType:"deck"};
  const publication=deckPublication(source);probe.publicationDeps=publication.dependencies;
  let release;probe.publishBarrier=new Promise(done=>release=done);
  const view=await mount(DeckRoute,source);let pending;
  try {
    await act(async()=>probe.deck.setTitle("First publication"));
    const revision=probe.deck.editRevision;
    await act(async()=>{pending=probe.adapter.persistence.preparePublish()();});
    await tickUntil(()=>publication.commits.length===1);
    await act(async()=>probe.deck.applyRemoteDeck({...probe.deck.deck,title:"Merged remote publication"}));
    assert.equal(probe.deck.editRevision,revision,"a merged remote change is not a local edit");
    await act(async()=>{release();await pending;});probe.publishBarrier=null;
    assert.equal(probe.deck.dirty,true,"publishing an earlier snapshot cannot clear merged remote edits");
    await act(async()=>{assert.equal((await probe.adapter.persistence.preparePublish()()).ok,true);});
    assert.equal(publication.commits.length,2,"the current merged document needs a new publication despite unchanged local revision");
    const latest=publication.staged.get(publication.commits[1].source.blobId).bytes;
    assert.match(new TextDecoder().decode(unzipSync(latest)["docProps/core.xml"]),/Merged remote publication/);
    await act(async()=>{assert.equal((await probe.adapter.persistence.preparePublish()()).ok,true);});
    assert.equal(publication.commits.length,2,"repeating publication of the same document reuses its receipt");
  } finally {release?.();probe.publishBarrier=null;await close(view);probe.publicationDeps=null;}
}));

test("run4 Deck failed publication cannot reuse uploaded bytes after a merged remote edit",async()=>noErrors(async()=>{
  reset();const source={...item("ppt"),artifactId:"remote-after-failure",artifactType:"deck"};
  const publication=deckPublication(source),stage=publication.dependencies.stageArtifactBlob,commit=publication.dependencies.createArtifactRevision;
  publication.dependencies.stageArtifactBlob=undefined;
  publication.dependencies.uploadFile=async(file)=>{
    const {data}=await stage(source.artifactId,file),url=`https://example.invalid/${data.blobId}`;
    publication.staged.set(url,publication.staged.get(data.blobId));
    return {ok:true,data:{file:{url,meta:{content_digest:data.digest}}}};
  };
  let fail=true;publication.dependencies.createArtifactRevision=(...args)=>fail?Promise.resolve({ok:false,error:"temporary revision failure"}):commit(...args);
  probe.publicationDeps=publication.dependencies;
  const view=await mount(DeckRoute,source);
  try {
    await act(async()=>probe.deck.setTitle("Failed first snapshot"));
    await act(async()=>assert.equal((await probe.adapter.persistence.preparePublish()()).ok,false));
    await act(async()=>probe.deck.applyRemoteDeck({...probe.deck.deck,title:"Merged after failure"}));
    fail=false;
    await act(async()=>assert.equal((await probe.adapter.persistence.preparePublish()()).ok,true));
    const bytes=publication.staged.get(publication.commits[0].source.url).bytes;
    assert.match(new TextDecoder().decode(unzipSync(bytes)["docProps/core.xml"]),/Merged after failure/);
  } finally {await close(view);probe.publicationDeps=null;}
}));

for(const slides of [3,40])for(const existing of [false,true])test(`run4 Deck ${slides} ${existing?"existing":"fresh"}: both real room tabs save their merged edits`,async()=>noErrors(async()=>{
  reset();probe.inline=true;probe.cas=true;probe.putDelay=30;
  const deck=normalizeDeckDocument({title:"Shared Deck",slides:Array.from({length:slides},(_,n)=>({id:`room-${n}`,elements:[{id:`left-${n}`,type:"text",text:"Left",fontSize:20},{id:`right-${n}`,type:"text",text:"Right",fontSize:20}]}))});
  probe.fixtureDeck=deck;
  if(existing)copy={schema:DECK_WORKING_COPY_SCHEMA,seq:55,published_seq:0,base_revision_id:"initial",saved_at:new Date().toISOString(),doc:deck};
  const a={room:room({needsSeed:true,completeSeed(){this.needsSeed=false;}})},b={room:room({isSaver:false})};
  // WebSocket frames arrive in later tasks, never re-enter another tab's React commit.
  a.room.doc.on("update",(update,origin)=>{if(origin!==a.room)setTimeout(()=>applyUpdate(b.room.doc,update,b.room),0);});
  b.room.doc.on("update",(update,origin)=>{if(origin!==b.room)setTimeout(()=>applyUpdate(a.room.doc,update,a.room),0);});
  for(const [tab,token] of [[a,"test-a"],[b,"test-b"]]){
    tab.useSave=(await import(await compileModule(sharedPath("src/shell/use-advanced-autosave.ts"),{...authStubs,"../lib/auth/client":dataModule(`export async function accessToken(){return ${JSON.stringify(token)};}`)}))).useAdvancedAutoSave;
  }
  let first,second;
  try {
    first=await mount(DeckRoute,item("ppt"),a);second=await mount(DeckRoute,item("ppt"),b);
    assert.equal(b.adapter.persistence.autoSave,true,"a writable non-elected Deck tab saves itself");
    await tickUntil(()=>a.save.state==="saved"&&b.save.state==="saved");
    const opened=performance.now();
    await act(async()=>{a.editor.patchElement("left-0",{fontSize:71});b.editor.patchElement("right-0",{fontSize:93});});
    await tickUntil(()=>a.save.state==="saved"&&b.save.state==="saved"&&probe.acks.some(ack=>ack.sender==="a")&&probe.acks.some(ack=>ack.sender==="b"));
    assert.ok(probe.collisions>0,"the two conditional saves collide and exercise room retry");
    for(const tab of [a,b])assert.deepEqual(JSON.parse(JSON.stringify(tab.editor.captureRecovery())),copy.doc);
    assert.equal(copy.doc.slides[0].elements[0].fontSize,71);assert.equal(copy.doc.slides[0].elements[1].fontSize,93);
    for(const sender of ["a","b"])assert.deepEqual(probe.acks.filter(ack=>ack.sender===sender).at(-1).doc,copy.doc,"each tab acknowledges the merged document");
    console.log(`ROOM_DECK slides=${slides} existing=${existing} merged-edit-to-acks=${(performance.now()-opened).toFixed(2)}ms collisions=${probe.collisions}`);
  } finally {
    if(first)await first.unmount();if(second)await second.unmount();
    await act(async()=>{await wait(20);});resetBackgroundSaverForTests();
    a.room.doc.destroy();b.room.doc.destroy();probe.fixtureDeck=null;probe.inline=false;
  }
}));

for(const existing of [false,true])test(`run2 PDF real lock holder starts saving ${existing?"existing seq55":"a fresh copy"} without elected saver status`,async()=>noErrors(async()=>{
  reset();probe.inline=true;probe.room=room({isSaver:false,lock:{holder:{id:"self"},mode:"pro",expires_at:"2099-01-01"}});
  if(existing)copy={schema:"oceanleo.pdf-working-document.v1",seq:55,published_seq:0,base_revision_id:"initial",saved_at:new Date().toISOString(),doc:{version:1,source:{artifactId:"pdf-root",revisionId:"initial",purpose:"source",blank:false},operations:[],annotations:[],formValues:{},annotationOperationCount:0}};
  let view;
  try {
    view=await mount(PdfRoute,item("pdf"));await act(async()=>{await wait(30);});
    assert.equal(probe.adapter.persistence.autoSave,true,"the actual PDF hook authorizes its lock holder");
    await act(async()=>view.container.querySelector("[data-rotate=pdf]").click());
    await tickUntil(()=>puts.length===1||probe.save.conflict);
    assert.equal(probe.save.conflict,false,"the shell must not reject the authorized PDF lock holder");
    await tickUntil(()=>probe.save.state==="saved");
    assert.equal(puts.length,1);assert.equal(puts[0].body.if_seq,existing?55:null);
    assert.equal(copy.doc.operations[0].degrees,90);
  } finally {if(view)await close(view);probe.room.doc.destroy();probe.room=null;probe.inline=false;}
}));

for(const viewer of [false,true])test(`run2 PDF ${viewer?"viewer":"other user's lock"} remains read-only and cannot issue a PUT`,async()=>noErrors(async()=>{
  reset();probe.inline=true;probe.room=room({role:viewer?"viewer":"editor",lock:{holder:{id:viewer?"self":"other"},mode:"pro",expires_at:"2099-01-01"}});
  let view;
  try {
    view=await mount(PdfRoute,item("pdf"));
    assert.equal(probe.adapter.persistence.autoSave,false);
    await act(async()=>view.container.querySelector("[data-rotate=pdf]").click());
    await act(async()=>{await wait(30);});
    assert.equal(probe.adapter.persistence.editRevision,0);assert.equal(puts.length,0);
  } finally {if(view)await close(view);probe.room.doc.destroy();probe.room=null;probe.inline=false;}
}));

for(const slides of [3,40])test(`run2 Deck ${slides} slides: room bootstrap keeps local revision clean and starts from read seq73`,async()=>noErrors(async()=>{
  reset();probe.inline=true;probe.room=room();getDelay=100;
  const saved=normalizeDeckDocument({title:"Acknowledged working copy",slides:Array.from({length:slides},(_,n)=>({id:`saved-${n}`,elements:[{id:`text-${n}`,type:"text",text:"Saved text",fontSize:56}]}))});
  copy={schema:DECK_WORKING_COPY_SCHEMA,seq:73,published_seq:0,base_revision_id:"initial",saved_at:new Date().toISOString(),doc:saved};
  const {writeJsonStateRoot}=await import("../src/shell/collab/bind-json-state.ts");
  const {DECK_COLLAB_ROOT,deckToEntities}=await import("../src/shell/collab/adapters/deck.ts");
  let view;
  try {
    view=await mount(DeckRoute,item("ppt"));
    const stale={...saved,title:"Older room bootstrap"};
    await act(async()=>writeJsonStateRoot(probe.room.doc,DECK_COLLAB_ROOT,deckToEntities(stale),probe.room));
    await act(async()=>{await wait(130);});
    assert.equal(probe.save.conflict,false,"room startup must not impersonate a local edit racing the existing copy");
    assert.equal(probe.deck.editRevision,0);
    await tickUntil(()=>probe.save.state==="saved");
    if(puts.length)assert.equal(puts[0].body.if_seq,73);
    assert.equal(probe.deck.deck.title,saved.title);
    const before=puts.length,base=copy.seq;
    await act(async()=>probe.deck.setTitle("User edit after restore"));
    await tickUntil(()=>puts.length===before+1&&probe.save.state==="saved");
    assert.equal(puts.at(-1).body.if_seq,base);assert.equal(copy.doc.title,"User edit after restore");
  } finally {if(view)await close(view);probe.room.doc.destroy();probe.room=null;probe.inline=false;}
}));

// This tests the real mutation path, not just reading an already cached getter.
test("40-slide edits retain unchanged slides and send one PUT through the real shared saver",async()=>noErrors(async()=>{
  reset();const view=await mount(DeckRoute,item("ppt"));
  try {
    const {normalizeDeckDocument}=await import("../src/shell/doc-editors/deck-schema.ts");
    const deck=normalizeDeckDocument({slides:Array.from({length:40},(_,n)=>({id:`s${n}`,elements:Array.from({length:60},(_,i)=>({id:`e${n}-${i}`,type:"text",text:"Realistic slide paragraph. ".repeat(8)}))}))});
    await act(async()=>probe.adapter.persistence.recovery.restore(deck));
    const before=probe.deck.deck;
    const started=performance.now();
    await act(async()=>probe.deck.patchElement(before.slides[0].elements[0].id,{fontSize:31}));
    await tickUntil(()=>puts.length===1&&probe.save.state==="saved");
    const delay=puts[0].at-started;
    console.log(`REPAIR deck40 mutation-to-PUT=${delay.toFixed(2)}ms capture-bytes=${JSON.stringify(copy.doc).length}`);
    assert.equal(puts.length,1);
    assert.equal(probe.deck.deck.slides[39],before.slides[39],"unchanged slides remain shared; editing does not clone the entire deck");
    assert.ok(delay<100,`mutation-to-PUT ${delay.toFixed(1)}ms`);
  } finally {await close(view);}
}));

test("PDF rotation sends the native edit before any slow PDF export or viewer rebuild completes",async()=>noErrors(async()=>{
  reset();const view=await mount(PdfRoute,item("pdf"));let release;
  try {
    probe.visualBarrier=new Promise(done=>release=done);
    const started=performance.now();
    await act(async()=>view.container.querySelector("[data-rotate=pdf]").click());
    await tickUntil(()=>puts.length>0);
    assert.equal(probe.buildCalls,0,"live page rendering must not reconstruct a second PDFium document");
    assert.equal(view.container.querySelector("[data-pdf-processing]").dataset.pdfProcessing,"true","the PUT does not wait for the viewer export");
    assert.equal(copy.doc.operations.length,1);assert.equal(copy.doc.operations[0].degrees,90);
    assert.ok(puts[0].at-started<150);
    console.log(`REPAIR pdf rotation-to-PUT=${(puts[0].at-started).toFixed(2)}ms while rebuild is pending`);
    await act(async()=>{release();await wait(20);});
  } finally {release?.();await close(view);}
}));

test("PDF annotation edits keep the same saver ready and never reread their own unpublished copy",async()=>noErrors(async()=>{
  reset();const view=await mount(PdfRoute,item("pdf"));
  try {
    await act(async()=>view.container.querySelector("[data-edit=pdf]").click());
    await tickUntil(()=>puts.length===1&&probe.save.state==="saved");
    await act(async()=>probe.pdfBridge.updateAnnotation({id:"edited",pageIndex:0},{contents:"Second edit"}));
    await tickUntil(()=>puts.length===2&&probe.save.state==="saved");
    assert.equal(probe.save.conflict,false);assert.equal(copy.doc.annotations[0].annotation.contents,"Second edit");
  } finally {await close(view);}
}));

test("PDF page undo saves immediately and blocks a second undo while the viewer is rebuilding",async()=>noErrors(async()=>{
  reset();const view=await mount(PdfRoute,item("pdf"));let release;
  try {
    for(let n=0;n<2;n++){
      await act(async()=>view.container.querySelector("[data-rotate=pdf]").click());
      await tickUntil(()=>puts.length===n+1&&probe.save.state==="saved"&&view.container.querySelector("[data-pdf-processing]").dataset.pdfProcessing==="false");
    }
    probe.visualBarrier=new Promise(done=>release=done);
    await act(async()=>{probe.adapter.history.undo();probe.adapter.history.undo();});
    await tickUntil(()=>puts.length===3&&probe.save.state==="saved");
    assert.equal(copy.doc.operations.length,1,"one undo is accepted before the visual rebuild completes");
    assert.equal(probe.adapter.persistence.editRevision,3);
    await act(async()=>{release();await wait(20);});
  } finally {release?.();await close(view);}
}));

test("PDF capture stores artifact/revision identity instead of a five-minute URL",async()=>noErrors(async()=>{
  reset();const view=await mount(PdfRoute,item("pdf"));
  try {
    const doc=probe.adapter.persistence.recovery.capture();
    assert.equal(doc.source.artifactId,"pdf-root");assert.equal(doc.source.revisionId,"initial");assert.equal(doc.source.url,undefined);
  } finally {await close(view);}
}));

const watchPath="src/shell/doc-editors/grid-univer/edit-watch.ts";
const {createGridEditWatch}=await import(baseline?await fromBaseline(watchPath,{}):await compileModule(watchPath,{}));
test("sheet cell editor typing is not a workbook edit; committing Enter produces one revision",()=>{
  let top={unitID:"wb",id:"old"},redo=null,edits=0;
  const undo={pitchTopUndoElement:()=>top,pitchTopRedoElement:()=>redo};
  const watch=createGridEditWatch({undo,unitId:()=>"wb",onHistory(){},onPersonWrite(){edits++;}});
  top={unitID:"cell-editor",id:"typing"};watch.observe();
  assert.equal(edits,0,"temporary text document must not cause the first PUT");
  top={unitID:"wb",id:"committed-cell"};watch.observe();watch.observe();
  assert.equal(edits,1,"one committed workbook edit, not two focused document edits");watch.dispose();
});
test("sheet reopen ignores the cell editor's old or empty history instead of falsely conflicting",()=>{
  const workbookTop={unitID:"wb",id:"saved-history"};let top=workbookTop,edits=0;
  const watch=createGridEditWatch({undo:{pitchTopUndoElement:()=>top,pitchTopRedoElement:()=>null},unitId:()=>"wb",onHistory(){},onPersonWrite(){edits++;}});
  top={unitID:"cell-editor",id:"cached-body"};watch.observe();
  top=null;watch.observe();top=workbookTop;watch.observe();
  assert.equal(edits,0,"changing focus during load must not create dirty generation before GET");watch.dispose();
});

const refs=await import(await compileModule("src/shell/media-editors/pdf-source-reference.ts",{
  "../artifact-client":dataModule('export async function getArtifactItem(artifactId,revisionId){globalThis.__s3a.resolutions.push({artifactId,revisionId});if(globalThis.__s3a.refused)return {ok:false,error:"denied"};return {ok:true,data:{url:"https://example.invalid/fresh.pdf?generation="+globalThis.__s3a.resolutions.length,meta:{}}};}')
}));
test("expired legacy PDF tickets become stable identities and resolve fresh access on every open",async()=>{
  probe.resolutions=[];probe.refused=false;
  const ticket=btoa(JSON.stringify({v:1,artifact:"pdf-root",revision:"original-r1",purpose:"source",exp:1})).replace(/=/g,"");
  const expired=`https://gateway.invalid/v1/artifact-renditions/access/${ticket}.signature`;
  const source=refs.pdfSourceReference(item("pdf"),expired,false);
  assert.deepEqual(source,{artifactId:"pdf-root",revisionId:"original-r1",purpose:"source",blank:false});
  assert.equal(JSON.stringify(source).includes(ticket),false);
  const first=await refs.resolvePdfMedia(source),second=await refs.resolvePdfMedia(source);
  assert.notEqual(first,second,"each open gets a new authorized URL");
  assert.deepEqual(probe.resolutions,[{artifactId:"pdf-root",revisionId:"original-r1"},{artifactId:"pdf-root",revisionId:"original-r1"}]);
  probe.refused=true;await assert.rejects(refs.resolvePdfMedia(source),/denied/);probe.refused=false;
  const {decodePdfRecovery}=await import("../src/shell/media-editors/pdf-recovery.ts");
  const restored=decodePdfRecovery({version:1,source:{url:expired,blank:false},operations:[],annotations:[],formValues:{}});
  assert.deepEqual(restored.source,source,"existing working copies are upgraded without guessing the current Library revision");
});

test("VS8 exact server validation: XLSX MIME is valid; carrying CSV bounded editability causes the 422",()=>{
  const script=`
import json
from app.typed_artifact_models import ArtifactContentInput
from pydantic import ValidationError
mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
a,b,c='a'*64,'b'*64,'c'*64
blob=lambda sha,media:{'sha256':sha,'byte_size':1000,'media_type':media,'storage_bucket':'project-assets','storage_key':'tests/'+sha}
rendition=lambda purpose,sha,media,fmt:{'purpose':purpose,'blob_sha256':sha,'media_type':media,'format':fmt,'metadata':{'derivation':{'sourceDigest':a}}}
doc={'title':'Grid save proof','artifact_type':'grid','roles':['document'],'editability':'native','editor_capability':'grid-editor','source_format':'xlsx','content_digest':a,'blobs':[blob(a,mime),blob(b,'application/json'),blob(c,'image/png')],'renditions':[rendition('source',a,mime,'xlsx'),rendition('full',a,mime,'xlsx'),rendition('preview',c,'image/png','png'),rendition('thumbnail',c,'image/png','png'),rendition('editor_manifest',b,'application/json','oceanleo.grid.univer.v1')],'provenance':{'source_kind':'user_upload','rights_asserted':True}}
ArtifactContentInput.model_validate(doc)
doc['editability']='bounded'
try:
 ArtifactContentInput.model_validate(doc)
 raise AssertionError('bounded CSV editability unexpectedly accepted for native XLSX')
except ValidationError as error:
 assert 'spreadsheet_editing editability disagrees' in str(error),str(error)
print('native XLSX accepted; inherited bounded CSV editability rejected')
`;
  const out=execFileSync("/root/projects/oceanleo/backend/.venv/bin/python",["-c",script],{env:{...process.env,PYTHONPATH:"/root/projects/oceanleo/backend"},encoding:"utf8"});
  assert.match(out,/native XLSX accepted/);
});

test("VS10 paragraph joining predates this wave: the browser PPTX text importer is unchanged",()=>{
  const at=(path)=>execFileSync("git",["show",`d212f88d:${path}`],{encoding:"utf8"});
  const format="src/shell/doc-editors/deck-text-format.ts";
  assert.equal(readFileSync(format,"utf8"),at(format),format);
  // 2026-11-17 PPT 预览修复（运营方下令）给导入器加了母版/版式文字继承与图片裁切；
  // 除被替换的两行外，d212f88d 的每一行必须原样保留，新增内容只能是增量。
  const importer="src/shell/doc-editors/pptx-deck-import.ts";
  const replaced=(line)=>line.startsWith("    new RegExp(`${property}")||line==="    if (string(source.content).trim()) shape.content = source.content;";
  const now=readFileSync(importer,"utf8").split("\n");
  let cursor=0;
  for(const line of at(importer).split("\n")){
    if(replaced(line)) continue;
    const found=now.indexOf(line,cursor);
    assert.notEqual(found,-1,`${importer}: 原有行被改动或乱序：${line}`);
    cursor=found+1;
  }
});

test("sheet watch reads the pinned native workbook stack even when first mounted inside the cell editor",()=>{
  const coreRequire=createRequire(require.resolve("@univerjs/presets"));
  const {LocalUndoRedoService}=coreRequire("@univerjs/core");
  const {BehaviorSubject}=coreRequire("rxjs");
  let focused="cell-editor",writes=0;
  const focused$=new BehaviorSubject(null);
  const native=new LocalUndoRedoService({focused$,getFocusedUnit:()=>({getUnitId:()=>focused})},{registerCommand:()=>({dispose(){}})},{getContextValue:()=>false});
  try {
    native.pushUndoRedo({unitID:"wb",id:"existing",undoMutations:[],redoMutations:[]});
    const watch=createGridEditWatch({undo:native,unitId:()=>"wb",onHistory(){},onPersonWrite(){writes++;}});
    native.pushUndoRedo({unitID:"cell-editor",id:"typing",undoMutations:[],redoMutations:[]});
    watch.observe();assert.equal(writes,0);
    focused="wb";watch.observe();assert.equal(writes,0,"initial focus change is not a new workbook edit");
    native.pushUndoRedo({unitID:"wb",id:"committed",undoMutations:[],redoMutations:[]});watch.observe();assert.equal(writes,1);
    watch.dispose();
  } finally {native.dispose();focused$.complete();}
});

test("VS fixtures: capture and 20 isolated edits plus three bursts at native and 150ms RTT",async()=>noErrors(async()=>{
  reset();
  const {importPptxDeck}=await import("../src/shell/doc-editors/pptx-deck-import.ts");
  const data=readFileSync("tests/fixtures/s3a-vs-slides40.pptx");
  probe.fixtureDeck=await importPptxDeck(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),"VS40");
  assert.equal(probe.fixtureDeck.slides.length,40);
  const pdfBytes=readFileSync("tests/fixtures/s3a-vs-source.pdf");
  const parsedPdf=await PDFDocument.load(pdfBytes);
  const pdfFixture={bytes:new Uint8Array(pdfBytes),pages:parsedPdf.getPages().map((page,index)=>({index,rotation:page.getRotation().angle,size:page.getSize()}))};
  const modes=[0,150];
  try {
    for(const kind of ["deck","pdf"]){
      probe.inline=true;probe.room=room(kind==="pdf"
        ?{isSaver:false,lock:{holder:{id:"self"},mode:"pro",expires_at:"2099-01-01"}}
        :{needsSeed:true,completeSeed(){this.needsSeed=false;}});
      reset();probe.fixturePdf=kind==="pdf"?pdfFixture:null;const view=await mount(kind==="deck"?DeckRoute:PdfRoute,item(kind==="deck"?"ppt":"pdf"));
      try {
        const captures=[];for(let i=0;i<20;i++){const at=performance.now();probe.adapter.persistence.recovery.capture();captures.push(performance.now()-at);}
        captures.sort((a,b)=>a-b);
        console.log(`VS_FIXTURE_CAPTURE ${kind} source-bytes=${kind==="deck"?data.length:pdfBytes.length} json-bytes=${JSON.stringify(probe.adapter.persistence.recovery.capture()).length} p95=${captures[18].toFixed(2)}ms`);
        assert.ok(captures[18]<=30);
        let edit=0;
        const perform=async()=>{
          edit++;
          await act(async()=>{
            if(kind==="deck")probe.deck.setTitle(`VS edit ${edit}`);
            else view.container.querySelector("[data-rotate=pdf]").click();
          });
        };
        for(const rtt of modes){
          probe.putDelay=rtt+33;
          const timings=[];
          for(let i=0;i<20;i++){
            const before=puts.length,started=performance.now();await perform();
            await tickUntil(()=>puts.length>before&&probe.save.state==="saved");
            timings.push(performance.now()-started);
            assert.equal(puts.length,before+1,"isolated edit must have one conditional request");
          }
          const burstTimes=[];
          for(let burst=0;burst<3;burst++){
            for(let i=0;i<10;i++){await perform();await act(async()=>{await wait(15);});}
            const last=performance.now();await tickUntil(()=>probe.save.state==="saved");burstTimes.push(performance.now()-last);
          }
          timings.sort((a,b)=>a-b);
          console.log(`VS_MATRIX ${kind} RTT=${rtt}ms gateway=33ms isolated=20 burst=3x10 p50=${timings[10].toFixed(2)}ms p95=${timings[18].toFixed(2)}ms max=${timings[19].toFixed(2)}ms burst-last-ack-max=${Math.max(...burstTimes).toFixed(2)}ms`);
          assert.ok(timings[19]<500);assert.ok(Math.max(...burstTimes)<500);
        }
      } finally {await close(view);probe.room.doc.destroy();probe.room=null;probe.inline=false;}
    }
  } finally {probe.fixtureDeck=null;probe.fixturePdf=null;}
}));
