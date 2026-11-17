import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildFabricImageToolbarControls } from "../src/shell/image-editor/fabric-image-toolbar-controls.ts";
import { dispatchFabricImageCommand } from "../src/shell/image-editor/fabric-image-commands.ts";
import { deckObjectGeometryControls } from "../src/shell/doc-editors/deck-object-geometry-controls.ts";
import { applyDeckToolbarCommand } from "../src/shell/doc-editors/deck-toolbar-command.ts";
import { videoClipSelection, runVideoClipCommand } from "../src/shell/video-editor/video-edit-bar.ts";

import {
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
} from "pdf-lib";
import { normalizeDeckDocument } from "../src/shell/doc-editors/deck-schema.ts";
import { gridUniverSelectionContext } from "../src/shell/doc-editors/grid-univer/stage-plan.ts";
import { GRID_UNIVER_COMMANDS } from "../src/shell/doc-editors/grid-univer/facade-commands.ts";
import {
  createBlankPdf,
  movePdfPage,
  rotatePdfPage,
} from "../src/shell/media-editors/pdf-operations.ts";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function controlBlock(contents, id) {
  const token = `id: "${id}"`;
  const start = contents.indexOf(token);
  assert.notEqual(start, -1, `missing control ${id}`);
  const next = contents.indexOf("id: ", start + token.length);
  return contents.slice(start, next < 0 ? contents.length : next);
}

function assertInspectorControls(path, ids) {
  const contents = source(path);
  for (const id of ids) {
    const block = controlBlock(contents, id);
    const inheritedGroup =
      (/\.\.\.group/.test(block) &&
        /const group = \{[\s\S]*?slot: "inspector"[\s\S]*?inspectorGroup:[\s\S]*?inspectorLabel:/.test(
          contents,
        )) ||
      (/\.\.\.[a-zA-Z]+Group/.test(block) &&
        /const [a-zA-Z]+Group = inspector\(/.test(contents)) ||
      (/\.\.\.(?:geometryInspector|inspector)\b/.test(block) &&
        /const (?:geometryInspector|inspector) = \{[\s\S]*?slot: "inspector"/.test(
          contents,
        ));
    assert.ok(
      inheritedGroup || /slot: "inspector"/.test(block),
      `${id} must be inspector-only`,
    );
    assert.ok(
      inheritedGroup || /inspectorGroup:/.test(block),
      `${id} needs a semantic group`,
    );
    assert.ok(
      inheritedGroup || /inspectorLabel:/.test(block),
      `${id} needs a visible group label`,
    );
  }
}

const tt = value => value;
function inspectors(controls, ids) {
  for (const id of ids) {
    const control = controls.find(control => control.id === id);
    assert.ok(control, `missing control ${id}`);
    assert.equal(control.slot, "inspector", `${id} must be inspector-only`);
    assert.ok(control.inspectorGroup, `${id} needs a semantic group`);
    assert.ok(control.inspectorLabel, `${id} needs a visible group label`);
  }
}
function videoLocation(kind) {
  const clip = { id: "clip", start_ms: 1000, duration_ms: 3000,
    source_url: "https://assets.oceanleo.app/clip.mp4", text: "Hello", style: {},
    transition_in: { type: "fade", duration_ms: 500 } };
  return { clip, track: { id: "track", kind, clips: [clip] } };
}

test("route commands target the rendered selection and preserve gesture commit/cancel semantics", () => {
  const calls = [];
  const record = name => (...args) => calls.push([name, ...args]);
  const selected = { id: "image", kind: "image", locked: false };
  const image = { selected, layers: [selected], selectLayer() {},
    resetFilters: record("reset"), confirmCrop: record("crop"), moveLayer: record("arrange") };
  const command = (controlId, value, extra = {}) => ({ version: 1, selectionId: "image", controlId, value, ...extra });
  dispatchFabricImageCommand(image, command("filter-reset"));
  dispatchFabricImageCommand(image, command("crop-apply"));
  dispatchFabricImageCommand(image, command("arrange", "forward"));
  assert.deepEqual(calls, [["reset"], ["crop"], ["arrange", "image", "up"]]);
  calls.length = 0;
  dispatchFabricImageCommand(image, command("arrange", "front", { selectionId: "stale" }));
  selected.locked = true;
  dispatchFabricImageCommand(image, command("arrange", "front"));
  assert.deepEqual(calls, [], "stale/locked selection must not mutate");

  const video = { patchClip: record("persist"), patchClipTransient: record("preview"),
    beginGesture: record("begin"), endGesture: record("end"), cancelGesture: record("cancel"),
    setClipTiming: record("timing") };
  const located = videoLocation("video");
  const volume = phase => ({ version: 1, selectionId: "clip", controlId: "volume", value: 50, transactionId: "drag", phase });
  for (const phase of ["start", "update", "commit", "cancel"]) runVideoClipCommand(video, located, volume(phase));
  assert.deepEqual(calls, [["begin"], ["preview", "clip", { volume: 0.5 }],
    ["preview", "clip", { volume: 0.5 }], ["end"], ["cancel"]]);
  calls.length = 0;
  assert.equal(runVideoClipCommand(video, located, { ...volume("commit"), selectionId: "stale" }), false);
  assert.deepEqual(calls, []);
  runVideoClipCommand(video, located, { version: 1, selectionId: "clip", controlId: "start-time", value: 2 });
  assert.deepEqual(calls, [["timing", "clip", { startMs: 2000 }]]);

  calls.length = 0;
  const deck = { activeSlide: { transition: { type: "fade", durationMs: 500 } },
    patchSlide: record("persist"), patchSlideTransient: record("preview"),
    beginGesture: record("begin"), endGesture: record("end"), cancelGesture: record("cancel") };
  applyDeckToolbarCommand(deck, null, { controlId: "transition-duration", value: 9999 });
  assert.deepEqual(calls, [["persist", { transition: { type: "fade", durationMs: 3000 } }]]);
  calls.length = 0;
  for (const phase of ["start", "update", "commit", "cancel"]) {
    applyDeckToolbarCommand(deck, null, { controlId: "notes", value: "Review", transactionId: "edit", phase });
  }
  assert.deepEqual(calls, [["begin"], ["preview", { notes: "Review" }],
    ["preview", { notes: "Review" }], ["end"], ["cancel"]]);

  for (const id of ["bold", "row-before", "row-delete", "column-before", "column-delete",
    "sort-asc", "sort-desc", "merge-cells", "split-cells"]) {
    const context = gridUniverSelectionContext({ selection: { startRow: 0, endRow: 1, startColumn: 0, endColumn: 1 } });
    if (id !== "split-cells") assert.ok(context.controls.some(control => control.id === id), id);
    assert.equal(typeof GRID_UNIVER_COMMANDS.find(command => command.id === id)?.run, "function", id);
  }
  calls.length = 0;
  assert.ok(!gridUniverSelectionContext().controls.some(control => control.id === "merge-cells"),
    "single-cell selection must not expose an inapplicable merge");
  const port = { range: { merge: record("merge"), breakApart: record("split") } };
  GRID_UNIVER_COMMANDS.find(command => command.id === "merge-cells").run(port, { on: true });
  GRID_UNIVER_COMMANDS.find(command => command.id === "merge-cells").run(port, { on: false });
  GRID_UNIVER_COMMANDS.find(command => command.id === "split-cells").run(port, {});
  assert.deepEqual(calls, [["merge"], ["split"], ["split"]], "canonical merge toggle retains split execution");
});

test("deck transition normalization is bounded and persistent", () => {
  const deck = normalizeDeckDocument({
    title: "Transition test",
    slides: [
      {
        id: "slide-1",
        title: "Intro",
        transition: { type: "fade", durationMs: 9_999 },
      },
    ],
  });
  assert.deepEqual(deck.slides[0].transition, {
    type: "fade",
    durationMs: 3_000,
  });
  assert.deepEqual(
    normalizeDeckDocument({
      slides: [{ title: "Wipe transition", transition: { type: "wipe" } }],
    }).slides[0].transition,
    { type: "wipe", durationMs: 500 },
  );
});

// 10-23 D4：批注由 EmbedPDF 写成标准 /Annots；缩略图栏的旋转、排序走 pdf-lib 改字节，
// 必须把每页已有的标准批注原样带过去（别的阅读器照样看得到）。
test("PDF page-rail edits keep the standard annotations embedded in each page", async () => {
  const blank = await createBlankPdf();
  const seeded = await PDFDocument.load(blank);
  seeded.addPage([400, 600]);
  const annot = seeded.context.register(
    seeded.context.obj({
      Type: "Annot",
      Subtype: "Text",
      Rect: [40, 40, 60, 60],
      Contents: PDFHexString.fromText("审核通过"),
    }),
  );
  seeded.getPage(0).node.addAnnot(annot);
  const bytes = await seeded.save();

  const rotated = await rotatePdfPage(bytes, 0, 90);
  const moved = await movePdfPage(rotated, 0, 1);
  const document = await PDFDocument.load(moved);
  assert.equal(document.getPage(0).node.Annots()?.size() ?? 0, 0);
  const page = document.getPage(1);
  assert.equal(page.getRotation().angle, 90);
  const annotations = page.node.Annots();
  assert.equal(annotations?.size(), 1);
  const dictionary = document.context.lookup(annotations.get(0), PDFDict);
  assert.equal(dictionary.lookup(PDFName.of("Subtype"), PDFName).toString(), "/Text");
  assert.equal(
    dictionary.lookup(PDFName.of("Contents"), PDFHexString).decodeText(),
    "审核通过",
  );
});
