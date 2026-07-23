import assert from "node:assert/strict";
import test from "node:test";

import * as timeline from "../src/shell/video-editor/capabilities.ts";
import * as model3d from "../src/shell/media-editors/model3d-capabilities.ts";

test("owner-controlled timeline barrel exports the composite kernel and gateway", () => {
  assert.equal(typeof timeline.createTimelineCompositeKernel, "function");
  assert.equal(typeof timeline.startTimelineSave, "function");
  assert.equal(typeof timeline.startTimelineRender, "function");
  assert.equal(typeof timeline.createGatewayTimelineRenderAdapter, "function");
  assert.ok(Array.isArray(timeline.TIMELINE_COMMAND_REGISTRY));
});

test("owner-controlled model3d barrel exports director, DOF and playblast engines", () => {
  assert.equal(typeof model3d.createModel3DDirectorDocument, "function");
  assert.equal(typeof model3d.startModel3DPrevis, "function");
  assert.equal(typeof model3d.createModel3DPlayblastAdapter, "function");
  assert.equal(typeof model3d.model3DBokehSettings, "function");
  assert.equal(typeof model3d.model3DPlayblastTimeline, "function");
});
