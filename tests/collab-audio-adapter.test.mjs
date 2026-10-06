import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";
import {
  AUDIO_ROOT, audioToEntities, audioFromEntities, audioFromYDoc, audioFromRevisionJson,
  audioOperationIds, audioSegments, audioDescribeChange, audioToArtifactJson,
} from "../src/shell/collab/adapters/audio.ts";

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


const state = () => ({
  sourceUrl: "https://m/a.mp3",
  operations: [
    { type: "crop", start: 1, end: 9 },
    { type: "fade", edge: "in", duration: 0.5 },
    { type: "gain", multiplier: 1.5, start: 2, end: 4 },
  ],
  attribution: [{ text: "x", licenseCode: "CC0" }],
});
const pair = (s) => seededPair(AUDIO_ROOT, audioToEntities(s));
const read = (d) => audioFromEntities(readShape(d, AUDIO_ROOT), null);

test("往返无损：fromEntities(toEntities(x)) 与 x 等价", () => {
  const x = state();
  assert.deepEqual(audioFromEntities(audioToEntities(x), null), x);
});

test("操作 id 稳定：同内容同 id，相同内容重复出现用序号区分", () => {
  const ops = [{ type: "delete", start: 1, end: 2 }, { type: "delete", start: 1, end: 2 }, { type: "crop", start: 0, end: 5 }];
  const a = audioOperationIds(ops);
  const b = audioOperationIds(JSON.parse(JSON.stringify(ops)));
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, 3);
  assert.ok(a[0].endsWith("-0") && a[1].endsWith("-1"));
  // 字段顺序不影响 id
  assert.deepEqual(audioOperationIds([{ end: 2, type: "delete", start: 1 }]), audioOperationIds([{ type: "delete", start: 1, end: 2 }]).slice(0, 1));
});

test("两人同时各加一条操作：两条都保留，且两端顺序一致", () => {
  const [a, b] = pair(state());
  const x = state(); x.operations.push({ type: "fade", edge: "out", duration: 2 });
  const y = state(); y.operations.push({ type: "gain", multiplier: 0.5 });
  writeShape(a, AUDIO_ROOT, audioToEntities(x));
  writeShape(b, AUDIO_ROOT, audioToEntities(y));
  connect(a, b);
  const ra = read(a), rb = read(b);
  assert.deepEqual(ra, rb);
  assert.equal(ra.operations.length, 5);
  assert.ok(ra.operations.some((o) => o.type === "fade" && o.edge === "out"));
  assert.ok(ra.operations.some((o) => o.type === "gain" && o.multiplier === 0.5));
});

test("一人撤掉一条操作、一人新增一条：收敛，被撤的不复活", () => {
  const [a, b] = pair(state());
  const x = state(); x.operations.pop();
  const y = state(); y.operations.push({ type: "delete", start: 3, end: 4 });
  writeShape(a, AUDIO_ROOT, audioToEntities(x));
  writeShape(b, AUDIO_ROOT, audioToEntities(y));
  connect(a, b);
  const m = read(a);
  assert.deepEqual(m, read(b));
  assert.ok(!m.operations.some((o) => o.type === "gain"));
  assert.ok(m.operations.some((o) => o.type === "delete"));
});

test("换源文件与署名走 meta：同时改不同 meta 键都保留", () => {
  const [a, b] = pair(state());
  const x = state(); x.sourceUrl = "https://m/b.mp3";
  const y = state(); y.attribution = [{ text: "y", licenseCode: "CC-BY" }];
  writeShape(a, AUDIO_ROOT, audioToEntities(x));
  writeShape(b, AUDIO_ROOT, audioToEntities(y));
  connect(a, b);
  const m = read(a);
  assert.equal(m.sourceUrl, "https://m/b.mp3");
  assert.equal(m.attribution[0].licenseCode, "CC-BY");
});

test("fromYDoc 与 fromRevisionJson 等价；片段示意与 describeChange", () => {
  const x = state();
  const [a] = pair(x);
  assert.deepEqual(audioFromYDoc(a), audioFromRevisionJson(x));
  const segs = audioSegments(x);
  assert.deepEqual(segs.map((s) => [s.type, s.start, s.end]), [["crop", 1, 9], ["fade", null, null], ["gain", 2, 4]]);
  const y = state(); y.operations.push({ type: "delete", start: 0, end: 1 });
  assert.match(audioDescribeChange(x, y), /加了 1 个剪辑操作/);
  assert.match(audioDescribeChange(y, x), /撤掉了 1 个剪辑操作/);
  assert.equal(audioDescribeChange(x, state()), null);
  assert.deepEqual(audioToArtifactJson(x), x);
});
