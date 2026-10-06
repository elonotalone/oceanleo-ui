import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";
import { writeJsonStateRoot, readJsonStateRoot } from "../src/shell/collab/bind-json-state.ts";
import {
  WORKFLOW_ROOT,
  CANVAS_COLLAB_SCHEMA,
  CANVAS_COLLAB_CHUNK_BYTES,
  canvasGraphToEntities,
  canvasGraphFromEntities,
  canvasGraphDiff,
  canvasPatchIsEmpty,
  canvasPatchToPayloads,
  canvasControlPayload,
  canvasControlState,
  canvasGraphEquals,
  canvasGraphFromProjectJson,
  parseCanvasCapture,
  workflowFromEntities,
  workflowFromRevisionJson,
  workflowFromYDoc,
} from "../src/shell/collab/adapters/workflow.ts";

// ---- 真实画布工程的形状（video 站 `oceanleo.video.project.v2`）：nodeId/title/position，edgeId/sourceNodeId/targetNodeId。
const node = (nodeId, title, x, y, extra = {}) => ({ nodeId, kind: "text", title, position: { x, y }, localEditRecipe: [], ...extra });
const edge = (edgeId, a, b) => ({ edgeId, sourceNodeId: a, targetNodeId: b, sourceHandle: null, targetHandle: null });
const base = () => ({
  nodes: [node("n1", "脚本", 0, 0), node("n2", "配图", 300, 0), node("n3", "成片", 600, 0)],
  edges: [edge("e1", "n1", "n2"), edge("e2", "n2", "n3")],
});
const clone = (v) => JSON.parse(JSON.stringify(v));

// ---- 参照实现：画布那一侧怎样落地补丁（video 站 `canvas-collab.ts` 同一语义；那边有自己的测试）。
function applyPayloads(graph, payloads) {
  const g = clone(graph);
  for (const p of payloads) {
    assert.equal(p.schema, CANVAS_COLLAB_SCHEMA);
    if (p.op !== "patch") continue;
    for (const [key, idField] of [["nodes", "nodeId"], ["edges", "edgeId"]]) {
      for (const u of p[key].upsert) {
        const idx = g[key].findIndex((x) => x[idField] === u.id);
        const target = idx >= 0 ? g[key][idx] : { [idField]: u.id };
        Object.assign(target, clone(u.set));
        for (const f of u.unset) delete target[f];
        if (idx < 0) g[key].push(target);
      }
      g[key] = g[key].filter((x) => !p[key].remove.includes(x[idField]));
    }
    const ids = new Set(g.nodes.map((n) => n.nodeId));
    g.edges = g.edges.filter((e) => ids.has(e.sourceNodeId) && ids.has(e.targetNodeId));
  }
  return g;
}

/** 一个客户端：自己的画布图 + 自己的协同文档 + 上一次知道的画布内容（补丁基线）。 */
class Client {
  constructor(graph) {
    this.doc = new Y.Doc();
    this.graph = clone(graph);
    this.baseline = clone(graph);
  }
  /** 画布被改了 → 外壳抓到图 → 推进文档。 */
  edit(fn) {
    fn(this.graph);
    this.baseline = clone(this.graph);
    writeJsonStateRoot(this.doc, WORKFLOW_ROOT, canvasGraphToEntities(this.graph));
  }
  /** 文档里来了远端改动 → 算补丁 → 分块 → 画布落地。 */
  receive() {
    const merged = canvasGraphFromEntities(readJsonStateRoot(this.doc, WORKFLOW_ROOT), null);
    const patch = canvasGraphDiff(this.baseline, merged);
    const { payloads } = canvasPatchToPayloads(patch);
    this.graph = applyPayloads(this.graph, payloads);
    this.baseline = clone(merged);
    return payloads;
  }
}

function sync(a, b) {
  const ua = Y.encodeStateAsUpdate(a.doc, Y.encodeStateVector(b.doc));
  const ub = Y.encodeStateAsUpdate(b.doc, Y.encodeStateVector(a.doc));
  Y.applyUpdate(b.doc, ua);
  Y.applyUpdate(a.doc, ub);
  a.receive();
  b.receive();
}

function pair() {
  const a = new Client(base());
  writeJsonStateRoot(a.doc, WORKFLOW_ROOT, canvasGraphToEntities(a.graph));
  const b = new Client(base());
  sync(a, b);
  return [a, b];
}

const sortedIds = (g) => ({ nodes: g.nodes.map((n) => n.nodeId).sort(), edges: g.edges.map((e) => e.edgeId).sort() });
const find = (g, id) => g.nodes.find((n) => n.nodeId === id);

test("往返：图 → 实体 → 图 内容不变，且顺序无关（两个客户端数组顺序不同也得到同一份实体）", () => {
  const g = base();
  const back = canvasGraphFromEntities(canvasGraphToEntities(g), null);
  assert.ok(canvasGraphEquals(g, back));
  const shuffled = { nodes: [...g.nodes].reverse(), edges: [...g.edges].reverse() };
  assert.equal(JSON.stringify(canvasGraphToEntities(shuffled)), JSON.stringify(canvasGraphToEntities(g)));
  assert.ok(canvasGraphEquals(shuffled, g));
});

test("两人同时各加节点、各连线：收敛到同一张图，两边的新东西都在", () => {
  const [a, b] = pair();
  a.edit((g) => {
    g.nodes.push(node("a-voice", "生成配音", 300, 200));
    g.edges.push(edge("a-e1", "n1", "a-voice"));
  });
  b.edit((g) => {
    g.edges.push(edge("b-e1", "n1", "n3"));
    g.edges.push(edge("b-e2", "n2", "n1"));
  });
  sync(a, b);
  assert.deepEqual(sortedIds(a.graph), sortedIds(b.graph));
  assert.deepEqual(sortedIds(a.graph).nodes, ["a-voice", "n1", "n2", "n3"]);
  assert.deepEqual(sortedIds(a.graph).edges, ["a-e1", "b-e1", "b-e2", "e1", "e2"]);
  assert.ok(canvasGraphEquals(a.graph, b.graph));
  // 落地之后再抓一次不会再产生任何差异（不会互相反复推送）
  assert.ok(canvasPatchIsEmpty(canvasGraphDiff(a.baseline, canvasGraphFromEntities(readJsonStateRoot(a.doc, WORKFLOW_ROOT), null))));
});

test("甲删节点、乙同时连到该节点：乙的线跟着消失，没有断线", () => {
  const [a, b] = pair();
  a.edit((g) => {
    g.nodes = g.nodes.filter((n) => n.nodeId !== "n2");
    g.edges = g.edges.filter((e) => e.sourceNodeId !== "n2" && e.targetNodeId !== "n2");
  });
  b.edit((g) => g.edges.push(edge("b-to-n2", "n3", "n2")));
  sync(a, b);
  for (const c of [a, b]) {
    const ids = new Set(c.graph.nodes.map((n) => n.nodeId));
    assert.equal(ids.has("n2"), false);
    for (const e of c.graph.edges) assert.ok(ids.has(e.sourceNodeId) && ids.has(e.targetNodeId), `断线：${e.edgeId}`);
    assert.equal(c.graph.edges.some((e) => e.edgeId === "b-to-n2"), false);
  }
  assert.ok(canvasGraphEquals(a.graph, b.graph));
});

test("同一节点：一人改标题、一人拖位置都保留；同一字段后写者胜，两边一致", () => {
  const [a, b] = pair();
  a.edit((g) => { find(g, "n2").title = "配图（竖版）"; });
  b.edit((g) => { find(g, "n2").position = { x: 340, y: 40 }; });
  sync(a, b);
  assert.equal(find(a.graph, "n2").title, "配图（竖版）");
  assert.deepEqual(find(a.graph, "n2").position, { x: 340, y: 40 });
  assert.ok(canvasGraphEquals(a.graph, b.graph));

  a.edit((g) => { find(g, "n3").prompt = "甲的提示词"; });
  b.edit((g) => { find(g, "n3").prompt = "乙的提示词"; });
  sync(a, b);
  assert.equal(find(a.graph, "n3").prompt, find(b.graph, "n3").prompt);
  assert.ok(["甲的提示词", "乙的提示词"].includes(find(a.graph, "n3").prompt));
  assert.ok(canvasGraphEquals(a.graph, b.graph));
});

test("补丁按字段：对方改了别的字段，不会把你还没推送的字段冲掉", () => {
  const baseline = base();
  const merged = clone(baseline);
  find(merged, "n1").title = "对方改的标题";
  const patch = canvasGraphDiff(baseline, merged);
  assert.deepEqual(patch.nodes.upsert, [{ id: "n1", set: { title: "对方改的标题" }, unset: [] }]);
  const local = clone(baseline);
  find(local, "n1").position = { x: 77, y: 88 }; // 画布上本地刚拖的、还没被抓到
  const applied = applyPayloads(local, canvasPatchToPayloads(patch).payloads);
  assert.equal(find(applied, "n1").title, "对方改的标题");
  assert.deepEqual(find(applied, "n1").position, { x: 77, y: 88 });
});

test("字段被删：补丁带 unset", () => {
  const before = base();
  find(before, "n1").prompt = "x";
  const after = clone(before);
  delete find(after, "n1").prompt;
  const patch = canvasGraphDiff(before, after);
  assert.deepEqual(patch.nodes.upsert, [{ id: "n1", set: {}, unset: ["prompt"] }]);
});

test("大图分块：每块 ≤ 40KB，先节点后连线、先删连线后删节点；合起来与整体应用一致", () => {
  const big = { nodes: [], edges: [] };
  for (let i = 0; i < 300; i += 1) {
    big.nodes.push(node(`node-${i}`, `节点 ${i} ${"字".repeat(60)}`, i * 10, i, { prompt: "p".repeat(200) }));
    if (i > 0) big.edges.push(edge(`edge-${i}`, `node-${i - 1}`, `node-${i}`));
  }
  const { payloads, skipped } = canvasPatchToPayloads(canvasGraphDiff(null, big));
  assert.equal(skipped, 0);
  assert.ok(payloads.length > 1, "300 个节点一块装不下");
  const enc = new TextEncoder();
  for (const p of payloads) assert.ok(enc.encode(JSON.stringify(p)).byteLength <= CANVAS_COLLAB_CHUNK_BYTES);
  const firstEdgeChunk = payloads.findIndex((p) => p.edges.upsert.length);
  const lastNodeChunk = payloads.map((p) => p.nodes.upsert.length > 0).lastIndexOf(true);
  assert.ok(lastNodeChunk <= firstEdgeChunk, "节点必须先于连线落地");
  const applied = applyPayloads({ nodes: [], edges: [] }, payloads);
  assert.ok(canvasGraphEquals(applied, big));
  // 删除：连线先于节点
  const del = canvasPatchToPayloads(canvasGraphDiff(big, { nodes: [], edges: [] })).payloads;
  const firstNodeRemove = del.findIndex((p) => p.nodes.remove.length);
  const lastEdgeRemove = del.map((p) => p.edges.remove.length > 0).lastIndexOf(true);
  assert.ok(lastEdgeRemove <= firstNodeRemove);
});

test("单个节点太大：先去掉素材记录再发；仍然太大就跳过并计数", () => {
  const withAsset = node("a", "有素材", 0, 0, { assetId: "asset-1", asset: { assetId: "asset-1", blob: "z".repeat(60_000) } });
  const r1 = canvasPatchToPayloads(canvasGraphDiff(null, { nodes: [withAsset], edges: [] }));
  assert.equal(r1.skipped, 0);
  assert.equal("asset" in r1.payloads[0].nodes.upsert[0].set, false);
  assert.equal(r1.payloads[0].nodes.upsert[0].set.assetId, "asset-1");
  const huge = node("h", "超大", 0, 0, { prompt: "q".repeat(60_000) });
  const r2 = canvasPatchToPayloads(canvasGraphDiff(null, { nodes: [huge], edges: [] }));
  assert.equal(r2.skipped, 1);
  assert.equal(r2.payloads.length, 0);
});

test("只读的人写不进去：控制载荷把只读与「不要自动保存」交给画布；房间没连好前先按只读等着", () => {
  assert.deepEqual(canvasControlPayload({ readOnly: true, canSave: false }), {
    schema: CANVAS_COLLAB_SCHEMA, op: "control", readOnly: true, canSave: false, flush: false,
  });
  // 查看者：只读、不保存
  assert.deepEqual(canvasControlState({ expectRoom: true, status: "synced", readOnly: true, saveGate: false }), { readOnly: true, canSave: false });
  // 编辑者非保存者：能改、不自己存
  assert.deepEqual(canvasControlState({ expectRoom: true, status: "synced", readOnly: false, saveGate: false }), { readOnly: false, canSave: false });
  // 保存者
  assert.deepEqual(canvasControlState({ expectRoom: true, status: "synced", readOnly: false, saveGate: true }), { readOnly: false, canSave: true });
  // 房间还在连：先只读等着，免得查看者在连上之前改到东西
  assert.deepEqual(canvasControlState({ expectRoom: true, status: "connecting", readOnly: false, saveGate: true }), { readOnly: true, canSave: false });
  assert.deepEqual(canvasControlState({ expectRoom: true, status: null, readOnly: false, saveGate: true }), { readOnly: true, canSave: false });
  // 协同没开 / 被拒 / 离线：不挡人（离线时按保存闸决定）
  assert.equal(canvasControlState({ expectRoom: false, status: null, readOnly: false, saveGate: true }), null);
  assert.deepEqual(canvasControlState({ expectRoom: true, status: "denied", readOnly: false, saveGate: true }), { readOnly: false, canSave: true });
  assert.deepEqual(canvasControlState({ expectRoom: true, status: "offline", readOnly: false, saveGate: true }), { readOnly: false, canSave: true });
});

test("画布回的抓图：认这套协议的载荷，认不出的（旧画布、别的载荷）返回 null", () => {
  const ok = parseCanvasCapture({ revision: 4, payload: { schema: CANVAS_COLLAB_SCHEMA, op: "state", loaded: true, nodes: base().nodes, edges: base().edges } });
  assert.equal(ok.loaded, true);
  assert.equal(ok.revision, 4);
  assert.equal(ok.graph.nodes.length, 3);
  const notLoaded = parseCanvasCapture({ revision: 0, payload: { schema: CANVAS_COLLAB_SCHEMA, op: "state", loaded: false, nodes: [], edges: [] } });
  assert.equal(notLoaded.loaded, false);
  assert.equal(parseCanvasCapture({ revision: 1, payload: { graph: base() } }), null);
  assert.equal(parseCanvasCapture({ revision: 1, payload: { schema: "other", op: "state", loaded: true, nodes: [], edges: [] } }), null);
  assert.equal(parseCanvasCapture({ revision: 1, payload: { schema: CANVAS_COLLAB_SCHEMA, op: "state", loaded: true, nodes: [{ title: "没有 id" }], edges: [] } }), null);
  assert.equal(parseCanvasCapture(null), null);
});

test("别人（AI 或专业模式）存的新版本：从工程 JSON 读出头版本的图，素材记录一起带上", () => {
  const project = {
    schema: "oceanleo.video.project.v2",
    headVersionId: "v2",
    versions: {
      v1: { graph: { nodes: [node("old", "旧", 0, 0)], edges: [] } },
      v2: { graph: { nodes: [node("n1", "图", 0, 0, { assetId: "as1" }), node("n2", "字", 10, 0)], edges: [edge("e1", "n1", "n2"), edge("dangling", "n1", "ghost")] } },
    },
    assets: { as1: { assetId: "as1", url: "https://example.test/a.png" } },
  };
  const graph = canvasGraphFromProjectJson(project);
  assert.deepEqual(graph.nodes.map((n) => n.nodeId).sort(), ["n1", "n2"]);
  assert.equal(graph.nodes.find((n) => n.nodeId === "n1").asset.assetId, "as1");
  assert.deepEqual(graph.edges.map((e) => e.edgeId), ["e1"]);
  assert.equal(canvasGraphFromProjectJson({ nodes: [] }), null);
});

test("回放读得懂真实画布的字段名：title→label、position→x/y、sourceNodeId→fromNodeId；旧形状输入原样不变", () => {
  const native = workflowFromEntities(canvasGraphToEntities(base()), null);
  assert.equal(native.nodes.length, 3);
  assert.equal(native.nodes[0].label, native.nodes[0].title);
  assert.equal(native.nodes.find((n) => n.id === "n2").x, 300);
  assert.equal(native.edges.length, 2);
  assert.equal(native.edges[0].fromNodeId, native.edges[0].sourceNodeId);

  const doc = new Y.Doc();
  writeJsonStateRoot(doc, WORKFLOW_ROOT, canvasGraphToEntities(base()));
  assert.equal(workflowFromYDoc(doc).nodes.length, 3);

  const fromJson = workflowFromRevisionJson({ headVersionId: "v", versions: { v: { graph: base() } } });
  assert.deepEqual(fromJson.nodes.map((n) => n.id).sort(), ["n1", "n2", "n3"]);
  assert.equal(fromJson.edges.length, 2);

  const legacy = { nodes: [{ id: "a", kind: "source", label: "素", x: 1, y: 2, ports: {} }], edges: [] };
  assert.deepEqual(workflowFromRevisionJson(legacy).nodes[0], { id: "a", kind: "source", label: "素", x: 1, y: 2, ports: {} });
});
