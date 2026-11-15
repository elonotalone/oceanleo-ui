// v2 now uses the complete workflow engine. Retain the source/save invariants
// of W16; full editor behavior is covered by pw-vm-video-canvas.test.mjs.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { createVideoProjectDoc, parseVideoProjectDoc, serializeVideoProjectDoc, videoDocGraph } from "../src/shell/workflow-carrier/video-project-doc.ts";
import { createVideoProject, parseVideoProject, projectToFlow } from "../src/shell/video-canvas/engine/project-model.ts";
import { VIDEO_CANVAS_PALETTES } from "../src/shell/workflow-carrier/video-canvas-theme.ts";
import { videoKindSpec, videoKindAccent } from "../src/shell/workflow-carrier/video-canvas-kinds.ts";
import { videoProjectSaveInput } from "../src/shell/workflow-carrier/video-project-save.ts";
import { videoPreviewLayout } from "../src/shell/workflow-carrier/video-project-preview.ts";

test("source guards and serialization preserve future fields", () => {
  const doc = createVideoProjectDoc("Fixture"); doc.future = { opaque: [1, 2] };
  const parsed = parseVideoProjectDoc(JSON.parse(serializeVideoProjectDoc(doc)));
  assert.equal(parsed.ok, true); assert.deepEqual(parsed.doc, doc);
  assert.deepEqual(videoDocGraph(doc), { nodes: [], edges: [] });
  assert.deepEqual(parseVideoProject(JSON.stringify(doc)), doc);
});
test("the v2 source guard rejects dangling edges and invalid positions", () => {
  for (const graph of [
    { nodes: [], edges: [{ edgeId: "e", sourceNodeId: "missing", targetNodeId: "missing" }] },
    { nodes: [{ nodeId: "n", kind: "video", position: { x: Infinity, y: 0 } }], edges: [] },
  ]) {
    const doc = createVideoProjectDoc("Fixture"); doc.versions[doc.headVersionId].graph = graph;
    assert.equal(parseVideoProjectDoc(doc).ok, false);
  }
});
test("the former nodes-only stage and palette are deleted", () => {
  for (const file of ["VideoProjectStage.tsx", "VideoProjectCanvas.tsx", "VideoAddNodeDrawer.tsx"]) {
    assert.equal(existsSync(`src/shell/workflow-carrier/${file}`), false, file);
  }
  const route = readFileSync("src/shell/advanced-routes/VideoCanvasRoute.tsx", "utf8");
  assert.match(route, /LibraryVideoCanvas/);
  assert.match(route, /isNativeVideoProjectItem\(props.item\)/);
  const mounts = readFileSync("src/shell/w10-editor-mounts.ts", "utf8");
  assert.match(mounts, /graph: emptyVideoCanvasGraph\(\)/, "a real v1 draft creator still needs its local path");
});
test("canvas follows the site theme and preserves preview scaling", () => {
  assert.notEqual(VIDEO_CANVAS_PALETTES.light.nodeBg, VIDEO_CANVAS_PALETTES.dark.nodeBg);
  const canvas = readFileSync("src/shell/video-canvas/engine/CanvasWorkflow.tsx", "utf8");
  assert.match(canvas, /colorMode=\{pluginTheme\}/);
  assert.match(canvas, /<MiniMap/);
  const layout = videoPreviewLayout([{ x: 0, y: 0 }, { x: 2000, y: 900 }]);
  assert.ok(layout.scale > 0 && layout.scale < 1);
  assert.equal(videoKindSpec("prompt").label, "创意简报");
  assert.notEqual(videoKindAccent("video", "light"), videoKindAccent("video", "dark"));
});
test("every save targets the same typed Library root", () => {
  const doc = createVideoProject("Fixture");
  const input = videoProjectSaveInput({ base: { id: "root", artifactId: "root", revisionId: "r1", title: "Fixture" }, doc, editRevision: 4 });
  assert.equal(input.artifactRevision.artifactType, "workflow");
  assert.equal(input.sourceFormat, "oceanleo.video.project.v2");
  assert.match(input.idempotencyKey, /root:r1:4/);
  assert.equal(projectToFlow(doc, node => node).nodes.length, 0);
});
