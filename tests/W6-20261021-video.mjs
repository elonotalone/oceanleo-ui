/**
 * W6: person writes in video timeline / canvas increment the
 * shared user-edit generation. Load, hydrate, and recovery do not.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { createEmptyDoc } from "../src/shell/video-editor/timeline-model.ts";
import {
  resetUserEditSession,
  userEditItemKey,
  userMutationGeneration,
} from "../src/shell/user-edit-session.ts";

function lightStubs(extra = {}) {
  return {
    "../../i18n/ui/useUI": dataModule(
      "const tt = (zh) => zh; export function useUI() { return tt; }",
    ),
    "../AdvancedWorkbenchShell": dataModule(
      `export function AdvancedWorkbenchShell() { return null; }`,
    ),
    "next/dynamic": dataModule(
      `export default function dynamic() { return function DynamicStub() { return null; }; }`,
    ),
    ...extra,
  };
}

const timeline = await import(
  await compileModule("src/shell/video-editor/use-video-timeline.ts", lightStubs())
);
const canvas = await import(
  await compileModule(
    "src/shell/workflow-carrier/VideoCanvasStage.tsx",
    lightStubs(),
  )
);

function videoItem(id) {
  return { key: `artifact:${id}:r1`, id };
}

function generationOf(item) {
  return userMutationGeneration(userEditItemKey(item));
}

test("video timeline person-commit increments userMutationGeneration", () => {
  resetUserEditSession();
  const item = videoItem("video-timeline-w6");
  assert.equal(generationOf(item), 0);
  assert.equal(
    timeline.applyVideoTimelineUserEditSession(item, "person-commit"),
    1,
  );
  assert.equal(generationOf(item), 1);
  const before = createEmptyDoc();
  const after = { ...before, fps: before.fps + 1 };
  assert.equal(
    timeline.applyVideoTimelineHistoryWriteIfChanged(item, before, after),
    2,
  );
  assert.equal(generationOf(item), 2);
});

test("video timeline load, hydrate, and equal documents do not record", () => {
  resetUserEditSession();
  const item = videoItem("video-timeline-w6-load");
  const doc = createEmptyDoc();
  assert.equal(timeline.applyVideoTimelineUserEditSession(item, "load"), 0);
  assert.equal(timeline.applyVideoTimelineUserEditSession(item, "hydrate"), 0);
  assert.equal(
    timeline.applyVideoTimelineHistoryWriteIfChanged(item, doc, doc, "person-commit"),
    0,
  );
  assert.equal(
    timeline.applyVideoTimelineHistoryWriteIfChanged(item, doc, { ...doc }, "hydrate"),
    0,
  );
  assert.equal(generationOf(item), 0);
  timeline.applyVideoTimelineUserEditSession(item, "person-commit");
  assert.equal(timeline.applyVideoTimelineUserEditSession(item, "load"), 1);
  assert.equal(timeline.applyVideoTimelineUserEditSession(item, "hydrate"), 1);
});

test("video canvas person-command and add-node record; hydrate does not", () => {
  resetUserEditSession();
  const item = videoItem("video-canvas-w6");
  const empty = { nodes: [], edges: [] };
  assert.equal(canvas.applyVideoCanvasUserEditSession(item, "hydrate"), 0);
  assert.equal(canvas.applyVideoCanvasUserEditSession(item, "load"), 0);
  const applied = canvas.applyVideoCanvasPersonCommand(
    item,
    empty,
    "workflow.add-node",
    { kind: "filter", label: "新节点" },
    0,
  );
  assert.equal(applied.ok, true);
  assert.equal(applied.graph.nodes.length, 1);
  assert.equal(generationOf(item), 1);
  assert.equal(
    canvas.applyVideoCanvasUserEditSession(item, "person-command"),
    2,
  );
  assert.equal(canvas.applyVideoCanvasUserEditSession(item, "hydrate"), 2);
});
