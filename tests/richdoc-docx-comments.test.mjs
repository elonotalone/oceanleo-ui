// 富文档批注 → docx `w:comment` 往返（W15，裁定 A-9：`docx-export.ts` 归 W15）
//
// 判据和这一波其它几份一样：**「做出来但导出丢失，等于没做」**。
// 批注这一条还多一层危险——**导出错了比不导出更糟**：
// `CommentRangeStart` 没有配对的 `CommentRangeEnd`、或者 `comments` 部件里躺着
// 一条正文里挂不上的批注，Word 不是「少显示一条」，是**直接判整份文件损坏**。
// 所以这份文件里有一半用例锁的是「不该出现的东西没出现」。
//
// 载荷形状由审阅层的 `buildDocxCommentPayload()` 定义（W14 独占面，
// `richdoc-review/review-export.ts`）。这里按那份契约手搭 entries，
// 测的是 `docx-export.ts` 这一侧的映射。

import test from "node:test";
import assert from "node:assert/strict";

import JSZip from "jszip";

import { tiptapJsonToDocxBlob } from "../src/shell/doc-editors/docx-export.ts";
import { commentAnchorMarkName } from "../src/shell/doc-editors/richdoc-review/review-export.ts";

const COMMENT_MARK = commentAnchorMarkName();

// --- 往返台 ----------------------------------------------------------------

async function exportParts(content, options) {
  const blob = await tiptapJsonToDocxBlob("w15", { type: "doc", content }, options);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const commentsFile = zip.file("word/comments.xml");
  return {
    document: await zip.file("word/document.xml").async("string"),
    comments: commentsFile ? await commentsFile.async("string") : "",
  };
}

/** 一段带批注锚点的文字。`commentId` 是 sidecar 的字符串 id。 */
function anchored(text, commentId, extraMarks = []) {
  return {
    type: "text",
    text,
    marks: [{ type: COMMENT_MARK, attrs: { commentId } }, ...extraMarks],
  };
}

const plain = (text) => ({ type: "text", text });
const para = (...children) => ({ type: "paragraph", content: children });

/** 按 `DocxCommentEntry` 契约搭一条载荷。 */
function entry(id, commentId, body, overrides = {}) {
  return {
    id,
    commentId,
    author: "zhang@example.com",
    initials: "张",
    date: "2026-08-31T10:00:00.000Z",
    paragraphs: [body],
    quotedText: "",
    resolved: false,
    orphaned: false,
    range: { from: 1, to: 5 },
    ...overrides,
  };
}

const countOf = (xml, tag) =>
  (xml.match(new RegExp(`<w:${tag}\\b`, "g")) || []).length;

// --- 正向：批注真的进了 docx -------------------------------------------------

test("批注 · 锚点前后真的落下 commentRangeStart / End / Reference", async () => {
  const { document } = await exportParts(
    [para(plain("合同"), anchored("第三条", "c1"), plain("需复核"))],
    { comments: [entry(0, "c1", "这一条要法务确认")] },
  );
  assert.equal(countOf(document, "commentRangeStart"), 1);
  assert.equal(countOf(document, "commentRangeEnd"), 1);
  assert.equal(countOf(document, "commentReference"), 1);
  assert.match(document, /<w:commentRangeStart w:id="0"/);
  assert.match(document, /<w:commentRangeEnd w:id="0"/);
});

test("批注 · 正文与批注部件都在，正文与批注文字对得上", async () => {
  const { document, comments } = await exportParts(
    [para(anchored("违约金", "c1"))],
    { comments: [entry(0, "c1", "违约金比例需要再谈")] },
  );
  assert.match(document, /违约金/);
  assert.equal(countOf(comments, "comment"), 1, "批注部件里应当正好一条");
  assert.match(comments, /违约金比例需要再谈/);
  assert.match(comments, /w:author="zhang@example\.com"/);
  assert.match(comments, /w:initials="张"/);
});

test("批注 · 回复跟正文一起进同一条批注，每条一段", async () => {
  const { comments } = await exportParts([para(anchored("条款", "c1"))], {
    comments: [
      entry(0, "c1", "这里要改", {
        paragraphs: ["这里要改", "李四: 已按意见改过"],
      }),
    ],
  });
  assert.match(comments, /这里要改/);
  assert.match(comments, /李四: 已按意见改过/);
});

test("批注 · 多条批注各自成范围，id 不串", async () => {
  const { document, comments } = await exportParts(
    [para(anchored("甲方", "c1"), plain("与"), anchored("乙方", "c2"))],
    {
      comments: [entry(0, "c1", "甲方名称待定"), entry(1, "c2", "乙方待补")],
    },
  );
  assert.equal(countOf(document, "commentRangeStart"), 2);
  assert.equal(countOf(document, "commentRangeEnd"), 2);
  assert.match(document, /<w:commentRangeStart w:id="0"/);
  assert.match(document, /<w:commentRangeStart w:id="1"/);
  assert.match(comments, /甲方名称待定/);
  assert.match(comments, /乙方待补/);
});

test("批注 · 表格单元格里的批注照样导出（表格走的是另一条分支）", async () => {
  const { document, comments } = await exportParts(
    [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                attrs: {},
                content: [para(anchored("单价", "c1"))],
              },
            ],
          },
        ],
      },
    ],
    { comments: [entry(0, "c1", "单价含税吗")] },
  );
  assert.equal(countOf(document, "commentRangeStart"), 1);
  assert.match(comments, /单价含税吗/);
});

// --- 反向：不该出现的东西没出现 ----------------------------------------------

test("相邻文字盖同一条批注时只开一段范围，不是每个 run 一段", async () => {
  // 加粗会把一段话切成两个 text 节点。每节点各开一段范围的话，
  // Word 里会显示成两个重复的批注气泡。
  const { document } = await exportParts(
    [
      para(
        anchored("违约", "c1"),
        anchored("金条款", "c1", [{ type: "bold" }]),
      ),
    ],
    { comments: [entry(0, "c1", "合并成一段")] },
  );
  assert.equal(countOf(document, "commentRangeStart"), 1);
  assert.equal(countOf(document, "commentRangeEnd"), 1);
  assert.equal(countOf(document, "commentReference"), 1);
});

test("锚点已被摘掉时批注不进部件（选了修订策略的那次导出）", async () => {
  // `applyRevisionExportChoice()` 会连 richdocComment 一起摘掉
  // （RICHDOC_REVIEW_MARKS 含它）。此时若照样写 comments 部件，
  // docx 里就是一条挂不上的批注 —— Word 判文件损坏。
  const { document, comments } = await exportParts([para(plain("违约金"))], {
    comments: [entry(0, "c1", "这条不该出现")],
  });
  assert.equal(countOf(document, "commentRangeStart"), 0);
  assert.equal(countOf(document, "commentReference"), 0);
  assert.doesNotMatch(comments, /这条不该出现/);
});

test("载荷里没有的批注即使正文还留着锚点也不开范围（已解决/孤儿被筛掉那档）", async () => {
  const { document } = await exportParts(
    [para(anchored("已谈妥", "resolved-1"))],
    { comments: [] },
  );
  assert.equal(countOf(document, "commentRangeStart"), 0);
  assert.equal(countOf(document, "commentRangeEnd"), 0);
});

test("每个 commentRangeStart 都有配对的 End —— 段落结束时范围一定收口", async () => {
  const { document } = await exportParts(
    [para(anchored("跨到段尾的一段话", "c1")), para(plain("下一段"))],
    { comments: [entry(0, "c1", "收口")] },
  );
  assert.equal(
    countOf(document, "commentRangeStart"),
    countOf(document, "commentRangeEnd"),
  );
  assert.equal(countOf(document, "commentRangeStart"), 1);
});

test("不传 comments 时正文不含任何批注痕迹（批注是加法，不改既有导出）", async () => {
  const content = [para(anchored("带锚点的文字", "c1")), para(plain("普通段落"))];
  const withoutOption = await exportParts(content, undefined);
  const withEmpty = await exportParts(content, { comments: [] });
  assert.equal(countOf(withoutOption.document, "commentRangeStart"), 0);
  assert.equal(countOf(withoutOption.document, "commentReference"), 0);
  // `docx@9.7.1` **总是**打出 `word/comments.xml`，没有批注时是个空的
  // `<w:comments/>` 壳子（实测）。所以判据是「里面一条 `w:comment` 都没有」，
  // 不是「这个文件不存在」——后者会把库的既有行为误当成回归。
  assert.equal(countOf(withoutOption.comments, "comment"), 0);
  assert.equal(countOf(withEmpty.comments, "comment"), 0);
  // 正文文字照常在，锚点 mark 不认识就该被忽略，而不是把整段吞掉。
  assert.match(withoutOption.document, /带锚点的文字/);
  assert.match(withoutOption.document, /普通段落/);
});
