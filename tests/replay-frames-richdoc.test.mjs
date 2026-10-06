/**
 * W12：富文本的回放画法（纯函数在 `collab/adapters/richdoc.ts`，画法在 `replay/work/frames/richdoc.tsx`）。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  describeRichDocChange,
  normalizeRichDocJson,
  richDocChangedBlocks,
  richDocFromRevision,
  richDocFromY,
  richDocToArtifactJson,
  safeRichDocImageSrc,
} from "../src/shell/collab/adapters/richdoc.ts";

let Y = null;
try {
  Y = await import("yjs");
} catch {
  Y = null;
}

const para = (text, marks) => ({
  type: "paragraph",
  content: [marks ? { type: "text", text, marks } : { type: "text", text }],
});

/** 带审阅侧栏、空 attrs、null attrs 的真实形状：TipTap getJSON 的样子。 */
const REVISION = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1, textAlign: null }, content: [{ type: "text", text: "季度总结" }] },
    {
      type: "paragraph",
      attrs: { textAlign: null },
      content: [
        { type: "text", text: "加粗" , marks: [{ type: "bold" }] },
        { type: "text", text: "加粗2", marks: [{ type: "bold" }] },
        { type: "text", text: "，普通文字，" },
        { type: "text", text: "链接", marks: [{ type: "link", attrs: { href: "https://example.com", target: "_blank" } }] },
      ],
    },
    {
      type: "bulletList",
      content: [{ type: "listItem", content: [para("条目一")] }, { type: "listItem", content: [para("条目二")] }],
    },
    { type: "image", attrs: { src: "https://example.com/a.png", alt: null } },
  ],
  richdocReview: { comments: [{ id: "c1" }] },
};

function yDocFromJson(json) {
  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment("oceanleo:richdoc");
  const fill = (parent, node) => {
    const element = new Y.XmlElement(node.type);
    parent.insert(parent.length, [element]);
    for (const [key, value] of Object.entries(node.attrs ?? {})) element.setAttribute(key, value);
    let run = null;
    for (const child of node.content ?? []) {
      if (child.type === "text") {
        if (!run) {
          run = new Y.XmlText();
          element.insert(element.length, [run]);
        }
        const attributes = {};
        for (const mark of child.marks ?? []) attributes[mark.type] = mark.attrs ?? {};
        run.insert(run.length, child.text, attributes);
      } else {
        run = null;
        fill(element, child);
      }
    }
  };
  for (const block of json.content) fill(fragment, block);
  return doc;
}

test("fromRevision 与 fromY 对同一内容得到等价快照（审阅侧栏、null/空属性、相邻同样式文字都归一）", { skip: !Y }, () => {
  const fromRevision = richDocFromRevision(REVISION);
  const fromY = richDocFromY(yDocFromJson(REVISION));
  assert.deepEqual(fromY, fromRevision);
  assert.equal(fromRevision.content[1].content[0].text, "加粗加粗2", "相邻同样式文字合并");
  assert.equal(fromRevision.richdocReview, undefined);
  assert.deepEqual(fromRevision.content[0].attrs, { level: 1 }, "null 属性去掉");
});

test("fromRevision 认得工程档外壳，认不出的内容给空文档", () => {
  const wrapped = { schema: "tiptap-json@1", data: REVISION };
  assert.deepEqual(richDocFromRevision(wrapped), richDocFromRevision(REVISION));
  assert.deepEqual(richDocFromRevision(null), { type: "doc", content: [] });
  assert.deepEqual(richDocFromRevision({ hello: 1 }), { type: "doc", content: [] });
});

test("describeChange：新增、删除、改标题、改段落、没变化", () => {
  const base = richDocFromRevision(REVISION);
  assert.equal(describeRichDocChange(base, base), null);

  const added = structuredClone(REVISION);
  added.content.push(para("新一段"), para("又一段"), para("第三段"));
  assert.equal(describeRichDocChange(REVISION, added), "新增 3 段");

  const removed = structuredClone(REVISION);
  removed.content.pop();
  assert.equal(describeRichDocChange(REVISION, removed), "删除 1 段");

  const title = structuredClone(REVISION);
  title.content[0].content[0].text = "年度总结";
  assert.equal(describeRichDocChange(REVISION, title), "改了标题");

  const edited = structuredClone(REVISION);
  edited.content[1].content = [{ type: "text", text: "整段重写" }];
  assert.equal(describeRichDocChange(REVISION, edited), "改了 1 段");

  const mixed = structuredClone(REVISION);
  mixed.content[1].content = [{ type: "text", text: "整段重写" }];
  mixed.content.splice(2, 0, para("插入"));
  assert.equal(describeRichDocChange(REVISION, mixed), "新增 1 段，改了 1 段");

  assert.equal(describeRichDocChange(null, REVISION), "新增 4 段");
  // 带翻译函数时走翻译
  assert.equal(
    describeRichDocChange(REVISION, added, (zh, vars) => `[${zh}|${JSON.stringify(vars ?? {})}]`),
    '[新增 {n} 段|{"n":3}]',
  );
});

test("变化的块：只标出这一帧里新出现 / 改过的段落", () => {
  const next = structuredClone(REVISION);
  next.content[1].content = [{ type: "text", text: "改了" }];
  next.content.push(para("结尾"));
  assert.deepEqual([...richDocChangedBlocks(REVISION, next)].sort(), [1, 4], "没动的列表、图片不标");
  assert.equal(richDocChangedBlocks(REVISION, REVISION).size, 0);
  const tail = structuredClone(REVISION);
  tail.content.push(para("结尾"));
  assert.deepEqual([...richDocChangedBlocks(REVISION, tail)], [4]);
});

test("toArtifactJson：快照还原成编辑器能打开的 JSON，再读回来无损", () => {
  const snapshot = richDocFromRevision(REVISION);
  const json = richDocToArtifactJson(snapshot);
  assert.equal(json.type, "doc");
  assert.deepEqual(richDocFromRevision(json), snapshot);
  assert.deepEqual(normalizeRichDocJson(json), json);
});

test("图片缩略只认 http(s)、站内路径、位图 data URL", () => {
  assert.equal(safeRichDocImageSrc("https://a.com/x.png"), "https://a.com/x.png");
  assert.equal(safeRichDocImageSrc("/v1/media/x.png"), "/v1/media/x.png");
  assert.equal(safeRichDocImageSrc("data:image/png;base64,iVBORw0KGgo="), "data:image/png;base64,iVBORw0KGgo=");
  for (const bad of [
    "javascript:alert(1)",
    "//evil.com/x.png",
    "data:image/svg+xml;base64,PHN2Zz4=",
    "data:text/html;base64,PGgxPg==",
    "",
    null,
    42,
  ]) {
    assert.equal(safeRichDocImageSrc(bad), null, String(bad));
  }
});

test("画法源码：默认导出带齐五件套，不用 iframe / innerHTML / dangerouslySetInnerHTML", () => {
  const source = readFileSync("src/shell/replay/work/frames/richdoc.tsx", "utf8");
  assert.match(source, /kind: "richdoc"/);
  for (const field of ["fromY", "fromRevision", "Frame", "describeChange", "toArtifactJson"]) {
    assert.match(source, new RegExp(`\\b${field}\\b`), field);
  }
  const code = source.replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /iframe/i);
  assert.doesNotMatch(code, /innerHTML/);
  assert.doesNotMatch(code, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(code, /<a[\s>]/, "回放里的链接不可点击");
});
