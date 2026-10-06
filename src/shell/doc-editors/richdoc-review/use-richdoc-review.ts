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
//
// 多人同改（F09）：本地 sidecar 始终是共享评论的镜像。所有改动经 `commit`：同步更新
// `sidecarRef`（不等渲染）再通知桥（`attachCollab`）写进共享；远端的变化经
// `replaceSidecar` 落进来，不回写。保存时取的就是这份镜像，所以谁保存都包含双方的评论。
// 桥没装（单人、离线、房间被拒）时，一切与改动前相同。
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

/** 多人同改的桥（`review-collab.ts` 的 `RichDocReviewCollab` 实现它）。 */
export interface RichDocReviewCollabBridge {
  onLocalCommit(prev: RichDocReviewSidecar, next: RichDocReviewSidecar): void;
  adoptHydration(file: RichDocReviewSidecar): RichDocReviewSidecar;
  /** 房间已同步完、共享评论可信。没同步完时不补做采用（会把还没到的共享当成「没播种」）。 */
  ready(): boolean;
}

export interface RichDocReviewApi {
  sidecar: RichDocReviewSidecar;
  /** 协同里没有写权限（只读、没同步完）：加评论、回复、解决、删除、修订全部不生效。 */
  readOnly: boolean;
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
  /** 远端状态落到本地（与正文结算一次；不回写共享）。 */
  replaceSidecar: (next: RichDocReviewSidecar) => void;
  /** 此刻的 sidecar（同步读，不等渲染）。 */
  getSidecar: () => RichDocReviewSidecar;
  /** 装上协同桥；返回卸载函数。 */
  attachCollab: (bridge: RichDocReviewCollabBridge) => () => void;
  setCollabReadOnly: (readOnly: boolean) => void;
}

export function useRichDocReview(
  options: UseRichDocReviewOptions,
): RichDocReviewApi {
  const { editor, revision, attribution } = options;
  const [sidecar, setSidecar] = useState<RichDocReviewSidecar>(
    emptyReviewSidecar,
  );
  const [activeCommentId, setActiveCommentId] = useState("");

  // `sidecarRef` 与 state 同步更新：协同桥与「同一轮里连点两下」都要读到最新值，
  // 不能等下一次渲染。
  const sidecarRef = useRef<RichDocReviewSidecar>(sidecar);
  const editorRef = useRef<Editor | null>(editor);
  editorRef.current = editor;
  const bridgeRef = useRef<RichDocReviewCollabBridge | null>(null);
  /** 最近一次从工程档读出来的 sidecar：桥晚于载入装上时要补做一次采用。 */
  const projectSidecarRef = useRef<RichDocReviewSidecar | null>(null);
  const readOnlyRef = useRef(false);
  const [readOnly, setReadOnlyState] = useState(false);

  /**
   * 所有 sidecar 变化的唯一入口。`silent` = 不通知桥：远端落地、结算孤儿（它由正文推出，
   * 不进共享）。
   */
  const commit = useCallback(
    (
      update: (current: RichDocReviewSidecar) => RichDocReviewSidecar,
      silent = false,
    ) => {
      const prev = sidecarRef.current;
      const next = update(prev);
      if (next === prev) return;
      sidecarRef.current = next;
      setSidecar(next);
      if (!silent) bridgeRef.current?.onLocalCommit(prev, next);
    },
    [],
  );

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
    commit((current) => {
      if (!current.comments.length) return current;
      return reconcileCommentSidecar(editor.state.doc, current).sidecar;
    }, true);
  }, [commit, editor, revision]);

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
      if (!editor || readOnlyRef.current) return "";
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
      commit((current) => addCommentToSidecar(current, record));
      setActiveCommentId(record.id);
      return record.id;
    },
    [commit, editor],
  );

  const replyToComment = useCallback(
    (commentId: string, body: string) => {
      if (!body.trim() || readOnlyRef.current) return;
      commit((current) =>
        addReplyToSidecar(current, commentId, {
          ...attributionRef.current,
          body,
        }),
      );
    },
    [commit],
  );

  const resolveComment = useCallback(
    (commentId: string, resolved: boolean) => {
      if (readOnlyRef.current) return;
      commit((current) =>
        setCommentResolved(
          current,
          commentId,
          resolved,
          attributionRef.current.author,
        ),
      );
    },
    [commit],
  );

  const removeComment = useCallback(
    (commentId: string) => {
      if (readOnlyRef.current) return;
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
      commit((current) => removeCommentFromSidecar(current, commentId));
      setActiveCommentId((current) => (current === commentId ? "" : current));
    },
    [commit, editor, sidecar],
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
      if (!editor || readOnlyRef.current) return;
      const tr = editor.state.tr;
      if (acceptChange(tr, changeId)) editor.view.dispatch(tr);
    },
    [editor],
  );

  const rejectOne = useCallback(
    (changeId: string) => {
      if (!editor || readOnlyRef.current) return;
      const tr = editor.state.tr;
      if (rejectChange(tr, changeId)) editor.view.dispatch(tr);
    },
    [editor],
  );

  const acceptEvery = useCallback(() => {
    if (!editor || readOnlyRef.current) return;
    const tr = editor.state.tr;
    if (acceptAllChanges(tr)) editor.view.dispatch(tr);
  }, [editor]);

  const rejectEvery = useCallback(() => {
    if (!editor || readOnlyRef.current) return;
    const tr = editor.state.tr;
    if (rejectAllChanges(tr)) editor.view.dispatch(tr);
  }, [editor]);

  const deleteSelectionTracked = useCallback(() => {
    if (!editor || readOnlyRef.current) return;
    const { from, to } = editor.state.selection;
    if (to <= from) return;
    const tr = editor.state.tr;
    if (trackedDelete(tr, from, to, attributionRef.current)) {
      editor.view.dispatch(tr);
    }
  }, [editor]);

  const hydrateFromProject = useCallback((payload: unknown) => {
    const fromFile = readReviewSidecar(payload);
    projectSidecarRef.current = fromFile;
    // 协同里：共享评论已播种就以共享为准，没播种由这里灌一次；单人 = 工程档原样。
    const next = bridgeRef.current
      ? bridgeRef.current.adoptHydration(fromFile)
      : fromFile;
    sidecarRef.current = next;
    setSidecar(next);
    setActiveCommentId("");
  }, []);

  const setEnabled = useCallback(
    (next: boolean) => {
      if (readOnlyRef.current) return;
      // 只改开关。**既有标记一个都不动** —— 任务书点名最容易做错的一处，
      // 这里没有、也不许有任何清标记的调用。
      commit((current) => setTrackChangesEnabled(current, next));
    },
    [commit],
  );

  const replaceSidecar = useCallback(
    (next: RichDocReviewSidecar) => {
      // 远端的批注可能比它的锚点先到：落地前与正文结算一次，
      // 锚点随后到达时再由编辑后的结算摘掉孤儿标记。
      commit(() => {
        const instance = editorRef.current;
        return instance && next.comments.length
          ? reconcileCommentSidecar(instance.state.doc, next).sidecar
          : next;
      }, true);
    },
    [commit],
  );

  const getSidecar = useCallback(() => sidecarRef.current, []);

  const attachCollab = useCallback(
    (bridge: RichDocReviewCollabBridge) => {
      bridgeRef.current = bridge;
      const fromFile = projectSidecarRef.current;
      // 工程档先于桥载入完：补做一次采用（正常顺序是桥先装上，这里是兜底）。
      if (fromFile && bridge.ready()) {
        const next = bridge.adoptHydration(fromFile);
        if (next !== fromFile) {
          sidecarRef.current = next;
          setSidecar(next);
        }
      }
      return () => {
        if (bridgeRef.current === bridge) bridgeRef.current = null;
      };
    },
    [],
  );

  const setCollabReadOnly = useCallback((next: boolean) => {
    readOnlyRef.current = next;
    setReadOnlyState(next);
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
    readOnly,
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
    replaceSidecar,
    getSidecar,
    attachCollab,
    setCollabReadOnly,
  };
}
