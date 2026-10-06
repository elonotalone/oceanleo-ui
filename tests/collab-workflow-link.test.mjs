import assert from "node:assert/strict";
import test from "node:test";
import { CANVAS_COLLAB_SCHEMA, CanvasCollabLink } from "../src/shell/collab/adapters/workflow.ts";

const node = (nodeId, title) => ({ nodeId, kind: "text", title, position: { x: 0, y: 0 } });
const edge = (edgeId, a, b) => ({ edgeId, sourceNodeId: a, targetNodeId: b });
const snap = (graph, loaded = true) => ({
  revision: 1,
  payload: { schema: CANVAS_COLLAB_SCHEMA, op: "state", loaded, nodes: graph.nodes, edges: graph.edges },
});
const g1 = { nodes: [node("a", "甲"), node("b", "乙")], edges: [edge("e", "a", "b")] };

test("抓取：一次一个在途；格式不对=旧画布；失败不当作旧画布", () => {
  const link = new CanvasCollabLink();
  const id = link.beginCapture();
  assert.ok(id);
  assert.equal(link.beginCapture(), null, "已有在途");
  assert.deepEqual(link.receiveCapture({ recoveryId: "other", ok: true, snapshot: snap(g1) }), { kind: "ignored" });
  assert.equal(link.receiveCapture({ recoveryId: id, ok: true, snapshot: { revision: 1, payload: { foo: 1 } } }).kind, "legacy");
  const id2 = link.beginCapture();
  assert.equal(link.receiveCapture({ recoveryId: id2, ok: false }).kind, "failed");
  const id3 = link.beginCapture();
  assert.equal(link.receiveCapture({ recoveryId: id3, ok: true, snapshot: snap(g1, false) }).kind, "notLoaded");
  const id4 = link.beginCapture();
  const out = link.receiveCapture({ recoveryId: id4, ok: true, snapshot: snap(g1) });
  assert.equal(out.kind, "state");
  assert.equal(out.graph.nodes.length, 2);
  assert.equal(link.baseline.nodes.length, 2);
});

test("补丁入队后，在它之前发出的抓取结果作废（不把旧状态当本端状态）", () => {
  const link = new CanvasCollabLink();
  const first = link.beginCapture();
  link.receiveCapture({ recoveryId: first, ok: true, snapshot: snap(g1) });
  const inflight = link.beginCapture();
  const queued = link.applyRemote({ nodes: [...g1.nodes, node("c", "丙")], edges: g1.edges });
  assert.equal(queued, 1);
  assert.equal(link.receiveCapture({ recoveryId: inflight, ok: true, snapshot: snap(g1) }).kind, "stale");
  // 队列没发完时新发的抓取，回来也是旧的
  const during = link.beginCapture();
  assert.equal(link.receiveCapture({ recoveryId: during, ok: true, snapshot: snap(g1) }).kind, "stale");
  // 队列发完后再抓才算数
  const head = link.head();
  assert.deepEqual(link.receiveRestoreResult({ recoveryId: head.recoveryId, ok: true }), { matched: true, ok: true, drained: true });
  const after = link.beginCapture();
  const merged = { nodes: [...g1.nodes, node("c", "丙")], edges: g1.edges };
  assert.equal(link.receiveCapture({ recoveryId: after, ok: true, snapshot: snap(merged) }).kind, "state");
});

test("队列一次只交出队首，按顺序，结果号对不上的忽略", () => {
  const link = new CanvasCollabLink();
  link.receiveCapture({ recoveryId: link.beginCapture(), ok: true, snapshot: snap(g1) });
  const big = { nodes: [], edges: [] };
  for (let i = 0; i < 200; i += 1) big.nodes.push({ ...node(`n${i}`, "标".repeat(400)) });
  const count = link.applyRemote(big);
  assert.ok(count > 1, `应分成多块，实际 ${count}`);
  assert.equal(link.pending, count);
  link.sendControl({ readOnly: true, canSave: false });
  assert.equal(link.pending, count + 1);
  const seen = [];
  for (let i = 0; i < count + 1; i += 1) {
    const head = link.head();
    seen.push(head.snapshot.payload.op);
    assert.equal(link.head().recoveryId, head.recoveryId, "没收到结果前队首不变");
    assert.equal(link.receiveRestoreResult({ recoveryId: "nope", ok: true }).matched, false);
    const r = link.receiveRestoreResult({ recoveryId: head.recoveryId, ok: i !== 1 });
    assert.equal(r.drained, i === count);
  }
  assert.equal(seen.at(-1), "control");
  assert.equal(seen.filter((op) => op === "patch").length, count);
  assert.equal(link.failures, 1);
  assert.equal(link.head(), null);
});

test("相同状态不入队；删除远端节点同时带走连线；基线随之更新", () => {
  const link = new CanvasCollabLink();
  link.receiveCapture({ recoveryId: link.beginCapture(), ok: true, snapshot: snap(g1) });
  assert.equal(link.applyRemote(g1), 0);
  assert.equal(link.pending, 0);
  assert.equal(link.applyRemote({ nodes: [node("a", "甲")], edges: [] }), 1);
  const p = link.head().snapshot.payload;
  assert.deepEqual(p.nodes.remove, ["b"]);
  assert.deepEqual(p.edges.remove, ["e"]);
  assert.equal(link.baseline.nodes.length, 1);
});

test("画布重载后 reset：基线、队列、在途抓取全部作废", () => {
  const link = new CanvasCollabLink();
  const id = link.beginCapture();
  link.applyRemote({ nodes: [node("z", "z")], edges: [] });
  link.reset();
  assert.equal(link.baseline, null);
  assert.equal(link.pending, 0);
  assert.equal(link.receiveCapture({ recoveryId: id, ok: true, snapshot: snap(g1) }).kind, "ignored");
});

test("太大的单个实体计入 skipped，不进队列", () => {
  const link = new CanvasCollabLink();
  link.receiveCapture({ recoveryId: link.beginCapture(), ok: true, snapshot: snap({ nodes: [], edges: [] }) });
  link.applyRemote({ nodes: [{ ...node("huge", "x"), note: "y".repeat(120_000) }], edges: [] });
  assert.equal(link.skipped, 1);
  assert.equal(link.pending, 0);
});
