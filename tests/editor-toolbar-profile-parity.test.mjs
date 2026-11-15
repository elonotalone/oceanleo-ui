import "./helpers/w1-jsdom-window.mjs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle, FontSize, FontFamily, Color } from "@tiptap/extension-text-style";
import { Highlight } from "@tiptap/extension-highlight";
import * as Fabric from "fabric";
import { RichDocTypography } from "../src/shell/doc-editors/rich-doc-model.ts";
import { normalizeDeckDocument } from "../src/shell/doc-editors/deck-schema.ts";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const h = React.createElement;
const tt = text => text;
for (const name of ["Event", "MouseEvent", "KeyboardEvent", "CustomEvent", "MutationObserver", "HTMLInputElement", "getComputedStyle"]) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: window[name].bind && name === "getComputedStyle" ? window[name].bind(window) : window[name] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.innerHeight = window.innerHeight;
globalThis.innerWidth = window.innerWidth;
window.scrollTo = () => {};
window.HTMLElement.prototype.scrollTo = () => {};
document.elementFromPoint = () => null;
// jsdom 20 cannot parse the platform starting-style rule. Geometry and overlay
// state stay real; motion itself is outside this DOM contract.
const motionStyle = document.createElement("style");
motionStyle.id = "leo-overlay-motion";
document.head.append(motionStyle);
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
const ui = dataModule("const tt=s=>s;export function useUI(){return tt;}");
const theme = dataModule(`import {createContext} from ${JSON.stringify(reactUrl)};export const PluginThemePortalContext=createContext(null);export function usePluginTheme(){return {theme:'light',accent:'#456'};}export function usePluginThemePortal(){return null;}export function PluginThemeScope({children}){return children;}export function pluginWorkbenchStyle(){return {};}export function pluginThemeIdForAdapter(){return 'pdf';}`);
const baseStubs = { "../i18n/ui/useUI": ui, "./plugin-theme": theme };
const load = async path => import(await compileModule(path, baseStubs));
const { useRichDocSelectionAdapter } = await load("src/shell/doc-editors/use-rich-doc-selection-adapter.ts");
const { useDeckSelectionAdapter } = await load("src/shell/doc-editors/use-deck-selection-adapter.ts");
const { useFabricImageSelectionAdapter } = await load("src/shell/image-editor/use-fabric-image-selection-adapter.ts");
const { usePdfSelectionAdapter } = await load("src/shell/media-editors/use-pdf-selection-adapter.ts");
const { useVideoTimelineSelectionAdapter } = await load("src/shell/video-editor/use-video-timeline-selection-adapter.ts");
const { gridUniverSelectionContext } = await load("src/shell/doc-editors/grid-univer/stage-plan.ts");
const { selectionAdapterContext, resolveSelectionAdapterContext } = await load("src/shell/selection-adapter.ts");
const { EDIT_BAR_CANON, canonicalSelectionControls } = await load("src/shell/edit-bar-canon.ts");
const { creationToolControl } = await load("src/shell/creation-tools.ts");
const { SelectionToolbar } = await load("src/shell/SelectionToolbar.tsx");
const { partitionSelectionInspectorControls } = await load("src/shell/selection-inspector-groups.ts");
const fabricMutationPolicy = await compileModule("src/shell/image-editor/image-mutation-policy.ts");
// Force transpilation of the real core's parameter property by routing one
// dependency through its real URL; no mutation policy implementation is faked.
const fabricCore = await compileModule("src/shell/image-editor/fabric-controller-core.ts", { ...baseStubs, "./image-mutation-policy": fabricMutationPolicy });
const { FabricEditorController } = await import(await compileModule("src/shell/image-editor/fabric-controller.ts", { ...baseStubs, "./fabric-controller-core": fabricCore }));
const { buildSelectedSnapshot } = await load("src/shell/image-editor/editor-objects.ts");
const { canvasSelectionContext } = await load("src/shell/video-canvas/engine/canvas-selection-adapter.ts");
const { createVideoProject, addProjectNode, registerAsset, updateProjectNode, projectHead } = await load("src/shell/video-canvas/engine/project-model.ts");
const { commandAvailability } = await load("src/shell/video-canvas/engine/command-registry.ts");

let stageWidth = 1500;
const viewport = new window.EventTarget();
Object.assign(viewport, { width: 1800, height: 900, offsetLeft: 0, offsetTop: 0 });
Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
const rect = (width, height = 32) => ({ x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON() {} });
window.HTMLElement.prototype.getBoundingClientRect = function () {
  if (this.hasAttribute("data-selection-measure-control-id")) return rect(this.dataset.selectionMeasureControlId === "font-family" ? 160 : this.dataset.selectionMeasureControlId === "font-size" ? 90 : 32);
  if (this.hasAttribute("data-selection-toolbar-viewport-capacity")) return rect(viewport.width - 32);
  if (this.hasAttribute("data-workspace-floating-toolbar-overlay")) return rect(stageWidth, 600);
  if (this.hasAttribute("data-parity-host")) return rect(stageWidth, 600);
  return rect(32);
};
class ResizeProbe {
  static all = new Set();
  constructor(callback) { this.callback = callback; this.targets = new Set(); ResizeProbe.all.add(this); }
  observe(target) { this.targets.add(target); }
  unobserve(target) { this.targets.delete(target); }
  disconnect() { this.targets.clear(); ResizeProbe.all.delete(this); }
  static flush() { for (const observer of [...this.all]) observer.callback([...observer.targets].map(target => ({ target, contentRect: target.getBoundingClientRect() })), observer); }
}
globalThis.ResizeObserver = window.ResizeObserver = ResizeProbe;
let errors;
const originalError = console.error;
test.beforeEach(() => { stageWidth = 1500; errors = []; console.error = (...args) => errors.push(args.map(String).join(" ")); });
test.afterEach(() => { console.error = originalError; assert.deepEqual(errors, [], "real adapters and toolbar must not log React errors"); });
async function mount(element) {
  const node = document.createElement("div"); document.body.append(node);
  const root = createRoot(node);
  await act(async () => root.render(element));
  return { node, async close() { await act(async () => root.unmount()); node.remove(); } };
}
async function click(node) { assert.ok(node, "click target must exist"); await act(async () => node.dispatchEvent(new MouseEvent("click", { bubbles: true }))); }
async function resize(width) { stageWidth = width; await act(async () => { ResizeProbe.flush(); window.dispatchEvent(new Event("resize")); await new Promise(done => requestAnimationFrame(done)); }); }
const controlNode = (root, id) => root.querySelector(`[data-selection-control-id="${id}"]:not([data-selection-overflow-control])`);
const canonicalProfile = control => ({ id: control.canonId, kind: control.kind, group: control.canonGroup, placement: control.placement, slot: control.slot, icon: control.icon, label: control.label, iconOnly: control.iconOnly, ...(control.unit ? { unit: control.unit, suffix: control.suffix } : {}) });

// Only each native engine's storage boundary is controlled. Hooks, percentage
// commands, Fabric's native opacity setter/readback, and shared widgets are real.
const pictureStates = new Map();
function PictureToolbar({ name, adapter, nativeOpacity, setOpacity, setReadOnly }) {
  const commands = React.useRef([]);
  pictureStates.set(name, { adapter, nativeOpacity, setOpacity, setReadOnly, commands: commands.current });
  return h("div", { "data-workspace-floating-toolbar-overlay": true, "data-workspace-floating-toolbar": true },
    h(SelectionToolbar, { variant: "floating", context: resolveSelectionAdapterContext(adapter.context, tt),
      onCommand: command => { commands.current.push(command); adapter.dispatch(command); } }));
}
function DeckPictureToolbar() {
  const [native, setNative] = React.useState({ id: "deck-picture", type: "image", src: "https://files.example/deck.png", x: 10, y: 10, width: 30, height: 20, rotation: 0, order: 1, opacity: 0.64 });
  const [readOnly, setReadOnly] = React.useState(false);
  const deck = React.useMemo(() => normalizeDeckDocument({ slides: [{ id: "slide", elements: [native] }] }), [native]);
  const element = deck.slides[0].elements[0];
  const adapter = useDeckSelectionAdapter({ editor: { deck, activeSlide: deck.slides[0], activeMaster: deck.masters[0], activeIndex: 0,
    selectedElement: element, loading: false, sourceFailed: false, readOnly,
    patchElement: (id, patch) => { assert.equal(id, element.id); setNative(current => ({ ...current, ...patch })); } } });
  return h(PictureToolbar, { name: "Deck", adapter, nativeOpacity: element.opacity, setOpacity: opacity => setNative(current => ({ ...current, opacity })), setReadOnly });
}
function FabricPictureToolbar() {
  const [nativeOpacity, setOpacity] = React.useState(0.64);
  const [readOnly, setReadOnly] = React.useState(false);
  const nativeImage = React.useMemo(() => {
    const element = document.createElement("img"); element.width = 200; element.height = 150;
    const image = new Fabric.FabricImage(element, { width: 200, height: 150 });
    image.oceanleoId = "fabric-picture";
    return image;
  }, []);
  nativeImage.set("opacity", nativeOpacity);
  const selected = buildSelectedSnapshot(Fabric, nativeImage);
  const adapter = useFabricImageSelectionAdapter({ readOnly, editor: { selected, cropping: false, cropRatio: "free", loading: false, sourceReady: true,
    transformInfo: null, filterInfo: { settings: { brightness: 0, contrast: 0, saturation: 0, blur: 0, pixelate: 0, grayscale: false, sepia: false, invert: false } },
    layers: [{ id: selected.id, locked: false }], selectLayer() {},
    setSelectedOpacity: value => FabricEditorController.prototype.setSelectedOpacity.call({
      mutateSelected: mutate => { mutate(nativeImage); setOpacity(nativeImage.opacity); },
    }, value),
  } });
  return h(PictureToolbar, { name: "Fabric", adapter, nativeOpacity: nativeImage.opacity, setOpacity, setReadOnly });
}
function PdfAnnotationToolbar({ type = 13 }) {
  const [selected, setSelected] = React.useState({ id: "pdf-annotation", type, opacity: 0.64, fontFamily: 4, fontSize: 12 });
  const [version, setVersion] = React.useState(1);
  const [readOnly, setReadOnly] = React.useState(false);
  const adapter = usePdfSelectionAdapter({ selected, version, activeTool: null, readOnly, bridge: {
    updateAnnotation: (target, patch) => { assert.equal(target.id, selected.id); setSelected(current => ({ ...current, ...patch })); setVersion(current => current + 1); },
  } });
  return h(PictureToolbar, { name: "PDF", adapter, nativeOpacity: selected.opacity, setOpacity: opacity => setSelected(current => ({ ...current, opacity })), setReadOnly });
}
function PdfStampToolbar() { return h(PdfAnnotationToolbar, { type: 13 }); }
function PdfFreeTextOpacityToolbar() { return h(PdfAnnotationToolbar, { type: 3 }); }
const pictureHarnesses = { Deck: DeckPictureToolbar, Fabric: FabricPictureToolbar, PDF: PdfStampToolbar };
function canvasPictureContext() {
  const added = addProjectNode(createVideoProject("Picture profile"), "image", { x: 10, y: 20 });
  const registered = registerAsset(added.project, { kind: "image", origin: "upload", title: "Canvas image", url: "https://files.example/canvas.png" });
  const project = updateProjectNode(registered.project, added.nodeId, "fixture", { assetId: registered.asset.assetId, params: { opacity: 0.64 } });
  const node = projectHead(project).graph.nodes[0];
  const environment = { getProject: () => project, getSelectedNodeId: () => node.nodeId, getSelectionEpoch: () => 1, getImageMode: () => "retouch", getLibraryArtifactId: () => "11111111-1111-4111-8111-111111111111" };
  return selectionAdapterContext(canvasSelectionContext({ project, node, asset: project.assets[node.assetId], selectionEpoch: 1, imageMode: "retouch", tt,
    availability: (id, args) => commandAvailability(id, environment, args) }));
}

function canvasTextContext() {
  const added = addProjectNode(createVideoProject("Text profile"), "text", { x: 10, y: 20 }, {
    text: "Canvas text", params: { includeInVideo: true, textStyle: { font_size: 30, bold: true, color: "#abcdef", align: "left" } },
  });
  const project = added.project;
  const node = projectHead(project).graph.nodes[0];
  const environment = { getProject: () => project, getSelectedNodeId: () => node.nodeId, getSelectionEpoch: () => 1, getImageMode: () => "retouch" };
  return selectionAdapterContext(canvasSelectionContext({ project, node, selectionEpoch: 1, imageMode: "retouch", tt,
    availability: (id, args) => commandAvailability(id, environment, args) }));
}

async function nativeProfiles() {
  const richEditor = new Editor({ extensions: [StarterKit, TextStyle, FontSize, FontFamily, Color, Highlight.configure({ multicolor: true }), RichDocTypography], content: '<p style="line-height:1.6"><span style="font-size:21px;font-family:Georgia;color:#123456"><strong>Document text</strong></span></p>', editorProps: { handleScrollToSelection: () => true } });
  richEditor.commands.setTextSelection({ from: 1, to: 10 });
  const deck = normalizeDeckDocument({ slides: [{ id: "slide", elements: [{ id: "deck-text", type: "text", text: "Slide text", fontSize: 27, lineHeight: 1.4, letterSpacing: 3 }] }] });
  const text = { value: "Image text", fontFamily: "Arial", fontSize: 32, fill: "#445566", backgroundColor: "", highlight: "", bold: true, italic: false, underline: false, linethrough: false, lineHeight: 1.25, charSpacing: 200, align: "left", stroke: "#000000", strokeWidth: 0 };
  const selected = { id: "fabric-text", kind: "text", text, isBackground: false, opacity: 1, angle: 0, flipX: false, flipY: false, x: 0, y: 0, width: 200, height: 80, locked: false, imageFit: null, fill: "#445566", stroke: "#000000", strokeWidth: 0, shadow: { enabled: false, color: "#000000", blur: 0, offsetX: 0, offsetY: 0 }, radius: null, table: null };
  const track = { id: "track", kind: "text", clips: [] };
  const clip = { id: "timeline-text", start_ms: 0, duration_ms: 2000, text: "Video text", style: { font_size: 44, bold: true, color: "#abcdef", align: "center" } };
  const inputs = [
    ["RichDoc", useRichDocSelectionAdapter, { editor: { editor: richEditor, editRevision: 1, sourceReady: true, loading: false, sourceFailed: false, collabReadOnly: false } }],
    ["Deck", useDeckSelectionAdapter, { editor: { deck, activeSlide: deck.slides[0], activeMaster: deck.masters[0], activeIndex: 0, selectedElement: deck.slides[0].elements[0], loading: false, sourceFailed: false, readOnly: false } }],
    ["Fabric", useFabricImageSelectionAdapter, { editor: { selected, cropping: false, cropRatio: "free", loading: false, sourceReady: true, saving: false, transformInfo: null, filterInfo: null, layers: [] } }],
    ["PDF", usePdfSelectionAdapter, { bridge: {}, selected: { id: "pdf-text", type: 3, fontFamily: 4, fontSize: 12, fontColor: "#000000" }, activeTool: null, version: 1, readOnly: false }],
    ["Timeline", useVideoTimelineSelectionAdapter, { state: { selected: { clip, track } } }],
  ];
  const contexts = new Map();
  const mounts = [];
  try {
    for (const [name, useAdapter, props] of inputs) {
      function Harness() { contexts.set(name, useAdapter(props).context); return null; }
      mounts.push(await mount(h(Harness)));
      assert.ok(contexts.get(name), `${name} must supply a native text selection`);
    }
    contexts.set("Grid", selectionAdapterContext(gridUniverSelectionContext({ sheetId: "sheet", revision: 1, style: { fontSize: 19, fontFamily: "Arial", bold: true }, tt })));
    contexts.set("Canvas", canvasTextContext());
    return { contexts, async close() { for (const mounted of mounts.reverse()) await mounted.close(); richEditor.destroy(); } };
  } catch (error) { for (const mounted of mounts.reverse()) await mounted.close(); richEditor.destroy(); throw error; }
}

async function assertNativeSizeWidget(name, context, expected) {
  const commands = [];
  const resolved = resolveSelectionAdapterContext(context, tt);
  const mounted = await mount(h("div", { "data-workspace-floating-toolbar-overlay": true, "data-workspace-floating-toolbar": true }, h(SelectionToolbar, { variant: "floating", context: resolved, onCommand: command => commands.push(command) })));
  try {
    await resize(1500);
    const toolbar = mounted.node.querySelector('[role="toolbar"]');
    const compact = controlNode(toolbar, "font-size");
    assert.ok(compact?.querySelector("[data-edit-bar-font-size]"), `${name} uses the real shared numeric font-size widget`);
    const number = compact.querySelector('input[type="number"]');
    assert.equal(number.valueAsNumber, expected[0]);
    assert.deepEqual([Number(number.min), Number(number.max)], expected.slice(1), `${name} exposes its own limits in the actual widget`);
    await resize(105);
    assert.ok(toolbar.dataset.selectionOverflowControls.split(" ").includes("font-size"), `${name} actually moves font size into More`);
    const more = toolbar.querySelector('button[aria-haspopup="dialog"]');
    await click(more);
    const menu = document.getElementById(more.getAttribute("aria-controls"));
    const overflowSize = menu?.querySelector('[data-selection-control-id="font-size"]');
    assert.ok(overflowSize, `${name} keeps its numeric editor in More`);
    assert.equal(overflowSize.querySelector('input[type="number"]').valueAsNumber, expected[0]);
    assert.match(overflowSize.textContent, /px/);
    const increment = [...overflowSize.querySelectorAll("button")].find(button => button.getAttribute("aria-label") === "字号 +");
    assert.ok(increment, `${name}: ${JSON.stringify([...overflowSize.querySelectorAll("button")].map(button => [button.getAttribute("aria-label"), button.textContent]))}`);
    await click(increment);
    assert.deepEqual([commands.at(-1).controlId, commands.at(-1).value], ["font-size", expected[0] + 1], `${name} menu step is exactly +1 px`);
    assert.equal(commands.at(-1).selectionId, context.id);
  } finally { await mounted.close(); }
}

test("seven native text selections resolve to the same canon shapes, px values and menu profiles with explicit engine limits", async () => {
  const native = await nativeProfiles();
  try {
    const projected = new Map();
    const sameId = new Map();
    const limits = { RichDoc: [21, 1, 1000], Deck: [27, 4, 300], Fabric: [32, 6, 320], PDF: [16, 6, 96], Grid: [19, 6, 96], Timeline: [44, 8, 300], Canvas: [30, 8, 300] };
    for (const [name, context] of native.contexts) {
      for (const input of context.controls.filter(control => control.domain !== "specific")) {
        for (const field of ["kind", "label", "icon", "iconOnly"]) assert.equal(field in input, false, `${name}:${input.id} must leave ${field} to the shell`);
      }
      const resolved = resolveSelectionAdapterContext(context, tt);
      const projection = canonicalSelectionControls(resolved, tt);
      projected.set(name, projection);
      const size = projection.controls.find(control => control.canonId === "font-size");
      assert.deepEqual([size.value, size.min, size.max], limits[name], `${name} keeps its actual value and supported size limits`);
      await assertNativeSizeWidget(name, context, limits[name]);
      for (const control of projection.controls.filter(control => control.canonId && control.canonGroup === "text")) {
        assert.equal(control.id, control.canonId, `${name} uses the canon id directly`);
        assert.equal(control.group, "canon-text");
        assert.equal(control.placement, EDIT_BAR_CANON[control.canonId].tier);
        if (["font-size", "line-height", "letter-spacing"].includes(control.canonId)) {
          assert.equal(typeof control.value, "number", `${name}:${control.id}`);
          assert.ok(Number.isFinite(control.value));
          assert.deepEqual([control.kind, control.unit, control.suffix, control.step], ["number", "px", "px", 1], `${name}:${control.id} is a px scalar`);
        }
        const expected = sameId.get(control.canonId);
        if (expected) assert.deepEqual(canonicalProfile(control), expected.profile, `${name}/${expected.name}:${control.canonId} use identical shell presentation`);
        else sameId.set(control.canonId, { name, profile: canonicalProfile(control) });
      }
    }
    for (const id of ["font-size", "bold", "text-color", "align"]) assert.equal([...projected.values()].filter(profile => profile.controls.some(control => control.canonId === id)).length, 7, `${id} must compare all seven engines`);
    const metrics = (name, id) => projected.get(name).controls.find(control => control.canonId === id);
    assert.deepEqual([metrics("RichDoc", "line-height").value, metrics("Deck", "line-height").value, metrics("Fabric", "line-height").value], [33.6, 37.8, 40]);
    assert.deepEqual([metrics("Deck", "letter-spacing").value, metrics("Fabric", "letter-spacing").value], [3, 6.4]);
    assert.deepEqual([metrics("Deck", "letter-spacing").min, metrics("Deck", "letter-spacing").max], [-10, 40]);
    assert.deepEqual([metrics("Fabric", "letter-spacing").min, metrics("Fabric", "letter-spacing").max], [-6.4, 32]);
    assert.deepEqual(metrics("PDF", "font-family").options.map(option => option.value), ["Helvetica", "Times", "Courier"]);
    for (const id of ["underline", "strike", "list", "line-height", "link", "highlight"]) assert.equal(Boolean(metrics("PDF", id)), false, `PDF native annotations do not offer ${id}`);
    for (const id of ["case", "clear-format"]) assert.ok(metrics("PDF", id), `PDF native annotations support ${id}`);
    const gridCompact = partitionSelectionInspectorControls(projected.get("Grid").controls).compact;
    for (const id of ["list", "line-height", "link", "case", "vertical-text", "indent-increase", "indent-decrease"]) assert.ok(gridCompact.some(control => control.canonId === id || control.id === id), `Grid supports ${id}`);
    assert.equal(metrics("Grid", "highlight").engineScope, "cell-background");
    for (const name of ["Timeline", "Canvas"]) {
      for (const id of ["font-family", "italic", "underline", "strike", "line-height", "letter-spacing", "vertical-text"]) assert.ok(metrics(name, id), `${name} supports the rendered ${id} field`);
      assert.ok(metrics(name, "align").options.some(option => option.value === "justify"), `${name} supports rendered justification`);
      assert.equal(Boolean(metrics(name, "link")), false, `${name} has no interactive link in rendered video`);
    }
    for (const id of ["list", "case", "clear-format"]) assert.ok(metrics("Timeline", id), `Timeline exposes the implemented ${id} command`);
    for (const id of ["list", "case", "clear-format"]) assert.ok(metrics("Canvas", id), `Canvas exposes the implemented ${id} command`);
  } finally { await native.close(); }
});

test("native Deck, Fabric, PDF stamp and canvas pictures share supported canon profiles, including percentage opacity", async () => {
  const contexts = new Map();
  const mounted = [];
  try {
    for (const [name, Harness] of Object.entries(pictureHarnesses)) {
      mounted.push(await mount(h(Harness)));
      contexts.set(name, pictureStates.get(name).adapter.context);
    }
    contexts.set("Canvas", canvasPictureContext());
    const profiles = new Map();
    const sameId = new Map();
    for (const [name, context] of contexts) {
      assert.equal(context.bar, "image", `${name} is an actual picture selection`);
      const projection = canonicalSelectionControls(resolveSelectionAdapterContext(context, tt), tt);
      // Compare the actual toolbar entries after inspector children become their
      // panel trigger. Checking text canonId fields alone misses panel/scalar drift.
      const controls = partitionSelectionInspectorControls(projection.controls).compact.filter(control => control.canonId);
      profiles.set(name, controls);
      for (const control of controls) {
        assert.equal(control.slot, "compact");
        assert.equal(control.placement, EDIT_BAR_CANON[control.canonId].tier);
        const expected = sameId.get(control.canonId);
        if (expected) {
          // Deck crops source edges numerically in an inspector; Fabric enters
          // a live crop gesture. The shared id/icon/placement stay identical.
          const actualProfile = canonicalProfile(control);
          if (control.canonId === "crop") {
            assert.ok(["action", "panel"].includes(control.kind));
            actualProfile.kind = expected.profile.kind;
          }
          assert.deepEqual(actualProfile, expected.profile, `${name}/${expected.name}:${control.canonId} picture presentation`);
        }
        else sameId.set(control.canonId, { name, profile: canonicalProfile(control) });
      }
      const opacityInput = context.controls.find(control => control.id === "opacity");
      if (name === "PDF") {
        assert.equal(opacityInput, undefined, `${name} does not invent picture opacity support`);
      } else {
        assert.ok(opacityInput);
        assert.equal(opacityInput.inspectorGroup, undefined);
        assert.equal(opacityInput.slot, undefined);
        for (const field of ["kind", "label", "icon", "iconOnly"]) assert.equal(field in opacityInput, false);
        const opacity = controls.find(control => control.canonId === "opacity");
        assert.deepEqual([opacity.kind, opacity.unit, opacity.suffix, opacity.step, opacity.value, opacity.min, opacity.max],
          ["number", "percent", "%", 1, 64, name === "PDF" ? 10 : 0, 100], `${name} exposes its actual limits with the same percentage widget`);
      }
    }
    for (const [id, names, kind] of [
      ["border", ["Deck", "Fabric", "Canvas"], "panel"],
      ["position", ["Deck", "Fabric", "Canvas"], "panel"],
      ["rotate", ["Deck", "Fabric", "Canvas", "PDF"], "action"],
    ]) for (const name of names) {
      const control = profiles.get(name).find(control => control.canonId === id);
      assert.ok(control, `${name} genuinely supports ${id}`);
      assert.deepEqual([control.kind, control.slot, control.placement], [kind, "compact", "primary"]);
    }
    assert.deepEqual(profiles.get("PDF").map(control => control.canonId), ["rotate", "delete"], "PDF stamps keep exactly their native supported capabilities");
    for (const id of ["opacity", "border", "replace", "radius", "image-fit", "alt"]) assert.ok(profiles.get("Canvas").some(control => control.canonId === id), `canvas supports the rendered or persisted ${id} capability`);
  } finally { for (const item of mounted.reverse()) await item.close(); }
});

test("supported image and PDF FreeText opacity widgets round-trip native values on the bar and in More", async () => {
  for (const [name, Harness] of Object.entries({ ...pictureHarnesses, PDF: PdfFreeTextOpacityToolbar })) {
    const mounted = await mount(h(Harness));
    const state = () => pictureStates.get(name);
    const toolbar = () => mounted.node.querySelector('[role="toolbar"]');
    const opacityNode = () => controlNode(toolbar(), "opacity");
    const stepButton = (node, direction) => {
      const button = [...node.querySelectorAll("button")].find(button => button.getAttribute("aria-label") === `不透明度 ${direction}`);
      assert.ok(button, `${name} ${direction}: ${JSON.stringify([...node.querySelectorAll("button")].map(button => [button.getAttribute("aria-label"), button.textContent]))}`);
      return button;
    };
    const readback = () => opacityNode().querySelector('input[type="number"]').valueAsNumber;
    try {
      await resize(1500);
      assert.equal(readback(), 64);
      assert.match(opacityNode().textContent, /%/);
      const input = opacityNode().querySelector('input[type="number"]');
      assert.deepEqual([Number(input.min), Number(input.max), Number(input.step)], [name === "PDF" ? 10 : 0, 100, 1]);
      assert.equal(opacityNode().querySelector('[aria-haspopup="dialog"]'), null, `${name} opacity is not a panel`);
      await click(stepButton(opacityNode(), "+"));
      assert.deepEqual([state().commands.at(-1).controlId, state().commands.at(-1).value], ["opacity", 65]);
      assert.equal(state().nativeOpacity, 0.65, `${name} native opacity receives 0.65, not 65`);
      assert.equal(readback(), 65, `${name} native state reads back through its real adapter`);
      await click(stepButton(opacityNode(), "-"));
      assert.equal(state().nativeOpacity, 0.64);
      assert.equal(readback(), 64);

      const minimum = name === "PDF" ? 0.1 : 0;
      await act(async () => state().setOpacity(minimum));
      await click(stepButton(opacityNode(), "-"));
      assert.equal(state().nativeOpacity, minimum, `${name} preserves its native lower limit`);
      await act(async () => state().setOpacity(1));
      await click(stepButton(opacityNode(), "+"));
      assert.equal(state().nativeOpacity, 1);
      assert.equal(readback(), 100);

      await act(async () => state().setOpacity(0.7));
      await resize(50);
      assert.ok(toolbar().dataset.selectionOverflowControls.split(" ").includes("opacity"), `${name} opacity moves into the actual More menu`);
      const more = toolbar().querySelector('button[aria-haspopup="dialog"]');
      await click(more);
      const menu = document.getElementById(more.getAttribute("aria-controls"));
      const menuOpacity = () => menu.querySelector('[data-selection-control-id="opacity"]');
      assert.match(menuOpacity().textContent, /不透明度/);
      assert.match(menuOpacity().textContent, /%/);
      await click(stepButton(menuOpacity(), "+"));
      assert.equal(state().nativeOpacity, 0.71, `${name} More + changes the native value by one percentage point`);
      await click(stepButton(menuOpacity(), "-"));
      assert.equal(state().nativeOpacity, 0.7);
      await resize(1500);
      assert.ok(opacityNode(), `${name} returns to the main bar`);
      assert.equal(readback(), 70);

      const current = state().adapter.context;
      await act(async () => state().adapter.dispatch({ requestId: "stale-picture", controlId: "opacity", selectionId: "another-picture", value: 20 }));
      assert.equal(state().nativeOpacity, 0.7, `${name} rejects commands for a different picture`);
      if (name === "PDF") {
        await act(async () => state().adapter.dispatch({ requestId: "old-opacity-alias", controlId: "opacity-value", selectionId: current.id, selectionRevision: current.revision, value: 73 }));
        assert.equal(state().nativeOpacity, 0.73, "the old PDF command alias remains accepted by the patch path");
        assert.equal(readback(), 73);
      }
      const beforeReadonly = state().nativeOpacity;
      await act(async () => state().setReadOnly(true));
      const readonlyControl = toolbar() ? controlNode(toolbar(), "opacity") : null;
      if (name === "PDF") assert.equal(state().adapter.context, null, "view-only PDF withdraws its writable selection even if text chrome retains a focus bookmark");
      else if (readonlyControl) assert.equal(readonlyControl.querySelector('input[type="number"]').disabled, true);
      await act(async () => state().adapter.dispatch({ requestId: "readonly-picture", controlId: "opacity", selectionId: current.id, value: 20 }));
      assert.equal(state().nativeOpacity, beforeReadonly, `${name} refuses readonly mutations`);
    } finally { await mounted.close(); }
  }
});

// The real PdfRoute supplies the ten tools and their real callbacks. Only its
// WASM stage, persistence/collaboration boundaries and surrounding shell are
// replaced; the actual selection resolver, canon projection and toolbar run.
let pdfAdapter;
let pdfNativeTools;
let pdfDeselects;
const pdfPatches = [];
let pdfTypingDraft = null;
const pdfBridge = { activeTool: () => null, pages: () => [], setTool(tool) { pdfNativeTools.push(tool); }, deselect() { pdfDeselects++; },
  selected: () => pdfState.selected,
  flushTextEdit() { if (pdfTypingDraft !== null) { pdfState.selected = { ...pdfState.selected, contents: pdfTypingDraft }; pdfTypingDraft = null; } },
  updateAnnotation(annotation, patch) { pdfPatches.push({ id: annotation.id, patch }); } };
const pdfState = { bridge: pdfBridge, selected: null, processing: false, annotationVersion: 1, loading: false, canUndo: false, canRedo: false, zoom: 100, initialBytes: new Uint8Array(), dirty: false, editRevision: 1, workingCopyReady: true };
globalThis.__edB2PdfParity = { editor: pdfState };
function PdfToolbarHost({ adapter }) {
  pdfAdapter = adapter;
  const selected = resolveSelectionAdapterContext(adapter.selection?.context ?? null, tt);
  const tools = adapter.creationTools || [];
  const context = selected ? { ...selected, controls: [...selected.controls, ...tools.map(tool => creationToolControl(tool, tt))] } : { version: 1, id: "creation:pdf", kind: "creation", controls: tools.map(tool => creationToolControl(tool, tt)) };
  return h("div", { "data-workspace-floating-toolbar-overlay": true, "data-workspace-floating-toolbar": true }, h(SelectionToolbar, { variant: "floating", context, onCommand: command => {
    const tool = tools.find(tool => tool.id === command.controlId && !tool.disabled);
    if (tool) tool.execute?.(); else adapter.selection?.dispatch(command);
  } }));
}
globalThis.__edB2PdfParity.renderShell = props => h(PdfToolbarHost, props);
const noop = (...names) => dataModule(names.map(name => `export function ${name}(){return null;}`).join("\n"));
const { PdfRoute } = await import(await compileModule("src/shell/advanced-routes/PdfRoute.tsx", {
  ...baseStubs,
  "../AdvancedWorkbenchShell": dataModule("export function AdvancedWorkbenchShell(props){return globalThis.__edB2PdfParity.renderShell(props);}"),
  "../media-editors/use-pdf-workbench": dataModule("export function usePdfWorkbench(){return globalThis.__edB2PdfParity.editor;}"),
  "../collab/adapters/use-pdf-collab": dataModule("export function usePdfCollab(){return {readOnly:false,mayWrite:true};}"),
  "../plugin-command": noop("usePluginCommandSurface"),
  "../workbench-material-provider": noop("useWorkbenchMaterialAdapter"),
  "../advanced-session-context": noop("useAdvancedSession"),
  "../media-editors/PdfToolPalette": noop("PdfToolPalette"),
  "../media-editors/PdfSignatureDialog": noop("PdfSignatureDialog"),
  "../media-editors/PdfFindBar": noop("PdfFindBar"),
  "../EditBarFloatingPanel": noop("EditBarPanelRequest"),
  "next/dynamic": dataModule("export default function dynamic(){return ()=>null;}"),
}));

test("real PDF ten creation tools are icon-only, overflow into labeled More, execute there and return on expansion", async () => {
  pdfNativeTools = []; pdfDeselects = 0;
  const mounted = await mount(h(PdfRoute, { item: { id: "pdf-parity", kind: "pdf", title: "PDF", meta: {} }, onClose() {} }));
  const ids = ["highlight", "underline", "strikeout", "check", "cross", "text", "signature", "ink", "note", "find"].map(tool => `pdf-tool-${tool}`);
  const toolbar = () => mounted.node.querySelector('[role="toolbar"]');
  const visible = () => toolbar().dataset.selectionVisibleControls.split(" ").filter(Boolean);
  const overflow = () => toolbar().dataset.selectionOverflowControls.split(" ").filter(Boolean);
  try {
    assert.equal(mounted.node.querySelectorAll('[role="toolbar"]').length, 1);
    assert.deepEqual(pdfAdapter.creationTools.map(tool => tool.id), ids);
    await resize(1500);
    assert.deepEqual(visible(), ids);
    assert.deepEqual(overflow(), []);
    for (const id of ids) {
      const button = controlNode(toolbar(), id).querySelector("button");
      assert.equal(button.textContent.trim(), "", `${id} is icon-only on the bar`);
      assert.ok(button.querySelector("svg"), `${id} has a creation glyph`);
      assert.ok(button.getAttribute("aria-label"), `${id} remains named`);
      assert.equal(button.dataset.workspaceActionId, id);
      assert.equal(controlNode(toolbar(), id).hasAttribute("data-edit-bar-canon"), false, `${id} stays in the creation domain`);
    }
    await resize(480);
    assert.deepEqual(new Set([...visible(), ...overflow()]), new Set(ids), "all creation tools remain reachable at 480px");
    await resize(105);
    assert.ok(overflow().length >= 8, "a narrow host moves creation tools into More");
    assert.deepEqual(new Set([...visible(), ...overflow()]), new Set(ids), "no tool disappears at the breakpoint");
    const nativeById = { "pdf-tool-highlight": "highlight", "pdf-tool-underline": "underline", "pdf-tool-strikeout": "strikeout", "pdf-tool-check": "oceanleo-check", "pdf-tool-cross": "oceanleo-cross", "pdf-tool-text": "freeText", "pdf-tool-ink": "ink", "pdf-tool-note": "textComment" };
    const menuIds = [...overflow()];
    for (const id of menuIds) {
      const more = toolbar().querySelector('button[aria-haspopup="dialog"]');
      await click(more);
      const dialog = document.getElementById(more.getAttribute("aria-controls"));
      assert.ok(dialog);
      const node = dialog.querySelector(`[data-selection-control-id="${id}"]`);
      const button = node?.querySelector("button");
      assert.ok(button?.textContent.trim(), `${id} shows its text in More`);
      await click(button);
      if (id in nativeById) assert.equal(pdfNativeTools.at(-1), nativeById[id], `${id} executes the original native action from More`);
      else assert.equal(pdfAdapter.creationTools.find(tool => tool.id === id).value, true, `${id} opens the original panel from More`);
      assert.equal(more.getAttribute("aria-expanded"), "false", "executing an action closes More");
    }
    assert.ok(pdfDeselects >= menuIds.filter(id => id in nativeById).length);
    await resize(1500);
    assert.deepEqual(visible(), ids, "all ten tools return to the expanded bar");
    assert.deepEqual(overflow(), []);
    const underline = controlNode(toolbar(), "pdf-tool-underline").querySelector("button");
    assert.equal(underline.textContent.trim(), "", "restored controls regain icon-only presentation");
    await click(underline);
    assert.equal(pdfNativeTools.at(-1), "underline", "the restored control remains executable");
  } finally { await mounted.close(); }
});

test("PDF at 480px with FreeText selection folds into one More and every property/tool stays reachable", async () => {
  pdfNativeTools = []; pdfDeselects = 0;
  pdfState.selected = { id: "narrow-text", type: 3, pageIndex: 0, contents: "Hello", fontFamily: 4, fontSize: 12,
    rect: { origin: { x: 20, y: 30 }, size: { width: 180, height: 50 } } };
  const mounted = await mount(h(PdfRoute, { item: { id: "pdf-parity", kind: "pdf", title: "PDF", meta: {} }, onClose() {} }));
  try {
    await resize(480);
    const toolbar = mounted.node.querySelector('[role="toolbar"]');
    const shown = toolbar.dataset.selectionVisibleControls.split(" ").filter(Boolean);
    const hidden = toolbar.dataset.selectionOverflowControls.split(" ").filter(Boolean);
    assert.ok(hidden.length > 0);
    const ids = [...pdfAdapter.selection.context.controls.map(control => control.id), ...pdfAdapter.creationTools.map(tool => tool.id)];
    assert.deepEqual(new Set([...shown, ...hidden]), new Set(ids));
    const more = toolbar.querySelector('button[aria-haspopup="dialog"]');
    assert.ok(more);
    await click(more);
    const menu = document.getElementById(more.getAttribute("aria-controls"));
    for (const id of hidden) assert.ok(menu.querySelector(`[data-selection-control-id="${id}"]`), `${id} is reachable in More at 480px`);
    for (const id of shown) assert.ok(controlNode(toolbar, id), `${id} is reachable on the bar at 480px`);
    assert.equal(toolbar.querySelectorAll('button[aria-haspopup="dialog"][aria-controls]').length, 1);
    pdfPatches.length = 0;
    pdfTypingDraft = "Unsaved typing";
    await click(menu.querySelector('[data-selection-control-id="case"] button'));
    assert.deepEqual(pdfPatches.at(-1), { id: "narrow-text", patch: { contents: "UNSAVED TYPING" } }, "case reads the freshly committed native text, not the stale selection snapshot");
    if (more.getAttribute("aria-expanded") !== "true") await click(more);
    const resetMenu = document.getElementById(more.getAttribute("aria-controls"));
    await click(resetMenu.querySelector('[data-selection-control-id="clear-format"] button'));
    assert.deepEqual(pdfPatches.at(-1), { id: "narrow-text", patch: { fontFamily: 4, fontSize: 12, fontColor: "#000000", richContent: "", defaultStyle: "" } });
  } finally { pdfState.selected = null; await mounted.close(); }
});
