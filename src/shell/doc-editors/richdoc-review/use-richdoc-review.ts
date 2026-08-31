// ============================================================================
// @oceanleo/ui — 富文档审阅层：把审阅状态接到编辑器上的 React 层
// ----------------------------------------------------------------------------
// 这一层只做三件事，业务规则一条都不在这里：
//   1. 持有 sidecar（批注载荷 + 修订开关），并在每次编辑后与正文结算一次；
//   2. 把「现算」的批注视图与修订列表算给侧栏；
//   3. 把动作翻译成一次事务发给编辑器。
//
// 为什么范围是每次现算而不是缓存：见 `review-anchors.ts` 的文件头。
// `reconcileCommentSidecar` 在无变化时返回同一个引用，所以 `setSidecar`
// 拿到相同引用时 React 会跳过重渲染——每次按键都会走这里，这一条是必需的。
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";

import {
  commentIdsAtPosition,
  commentIdsInRange,
  commentViews,
  reconcileCommentSidecar,
} from "./review-anchors";
import { RICHDOC_COMMENT_MARK } from "./review-marks";
import {
  addCommentToSidecar,
  addReplyToSidecar,
  createCommentRecord,
  emptyReviewSidecar,
  readReviewSidecar,
  removeCommentFromSidecar,
  setCommentResolved,
  setTrackChangesEnabled,
  type RichDocAttribution,
  type RichDocCommentView,
  type RichDocReviewSidecar,
} from "./review-types";
import {
  acceptAllChanges,
  acceptChange,
  listChanges,
  markTrackingHandled,
  rejectAllChanges,
  rejectChange,
  trackedDelete,
  type RichDocChangeView,
} from "./track-changes";

export interface UseRichDocReviewOptions {
  editor: Editor | null;
  /** 每次编辑自增的计数；驱动结算与视图重算。 */
  revision: number;
  attribution: RichDocAttribution;
}

export interface RichDocReviewApi {
  sidecar: RichDocReviewSidecar;
  /** 按正文位置排好序的批注，孤儿沉底。侧栏与正文的「位置对齐」就是它。 */
  comments: RichDocCommentView[];
  changes: RichDocChangeView[];
  trackChangesEnabled: boolean;
  /** 侧栏里高亮哪一条；正文里对应锚点同时被点亮。 */
  activeCommentId: string;
  orphanedCount: number;
  openCommentCount: number;
  hasSelection: boolean;
  setTrackChangesEnabled: (next: boolean) => void;
  /** 用当前选区建一条批注；选区为空时返回空串（批注必须锚在文字上）。 */
  addComment: (body: string) => string;
  replyToComment: (commentId: string, body: string) => void;
  resolveComment: (commentId: string, resolved: boolean) => void;
  removeComment: (commentId: string) => void;
  /** 侧栏 → 正文：选中锚点并滚到可见处。 */
  focusComment: (commentId: string) => void;
  /** 正文 → 侧栏：光标处盖着的批注点亮第一条。 */
  syncActiveFromCursor: () => void;
  setActiveCommentId: (commentId: string) => void;
  acceptChange: (changeId: string) => void;
  rejectChange: (changeId: string) => void;
  acceptAllChanges: () => void;
  rejectAllChanges: () => void;
  /** 追踪式删除当前选区（不真删，盖删除线）。 */
  deleteSelectionTracked: () => void;
  /** 载入工程档时把 sidecar 读回来。 */
  hydrateFromProject: (payload: unknown) => void;
  replaceSidecar: (next: RichDocReviewSidecar) => void;
}

export function useRichDocReview(
  options: UseRichDocReviewOptions,
): RichDocReviewApi {
  const { editor, revision, attribution } = options;
  const [sidecar, setSidecar] = useState<RichDocReviewSidecar>(
    emptyReviewSidecar,
  );
  const [activeCommentId, setActiveCommentId] = useState("");

  const attributionRef = useRef(attribution);
  useEffect(() => {
    attributionRef.current = attribution;
  }, [attribution]);

  /**
   * 侧栏点击自己会挪选区，那次选区变化不能再反过来改写高亮：
   * 同一段文字上叠着多条批注时（`excludes:""` 是刻意的，法务与业务各批一条），
   * 光标同时落在两条里，回写会挑文档序最靠前的那条 —— 用户点了第二条却亮第一条。
   */
  const suppressCursorSyncRef = useRef(false);

  // 每次编辑后与正文结算一次：锚点没了的标成孤儿，回来的摘回去。
  // 无变化时 `reconcileCommentSidecar` 返回同一个引用 ⇒ `setSidecar` 是空转。
  useEffect(() => {
    if (!editor) return;
    setSidecar((current) => {
      if (!current.comments.length) return current;
      return reconcileCommentSidecar(editor.state.doc, current).sidecar;
    });
  }, [editor, revision]);

  const comments = useMemo(() => {
    if (!editor) return [];
    return commentViews(editor.state.doc, sidecar);
    // `revision` 不是多余的依赖：正文变了而 sidecar 没变时范围也要重算。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, sidecar, revision]);

  const changes = useMemo(() => {
    if (!editor) return [];
    return listChanges(editor.state.doc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, revision]);

  const hasSelection = useMemo(() => {
    if (!editor) return false;
    const { from, to } = editor.state.selection;
    return to > from;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, revision]);

  const addComment = useCallback(
    (body: string): string => {
      if (!editor) return "";
      const { from, to } = editor.state.selection;
      // 批注必须锚在一段文字上。没有选区就没有锚点，建出来的当场是孤儿。
      if (to <= from) return "";
      const quotedText = editor.state.doc.textBetween(from, to, " ");
      const record = createCommentRecord({
        ...attributionRef.current,
        body,
        quotedText,
      });
      const markType = editor.state.schema.marks[RICHDOC_COMMENT_MARK];
      if (!markType) return "";
      const tr = editor.state.tr.addMark(
        from,
        to,
        markType.create({ commentId: record.id }),
      );
      // 加锚点不是一次内容修改，不该被录成一处修订。
      markTrackingHandled(tr, "add-comment");
      editor.view.dispatch(tr);
      setSidecar((current) => addCommentToSidecar(current, record));
      setActiveCommentId(record.id);
      return record.id;
    },
    [editor],
  );

  const replyToComment = useCallback((commentId: string, body: string) => {
    if (!body.trim()) return;
    setSidecar((current) =>
      addReplyToSidecar(current, commentId, {
        ...attributionRef.current,
        body,
      }),
    );
  }, []);

  const resolveComment = useCallback((commentId: string, resolved: boolean) => {
    setSidecar((current) =>
      setCommentResolved(
        current,
        commentId,
        resolved,
        attributionRef.current.author,
      ),
    );
  }, []);

  const removeComment = useCallback(
    (commentId: string) => {
      // 删批注 = 摘正文锚点 + 从 sidecar 移除，两件事在同一次交互里做完，
      // 否则会留下一个指不到任何记录的锚点（正文上一段莫名其妙的高亮）。
      if (editor) {
        const markType = editor.state.schema.marks[RICHDOC_COMMENT_MARK];
        const anchor = commentViews(editor.state.doc, sidecar).find(
          (view) => view.id === commentId,
        );
        if (markType && anchor?.range) {
          const tr = editor.state.tr.removeMark(
            anchor.range.from,
            anchor.range.to,
            markType.create({ commentId }),
          );
          markTrackingHandled(tr, "remove-comment");
          editor.view.dispatch(tr);
        }
      }
      setSidecar((current) => removeCommentFromSidecar(current, commentId));
      setActiveCommentId((current) => (current === commentId ? "" : current));
    },
    [editor, sidecar],
  );

  const focusComment = useCallback(
    (commentId: string) => {
      setActiveCommentId(commentId);
      if (!editor) return;
      const anchor = comments.find((view) => view.id === commentId);
      // 孤儿没有可跳的位置。点它只高亮侧栏那一条，不去动光标。
      if (!anchor?.range) return;
      suppressCursorSyncRef.current = true;
      editor
        .chain()
        .focus()
        .setTextSelection({ from: anchor.range.from, to: anchor.range.to })
        .scrollIntoView()
        .run();
    },
    [comments, editor],
  );

  const syncActiveFromCursor = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const ids =
      to > from
        ? commentIdsInRange(editor.state.doc, from, to)
        : commentIdsAtPosition(editor.state.doc, from);
    if (!ids.length) return;
    // 同一段文字可能叠着好几条；点亮排在最前面的那条，与侧栏顺序一致。
    const ordered = comments.find((view) => ids.includes(view.id));
    setActiveCommentId(ordered ? ordered.id : ids[0]);
  }, [comments, editor]);

  /**
   * 正文 → 侧栏的那一半跳转。调用方只要把选区变化计进 `revision`，
   * 光标停到批注上侧栏就跟着点亮 —— 不接这个 effect，`syncActiveFromCursor`
   * 就只是一个没人调的导出，双向跳转实际只有单向。
   */
  useEffect(() => {
    if (!editor) return;
    if (suppressCursorSyncRef.current) {
      suppressCursorSyncRef.current = false;
      return;
    }
    syncActiveFromCursor();
  }, [editor, revision, syncActiveFromCursor]);

  const acceptOne = useCallback(
    (changeId: string) => {
      if (!editor) return;
      const tr = editor.state.tr;
      if (acceptChange(tr, changeId)) editor.view.dispatch(tr);
    },
    [editor],
  );

  const rejectOne = useCallback(
    (changeId: string) => {
      if (!editor) return;
      const tr = editor.state.tr;
      if (rejectChange(tr, changeId)) editor.view.dispatch(tr);
    },
    [editor],
  );

  const acceptEvery = useCallback(() => {
    if (!editor) return;
    const tr = editor.state.tr;
    if (acceptAllChanges(tr)) editor.view.dispatch(tr);
  }, [editor]);

  const rejectEvery = useCallback(() => {
    if (!editor) return;
    const tr = editor.state.tr;
    if (rejectAllChanges(tr)) editor.view.dispatch(tr);
  }, [editor]);

  const deleteSelectionTracked = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (to <= from) return;
    const tr = editor.state.tr;
    if (trackedDelete(tr, from, to, attributionRef.current)) {
      editor.view.dispatch(tr);
    }
  }, [editor]);

  const hydrateFromProject = useCallback((payload: unknown) => {
    setSidecar(readReviewSidecar(payload));
    setActiveCommentId("");
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    // 只改开关。**既有标记一个都不动** —— 任务书点名最容易做错的一处，
    // 这里没有、也不许有任何清标记的调用。
    setSidecar((current) => setTrackChangesEnabled(current, next));
  }, []);

  const orphanedCount = useMemo(
    () => comments.filter((view) => view.orphaned).length,
    [comments],
  );
  const openCommentCount = useMemo(
    () => comments.filter((view) => !view.resolved).length,
    [comments],
  );

  return {
    sidecar,
    comments,
    changes,
    trackChangesEnabled: sidecar.trackChangesEnabled,
    activeCommentId,
    orphanedCount,
    openCommentCount,
    hasSelection,
    setTrackChangesEnabled: setEnabled,
    addComment,
    replyToComment,
    resolveComment,
    removeComment,
    focusComment,
    syncActiveFromCursor,
    setActiveCommentId,
    acceptChange: acceptOne,
    rejectChange: rejectOne,
    acceptAllChanges: acceptEvery,
    rejectAllChanges: rejectEvery,
    deleteSelectionTracked,
    hydrateFromProject,
    replaceSidecar: setSidecar,
  };
}
