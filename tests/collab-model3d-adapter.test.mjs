import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";
import {
  MODEL3D_ROOT, model3dToEntities, model3dFromEntities, model3dFromYDoc, model3dFromRevisionJson,
  model3dCanonical, model3dDescribeChange, model3dSceneRows, model3dToArtifactJson,
} from "../src/shell/collab/adapters/model3d.ts";

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


const T = (position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) => ({ position, rotation, scale });
const snapshot = () => ({
  checkpointUrl: "https://m/scene.glb",
  operations: [
    { id: "op1", kind: "transform", target: "Chair", value: T([1, 0, 0]) },
    { id: "op2", kind: "transform", target: "Table", value: T([0, 0, 2]) },
    { id: "op3", kind: "material", target: "Table", materialIndex: 0, value: { color: "#ff0000", metalness: 0.2, roughness: 0.8 } },
    { id: "op4", kind: "visibility", target: "Lamp", visible: false },
  ],
  view: {
    sourceUrl: "https://m/scene.glb", azimuth: 35, elevation: 65, zoom: 110, autoRotate: false,
    exposure: 1, background: "#111111",
    annotations: [{ id: "ann1", label: "桌脚", x: 0, y: 0, z: 0, normalX: 0, normalY: 1, normalZ: 0, nodePath: "Table" }],
  },
});
const sameDoc = (s) => model3dFromEntities(model3dToEntities(s), s);
const pair = (s) => seededPair(MODEL3D_ROOT, model3dToEntities(s));
const read = (d, prev) => model3dFromEntities(readShape(d, MODEL3D_ROOT), prev ?? snapshot());
const op = (s, id) => s.operations.find((o) => o.id === id);

test("往返无损：规范形再往返不变，且逐条操作值保留", () => {
  const x = snapshot();
  assert.deepEqual(sameDoc(x), x);
  assert.deepEqual(model3dCanonical(model3dCanonical(x)), model3dCanonical(x));
});

test("同一目标同一类操作折叠成最后一条；不同目标/属性各一个实体", () => {
  const x = snapshot();
  x.operations.push({ id: "op5", kind: "transform", target: "Chair", value: T([5, 5, 5]) });
  const shape = model3dToEntities(x);
  assert.equal(shape.order.filter((k) => k.startsWith("op:Chair|transform")).length, 1);
  const folded = model3dFromEntities(shape, x);
  assert.deepEqual(op(folded, "op5").value.position, [5, 5, 5]);
  assert.equal(op(folded, "op1"), undefined);
  assert.equal(folded.operations.length, 4);
});

test("视口是各人自己的：fromEntities 保留本地 azimuth/zoom，不被远端覆盖", () => {
  const x = snapshot();
  const local = { ...snapshot(), view: { ...snapshot().view, azimuth: -90, zoom: 300, autoRotate: true } };
  const merged = model3dFromEntities(model3dToEntities(x), local);
  assert.equal(merged.view.azimuth, -90);
  assert.equal(merged.view.zoom, 300);
  assert.equal(merged.view.autoRotate, true);
  assert.equal("azimuth" in model3dToEntities(x).meta, false);
});

test("两人同时挪不同的物体：都保留", () => {
  const [a, b] = pair(snapshot());
  const x = snapshot(); op(x, "op1").value = T([9, 0, 0]);
  const y = snapshot(); op(y, "op2").value = T([0, 0, 7]);
  writeShape(a, MODEL3D_ROOT, model3dToEntities(x));
  writeShape(b, MODEL3D_ROOT, model3dToEntities(y));
  connect(a, b);
  for (const d of [a, b]) {
    const m = read(d);
    assert.deepEqual(op(m, "op1").value.position, [9, 0, 0]);
    assert.deepEqual(op(m, "op2").value.position, [0, 0, 7]);
  }
});

test("同一物体：一人改位置、一人改缩放，都保留；同一属性后写者胜", () => {
  const [a, b] = pair(snapshot());
  const x = snapshot(); op(x, "op1").value = T([4, 0, 0], [0, 0, 0], [1, 1, 1]);
  const y = snapshot(); op(y, "op1").value = T([1, 0, 0], [0, 0, 0], [2, 2, 2]);
  writeShape(a, MODEL3D_ROOT, model3dToEntities(x));
  writeShape(b, MODEL3D_ROOT, model3dToEntities(y));
  connect(a, b);
  const m = read(a);
  assert.deepEqual(op(m, "op1").value.position, [4, 0, 0]);
  assert.deepEqual(op(m, "op1").value.scale, [2, 2, 2]);
  const z = read(b); op(z, "op1").value = T([8, 8, 8], [0, 0, 0], [2, 2, 2]);
  writeShape(b, MODEL3D_ROOT, model3dToEntities(z));
  connect(a, b);
  assert.deepEqual(op(read(a), "op1").value.position, [8, 8, 8]);
});

test("新增批注 / 新增节点 / 删除节点：收敛", () => {
  const [a, b] = pair(snapshot());
  const x = snapshot(); x.view.annotations.push({ id: "ann2", label: "灯", x: 1, y: 1, z: 1, normalX: 0, normalY: 1, normalZ: 0, nodePath: "Lamp" });
  const y = snapshot(); y.operations = y.operations.filter((o) => o.id !== "op4");
  y.operations.push({ id: "op9", kind: "presence", target: "Cam2", parent: "root", index: 0, present: true, object: { kind: "camera", name: "Cam2" } });
  writeShape(a, MODEL3D_ROOT, model3dToEntities(x));
  writeShape(b, MODEL3D_ROOT, model3dToEntities(y));
  connect(a, b);
  const ra = read(a), rb = read(b);
  assert.deepEqual(ra, rb);
  assert.deepEqual(ra.view.annotations.map((n) => n.id), ["ann1", "ann2"]);
  assert.equal(op(ra, "op4"), undefined);
  assert.equal(op(ra, "op9").object.name, "Cam2");
});

test("fromYDoc 与 fromRevisionJson(同内容) 等价（视口取默认）", () => {
  const x = snapshot();
  const [a] = pair(x);
  const fromY = model3dFromYDoc(a);
  const fromRev = model3dFromRevisionJson(model3dCanonical(x));
  for (const key of ["azimuth", "elevation", "zoom", "autoRotate"]) {
    fromRev.view[key] = fromY.view[key];
  }
  assert.deepEqual(fromY, fromRev);
});

test("场景节点树行、describeChange、toArtifactJson", () => {
  const x = snapshot();
  const rows = model3dSceneRows(x);
  assert.deepEqual(rows.map((r) => r.target), ["Chair", "Table", "Lamp"]);
  assert.equal(rows.find((r) => r.target === "Lamp").hidden, true);
  const y = snapshot(); op(y, "op1").value = T([3, 3, 3]); y.view.annotations = [];
  assert.match(model3dDescribeChange(x, y), /动了 1 个场景节点/);
  const z = snapshot(); z.view.annotations.push({ id: "annX", label: "x", x: 0, y: 0, z: 0, normalX: 0, normalY: 0, normalZ: 1, nodePath: "" });
  assert.match(model3dDescribeChange(x, z), /加了 1 条批注/);
  assert.equal(model3dDescribeChange(x, snapshot()), null);
  assert.deepEqual(model3dToArtifactJson(x).operations, x.operations);
});
