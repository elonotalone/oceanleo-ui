/** Cross-repo native wire contract: no mocked project model, patch receiver or capture. */
import assert from "node:assert/strict";
import test from "node:test";
import { createVideoProject } from "../../video/packages/gallery-editor/src/project-model.ts";
import { answerCollabCapture, answerCollabRestore } from "../../video/packages/gallery-editor/src/canvas-collab.ts";
import { parseCanvasCapture } from "../src/shell/collab/adapters/workflow.ts";
import { prepareWorkflowNativeAddNode, matchWorkflowNativeWriteAck, verifyWorkflowNativeWriteCapture } from "../src/shell/workflow-carrier/agent-write-bridge.ts";

function nativePort() {
  let project = createVideoProject("Native wire acceptance", true);
  return {
    getProject: () => project,
    isLoaded: () => true,
    setPolicy() {},
    markDirty() {},
    applyRemote(change) { const next = change(project); if (next) project = next; },
  };
}

test("shared host command survives real native receiver normalization and re-capture", () => {
  const port = nativePort();
  const capture = answerCollabCapture("initial", port);
  const parsed = parseCanvasCapture(capture.snapshot);
  assert.equal(parsed?.loaded, true);
  const prepared = prepareWorkflowNativeAddNode({
    graph: parsed.graph, params: { kind: "text", label: "Native accepted marker" },
    nodeId: "agent-cross-repo-1", recoveryId: "agent-cross-repo-write-1",
    transportRevision: 11, expectedNativeRevision: capture.snapshot.revision,
    targetKey: "artifact:root:r1", bridgeEpoch: 1,
  });
  assert.equal(prepared.ok, true);
  const request = prepared.request;
  const ack = answerCollabRestore(request.recoveryId, request.snapshot, port);
  const matched = matchWorkflowNativeWriteAck(request, ack, request.targetKey, request.bridgeEpoch);
  assert.equal(matched.ok, true, JSON.stringify(ack));
  const after = answerCollabCapture("verify", port);
  const afterParsed = parseCanvasCapture(after.snapshot);
  assert.equal(afterParsed?.loaded, true);
  assert.equal(afterParsed.graph.nodes.some(node => node.nodeId === request.nodeId && node.title === "Native accepted marker"), true);
  assert.equal(verifyWorkflowNativeWriteCapture({
    request, snapshot: after.snapshot, graph: afterParsed.graph,
    acknowledgedRevision: matched.revision, activeTargetKey: request.targetKey,
    activeBridgeEpoch: request.bridgeEpoch,
  }), true, `native graph must exactly match the host proposal; actual=${JSON.stringify(afterParsed.graph)} expected=${JSON.stringify(request.expectedGraph)}`);
});

test("replaying a guarded write cannot mutate a newer native project", () => {
  const port = nativePort();
  const capture = answerCollabCapture("initial", port);
  const parsed = parseCanvasCapture(capture.snapshot);
  const prepared = prepareWorkflowNativeAddNode({
    graph: parsed.graph, params: { kind: "text", label: "Once only" },
    nodeId: "agent-cross-repo-2", recoveryId: "agent-cross-repo-write-2",
    transportRevision: 12, expectedNativeRevision: capture.snapshot.revision,
    targetKey: "artifact:root:r1", bridgeEpoch: 1,
  });
  assert.equal(prepared.ok, true);
  assert.equal(answerCollabRestore(prepared.request.recoveryId, prepared.request.snapshot, port).ok, true);
  const first = JSON.stringify(port.getProject());
  const rejected = answerCollabRestore(prepared.request.recoveryId, prepared.request.snapshot, port);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "collab-native-revision-conflict");
  assert.equal(JSON.stringify(port.getProject()), first);
});
