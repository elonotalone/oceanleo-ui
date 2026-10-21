import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  matchWorkflowNativeWriteAck,
  prepareWorkflowNativeAddNode,
  verifyWorkflowNativeWriteCapture,
  workflowNativeWriteCapability,
} from "../src/shell/workflow-carrier/agent-write-bridge.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const graph = {
  nodes: [
    {
      nodeId: "node-source",
      kind: "video",
      title: "源视频",
      position: { x: 100, y: 100 },
      localEditRecipe: [],
    },
  ],
  edges: [],
};
const snapshot = (revision, state = graph) => ({
  revision,
  payload: {
    schema: "oceanleo.canvas.collab.v1",
    op: "state",
    loaded: true,
    agentWriteProtocol: 1,
    versionId: `version-${revision}`,
    nodes: state.nodes,
    edges: state.edges,
  },
});

test("native workflow add produces a bounded, explicit patch pinned to capture revision", () => {
  const prepared = prepareWorkflowNativeAddNode({
    graph,
    params: { kind: "text", label: "  片头字幕  " },
    nodeId: "agent-node-1",
    recoveryId: "workflow-agent-write-1",
    transportRevision: 7,
    expectedNativeRevision: 41,
    targetKey: "artifact-1|revision-2|surface-1",
    bridgeEpoch: 3,
  });
  assert.equal(prepared.ok, true);
  assert.equal(prepared.request.snapshot.revision, 7, "legacy sequence is not the native CAS value");
  assert.equal(prepared.request.snapshot.expectedNativeRevision, 41);
  assert.deepEqual(prepared.request.snapshot.payload.nodes.upsert[0], {
    id: "agent-node-1",
    set: {
      kind: "text",
      title: "片头字幕",
      position: { x: 380, y: 120 },
      localEditRecipe: [],
    },
    unset: [],
  });
  assert.equal(prepared.request.expectedGraph.nodes.length, 2);
});

test("native command refuses missing, unsupported, oversized, duplicate, and unknown parameters", () => {
  for (const params of [
    { label: "没有类型" },
    { kind: "not-native", label: "不支持" },
    { kind: "text", label: "   " },
    { kind: "text", label: "x".repeat(81) },
    { kind: "text", label: "字幕", injected: true },
  ]) {
    const result = prepareWorkflowNativeAddNode({
      graph,
      params,
      nodeId: "agent-node-1",
      recoveryId: "workflow-agent-write-1",
      transportRevision: 7,
      expectedNativeRevision: 41,
      targetKey: "artifact-1|revision-2|surface-1",
      bridgeEpoch: 3,
    });
    assert.equal(result.ok, false, JSON.stringify(params));
  }
  const duplicate = prepareWorkflowNativeAddNode({
    graph,
    params: { kind: "text", label: "重复 id" },
    nodeId: "node-source",
    recoveryId: "workflow-agent-write-2",
    transportRevision: 8,
    expectedNativeRevision: 41,
    targetKey: "artifact-1|revision-2|surface-1",
    bridgeEpoch: 3,
  });
  assert.equal(duplicate.ok, false);
});

test("unsupported/invalid capture cannot authorize native Agent writes", () => {
  assert.deepEqual(workflowNativeWriteCapability(snapshot(41)), {
    supported: true,
    revision: 41,
  });
  assert.deepEqual(workflowNativeWriteCapability({ ...snapshot(41), payload: { ...snapshot(41).payload, agentWriteProtocol: 2 } }), { supported: false });
  assert.deepEqual(workflowNativeWriteCapability({ ...snapshot(41), payload: { ...snapshot(41).payload, loaded: false } }), { supported: false });
  assert.deepEqual(workflowNativeWriteCapability(snapshot(-1)), { supported: false });
  assert.deepEqual(workflowNativeWriteCapability(snapshot(1.5)), { supported: false });
});

test("old echoed host revision is not CAS proof; exact ack must stay on same file and instance", () => {
  const prepared = prepareWorkflowNativeAddNode({
    graph,
    params: { kind: "text", label: "字幕" },
    nodeId: "agent-node-1",
    recoveryId: "workflow-agent-write-1",
    transportRevision: 7,
    expectedNativeRevision: 41,
    targetKey: "artifact-1|revision-2|surface-1",
    bridgeEpoch: 3,
  });
  assert.equal(prepared.ok, true);
  const request = prepared.request;
  assert.equal(
    matchWorkflowNativeWriteAck(
      request,
      { recoveryId: request.recoveryId, ok: true, revision: 8 },
      request.targetKey,
      request.bridgeEpoch,
    ).ok,
    false,
    "legacy receiver echoing transport revision cannot pass",
  );
  assert.equal(
    matchWorkflowNativeWriteAck(
      request,
      { recoveryId: request.recoveryId, ok: true, revision: 42, expectedNativeRevision: 41 },
      "other-file",
      request.bridgeEpoch,
    ).ok,
    false,
  );
  assert.deepEqual(
    matchWorkflowNativeWriteAck(
      request,
      { recoveryId: request.recoveryId, ok: true, revision: 42, expectedNativeRevision: 41 },
      request.targetKey,
      request.bridgeEpoch,
    ),
    { ok: true, revision: 42 },
  );
});

test("success requires re-capture to match exact written graph, native revision, file and iframe epoch", () => {
  const prepared = prepareWorkflowNativeAddNode({
    graph,
    params: { kind: "text", label: "字幕" },
    nodeId: "agent-node-1",
    recoveryId: "workflow-agent-write-1",
    transportRevision: 7,
    expectedNativeRevision: 41,
    targetKey: "artifact-1|revision-2|surface-1",
    bridgeEpoch: 3,
  });
  assert.equal(prepared.ok, true);
  const request = prepared.request;
  const exact = snapshot(42, request.expectedGraph);
  assert.equal(
    verifyWorkflowNativeWriteCapture({
      request,
      snapshot: exact,
      graph: request.expectedGraph,
      acknowledgedRevision: 42,
      activeTargetKey: request.targetKey,
      activeBridgeEpoch: request.bridgeEpoch,
    }),
    true,
  );
  assert.equal(
    verifyWorkflowNativeWriteCapture({
      request,
      snapshot: snapshot(43, request.expectedGraph),
      graph: request.expectedGraph,
      acknowledgedRevision: 42,
      activeTargetKey: request.targetKey,
      activeBridgeEpoch: request.bridgeEpoch,
    }),
    false,
    "changed native revision fails closed",
  );
  assert.equal(
    verifyWorkflowNativeWriteCapture({
      request,
      snapshot: exact,
      graph,
      acknowledgedRevision: 42,
      activeTargetKey: request.targetKey,
      activeBridgeEpoch: request.bridgeEpoch + 1,
    }),
    false,
    "a reloaded iframe instance fails closed",
  );
});

test("workflow Stage source contains restore delivery, native ack and recapture guards", () => {
  const stage = read("src/shell/workflow-carrier/VideoCanvasStage.tsx");
  const bridge = read("src/shell/workbench-embed.tsx");
  assert.match(stage, /setHead\(prepared\.request as WorkflowRestoreItem\)/);
  assert.match(stage, /recoveryRestore=\{mode === "lock" \? null : \(head as unknown as EmbedRecoveryRestore\)\}/);
  assert.match(stage, /matchWorkflowNativeWriteAck\(/);
  assert.match(stage, /verifyWorkflowNativeWriteCapture\(/);
  assert.match(stage, /expectedNativeRevision,/);
  assert.match(bridge, /type: "recovery-restore"[\s\S]*?snapshot: recoveryRestore\.snapshot/);
  assert.match(stage, /if \(liveCanvasBase\) \{\s*return executeNativeWorkflowAddNode\(params \|\| \{\}\);/);
});
