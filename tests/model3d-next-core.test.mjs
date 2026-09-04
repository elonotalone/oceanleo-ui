/**
 * W11 判据 1/3 的内容闸：L1 控件、L2 出图、存量只读转换、L4 chips、审阅提案。
 * 接线（flag / dynamic / iframe）在 model3d-next-wiring.test.mjs。
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_EDITOR_MODE,
  validAgentChips,
  validReviewProposal,
} from "../src/shell/hosted-editor/index.ts";
import { chipsForEditor } from "../src/shell/quick-actions/catalog.ts";
import {
  rememberEditorChips,
  resetAgentReviewInbox,
} from "../src/shell/agent-review/inbox.ts";
import {
  MODEL3D_AGENT_CHIPS,
  buildModel3DReviewProposal,
  model3dAgentChipsAreValid,
  model3dToolsManifestChips,
} from "../src/shell/media-editors/model3d-next-l4-chips.ts";
import {
  MODEL3D_LEGACY_READONLY_NOTICE,
  MODEL3D_NEXT_PROJECT_SCHEMA,
  inspectModel3DProject,
  nextModel3DConversionState,
  planModel3DLegacyConversion,
} from "../src/shell/media-editors/model3d-next-conversion.ts";
import {
  MODEL3D_FOUR_VIEW_ORBITS,
  MODEL3D_NEXT_L1_CONTROL_IDS,
  applyModel3DNextControl,
  captureModelViewerFourViews,
  captureModelViewerPng,
  defaultModel3DNextView,
  model3dNextSelectionContext,
} from "../src/shell/media-editors/model3d-next-plan.ts";
import {
  MODEL3D_NEXT_DEFAULT_MODE,
  applyModel3DNextMode,
} from "../src/shell/media-editors/model3d-next-mode.ts";

const LEGACY_PROJECT = {
  schema: "oceanleo.three-editor@2",
  data: {
    provenance: { sourceUrl: "https://asset.oceanleo.com/user/model.glb" },
    operations: [{ id: "op-1" }, { id: "op-2" }],
    view: { azimuth: 12, elevation: 40, zoom: 120, autoRotate: true },
  },
};

test("ordinary mode default and L1 controls cover camera, exposure, look", () => {
  assert.equal(MODEL3D_NEXT_DEFAULT_MODE, DEFAULT_EDITOR_MODE);
  assert.equal(applyModel3DNextMode("x", "normal").mode, "normal");
  const ids = model3dNextSelectionContext(defaultModel3DNextView()).controls.map(
    (control) => control.id,
  );
  for (const id of MODEL3D_NEXT_L1_CONTROL_IDS) {
    assert.equal(ids.includes(id), true, `missing L1 control ${id}`);
  }
  const next = applyModel3DNextControl(defaultModel3DNextView(), {
    requestId: "t",
    selectionId: "active-model",
    controlId: "material-color",
    value: "#ff0000",
  });
  assert.equal(next.materialColor, "#ff0000");
  assert.equal(next.revision, 1);
});

test("four-view capture uses model-viewer toBlob, not a homegrown renderer", () => {
  assert.equal(MODEL3D_FOUR_VIEW_ORBITS.length, 4);
  const orbits = [];
  const viewer = {
    getAttribute: (name) => (name === "camera-orbit" ? "kept" : null),
    setAttribute: (name, value) => {
      if (name === "camera-orbit") orbits.push(value);
    },
    updateComplete: Promise.resolve(),
    toBlob: async () => new Blob(["png-bytes"], { type: "image/png" }),
  };
  return captureModelViewerFourViews(viewer).then(async (blobs) => {
    assert.equal(blobs.length, 4);
    assert.deepEqual([...orbits.slice(0, 4)], [...MODEL3D_FOUR_VIEW_ORBITS]);
    assert.equal(orbits.at(-1), "kept");
    const one = await captureModelViewerPng(viewer);
    assert.equal(one.size > 0, true);
  });
});

test("four-view capture refuses an empty blob instead of faking pixels", async () => {
  const viewer = {
    toBlob: async () => new Blob([], { type: "image/png" }),
  };
  await assert.rejects(() => captureModelViewerPng(viewer), /没有像素/);
});

test("legacy projects stay readonly until the convert button runs", () => {
  const looked = inspectModel3DProject(LEGACY_PROJECT);
  assert.equal(looked.kind, "legacy");
  assert.equal(nextModel3DConversionState("readonly", { type: "resolve" }), "readonly");
  assert.equal(nextModel3DConversionState("readonly", { type: "request" }), "converting");
  assert.equal(
    nextModel3DConversionState("converting", { type: "resolve" }),
    "converted",
  );
  const planned = planModel3DLegacyConversion(LEGACY_PROJECT);
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  assert.equal(planned.schema, MODEL3D_NEXT_PROJECT_SCHEMA);
  assert.equal(
    planned.dropped.some((entry) => entry.feature === "operation journal"),
    true,
  );
  assert.match(MODEL3D_LEGACY_READONLY_NOTICE, /只读/);
});

test("conversion without a source URL is refused with a human reason", () => {
  const planned = planModel3DLegacyConversion({
    schema: "oceanleo.three-editor@2",
    data: { operations: [] },
  });
  assert.equal(planned.ok, false);
  if (planned.ok) return;
  assert.match(planned.reason, /源地址/);
});

test("eight tools-manifest v2 chips pass the host validator; a ninth does not", () => {
  assert.equal(model3dAgentChipsAreValid(), true);
  const manifest = model3dToolsManifestChips();
  assert.equal(manifest.manifestVersion, 2);
  assert.equal(manifest.chips.length, 8);
  assert.equal(validAgentChips(manifest.chips), true);
  const ninth = {
    ...manifest.chips[0],
    id: "threed.chip.ninth",
    label: "第九条",
  };
  assert.equal(validAgentChips([...manifest.chips, ninth]), false);
});

test("review proposal is a message only: the view is not written", () => {
  const view = defaultModel3DNextView();
  const proposal = buildModel3DReviewProposal({
    proposalId: "p-1",
    commandId: "threed.chip.generate-material",
    revision: view.revision,
    changes: [
      { id: "material-0", label: "基础色", before: view.materialColor, after: "#ff0000" },
    ],
  });
  assert.ok(proposal);
  assert.equal(validReviewProposal(proposal), true);
  assert.equal(view.materialColor, "#ffffff");
  assert.equal(view.revision, 0);
});

test("remembered threed chips surface eight entries for the host catalog", () => {
  resetAgentReviewInbox();
  assert.equal(chipsForEditor("threed", null).length, 0);
  const remembered = rememberEditorChips(
    "threed",
    model3dToolsManifestChips().chips,
  );
  assert.equal(remembered, true);
  assert.equal(chipsForEditor("threed", null).length, 8);
  assert.equal(
    chipsForEditor("threed", null).map((chip) => chip.id).join(","),
    MODEL3D_AGENT_CHIPS.map((chip) => chip.id).join(","),
  );
  resetAgentReviewInbox();
});
