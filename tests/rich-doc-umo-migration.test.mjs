/**
 * W08 判据 3：RichDoc Tiptap JSON ↔ Umo 迁移。
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
  convertRichDocToUmo,
  convertUmoToRichDoc,
  inspectRichDocDocument,
  needsOneClickConvert,
  openRichDocReadOnly,
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

test("只读打开不产出转换结果，也不改写入参", () => {
  const source = richDoc([
    paragraph("合同条款", [{ type: "richdocComment", attrs: { commentId: "c1" } }]),
  ]);
  const before = JSON.stringify(source);
  const opened = openRichDocReadOnly(source);
  assert.equal(opened.ok, true);
  assert.equal(opened.mode, "readonly");
  assert.equal(opened.canConvert, true);
  assert.equal("document" in opened, false);
  assert.equal(JSON.stringify(source), before);
  assert.match(opened.reason, /只读打开/);
});

test("转换器只读输入：入参逐字节不变", () => {
  const source = richDoc([
    paragraph("正文", undefined, { lineHeight: "1.5", firstLineChars: 2 }),
  ]);
  const before = JSON.stringify(source);
  convertRichDocToUmo(source, { title: "备忘" });
  assert.equal(JSON.stringify(source), before, "转换器改写了输入");
});

test("一键转换剥掉批注 mark，文字留下，并记下原因", () => {
  const result = convertRichDocToUmo(
    richDoc([
      paragraph("被批的一句", [
        { type: "richdocComment", attrs: { commentId: "c1" } },
      ]),
    ]),
  );
  assert.equal(result.ok, true);
  const text = result.document.content.content[0].content[0];
  assert.equal(text.text, "被批的一句");
  assert.equal(text.marks, undefined);
  assert.ok(
    result.document.differences.some((item) => item.feature === "richdocComment"),
  );
  assert.ok(result.document.warnings.some((line) => line.includes("批注")));
});

test("删除修订的文字转换后消失，插入修订只剥 mark", () => {
  const result = convertRichDocToUmo(
    richDoc([
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "删掉",
            marks: [{ type: "richdocDeletion", attrs: { changeId: "d1" } }],
          },
          {
            type: "text",
            text: "留下",
            marks: [{ type: "richdocInsertion", attrs: { changeId: "i1" } }],
          },
        ],
      },
    ]),
  );
  assert.equal(result.ok, true);
  const texts = result.document.content.content[0].content.map((node) => node.text);
  assert.deepEqual(texts, ["留下"]);
});

test("排版 attrs 与多级编号会从 Umo 正文揭掉并记入差异", () => {
  const result = convertRichDocToUmo(
    richDoc([
      paragraph("公文", undefined, { firstLineChars: 2, lineHeight: "1.5" }),
      {
        type: "orderedList",
        attrs: { numbering: "cn-official" },
        content: [
          {
            type: "listItem",
            content: [paragraph("第一条")],
          },
        ],
      },
    ]),
  );
  assert.equal(result.ok, true);
  const para = result.document.content.content[0];
  assert.equal(para.attrs?.firstLineChars, undefined);
  assert.equal(para.attrs?.lineHeight, undefined);
  const list = result.document.content.content[1];
  assert.equal(list.attrs?.numbering, undefined);
  assert.ok(
    result.document.differences.some((item) => item.feature === "firstLineChars"),
  );
  assert.ok(
    result.document.differences.some(
      (item) => item.feature === "orderedList.numbering",
    ),
  );
});

test("sidecar review 不进 Umo 文档", () => {
  const result = convertRichDocToUmo({
    type: "doc",
    content: [paragraph("正文")],
    review: {
      version: 1,
      comments: [{ id: "c1", body: "看法" }],
      trackChangesEnabled: true,
    },
  });
  assert.equal(result.ok, true);
  assert.equal("review" in result.document.content, false);
  assert.ok(
    result.document.differences.some((item) => item.feature === "review sidecar"),
  );
});

test("工程档包装 tiptap-json@1 也能转换", () => {
  const result = convertRichDocToUmo({
    schema: RICHDOC_TIP_TAP_SCHEMA,
    version: 1,
    data: richDoc([paragraph("包装")]),
  });
  assert.equal(result.ok, true);
  assert.equal(result.document.format, UMO_DOC_FORMAT);
  assert.equal(result.document.content.content[0].content[0].text, "包装");
});

test("已经是 Umo 文档时默认不改写；strict 则拒绝", () => {
  const umo = {
    format: UMO_DOC_FORMAT,
    title: "已转换",
    content: richDoc([paragraph("Umo")]),
    warnings: [],
    differences: [],
  };
  const pass = convertRichDocToUmo(umo);
  assert.equal(pass.ok, true);
  assert.equal(pass.alreadyConverted, true);
  const strict = convertRichDocToUmo(umo, { strict: true });
  assert.equal(strict.ok, false);
  assert.equal(strict.code, "already-converted");
  assert.match(strict.reason, /已经是 Umo/);
});

test("非法输入转换失败，原因可读", () => {
  const missing = convertRichDocToUmo({ hello: "world" });
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "not-a-document");
  assert.match(missing.reason, /不是 Tiptap 的 doc|不是一份/);

  const broken = convertRichDocToUmo("{not json");
  assert.equal(broken.ok, false);
  assert.match(broken.reason, /不是 JSON/);
});

test("只剩无法映射的节点时转换失败，不交空文档冒充成功", () => {
  const result = convertRichDocToUmo({
    type: "doc",
    content: [
      {
        type: "unknownBlock",
        content: [{ type: "text", text: "只有这个" }],
      },
    ],
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "empty-after-convert");
  assert.match(result.reason, /正文被清空/);
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

test("有差异的存量才需要一键转换", () => {
  assert.equal(needsOneClickConvert(richDoc([paragraph("纯文本")])), false);
  assert.equal(
    needsOneClickConvert(
      richDoc([
        paragraph("批", [{ type: "richdocComment", attrs: { commentId: "c" } }]),
      ]),
    ),
    true,
  );
});
