import assert from "node:assert/strict";
import test from "node:test";
import React, { act, useState } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  findClip, normalizeTimelineDoc, patchClipIn, timelineTextListKind,
} from "../src/shell/video-editor/timeline-model.ts";
import { runVideoClipCommand, videoClipSelection } from "../src/shell/video-editor/video-edit-bar.ts";
import { canonicalSelectionControls } from "../src/shell/edit-bar-canon-projection.ts";
import { partitionSelectionInspectorControls } from "../src/shell/selection-inspector-groups.ts";
import { timelineRenderRequestBody } from "../src/shell/video-editor/render-contract.ts";
import {
  hydrateVideoTimelineDoc, resolveVideoTimelineReferences, serializeVideoProjectEnvelope,
} from "../src/shell/video-editor/video-timeline-source.ts";
import { createTimelineKernelState, createTimelineVersionSnapshot } from "../src/shell/video-editor/timeline-capability-engine.ts";

const tt = (text) => text;
const textDefaults = { font_family: "sans-serif", italic: false, underline: false, strike: false, line_height: 1.3, letter_spacing: 0, vertical_text: false };
const useUi = dataModule("export const useUI = () => (text) => text;");
const adapterModule = await import(await compileModule("src/shell/video-editor/use-video-timeline-selection-adapter.ts", {
  "../../i18n/ui/useUI": useUi,
}));
const { selectionAdapterContext, resolveSelectionAdapterContext } = await import(await compileModule("src/shell/selection-adapter.ts"));
const { TimelinePreviewEngine } = await import(await compileModule("src/shell/video-editor/preview-engine.ts", {
  "../../lib/media-proxy": dataModule("export const canvasSafeUrl = (url) => url;"),
}));

function fixture(text = "Mixed Case\nSecond line") {
  return normalizeTimelineDoc({ width: 1280, height: 720, fps: 30, tracks: [
    { id: "texts", kind: "text", clips: [{ id: "text", start_ms: 0, duration_ms: 2000, text,
      style: { font_size: 92, color: "#ff0000", background: "#111111", bold: true, align: "right", x: 0.7, y: 0.4 } }] },
    { id: "images", kind: "image", clips: [{ id: "image", start_ms: 0, duration_ms: 2000,
      source_url: "https://media.example/first.png", label: "First", x: 0.2, y: 0.3, scale: 0.4, rotation: 30, opacity: 0.7,
      source_ref: { artifactId: "00000000-0000-0000-0000-000000000001", revisionId: "00000000-0000-0000-0000-000000000011", path: "image/first.png" } }] },
  ] });
}

function target(initial = fixture()) {
  let doc = initial;
  const history = [];
  const calls = [];
  const state = {
    get doc() { return doc; },
    patchClip(id, patch) { history.push(doc); doc = normalizeTimelineDoc(patchClipIn(doc, id, patch)); calls.push(["patch", patch]); },
    patchClipTransient(id, patch) { doc = normalizeTimelineDoc(patchClipIn(doc, id, patch)); calls.push(["transient", patch]); },
    beginGesture() { history.push(doc); calls.push(["begin"]); },
    endGesture() { calls.push(["end"]); },
    cancelGesture() { doc = history.pop(); calls.push(["cancel"]); },
  };
  return {
    state, calls,
    get doc() { return doc; },
    clip(id = "text") { return findClip(doc, id).clip; },
    command(controlId, value, id = "text", extra = {}) {
      return runVideoClipCommand(state, findClip(doc, id), { requestId: "test", selectionId: id, controlId, value, ...extra });
    },
    reopen() { doc = hydrateVideoTimelineDoc(serializeVideoProjectEnvelope(doc)); return doc; },
    undo() { doc = history.pop(); },
  };
}

test("Timeline declares rendered text and image styles alongside the Library replacement entry", () => {
  const doc = fixture();
  const raw = videoClipSelection(findClip(doc, "text"), tt, doc);
  const resolved = resolveSelectionAdapterContext(selectionAdapterContext(raw), tt);
  const canon = canonicalSelectionControls(resolved, tt);
  for (const id of ["list", "case", "clear-format"]) assert.ok(canon.controls.some((control) => control.canonId === id), id);
  assert.equal(resolved.controls.find((control) => control.id === "font-size").unit, "px");
  assert.equal(resolved.controls.find((control) => control.id === "case").kind, "action");
  for (const id of ["font-family", "italic", "underline", "strike", "line-height", "letter-spacing", "vertical-text"]) {
    assert.ok(raw.controls.some((control) => control.id === id), id);
  }
  for (const id of ["link", "indent-increase", "indent-decrease"]) {
    assert.equal(raw.controls.some((control) => control.id === id), false, id);
  }
  assert.deepEqual(raw.controls.find((control) => control.id === "align").options.map((option) => option.value), ["left", "center", "right", "justify"]);
  const image = videoClipSelection(findClip(doc, "image"), tt, doc);
  for (const id of ["crop-x", "crop-y", "crop-width", "crop-height", "radius", "border-width", "border-color", "brightness", "contrast", "saturation", "image-fit", "alt"]) {
    assert.ok(image.controls.some((control) => control.id === id), id);
  }
  doc.tracks[1].clips.push({ ...doc.tracks[1].clips[0], id: "same-ref", source_ref: {
    path: "image/first.png", revisionId: "00000000-0000-0000-0000-000000000011", artifactId: "00000000-0000-0000-0000-000000000001",
  } });
  doc.tracks[1].clips.push({ id: "bad-ref", start_ms: 3000, duration_ms: 1000,
    source_ref: { artifactId: "invalid", revisionId: "invalid", path: "image/no.png" } });
  assert.equal(videoClipSelection(findClip(doc, "image"), tt, doc).controls.some((control) => control.id === "replace-source"), false);
});

test("List switches and clear restore exact original content after real project save/reopen", () => {
  const original = "• original bullet\n1. original number\n\n  indented original\n";
  const editor = target(fixture(original));
  editor.command("list", "bullet");
  assert.equal(editor.clip().text, "• • original bullet\n• 1. original number\n\n•   indented original\n");
  editor.reopen();
  assert.equal(timelineTextListKind(editor.clip()), "bullet");
  editor.command("list", "ordered");
  assert.equal(editor.clip().text, "1. • original bullet\n2. 1. original number\n\n3.   indented original\n");
  const snapshot = createTimelineVersionSnapshot(createTimelineKernelState(editor.doc));
  assert.ok(Object.isFrozen(snapshot.doc.tracks[0].clips[0].text_list));
  editor.reopen();
  editor.command("list", "none");
  assert.equal(editor.clip().text, original);
  assert.equal(editor.clip().text_list, undefined);
  assert.equal(timelineRenderRequestBody({ timeline: editor.doc }).timeline.tracks[0].clips[0].text, original);
  editor.undo();
  assert.equal(timelineTextListKind(editor.clip()), "ordered", "undo restores the previous managed list");
});

test("Manual edits and legacy prefixes never cause unowned content to be stripped", () => {
  const editor = target(fixture("1. authored\n• authored"));
  editor.command("list", "none");
  assert.equal(editor.clip().text, "1. authored\n• authored");
  editor.command("list", "bullet");
  editor.command("text", "• manually edited\n• authored");
  editor.reopen();
  assert.equal(timelineTextListKind(editor.clip()), "none");
  editor.command("list", "none");
  assert.equal(editor.clip().text, "• manually edited\n• authored");
  const stale = fixture("new content");
  stale.tracks[0].clips[0].text_list = { kind: "bullet", source_text: "old content" };
  const reopened = hydrateVideoTimelineDoc(serializeVideoProjectEnvelope(stale));
  assert.equal(reopened.tracks[0].clips[0].text_list, undefined);
  assert.equal(reopened.tracks[0].clips[0].text, "new content");
});

test("Case action changes actual text and keeps active list reversible across save/reopen", () => {
  const editor = target(fixture("Mixed Straße\n中文 unchanged"));
  editor.command("list", "ordered");
  editor.command("case");
  assert.equal(editor.clip().text, "1. MIXED STRASSE\n2. 中文 UNCHANGED");
  editor.reopen();
  editor.command("list", "none");
  assert.equal(editor.clip().text, "MIXED STRASSE\n中文 UNCHANGED");
  editor.command("case");
  assert.equal(editor.clip().text, "mixed strasse\n中文 unchanged", "Unicode case conversion is a content edit, not lossless formatting");
  editor.undo();
  assert.equal(editor.clip().text, "MIXED STRASSE\n中文 UNCHANGED");
  assert.equal(editor.command("case", "unrecognized"), false);
});

test("Clear format resets supported and legacy styles while retaining timing, placement and content", () => {
  const doc = fixture("Authored text");
  Object.assign(doc.tracks[0].clips[0].style, { font_family: "legacy", italic: true, line_height: 123 });
  const editor = target(doc);
  editor.command("list", "bullet");
  const before = editor.clip();
  editor.command("clear-format");
  editor.reopen();
  const clip = editor.clip();
  assert.equal(clip.text, "Authored text");
  assert.deepEqual(clip.style, { ...textDefaults, font_size: 64, color: "#ffffff", background: undefined, bold: false, align: "center", x: 0.7, y: 0.4 });
  assert.equal(clip.start_ms, before.start_ms);
  assert.equal(clip.duration_ms, before.duration_ms);
  assert.equal(clip.id, before.id);
  const request = timelineRenderRequestBody({ timeline: editor.doc });
  assert.deepEqual(request.timeline.tracks[0].clips[0], clip);
  editor.undo();
  assert.equal(editor.clip().style.bold, true);
  assert.equal(timelineTextListKind(editor.clip()), "bullet");
});

test("Replace uses an imported image identity, preserves clip geometry and survives reference resolution", async () => {
  const doc = fixture();
  const replacement = { id: "candidate", start_ms: 3000, duration_ms: 1000, label: "Replacement",
    source_url: "https://api.dev.oceanleo.com/v1/artifact-renditions/access/runtime-grant",
    source_ref: { artifactId: "00000000-0000-0000-0000-000000000002", revisionId: "00000000-0000-0000-0000-000000000012", path: "image/second.png" } };
  doc.tracks[1].clips.push(replacement);
  const editor = target(doc);
  const before = editor.clip("image");
  const context = videoClipSelection(findClip(doc, "image"), tt, doc);
  const projection = canonicalSelectionControls(resolveSelectionAdapterContext(selectionAdapterContext(context), tt), tt);
  const groups = partitionSelectionInspectorControls(projection.controls, tt);
  assert.ok(groups.compact.some((control) => control.id === "replace"));
  assert.equal(context.controls.find((control) => control.id === "replace-source").options[1].value, "candidate");
  assert.equal(editor.command("replace-source", "untrusted-url", "image"), false);
  assert.equal(editor.command("replace-source", "text", "image"), false);
  assert.equal(editor.command("replace-source", "candidate", "image"), true);
  assert.deepEqual(editor.clip("image").source_ref, replacement.source_ref);
  assert.notEqual(editor.clip("image").source_ref, replacement.source_ref);
  for (const key of ["id", "start_ms", "duration_ms", "x", "y", "scale", "rotation", "opacity"]) assert.equal(editor.clip("image")[key], before[key], key);
  const stored = serializeVideoProjectEnvelope(editor.doc);
  assert.equal(stored.includes("runtime-grant"), false, "private access grants never enter stored projects");
  editor.reopen();
  const resolved = await resolveVideoTimelineReferences(editor.doc, async (ref) => `https://media.example/${ref.path.split("/").pop()}`);
  assert.equal(findClip(resolved, "image").clip.source_url, "https://media.example/second.png");
  assert.equal(findClip(resolved, "image").clip.label, "Replacement");
  const request = timelineRenderRequestBody({ timeline: resolved });
  assert.equal(findClip(request.timeline, "image").clip.source_url, "https://media.example/second.png");
  editor.undo();
  assert.deepEqual(editor.clip("image").source_ref, before.source_ref);
});

test("Public replacement clears an old private source reference and unsupported image commands reject", () => {
  const doc = fixture();
  doc.tracks[1].clips.push({ id: "public", start_ms: 3000, duration_ms: 1000, source_url: "https://media.example/public.png" });
  const editor = target(doc);
  editor.command("replace-source", "public", "image");
  editor.reopen();
  assert.equal(editor.clip("image").source_ref, undefined);
  assert.equal(editor.clip("image").source_url, "https://media.example/public.png");
  for (const id of ["italic", "indent-increase", "unknown-image-command"]) assert.equal(editor.command(id, 1, "image"), false, id);
});

test("Real preview paints transformed text, cleared styles and the replaced image source", async () => {
  await import("./helpers/w1-jsdom-window.mjs");
  const oldRaf = globalThis.requestAnimationFrame;
  const oldCancel = globalThis.cancelAnimationFrame;
  const oldImage = globalThis.Image;
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.Image = class {
    complete = true; naturalWidth = 100; naturalHeight = 100;
    removeAttribute() {}
  };
  const editor = target();
  editor.command("case", "upper");
  editor.command("list", "bullet");
  const texts = [];
  const images = [];
  const ctx = new Proxy({
    measureText: (text) => ({ width: text.length * 20 }),
    fillText(text, x, y) { texts.push({ text, x, y, font: this.font, color: this.fillStyle, align: this.textAlign }); },
    drawImage(image) { images.push(image.src); },
  }, { get: (object, name) => object[name] ?? (() => {}) });
  const canvas = { width: 1280, height: 720, getContext: () => ctx };
  const engine = new TimelinePreviewEngine(editor.doc);
  try {
    engine.attachCanvas(canvas);
    // composite is the actual shared frame-rendering method; no browser is started.
    engine.composite(canvas, 1280, 720, 1);
    assert.deepEqual(texts.map((line) => line.text), ["• MIXED CASE", "• SECOND LINE"]);
    editor.command("clear-format");
    editor.command("text", "Reset");
    texts.length = 0;
    engine.setDoc(editor.doc);
    engine.composite(canvas, 1280, 720, 1);
    assert.equal(texts[0].text, "Reset");
    assert.match(texts[0].font, /^400 64px /);
    assert.equal(texts[0].color, "#ffffff");
    assert.equal(texts[0].align, "left", "glyph drawing uses a left anchor after calculating paragraph alignment");
    assert.equal(texts[0].x + ctx.measureText("Reset").width / 2, editor.clip().style.x * canvas.width, "the visible text remains centered on its paragraph anchor");
    const doc = editor.doc;
    doc.tracks[1].clips.push({ id: "public", start_ms: 3000, duration_ms: 1000, source_url: "https://media.example/replaced.png" });
    editor.command("replace-source", "public", "image");
    engine.setDoc(editor.doc);
    images.length = 0;
    engine.composite(canvas, 1280, 720, 1);
    assert.deepEqual(images, ["https://media.example/replaced.png"]);
  } finally {
    engine.dispose();
    globalThis.requestAnimationFrame = oldRaf;
    globalThis.cancelAnimationFrame = oldCancel;
    globalThis.Image = oldImage;
  }
});

test("Real selection adapter mounts, updates on document candidates and enforces read-only dispatch", async () => {
  await import("./helpers/w1-jsdom-window.mjs");
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import("react-dom/client");
  const errors = [];
  const oldError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(" "));
  let adapter;
  let update;
  let doc = fixture();
  const calls = [];
  function Harness() {
    const [flags, setFlags] = useState({ enabled: true, readOnly: false, doc });
    update = setFlags;
    const state = { doc: flags.doc, selected: findClip(flags.doc, "image"), patchClip: (...args) => calls.push(args) };
    adapter = adapterModule.useVideoTimelineSelectionAdapter({ state, ...flags });
    return React.createElement("div", null, adapter.context?.controls.map((control) => control.id).join(" "));
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(React.createElement(Harness)));
    assert.equal(host.textContent.includes("replace-source"), false);
    doc = structuredClone(doc);
    doc.tracks[1].clips.push({ id: "other", start_ms: 3000, duration_ms: 1000, source_url: "https://media.example/other.png" });
    await act(async () => update((flags) => ({ ...flags, doc })));
    assert.equal(host.textContent.includes("replace-source"), true);
    adapter.dispatch({ requestId: "replace", selectionId: "image", controlId: "replace-source", value: "other" });
    assert.equal(calls.length, 1);
    await act(async () => update((flags) => ({ ...flags, readOnly: true })));
    adapter.dispatch({ requestId: "readonly", selectionId: "image", controlId: "replace-source", value: "other" });
    assert.equal(calls.length, 1);
    await act(async () => update((flags) => ({ ...flags, enabled: false })));
    assert.equal(adapter.context, null);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    console.error = oldError;
  }
  assert.deepEqual(errors, []);
});

test("Export request retains transformed text and default styles after real project reopen", () => {
  const editor = target();
  editor.command("case", "upper");
  editor.command("list", "ordered");
  editor.command("clear-format");
  editor.command("list", "bullet");
  const doc = editor.reopen();
  const image = findClip(doc, "image").clip;
  image.source_url = "https://media.example/render.png";
  delete image.source_ref;
  const request = timelineRenderRequestBody({ timeline: doc });
  const text = findClip(request.timeline, "text").clip;
  assert.equal(text.text, "• MIXED CASE\n• SECOND LINE");
  assert.equal(text.style.font_size, 64);
  assert.equal(text.style.color, "#ffffff");
  assert.equal(text.style.background, undefined);
  assert.equal(findClip(request.timeline, "image").clip.source_url, "https://media.example/render.png");
});
