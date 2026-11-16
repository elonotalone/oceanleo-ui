import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { findClip, normalizeTimelineDoc, patchClipIn, normalizeTimelineCrop, timelineFontStack, timelineDocIssue } from "../src/shell/video-editor/timeline-model.ts";
import { runVideoClipCommand, videoClipSelection, VIDEO_TIMELINE_REPLACE_IMAGE_EVENT } from "../src/shell/video-editor/video-edit-bar.ts";
import { hydrateVideoTimelineDoc, serializeVideoProjectEnvelope } from "../src/shell/video-editor/video-timeline-source.ts";
import { TIMELINE_LIBRARY_IMAGE_ERROR_EVENT } from "../src/shell/video-editor/types.ts";
import { timelineRenderRequestBody } from "../src/shell/video-editor/render-contract.ts";

const tt = text => text;
const preview = await import(await compileModule("src/shell/video-editor/preview-engine.ts", {
  "../../lib/media-proxy": dataModule("export const canvasSafeUrl = url => url;"),
}));
const adapter = await import(await compileModule("src/shell/video-editor/use-video-timeline-selection-adapter.ts", {
  "../../i18n/ui/useUI": dataModule("export const useUI = () => text => text;"),
}));
function fixture() {
  return normalizeTimelineDoc({ width: 1000, height: 500, fps: 30, tracks: [
    { id: "texts", kind: "text", clips: [{ id: "text", start_ms: 0, duration_ms: 1000, text: "\nA中\nLong line\n", style: { font_size: 40, x: .3, y: .5 } }] },
    { id: "images", kind: "image", clips: [{ id: "image", start_ms: 0, duration_ms: 1000, source_url: "https://example.test/image.png", scale: .5 }] },
  ] });
}
function editor(initial = fixture()) {
  let doc = initial;
  const history = [];
  const state = { get doc() { return doc; },
    patchClip(id, patch) { history.push(doc); doc = normalizeTimelineDoc(patchClipIn(doc, id, patch)); },
    patchClipTransient(id, patch) { doc = normalizeTimelineDoc(patchClipIn(doc, id, patch)); },
    beginGesture() { history.push(doc); }, endGesture() {}, cancelGesture() { doc = history.pop(); },
  };
  return { state, get doc() { return doc; }, clip(id = "text") { return findClip(doc, id).clip; },
    command(controlId, value, id = "text", extra = {}) { return runVideoClipCommand(state, findClip(doc, id), { selectionId: id, requestId: "ed-b5c2", controlId, value, ...extra }); },
    reopen() { doc = hydrateVideoTimelineDoc(serializeVideoProjectEnvelope(doc)); },
  };
}
function canvasContext() {
  const calls = [];
  const ctx = new Proxy({
    measureText(text) { return { width: Array.from(text).length * 20 }; },
    fillText(text, x, y) { calls.push(["text", text, x, y, this.font]); },
    fillRect(...args) { calls.push(["rect", ...args]); },
    drawImage(...args) { calls.push(["image", ...args, this.filter, this.globalAlpha]); },
    roundRect(...args) { calls.push(["round", ...args]); },
    stroke() { calls.push(["stroke", this.lineWidth, this.strokeStyle]); },
  }, { get: (obj, key) => obj[key] ?? ((...args) => calls.push([key, ...args])) });
  return { ctx, calls };
}

test("New text commands keep exact whitespace and styles across actual save/reopen and render request", () => {
  const e = editor(); const original = e.clip().text;
  for (const [id, value] of [["font-family", "DejaVu Sans"], ["italic", true], ["underline", true], ["strike", true], ["line-height", 80], ["letter-spacing", 7], ["vertical-text", true], ["align", "justify"]]) assert.equal(e.command(id, value), true, id);
  e.reopen();
  const clip = e.clip();
  assert.equal(clip.text, original);
  assert.deepEqual(Object.fromEntries(["font_family", "italic", "underline", "strike", "line_height", "letter_spacing", "vertical_text", "align"].map(key => [key, clip.style[key]])), {
    font_family: "DejaVu Sans", italic: true, underline: true, strike: true, line_height: 2, letter_spacing: 7, vertical_text: true, align: "justify",
  });
  assert.deepEqual(timelineRenderRequestBody({ timeline: e.doc }).timeline.tracks[0].clips[0], clip);
  const controls = videoClipSelection(findClip(e.doc, "text"), tt, e.doc).controls;
  const line = controls.find(c => c.id === "line-height");
  assert.deepEqual([line.kind, line.value, line.unit, line.suffix, line.step], ["number", 80, "px", "px", 1]);
  assert.deepEqual(controls.find(c => c.id === "align").options.map(o => o.value), ["left", "center", "right", "justify"]);
});

test("Normalize bounds unsafe or nonfinite values and preserve first and final empty lines", () => {
  const doc = fixture(); const clip = doc.tracks[0].clips[0];
  clip.style = { font_family: "url(untrusted)", font_size: Infinity, italic: "true", underline: true, strike: true, line_height: 200, letter_spacing: -999, vertical_text: true, align: "justify" };
  const image = doc.tracks[1].clips[0];
  Object.assign(image, { crop: { x: .9, y: 2, width: 2, height: -1 }, radius: Infinity, border: { width: 900, color: "url(invalid)" }, brightness: 8, contrast: -1, saturation: Infinity, alt: "a".repeat(3000) });
  const e = editor(normalizeTimelineDoc(doc)); e.reopen();
  assert.equal(e.clip().text, "\nA中\nLong line\n");
  assert.equal(e.clip().style.font_family, "sans-serif");
  assert.equal(e.clip().style.font_size, 64);
  assert.equal(e.clip().style.italic, false);
  assert.equal(e.clip().style.line_height, 3);
  assert.equal(e.clip().style.letter_spacing, -10);
  assert.deepEqual(e.clip("image").border, { width: 100, color: "#000000" });
  assert.equal(e.clip("image").alt.length, 2000);
  assert.ok(e.clip("image").crop.x + e.clip("image").crop.width <= 1);
  assert.ok(e.clip("image").crop.y + e.clip("image").crop.height <= 1);
  assert.match(timelineFontStack("monospace"), /DejaVu Sans Mono.*Noto Sans CJK SC/);
});

test("Image controls execute crop, border, radius, fit, adjustments and alt metadata", () => {
  const e = editor();
  for (const [id, value] of [["crop-x", 25], ["crop-y", 10], ["crop-width", 50], ["crop-height", 60], ["radius", 22], ["border-width", 8], ["border-color", "#ff0000"], ["image-fit", "cover"], ["brightness", 30], ["contrast", 125], ["saturation", 75], ["alt", "A meaningful image"]]) assert.equal(e.command(id, value, "image"), true, id);
  e.reopen();
  const image = e.clip("image");
  assert.deepEqual(image.crop, { x: .25, y: .1, width: .5, height: .6 });
  assert.deepEqual(image.border, { width: 8, color: "#ff0000" });
  assert.deepEqual([image.radius, image.fit, image.brightness, image.contrast, image.saturation, image.alt], [22, "cover", .3, 1.25, .75, "A meaningful image"]);
  const controls = videoClipSelection(findClip(e.doc, "image"), tt, e.doc).controls;
  assert.equal(controls.some(c => c.id === "replace"), false, "Pure selection cannot claim an absent picker host");
  assert.equal(videoClipSelection(findClip(e.doc, "image"), tt, e.doc, { canReplaceImage: true }).controls.some(c => c.id === "replace"), true);
  assert.equal(e.command("italic", true, "image"), false);
  assert.equal(e.command("crop-x", 10), false);
  assert.equal(e.command("replace", undefined, "image"), false);
  let requested; e.state.replaceImage = id => requested = id;
  assert.equal(e.command("replace", undefined, "image"), true);
  assert.equal(requested, "image");
});

test("Crop gesture cancellation restores the pre-gesture normalized image", () => {
  const e = editor();
  e.command("crop-x", 0, "image", { transactionId: "crop", phase: "start" });
  e.command("crop-x", 40, "image", { transactionId: "crop", phase: "update" });
  assert.equal(e.clip("image").crop.x, .4);
  e.command("crop-x", 0, "image", { transactionId: "crop", phase: "cancel" });
  assert.equal(e.clip("image").crop, undefined);
});

test("Real text preview preserves blank lines and shares justify/spacing/decoration layout", () => {
  const e = editor();
  e.command("text", "\nAB\nABCD\n"); e.command("italic", true); e.command("underline", true); e.command("strike", true);
  e.command("line-height", 80); e.command("letter-spacing", 4); e.command("align", "justify");
  const { ctx, calls } = canvasContext();
  preview.TimelinePreviewEngine.prototype.drawText.call({}, ctx, e.clip(), 1000, 500, 1, 1);
  const lines = calls.filter(c => c[0] === "text");
  assert.equal(lines[0][1], ""); assert.equal(lines.at(-1)[1], "");
  assert.equal(lines.find(c => c[1] === "A")[3] - lines[0][3], 80);
  const chars = lines.filter(c => c[1] === "A" || c[1] === "B");
  assert.equal(chars[1][2] - chars[0][2], 72, "AB is expanded to the longest 92px line");
  assert.match(chars[0][4], /^italic 400 40px/);
  assert.equal(calls.filter(c => c[0] === "rect").length, 4, "two nonempty lines each have underline and strike");
  e.command("text", "\n中😀\n"); e.command("vertical-text", true);
  const vertical = canvasContext();
  preview.TimelinePreviewEngine.prototype.drawText.call({}, vertical.ctx, e.clip(), 1000, 500, 1, 1);
  assert.deepEqual(vertical.calls.filter(c => c[0] === "text").map(c => c[1]), ["", "中", "😀", ""]);
});

test("Real image preview crops before fit and scales corner/border in composition pixels", () => {
  const image = { naturalWidth: 200, naturalHeight: 100 };
  const { ctx, calls } = canvasContext();
  preview.drawTimelineImageFrame(ctx, image, { id: "i", start_ms: 0, duration_ms: 1000, scale: .5, crop: { x: .25, y: 0, width: .5, height: 1 }, fit: "cover", radius: 20, border: { width: 10, color: "#ff0000" }, opacity: .5, flip_x: true }, 1000, 500, .5, .8);
  const draw = calls.find(c => c[0] === "image");
  assert.deepEqual(draw.slice(2, 10), [50, 25, 100, 50, -250, -125, 500, 250]);
  assert.equal(draw[10], "none");
  assert.equal(draw[11], .4);
  assert.deepEqual(calls.find(c => c[0] === "round").slice(1), [-250, -125, 500, 250, 10]);
  assert.deepEqual(calls.find(c => c[0] === "stroke"), ["stroke", 5, "#ff0000"]);
  assert.ok(calls.some(c => c[0] === "scale" && c[1] === -1 && c[2] === 1));
  assert.deepEqual(normalizeTimelineCrop(undefined), { x: 0, y: 0, width: 1, height: 1 });
  for (const [fit, expected] of [["contain", [-125, -125, 250, 250]], ["stretch", [-250, -125, 500, 250]]]) {
    const sample = canvasContext();
    preview.drawTimelineImageFrame(sample.ctx, { naturalWidth: 100, naturalHeight: 100 }, { scale: .5, fit }, 1000, 500, 1);
    assert.deepEqual(sample.calls.find(c => c[0] === "image").slice(6, 10), expected, fit);
  }
});

test("Mounted real selection adapter routes replace to its document and blocks read-only", async () => {
  await import("./helpers/w1-jsdom-window.mjs");
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import("react-dom/client");
  const doc = fixture(); let active;
  const calls = [];
  const state = new Proxy({ doc, selected: findClip(doc, "image") }, {
    ownKeys() { throw new Error("Timeline state must retain its original Proxy identity"); },
    get(target, key) { return key === "deleteSelectedClip" ? () => calls.push("delete") : target[key]; },
  });
  function Harness({ readOnly = false }) { active = adapter.useVideoTimelineSelectionAdapter({ state, readOnly, canReplaceImage: true }); return React.createElement("div"); }
  const events = []; const listen = event => events.push(event.detail);
  const toolbar = document.createElement("div"); toolbar.dataset.selectionId = "image";
  const control = document.createElement("div"); control.dataset.selectionControlId = "replace";
  const trigger = document.createElement("button"); control.append(trigger); toolbar.append(control); document.body.append(toolbar);
  window.addEventListener(VIDEO_TIMELINE_REPLACE_IMAGE_EVENT, listen);
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(React.createElement(Harness)));
    assert.ok(active.context.controls.some(c => c.id === "replace"));
    active.dispatch({ selectionId: "image", requestId: "replace", controlId: "replace" });
    assert.deepEqual(events, [{ doc, clipId: "image", anchor: trigger }], "The event carries the actual selection toolbar trigger");
    active.dispatch({ selectionId: "image", requestId: "delete", controlId: "delete" });
    assert.deepEqual(calls, ["delete"], "Proxy-backed editing methods remain accessible");
    await act(async () => root.render(React.createElement(Harness, { readOnly: true })));
    active.dispatch({ selectionId: "image", requestId: "blocked", controlId: "replace" });
    assert.equal(events.length, 1);
    active.dispatch({ selectionId: "image", requestId: "blocked-delete", controlId: "delete" });
    assert.deepEqual(calls, ["delete"]);
  } finally { await act(async () => root.unmount()); host.remove(); toolbar.remove(); window.removeEventListener(VIDEO_TIMELINE_REPLACE_IMAGE_EVENT, listen); }
});

test("Image adjustments use additive brightness on black, preserve alpha and cache source pixels", () => {
  const pixels = new Uint8ClampedArray([0, 0, 0, 17, 128, 128, 128, 128]);
  preview.adjustTimelineImagePixels(pixels, { brightness: .25, contrast: 1, saturation: 1 });
  assert.deepEqual([...pixels], [64, 64, 64, 17, 192, 192, 192, 128]);
  const desaturated = new Uint8ClampedArray([200, 10, 20, 99]);
  preview.adjustTimelineImagePixels(desaturated, { saturation: 0 });
  assert.equal(desaturated[0], desaturated[1]); assert.equal(desaturated[1], desaturated[2]); assert.equal(desaturated[3], 99);
  const oldDocument = globalThis.document; let reads = 0; let writes;
  globalThis.document = { createElement() { return { width: 0, height: 0, getContext() { return {
    drawImage() {}, getImageData() { reads += 1; return { data: new Uint8ClampedArray([0, 0, 0, 255]) }; }, putImageData(pixels) { writes = pixels.data; },
  }; } }; } };
  try {
    const image = { naturalWidth: 1, naturalHeight: 1, src: "https://example.test/pixel.png" };
    const clip = { brightness: .25, contrast: 1, saturation: 1 };
    preview.drawTimelineImageFrame(canvasContext().ctx, image, clip, 100, 100, 1);
    preview.drawTimelineImageFrame(canvasContext().ctx, image, clip, 100, 100, 1);
    assert.equal(reads, 1); assert.deepEqual([...writes], [64, 64, 64, 255]);
  } finally { globalThis.document = oldDocument; }
});


const source = { artifactId: "00000000-0000-0000-0000-000000000002", revisionId: "00000000-0000-0000-0000-000000000012", rendition: "full" };
const libraryApi = dataModule(`export async function refreshArtifactRendition(...args) { return globalThis.__edB5c2Library.refresh(...args); }
export async function listMyArtifacts(...args) { return globalThis.__edB5c2Library.list(...args); }`);
const stage = await import(await compileModule("src/shell/video-editor/VideoTimelineStage.tsx", {
  "../../i18n/ui/useUI": dataModule("export const useUI = () => text => text;"),
  "../artifact-client": libraryApi,
  "./TimelineArea": dataModule("export const TimelineArea = () => null;"),
}));
const libraryPreview = await import(await compileModule("src/shell/video-editor/preview-engine.ts", {
  "../../lib/media-proxy": dataModule("export const canvasSafeUrl = url => url;"),
  "../artifact-client": libraryApi,
}));
async function eventually(predicate) {
  for (let i = 0; i < 80; i += 1) {
    if (predicate()) return;
    await act(async () => new Promise(resolve => setTimeout(resolve, 5)));
  }
  assert.fail("Expected async Library work to complete");
}
function fullImage() { return { ok: true, data: { url: "https://private.example/runtime-grant", mediaType: "image/png", revisionId: source.revisionId, expiresAt: new Date(Date.now() + 300_000).toISOString() } }; }
function libraryItem(kind = "image", id = source.artifactId) { return { key: id, id, source: "artifact", title: "Other project image", kind, siteId: "another-project", artifactId: id, revisionId: source.revisionId, favorite: false, meta: {} }; }
function libraryFile() { return { id: source.artifactId, name: "Other project image", artifactId: source.artifactId, revisionId: source.revisionId }; }

test("Private Library image replacement stores immutable identity across save/reopen and render, without grants", async () => {
  globalThis.__edB5c2Library = { refresh: async () => fullImage() };
  const patch = await stage.timelineLibraryImageReplacement(libraryFile());
  const e = editor(); const before = e.clip("image");
  e.state.patchClip("image", patch); e.reopen();
  const clip = e.clip("image");
  assert.deepEqual(clip.library_source, source);
  assert.ok(Object.isFrozen(clip.library_source));
  assert.equal(clip.source_ref, undefined); assert.equal(clip.source_url, undefined);
  for (const key of ["id", "start_ms", "duration_ms", "scale", "x", "y", "opacity"]) assert.equal(clip[key], before[key], key);
  assert.equal(timelineDocIssue(e.doc), "");
  assert.equal(serializeVideoProjectEnvelope(e.doc).includes("runtime-grant"), false);
  const sent = timelineRenderRequestBody({ timeline: e.doc }).timeline.tracks[1].clips[0];
  assert.deepEqual(sent.library_source, source); assert.equal(sent.source_url, undefined);
  const stale = normalizeTimelineDoc({ ...e.doc, tracks: [{ ...e.doc.tracks[1], clips: [{ ...clip, library_source: { ...source, url: "https://private.example/hidden-runtime-grant" }, source_url: "https://private.example/expired-runtime-grant", source_ref: { artifactId: source.artifactId, revisionId: source.revisionId, path: "assets/old.png" } }] }] });
  assert.equal(stale.tracks[0].clips[0].source_url, undefined); assert.equal(stale.tracks[0].clips[0].source_ref, undefined);
  assert.deepEqual(stale.tracks[0].clips[0].library_source, source);
  assert.equal(serializeVideoProjectEnvelope(stale).includes("runtime-grant"), false);
});

test("Real shared Library picker lists images from another project and commits selected private identity", async () => {
  await import("./helpers/w1-jsdom-window.mjs"); globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import("react-dom/client"); const e = editor();
  let limit; globalThis.__edB5c2Library = { refresh: async () => fullImage(), list: async options => { limit = options.limit; return { ok: true, data: { items: [libraryItem(), libraryItem("audio", "00000000-0000-0000-0000-000000000003")] } }; } };
  const state = { ...e.state, doc: e.doc, selected: findClip(e.doc, "image") };
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const fallbackAnchorRef = { current: host };
  const trigger = document.createElement("button"); document.body.append(trigger);
  trigger.getBoundingClientRect = () => ({ left: 400, top: 100, right: 440, bottom: 130, width: 40, height: 30 });
  const open = async () => act(async () => window.dispatchEvent(new window.CustomEvent(VIDEO_TIMELINE_REPLACE_IMAGE_EVENT, { detail: { doc: e.doc, clipId: "image", anchor: trigger } })));
  try {
    await act(async () => root.render(React.createElement(stage.TimelineImageReplacementPicker, { state, fallbackAnchorRef })));
    await open();
    const panel = document.querySelector("[data-anchored-popover]");
    assert.equal(panel.style.left, "400px"); assert.equal(panel.style.top, "136px", "Chooser opens beside the actual button");
    await act(async () => document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    assert.equal(document.querySelector("[role=dialog]"), null, "Escape closes the chooser");
    await open();
    await act(async () => document.body.dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true })));
    assert.equal(document.querySelector("[role=dialog]"), null, "Outside pointer closes the chooser");
    await open();
    assert.ok(document.querySelector("[data-composer-library-picker]"));
    await eventually(() => document.querySelector("[data-composer-library-item]"));
    assert.equal(limit, 100);
    const items = document.querySelectorAll("[data-composer-library-item]"); assert.equal(items.length, 1); assert.equal(items[0].textContent, "Other project image");
    await act(async () => items[0].click());
    assert.deepEqual(e.clip("image").library_source, source); assert.equal(document.querySelector("[role=dialog]"), null);
    await act(async () => root.render(React.createElement(stage.TimelineImageReplacementPicker, { state: { ...state, doc: e.doc, selected: findClip(e.doc, "image") }, fallbackAnchorRef })));
    await act(async () => window.dispatchEvent(new window.CustomEvent(TIMELINE_LIBRARY_IMAGE_ERROR_EVENT, { detail: { clipId: "image", source } })));
    assert.equal(document.querySelector("[role=alert]").textContent, "这份素材没能插入，请重试", "A runtime media failure is visible outside the picker");
  } finally { await act(async () => root.unmount()); host.remove(); trigger.remove(); }
});

test("Picker ignores delayed choices after read-only or selection changes and displays loading failures", async () => {
  const { createRoot } = await import("react-dom/client"); const e = editor(); let finish;
  globalThis.__edB5c2Library = { refresh: () => new Promise(resolve => { finish = resolve; }), list: async () => ({ ok: true, data: { items: [libraryItem()] } }) };
  const state = { ...e.state, doc: e.doc, selected: findClip(e.doc, "image") };
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const fallbackAnchorRef = { current: host };
  const open = async () => { await act(async () => window.dispatchEvent(new window.CustomEvent(VIDEO_TIMELINE_REPLACE_IMAGE_EVENT, { detail: { doc: e.doc, clipId: "image" } }))); await eventually(() => document.querySelector("[data-composer-library-item]")); };
  try {
    await act(async () => root.render(React.createElement(stage.TimelineImageReplacementPicker, { state, fallbackAnchorRef })));
    await open(); await act(async () => document.querySelector("[data-composer-library-item]").click());
    await act(async () => root.render(React.createElement(stage.TimelineImageReplacementPicker, { state, readOnly: true, fallbackAnchorRef })));
    await act(async () => root.render(React.createElement(stage.TimelineImageReplacementPicker, { state, readOnly: false, fallbackAnchorRef })));
    await act(async () => finish(fullImage()));
    assert.equal(e.clip("image").library_source, undefined, "A readonly transition permanently invalidates the pending mutation");
    await open(); await act(async () => document.querySelector("[data-composer-library-item]").click());
    await act(async () => root.render(React.createElement(stage.TimelineImageReplacementPicker, { state: { ...state, selected: findClip(e.doc, "text") }, fallbackAnchorRef })));
    await act(async () => finish(fullImage()));
    assert.equal(e.clip("image").library_source, undefined, "Selection changes invalidate delayed mutation");
    await act(async () => root.render(React.createElement(stage.TimelineImageReplacementPicker, { state, fallbackAnchorRef })));
    globalThis.__edB5c2Library.refresh = async () => ({ ok: false, error: "unavailable" });
    await open(); await act(async () => document.querySelector("[data-composer-library-item]").click());
    assert.equal(document.querySelector("[role=alert]").textContent, "这份素材没能插入，请重试");
    assert.equal(e.clip("image").library_source, undefined);
  } finally { await act(async () => root.unmount()); host.remove(); }
});

test("Preview resolves private Library identities into runtime-only media, ignores stale requests, and exposes failures", async () => {
  const oldRaf = globalThis.requestAnimationFrame, oldCancel = globalThis.cancelAnimationFrame, oldImage = globalThis.Image;
  globalThis.requestAnimationFrame = () => 1; globalThis.cancelAnimationFrame = () => {};
  globalThis.Image = class { complete = true; naturalWidth = 100; naturalHeight = 100; removeAttribute() {} };
  const e = editor(); e.state.patchClip("image", { library_source: source });
  let finish; globalThis.__edB5c2Library = { refresh: () => new Promise(resolve => { finish = resolve; }) };
  const engine = new libraryPreview.TimelinePreviewEngine(e.doc);
  const errors = []; const listener = event => errors.push(event.detail); window.addEventListener(TIMELINE_LIBRARY_IMAGE_ERROR_EVENT, listener);
  try {
    const pending = [...engine.libraryImages.values()][0].pending;
    await eventually(() => typeof finish === "function"); finish(fullImage()); await pending;
    assert.equal(engine.media.get("image").el.src, "https://private.example/runtime-grant");
    assert.equal(engine.doc.tracks[1].clips[0].source_url, undefined);
    const { ctx, calls } = canvasContext(); engine.composite({ getContext: () => ctx }, 1000, 500, 1);
    assert.equal(calls.filter(c => c[0] === "image").length, 1);
    const newer = { ...source, revisionId: "00000000-0000-0000-0000-000000000013" };
    e.state.patchClip("image", { library_source: newer }); engine.setDoc(e.doc);
    finish = undefined;
    const stale = [...engine.libraryImages.values()][0].pending; await eventually(() => typeof finish === "function");
    e.state.patchClip("image", { library_source: undefined, source_url: "https://example.test/new-public.png" }); engine.setDoc(e.doc);
    finish(fullImage()); await stale;
    assert.equal(engine.media.get("image").el.src, "https://example.test/new-public.png");
    globalThis.__edB5c2Library.refresh = async () => ({ ok: false });
    e.state.patchClip("image", { library_source: newer }); engine.setDoc(e.doc);
    await [...engine.libraryImages.values()][0].pending;
    assert.equal(errors.length, 1); assert.equal(errors[0].clipId, "image");
    assert.equal(engine.media.has("image"), false);
  } finally { engine.dispose(); window.removeEventListener(TIMELINE_LIBRARY_IMAGE_ERROR_EVENT, listener); globalThis.requestAnimationFrame = oldRaf; globalThis.cancelAnimationFrame = oldCancel; globalThis.Image = oldImage; }
});
