import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";
import { writeJsonStateRoot, readJsonStateRoot } from "../src/shell/collab/bind-json-state.ts";
import {
  WORKFLOW_ROOT, workflowToEntities, workflowFromEntities, workflowFromYDoc, workflowFromRevisionJson,
  workflowDiff, workflowDescribeChange, workflowToArtifactJson,
} from "../src/shell/collab/adapters/workflow.ts";

// 用 W11 的真实现（collab/bind-json-state.ts）读写实体根：`writeJsonStateRoot` / `readJsonStateRoot`。
// 适配器自己的 `readEntityRoot`（鸭子类型）要和它读出同样的东西，下面各测试里都有对照。
const writeShape = (doc, root, shape, origin) => writeJsonStateRoot(doc, root, shape, origin);
const readShape = (doc, root) => readJsonStateRoot(doc, root);

function connect(a, b) {
  // 双向同步一次：各自把对方没有的更新发过去
  const ua = Y.encodeStateAsUpdate(a, Y.encodeStateVector(b));
  const ub = Y.encodeStateAsUpdate(b, Y.encodeStateVector(a));
  Y.applyUpdate(b, ua);
  Y.applyUpdate(a, ub);
}

function seededPair(root, shape) {
  const a = new Y.Doc();
  const b = new Y.Doc();
  writeShape(a, root, shape);
  connect(a, b);
  return [a, b];
}


const node = (id, kind, x, y, label) => ({ id, kind, label, x, y, ports: { inputs: [{ name: "in", dataType: "video" }], outputs: [{ name: "out", dataType: "video" }] } });
const edge = (id, from, to) => ({ id, fromNodeId: from, fromPort: "out", toNodeId: to, toPort: "in" });
const graph = () => ({
  nodes: [node("n1", "source", 0, 0, "素材"), node("n2", "trim", 200, 0, "裁剪"), node("n3", "output", 400, 0, "输出")],
  edges: [edge("e1", "n1", "n2"), edge("e2", "n2", "n3")],
});
const pair = (g) => seededPair(WORKFLOW_ROOT, workflowToEntities(g));
const read = (d) => workflowFromEntities(readShape(d, WORKFLOW_ROOT), null);
const nd = (g, id) => g.nodes.find((n) => n.id === id);

test("往返无损：fromEntities(toEntities(x)) 与 x 等价", () => {
  const x = graph();
  assert.deepEqual(workflowFromEntities(workflowToEntities(x), null), x);
});

test("两人同时拖不同节点：都保留", () => {
  const [a, b] = pair(graph());
  const x = graph(); nd(x, "n1").x = 50;
  const y = graph(); nd(y, "n3").y = 90;
  writeShape(a, WORKFLOW_ROOT, workflowToEntities(x));
  writeShape(b, WORKFLOW_ROOT, workflowToEntities(y));
  connect(a, b);
  const m = read(a);
  assert.deepEqual(m, read(b));
  assert.equal(nd(m, "n1").x, 50);
  assert.equal(nd(m, "n3").y, 90);
});

test("同一节点：一人改标签、一人拖位置，都保留；同一字段后写者胜", () => {
  const [a, b] = pair(graph());
  const x = graph(); nd(x, "n2").label = "裁成 5 秒";
  const y = graph(); nd(y, "n2").x = 260;
  writeShape(a, WORKFLOW_ROOT, workflowToEntities(x));
  writeShape(b, WORKFLOW_ROOT, workflowToEntities(y));
  connect(a, b);
  assert.equal(nd(read(a), "n2").label, "裁成 5 秒");
  assert.equal(nd(read(a), "n2").x, 260);
  const z = read(b); nd(z, "n2").label = "B 改名";
  writeShape(b, WORKFLOW_ROOT, workflowToEntities(z));
  connect(a, b);
  assert.equal(nd(read(a), "n2").label, "B 改名");
});

test("新增节点与连线、删除节点：连到被删节点的线一起消失，两端收敛", () => {
  const [a, b] = pair(graph());
  const x = graph();
  x.nodes.push(node("n4", "text", 300, 100, "字幕")); x.edges.push(edge("e3", "n4", "n3"));
  const y = graph();
  y.nodes = y.nodes.filter((n) => n.id !== "n2"); y.edges = y.edges.filter((e) => e.id !== "e1" && e.id !== "e2");
  writeShape(a, WORKFLOW_ROOT, workflowToEntities(x));
  writeShape(b, WORKFLOW_ROOT, workflowToEntities(y));
  connect(a, b);
  const m = read(a);
  assert.deepEqual(m, read(b));
  assert.deepEqual(m.nodes.map((n) => n.id).sort(), ["n1", "n3", "n4"]);
  assert.deepEqual(m.edges.map((e) => e.id), ["e3"]);
});

test("fromYDoc 与 fromRevisionJson 等价（认 项目 / {graph} / {nodes,edges}）", () => {
  const x = graph();
  const [a] = pair(x);
  assert.deepEqual(workflowFromYDoc(a), x);
  assert.deepEqual(workflowFromRevisionJson(x), x);
  assert.deepEqual(workflowFromRevisionJson({ graph: x }), x);
  const project = { schemaVersion: "oceanleo.video-canvas.v1", headVersionId: "v2", versions: [{ id: "v1", graph: { nodes: [], edges: [] } }, { id: "v2", graph: x }] };
  assert.deepEqual(workflowFromRevisionJson(project), x);
  assert.deepEqual(workflowToArtifactJson(x), x);
  assert.deepEqual(workflowFromRevisionJson(null), { nodes: [], edges: [] });
});

test("describeChange 与 diff", () => {
  const x = graph();
  const y = graph(); y.nodes.push(node("n9", "filter", 0, 200, "滤镜")); y.edges.push(edge("e9", "n1", "n9")); nd(y, "n1").x = 5;
  assert.match(workflowDescribeChange(x, y), /新增了 1 个节点/);
  assert.match(workflowDescribeChange(x, y), /连了 1 条线/);
  assert.match(workflowDescribeChange(x, y), /改了 1 个节点/);
  assert.deepEqual(workflowDiff(x, y).nodesAdded, ["n9"]);
  assert.equal(workflowDescribeChange(x, graph()), null);
});
