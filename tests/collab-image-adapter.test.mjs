// W13：图片（Fabric）多人同改适配器。两个真 Y.Doc 互相应用更新（实体布局同契约 §8.4）。
import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";
import {
  IMAGE_COLLAB_ROOT as ROOT,
  imageFromEntities,
  imageFromY,
  imageRebaseSnapshot,
  imageToEntities,
} from "../src/shell/collab/adapters/image.ts";

// ---- 测试用的「实体绑定」：与 W11 bindJsonState 同一布局、只写变化的字段
function writeState(doc, state, last) {
  const root = doc.getMap(ROOT);
  doc.transact(() => {
    let order = root.get("order");
    if (!(order instanceof Y.Array)) root.set("order", (order = new Y.Array()));
    let entities = root.get("entities");
    if (!(entities instanceof Y.Map)) root.set("entities", (entities = new Y.Map()));
    let meta = root.get("meta");
    if (!(meta instanceof Y.Map)) root.set("meta", (meta = new Y.Map()));
    const before = last?.entities ?? {};
    for (const key of Object.keys(before)) if (!(key in state.entities)) entities.delete(key);
    for (const [key, fields] of Object.entries(state.entities)) {
      let ent = entities.get(key);
      if (!(ent instanceof Y.Map)) entities.set(key, (ent = new Y.Map()));
      for (const [name, value] of Object.entries(fields)) {
        if (JSON.stringify(before[key]?.[name]) !== JSON.stringify(value) || !ent.has(name)) ent.set(name, value);
      }
    }
    for (const [name, value] of Object.entries(state.meta)) {
      if (JSON.stringify(last?.meta?.[name]) !== JSON.stringify(value) || !meta.has(name)) meta.set(name, value);
    }
    const have = order.toJSON();
    if (JSON.stringify(have) !== JSON.stringify(state.order)) {
      // 删掉不在目标里的，再把缺的按位置插入（移动 = 删 + 插）
      for (let i = have.length - 1; i >= 0; i -= 1) {
        if (!state.order.includes(have[i]) || have.indexOf(have[i]) !== i) order.delete(i, 1);
      }
      const now = order.toJSON();
      state.order.forEach((id, index) => {
        if (now[index] !== id) {
          const at = now.indexOf(id);
          if (at >= 0) { order.delete(at, 1); now.splice(at, 1); }
          order.insert(Math.min(index, now.length), [id]);
          now.splice(Math.min(index, now.length), 0, id);
        }
      });
    }
  });
}

function sync(a, b) {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
}

const canon = (value) =>
  JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).sort(([x], [y]) => (x < y ? -1 : 1)))
      : v);
const clone = (v) => JSON.parse(JSON.stringify(v));

function makeSnapshot() {
  return {
    json: {
      version: "6.0.0",
      objects: [
        { type: "Rect", oceanleoId: "bg", oceanleoRole: "background", left: 0, top: 0, width: 1080, height: 1080, fill: "#ffffff" },
        { type: "Image", oceanleoId: "photo", left: 100, top: 120, width: 400, height: 300, scaleX: 1, scaleY: 1, angle: 0, src: "https://example.com/a.png", oceanleoFilters: { blur: 0 } },
        { type: "Textbox", oceanleoId: "title", left: 80, top: 40, width: 600, height: 60, text: "夏日海报", fill: "#111111", fontSize: 48 },
        { type: "Circle", oceanleoId: "dot", left: 700, top: 700, radius: 50, fill: "#ff0000", scaleX: 1, scaleY: 1 },
      ],
    },
    doc: { width: 1080, height: 1080 },
    canvasBackground: "#ffffff",
  };
}

function pair() {
  const snap = makeSnapshot();
  const a = new Y.Doc();
  const b = new Y.Doc();
  writeState(a, imageToEntities(snap), null);
  sync(a, b);
  return { snap, a, b };
}

const objOf = (snap, id) => snap.json.objects.find((o) => o.oceanleoId === id);

test("往返无损：fromEntities(toEntities(x)) 与 x 等价", () => {
  const snap = makeSnapshot();
  assert.equal(canon(imageFromEntities(imageToEntities(snap), null)), canon(snap));
});

test("没有 id 的旧对象按位置得到稳定 id，并写进实体让接收端拿到同一个 id", () => {
  const snap = makeSnapshot();
  delete snap.json.objects[2].oceanleoId;
  const state = imageToEntities(snap);
  assert.equal(state.order[2], "obj-3");
  assert.equal(state.entities["obj-3"].oceanleoId, "obj-3");
  assert.equal(imageFromEntities(state, null).json.objects[2].oceanleoId, "obj-3");
});

test("两人同时摆放、修改不同图层：互不影响", () => {
  const { snap, a, b } = pair();
  const base = imageToEntities(snap);
  const sa = clone(snap);
  objOf(sa, "photo").left = 250; // A 拖动图片
  const sb = clone(snap);
  objOf(sb, "title").text = "秋日海报"; // B 改文字
  sb.json.objects.push({ type: "Rect", oceanleoId: "new-b", left: 5, top: 5, width: 10, height: 10, fill: "#00ff00" });
  writeState(a, imageToEntities(sa), base);
  writeState(b, imageToEntities(sb), base);
  sync(a, b);
  for (const doc of [a, b]) {
    const merged = imageFromY(doc);
    assert.equal(objOf(merged, "photo").left, 250);
    assert.equal(objOf(merged, "title").text, "秋日海报");
    assert.ok(objOf(merged, "new-b"));
    assert.equal(merged.json.objects.length, 5);
  }
  assert.equal(canon(imageFromY(a)), canon(imageFromY(b)));
});

test("同一对象不同属性并发修改都保留；同属性后写者胜且两端一致", () => {
  const { snap, a, b } = pair();
  const base = imageToEntities(snap);
  const sa = clone(snap);
  const sb = clone(snap);
  Object.assign(objOf(sa, "title"), { left: 10, fill: "#aa0000" });
  Object.assign(objOf(sb, "title"), { fontSize: 72, fill: "#0000bb" });
  writeState(a, imageToEntities(sa), base);
  writeState(b, imageToEntities(sb), base);
  sync(a, b);
  const merged = objOf(imageFromY(a), "title");
  assert.equal(merged.left, 10);
  assert.equal(merged.fontSize, 72);
  assert.ok(["#aa0000", "#0000bb"].includes(merged.fill));
  assert.equal(canon(imageFromY(a)), canon(imageFromY(b)));
});

test("新增、删除、重排对象收敛；画布尺寸与底色是 meta", () => {
  const { snap, a, b } = pair();
  const base = imageToEntities(snap);
  const sa = clone(snap);
  sa.json.objects = sa.json.objects.filter((o) => o.oceanleoId !== "dot");
  sa.canvasBackground = "#fafafa";
  const sb = clone(snap);
  sb.json.objects.splice(1, 0, sb.json.objects.pop()); // dot 挪到 photo 下面
  sb.doc = { width: 1200, height: 628 };
  writeState(a, imageToEntities(sa), base);
  writeState(b, imageToEntities(sb), base);
  sync(a, b);
  const merged = imageFromY(a);
  assert.equal(canon(merged), canon(imageFromY(b)));
  const ids = merged.json.objects.map((o) => o.oceanleoId);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(merged.canvasBackground, "#fafafa");
  assert.deepEqual(merged.doc, { width: 1200, height: 628 });
});

test("撤销栈重基：别人的改动不会被本地撤销一起撤掉", () => {
  const base = makeSnapshot(); // 本地当前
  const mine = clone(base);
  objOf(mine, "title").text = "我改过"; // 本地历史里的某个旧状态之后
  const history = clone(base); // 撤销栈里的旧快照（我改文字之前）
  // 远端：别人挪了 photo、加了 new-r、删了 dot
  const remote = clone(mine);
  objOf(remote, "photo").left = 999;
  remote.json.objects = remote.json.objects.filter((o) => o.oceanleoId !== "dot");
  remote.json.objects.push({ type: "Rect", oceanleoId: "new-r", left: 1, top: 1, width: 5, height: 5 });
  const rebased = imageRebaseSnapshot(history, mine, remote);
  assert.equal(objOf(rebased, "photo").left, 999); // 别人的改动保留
  assert.equal(objOf(rebased, "dot"), undefined); // 别人删的不会复活
  assert.ok(objOf(rebased, "new-r"));
  assert.equal(objOf(rebased, "title").text, "夏日海报"); // 我自己的历史照旧：撤销能回到改前
  assert.equal(imageRebaseSnapshot(history, mine, mine), history); // 无变化不动
});
