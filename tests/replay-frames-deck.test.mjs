// W13：PPT 回放画法。fromRevision 与 fromY 同内容得到等价快照；describeChange 的几种变化；toArtifactJson 往返；Frame 源码安全。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as Y from "yjs";
import { writeJsonStateRoot } from "../src/shell/collab/bind-json-state.ts";
import { normalizeDeckDocument } from "../src/shell/doc-editors/deck-schema.ts";
import {
  DECK_COLLAB_ROOT,
  deckChangedElements,
  deckDescribeChange,
  deckFocusSlideIndex,
  deckFromRevision,
  deckFromY,
  deckToArtifactJson,
  deckToEntities,
} from "../src/shell/collab/adapters/deck.ts";

const canon = (value) =>
  JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).sort(([x], [y]) => (x < y ? -1 : 1)))
      : v);
const clone = (v) => JSON.parse(JSON.stringify(v));

function makeDeck() {
  return normalizeDeckDocument({
    title: "季度汇报",
    theme: "paper",
    slides: [1, 2, 3].map((n) => ({
      id: `slide-${n}`,
      title: `第 ${n} 页`,
      body: `正文 ${n}`,
      layout: "title-body",
      elements: [
        { id: `s${n}-title`, type: "text", x: 6, y: 7, width: 88, height: 14, rotation: 0, order: 1, text: `标题 ${n}` },
        { id: `s${n}-img`, type: "image", x: 56, y: 26, width: 38, height: 52, rotation: 0, order: 2, src: `https://example.com/${n}.png` },
      ],
    })),
  });
}

function yDocOf(deck) {
  const doc = new Y.Doc();
  writeJsonStateRoot(doc, DECK_COLLAB_ROOT, deckToEntities(deck));
  return doc;
}

test("fromRevision（版本 JSON）与 fromY（协同文档）对同一内容得到等价快照", () => {
  const deck = makeDeck();
  assert.equal(canon(deckFromRevision(deck)), canon(deckFromY(yDocOf(deck))));
  assert.equal(canon(deckFromRevision({ deck })), canon(deck));
  assert.equal(deckFromY(new Y.Doc()), null);
  assert.equal(deckFromRevision(null), null);
});

test("fromRevision 认草稿（deck-ir）版本，且相邻版本的页与元素 id 稳定（逐页逐元素可比）", () => {
  const ir = (extraTitle) => ({
    schema: "oceanleo.deck.v1",
    version: 1,
    title: "草稿",
    theme: { accent: "2563EB" },
    slides: [
      { layout: "title", title: extraTitle, subtitle: "副标题" },
      { layout: "bullets", title: "要点", bullets: ["第一条", "第二条"] },
    ],
    attribution: { entries: [{ text: "t", licenseCode: "CC0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/" }] },
  });
  const a = deckFromRevision(ir("封面"));
  const b = deckFromRevision(ir("新封面"));
  assert.equal(a.slides.length, 2);
  assert.deepEqual(a.slides.map((s) => s.id), ["draft-slide-1", "draft-slide-2"]);
  assert.deepEqual(a.slides.map((s) => s.elements.map((e) => e.id)), b.slides.map((s) => s.elements.map((e) => e.id)));
  assert.equal(deckDescribeChange(a, b)?.startsWith("改了第 1 页"), true);
});

test("describeChange：新增页、删除页、改标题、改文字、换图、移动、调层级、排序", () => {
  const base = makeDeck();
  const next = (fn) => {
    const d = clone(base);
    fn(d);
    return d;
  };
  assert.equal(deckDescribeChange(null, base), "创建了演示文稿");
  assert.equal(deckDescribeChange(base, base), null);
  assert.equal(
    deckDescribeChange(base, next((d) => d.slides.push({ ...clone(d.slides[0]), id: "slide-4", elements: [] }))),
    "新增第 4 页",
  );
  assert.equal(
    deckDescribeChange(base, next((d) => d.slides.push({ ...clone(d.slides[0]), id: "a", elements: [] }, { ...clone(d.slides[0]), id: "b", elements: [] }))),
    "新增 2 页",
  );
  assert.equal(deckDescribeChange(base, next((d) => (d.slides = d.slides.filter((s) => s.id !== "slide-2")))), "删除了第 2 页");
  assert.equal(deckDescribeChange(base, next((d) => (d.slides[1].title = "新标题"))), "改了第 2 页的标题");
  assert.equal(deckDescribeChange(base, next((d) => (d.slides[2].elements[0].text = "改过"))), "改了第 3 页的文字");
  assert.equal(deckDescribeChange(base, next((d) => (d.slides[0].elements[1].src = "https://example.com/z.png"))), "换了第 1 页的图片");
  assert.equal(deckDescribeChange(base, next((d) => (d.slides[0].elements[1].x = 10))), "移动了第 1 页的元素");
  assert.equal(deckDescribeChange(base, next((d) => (d.slides[0].elements[1].order = 9))), "调整了第 1 页元素的层级");
  assert.equal(deckDescribeChange(base, next((d) => (d.slides[0].elements[0].fontSize = 40))), "调整了第 1 页元素的样式");
  assert.equal(deckDescribeChange(base, next((d) => d.slides.reverse())), "调整了页的顺序");
  assert.equal(
    deckDescribeChange(base, next((d) => d.slides[0].elements.push({ id: "n", type: "text", x: 0, y: 0, width: 5, height: 5, rotation: 0, order: 5, text: "n" }))),
    "在第 1 页新增了 1 个元素",
  );
  assert.equal(deckDescribeChange(base, next((d) => (d.title = "别的标题"))), "改了演示文稿的标题");
});

test("变化的元素与回放焦点页", () => {
  const base = makeDeck();
  const next = clone(base);
  next.slides[1].elements[1].x = 11;
  const changed = deckChangedElements(base, next);
  assert.deepEqual([...changed.keys()], ["slide-2"]);
  assert.deepEqual([...changed.get("slide-2")], ["s2-img"]);
  assert.equal(deckFocusSlideIndex(base, next), 1);
  assert.equal(deckFocusSlideIndex(null, next), 0);
});

test("toArtifactJson 往返：还原成 deck 编辑器能打开的 JSON，再读回等价", () => {
  const deck = makeDeck();
  const artifact = deckToArtifactJson(deck);
  assert.equal(canon(normalizeDeckDocument(artifact)), canon(deck));
  assert.equal(canon(deckFromRevision(artifact)), canon(deck));
  assert.equal(deckToArtifactJson(null), null);
});

test("Frame 源码不用 iframe / dangerouslySetInnerHTML / innerHTML", () => {
  const source = readFileSync(new URL("../src/shell/replay/work/frames/deck.tsx", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  assert.doesNotMatch(source, /<iframe|dangerouslySetInnerHTML|innerHTML|postMessage/);
  assert.match(source, /DeckSlideThumbnail/);
});
