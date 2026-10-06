// ============================================================================
// @oceanleo/ui — 富文档审阅层 · 多人同改（work-chat F09）：评论进共享文档
// ----------------------------------------------------------------------------
// 正文走协同扩展（`oceanleo:richdoc`）；批注的**划线位置**是正文里的 mark，会跟着
// 同步，但批注的**内容**（作者、正文、回复、已解决）原本只在本机 sidecar 里。
// 这个文件把后者也放进同一个房间的两个根类型里：
//
//   `oceanleo:richdoc-review`       Y.Map：批注 id → Y.Map（一条批注一项）
//        └ replies                  Y.Map：回复 id → 回复（一条回复一项）
//   `oceanleo:richdoc-review-meta`  Y.Map：`seeded`（工程档里的批注灌过了）、
//                                   `trackChanges`（修订开关）
//
// 为什么这么分：
//   - 批注按 id 存、回复按回复 id 存：两个人同时回复同一条，写的是两个不同的键，
//     两条都在；甲解决、乙回复也是不同的键，互不覆盖。
//   - 两个根都是**根类型**而不是嵌在别的 Map 里的子 Map：两个客户端同时「第一次
//     创建」同一个嵌套 Map，Yjs 只留一个、另一个里面的内容整个丢掉；根类型不会。
//   - 孤儿状态（orphaned / orphanedAt）**不进共享**：它由正文推出来，两边正文一致，
//     各自用 `reconcileCommentSidecar` 算出来的结果就一致；写进共享反而会在
//     「标记先于记录到达」的瞬间把一条临时孤儿传给所有人。
//
// 本文件不依赖 React、不依赖 ProseMirror 实例，Node 单测直接加载。
// ============================================================================

import * as Y from "yjs";

import {
  RICHDOC_REVIEW_SIDECAR_VERSION,
  readReviewComment,
  type RichDocCommentRecord,
  type RichDocCommentReply,
  type RichDocReviewSidecar,
} from "./review-types";

export const RICHDOC_REVIEW_COLLAB_FIELD = "oceanleo:richdoc-review";
export const RICHDOC_REVIEW_COLLAB_META_FIELD = "oceanleo:richdoc-review-meta";

const MAX_COMMENTS = 5_000;
const MAX_REPLIES = 500;

type Rec = Record<string, unknown>;

// ── 读：共享文档 → 批注列表 ─────────────────────────────────────────────────

export interface SharedReviewState {
  /** 按创建时间、id 排好序：两个客户端读出来的顺序一致。 */
  comments: RichDocCommentRecord[];
  /** 共享里有没有记录过修订开关；没记录过就不覆盖本地的值。 */
  trackChangesEnabled: boolean | null;
  /** 工程档里的批注已经灌进来过。 */
  seeded: boolean;
}

function isRec(value: unknown): value is Rec {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function compareByTime(
  left: { createdAt: string; id: string },
  right: { createdAt: string; id: string },
): number {
  if (left.createdAt !== right.createdAt) {
    return left.createdAt < right.createdAt ? -1 : 1;
  }
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function commentsRoot(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap(RICHDOC_REVIEW_COLLAB_FIELD);
}

function metaRoot(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap(RICHDOC_REVIEW_COLLAB_META_FIELD);
}

function readSharedComment(id: string, value: unknown): RichDocCommentRecord | null {
  const json = value instanceof Y.Map ? (value.toJSON() as Rec) : null;
  if (!json) return null;
  const rawReplies = isRec(json.replies) ? json.replies : {};
  const replies = Object.keys(rawReplies)
    .map((replyId): Rec | null => {
      const raw = rawReplies[replyId];
      return isRec(raw) ? { ...raw, id: replyId } : null;
    })
    .filter((raw): raw is Rec => raw !== null)
    .slice(0, MAX_REPLIES * 2)
    .map((raw) => readReviewComment({ ...raw, replies: [], quotedText: "" }))
    .filter((reply): reply is RichDocCommentRecord => reply !== null)
    .map(
      (reply): RichDocCommentReply => ({
        id: reply.id,
        author: reply.author,
        authorName: reply.authorName,
        createdAt: reply.createdAt,
        body: reply.body,
      }),
    )
    .sort(compareByTime)
    .slice(0, MAX_REPLIES);
  // 键就是批注 id；记录里的 id 字段若与键不符，以键为准。
  return readReviewComment({ ...json, id, replies, orphaned: false });
}

/** 读出共享里的全部批注与设置。坏数据降级成「没有这一条」，不抛。 */
export function readSharedReview(doc: Y.Doc): SharedReviewState {
  const root = commentsRoot(doc);
  const comments: RichDocCommentRecord[] = [];
  root.forEach((value, id) => {
    if (comments.length >= MAX_COMMENTS) return;
    const record = readSharedComment(id, value);
    if (record) comments.push(record);
  });
  comments.sort(compareByTime);
  const meta = metaRoot(doc);
  const track = meta.get("trackChanges");
  return {
    comments,
    trackChangesEnabled: typeof track === "boolean" ? track : null,
    seeded: meta.get("seeded") === true,
  };
}

// ── 写：本地变化 → 共享文档 ─────────────────────────────────────────────────

function replyPayload(reply: RichDocCommentReply): Rec {
  return {
    author: reply.author,
    authorName: reply.authorName,
    createdAt: reply.createdAt,
    body: reply.body,
  };
}

function buildSharedComment(comment: RichDocCommentRecord): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  map.set("author", comment.author);
  map.set("authorName", comment.authorName);
  map.set("createdAt", comment.createdAt);
  map.set("body", comment.body);
  map.set("quotedText", comment.quotedText);
  map.set("resolved", comment.resolved);
  if (comment.resolvedAt) map.set("resolvedAt", comment.resolvedAt);
  if (comment.resolvedBy) map.set("resolvedBy", comment.resolvedBy);
  const replies = new Y.Map<unknown>();
  for (const reply of comment.replies) replies.set(reply.id, replyPayload(reply));
  map.set("replies", replies);
  return map;
}

function setOrDelete(map: Y.Map<unknown>, key: string, value: string | undefined) {
  if (value) {
    if (map.get(key) !== value) map.set(key, value);
  } else if (map.has(key)) {
    map.delete(key);
  }
}

/** 一条批注里被改过的字段与新增/删除的回复写进共享（只写变化的键）。 */
function patchSharedComment(
  map: Y.Map<unknown>,
  prev: RichDocCommentRecord,
  next: RichDocCommentRecord,
) {
  if (prev.body !== next.body) map.set("body", next.body);
  // 只写本地真改过的键：没动「已解决」就不去碰它，别人刚解决的不会被一条回复冲掉。
  if (prev.resolved !== next.resolved) map.set("resolved", next.resolved);
  if (prev.resolvedAt !== next.resolvedAt) setOrDelete(map, "resolvedAt", next.resolvedAt);
  if (prev.resolvedBy !== next.resolvedBy) setOrDelete(map, "resolvedBy", next.resolvedBy);
  let replies = map.get("replies");
  if (!(replies instanceof Y.Map)) {
    // 老数据没有 replies 子表：补一个。只有这里会「创建」子 Map，且只在它缺失时。
    replies = new Y.Map<unknown>();
    map.set("replies", replies);
  }
  const sharedReplies = replies as Y.Map<unknown>;
  const prevIds = new Set(prev.replies.map((reply) => reply.id));
  const nextIds = new Set(next.replies.map((reply) => reply.id));
  for (const reply of next.replies) {
    if (!prevIds.has(reply.id) && !sharedReplies.has(reply.id)) {
      sharedReplies.set(reply.id, replyPayload(reply));
    }
  }
  for (const reply of prev.replies) {
    if (!nextIds.has(reply.id) && sharedReplies.has(reply.id)) {
      sharedReplies.delete(reply.id);
    }
  }
}

/**
 * 把「本地从 prev 变成 next」翻译成对共享文档的写入（调用方包在一次事务里）。
 * 只写**本地改动的那部分**，不是把共享整体改成本地的样子：别人刚到的批注、
 * 刚发的回复不会被一次本地提交冲掉。
 */
export function writeSidecarChange(
  doc: Y.Doc,
  prev: RichDocReviewSidecar,
  next: RichDocReviewSidecar,
): void {
  const root = commentsRoot(doc);
  const prevById = new Map(prev.comments.map((comment) => [comment.id, comment]));
  const nextById = new Map(next.comments.map((comment) => [comment.id, comment]));
  for (const id of prevById.keys()) {
    if (!nextById.has(id) && root.has(id)) root.delete(id);
  }
  for (const [id, comment] of nextById) {
    const before = prevById.get(id);
    if (!before) {
      // 同一 id 已经在共享里（播种撞上、重复提交）：不覆盖，保住别人写在上面的东西。
      if (!root.has(id)) root.set(id, buildSharedComment(comment));
      continue;
    }
    const shared = root.get(id);
    // 共享里已经没有这一条（对方先删了）：本地的解决/回复落空，不复活它。
    if (!(shared instanceof Y.Map)) continue;
    patchSharedComment(shared, before, comment);
  }
  if (prev.trackChangesEnabled !== next.trackChangesEnabled) {
    metaRoot(doc).set("trackChanges", next.trackChangesEnabled);
  }
}

/** 首次播种：把工程档里的批注灌进共享，按批注 id 幂等，最后立 `seeded`。 */
export function seedSharedReview(doc: Y.Doc, sidecar: RichDocReviewSidecar): void {
  const root = commentsRoot(doc);
  for (const comment of sidecar.comments) {
    if (!root.has(comment.id)) root.set(comment.id, buildSharedComment(comment));
  }
  const meta = metaRoot(doc);
  if (meta.get("trackChanges") === undefined) {
    meta.set("trackChanges", sidecar.trackChangesEnabled);
  }
  meta.set("seeded", true);
}

// ── 共享 → 本地 ─────────────────────────────────────────────────────────────

function sameReplies(left: RichDocCommentReply[], right: RichDocCommentReply[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((reply, index) => {
    const other = right[index];
    return (
      reply.id === other.id &&
      reply.author === other.author &&
      reply.authorName === other.authorName &&
      reply.createdAt === other.createdAt &&
      reply.body === other.body
    );
  });
}

/** 比较两条批注，**不看**孤儿相关的两个字段（它们是本地由正文推出来的）。 */
export function sameSharedFields(
  left: RichDocCommentRecord,
  right: RichDocCommentRecord,
): boolean {
  return (
    left.id === right.id &&
    left.author === right.author &&
    left.authorName === right.authorName &&
    left.createdAt === right.createdAt &&
    left.body === right.body &&
    left.quotedText === right.quotedText &&
    left.resolved === right.resolved &&
    (left.resolvedAt || "") === (right.resolvedAt || "") &&
    (left.resolvedBy || "") === (right.resolvedBy || "") &&
    sameReplies(left.replies, right.replies)
  );
}

/**
 * 把共享状态套到本地 sidecar 上。共享里没有的批注就是被别人删了；孤儿标记沿用本地的
 * （之后由 reconcile 按正文重算）。内容没变化时**原样返回同一个引用**，让 React 空转。
 */
export function mergeSharedIntoSidecar(
  local: RichDocReviewSidecar,
  shared: SharedReviewState,
): RichDocReviewSidecar {
  const localById = new Map(local.comments.map((comment) => [comment.id, comment]));
  let changed = shared.comments.length !== local.comments.length;
  const comments = shared.comments.map((comment, index) => {
    const existing = localById.get(comment.id);
    if (!existing) {
      changed = true;
      return comment;
    }
    if (local.comments[index]?.id !== comment.id) changed = true;
    if (sameSharedFields(existing, comment)) return existing;
    changed = true;
    const merged: RichDocCommentRecord = { ...comment, orphaned: existing.orphaned };
    if (existing.orphanedAt) merged.orphanedAt = existing.orphanedAt;
    return merged;
  });
  const trackChangesEnabled =
    shared.trackChangesEnabled === null
      ? local.trackChangesEnabled
      : shared.trackChangesEnabled;
  if (trackChangesEnabled !== local.trackChangesEnabled) changed = true;
  if (!changed) return local;
  return {
    version: RICHDOC_REVIEW_SIDECAR_VERSION,
    comments,
    trackChangesEnabled,
  };
}

// ── 桥：本地 sidecar ⇄ 共享文档 ─────────────────────────────────────────────

export interface RichDocReviewCollabHost {
  /** 本地此刻的 sidecar（同步读，不是上一次渲染的快照）。 */
  getSidecar(): RichDocReviewSidecar;
  /** 把远端状态落到本地：不能再触发回写。 */
  applyRemote(next: RichDocReviewSidecar): void;
  /** 当前正文里还带着锚点的批注 id。 */
  anchoredIds(): Set<string>;
  /** 房间是否在管这篇文档（denied / disabled 时是 false，退回单人）。 */
  isActive(): boolean;
  /** 这个人能不能写（只读的人不往共享里灌东西）。 */
  canWrite(): boolean;
  /** 房间已同步完（共享里的评论是完整的）。 */
  isLive(): boolean;
}

export class RichDocReviewCollab {
  private readonly origin = { kind: "richdoc-review" };
  private started = false;
  private readonly doc: Y.Doc;
  private readonly host: RichDocReviewCollabHost;

  // 不用构造函数参数属性：Node 的类型擦除模式（单测）不支持它。
  constructor(doc: Y.Doc, host: RichDocReviewCollabHost) {
    this.doc = doc;
    this.host = host;
  }

  private readonly onChange = (_events: unknown, transaction: Y.Transaction) => {
    if (transaction.origin === this.origin) return;
    this.pull();
  };

  start(): void {
    if (this.started) return;
    this.started = true;
    commentsRoot(this.doc).observeDeep(this.onChange);
    metaRoot(this.doc).observe(this.onChange as never);
    this.pull();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    commentsRoot(this.doc).unobserveDeep(this.onChange);
    metaRoot(this.doc).unobserve(this.onChange as never);
  }

  /** 共享 → 本地。共享还没播种时不动本地（本地的工程档批注还没灌上去）。 */
  pull(): void {
    if (!this.host.isActive()) return;
    const shared = readSharedReview(this.doc);
    if (!shared.seeded) return;
    const local = this.host.getSidecar();
    const next = mergeSharedIntoSidecar(local, shared);
    if (next !== local) this.host.applyRemote(next);
  }

  ready(): boolean {
    return this.host.isActive() && this.host.isLive();
  }

  /** 本地每一次提交（加评论、回复、解决、删除、切修订）同步写进共享。 */
  onLocalCommit(prev: RichDocReviewSidecar, next: RichDocReviewSidecar): void {
    if (!this.host.isActive() || !this.host.canWrite()) return;
    this.doc.transact(() => writeSidecarChange(this.doc, prev, next), this.origin);
  }

  /**
   * 载入工程档时（播种者、后加入的人、导入、外部新版本都走这里）决定本地该用哪份：
   *   - 共享还没播种：由这个客户端把工程档里的批注灌进去（按 id 幂等，只灌一次），本地用工程档的；
   *   - 已播种：以共享为准。工程档里多出来、且锚点还在正文里的批注（导入的 docx 批注、
   *     专业模式存回的批注）补进共享；锚点已摘的（被删掉的批注）不复活。
   */
  adoptHydration(file: RichDocReviewSidecar): RichDocReviewSidecar {
    if (!this.host.isActive()) return file;
    const writable = this.host.canWrite();
    let shared = readSharedReview(this.doc);
    if (!shared.seeded) {
      if (!writable) return file;
      this.doc.transact(() => seedSharedReview(this.doc, file), this.origin);
      return file;
    }
    if (writable) {
      const known = new Set(shared.comments.map((comment) => comment.id));
      const anchored = this.host.anchoredIds();
      const extra = file.comments.filter(
        (comment) => !known.has(comment.id) && anchored.has(comment.id),
      );
      if (extra.length) {
        this.doc.transact(() => {
          const root = commentsRoot(this.doc);
          for (const comment of extra) {
            if (!root.has(comment.id)) root.set(comment.id, buildSharedComment(comment));
          }
        }, this.origin);
        shared = readSharedReview(this.doc);
      }
    }
    return mergeSharedIntoSidecar(
      { ...file, comments: [], trackChangesEnabled: file.trackChangesEnabled },
      shared,
    );
  }
}
