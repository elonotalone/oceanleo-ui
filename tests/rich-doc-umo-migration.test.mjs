/**
 * W04：存量 Umo 文档（umo.tiptap.v1）在原生 Tiptap 编辑器里的读路径。Umo 面已删除，只留回读。
 *
 * 跑法（必须带 package.json `test` 那串 flag，`_COMMON.md` §7b⑫）：
 *   node --test --import ./tests/helpers/assert-dom-guard.mjs \
 *     --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs \
 *     tests/rich-doc-umo-migration.test.mjs
 */

import { strict as assert } from "node:assert";
import test from "node:test";

import {
  RICHDOC_TIP_TAP_SCHEMA,
  RICHDOC_UMO_EXTENSION_GAPS,
  UMO_DOC_FORMAT,
  convertUmoToRichDoc,
  inspectRichDocDocument,
} from "../src/shell/doc-editors/rich-doc-umo-migration.ts";

function paragraph(text, marks, attrs) {
  return {
    type: "paragraph",
    ...(attrs ? { attrs } : {}),
    content: [{ type: "text", text, ...(marks ? { marks } : {}) }],
  };
}

function richDoc(content, extra = {}) {
  return {
    type: "doc",
    content,
    ...extra,
  };
}

test("扩展差异台账列出批注、修订、排版、Umo 分页", () => {
  const features = RICHDOC_UMO_EXTENSION_GAPS.map((item) => item.feature).join(" ");
  assert.ok(features.includes("richdocComment"));
  assert.ok(features.includes("richdocInsertion"));
  assert.ok(features.includes("lineHeight"));
  assert.ok(features.includes("orderedList.numbering"));
  assert.ok(features.includes("pageBreak"));
  assert.ok(RICHDOC_UMO_EXTENSION_GAPS.some((item) => item.side === "shared"));
  assert.ok(RICHDOC_UMO_EXTENSION_GAPS.some((item) => item.side === "richdoc"));
  assert.ok(RICHDOC_UMO_EXTENSION_GAPS.some((item) => item.side === "umo"));
});

test("回转丢掉 Umo 分页，并给出原因", () => {
  const result = convertUmoToRichDoc({
    format: UMO_DOC_FORMAT,
    title: "Umo 稿",
    content: {
      type: "doc",
      content: [
        paragraph("第一节"),
        { type: "pageBreak" },
        paragraph("第二节"),
      ],
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.schema, RICHDOC_TIP_TAP_SCHEMA);
  assert.equal(result.version, 1);
  const types = result.data.content.map((node) => node.type);
  assert.deepEqual(types, ["paragraph", "paragraph"]);
  assert.ok(result.differences.some((item) => item.feature === "pageBreak"));
});

test("inspect 能区分 richdoc / umo / invalid", () => {
  assert.equal(inspectRichDocDocument(richDoc([paragraph("a")])).kind, "richdoc");
  assert.equal(
    inspectRichDocDocument({
      format: UMO_DOC_FORMAT,
      content: richDoc([paragraph("a")]),
    }).kind,
    "umo",
  );
  assert.equal(inspectRichDocDocument(42).kind, "invalid");
});

test("存量 umo.tiptap.v1 外壳读回为 tiptap-json@1，入参不被改写", () => {
  const stored = {
    format: UMO_DOC_FORMAT,
    title: "旧 Umo 稿",
    content: richDoc([paragraph("存量正文")]),
  };
  const before = JSON.stringify(stored);
  const result = convertUmoToRichDoc(stored);
  assert.equal(result.ok, true);
  assert.equal(result.data.content[0].content[0].text, "存量正文");
  assert.equal(JSON.stringify(stored), before);
});

test("非法存量读回失败，原因可读", () => {
  const result = convertUmoToRichDoc({ hello: "world" });
  assert.equal(result.ok, false);
  assert.ok(result.reason.length > 0);
});
