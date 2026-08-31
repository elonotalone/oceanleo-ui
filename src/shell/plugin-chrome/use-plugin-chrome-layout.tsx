"use client";

// AdvancedLayout 兼容层：把 chrome 的左侧面板系统翻译成 `AdvancedLayoutState`。
//
// 为什么必须有：edit bar 上的 AI 键、DeckStage 等一批既有组件都通过
// `useAdvancedLayout()` 找抽屉，而那个 context 全仓只有
// `InlineAdvancedWorkbenchShell` 一处提供。走 `PluginChromeFrame` 的三件插件
// （设计画布 / 网站编辑 / 视频画布）拿到的是 `null`，于是
// `SelectionToolbar.tsx:249` 的 `agentButton` 恒为 null——**并进统一外壳这个动作
// 本身把 AI 键从这三件上摘掉了**。这一层就是补回那个前提。
//
// 语义基准是 `use-inline-advanced-panels.tsx` + `InlineAdvancedWorkbenchShell.tsx:203-248`，
// 逐条对齐（差异见 `signals/W22-chrome-contract.md`）：
//   - `openDrawer` 只开不切换，幂等；「再点一次关闭」由调用方自己判 active 后调
//     `closeDrawer`，不是在这里 toggle。改成 toggle 会让任何重复 open 变成关闭。
//   - transient 面板优先于抽屉，`openDrawer` 会先把 transient 清掉。
//   - `hostPanelVisible === editorToolActive`，都等于「左栏此刻有东西」。

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import type { AdvancedLayoutState } from "../advanced-layout-context";
import { useFloatingContextToolbar } from "../FloatingContextToolbar";
import type { PluginChromeEditBarGestureBridge } from "../PluginChromeEditBarGestureLayer";
import type { PluginChromePanelController } from "./use-plugin-chrome-panels";

export interface PluginChromeTransientPanel {
  id: string;
  label: ReactNode;
  content: ReactNode;
}

export interface PluginChromeLayoutBridge {
  layout: AdvancedLayoutState;
  /** 非 null 时由它顶掉 `controller.activePanel` 占住左栏。 */
  transientPanel: PluginChromeTransientPanel | null;
  /**
   * 给 `PanelContext` 用的控制器：与 `layout` 共享同一套 transient 语义。
   * edit bar 上的按钮（`PluginChromeEditBarButton`）读的是这个，不是裸控制器，
   * 否则 transient 面板盖住左栏时它的 `aria-expanded` 还亮着。
   */
  hostController: PluginChromePanelController;
}

export function usePluginChromeLayout(
  controller: PluginChromePanelController,
): PluginChromeLayoutBridge {
  const [transientPanel, setTransientPanel] =
    useState<PluginChromeTransientPanel | null>(null);
  const { openPanel, closePanel, activePanel, activePanelId } = controller;

  const openDrawer = useCallback(
    (drawerId: string) => {
      setTransientPanel(null);
      openPanel(drawerId);
    },
    [openPanel],
  );

  const closeDrawer = useCallback(() => {
    setTransientPanel(null);
    closePanel();
  }, [closePanel]);

  const openTransientPanel = useCallback(
    (panelId: string, label: ReactNode, content: ReactNode) => {
      setTransientPanel({ id: panelId, label, content });
    },
    [],
  );

  const updateTransientPanel = useCallback(
    (panelId: string, content: ReactNode) => {
      // 只认当前这一个 transient 面板；过期的 id 静默丢弃，
      // 否则一个已经被顶掉的面板还能把内容写回左栏。
      setTransientPanel((current) =>
        current && current.id === panelId ? { ...current, content } : current,
      );
    },
    [],
  );

  // transient 盖住左栏时，面板按钮点下去要的是「把我这个面板拿回来」，
  // 而不是把一个此刻根本看不见的面板再 toggle 掉。
  const toggleHostPanel = useCallback(
    (panelId: string) => {
      if (transientPanel) {
        setTransientPanel(null);
        openPanel(panelId);
        return;
      }
      controller.togglePanel(panelId);
    },
    [controller, openPanel, transientPanel],
  );

  const hostController = useMemo<PluginChromePanelController>(
    () => ({
      panels: controller.panels,
      activePanelId: transientPanel ? "" : activePanelId,
      activePanel: transientPanel ? null : activePanel,
      openPanel: openDrawer,
      closePanel: closeDrawer,
      togglePanel: toggleHostPanel,
      isOpen: (panelId: string) =>
        !transientPanel && controller.isOpen(panelId),
    }),
    [
      activePanel,
      activePanelId,
      closeDrawer,
      controller,
      openDrawer,
      toggleHostPanel,
      transientPanel,
    ],
  );

  const layout = useMemo<AdvancedLayoutState>(() => {
    const panelVisible = Boolean(transientPanel || activePanel);
    return {
      hostPanelVisible: panelVisible,
      editorToolActive: panelVisible,
      activeDrawerId: transientPanel
        ? transientPanel.id
        : activePanel
          ? activePanelId
          : "",
      activeTransientPanelId: transientPanel ? transientPanel.id : "",
      // chrome 没有浮动上下文条这个概念（版式契约把它固化成 edit bar 行了），
      // 两个槽恒为 undefined。承诺缩小已写进契约说明。
      //
      // ⚠️ 后来者请勿「顺手把它们填上」（W31，2026-08-31）。
      // 编辑栏的三条手势（双击拖拽 / 收起为圆 / 拖圆）此前在这三件 extracted
      // 插件上一条都不成立，看上去正像是这两个槽写死 undefined 造成的。
      // **不是。** 填上它们只会让 `SelectionToolbar` 在 edit bar 槽内拿到
      // `AdvancedLayout`，当场长出第二个 AI 键、被强制翻成 floating 胶囊、
      // 把选区检查器改道左抽屉（契约 §4-3 实测的三条副作用），
      // 手势一条也不会多出来——真正的消费链在 `InlineAdvancedWorkbenchShell`
      // 那侧，chrome 路径上根本没有那条链。
      //
      // 手势由 `usePluginChromeEditBarGestures()` + `PluginChromeEditBarGestureLayer`
      // 从**另一条路**补齐：把整行交给共享浮层，行降级成停靠带。
      // 那条路不需要这两个槽，所以这里维持 undefined 是正确的终局，不是欠账。
      contextBarLeading: undefined,
      contextBarTrailing: undefined,
      openDrawer,
      openTransientPanel,
      updateTransientPanel,
      closeDrawer,
    };
  }, [
    activePanel,
    activePanelId,
    closeDrawer,
    openDrawer,
    openTransientPanel,
    transientPanel,
    updateTransientPanel,
  ]);

  return { layout, transientPanel, hostController };
}

/**
 * chrome 路径上的编辑栏手势桥（W31）。
 *
 * 造出与 10 件共享插件**同一个**控制器，只是三根 ref 的落点换成 chrome 的
 * 三个部件：frame 根当图层、edit bar 行当停靠带、舞台当默认停放参照。
 * 控制器一份、行为一份——手势逻辑不许在 chrome 这侧另写一遍，
 * 那正是本波要消灭的漂移形状（同一件事两套实现）。
 *
 * `storageKey` 按 `pluginId` 分区：设计画布把栏拖到左下角，不该连带把
 * 网站编辑的栏也搬走。
 */
export function usePluginChromeEditBarGestures(
  pluginId: string,
): PluginChromeEditBarGestureBridge {
  const layerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const controller = useFloatingContextToolbar({
    workspaceRootRef: layerRef,
    stageRef,
    dockRootRef: dockRef,
    resetKey: `plugin-chrome:${pluginId}`,
  });
  return { layerRef, stageRef, dockRef, controller };
}
