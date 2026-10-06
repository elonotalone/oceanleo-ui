// W13：PPT 多人同改适配器。用两个真 Y.Doc 互相应用更新（按契约 §8.4 的实体布局：
// 每实体一个 Y.Map、顺序一个 Y.Array、meta 一个 Y.Map），不用真编辑器。
import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";
import { bindJsonState, readJsonStateRoot, writeJsonStateRoot } from "../src/shell/collab/bind-json-state.ts";
import { normalizeDeckDocument } from "../src/shell/doc-editors/deck-schema.ts";
import {
  DECK_COLLAB_ROOT,
  deckElementKey,
  deckFromEntities,
  deckFromY,
  deckRebase,
  deckToEntities,
} from "../src/shell/collab/adapters/deck.ts";
import { peersSelecting, readPeerSelections, safeSelectionColor } from "../src/shell/collab/adapters/visual-selection.ts";

// ---- 用 W11 的真实现写读实体根（collab/bind-json-state.ts）：只写变化的字段、被删的字段/实体随之删除
function writeState(doc, state, _last) {
  writeJsonStateRoot(doc, DECK_COLLAB_ROOT, state);
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

test("自带的读取（fromY 用）与 W11 的 readJsonStateRoot 等价", () => {
  const { a } = pair();
  assert.equal(canon(deckFromY(a)), canon(deckFromEntities(readJsonStateRoot(a, DECK_COLLAB_ROOT), null)));
});

// ---- 接上 W11 真实的 bindJsonState：种子、远端回调、本地推送
function fakeRoom(doc, extra = {}) {
  return {
    roomKey: "artifact:deck-test",
    doc,
    role: "editor",
    status: "synced",
    self: { id: "u1", name: "甲", color: "hsl(1, 70%, 45%)", avatar_url: null },
    needsSeed: false,
    lock: null,
    seeded: [],
    completeSeed(roots) {
      this.seeded.push(roots);
      this.needsSeed = false;
    },
    ...extra,
  };
}

test("真 bindJsonState：A 种子，B 收到整份 PPT；B 改第 2 页标题，A 的回调收到且其余不变", () => {
  const docA = new Y.Doc();
  const docB = new Y.Doc();
  const roomA = fakeRoom(docA, { needsSeed: true });
  const roomB = fakeRoom(docB);
  const deck = makeDeck();
  const opts = (room) => ({ room, rootName: DECK_COLLAB_ROOT, toEntities: deckToEntities, fromEntities: deckFromEntities });
  const bindA = bindJsonState(opts(roomA));
  const bindB = bindJsonState(opts(roomB));
  const gotA = [];
  const gotB = [];
  bindA.onRemote((state) => gotA.push(state));
  bindB.onRemote((state) => gotB.push(state));
  bindA.seed(deck);
  assert.deepEqual(roomA.seeded, [[DECK_COLLAB_ROOT]]);
  sync(docA, docB);
  assert.equal(gotB.length >= 1, true);
  assert.equal(canon(gotB.at(-1)), canon(deck));
  assert.equal(gotA.length, 0, "自己种的子不回调自己");
  const edited = clone(gotB.at(-1));
  edited.slides[1].title = "B 改的标题";
  bindB.push(edited);
  sync(docA, docB);
  assert.equal(gotA.length >= 1, true);
  const remote = gotA.at(-1);
  assert.equal(remote.slides[1].title, "B 改的标题");
  assert.equal(canon({ ...remote, slides: remote.slides.filter((_, i) => i !== 1) }), canon({ ...deck, slides: deck.slides.filter((_, i) => i !== 1) }));
  bindA.destroy();
  bindB.destroy();
});

test("真 bindJsonState：viewer 的推送被丢弃", () => {
  const doc = new Y.Doc();
  const room = fakeRoom(doc, { role: "viewer" });
  const bind = bindJsonState({ room, rootName: DECK_COLLAB_ROOT, toEntities: deckToEntities, fromEntities: deckFromEntities });
  bind.push(makeDeck());
  assert.equal(readJsonStateRoot(doc, DECK_COLLAB_ROOT).order.length, 0);
  bind.destroy();
});

const cloneDeck = (d) => JSON.parse(JSON.stringify(d));

test("deckRebase：别人的改动套进旧快照，本地撤销不会撤掉别人的改动", () => {
  const base = makeDeck();
  const remote = cloneDeck(base);
  remote.slides[1].title = "别人改的标题";
  remote.slides[3].elements = remote.slides[3].elements.filter((e) => e.id !== "s4-box");
  remote.slides.splice(5, 0, { ...cloneDeck(base.slides[0]), id: "slide-new", title: "别人新加", elements: [] });
  // 旧快照：本人在撤销栈里的一份（本人当时改过第 1 页标题）
  const old = cloneDeck(base);
  old.slides[0].title = "本人旧标题";
  const rebased = deckRebase(old, base, remote);
  assert.equal(rebased.slides[0].title, "本人旧标题", "本人的改动留着");
  assert.equal(rebased.slides[1].title, "别人改的标题");
  assert.equal(rebased.slides[3].elements.some((e) => e.id === "s4-box"), false);
  assert.deepEqual(rebased.slides.map((s) => s.id), ["slide-1", "slide-2", "slide-3", "slide-4", "slide-5", "slide-new"]);
  assert.equal(deckRebase(old, base, base), old, "没变化就原样返回");
});

test("deckRebase：本人拖动中远端到达，把本人这一手套回远端状态", () => {
  const gestureBase = makeDeck();
  const local = cloneDeck(gestureBase);
  local.slides[0].elements[0].x = 40; // 本人正在拖
  const remote = cloneDeck(gestureBase);
  remote.slides[2].title = "别人改第 3 页";
  const merged = deckRebase(remote, gestureBase, local);
  assert.equal(merged.slides[0].elements[0].x, 40);
  assert.equal(merged.slides[2].title, "别人改第 3 页");
});

test("deckRebase：页被别人调了顺序，旧快照跟着调", () => {
  const base = makeDeck();
  const remote = cloneDeck(base);
  remote.slides.reverse();
  const rebased = deckRebase(cloneDeck(base), base, remote);
  assert.deepEqual(rebased.slides.map((s) => s.id), remote.slides.map((s) => s.id));
});

test("看见别人：读 awareness 里别人的选择，颜色按用户 id 重算、自己和脏数据不算", () => {
  const states = new Map([
    [1, { user: { id: "me", name: "我" }, selection: ["slide-1"] }],
    [2, { user: { id: "u2", name: "乙", color: "red; background:url(x)" }, selection: ["slide-2", "slide-2::s2-title", 7, ""] }],
    [3, { user: { id: "u2", name: "乙" }, selection: ["slide-3::s3-box"] }],
    [4, { user: { id: "me", name: "我（另一个标签页）" }, selection: ["slide-4"] }],
    [5, { selection: ["slide-5"] }],
    [6, { user: { id: "u6", name: "丙" }, selection: "不是数组" }],
  ]);
  const peers = readPeerSelections({ clientID: 1, getStates: () => states }, "me");
  assert.deepEqual(peers.map((p) => p.userId), ["u2", "u6"]);
  assert.deepEqual(peers[0].keys, ["slide-2", "slide-2::s2-title", "slide-3::s3-box"], "同一人多个标签页合并");
  assert.match(peers[0].color, /^hsl\(\d+, 70%, 45%\)$/);
  assert.deepEqual(peers[1].keys, []);
  assert.deepEqual(peersSelecting(peers, deckElementKey("slide-2", "s2-title")).map((p) => p.name), ["乙"]);
  assert.equal(safeSelectionColor("red; background:url(x)"), "#6366f1");
  assert.equal(safeSelectionColor(peers[0].color), peers[0].color);
});
