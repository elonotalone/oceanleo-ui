"use client";

// 第一行「素材库 / 我的库」两颗键与编辑栏空态抽屉键的开合（10-23 W02，D2 / D3）。
//
// 1. 不论承载（库页面 `/library?item=`、工作台右栏、`/advanced/<featureId>`、素材目录），
//    两颗键都打开**壳自己的**面板：素材库第一项是「从本地上传」，下面是当前编辑器能用的
//    素材；我的库是自己的文件列表。落点由 `useInlineAdvancedPanels` 决定：工作区左栏
//    可见时进左栏，宿主把左栏收着时进壳自己的 aside。不再借 ResultCanvas 登记的库面板，
//    那两块面板在左栏收着的承载里根本不存在，点了就没反应（操作员 10-23 截图）。
// 2. 再点一次同一颗键 = 收起；点另一颗 = 换过去（同一时刻只开一个面板）。
// 3. 选中态只认「此刻真的看得见」，不认本地记账，免得面板被别处收掉后键还亮着。

import { useCallback, useRef, type ReactNode } from "react";
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

interface PanelControls {
  activeDrawerId: string;
  isPanelOpen: (panelId: string) => boolean;
  openDrawer: (drawerId: string) => void;
  openTransientPanel: (
    panelId: string,
    label: ReactNode,
    content: ReactNode,
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
    (id: WorkspaceLibraryPanelId) => {
      if (isPanelOpen(id)) {
        closeDetail();
        return;
      }
      if (id === "materials") {
        openDrawer("materials");
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
    (drawerId: string) => {
      if (isPanelOpen(drawerId)) closeDetail();
      else openDrawer(drawerId);
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
  const openDrawerId = isPanelOpen(panels.activeDrawerId)
    ? panels.activeDrawerId
    : "";
  return { openLibraryPanel, toggleDrawer, activeLibraryPanelId, openDrawerId };
}
