import { answerCollabCapture, answerCollabRestore, type CanvasCollabPort } from "./engine/canvas-collab";
import { stableId } from "./engine/project-model";
import { prepareWorkflowNativeAddNode, matchWorkflowNativeWriteAck, verifyWorkflowNativeWriteCapture } from "../workflow-carrier/agent-write-bridge";
import type { CanvasCollabGraph } from "../collab/adapters/workflow";

/** Native CAS path, shared with the old guarded workflow writer; no frame transport. */
export function addAgentVideoNode(port: CanvasCollabPort, kind: string, label: string, targetKey: string) {
  const capture = answerCollabCapture("capture", port);
  const payload = capture.snapshot?.payload as CanvasCollabGraph | undefined;
  if (!capture.snapshot || !payload) return { ok: false, message: "视频画布还没载入。" };
  const revision = Number(capture.snapshot.revision);
  const prepared = prepareWorkflowNativeAddNode({ graph: { nodes: payload.nodes, edges: payload.edges },
    params: { kind, label }, nodeId: stableId("node"), recoveryId: stableId("write"), transportRevision: revision,
    expectedNativeRevision: revision, targetKey, bridgeEpoch: 0 });
  if (!prepared.ok) return { ok: false, message: prepared.error };
  const reply = answerCollabRestore(prepared.request.recoveryId, prepared.request.snapshot, port);
  const ack = matchWorkflowNativeWriteAck(prepared.request, reply, targetKey, 0);
  if (!ack.ok) return ack;
  const after = answerCollabCapture("verify", port);
  const afterGraph = after.snapshot?.payload as CanvasCollabGraph;
  if (!verifyWorkflowNativeWriteCapture({ request: prepared.request, snapshot: after.snapshot,
    graph: { nodes: afterGraph.nodes, edges: afterGraph.edges }, acknowledgedRevision: ack.revision,
    activeTargetKey: targetKey, activeBridgeEpoch: 0 })) return { ok: false, message: "画布没有确认这次修改，请重试。" };
  return { ok: true, message: prepared.message, revision: ack.revision };
}
