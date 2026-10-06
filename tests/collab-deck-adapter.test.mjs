// W13：PPT 多人同改适配器。用两个真 Y.Doc 互相应用更新（按契约 §8.4 的实体布局：
// 每实体一个 Y.Map、顺序一个 Y.Array、meta 一个 Y.Map），不用真编辑器。
import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";
import { normalizeDeckDocument } from "../src/shell/doc-editors/deck-schema.ts";
import {
  DECK_COLLAB_ROOT,
  deckElementKey,
  deckFromEntities,
  deckFromY,
  deckToEntities,
} from "../src/shell/collab/adapters/deck.ts";

// ---- 测试用的「实体绑定」：与 W11 bindJsonState 同一布局、只写变化的字段
function writeState(doc, state, last) {
  const root = doc.getMap(DECK_COLLAB_ROOT);
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

function makeDeck() {
  return normalizeDeckDocument({
    title: "季度汇报",
    aspect: "16:9",
    theme: "paper",
    slides: [1, 2, 3, 4, 5].map((n) => ({
      id: `slide-${n}`,
      title: `第 ${n} 页`,
      body: `正文 ${n}`,
      bullets: n === 3 ? ["a", "b"] : [],
      notes: "",
      layout: "title-body",
      background: "",
      elements: [
        { id: `s${n}-title`, type: "text", x: 6, y: 7, width: 88, height: 14, rotation: 0, order: 1, text: `标题 ${n}`, fontSize: 32, bold: true },
        { id: `s${n}-img`, type: "image", x: 56, y: 26, width: 38, height: 52, rotation: 0, order: 2, src: `https://example.com/${n}.png`, imageFit: "cover" },
        { id: `s${n}-box`, type: "shape", x: 10, y: 30, width: 20, height: 20, rotation: 15, order: 3, shape: "rect", fill: "#ff0000" },
      ],
    })),
  });
}

const clone = (v) => JSON.parse(JSON.stringify(v));

function pair() {
  const deck = makeDeck();
  const a = new Y.Doc();
  const b = new Y.Doc();
  const state = deckToEntities(deck);
  writeState(a, state, null);
  sync(a, b);
  return { deck, a, b, state };
}

test("往返无损：fromEntities(toEntities(x)) 与 x 等价", () => {
  const deck = makeDeck();
  const back = deckFromEntities(deckToEntities(deck), null);
  assert.equal(canon(back), canon(deck));
  const again = deckFromEntities(deckToEntities(back), back);
  assert.equal(canon(again), canon(deck));
});

test("可选字段被清掉也会同步（null 还原成没有这个字段）", () => {
  const deck = makeDeck();
  deck.slides[0].elements[0].fontSize = 20;
  const first = deckToEntities(deck);
  delete deck.slides[0].elements[0].fontSize;
  deck.slides[0].transition = undefined;
  const second = deckToEntities(deck);
  const key = deckElementKey("slide-1", "s1-title");
  assert.equal(first.entities[key].fontSize, 20);
  assert.equal(second.entities[key].fontSize, null);
  assert.equal("fontSize" in deckFromEntities(second, null).slides[0].elements[0], false);
});

test("元素层级用 order 字段：同页两个人同时加元素都保留，并按层级排好", () => {
  const { deck, a, b } = pair();
  const sa = clone(deck);
  const sb = clone(deck);
  sa.slides[1].elements.push({ id: "from-a", type: "text", x: 1, y: 1, width: 10, height: 10, rotation: 0, order: 4, text: "A" });
  sb.slides[1].elements.push({ id: "from-b", type: "text", x: 2, y: 2, width: 10, height: 10, rotation: 0, order: 5, text: "B" });
  writeState(a, deckToEntities(sa), deckToEntities(deck));
  writeState(b, deckToEntities(sb), deckToEntities(deck));
  sync(a, b);
  const ra = deckFromY(a);
  const rb = deckFromY(b);
  assert.equal(canon(ra), canon(rb));
  assert.deepEqual(ra.slides[1].elements.map((e) => e.id), ["s2-title", "s2-img", "s2-box", "from-a", "from-b"]);
});

test("你改第 2 页标题、他调第 5 页图片：互不影响", () => {
  const { deck, a, b } = pair();
  const base = deckToEntities(deck);
  const sa = clone(deck);
  sa.slides[1].title = "新的第二页";
  const sb = clone(deck);
  const image = sb.slides[4].elements.find((e) => e.id === "s5-img");
  image.x = 40;
  image.imageFit = "contain";
  writeState(a, deckToEntities(sa), base);
  writeState(b, deckToEntities(sb), base);
  sync(a, b);
  for (const doc of [a, b]) {
    const merged = deckFromY(doc);
    assert.equal(merged.slides[1].title, "新的第二页");
    const img = merged.slides[4].elements.find((e) => e.id === "s5-img");
    assert.equal(img.x, 40);
    assert.equal(img.imageFit, "contain");
    assert.equal(merged.slides[0].title, "第 1 页");
  }
  assert.equal(canon(deckFromY(a)), canon(deckFromY(b)));
});

test("同一元素不同属性并发修改都保留；同一属性后写者胜且两端一致", () => {
  const { deck, a, b } = pair();
  const base = deckToEntities(deck);
  const sa = clone(deck);
  const sb = clone(deck);
  const ea = sa.slides[0].elements.find((e) => e.id === "s1-title");
  const eb = sb.slides[0].elements.find((e) => e.id === "s1-title");
  ea.x = 33; // A 改位置
  ea.text = "A 写的";
  eb.fontSize = 48; // B 改字号
  eb.text = "B 写的"; // 同属性冲突
  writeState(a, deckToEntities(sa), base);
  writeState(b, deckToEntities(sb), base);
  sync(a, b);
  const ra = deckFromY(a).slides[0].elements[0];
  const rb = deckFromY(b).slides[0].elements[0];
  assert.equal(ra.x, 33);
  assert.equal(ra.fontSize, 48);
  assert.equal(ra.text, rb.text);
  assert.ok(["A 写的", "B 写的"].includes(ra.text));
  assert.equal(canon(deckFromY(a)), canon(deckFromY(b)));
});

test("新增 / 删除 / 重排页收敛，两端相同", () => {
  const { deck, a, b } = pair();
  const base = deckToEntities(deck);
  const sa = clone(deck);
  sa.slides.splice(2, 0, { ...clone(deck.slides[0]), id: "slide-new", title: "新页", elements: [] });
  const sb = clone(deck);
  sb.slides = sb.slides.filter((s) => s.id !== "slide-4");
  const moved = sb.slides.shift();
  sb.slides.push(moved);
  writeState(a, deckToEntities(sa), base);
  writeState(b, deckToEntities(sb), base);
  sync(a, b);
  const ra = deckFromY(a);
  const rb = deckFromY(b);
  assert.equal(canon(ra), canon(rb));
  const ids = ra.slides.map((s) => s.id);
  assert.ok(ids.includes("slide-new"));
  assert.ok(!ids.includes("slide-4"));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ra.slides.find((s) => s.id === "slide-new").title, "新页");
});

test("页被删时它的元素不会孤零零留在文档里", () => {
  const { deck, a } = pair();
  const base = deckToEntities(deck);
  const next = clone(deck);
  next.slides = next.slides.filter((s) => s.id !== "slide-2");
  writeState(a, deckToEntities(next), base);
  const merged = deckFromY(a);
  assert.equal(merged.slides.length, 4);
  assert.equal(merged.slides.some((s) => s.elements.some((e) => e.id.startsWith("s2-"))), false);
});

test("meta（标题、主题）与页内字段（备注、背景）也能并发合并", () => {
  const { deck, a, b } = pair();
  const base = deckToEntities(deck);
  const sa = clone(deck);
  sa.title = "新标题";
  sa.slides[2].notes = "讲这里要慢";
  const sb = clone(deck);
  sb.theme = "ink";
  sb.slides[2].background = "#000000";
  writeState(a, deckToEntities(sa), base);
  writeState(b, deckToEntities(sb), base);
  sync(a, b);
  const merged = deckFromY(a);
  assert.equal(merged.title, "新标题");
  assert.equal(merged.theme, "ink");
  assert.equal(merged.slides[2].notes, "讲这里要慢");
  assert.equal(merged.slides[2].background, "#000000");
  assert.equal(canon(merged), canon(deckFromY(b)));
});

test("空文档不会交给编辑器（至少保留一页）", () => {
  const empty = deckFromEntities({ order: [], entities: {}, meta: {} }, null);
  assert.ok(empty.slides.length >= 1);
  const prev = makeDeck();
  assert.equal(deckFromEntities({ order: [], entities: {}, meta: {} }, prev), prev);
});
