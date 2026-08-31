// ============================================================================
// @oceanleo/ui — 富文档审阅层：四个 ProseMirror mark（批注锚点 + 三种修订）
// ----------------------------------------------------------------------------
// 为什么锚点用 mark 而不是节点或坐标表：
//   · mark 天然跟着 ProseMirror 的 mapping 漂移。在锚定文本前面插一段字，
//     锚点自己就跟着往后走，不需要任何监听、任何重算、任何 IndexedDB 索引。
//   · 节点会把光标挡在外面（同 `promptSlotNode.ts` 里 v15h 用 atom 被打回的教训）。
//
// 为什么 `richdocComment` 的 `excludes` 是空串：
//   ProseMirror 的规则是「同类型 mark 互斥」，除非该类型的 excludes 不含自己。
//   置空串 ⇒ 同一段文字上可以叠多条不同 commentId 的批注。合同评审里一句话被
//   法务和业务各批一条是常态，做不到重叠等于没做批注。
//
// 修订 mark 的 inclusive：
//   · 插入 mark `inclusive: true` —— 连续打字必须归成同一处修订，不然一句话
//     会碎成几十处「插入」，逐处接受就成了酷刑。
//   · 删除 / 格式 mark `inclusive: false` —— 在标记边界继续打字属于新内容，
//     不该被吸进既有的那处修订里。
// ============================================================================

import { Mark, mergeAttributes } from "@tiptap/core";

export const RICHDOC_COMMENT_MARK = "richdocComment";
export const RICHDOC_INSERTION_MARK = "richdocInsertion";
export const RICHDOC_DELETION_MARK = "richdocDeletion";
export const RICHDOC_FORMAT_MARK = "richdocFormatChange";

/** 三种修订 mark 的名字，顺序即 UI 里的呈现顺序。 */
export const RICHDOC_CHANGE_MARKS = [
  RICHDOC_INSERTION_MARK,
  RICHDOC_DELETION_MARK,
  RICHDOC_FORMAT_MARK,
] as const;

/** 审阅层引入的全部 mark；剥离纯净文档时按这张表清。 */
export const RICHDOC_REVIEW_MARKS = [
  RICHDOC_COMMENT_MARK,
  ...RICHDOC_CHANGE_MARKS,
] as const;

export type RichDocReviewMarkName = (typeof RICHDOC_REVIEW_MARKS)[number];

function attribution() {
  return {
    changeId: {
      default: "",
      parseHTML: (element: HTMLElement) =>
        element.getAttribute("data-change-id") || "",
      renderHTML: (attributes: Record<string, unknown>) =>
        attributes.changeId ? { "data-change-id": attributes.changeId } : {},
    },
    author: {
      default: "",
      parseHTML: (element: HTMLElement) =>
        element.getAttribute("data-author") || "",
      renderHTML: (attributes: Record<string, unknown>) =>
        attributes.author ? { "data-author": attributes.author } : {},
    },
    authorName: {
      default: "",
      parseHTML: (element: HTMLElement) =>
        element.getAttribute("data-author-name") || "",
      renderHTML: (attributes: Record<string, unknown>) =>
        attributes.authorName
          ? { "data-author-name": attributes.authorName }
          : {},
    },
    at: {
      default: "",
      parseHTML: (element: HTMLElement) => element.getAttribute("data-at") || "",
      renderHTML: (attributes: Record<string, unknown>) =>
        attributes.at ? { "data-at": attributes.at } : {},
    },
  };
}

/**
 * 批注锚点。attrs 里**只有一个 commentId**，没有作者、没有正文、没有时间——
 * 那些全在 sidecar 上。这不是省事，是「导出纯净文档时批注能干净剥离」的前提：
 * 正文树里没有任何批注语义可丢，剥离就只是删 mark。
 */
export const RichDocCommentMark = Mark.create({
  name: RICHDOC_COMMENT_MARK,
  // 同一段文字可叠多条批注。
  excludes: "",
  inclusive: false,
  // 段落被拆开时锚点跟着两半走，否则回车一下批注就断一半。
  keepOnSplit: true,

  addAttributes() {
    return {
      commentId: {
        default: "",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-comment-id") || "",
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes.commentId
            ? { "data-comment-id": attributes.commentId }
            : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-comment-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { class: "oleo-richdoc-comment" }),
      0,
    ];
  },
});

/** 插入：下划线着色，接受后只是把 mark 摘掉，文字原地不动。 */
export const RichDocInsertionMark = Mark.create({
  name: RICHDOC_INSERTION_MARK,
  excludes: "",
  inclusive: true,
  keepOnSplit: true,

  addAttributes() {
    return attribution();
  },

  parseHTML() {
    return [{ tag: "ins[data-change-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "ins",
      mergeAttributes(HTMLAttributes, { class: "oleo-richdoc-ins" }),
      0,
    ];
  },
});

/**
 * 删除：**文字不真删**，只盖删除线。接受这处修订时才真的移除。
 * 这是整份审阅层最容易做错的地方——真删了就没有「拒绝」可言了。
 */
export const RichDocDeletionMark = Mark.create({
  name: RICHDOC_DELETION_MARK,
  excludes: "",
  inclusive: false,
  keepOnSplit: true,

  addAttributes() {
    return attribution();
  },

  parseHTML() {
    return [{ tag: "del[data-change-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "del",
      mergeAttributes(HTMLAttributes, { class: "oleo-richdoc-del" }),
      0,
    ];
  },
});

/**
 * 格式变更：记下改之前与改之后的 mark 集合（JSON 串），拒绝时按 `before` 还原。
 * 不存 before 就没法拒绝，只能「接受或者手改回去」——那不叫修订。
 */
export const RichDocFormatChangeMark = Mark.create({
  name: RICHDOC_FORMAT_MARK,
  excludes: "",
  inclusive: false,
  keepOnSplit: true,

  addAttributes() {
    return {
      ...attribution(),
      before: {
        default: "[]",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-before") || "[]",
        renderHTML: (attributes: Record<string, unknown>) => ({
          "data-before": String(attributes.before ?? "[]"),
        }),
      },
      after: {
        default: "[]",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-after") || "[]",
        renderHTML: (attributes: Record<string, unknown>) => ({
          "data-after": String(attributes.after ?? "[]"),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-format-change]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-format-change": "1",
        class: "oleo-richdoc-fmt",
      }),
      0,
    ];
  },
});

/** 注册进编辑器的四个 mark。顺序无关，但保持与 `RICHDOC_REVIEW_MARKS` 一致便于对读。 */
export function richDocReviewExtensions() {
  return [
    RichDocCommentMark,
    RichDocInsertionMark,
    RichDocDeletionMark,
    RichDocFormatChangeMark,
  ];
}

/**
 * 审阅层的样式。不进 `rich-doc-model.ts` 的 `RICHDOC_CSS`（那是 W15 的面），
 * 由审阅侧栏自带一份 `<style>` 注入，谁用谁带，不给没开审阅的站增加字节。
 */
export const RICHDOC_REVIEW_CSS = `
.oleo-richdoc-comment{background:var(--leo-review-comment-bg,rgba(250,204,21,.28));border-bottom:2px solid var(--leo-review-comment-line,rgba(202,138,4,.65));border-radius:2px;cursor:pointer}
.oleo-richdoc-comment[data-review-active="1"]{background:var(--leo-review-comment-active,rgba(250,204,21,.55))}
.oleo-richdoc-ins{text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:2px;color:var(--leo-review-ins,#15803d);background:var(--leo-review-ins-bg,rgba(22,163,74,.1))}
.oleo-richdoc-del{text-decoration:line-through;text-decoration-thickness:2px;color:var(--leo-review-del,#b91c1c);background:var(--leo-review-del-bg,rgba(185,28,28,.1))}
.oleo-richdoc-fmt{background:var(--leo-review-fmt-bg,rgba(37,99,235,.12));border-bottom:1px dashed var(--leo-review-fmt,#1d4ed8)}
`;
