import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";
import { writeJsonStateRoot, readJsonStateRoot } from "../src/shell/collab/bind-json-state.ts";
import {
  PDF_ROOT, pdfToEntities, pdfFromEntities, pdfFromYDoc, pdfFromRevisionJson,
  pdfAnnotationsOnPage, pdfDescribeChange, pdfToArtifactJson,
} from "../src/shell/collab/adapters/pdf.ts";

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


const rect = (x, y, w = 100, h = 20) => ({ origin: { x, y }, size: { width: w, height: h } });
const state = () => ({
  pages: [{ index: 0, widthPt: 612, heightPt: 792 }, { index: 1, widthPt: 612, heightPt: 792 }],
  annotations: [
    { id: "a1", pageIndex: 0, typeName: "HIGHLIGHT", rect: rect(50, 60), contents: "", strokeColor: "#ffe066", opacity: 0.5 },
    { id: "a2", pageIndex: 1, typeName: "TEXT", rect: rect(80, 100, 24, 24), contents: "看这里", strokeColor: "#ff0000", opacity: 1 },
  ],
  fields: { name: "张三", agree: "Yes" },
});
const pair = (s) => seededPair(PDF_ROOT, pdfToEntities(s));
const read = (d) => pdfFromEntities(readShape(d, PDF_ROOT), null);
const ann = (s, id) => s.annotations.find((a) => a.id === id);

test("往返无损：fromEntities(toEntities(x)) 与 x 等价", () => {
  const x = state();
  assert.deepEqual(pdfFromEntities(pdfToEntities(x), null), x);
});

test("两人同时批注不同的地方：都保留", () => {
  const [a, b] = pair(state());
  const x = state(); x.annotations.push({ id: "a3", pageIndex: 0, typeName: "SQUARE", rect: rect(10, 10), contents: "", strokeColor: "#0f0", opacity: 1 });
  const y = state(); y.annotations.push({ id: "a4", pageIndex: 1, typeName: "TEXT", rect: rect(200, 200), contents: "B", strokeColor: "#00f", opacity: 1 });
  writeShape(a, PDF_ROOT, pdfToEntities(x));
  writeShape(b, PDF_ROOT, pdfToEntities(y));
  connect(a, b);
  const m = read(a);
  assert.deepEqual(m, read(b));
  assert.deepEqual(m.annotations.map((n) => n.id).sort(), ["a1", "a2", "a3", "a4"]);
  assert.equal(pdfAnnotationsOnPage(m, 1).length, 2);
});

test("同一条批注：一人改内容、一人挪位置，都保留；同字段后写者胜", () => {
  const [a, b] = pair(state());
  const x = state(); ann(x, "a2").contents = "改了字";
  const y = state(); ann(y, "a2").rect = rect(300, 300, 24, 24);
  writeShape(a, PDF_ROOT, pdfToEntities(x));
  writeShape(b, PDF_ROOT, pdfToEntities(y));
  connect(a, b);
  const m = read(a);
  assert.equal(ann(m, "a2").contents, "改了字");
  assert.equal(ann(m, "a2").rect.origin.x, 300);
  const z = read(b); ann(z, "a2").contents = "B 改的";
  writeShape(b, PDF_ROOT, pdfToEntities(z));
  connect(a, b);
  assert.equal(ann(read(a), "a2").contents, "B 改的");
});

test("表单字段：同时填不同的项都保留，同一项后写者胜", () => {
  const [a, b] = pair(state());
  const x = state(); x.fields.email = "a@x.com";
  const y = state(); y.fields.phone = "123";
  writeShape(a, PDF_ROOT, pdfToEntities(x));
  writeShape(b, PDF_ROOT, pdfToEntities(y));
  connect(a, b);
  assert.deepEqual(read(a).fields, { name: "张三", agree: "Yes", email: "a@x.com", phone: "123" });
  const z = read(b); z.fields.name = "李四";
  writeShape(b, PDF_ROOT, pdfToEntities(z));
  connect(a, b);
  assert.equal(read(a).fields.name, "李四");
});

test("删除批注收敛", () => {
  const [a, b] = pair(state());
  const x = state(); x.annotations = x.annotations.filter((n) => n.id !== "a1");
  writeShape(a, PDF_ROOT, pdfToEntities(x));
  connect(a, b);
  assert.deepEqual(read(b).annotations.map((n) => n.id), ["a2"]);
});

test("fromYDoc 与 fromRevisionJson(sidecar) 等价；认不出的批注丢弃", () => {
  const x = state();
  const [a] = pair(x);
  assert.deepEqual(pdfFromYDoc(a), pdfFromRevisionJson(x));
  const sidecar = pdfToArtifactJson(x);
  assert.equal(sidecar.schema, "pdf-annotations@2");
  assert.deepEqual(pdfFromRevisionJson(sidecar), x);
  const dirty = pdfFromRevisionJson({ annotations: [{ id: "ok", rect: rect(1, 1) }, { id: "", rect: rect(1, 1) }, { id: "bad", rect: 5 }] });
  assert.deepEqual(dirty.annotations.map((n) => n.id), ["ok"]);
});

test("describeChange：几页新增了几条、改了几条、填了几个表单项", () => {
  const x = state();
  const y = state(); y.annotations.push({ id: "a9", pageIndex: 2, typeName: "TEXT", rect: rect(1, 1), contents: "" });
  assert.match(pdfDescribeChange(x, y), /第 3 页新增了 1 条批注/);
  const z = state(); ann(z, "a1").contents = "x"; z.fields.name = "改";
  const text = pdfDescribeChange(x, z);
  assert.match(text, /改了 1 条批注/); assert.match(text, /填了 1 个表单项/);
  assert.equal(pdfDescribeChange(x, state()), null);
});
