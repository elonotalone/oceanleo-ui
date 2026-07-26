"use client";

// ============================================================================
// @oceanleo/ui — `intent: "edit"` 的消费端（合同 §0.3「编辑模板」）
// ----------------------------------------------------------------------------
// 每一条普通 workspace action 的落点都是「安静预览详情」（`WorkspaceLibrary.openEntry`），
// 用户还要再按一次 Edit。只有目录大卡片的「编辑模板」深链是**已经指名了一份具体
// artifact** 的，它要求把这一份直接交给 typed 编辑器。
//
// 单独成文件而不是塞进 `MyLibrary.tsx`：那个文件基线已经 1100+ 行，远超共享包的
// ≤800 硬顶，不该再被顶高；而且这段时序（nonce 去重 + 列表快路径 + 按 id 兜底取数）
// 值得被 node --test 直接覆盖。
// ============================================================================

import { useEffect, useRef } from "react";
import { getCurrentArtifactItem } from "./artifact-client";
import { isDurableLibraryItem, type LibraryItem } from "./library-data";
import type { WorkspaceActionEnvelope } from "./workspace-actions";

export interface LibraryEditIntentFailure {
  status?: number;
  message: string;
}

export interface LibraryEditIntentInput {
  /** 右栏收到的 action envelope；非 `intent:"edit"` 的一律不归本模块管。 */
  action?: WorkspaceActionEnvelope | null;
  /** 当前已载入的库条目，只作快路径。 */
  items: readonly LibraryItem[];
  /** 命中后把这一份交给 typed 编辑器。 */
  onOpenItem: (item: LibraryItem) => void;
  /** 取不到时给可见失败态——绝不留一块空白面板。 */
  onFailure: (failure: LibraryEditIntentFailure) => void;
}

/** 这条 envelope 要求直接编辑的 artifact id；空串 = 不是编辑意图。 */
export function libraryEditIntentArtifactId(
  action?: WorkspaceActionEnvelope | null,
): string {
  if (!action?.nonce) return "";
  if (action.action?.intent !== "edit") return "";
  return String(action.action.itemId || "").trim();
}

/**
 * 把「编辑模板」深链指名的那一份 artifact 送进 typed 编辑器。
 *
 * 列表查找只是快路径：官方模板素材属于平台而不属于当前用户，正常情况下**不在**
 * 「我的库」里——等它出现在 `items` 里正是这条链以前静默失败的方式。所以未命中就按
 * artifact id 直接取一次；`/v1/library/items/<id>` 是 `auth: "optional"`，未登录访客
 * 也能打开一份公开模板。
 */
export function useLibraryEditIntent({
  action,
  items,
  onOpenItem,
  onFailure,
}: LibraryEditIntentInput): void {
  // 效果只以 nonce 为键：同一条 action 的重渲染不得重复取数，晚到的 `items` 也不得
  // 在用户背后再开一次编辑器。可变入参走 ref，避免为此把它们放进依赖数组。
  const latest = useRef({ items, onOpenItem, onFailure });
  latest.current = { items, onOpenItem, onFailure };

  const nonce = action?.nonce || "";
  const artifactId = libraryEditIntentArtifactId(action);
  const handledNonceRef = useRef("");

  useEffect(() => {
    if (!artifactId || handledNonceRef.current === nonce) return;
    handledNonceRef.current = nonce;
    const known = latest.current.items.find(
      (item) => isDurableLibraryItem(item) && item.artifactId === artifactId,
    );
    if (known) {
      latest.current.onOpenItem(known);
      return;
    }
    const controller = new AbortController();
    void (async () => {
      const result = await getCurrentArtifactItem(
        artifactId,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (!result.ok || !result.data) {
        latest.current.onFailure({
          status: result.status,
          message: result.error || "",
        });
        return;
      }
      latest.current.onOpenItem(result.data);
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, artifactId]);
}
