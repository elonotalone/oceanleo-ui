import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_PROMPT_MAX_LENGTH,
  INPAINT_MASK_PADDING_PX,
  imageAiCommandDefinitions,
  inpaintMaskRegion,
  planOutpaint,
  planUpscale,
} from "../src/shell/image-editor/design-mode/image-ai-commands.ts";
import {
  imageCommandDefinitions,
} from "../src/shell/image-editor/image-command-surface.ts";
import { IMAGE_MAX_DIMENSION } from "../src/shell/image-editor/image-capability-engine.ts";

const doc = { width: 1000, height: 800 };

function deps(overrides = {}) {
  const calls = [];
  const base = {
    doc,
    selected: null,
    aiAvailable: true,
    busy: false,
    revision: () => 7,
    run: async (request) => {
      calls.push(request);
      return { ok: true, message: "已完成。" };
    },
  };
  return { deps: { ...base, ...overrides }, calls };
}

const byId = (definitions, id) => definitions.find((entry) => entry.spec.id === id);

// --------------------------------------------------------------------------
// Mask geometry
// --------------------------------------------------------------------------

test("the inpaint mask is the selection plus a blending margin", () => {
  const region = inpaintMaskRegion({ x: 100, y: 200, width: 300, height: 150 }, doc);
  assert.deepEqual(region, {
    left: 100 - INPAINT_MASK_PADDING_PX,
    top: 200 - INPAINT_MASK_PADDING_PX,
    width: 300 + INPAINT_MASK_PADDING_PX * 2,
    height: 150 + INPAINT_MASK_PADDING_PX * 2,
  });
  assert.ok(INPAINT_MASK_PADDING_PX > 0, "no margin leaves a visible seam at the edge");
});

test("a mask is clipped to the canvas rather than running off it", () => {
  const region = inpaintMaskRegion({ x: -50, y: -50, width: 120, height: 120 }, doc);
  assert.equal(region.left, 0);
  assert.equal(region.top, 0);
  assert.ok(region.width > 0 && region.height > 0);

  const corner = inpaintMaskRegion({ x: 960, y: 760, width: 200, height: 200 }, doc);
  assert.equal(corner.left + corner.width, doc.width);
  assert.equal(corner.top + corner.height, doc.height);
});

test("a selection entirely off-canvas has nothing to repaint", () => {
  assert.equal(inpaintMaskRegion({ x: 5000, y: 5000, width: 10, height: 10 }, doc), null);
  assert.equal(inpaintMaskRegion({ x: -900, y: 10, width: 100, height: 10 }, doc), null);
});

// --------------------------------------------------------------------------
// Pre-flight arithmetic
// --------------------------------------------------------------------------

test("outpainting needs a direction and respects the engine's size ceiling", () => {
  assert.equal(planOutpaint(doc, {}).ok, false);
  assert.equal(planOutpaint(doc, { top: 0, left: 0 }).ok, false);

  const fine = planOutpaint(doc, { top: 100, left: 50 });
  assert.equal(fine.ok, true);
  assert.equal(fine.width, 1050);
  assert.equal(fine.height, 900);

  const tooBig = planOutpaint(doc, { right: IMAGE_MAX_DIMENSION });
  assert.equal(tooBig.ok, false);
  assert.match(tooBig.reason, new RegExp(String(IMAGE_MAX_DIMENSION)));
});

test("negative and fractional margins are normalised, not passed through", () => {
  const plan = planOutpaint(doc, { top: -30, right: 10.4 });
  assert.equal(plan.ok, true);
  assert.equal(plan.margins.top, 0);
  assert.equal(plan.margins.right, 10);
});

test("upscale refuses a factor that would exceed the ceiling", () => {
  assert.equal(planUpscale(doc, 2).ok, true);
  const big = planUpscale({ width: 5000, height: 5000 }, 4);
  assert.equal(big.ok, false);
  assert.equal(big.width, 20000);
  assert.ok(big.reason.includes("8192") || big.reason.includes(String(IMAGE_MAX_DIMENSION)));
});

// --------------------------------------------------------------------------
// The commands themselves
// --------------------------------------------------------------------------

test("all five AI actions are registered as commands", () => {
  const definitions = imageAiCommandDefinitions(deps().deps);
  assert.deepEqual(
    definitions.map((entry) => entry.spec.id),
    [
      "image.ai.remove-bg",
      "image.ai.inpaint",
      "image.ai.outpaint",
      "image.ai.upscale",
      "image.ai.rewrite-text",
    ],
  );
  for (const definition of definitions) {
    assert.equal(definition.spec.mutates, true, `${definition.spec.id} changes the document`);
  }
});

test("no AI commands are offered when the editor cannot run them", () => {
  assert.deepEqual(imageAiCommandDefinitions(deps({ aiAvailable: false }).deps), []);
});

test("inpaint refuses without a selection instead of calling a provider", async () => {
  const { deps: d, calls } = deps();
  const result = await byId(imageAiCommandDefinitions(d), "image.ai.inpaint").run({});
  assert.equal(result.ok, false);
  assert.match(result.message, /先选中/);
  assert.equal(calls.length, 0, "a refusal must not spend a paid call");
});

test("inpaint sends the selection's mask and the trimmed prompt", async () => {
  const selected = { id: "o1", kind: "image", x: 100, y: 100, width: 200, height: 200 };
  const { deps: d, calls } = deps({ selected });
  const result = await byId(imageAiCommandDefinitions(d), "image.ai.inpaint").run({
    prompt: "  换成一只猫  ",
  });
  assert.equal(result.ok, true);
  assert.equal(result.revision, 7);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].id, "inpaint");
  assert.equal(calls[0].prompt, "换成一只猫");
  assert.deepEqual(calls[0].maskRegion, inpaintMaskRegion(selected, doc));
});

test("an empty inpaint prompt is omitted rather than sent as a blank string", async () => {
  const selected = { id: "o1", kind: "image", x: 10, y: 10, width: 50, height: 50 };
  const { deps: d, calls } = deps({ selected });
  await byId(imageAiCommandDefinitions(d), "image.ai.inpaint").run({ prompt: "   " });
  assert.equal(Object.hasOwn(calls[0], "prompt"), false);
});

test("outpaint reports the resulting canvas size on success", async () => {
  const { deps: d, calls } = deps();
  const result = await byId(imageAiCommandDefinitions(d), "image.ai.outpaint").run({
    top: 100,
    bottom: 100,
  });
  assert.equal(result.ok, true);
  assert.match(result.message, /1000×1000/);
  assert.deepEqual(calls[0].margins, { top: 100, right: 0, bottom: 100, left: 0 });
});

test("an impossible outpaint is refused before any provider call", async () => {
  const { deps: d, calls } = deps();
  const result = await byId(imageAiCommandDefinitions(d), "image.ai.outpaint").run({});
  assert.equal(result.ok, false);
  assert.equal(calls.length, 0);
});

test("upscale defaults to 2× and passes 4× through", async () => {
  const { deps: d, calls } = deps();
  const definition = byId(imageAiCommandDefinitions(d), "image.ai.upscale");
  await definition.run({ scale: "4" });
  assert.equal(calls[0].scale, 4);
  await definition.run({ scale: "nonsense" });
  assert.equal(calls[1].scale, 2);
});

test("rewrite-text only accepts a text object", async () => {
  const image = deps({ selected: { id: "o", kind: "image", x: 0, y: 0, width: 10, height: 10 } });
  const refused = await byId(
    imageAiCommandDefinitions(image.deps),
    "image.ai.rewrite-text",
  ).run({ text: "新文案" });
  assert.equal(refused.ok, false);
  assert.equal(image.calls.length, 0, "rewriting an image would burn a call on nonsense");

  const text = deps({ selected: { id: "t", kind: "text", x: 0, y: 0, width: 10, height: 10 } });
  const accepted = await byId(
    imageAiCommandDefinitions(text.deps),
    "image.ai.rewrite-text",
  ).run({ text: "  新文案  " });
  assert.equal(accepted.ok, true);
  assert.equal(text.calls[0].text, "新文案");
});

test("a second action is refused while one is still running", async () => {
  const { deps: d, calls } = deps({ busy: true });
  for (const definition of imageAiCommandDefinitions(d)) {
    const result = await definition.run({ scale: "2", text: "x", top: 10 });
    assert.equal(result.ok, false, definition.spec.id);
    assert.match(result.message, /还没跑完/);
  }
  assert.equal(calls.length, 0, "queueing a second call would double-charge");
});

test("a provider failure is reported as a failure, not swallowed", async () => {
  const { deps: d } = deps({
    run: async () => ({ ok: false, message: "provider 超时。" }),
  });
  const result = await byId(imageAiCommandDefinitions(d), "image.ai.remove-bg").run({});
  assert.equal(result.ok, false);
  assert.equal(result.message, "provider 超时。");
});

test("prompt fields are bounded so a brief cannot be pasted in wholesale", () => {
  const definitions = imageAiCommandDefinitions(deps().deps);
  for (const id of ["image.ai.inpaint", "image.ai.outpaint"]) {
    assert.equal(byId(definitions, id).bounds.prompt.maxLength, AI_PROMPT_MAX_LENGTH);
  }
});

// --------------------------------------------------------------------------
// Wiring into the editor's own command surface (this is criterion 4's point)
// --------------------------------------------------------------------------

function editorState(overrides = {}) {
  return {
    loading: false,
    cropping: false,
    editRevision: 3,
    doc,
    selected: null,
    aiAvailable: true,
    aiBusy: false,
    canvasBackground: "#ffffff",
    layers: [],
    zoom: 1,
    exportFormat: "png",
    exportQuality: 90,
    dirty: false,
    error: "",
    startCrop() {},
    setCropRatio() {},
    async confirmCrop() {},
    resizeDoc() {},
    rotateTarget() {},
    addText() {},
    setSelectedText() {},
    setCanvasBackground() {},
    ...overrides,
  };
}

test("the AI commands reach the same surface as crop and rotate", () => {
  const withAi = imageCommandDefinitions({
    editor: editorState(),
    deliver: async () => {},
    runAi: async () => ({ ok: true, message: "ok" }),
  }).map((definition) => definition.spec.id);

  for (const id of [
    "image.ai.remove-bg",
    "image.ai.inpaint",
    "image.ai.outpaint",
    "image.ai.upscale",
    "image.ai.rewrite-text",
  ]) {
    assert.ok(withAi.includes(id), `${id} is missing from the edit bar / agent surface`);
  }
  // The pre-existing commands are still there.
  assert.ok(withAi.includes("image.crop-to-ratio"));
  assert.ok(withAi.includes("image.export"));
});

test("a route with no AI runner registers no AI buttons", () => {
  const ids = imageCommandDefinitions({
    editor: editorState(),
    deliver: async () => {},
  }).map((definition) => definition.spec.id);
  assert.equal(
    ids.some((id) => id.startsWith("image.ai.")),
    false,
    "a button with no executor behind it is a button that always errors",
  );
});

test("command ids are unique across the merged surface", () => {
  const ids = imageCommandDefinitions({
    editor: editorState(),
    deliver: async () => {},
    runAi: async () => ({ ok: true, message: "ok" }),
  }).map((definition) => definition.spec.id);
  assert.equal(new Set(ids).size, ids.length, "a duplicate id would shadow one of the two");
});
