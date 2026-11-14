/** Real routes and real editor hooks. Only canvas/WASM UI, network and host chrome are replaced. */
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import React, { act } from "react";
import { compileModule, dataModule, realModule } from "./helpers/module-bench.mjs";
import { createPdfViewerBridge } from "../src/shell/media-editors/pdf-viewer-bridge.ts";
import { normalizeDeckDocument } from "../src/shell/doc-editors/deck-schema.ts";

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
const stubs = {
  "../../i18n/ui/useUI": dataModule('const tt=(s)=>s; export function useUI(){return tt;}'),
  "../AdvancedWorkbenchShell": dataModule(`import {createElement} from ${JSON.stringify(reactUrl)}; export function AdvancedWorkbenchShell({adapter}) {globalThis.__s3a.adapter=adapter;return createElement("div",{"data-shell":adapter.id},adapter.stage);}`),
  "../advanced-session-context": dataModule('export function useAdvancedSession(){return null;}'),
  "../office-editor": dataModule('export function useOfficeArtifactSource(item){return {item, loading:false,error:"",resourceFailed(){},retry(){}};}'),
  "../collab/adapters/use-entity-collab": dataModule('export function useEntityCollab(options){globalThis.__s3a.remote=options.applyRemote;return {readOnly:false,saveGate:true,markSaved(){},room:null,collab:null};}'),
  "../collab/adapters/visual-selection": dataModule('export function useCollabSelections(){return [];}'),
  "../plugin-command": dataModule('export function usePluginCommandSurface(){}'),
  "../doc-editors/use-deck-material-adapter": empty("useDeckMaterialAdapter"),
  "../doc-editors/DeckStage": dataModule(`import {createElement} from ${JSON.stringify(reactUrl)}; export function DeckStage({editor}) {globalThis.__s3a.deck=editor;return createElement("button",{"data-edit":"deck",onClick:()=>editor.setTitle("Edited slides")},"Edit slides");}`),
  "../doc-editors/DeckContextToolbar": empty("DeckContextToolbar"),
  "../doc-editors/DeckCreationPanels": empty("DeckDrawPanel", "DeckLinePanel", "DeckNotesPanel"),
  "../doc-editors/DeckControls": empty("DeckDesignPanel", "DeckElementsPanel", "DeckTextPanel"),
  "../doc-editors/DeckPresenterView": empty("DeckPresenterView", "openDeckPresenterWindow"),
  "./office-file": dataModule('export async function fetchValidatedOfficePackage(){return {arrayBuffer:new ArrayBuffer(4)};} export function notifyOfficeAccessDenied(){} export async function validateOfficePackageBlob(){return new ArrayBuffer(4);}'),
  "./pptx-deck-import": dataModule(`import {normalizeDeckDocument} from ${JSON.stringify(realModule("src/shell/doc-editors/deck-schema.ts"))}; export async function importPptxDeck(){return normalizeDeckDocument({title:"Opened slides",slides:[{id:"slide",elements:[{id:"text",type:"text",text:"Hello"},{id:"picture",type:"image",src:"https://example.invalid/media.png"}]}]});}`),
  "./doc-io": dataModule(`export * from ${JSON.stringify(realModule("src/shell/doc-editors/doc-io.ts"))}; export async function saveFileToLibrary(input){const p=globalThis.__s3a;p.input=input;if(input.createPreview) await input.createPreview();await new Promise((resolve)=>p.release=resolve);if(p.fail)return {ok:false,error:"offline"};const n=p.saved.length+1;const item={...input.item,id:"saved-"+n,revisionId:"saved-"+n,url:"https://example.invalid/saved-"+n+".pptx",meta:{...input.item.meta}};p.saved.push(item);return {ok:true,item,url:item.url,versionId:item.id,revisionId:item.id,artifactId:item.artifactId};}`),
  "./editor-preview-raster": dataModule('export async function renderDeckPreviewPng(doc){globalThis.__s3a.frozenDeck=structuredClone(doc);return new Blob(["preview"]);}'),
  "./editor-insert-media": dataModule('export async function uploadEditorMedia(blob,name){globalThis.__s3a.uploaded.push({blob,name});return "https://example.invalid/upload.png";} export async function durableEditorMediaUrl(url){if(!/^(data:|blob:)/.test(url))return url;globalThis.__s3a.uploaded.push(url);return "https://example.invalid/upload.png";}'),
  "../collab/adapters/use-pdf-collab": dataModule('export function usePdfCollab(){return {readOnly:false,mayWrite:true,room:null,markSaved(){}};}'),
  "../plugin-theme": dataModule('export function usePluginTheme(){return {theme:"light"};}'),
  "../workbench-material-provider": dataModule('export function useWorkbenchMaterialAdapter(){}'),
  "../media-editors/PdfControls": empty("PdfControls"),
  "../media-editors/PdfFindBar": empty("PdfFindBar"),
  "../media-editors/PdfSelectionBar": dataModule('export function PdfSelectionBar(){return null;}export function PdfToolPalette(){return null;} export function pdfSelectionBarVisible(){return false;}'),
  "../media-editors/PdfSignatureDialog": empty("PdfSignatureDialog"),
  "./pdf-cjk-appearance": dataModule("export async function fixPdfCjkFreeTextAppearances(bytes){return {bytes,fixed:0};}"),
  "./pdf-source": dataModule('export async function loadInitialPdfSource(){return {bytes:new Uint8Array([1,2,3]),durableUrl:"https://example.invalid/source.pdf",pageCount:3,blank:false};}'),
  "./pdf-working-copy-publish": dataModule('export async function applyPdfPageOperations(bytes){return bytes;}export async function pdfWorkingSource(){return new Uint8Array([1,2,3]);}export async function buildPdfWorkingCopy(doc){globalThis.__s3a.pdfDoc=structuredClone(doc);await new Promise((resolve)=>globalThis.__s3a.release=resolve);return new Uint8Array([1,2,3]);}'),
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
  const pages = Array.from({ length: 3 }, (_, index) => ({ index, rotation: 0, size: { width: 400, height: 600 } }));
  const plugins = {
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
const { DeckRoute } = await import(await compileModule("src/shell/advanced-routes/DeckRoute.tsx", stubs));
const { PdfRoute } = await import(await compileModule("src/shell/advanced-routes/PdfRoute.tsx", stubs));

const item = (kind) => ({ key: `library:${kind}`, id: "initial", artifactId: `${kind}-root`, revisionId: "initial", title: kind, source: "library", kind, url: `https://example.invalid/source.${kind === "ppt" ? "pptx" : "pdf"}`, meta: {} });
async function mount(Component, source) {
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(Component, { item: source, onClose() {} })); });
  for (let i = 0; i < 30 && !probe.adapter?.persistence?.recovery?.ready; i++) await tick();
  await tick();
  return { container, async render(source) { await act(async () => root.render(React.createElement(Component, {item:source,onClose(){}}))); await tick(); }, async unmount() { await act(async () => root.unmount()); container.remove(); } };
}
async function tick() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); }
async function noErrors(run) {
  const errors = []; const previous = console.error; console.error = (...args) => errors.push(args.join(" "));
  try { await run(); assert.deepEqual(errors, [], errors.join("\n")); } finally { console.error = previous; }
}

test("real DeckRoute: load → edit → capture, restore, remote echo and publish after unmount", async () => noErrors(async () => {
  probe.saved = []; probe.release = null; probe.fail = false;
  const mounted = await mount(DeckRoute, item("ppt"));
  let persistence = probe.adapter.persistence;
  assert.equal(persistence.recovery.ready, true);
  assert.equal(persistence.editRevision, 0); assert.equal(persistence.dirty, false);
  await act(async () => { probe.deck.beginGesture(); probe.deck.cancelGesture(); });
  assert.equal(probe.adapter.persistence.editRevision, 0, "cancelling an untouched gesture is not an edit");
  await act(async () => mounted.container.querySelector("[data-edit=deck]").click());
  persistence = probe.adapter.persistence;
  assert.equal(persistence.dirty, true); assert.equal(persistence.editRevision, 1);
  const copy = JSON.parse(JSON.stringify(persistence.recovery.capture()));
  assert.equal(copy.title, "Edited slides");
  await act(async () => { persistence.recovery.restore(copy); });
  assert.equal(probe.adapter.persistence.editRevision, 1, "restore never advances user edit revision");
  assert.deepEqual(JSON.parse(JSON.stringify(probe.adapter.persistence.recovery.capture())), copy);
  const remote = structuredClone(copy); remote.slides[0].notes = "From collaborator";
  await act(async () => probe.remote(remote));
  assert.equal(probe.adapter.persistence.editRevision, 1);
  const publish = probe.adapter.persistence.preparePublish();
  await act(async () => { probe.deck.setTitle("Later edit"); });
  await mounted.unmount();
  const pending = publish();
  await tick();
  assert.equal(probe.frozenDeck.title, "Edited slides", "prepared publish ignores later edits");
  probe.release();
  const receipt = await pending;
  assert.equal(receipt.ok, true); assert.equal(probe.saved.length, 1);
}));

test("real DeckRoute: a newer edit stays dirty while publication completes; inline pictures upload at insertion", async () => noErrors(async () => {
  probe.saved = []; probe.release = null; probe.uploaded = [];
  const mounted = await mount(DeckRoute, item("ppt"));
  try {
    await act(async () => mounted.container.querySelector("[data-edit=deck]").click());
    let pending;
    await act(async () => { pending = probe.adapter.persistence.flush(); });
    await tick();
    await act(async () => probe.deck.setTitle("Newer edit"));
    await act(async () => { probe.release(); await pending; });
    assert.equal(probe.adapter.persistence.dirty, true);
    assert.equal(probe.adapter.persistence.editRevision, 2);
    await mounted.render(probe.saved[0]);
    assert.equal(probe.adapter.persistence.editRevision, 2, "host echo never reloads over newer edits");
    assert.equal(probe.adapter.persistence.recovery.capture().title, "Newer edit");
    await act(async () => { probe.deck.insertImageElement("data:image/png;base64,AQID", "local"); await Promise.resolve(); });
    assert.equal(probe.uploaded.length, 1);
    const copy = probe.adapter.persistence.recovery.capture();
    assert.equal(copy.slides[0].elements.at(-1).src, "https://example.invalid/upload.png");
    assert.equal(JSON.stringify(copy).includes("data:image"), false);
    probe.fail = true;
    await act(async () => { pending = probe.adapter.persistence.flush(); });
    await tick();
    await act(async () => { probe.release(); assert.equal((await pending).ok, false); });
    assert.equal(probe.adapter.persistence.dirty, true, "failed publication retains the working copy");
    probe.fail = false;
  } finally { await mounted.unmount(); }
}));

test("real PdfRoute: annotation edit → native JSON capture → restore with no extra revision → independent publish after close", async () => noErrors(async () => {
  probe.release = null;
  const mounted = await mount(PdfRoute, item("pdf"));
  try {
  assert.equal(probe.adapter.persistence.recovery.ready, true);
  assert.equal(probe.adapter.persistence.editRevision, 0); assert.equal(probe.adapter.persistence.dirty, false);
  await act(async () => mounted.container.querySelector("[data-edit=pdf]").click());
  await tick();
  let persistence = probe.adapter.persistence;
  assert.equal(persistence.dirty, true); assert.equal(persistence.editRevision, 1);
  const copy = persistence.recovery.capture();
  assert.equal(copy.annotations[0].annotation.contents, "Edited PDF");
  assert.equal(copy.source.url, "https://example.invalid/source.pdf");
  assert.ok(!(copy instanceof Blob));
  await act(async () => { assert.equal(await persistence.recovery.restore(copy), true); });
  persistence = probe.adapter.persistence;
  assert.equal(persistence.editRevision, 1);
  assert.deepEqual(persistence.recovery.capture(), copy);
  const publish = persistence.preparePublish();
  await mounted.unmount();
  const pending = publish();
  await tick();
  assert.deepEqual(probe.pdfDoc, copy);
  probe.release();
  assert.equal((await pending).ok, true);
  } finally { if (mounted.container.isConnected) await mounted.unmount(); }
}));


function measureCapture(label, capture, limit) {
  const durations = []; let copy;
  for (let i = 0; i < 9; i++) { const start = performance.now(); copy = capture(); durations.push(performance.now() - start); }
  durations.sort((a,b)=>a-b);
  console.log(`ROUTE_CAPTURE ${label}: bytes=${Buffer.byteLength(JSON.stringify(copy))} p50=${durations[4].toFixed(2)}ms p95=${durations[8].toFixed(2)}ms n=9`);
  assert.ok(durations[8] <= limit, `${label}: ${durations[8]}ms exceeds ${limit}ms`);
}

test("real route capture timing: typical documents ≤30ms; 5000-element/annotation documents ≤100ms", async () => noErrors(async () => {
  let mounted = await mount(DeckRoute, item("ppt"));
  try {
    measureCapture("deck typical", probe.adapter.persistence.recovery.capture, 30);
    const deck = normalizeDeckDocument({ slides: Array.from({length:100},(_,index)=>({id:`s${index}`,notes:"Speaker notes",elements:Array.from({length:50},(_,id)=>({id:`e${index}-${id}`,type:"text",text:"A realistic paragraph with formatting ".repeat(3)}))})) });
    await act(async () => { assert.equal(probe.adapter.persistence.recovery.restore(deck), true); });
    measureCapture("deck 100 slides/5000 elements", probe.adapter.persistence.recovery.capture, 100);
  } finally { await mounted.unmount(); }
  mounted = await mount(PdfRoute, item("pdf"));
  try {
    measureCapture("pdf typical", probe.adapter.persistence.recovery.capture, 30);
    const doc = probe.adapter.persistence.recovery.capture();
    doc.annotations = Array.from({length:5000},(_,index)=>({annotation:{id:`a${index}`,type:3,pageIndex:index%3,contents:"A complete annotation",rect:{origin:{x:20,y:30},size:{width:100,height:40}}}}));
    await act(async () => { assert.equal(await probe.adapter.persistence.recovery.restore(doc), true); });
    measureCapture("pdf 5000 annotations", probe.adapter.persistence.recovery.capture, 100);
  } finally { await mounted.unmount(); }
}));


test("real PdfRoute: device stamp is uploaded before its edit, capture contains only the media reference", async () => noErrors(async () => {
  probe.uploaded=[];
  const mounted=await mount(PdfRoute,item("pdf"));
  try {
    const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+3MxZ5wAAAABJRU5ErkJggg==","base64");
    await act(async()=>{await probe.adapter.upload.onFiles([new File([png],"local.png",{type:"image/png"})]);});
    await tick();
    assert.equal(probe.uploaded.length,1);assert.equal(probe.adapter.persistence.editRevision,1);
    const copy=probe.adapter.persistence.recovery.capture();
    assert.equal(copy.annotations[0].annotation.type,13);assert.equal(copy.annotations[0].media.url,"https://example.invalid/upload.png");
    assert.equal(JSON.stringify(copy).includes("base64"),false);
  } finally {await mounted.unmount();}
}));
