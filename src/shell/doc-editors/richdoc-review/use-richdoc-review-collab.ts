// ============================================================================
// @oceanleo/ui — 富文档审阅层 · 多人同改的装配 hook（work-chat F09）
// ----------------------------------------------------------------------------
// 路由里调一次：把审阅 hook 的本地 sidecar 接到房间的共享评论字段上。
//   - 房间在管这篇文档（`active`）时装桥；denied / disabled / 没房间 = 不装，单人照旧；
//   - 没有写权限（只读的人、还没同步完）时把审阅 API 切成只读：加评论、回复、解决、
//     删除、修订开关与接受/拒绝修订全部不生效，界面上按钮灰掉（`review.readOnly`）。
// 业务规则都在 `review-collab.ts`；这里只负责把 React 的生命周期接上。
// ============================================================================

import { useEffect, useRef } from "react";
import type { Editor } from "@tiptap/react";

import type { CollabRoom } from "../../collab";
import { collectCommentAnchors } from "./review-anchors";
import { RichDocReviewCollab } from "./review-collab";
import type { RichDocReviewApi } from "./use-richdoc-review";

export interface UseRichDocReviewCollabOptions {
  review: RichDocReviewApi;
  editor: Editor | null;
  room: CollabRoom | null;
  /** 房间在管这篇文档（协同阶段不是 "off"）。 */
  active: boolean;
  /** 协同阶段已是 "live"（连上并同步完）。 */
  live: boolean;
  /** 房间只读（viewer，或专业模式锁在别人手里）。 */
  readOnly: boolean;
}

/** 只读判定单独导出：路由与测试用同一条规则。 */
export function richDocReviewReadOnly(input: {
  active: boolean;
  live: boolean;
  readOnly: boolean;
}): boolean {
  return input.active && (input.readOnly || !input.live);
}

export function useRichDocReviewCollab(options: UseRichDocReviewCollabOptions): void {
  const { review, editor, room, active, live, readOnly } = options;
  const { attachCollab, getSidecar, replaceSidecar, setCollabReadOnly } = review;

  const editorRef = useRef(editor);
  editorRef.current = editor;
  const activeRef = useRef(active);
  activeRef.current = active;
  const liveRef = useRef(live);
  liveRef.current = live;
  // 往共享里灌（播种、补进导入的批注）只看房间给不给写；「还没同步完」不拦：
  // 播种者恰恰是在 seed 阶段（还没到 live）把工程档里的批注灌进去的。
  // 加评论、回复这些用户动作另有 `readOnly`（含没同步完）拦着。
  const writableRef = useRef(!readOnly);
  writableRef.current = !readOnly;

  const collabRef = useRef<RichDocReviewCollab | null>(null);
  const doc = room ? room.doc : null;
  useEffect(() => {
    if (!doc) return undefined;
    const collab = new RichDocReviewCollab(doc, {
      getSidecar,
      applyRemote: replaceSidecar,
      anchoredIds: () => {
        const instance = editorRef.current;
        return instance
          ? new Set(collectCommentAnchors(instance.state.doc).keys())
          : new Set<string>();
      },
      isActive: () => activeRef.current,
      isLive: () => liveRef.current,
      canWrite: () => writableRef.current,
    });
    collabRef.current = collab;
    const detach = attachCollab(collab);
    collab.start();
    return () => {
      collab.stop();
      detach();
      if (collabRef.current === collab) collabRef.current = null;
    };
  }, [attachCollab, doc, getSidecar, replaceSidecar]);

  // 同步完成的那一刻再对一次：后到的共享评论（自己的工程档读不出来时尤其需要）。
  useEffect(() => {
    if (active && live) collabRef.current?.pull();
  }, [active, live]);

  useEffect(() => {
    setCollabReadOnly(richDocReviewReadOnly({ active, live, readOnly }));
  }, [active, live, readOnly, setCollabReadOnly]);
}
