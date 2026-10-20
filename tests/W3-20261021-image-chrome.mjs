import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFabricImageToolbarControls,
  primaryImageToolbarControlIds,
} from "../src/shell/image-editor/fabric-image-toolbar-controls.ts";
import {
  IMAGE_EDITOR_RETIRED_AI_IDS,
  IMAGE_EDITOR_RETIRED_AI_LABELS,
  imageEditorOfferedUiAiIds,
  imageEditorOfferedUiAiLabels,
  imageRouteChrome,
} from "../src/shell/image-editor/image-editor-ui-offerings.ts";
import {
  imageStageShowsSourceLoadOverlay,
  isNewImageSourceSession,
} from "../src/shell/image-editor/image-source-ready.ts";
import { imageCommandDefinitions } from "../src/shell/image-editor/image-command-surface.ts";
import { IMAGE_AI_PANEL_CAPABILITIES } from "../src/shell/image-editor/image-capability-engine.ts";

const tt = (zh) => zh;

function selectedImage(overrides = {}) {
  return {
    id: "obj-1",
    kind: "image",
    isBackground: false,
    opacity: 100,
    angle: 0,
    flipX: false,
    flipY: false,
    x: 502,
    y: 415,
    width: 200,
    height: 150,
    locked: false,
    imageFit: "fill",
    fill: "#000000",
    stroke: "#000000",
    strokeWidth: 0,
    shadow: { enabled: false, color: "#000000", blur: 0, offsetX: 0, offsetY: 0 },
    radius: 0,
    text: null,
    table: null,
    ...overrides,
  };
}

function toolbar(overrides = {}) {
  return buildFabricImageToolbarControls({
    selected: selectedImage(),
    cropping: false,
    cropRatio: "free",
    loading: false,
    transformInfo: null,
    filters: null,
    layers: [{ locked: false }],
    tt,
    ...overrides,
  });
}

test("primary image toolbar has no X/Y/W/H readouts", () => {
  const controls = toolbar();
  const primary = primaryImageToolbarControlIds(controls);
  for (const id of ["position-x", "position-y", "object-width", "object-height"]) {
    assert.equal(primary.includes(id), false, `${id} must leave the compact row`);
  }
  const x = controls.find((control) => control.id === "position-x");
  const y = controls.find((control) => control.id === "position-y");
  assert.equal(x?.value, 502);
  assert.equal(y?.value, 415);
  assert.equal(x?.placement, "more");
  assert.equal(y?.placement, "more");
  assert.equal(x?.slot, "inspector");
  assert.equal(y?.slot, "inspector");
  const width = controls.find((control) => control.id === "object-width");
  const height = controls.find((control) => control.id === "object-height");
  assert.equal(width?.placement, "more");
  assert.equal(height?.placement, "more");
  assert.equal(width?.slot, "inspector");
  assert.ok(primary.includes("crop-start"));
  assert.ok(primary.includes("filter-panel"));
});

test("retired image AI ids and labels are not offered in the live UI lists", () => {
  const ids = imageEditorOfferedUiAiIds();
  const labels = imageEditorOfferedUiAiLabels();
  for (const id of IMAGE_EDITOR_RETIRED_AI_IDS) {
    assert.equal(ids.includes(id), false, `${id} is still offered`);
  }
  for (const label of IMAGE_EDITOR_RETIRED_AI_LABELS) {
    assert.equal(labels.includes(label), false, `${label} is still offered`);
  }
  assert.deepEqual(
    [...IMAGE_AI_PANEL_CAPABILITIES],
    [],
    "the creation panel capability table must be empty",
  );
  assert.equal(imageRouteChrome.aiDrawer, false);
  assert.equal(imageRouteChrome.cutoutAction, false);
  assert.equal(imageRouteChrome.canvasViewSwitch, false);
});

test("ImageRoute command surface without a runner registers no retired AI commands", () => {
  const ids = imageCommandDefinitions({
    editor: {
      loading: false,
      sourceReady: true,
      cropping: false,
      editRevision: 1,
      doc: { width: 800, height: 600 },
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
    },
    deliver: async () => {},
  }).map((definition) => definition.spec.id);
  for (const id of [
    "image.ai.remove-bg",
    "image.ai.upscale",
    "image.ai.outpaint",
    "image.ai.relight",
    "image.ai.portrait-quality",
    "image.ai.panorama",
  ]) {
    assert.equal(ids.includes(id), false, `${id} must not register`);
  }
  assert.ok(ids.includes("image.crop-to-ratio"));
  assert.ok(ids.includes("image.export"));
});

test("stage overlay is the first source load, not persist or save", () => {
  assert.equal(
    imageStageShowsSourceLoadOverlay({ loading: true, sourceReady: false }),
    true,
  );
  assert.equal(
    imageStageShowsSourceLoadOverlay({ loading: true, sourceReady: true }),
    false,
    "autosave / persist must not cover the canvas",
  );
  assert.equal(
    imageStageShowsSourceLoadOverlay({ loading: false, sourceReady: true }),
    false,
  );
  assert.equal(
    imageStageShowsSourceLoadOverlay({ loading: false, sourceReady: false }),
    false,
  );
  const open = { key: "lib/photo-1", nonce: 0 };
  assert.equal(isNewImageSourceSession(null, open), true);
  assert.equal(
    isNewImageSourceSession(open, { key: "lib/photo-1", nonce: 0 }),
    false,
    "same item after persist is not a new source load",
  );
  assert.equal(
    isNewImageSourceSession(open, { key: "lib/photo-1", nonce: 1 }),
    true,
    "explicit reload is a new source load",
  );
  assert.equal(
    isNewImageSourceSession(open, { key: "lib/photo-2", nonce: 0 }),
    true,
  );
});
