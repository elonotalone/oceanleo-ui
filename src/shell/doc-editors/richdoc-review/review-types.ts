// ============================================================================
// @oceanleo/ui — 富文档审阅层：纯数据模型与 sidecar 编解码（不依赖 ProseMirror）
// ----------------------------------------------------------------------------
// 这一层刻意不 import 任何 tiptap / prosemirror 符号，原因有二：
//   1. 批注的**内容**（作者、正文、回复线程、解决状态）永远不进正文节点树。
//      正文树里只留一个不含语义的锚点 mark（`richdocComment`，attrs 只有 commentId），
//      所有载荷挂在 sidecar 上。这一条决定了「导出纯净文档」能不能干净剥离——
//      剥离 = 删 mark + 丢 sidecar，正文一个字节都不用改写。
//   2. 纯数据层能在没有 schema、没有 DOM 的前提下被测，测试跑得起来也跑得快。
//
// sidecar 挂在哪：`tiptap-json@1` 工程档的**根对象兄弟字段** `review`。
// 不是新 schema，是既有 schema 的加字段——ProseMirror 的 `Node.fromJSON` 只读
// `type/attrs/content/marks/text`，多出来的键被忽略，所以老版本读同一份工程档
// 仍然拿到一模一样的文档，只是看不见批注。`RICHDOC_PROJECT_SCHEMA` 版本号不动。
// ============================================================================

/** 三种修订：插入、删除、格式变更。 */
export type RichDocChangeKind = "insertion" | "deletion" | "format";

export interface RichDocAttribution {
  /** 稳定作者 id（登录态用户 id；离线时用会话 id）。 */
  author: string;
  /** 展示名，允许为空——空名不该挡住审阅。 */
  authorName: string;
}

export interface RichDocCommentReply extends RichDocAttribution {
  id: string;
  createdAt: string;
  body: string;
}

/**
 * 落盘形态。**刻意不存 range**：范围是从正文里的锚点 mark 现算出来的。
 * 存下来的范围在下一次编辑后就是假的，存它等于把漂移这件事做错。
 */
export interface RichDocCommentRecord extends RichDocAttribution {
  id: string;
  createdAt: string;
  body: string;
  resolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
  replies: RichDocCommentReply[];
  /** 建批注那一刻锚定文本的快照。锚点没了以后，它是用户认回这条批注的唯一线索。 */
  quotedText: string;
  /** 锚定文本被删光 ⇒ 孤儿。永远不静默丢，只标记。 */
  orphaned: boolean;
  orphanedAt?: string;
}

/** 运行时形态 = 落盘形态 + 现算出来的范围（孤儿为 null）。 */
export interface RichDocCommentView extends RichDocCommentRecord {
  range: { from: number; to: number } | null;
  /** 当前正文里锚点覆盖的文字；孤儿时为空串。 */
  anchorText: string;
}

export interface RichDocReviewSidecar {
  version: 1;
  comments: RichDocCommentRecord[];
  /** 修订模式开关本身也要持久化：换台机器打开还应是开着的。 */
  trackChangesEnabled: boolean;
}

export const RICHDOC_REVIEW_SIDECAR_KEY = "review";
export const RICHDOC_REVIEW_SIDECAR_VERSION = 1 as const;

export function emptyReviewSidecar(): RichDocReviewSidecar {
  return {
    version: RICHDOC_REVIEW_SIDECAR_VERSION,
    comments: [],
    trackChangesEnabled: false,
  };
}

export function isReviewSidecarEmpty(sidecar: RichDocReviewSidecar): boolean {
  return sidecar.comments.length === 0 && !sidecar.trackChangesEnabled;
}

function boundedString(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function readReply(value: unknown): RichDocCommentReply | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = boundedString(raw.id, 120);
  if (!id) return null;
  return {
    id,
    author: boundedString(raw.author, 120),
    authorName: boundedString(raw.authorName, 200),
    createdAt: boundedString(raw.createdAt, 40),
    body: boundedString(raw.body, 20_000),
  };
}

function readComment(value: unknown): RichDocCommentRecord | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = boundedString(raw.id, 120);
  if (!id) return null;
  const replies = Array.isArray(raw.replies)
    ? raw.replies
        .slice(0, 500)
        .map(readReply)
        .filter((reply): reply is RichDocCommentReply => reply !== null)
    : [];
  const record: RichDocCommentRecord = {
    id,
    author: boundedString(raw.author, 120),
    authorName: boundedString(raw.authorName, 200),
    createdAt: boundedString(raw.createdAt, 40),
    body: boundedString(raw.body, 20_000),
    resolved: raw.resolved === true,
    replies,
    quotedText: boundedString(raw.quotedText, 2_000),
    orphaned: raw.orphaned === true,
  };
  const resolvedAt = boundedString(raw.resolvedAt, 40);
  if (resolvedAt) record.resolvedAt = resolvedAt;
  const resolvedBy = boundedString(raw.resolvedBy, 120);
  if (resolvedBy) record.resolvedBy = resolvedBy;
  const orphanedAt = boundedString(raw.orphanedAt, 40);
  if (orphanedAt) record.orphanedAt = orphanedAt;
  return record;
}

/**
 * 从任意来源的载荷里把 sidecar 读出来，坏数据一律降级成空 sidecar 而不是抛。
 * 审阅数据坏掉不该让用户连文档都打不开。
 */
export function readReviewSidecar(payload: unknown): RichDocReviewSidecar {
  if (!payload || typeof payload !== "object") return emptyReviewSidecar();
  const container = payload as Record<string, unknown>;
  const raw = container[RICHDOC_REVIEW_SIDECAR_KEY];
  if (!raw || typeof raw !== "object") return emptyReviewSidecar();
  const source = raw as Record<string, unknown>;
  const comments = Array.isArray(source.comments)
    ? source.comments
        .slice(0, 5_000)
        .map(readComment)
        .filter((comment): comment is RichDocCommentRecord => comment !== null)
    : [];
  return {
    version: RICHDOC_REVIEW_SIDECAR_VERSION,
    comments,
    trackChangesEnabled: source.trackChangesEnabled === true,
  };
}

/** 去掉 sidecar 字段，返回不含审阅载荷的正文工程档。 */
export function stripReviewSidecar<T extends object>(doc: T): T {
  if (!(RICHDOC_REVIEW_SIDECAR_KEY in doc)) return doc;
  const clone = { ...doc } as Record<string, unknown>;
  delete clone[RICHDOC_REVIEW_SIDECAR_KEY];
  return clone as T;
}

/**
 * 把 sidecar 挂到工程档根对象上。**空 sidecar 原样返回**——没有审阅数据的文档
 * 与本次改动之前逐字节相同，这是不给 31 个站添无谓 diff 的最低要求。
 */
export function attachReviewSidecar<T extends object>(
  doc: T,
  sidecar: RichDocReviewSidecar,
): T {
  if (isReviewSidecarEmpty(sidecar)) return stripReviewSidecar(doc);
  return { ...doc, [RICHDOC_REVIEW_SIDECAR_KEY]: sidecar };
}

let reviewIdCounter = 0;

/** 不引 uuid：`crypto.randomUUID` 有就用，没有就退回单调计数 + 随机后缀。 */
export function createReviewId(prefix: string): string {
  const globalCrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (globalCrypto && typeof globalCrypto.randomUUID === "function") {
    return `${prefix}-${globalCrypto.randomUUID()}`;
  }
  reviewIdCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${reviewIdCounter.toString(
    36,
  )}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface CreateCommentInput extends RichDocAttribution {
  body: string;
  quotedText: string;
  id?: string;
  createdAt?: string;
}

export function createCommentRecord(
  input: CreateCommentInput,
): RichDocCommentRecord {
  return {
    id: input.id || createReviewId("cmt"),
    author: input.author,
    authorName: input.authorName,
    createdAt: input.createdAt || new Date().toISOString(),
    body: input.body,
    resolved: false,
    replies: [],
    quotedText: input.quotedText.slice(0, 2_000),
    orphaned: false,
  };
}

function replaceComment(
  sidecar: RichDocReviewSidecar,
  id: string,
  update: (comment: RichDocCommentRecord) => RichDocCommentRecord,
): RichDocReviewSidecar {
  let touched = false;
  const comments = sidecar.comments.map((comment) => {
    if (comment.id !== id) return comment;
    touched = true;
    return update(comment);
  });
  return touched ? { ...sidecar, comments } : sidecar;
}

export function addCommentToSidecar(
  sidecar: RichDocReviewSidecar,
  comment: RichDocCommentRecord,
): RichDocReviewSidecar {
  return { ...sidecar, comments: [...sidecar.comments, comment] };
}

export function addReplyToSidecar(
  sidecar: RichDocReviewSidecar,
  commentId: string,
  input: RichDocAttribution & { body: string; id?: string; createdAt?: string },
): RichDocReviewSidecar {
  return replaceComment(sidecar, commentId, (comment) => ({
    ...comment,
    replies: [
      ...comment.replies,
      {
        id: input.id || createReviewId("rpl"),
        author: input.author,
        authorName: input.authorName,
        createdAt: input.createdAt || new Date().toISOString(),
        body: input.body,
      },
    ],
  }));
}

export function setCommentResolved(
  sidecar: RichDocReviewSidecar,
  commentId: string,
  resolved: boolean,
  by: string,
  at: string = new Date().toISOString(),
): RichDocReviewSidecar {
  return replaceComment(sidecar, commentId, (comment) => {
    if (resolved) {
      return { ...comment, resolved: true, resolvedAt: at, resolvedBy: by };
    }
    const reopened: RichDocCommentRecord = { ...comment, resolved: false };
    delete reopened.resolvedAt;
    delete reopened.resolvedBy;
    return reopened;
  });
}

/** 删批注 = 从 sidecar 移除；正文里的锚点 mark 由调用方在同一事务里摘掉。 */
export function removeCommentFromSidecar(
  sidecar: RichDocReviewSidecar,
  commentId: string,
): RichDocReviewSidecar {
  const comments = sidecar.comments.filter(
    (comment) => comment.id !== commentId,
  );
  return comments.length === sidecar.comments.length
    ? sidecar
    : { ...sidecar, comments };
}

export function setTrackChangesEnabled(
  sidecar: RichDocReviewSidecar,
  enabled: boolean,
): RichDocReviewSidecar {
  return sidecar.trackChangesEnabled === enabled
    ? sidecar
    : { ...sidecar, trackChangesEnabled: enabled };
}
