"use client";

// ============================================================================
// @oceanleo/ui — 指名 artifact 的深链消费端（合同 §0.4「预览&编辑」/ §3.1）
// ----------------------------------------------------------------------------
// 每一条普通 workspace action 的落点都是「安静预览详情」（`WorkspaceLibrary.openEntry`），
// 用户还要再按一次 Edit。目录大卡片的两条深链是**已经指名了一份具体 artifact** 的：
//   - 「预览&编辑」（`intent: "open"`）→ 只读预览详情，用户在那里再点编辑才 fork；
//   - 旧的模板直编深链（`intent: "edit"`）→ 直接交给 typed 编辑器。
// 两条都只做 GET；fork 是写操作，只能由用户在预览页按下编辑时才发生。
//
// 单独成文件而不是塞进 `MyLibrary.tsx`：那个文件基线已经 1100+ 行，远超共享包的
// ≤800 硬顶，不该再被顶高；而且这段时序（nonce 去重 + 列表快路径 + 按 id 兜底取数）
// 值得被 node --test 直接覆盖。
// ============================================================================

import { useEffect, useRef } from "react";
import { getCurrentArtifactItem } from "./artifact-client";
import { isDurableLibraryItem, type LibraryItem } from "./library-data";
import {
  workspaceSlotForLegacyId,
  type WorkspaceActionEnvelope,
  type WorkspaceActionV1,
} from "./workspace-actions";

export interface LibraryEditIntentFailure {
  status?: number;
  message: string;
}

export interface LibraryEditIntentInput {
  /** 右栏收到的 action envelope；不带 `intent` 的一律不归本模块管。 */
  action?: WorkspaceActionEnvelope | null;
  /** 当前已载入的库条目，只作快路径。 */
  items: readonly LibraryItem[];
  /** 命中后把这一份交给 typed 编辑器。 */
  onOpenItem: (item: LibraryItem) => void;
  /**
   * 「预览&编辑」的只读落点：把这一份交给库详情的安静预览。
   *
   * 这条路径**必须是纯读**——`getArtifactEditDecision` 内部会 fork，是写操作，
   * 绝不能因为「打开了预览页」就发生（合同 §0.5）。
   */
  onPreviewItem?: (item: LibraryItem) => void;
  /** 取不到时给可见失败态——绝不留一块空白面板。 */
  onFailure: (failure: LibraryEditIntentFailure) => void;
}

/**
 * 库只读预览的**落点栏位**（接口 A）。
 *
 * 官方模板素材属于平台，不在「我的库」里；用户自有 artifact 才在。两者是两条不同的
 * 归属，因此也是两个不同的落点——不是同一个常量的两种写法。
 */
export type LibraryPreviewSurface = "materials" | "mine";

/** 合同 §3.1：库只读预览的意图形状，W3 生成链接、W5 复用。 */
export interface LibraryPreviewIntent {
  artifactId: string;
  mode: "preview";
  /**
   * 落点栏位；**缺省即 `mine`**。
   *
   * 沿用 `normalizeWorkspaceAction` 对 `intent` 的同一约定：这个字段出现之前造出来的
   * 意图必须逐字保持原样，所以「用户自有 artifact 落我的库」这条既有行为不需要任何
   * 调用点配合就仍然成立。
   */
  surface?: LibraryPreviewSurface;
}

/** `workspaceTemplatePreviewHref` 用的 query 值（合同 §3.1）。 */
export const LIBRARY_PREVIEW_QUERY_MODE = "preview";

/** 缺省落点：没有显式指定归属时按用户自有 artifact 处理。 */
const DEFAULT_LIBRARY_PREVIEW_SURFACE: LibraryPreviewSurface = "mine";

/**
 * `?tab=` 的值 → 落点栏位；不是库预览的 tab 返回 null。
 *
 * 归一化复用 `workspaceSlotForLegacyId`，所以两族历史别名都认：
 * `materials` / `material` / `inspiration` / `style` → 素材库；
 * `library` / `mine` / `my_library` / `files` / `works` / `favorites` → 我的库。
 * 其余（`browser` / `template` / 未知值）一律不是库预览落点。
 */
export function libraryPreviewSurfaceForTab(
  tab: string,
): LibraryPreviewSurface | null {
  if (!String(tab || "").trim()) return null;
  const slot = workspaceSlotForLegacyId(tab);
  return slot === "materials" || slot === "mine" ? slot : null;
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
 * 这条 envelope 要求**只读预览**的 artifact id；空串 = 不是预览意图。
 *
 * 判据是「`intent` 显式为 `open`」，不是「没有 intent」：`normalizeWorkspaceAction`
 * 只在调用方显式且合法地写了 `intent` 时才保留这个字段，所以历史 receipt（完全没有
 * `intent`）与本条链路天然可分。老 receipt 的语义原样不变——仍然只在列表里找，找不到
 * 就安静地什么都不做，不会因为本轮改动多出一次按 id 取数或一条可见失败态。
 */
export function libraryPreviewIntentArtifactId(
  action?: WorkspaceActionEnvelope | null,
): string {
  if (!action?.nonce) return "";
  if (action.action?.intent !== "open") return "";
  return String(action.action.itemId || "").trim();
}

/**
 * 解析「预览&编辑」深链：`?tab=materials&item=<artifactId>&mode=preview&app=<appId>`
 * （形状由接口 A 锁死，`workspaceTemplatePreviewHref` 产出）。
 *
 * `tab` 决定的是**落点归属**，不只是「是不是库链接」：官方模板素材写 `materials`，
 * 用户自有 artifact 写 `library`（`mine` 的别名）。历史链接一律是后者，语义原样不变。
 */
export function libraryPreviewIntentFromSearch(
  search: string | URLSearchParams,
): LibraryPreviewIntent | null {
  const params =
    search instanceof URLSearchParams
      ? search
      : new URLSearchParams(String(search || "").replace(/^\?/, ""));
  if (
    (params.get("mode") || "").trim().toLowerCase() !==
    LIBRARY_PREVIEW_QUERY_MODE
  ) {
    return null;
  }
  const surface = libraryPreviewSurfaceForTab(params.get("tab") || "");
  if (!surface) return null;
  const artifactId = (params.get("item") || "").trim();
  if (!artifactId) return null;
  // 缺省落点不写进意图，这样 `?tab=library` 解析出来的对象与本字段存在之前逐字相同。
  return surface === DEFAULT_LIBRARY_PREVIEW_SURFACE
    ? { artifactId, mode: "preview" }
    : { artifactId, mode: "preview", surface };
}

/**
 * 把只读预览意图变成右栏 action。
 *
 * `intent: "open"` 就是「揭示这一份的库详情，用户还要再按一次编辑」——正是预览页要
 * 的语义，所以本条链路不需要新的 intent 取值，也就不需要动 `workspace-actions.ts`。
 *
 * `tab` **按素材归属分流**：官方模板素材落素材库，用户自有 artifact 落我的库。
 * 这里以前是无条件的 `"mine"` 常量，于是首页卡片的「预览&编辑」必然落进一个不可能
 * 包含官方模板的栏位——「素材库中没有这个素材」的其中一半就是这么来的。
 */
export function libraryPreviewIntentAction(
  intent: LibraryPreviewIntent,
): WorkspaceActionV1 | null {
  const artifactId = String(intent?.artifactId || "").trim();
  if (!artifactId || intent.mode !== "preview") return null;
  return {
    version: 1,
    tab:
      intent.surface === "materials"
        ? "materials"
        : DEFAULT_LIBRARY_PREVIEW_SURFACE,
    itemId: artifactId,
    intent: "open",
  };
}

/**
 * 把深链指名的那一份 artifact 交给正确的落点。
 *
 * 两种意图共用同一条时序，只有落点不同：
 *   - `intent: "edit"` → typed 编辑器（fork 判据在 `getArtifactEditDecision` 里）；
 *   - `intent: "open"` → 库详情的**只读预览**（「预览&编辑」按钮的落点）。
 *
 * 列表查找只是快路径：官方模板素材属于平台而不属于当前用户，正常情况下**不在**
 * 「我的库」里——等它出现在 `items` 里正是这条链以前静默失败的方式。所以未命中就按
 * artifact id 直接取一次；`/v1/library/items/<id>` 是 `auth: "optional"`，未登录访客
 * 也能打开一份公开模板。
 *
 * 取数走 `getCurrentArtifactItem`（GET），**没有任何写操作**：预览页挂载时不得 fork。
 */
export function useLibraryEditIntent({
  action,
  items,
  onOpenItem,
  onPreviewItem,
  onFailure,
}: LibraryEditIntentInput): void {
  // 效果只以 nonce 为键：同一条 action 的重渲染不得重复取数，晚到的 `items` 也不得
  // 在用户背后再开一次编辑器。可变入参走 ref，避免为此把它们放进依赖数组。
  const latest = useRef({ items, onOpenItem, onPreviewItem, onFailure });
  latest.current = { items, onOpenItem, onPreviewItem, onFailure };

  const nonce = action?.nonce || "";
  const editArtifactId = libraryEditIntentArtifactId(action);
  // 宿主没有注册只读落点时，预览意图退回老语义（列表内揭示），不按 id 取数。
  const previewArtifactId = onPreviewItem
    ? libraryPreviewIntentArtifactId(action)
    : "";
  const artifactId = editArtifactId || previewArtifactId;
  const mode: "edit" | "preview" = editArtifactId ? "edit" : "preview";
  const handledNonceRef = useRef("");

  useEffect(() => {
    if (!artifactId || handledNonceRef.current === nonce) return;
    handledNonceRef.current = nonce;
    const deliver = (item: LibraryItem) => {
      if (mode === "preview") {
        latest.current.onPreviewItem?.(item);
        return;
      }
      latest.current.onOpenItem(item);
    };
    const known = latest.current.items.find(
      (item) => isDurableLibraryItem(item) && item.artifactId === artifactId,
    );
    if (known) {
      deliver(known);
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
      deliver(result.data);
    })();
    return () => controller.abort();
    // `mode` 与 `artifactId` 都是从同一条 action 推出来的，不用再进依赖数组。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, artifactId]);
}
