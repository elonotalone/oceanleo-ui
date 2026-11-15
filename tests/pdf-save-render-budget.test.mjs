/** Run-6: mount the real route, workbench, rail, stage, bridge, saver and page builder.
 * Only the WASM/DOM renderer, source/network and unrelated host chrome are replaced. */
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, dirname, resolve } from "node:path";
import { Session } from "node:inspector";
import React, { act } from "react";
import { PDFDocument, PDFName, PDFString } from "pdf-lib";
import { compileModule, dataModule, realModule } from "./helpers/module-bench.mjs";
import { inlineSaveHost } from "./helpers/s3a-inline-save-host.mjs";

const require = createRequire(import.meta.url);
const react = pathToFileURL(require.resolve("react")).href;
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvas = fabricRequire.resolve("canvas"), previousCanvas = require.cache[canvas];
require.cache[canvas] = { id: canvas, filename: canvas, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvas) require.cache[canvas] = previousCanvas; else delete require.cache[canvas];
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://example.invalid", pretendToBeVisual: true });
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node })) Object.defineProperty(globalThis, key, { configurable: true, value });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
const { createRoot } = await import("react-dom/client");
const baseline = process.env.S3A_PDF_PROFILE_BASELINE === "1";
const sourcePaths = ["advanced-routes/PdfRoute.tsx", ...["PdfControls.tsx", "PdfStage.tsx", "pdf-operations.ts", "pdf-working-copy-publish.ts", "use-pdf-workbench.ts"].map(p=>`media-editors/${p}`)].map(p=>`src/shell/${p}`);
const baselinePath = (path) => resolve(dirname(path), `.s3a-run6-base-${basename(path)}`);
if (baseline) {
  const temporary = sourcePaths.map(baselinePath);
  process.on("exit", () => temporary.forEach(p=>{ try { unlinkSync(p); } catch {} }));
  for (const path of sourcePaths) {
    let source = execFileSync("git", ["show", `cecad098:${path}`], { encoding: "utf8" });
    for (const peer of sourcePaths) {
      const stem = basename(peer).replace(/\.tsx?$/, "");
      source = source.replaceAll(`/${stem}"`, `/.s3a-run6-base-${stem}"`);
    }
    writeFileSync(baselinePath(path), source);
  }
}
const original = new Uint8Array(readFileSync("tests/fixtures/s3a-vs-source.pdf"));
const sample = await PDFDocument.load(original);
// Three visible copies of the real VS page expose all-at-once thumbnail work.
for (let index = sample.getPageCount(); index < 3; index++) sample.addPage((await sample.copyPages(sample, [0]))[0]);
const bytes = await sample.save();
const parsed = await PDFDocument.load(bytes);
const pagesOf = (pdf) => pdf.getPages().map((p, index) => ({ index, rotation: p.getRotation().angle / 90, size: p.getSize() }));
const sourcePages = pagesOf(parsed);
const probe = globalThis.__pdfBudget = { thumbs: [], viewers: 0, commits: [], thumbCost: 0, ack: 0, requestAt: 0, builds: 0, published: 0, tools: [], deselections: 0 };
globalThis.__s3a = {};
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
const tick = () => act(async () => { await wait(0); });
async function until(check) { for (let i = 0; i < 500 && !check(); i++) await tick(); assert.ok(check(), "viewer/save settled"); }
const off = () => () => {};
const task = (value) => ({ toPromise: async () => value });
probe.registry = () => {
  let active = "initial", pages = sourcePages, objects = [], currentBytes = bytes;
  const history = new Set(), annotations = new Set(), opened = new Set(), pageEvents = new Set();
  const scope = {
    getState: () => ({ activeToolId: null, selectedUids: [] }), getSelectedAnnotation: () => null,
    getAnnotations: () => objects.map((object) => ({ object })), setActiveTool(tool) { probe.tools.push(tool); }, deselectAnnotation() { probe.deselections++; }, setLocked() {},
    commit: () => task(true), exportAnnotations: () => task([]),
    createAnnotation(_page, object) { objects.push(object); for (const cb of history) cb({ documentId: active }); },
  };
  probe.annotate = () => scope.createAnnotation(0, { id: `mark-${objects.length}`, type: 1, pageIndex: 0, contents: "edit", rect: { origin: { x: 0, y: 0 }, size: { width: 10, height: 10 } } });
  probe.notifySelection = () => annotations.forEach((cb) => cb({ documentId: active }));
  probe.viewPages = () => pages;
  probe.setLiveBytes = (value) => { currentBytes = value; };
  probe.liveBytes = () => currentBytes;
  const plugins = {
    ui: { setDisabledCategories() {}, forDocument: () => ({ getActiveToolbar: () => null, isToolbarOpen: () => false, setActiveToolbar() {}, closeToolbarSlot() {}, closeSidebarSlot() {} }) },
    annotation: { forDocument: () => scope, onStateChange(cb) { annotations.add(cb); return () => annotations.delete(cb); }, getTool: () => ({ defaults: {} }) },
    history: { forDocument: () => ({ canUndo: () => objects.length > 0, canRedo: () => false }), onHistoryChange(cb) { history.add(cb); return () => history.delete(cb); } },
    "document-manager": {
      getActiveDocumentId: () => active, getActiveDocument: () => ({ pages }),
      onDocumentOpened(cb) { opened.add(cb); return () => opened.delete(cb); },
      openDocumentBuffer({ buffer }) { return { toPromise: async () => { pages = pagesOf(await PDFDocument.load(buffer)); currentBytes = new Uint8Array(buffer); return { documentId: `doc-${Math.random()}`, task: task(undefined) }; } }; },
      setActiveDocument(id) { active = id; objects = []; opened.forEach((cb) => cb({ documentId: active })); }, closeDocument: () => task(undefined),
    },
    thumbnail: { onRefreshPages: off, forDocument: () => ({ renderThumb(index) {
      probe.thumbs.push({ index, at: performance.now() });
      const start = performance.now(); while (performance.now() - start < probe.thumbCost) { /* controlled renderer cost */ }
      return task(new Blob(["thumbnail"]));
    } }) },
    scroll: { onPageChange(cb) { pageEvents.add(cb); return () => pageEvents.delete(cb); }, forDocument: () => ({ getCurrentPage: () => 1, getTotalPages: () => pages.length, scrollToPage({ pageNumber }) { pageEvents.forEach((cb) => cb({ documentId: active, pageNumber })); } }) },
    export: { forDocument: () => ({ saveAsCopy: () => task(currentBytes.buffer.slice(currentBytes.byteOffset, currentBytes.byteOffset + currentBytes.byteLength)) }) },
    form: { forDocument: () => ({ getFormValues: () => ({}), setFormValues: () => task(true) }) },
  };
  return { getPlugin: (id) => plugins[id] ? { provides: () => plugins[id] } : null };
};
probe.openEngine = async (input) => {
  probe.builds++;
  const pdf = await PDFDocument.load(input);
  return { doc: { pages: pagesOf(pdf) }, engine: { getPageAnnotations: () => task([]), saveAsCopy: () => task(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength)) }, close: async () => {} };
};
const noop = (...names) => dataModule(names.map((name) => `export function ${name}(){return null;}`).join("\n"));
const auth = {
  "../lib/auth/client": dataModule('export async function accessToken(){return "test";}'),
  "../lib/auth/config": dataModule('export const GATEWAY_BASE="https://gateway.invalid",SUPABASE_URL="https://database.invalid";'),
  "./user-edit-session": realModule("src/shell/user-edit-session.ts"),
};
const hook = await compileModule("src/shell/use-advanced-autosave.ts", auth);
const host = await inlineSaveHost(hook, auth, (p) => p);
const { resetBackgroundSaverForTests } = await import(await compileModule("src/shell/advanced-background-saver.ts", auth));
const stubs = {
  ...auth,
  "../../i18n/ui/useUI": dataModule('const tt=x=>x;export function useUI(){return tt;}'),
  "../AdvancedWorkbenchShell": dataModule(`import {createElement} from ${JSON.stringify(react)};import {InlineAdvancedWorkbenchShell} from ${JSON.stringify(host)};export function AdvancedWorkbenchShell(p){globalThis.__pdfBudget.adapter=p.adapter;return createElement(InlineAdvancedWorkbenchShell,p);}`),
  "../advanced-session-context": dataModule('export function useAdvancedSession(){return null;}'),
  "../collab/adapters/use-pdf-collab": dataModule('export function usePdfCollab(){return {readOnly:false,mayWrite:true};}'),
  "../plugin-theme": dataModule('export function usePluginTheme(){return {theme:"light"};}'),
  "../plugin-command": noop("usePluginCommandSurface"),
  "../workbench-material-provider": noop("useWorkbenchMaterialAdapter"),
  "../media-editors/PdfToolPalette": noop("PdfToolPalette"),
  "../media-editors/use-pdf-selection-adapter": dataModule('export function usePdfSelectionAdapter(){return {context:null,dispatch(){}};}'),
  "../media-editors/PdfSignatureDialog": noop("PdfSignatureDialog"),
  "../media-editors/PdfFindBar": noop("PdfFindBar"),
  "../EditBarFloatingPanel": dataModule('export function EditBarPanelRequest({children}){return children;}'),
  "./pdf-cjk-appearance": dataModule('export async function fixPdfCjkFreeTextAppearances(bytes){return {bytes,fixed:0};}'),
  "./pdf-source": dataModule('export async function loadInitialPdfSource(){return globalThis.__pdfBudget.source;}'),
  "./pdf-engine-host": dataModule('export function resolvePdfiumLoadPlan(){return {wasm:{ok:true,wasmUrl:"https://example.invalid/pdfium.wasm"},fontFallback:null};}export function pdfEngineBuffer(bytes){return Uint8Array.from(bytes).buffer;}export async function openPdfEngineDocument(bytes){return globalThis.__pdfBudget.openEngine(bytes);}'),
  "./pdf-library-save": dataModule('export async function savePdfBytesToLibrary(){globalThis.__pdfBudget.published++;return {ok:true,url:"https://example.invalid/saved.pdf",versionId:"published"};}'),
  "next/dynamic": dataModule(`import {createElement,lazy,Suspense} from ${JSON.stringify(react)};export default function dynamic(loader){const Component=lazy(()=>loader().then(value=>({default:value})));return function Dynamic(props){return createElement(Suspense,{fallback:null},createElement(Component,props));};}`),
  "@embedpdf/react-pdf-viewer": dataModule(`import {createElement,useEffect} from ${JSON.stringify(react)};export function PDFViewer(p){globalThis.__pdfBudget.viewers++;useEffect(()=>{p.onInit({setTheme(){}});p.onReady(globalThis.__pdfBudget.registry());},[]);return createElement("div",{"data-real-stage-viewer":true});}`),
};
probe.source = { bytes, durableUrl: "https://example.invalid/source.pdf", pageCount: sourcePages.length, blank: false };
const routePath = "src/shell/advanced-routes/PdfRoute.tsx";
const { PdfRoute } = await import(await compileModule(baseline ? baselinePath(routePath) : routePath, stubs));
let stored = null;
globalThis.fetch = async (_url, init = {}) => {
  if ((init.method ?? "GET") === "GET") return new Response(stored ? JSON.stringify(stored) : "{}", { status: stored ? 200 : 404 });
  if (init.method === "POST") return new Response("{}");
  assert.equal(init.method, "PUT");
  probe.requestAt = performance.now();
  const completedAt = probe.requestAt + 183;
  await wait(183); // Independent network completion deadline: renderer work can delay JS delivery.
  const body = JSON.parse(init.body);
  stored = { schema: body.schema, doc: body.doc, seq: (stored?.seq ?? 0) + 1, saved_at: new Date().toISOString() };
  probe.ack = completedAt;
  return new Response(JSON.stringify({ ok: true, seq: stored.seq, saved_at: stored.saved_at, server_ms: 33 }));
};
const item = { key: "library:pdf-render-budget", id: "pdf-render-budget", artifactId: "pdf-render-budget", revisionId: "r1", source: "library", kind: "pdf", title: "PDF render budget", url: "https://example.invalid/source.pdf", meta: {} };
async function mounted(run) {
  resetBackgroundSaverForTests(); stored = null; probe.thumbs = []; probe.thumbCost = 0; probe.viewers = 0; probe.commits = []; probe.tools = []; probe.deselections = 0;
  const errors = [], previous = console.error; console.error = (...args) => errors.push(args.join(" "));
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  const render = () => root.render(React.createElement(React.Profiler, { id: "real-pdf-route", onRender: (_id, phase, actualDuration) => probe.commits.push({ phase, ms: actualDuration }) }, React.createElement(PdfRoute, { item, onClose() {} })));
  try {
    await act(async () => render());
    try { await until(() => probe.adapter?.persistence.recovery.ready && probe.thumbs.length >= sourcePages.length); }
    catch (error) { throw new Error(`${error.message}; ready=${probe.adapter?.persistence.recovery.ready} thumbs=${probe.thumbs.length} viewers=${probe.viewers} status=${probe.adapter?.status} errors=${errors.join("\n")}`); }
    await tick();
    await run({ container, render });
    assert.deepEqual(errors, [], errors.join("\n"));
  } finally {
    probe.thumbCost = 0;
    const owed = probe.adapter?.persistence.dirty, published = probe.published;
    await act(async () => root.unmount());
    if (owed) await until(() => probe.published > published);
    await tick(); container.remove(); console.error = previous; resetBackgroundSaverForTests();
  }
}

test("PDF creation tools retain native identities, execute every action and share the existing panels", async () => mounted(async () => {
  const expected = [
    ["highlight", "highlight"], ["underline", "underline"], ["strikeout", "strikeout"],
    ["check", "oceanleo-check"], ["cross", "oceanleo-cross"], ["text", "freeText"],
    ["ink", "ink"], ["note", "textComment"],
  ];
  assert.deepEqual(probe.adapter.creationTools.map(tool => tool.id), ["highlight", "underline", "strikeout", "check", "cross", "text", "signature", "ink", "note", "find"].map(tool => `pdf-tool-${tool}`));
  const find = tool => probe.adapter.creationTools.find(entry => entry.tool === tool);
  for (const [tool, native] of expected) {
    assert.equal(find(tool).disabled, false, tool);
    await act(async () => find(tool).execute());
    assert.equal(probe.tools.at(-1), native, `${tool} uses its original EmbedPDF tool`);
  }
  assert.equal(probe.deselections, expected.length, "drawing tools release the previous selection");
  await act(async () => find("signature").execute());
  assert.equal(probe.tools.at(-1), null, "signature leaves drawing mode");
  assert.equal(find("signature").value, true, "signature opens its existing panel");
  await act(async () => find("signature").execute());
  assert.equal(find("signature").value, false);
  await act(async () => find("find").execute());
  assert.equal(find("find").value, true, "search opens its existing panel");
  await act(async () => find("find").execute());
  assert.equal(find("find").value, false);
  await act(async () => probe.adapter.mode.setMode("pro"));
  assert.deepEqual(probe.adapter.creationTools, [], "native Pro chrome owns its tools");
}));

test("run6 PDF real route: selection and parent updates do not repaint pages/thumbnails", async () => mounted(async ({ render }) => {
  const before = probe.thumbs.length, viewers = probe.viewers;
  await act(async () => probe.notifySelection());
  await act(async () => render());
  await tick();
  console.log(`PDF_ROUTE_PROFILE selection/parent: thumbnail calls=${probe.thumbs.length - before}, viewer renders=${probe.viewers - viewers}, commits=${JSON.stringify(probe.commits.slice(-3))}`);
  assert.equal(probe.thumbs.length, before, "unchanged page content must not restart thumbnail effects");
  assert.equal(probe.viewers, viewers, "unchanged stage props must not rerender the viewer");
}));

test("run6 PDF real route: page-edit acknowledgement reaches Saved within 50ms under renderer load", async () => mounted(async ({ container }) => {
  probe.thumbCost = 35;
  const delays = [], inputTimes = [];
  const builds = probe.builds;
  let savedAt = 0;
  const observer = new dom.window.MutationObserver(() => { if (container.querySelector('[data-save-state="saved"]')) savedAt = performance.now(); });
  observer.observe(container, { attributes: true, subtree: true, attributeFilter: ["data-save-state"] });
  try {
    for (let edit = 0; edit < 10; edit++) {
      savedAt = 0; probe.ack = 0; probe.requestAt = 0; const started = performance.now();
      await act(async () => container.querySelector('[data-pdf-page-rotate="1"]').click());
      await until(() => probe.requestAt > 0);
      // A selection-only viewer notification just before the response must not
      // launch three new thumbnail paints and delay delivery of that response.
      await act(async () => { await wait(Math.max(0, probe.requestAt + 170 - performance.now())); probe.notifySelection(); });
      await until(() => savedAt > 0 && container.querySelector('[data-pdf-processing="false"]'));
      delays.push(savedAt - probe.ack); inputTimes.push(savedAt - started);
      assert.equal(stored.doc.operations.length, edit + 1);
      assert.equal(probe.viewPages()[0].rotation, ((edit + 1) % 4), "the viewer accumulates each real rotation");
    }
    console.log(`PDF_ROUTE_PROFILE run6 ten rotations: ack-icon=${JSON.stringify(delays.map(x=>+x.toFixed(2)))}, input-icon=${JSON.stringify(inputTimes.map(x=>+x.toFixed(2)))}, thumbs=${probe.thumbs.length}, viewer-renders=${probe.viewers}`);
    assert.ok(Math.max(...delays) < 50, `ack→icon max ${Math.max(...delays).toFixed(2)}ms`);
    assert.ok(Math.max(...inputTimes) < 500, `input→icon max ${Math.max(...inputTimes).toFixed(2)}ms`);
    assert.equal(probe.builds, builds, "a live page edit never opens a second PDFium document");
  } finally { observer.disconnect(); }
}));

test("run6 PDF page history is parsed and serialized once per operation batch", async () => {
  const session = new Session(); session.connect();
  const post = (method) => new Promise((resolve, reject) => session.post(method, (error, result) => error ? reject(error) : resolve(result)));
  const load = PDFDocument.load, save = PDFDocument.prototype.save;
  let loads = 0, saves = 0;
  PDFDocument.load = function (...args) { loads++; return load.apply(this, args); };
  PDFDocument.prototype.save = function (...args) { saves++; return save.apply(this, args); };
  try {
    const publishPath = "src/shell/media-editors/pdf-working-copy-publish.ts";
    const { applyPdfPageOperations } = await import(baseline ? await compileModule(baselinePath(publishPath), stubs) : realModule(publishPath));
    await post("Profiler.enable"); await post("Profiler.start");
    const start = performance.now();
    const result = await applyPdfPageOperations(bytes, Array.from({ length: 12 }, () => ({ type: "rotate", pageIndex: 0, degrees: 90 })));
    const elapsed = performance.now() - start;
    const { profile } = await post("Profiler.stop");
    const top = profile.nodes.filter(n=>n.hitCount).sort((a,b)=>b.hitCount-a.hitCount).slice(0,6).map(n=>({fn:n.callFrame.functionName,hits:n.hitCount}));
    console.log(`PDF_CPU_PROFILE real history12 bytes=${bytes.length} loads=${loads} saves=${saves} total=${elapsed.toFixed(2)}ms top=${JSON.stringify(top)}`);
    assert.equal((await load.call(PDFDocument, result)).getPage(0).getRotation().angle, parsed.getPage(0).getRotation().angle);
    assert.equal(loads, 1, "page history must not repeatedly parse the entire source PDF");
    assert.equal(saves, 1, "page history must not repeatedly serialize the entire PDF");
  } finally { PDFDocument.load = load; PDFDocument.prototype.save = save; session.disconnect(); }
});

test("run6 live page transformation preserves native annotations and filled forms", async () => mounted(async ({ container }) => {
  const live = await PDFDocument.load(bytes), page = live.getPage(0);
  const annotation = live.context.register(live.context.obj({ Type: "Annot", Subtype: "Text", Rect: [10, 10, 30, 30], Contents: PDFString.of("Keep native annotation") }));
  page.node.set(PDFName.of("Annots"), live.context.obj([annotation]));
  const field = live.getForm().createTextField("live-field");
  field.setText("Keep live value"); field.addToPage(page, { x: 40, y: 40, width: 120, height: 20 });
  probe.setLiveBytes(await live.save());
  const builds = probe.builds;
  await act(async () => container.querySelector('[data-pdf-page-rotate="1"]').click());
  await until(() => container.querySelector('[data-pdf-processing="false"]') && stored?.seq === 1);
  const result = await PDFDocument.load(probe.liveBytes());
  assert.equal(result.getPage(0).getRotation().angle, 90);
  assert.equal(result.getForm().getTextField("live-field").getText(), "Keep live value");
  const annotations = result.getPage(0).node.Annots().asArray().map(ref=>result.context.lookup(ref));
  assert.ok(annotations.some(a=>a.get(PDFName.of("Contents"))?.decodeText() === "Keep native annotation"));
  assert.equal(probe.builds, builds);
}));

test("run6 thumbnail work is single flight, cancels old versions and releases its URLs", async () => {
  const path = "src/shell/media-editors/PdfControls.tsx";
  const { PdfControls } = await import(await compileModule(baseline ? baselinePath(path) : path, stubs));
  const errors = [], previous = console.error; console.error = (...args) => errors.push(args.join(" "));
  const createUrl = URL.createObjectURL, revokeUrl = URL.revokeObjectURL;
  const urls = [], revoked = [];
  URL.createObjectURL = (blob) => { const url = createUrl(blob); urls.push(url); return url; };
  URL.revokeObjectURL = (url) => { revoked.push(url); revokeUrl(url); };
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  const calls = [], releases = [];
  let active = 0, max = 0;
  const renderThumb = async (index) => { calls.push(index); max = Math.max(max, ++active); await new Promise(done=>releases.push(done)); active--; return new Blob(["thumbnail"]); };
  const props = { pageCount: 3, currentPage: 1, version: 0, aspect: () => 1.414, renderThumb, readOnly: false, busy: false, onGoTo() {}, onRotate() {}, onDelete() {}, onMove() {} };
  try {
    await act(async () => root.render(React.createElement(PdfControls, props)));
    await until(() => calls.length > 0);
    assert.deepEqual(calls, [0], "only one expensive page starts per task");
    await act(async () => root.render(React.createElement(PdfControls, { ...props, version: 1 })));
    await act(async () => releases.shift()());
    await until(() => calls.length === 2);
    assert.deepEqual(calls, [0, 0], "queued old-version pages never render");
    for (let index = 1; index < 3; index++) {
      await act(async () => releases.shift()());
      await until(() => calls.length === index + 2);
    }
    await act(async () => releases.shift()());
    assert.equal(max, 1);
    assert.equal(urls.length, 3, "cancelled first thumbnail never gets a URL");
    await act(async () => root.render(React.createElement(PdfControls, { ...props, version: 2 })));
    await until(() => calls.length === 5);
    await act(async () => root.unmount());
    await act(async () => releases.shift()());
    await tick();
    assert.equal(calls.length, 5, "unmount skips all remaining work");
    assert.deepEqual(revoked.sort(), urls.sort());
    assert.deepEqual(errors, []);
  } finally {
    await act(async () => root.unmount());
    releases.splice(0).forEach(done=>done());
    container.remove(); URL.createObjectURL = createUrl; URL.revokeObjectURL = revokeUrl; console.error = previous;
  }
});

test("run6 long page histories yield to the event loop and preserve no-op/index guards", async () => {
  const { applyPdfPageOperations } = await import("../src/shell/media-editors/pdf-working-copy-publish.ts");
  let yielded = false;
  const timer = setTimeout(() => { yielded = true; }, 0);
  try {
    const result = await applyPdfPageOperations(bytes, Array.from({ length: 1000 }, () => ({ type: "rotate", pageIndex: 0, degrees: 90 })));
    assert.equal(yielded, true);
    assert.equal((await PDFDocument.load(result)).getPage(0).getRotation().angle, parsed.getPage(0).getRotation().angle);
    assert.deepEqual(await applyPdfPageOperations(bytes, [{ type: "move", fromIndex: 0, toIndex: 0 }]), bytes);
    await assert.rejects(applyPdfPageOperations(bytes, [{ type: "rotate", pageIndex: 99, degrees: 90 }]), /PDF 页码超出范围/);
    await assert.rejects(applyPdfPageOperations(original, [{ type: "delete", pageIndex: 0 }]), /PDF 至少需要保留一页/);
  } finally { clearTimeout(timer); }
});
