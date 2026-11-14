"use client";

// Library and editor buttons share the floating host. Only AI uses the left column.

import { useCallback, useRef, type ReactNode } from "react";
import type { EditBarPanelAnchor } from "./EditBarFloatingPanel";
import type { LibraryItem } from "./library-data";
import {
  InlineEditorMinePanel,
  type MineActivationResult,
} from "./inline-editor-mine-panel";
import type { WorkspaceLibraryPanelId } from "./SplitWorkspace";

/**
 * 文字编辑器的选区栏在光标处也常驻（字体、对齐……），「没选中」永远不成立。
 * 这些编辑器的抽屉按钮与文字栏同排常驻，否则「插入」「批注」就没有入口了。
 */
export const EDIT_BAR_DRAWERS_ALWAYS_VISIBLE: ReadonlySet<string> = new Set([
  "richdoc",
]);

export function editBarDrawersAlwaysVisible(adapterId: string): boolean {
  return EDIT_BAR_DRAWERS_ALWAYS_VISIBLE.has(adapterId.split("@")[0]);
}

/**
 * 页面级上下文（演示没选中对象时发的 `kind: "slide"`：版式 / 背景 / 过渡……）不是对象选区，
 * 按「没选中」算，抽屉按钮与页面级控件同排出现（signals/W07-to-W02.md）。
 * 选中对象时种类是 `slide-text` / `slide-image`……，不会误中。
 */
export const EDIT_BAR_PAGE_LEVEL_KINDS: ReadonlySet<string> = new Set(["slide", "audio-track"]);

export function editBarShowsDrawers(input: {
  adapterId: string;
  hasContextToolbar: boolean;
  selectionPresent: boolean;
  selectionKind: string | null;
}): boolean {
  return (
    !input.hasContextToolbar ||
    !input.selectionPresent ||
    (input.selectionKind != null &&
      EDIT_BAR_PAGE_LEVEL_KINDS.has(input.selectionKind)) ||
    editBarDrawersAlwaysVisible(input.adapterId)
  );
}

interface PanelControls {
  activeDrawerId: string;
  editBarDrawerId?: string;
  isPanelOpen: (panelId: string) => boolean;
  openDrawer: (drawerId: string, action?: undefined, anchor?: EditBarPanelAnchor) => void;
  openTransientPanel: (
    panelId: string,
    label: ReactNode,
    content: ReactNode,
    anchor?: EditBarPanelAnchor,
  ) => void;
  closeDetail: () => void;
}

export function useInlineLibraryPanels({
  panels,
  item,
  siteId,
  mineLabel,
  activateMineItem,
}: {
  panels: PanelControls;
  item: LibraryItem;
  siteId: string;
  mineLabel: ReactNode;
  activateMineItem: (next: LibraryItem) => Promise<MineActivationResult>;
}) {
  // 面板内容在打开那一刻交出去；回调走 ref，换文件、换保存状态后仍调到最新的那一份。
  const activateRef = useRef(activateMineItem);
  activateRef.current = activateMineItem;
  const activateLatest = useCallback(
    (next: LibraryItem) => activateRef.current(next),
    [],
  );
  const { closeDetail, isPanelOpen, openDrawer, openTransientPanel } = panels;
  const openLibraryPanel = useCallback(
    (id: WorkspaceLibraryPanelId, anchor?: EditBarPanelAnchor) => {
      if (isPanelOpen(id)) {
        closeDetail();
        return;
      }
      if (id === "materials") {
        openDrawer("materials", undefined, anchor);
        return;
      }
      openTransientPanel(
        "mine",
        mineLabel,
        <InlineEditorMinePanel
          siteId={siteId}
          currentItem={item}
          onActivateItem={activateLatest}
        />,
        anchor,
      );
    },
    [
      activateLatest,
      closeDetail,
      isPanelOpen,
      item,
      mineLabel,
      openDrawer,
      openTransientPanel,
      siteId,
    ],
  );
  const toggleDrawer = useCallback(
    (drawerId: string, anchor?: EditBarPanelAnchor) => {
      if (isPanelOpen(drawerId)) closeDetail();
      else openDrawer(drawerId, undefined, anchor);
    },
    [closeDetail, isPanelOpen, openDrawer],
  );
  const activeLibraryPanelId: WorkspaceLibraryPanelId | null = isPanelOpen(
    "materials",
  )
    ? "materials"
    : isPanelOpen("mine")
      ? "mine"
      : null;
  const drawerButtonId = panels.editBarDrawerId || panels.activeDrawerId;
  const openDrawerId = isPanelOpen(drawerButtonId)
    ? drawerButtonId
    : "";
  return { openLibraryPanel, toggleDrawer, activeLibraryPanelId, openDrawerId };
}
