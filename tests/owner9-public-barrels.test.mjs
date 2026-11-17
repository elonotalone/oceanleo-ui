import assert from "node:assert/strict";
import test from "node:test";

import * as timeline from "../src/shell/video-editor/capabilities.ts";

test("owner-controlled timeline barrel exports the composite kernel and gateway", () => {
  assert.equal(typeof timeline.createTimelineCompositeKernel, "function");
  assert.equal(typeof timeline.startTimelineSave, "function");
  assert.equal(typeof timeline.startTimelineRender, "function");
  assert.equal(typeof timeline.createGatewayTimelineRenderAdapter, "function");
  assert.ok(Array.isArray(timeline.TIMELINE_COMMAND_REGISTRY));
});
