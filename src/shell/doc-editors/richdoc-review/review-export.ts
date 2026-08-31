// ============================================================================
// @oceanleo/ui — 富文档审阅层：导出前的取舍闸口与 docx 载荷
// ----------------------------------------------------------------------------
// 这一层要防的是一件具体的坏事：**用户把带删除线的内容当成正文发出去。**
// 屏幕上那段字是灰的、划掉的，用户以为「已经删了」；可 docx 导出如果只是
// 照着当前节点树写，划掉的字会变成一句普普通通的正文，跟着合同发给对方。
// 所以导出链路上有未处理的修订时，**必须让调用方明确选一条策略**，
// 不许按当前显示状态默默导出。这条是任务书 P4 的明文要求。
//
// 为什么这一层走 **tiptap JSON** 而不是 ProseMirror 文档：
// `tiptapJsonToDocxBlob(title, editor.getJSON())` 吃的就是 JSON，
// 在 JSON 上做取舍不需要 EditorState、不动编辑器里的文档（导出不该有副作用），
// 也让「导出预览」这类只读用法天然安全。
//
// 交互式的逐处接受/拒绝在 `track-changes.ts` 里走真事务（那里需要可撤销）。
// 两条路共用同一张语义表，`tests/richdoc-track-changes.test.mjs` 有一条
// 专门断言两者对同一份文档给出相同正文——语义表在两个地方实现，就必须锁在一起。
// ============================================================================

import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  RICHDOC_COMMENT_MARK,
  RICHDOC_DELETION_MARK,
  RICHDOC_FORMAT_MARK,
  RICHDOC_INSERTION_MARK,
  RICHDOC_REVIEW_MARKS,
} from "./review-marks";
import { listChanges } from "./track-changes";
import type {
  RichDocCommentRecord,
  RichDocReviewSidecar,
} from "./review-types";
import { commentViews } from "./review-anchors";

/**
 * `docx-export.ts` 是否已经接上 `w:comment`。
 *
 * **今天是 false**：裁定 R1 把 `docx-export.ts` 判归 `W15`，接线不在本份活的面上
 * （请求已写进 `signals/W14-request.md`）。false 时导出摘要会明确告知
 * 「批注不会进 docx」——任务书 P4 允许「不支持则明确告知会丢失」，
 * 但不允许静默丢。W15 接完线把这个常量翻成 true，摘要与提示自动跟着变。
 */
export const DOCX_COMMENTS_WIRED = false;

/** 保留标记导出时，插入/删除翻成什么颜色。与屏幕上的 CSS 同色，用户对得上。 */
const KEEP_MARKUP_INSERTION_COLOR = "#15803d";
const KEEP_MARKUP_DELETION_COLOR = "#b91c1c";

export type RevisionExportChoice = "accept-all" | "reject-all" | "keep-markup";

export interface ReviewExportSummary {
  insertions: number;
  deletions: number;
  formatChanges: number;
  /** 未处理的修订**处数**（按 changeId 计，不是字数）。 */
  pendingChanges: number;
  openComments: number;
  resolvedComments: number;
  orphanedComments: number;
  /** 有未处理修订 ⇒ 导出前必须拿到一个明确的策略。 */
  requiresDecision: boolean;
  /** 有批注、而 docx 侧还没接线 ⇒ 导出会丢批注，必须告知。 */
  commentsWillBeLost: boolean;
}

export interface SummarizeOptions {
  docxCommentsWired?: boolean;
}

/**
 * 统计这份文档在导出面前的状态。
 * 读 ProseMirror 文档（编辑器手上就有一份）而不是 JSON：修订处数要按 changeId
 * 归并，`listChanges` 已经把归并做对了，重写一遍只会多一处会漂移的实现。
 */
export function summarizeReviewForExport(
  doc: ProseMirrorNode,
  sidecar: RichDocReviewSidecar,
  options: SummarizeOptions = {},
): ReviewExportSummary {
  const changes = listChanges(doc);
  let insertions = 0;
  let deletions = 0;
  let formatChanges = 0;
  for (const change of changes) {
    if (change.kind === "insertion") insertions += 1;
    else if (change.kind === "deletion") deletions += 1;
    else formatChanges += 1;
  }
  const views = commentViews(doc, sidecar);
  let openComments = 0;
  let resolvedComments = 0;
  let orphanedComments = 0;
  for (const view of views) {
    if (view.resolved) resolvedComments += 1;
    else openComments += 1;
    if (view.orphaned) orphanedComments += 1;
  }
  const wired = options.docxCommentsWired ?? DOCX_COMMENTS_WIRED;
  return {
    insertions,
    deletions,
    formatChanges,
    pendingChanges: changes.length,
    openComments,
    resolvedComments,
    orphanedComments,
    requiresDecision: changes.length > 0,
    commentsWillBeLost: !wired && views.length > 0,
  };
}

/**
 * 导出闸口。返回空串表示可以导出；否则返回该报给用户的话。
 *
 * **有未处理修订而调用方没给策略时一律拦下。** 这不是保守：
 * 「按当前显示状态导出」会把划掉的内容写成正文，是任务书点名的那个坑。
 */
export function reviewExportBlockMessage(
  summary: ReviewExportSummary,
  choice: RevisionExportChoice | null | undefined,
): string {
  if (!summary.requiresDecision || choice) return "";
  const parts: string[] = [];
  if (summary.insertions) parts.push(`${summary.insertions} 处插入`);
  if (summary.deletions) parts.push(`${summary.deletions} 处删除`);
  if (summary.formatChanges) parts.push(`${summary.formatChanges} 处格式变更`);
  return `这份文档还有${parts.join("、")}未处理。导出前请选择：接受全部、拒绝全部，或保留修订标记导出。`;
}

/** 导出会丢批注时该告知用户的话；不丢就返回空串。 */
export function reviewExportCommentNotice(
  summary: ReviewExportSummary,
): string {
  if (!summary.commentsWillBeLost) return "";
  const total = summary.openComments + summary.resolvedComments;
  return `本次 DOCX 导出不含批注（共 ${total} 条），批注只保存在可编辑工程档里。`;
}

// ── JSON 侧：三条导出策略 ─────────────────────────────────────────────────────

interface JsonMark {
  type?: string;
  attrs?: Record<string, unknown>;
}

interface JsonNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: JsonMark[];
  content?: JsonNode[];
}

const REVIEW_MARK_NAMES = new Set<string>(RICHDOC_REVIEW_MARKS);

function hasMark(node: JsonNode, name: string): boolean {
  return (node.marks || []).some((mark) => mark.type === name);
}

function findMark(node: JsonNode, name: string): JsonMark | undefined {
  return (node.marks || []).find((mark) => mark.type === name);
}

function withoutReviewMarks(marks: JsonMark[] | undefined): JsonMark[] {
  return (marks || []).filter(
    (mark) => !REVIEW_MARK_NAMES.has(String(mark.type || "")),
  );
}

function parseBeforeMarks(raw: unknown): JsonMark[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw ?? "[]"));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (entry): entry is JsonMark =>
      Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
  );
}

function setMarks(node: JsonNode, marks: JsonMark[]): JsonNode {
  const next: JsonNode = { ...node };
  if (marks.length) next.marks = marks;
  else delete next.marks;
  return next;
}

/** `null` 表示这个节点在本策略下不进导出（被删掉）。 */
type NodeMapper = (node: JsonNode) => JsonNode | null;

function mapTree(node: JsonNode, mapNode: NodeMapper): JsonNode | null {
  const mapped = mapNode(node);
  if (!mapped) return null;
  if (!Array.isArray(mapped.content)) return mapped;
  const content: JsonNode[] = [];
  for (const child of mapped.content) {
    const next = mapTree(child, mapNode);
    if (next) content.push(next);
  }
  return { ...mapped, content };
}

/**
 * 接受全部：**删除标记的内容真的不进导出**，插入与格式标记只是摘掉标记，
 * 内容与格式留下。等价于 `acceptAllChanges` 的结果。
 */
function acceptAllInJson(node: JsonNode): JsonNode | null {
  if (hasMark(node, RICHDOC_DELETION_MARK)) return null;
  return setMarks(node, withoutReviewMarks(node.marks));
}

/**
 * 拒绝全部：**插入标记的内容不进导出**；格式标记按 `before` 还原；
 * 删除标记只是摘掉标记，内容留下。等价于 `rejectAllChanges` 的结果。
 */
function rejectAllInJson(node: JsonNode): JsonNode | null {
  if (hasMark(node, RICHDOC_INSERTION_MARK)) return null;
  const format = findMark(node, RICHDOC_FORMAT_MARK);
  if (format) {
    // `before` 是改动前的**全部**非审阅 mark，直接整组换回去，
    // 不是「减掉这次加的那一个」——一次格式修改可能同时加了几个、去了几个。
    return setMarks(node, parseBeforeMarks(format.attrs?.before));
  }
  return setMarks(node, withoutReviewMarks(node.marks));
}

/**
 * 保留标记：把审阅 mark **翻译**成 `docx-export.ts` 白名单里认识的 mark。
 *
 * 必须翻译，不能原样丢过去：那份白名单只认
 * `bold/italic/underline/strike/code/highlight/textStyle/link`，
 * 遇到 `richdocInsertion` 会**静默跳过**——用户选了「保留标记导出」，
 * 拿到的却是一份没有任何标记的文档，是三条策略里最坏的一种失败。
 *
 * 映射（颜色与屏幕上的 CSS 同色，用户对得上）：
 *   · 插入 → `underline` + `textStyle{color:绿}`
 *   · 删除 → `strike`    + `textStyle{color:红}`
 *   · 格式变更 → **只摘标记**。docx 里没有「这段格式被改过」的行内表示，
 *     结果是新格式照常导出、但看不出它被改过。这是本轮明确的缩小承诺。
 */
function keepMarkupInJson(node: JsonNode): JsonNode | null {
  const isInsertion = hasMark(node, RICHDOC_INSERTION_MARK);
  const isDeletion = hasMark(node, RICHDOC_DELETION_MARK);
  const marks = withoutReviewMarks(node.marks);
  if (!isInsertion && !isDeletion) return setMarks(node, marks);
  // 同一段字既是插入又被删除（有人提议加、又有人提议去掉）：删除线优先，
  // 因为它是更新的那个意见，也是更保守的呈现。
  const color = isDeletion
    ? KEEP_MARKUP_DELETION_COLOR
    : KEEP_MARKUP_INSERTION_COLOR;
  const decorated = marks.filter(
    (mark) => mark.type !== "textStyle" && mark.type !== "underline" && mark.type !== "strike",
  );
  const carriedTextStyle = marks.find((mark) => mark.type === "textStyle");
  decorated.push({
    type: "textStyle",
    attrs: { ...(carriedTextStyle?.attrs || {}), color },
  });
  decorated.push(isDeletion ? { type: "strike" } : { type: "underline" });
  return setMarks(node, decorated);
}

/**
 * 按选定策略把 tiptap JSON 变成可以交给 `tiptapJsonToDocxBlob` 的正文。
 * 纯函数，不改入参。
 */
export function applyRevisionExportChoice<T extends object>(
  json: T,
  choice: RevisionExportChoice,
): T {
  const mapper =
    choice === "accept-all"
      ? acceptAllInJson
      : choice === "reject-all"
        ? rejectAllInJson
        : keepMarkupInJson;
  const result = mapTree(json as JsonNode, mapper);
  // 根节点自己永远不带审阅 mark，所以 mapTree 不会把整份文档判成 null；
  // 真出现了就退回原文，宁可导出多余标记也不要交一份空文档。
  return (result ?? json) as T;
}

/**
 * 摘掉全部审阅 mark，正文一个字不动。
 * 「导出纯净文档」= 这个 + `stripReviewSidecar`。批注载荷从来不在正文树里，
 * 所以剥离就只是删 mark——这正是把载荷放进 sidecar 换来的性质。
 */
export function stripReviewMarks<T extends object>(json: T): T {
  const result = mapTree(json as JsonNode, (node) =>
    setMarks(node, withoutReviewMarks(node.marks)),
  );
  return (result ?? json) as T;
}

/** 正文树里还残留审阅 mark 吗。测试用它证明剥离干净。 */
export function countReviewMarksInJson(json: object): number {
  let count = 0;
  const walk = (node: JsonNode) => {
    for (const mark of node.marks || []) {
      if (REVIEW_MARK_NAMES.has(String(mark.type || ""))) count += 1;
    }
    for (const child of node.content || []) walk(child);
  };
  walk(json as JsonNode);
  return count;
}

// ── docx 批注载荷（给 W15 接线用） ───────────────────────────────────────────

/**
 * 一条批注在 docx 侧需要的全部东西，**已经是 ready-to-use 的纯数据**。
 * 刻意不 import `docx`：那个文件归 `W15`（裁定 R1），而且这一层
 * 不该因为要拼一段载荷就把 700KB 的 docx 拖进审阅层的依赖图。
 */
export interface DocxCommentEntry {
  /** docx 要的数字 id，从 0 连续排。 */
  id: number;
  /** sidecar 里的批注 id，回查用。 */
  commentId: string;
  author: string;
  initials: string;
  /** ISO 串；W15 侧 `new Date(date)` 即可。 */
  date: string;
  /** 批注正文 + 回复，每条一段。已经按 docx 的 `Paragraph` 粒度切好。 */
  paragraphs: string[];
  /** 建批注时锚定的文字快照，孤儿批注靠它让读者认回位置。 */
  quotedText: string;
  resolved: boolean;
  orphaned: boolean;
  /** 正文里的现算范围；孤儿为 null。 */
  range: { from: number; to: number } | null;
}

export interface DocxCommentPayload {
  entries: DocxCommentEntry[];
  /** 有几条批注因为锚点已被删除而没有可挂的范围。 */
  orphanedCount: number;
}

function initialsOf(record: RichDocCommentRecord): string {
  const name = (record.authorName || record.author || "").trim();
  if (!name) return "?";
  // 中文名取末字（「张三」→「三」不对，取首字更常见），西文取每词首字母。
  if (/^[\u4e00-\u9fa5]/.test(name)) return name.slice(0, 1);
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.slice(0, 1).toUpperCase())
      .join("") || "?"
  );
}

/**
 * 把 sidecar 里的批注拼成 docx 侧可直接用的载荷。
 *
 * `W15` 在 `docx-export.ts` 里要做的只是把 `entries` 映成
 * `new Comment({ id, author, initials, date: new Date(date), children:
 * paragraphs.map((t) => new Paragraph(t)) })`，再在对应 run 前后插
 * `CommentRangeStart/End` 与 `CommentReference`。
 * 已解决与孤儿的批注默认**不**进导出：解决过的意见不该出现在发出去的稿子里，
 * 孤儿没有可挂的范围。两者都可以用 options 打开。
 */
export function buildDocxCommentPayload(
  doc: ProseMirrorNode,
  sidecar: RichDocReviewSidecar,
  options: { includeResolved?: boolean; includeOrphaned?: boolean } = {},
): DocxCommentPayload {
  const views = commentViews(doc, sidecar);
  const entries: DocxCommentEntry[] = [];
  let orphanedCount = 0;
  for (const view of views) {
    if (view.orphaned) orphanedCount += 1;
    if (view.resolved && !options.includeResolved) continue;
    // 判据是「有没有可挂的范围」，不是 sidecar 上那个 `orphaned` 布尔值：
    // 结算（`reconcileCommentSidecar`）还没跑过时那个标志是陈旧的，
    // 而 `range === null` 是现算的事实。W15 侧拿到 null 范围没处插
    // `CommentRangeStart`，宁可不给也不要给一条挂不上的。
    if (!view.range && !options.includeOrphaned) continue;
    if (view.orphaned && !options.includeOrphaned) continue;
    entries.push({
      id: entries.length,
      commentId: view.id,
      author: view.authorName || view.author,
      initials: initialsOf(view),
      date: view.createdAt,
      paragraphs: [
        view.body,
        ...view.replies.map(
          (reply) => `${reply.authorName || reply.author}: ${reply.body}`,
        ),
      ].filter((text) => text.trim().length > 0),
      quotedText: view.quotedText,
      resolved: view.resolved,
      orphaned: view.orphaned,
      range: view.range,
    });
  }
  return { entries, orphanedCount };
}

/** 正文里带批注锚点的范围，`W15` 拿它决定 `CommentRangeStart/End` 插在哪。 */
export function commentAnchorMarkName(): string {
  return RICHDOC_COMMENT_MARK;
}
