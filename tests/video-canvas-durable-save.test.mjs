import test from "node:test";
import assert from "node:assert/strict";
import { flushVideoCanvasGraph } from "../src/shell/workflow-carrier/video-canvas-leave.ts";

test("durable Library video edits cannot pass as a meta.graph save receipt", () => {
  const item = {
    key: "artifact:11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222",
    source: "artifact",
    id: "11111111-1111-4111-8111-111111111111",
    artifactId: "11111111-1111-4111-8111-111111111111",
    revisionId: "22222222-2222-4222-8222-222222222222",
    artifactType: "workflow",
    title: "Video workflow",
    kind: "video_canvas",
    meta: { graph: { nodes: [], edges: [] } },
    artifact: {
      artifactId: "11111111-1111-4111-8111-111111111111",
      revisionId: "22222222-2222-4222-8222-222222222222",
      artifactType: "workflow",
      renditions: {},
    },
  };
  const graph = { nodes: [{ id: "n1", kind: "source" }], edges: [] };
  const result = flushVideoCanvasGraph(item, graph, { sourceReady: true });

  assert.equal(result.ok, false);
  assert.match(result.error, /typed revision/);
  assert.equal(item.meta.graph.nodes.length, 0);
});
