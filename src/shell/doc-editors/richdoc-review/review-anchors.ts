// ============================================================================
// @oceanleo/ui — 富文档审阅层：批注锚点扫描、漂移结算、孤儿判定
// ----------------------------------------------------------------------------
// 范围永远是**现算**的：从当前文档里把带 commentId 的文本段扫出来取并集。
// 这样「锚点跟着编辑漂移」不是一条要维护的功能，而是不写代码就成立的性质——
// ProseMirror 的 mapping 已经把 mark 挪好了，我们只是每次去读它现在在哪。
// 反过来说，**把 range 存进 sidecar 才是 bug**：存下来的数字在下一次编辑后就是假的。
//
// 孤儿：sidecar 里有记录、正文里找不到锚点 ⇒ 锚定文本被删光了。
// 标 orphaned，绝不静默丢——批注是别人写给你的意见，丢一条就是丢一次沟通。
// 反过来，撤销把文字撤回来时锚点会重新出现，同一趟结算把孤儿摘回去。
// ============================================================================

import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { RICHDOC_COMMENT_MARK } from "./review-marks";
import type {
  RichDocCommentView,
  RichDocReviewSidecar,
} from "./review-types";

export interface RichDocCommentAnchor {
  from: number;
  to: number;
  text: string;
}

/**
 * 扫出每条批注在当前文档里的范围。
 *
 * 一条批注可能落在多个文本节点上（中间被加粗、被拆段都会切开节点），
 * 所以取首段起点到末段终点的并集，文字按文档顺序拼。
 */
export function collectCommentAnchors(
  doc: ProseMirrorNode,
): Map<string, RichDocCommentAnchor> {
  const anchors = new Map<string, RichDocCommentAnchor>();
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    for (const mark of node.marks) {
      if (mark.type.name !== RICHDOC_COMMENT_MARK) continue;
      const id = String(mark.attrs.commentId || "");
      if (!id) continue;
      const existing = anchors.get(id);
      if (!existing) {
        anchors.set(id, {
          from: pos,
          to: pos + node.nodeSize,
          text: node.text || "",
        });
        continue;
      }
      existing.from = Math.min(existing.from, pos);
      existing.to = Math.max(existing.to, pos + node.nodeSize);
      existing.text += node.text || "";
    }
    return true;
  });
  return anchors;
}

export interface ReconcileResult {
  sidecar: RichDocReviewSidecar;
  /** 这一趟新变成孤儿的批注 id —— UI 拿它提示「锚定文字已被删除」。 */
  newlyOrphaned: string[];
  /** 这一趟锚点又回来的批注 id（多半来自撤销）。 */
  recovered: string[];
}

/**
 * 把 sidecar 与当前文档对齐一次。纯函数，且**无变化时原样返回同一个引用**，
 * 让 React 侧的 `===` 能挡住无谓重渲染（每次按键都会走这里）。
 */
export function reconcileCommentSidecar(
  doc: ProseMirrorNode,
  sidecar: RichDocReviewSidecar,
  now: string = new Date().toISOString(),
): ReconcileResult {
  const anchors = collectCommentAnchors(doc);
  const newlyOrphaned: string[] = [];
  const recovered: string[] = [];
  const comments = sidecar.comments.map((comment) => {
    const anchored = anchors.has(comment.id);
    if (anchored && comment.orphaned) {
      recovered.push(comment.id);
      const restored = { ...comment, orphaned: false };
      delete restored.orphanedAt;
      return restored;
    }
    if (!anchored && !comment.orphaned) {
      newlyOrphaned.push(comment.id);
      return { ...comment, orphaned: true, orphanedAt: now };
    }
    return comment;
  });
  if (!newlyOrphaned.length && !recovered.length) {
    return { sidecar, newlyOrphaned, recovered };
  }
  return { sidecar: { ...sidecar, comments }, newlyOrphaned, recovered };
}

/**
 * 侧栏用的视图列表：按正文位置升序，孤儿沉到底部按创建时间排。
 * 「右侧批注栏与正文位置对齐」就是靠这个顺序 + 每条的 range 实现的。
 */
export function commentViews(
  doc: ProseMirrorNode,
  sidecar: RichDocReviewSidecar,
): RichDocCommentView[] {
  const anchors = collectCommentAnchors(doc);
  const views: RichDocCommentView[] = sidecar.comments.map((comment) => {
    const anchor = anchors.get(comment.id);
    return {
      ...comment,
      range: anchor ? { from: anchor.from, to: anchor.to } : null,
      anchorText: anchor ? anchor.text : "",
    };
  });
  return views.sort((left, right) => {
    if (left.range && right.range) {
      if (left.range.from !== right.range.from) {
        return left.range.from - right.range.from;
      }
      return left.createdAt.localeCompare(right.createdAt);
    }
    if (left.range) return -1;
    if (right.range) return 1;
    return left.createdAt.localeCompare(right.createdAt);
  });
}

/** 正文 → 侧栏跳转用：这一段范围上盖着哪几条批注。 */
export function commentIdsInRange(
  doc: ProseMirrorNode,
  from: number,
  to: number,
): string[] {
  const found = new Set<string>();
  const limit = doc.content.size;
  const start = Math.max(0, Math.min(Math.min(from, to), limit));
  const end = Math.max(start, Math.min(Math.max(from, to), limit));
  doc.nodesBetween(start, end, (node) => {
    if (!node.isText) return true;
    for (const mark of node.marks) {
      if (mark.type.name !== RICHDOC_COMMENT_MARK) continue;
      const id = String(mark.attrs.commentId || "");
      if (id) found.add(id);
    }
    return true;
  });
  return [...found];
}

/**
 * 光标处（零宽选区）盖着的批注。
 * `nodesBetween` 对零宽范围只会命中恰好跨过该点的节点，这里左右各放一格，
 * 让「光标停在批注文字中间」也能点亮侧栏那一条。
 */
export function commentIdsAtPosition(
  doc: ProseMirrorNode,
  pos: number,
): string[] {
  const clamped = Math.max(0, Math.min(pos, doc.content.size));
  return commentIdsInRange(doc, Math.max(0, clamped - 1), clamped + 1);
}
