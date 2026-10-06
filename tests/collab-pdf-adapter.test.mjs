import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";
import {
  PDF_ROOT, pdfToEntities, pdfFromEntities, pdfFromYDoc, pdfFromRevisionJson,
  pdfAnnotationsOnPage, pdfDescribeChange, pdfToArtifactJson,
} from "../src/shell/collab/adapters/pdf.ts";

// 协同参考实现：按契约 §8.4 的实体型布局（<root>:order / <root>:entities / <root>:meta）把状态写进 Y.Doc。
// W11 的 bindJsonState 内部结构契约没写死，这里是测试用的最小替身；适配器本身不依赖它。
const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function writeShape(doc, root, shape, origin) {
  doc.transact(() => {
    const order = doc.getArray(`${root}:order`);
    const entities = doc.getMap(`${root}:entities`);
    const meta = doc.getMap(`${root}:meta`);
    const wanted = new Set(shape.order);
    for (let i = order.length - 1; i >= 0; i -= 1) {
      if (!wanted.has(order.get(i))) order.delete(i, 1);
    }
    const present = new Set(order.toArray());
    // 按目标顺序补齐缺的键：插在它前一个键之后
    shape.order.forEach((key, index) => {
      if (present.has(key)) return;
      const at = index === 0 ? 0 : order.toArray().indexOf(shape.order[index - 1]) + 1;
      order.insert(Math.max(0, at), [key]);
      present.add(key);
    });
    for (const key of [...entities.keys()]) if (!wanted.has(key)) entities.delete(key);
    for (const key of shape.order) {
      let entity = entities.get(key);
      if (!entity) {
        entity = new Y.Map();
        entities.set(key, entity);
      }
      const fields = shape.entities[key] ?? {};
      for (const name of [...entity.keys()]) if (!(name in fields)) entity.delete(name);
      for (const [name, value] of Object.entries(fields)) {
        if (!same(entity.get(name), value)) entity.set(name, clone(value));
      }
    }
    const metaWanted = shape.meta ?? {};
    for (const name of [...meta.keys()]) if (!(name in metaWanted)) meta.delete(name);
    for (const [name, value] of Object.entries(metaWanted)) {
      if (!same(meta.get(name), value)) meta.set(name, clone(value));
    }
  }, origin);
}

function readShape(doc, root) {
  return {
    order: doc.getArray(`${root}:order`).toArray(),
    entities: doc.getMap(`${root}:entities`).toJSON(),
    meta: doc.getMap(`${root}:meta`).toJSON(),
  };
}

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
