import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { findClip, normalizeTimelineDoc, patchClipIn, normalizeTimelineCrop, timelineFontStack } from "../src/shell/video-editor/timeline-model.ts";
import { runVideoClipCommand, videoClipSelection, VIDEO_TIMELINE_REPLACE_IMAGE_EVENT } from "../src/shell/video-editor/video-edit-bar.ts";
import { hydrateVideoTimelineDoc, serializeVideoProjectEnvelope } from "../src/shell/video-editor/video-timeline-source.ts";
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
});

test("Mounted real selection adapter routes replace to its document and blocks read-only", async () => {
  await import("./helpers/w1-jsdom-window.mjs");
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import("react-dom/client");
  const doc = fixture(); let active;
  function Harness({ readOnly = false }) { active = adapter.useVideoTimelineSelectionAdapter({ state: { doc, selected: findClip(doc, "image") }, readOnly, canReplaceImage: true }); return React.createElement("div"); }
  const events = []; const listen = event => events.push(event.detail);
  window.addEventListener(VIDEO_TIMELINE_REPLACE_IMAGE_EVENT, listen);
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(React.createElement(Harness)));
    assert.ok(active.context.controls.some(c => c.id === "replace"));
    active.dispatch({ selectionId: "image", requestId: "replace", controlId: "replace" });
    assert.deepEqual(events, [{ doc, clipId: "image" }]);
    await act(async () => root.render(React.createElement(Harness, { readOnly: true })));
    active.dispatch({ selectionId: "image", requestId: "blocked", controlId: "replace" });
    assert.equal(events.length, 1);
  } finally { await act(async () => root.unmount()); host.remove(); window.removeEventListener(VIDEO_TIMELINE_REPLACE_IMAGE_EVENT, listen); }
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
