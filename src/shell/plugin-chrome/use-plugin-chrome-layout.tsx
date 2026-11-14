"use client";

// Both shells share floating editor panels; only AI retains a left pane.

import { useCallback, useMemo, useRef, useLayoutEffect, type ReactNode } from "react";
import { useEditBarPanelStack, type EditBarPanelStack, type EditBarPanelAnchor } from "../EditBarFloatingPanel";
import { PLUGIN_AGENT_DRAWER_ID } from "./agent-drawer";
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
  floatingPanels: EditBarPanelStack;
  /** Active inspector, when the panel was opened without a drawer registration. */
  transientPanel: PluginChromeTransientPanel | null;
  /**
   * 给 `PanelContext` 用的控制器：与 `layout` 共享同一套 transient 语义。
   * Edit-bar buttons read the same floating-panel state as selection inspectors.
   */
  hostController: PluginChromePanelController;
}

export function usePluginChromeLayout(
  controller: PluginChromePanelController,
): PluginChromeLayoutBridge {
  const floatingPanels = useEditBarPanelStack();
  const { close: closeFloating, open: openFloating, update: updateFloating } = floatingPanels;
  const { openPanel, closePanel, activePanel, activePanelId } = controller;
  const openDrawer = useCallback((drawerId: string, _action?: unknown, anchor?: EditBarPanelAnchor) => {
    if (drawerId === PLUGIN_AGENT_DRAWER_ID) {
      closeFloating();
      openPanel(drawerId);
      return;
    }
    const panel = controller.panels.find(entry => entry.id === drawerId);
    if (!panel) return;
    closePanel();
    openFloating({ ...panel, anchor, width: drawerId === "materials" || drawerId === "mine" ? 420 : 320 });
  }, [closePanel, controller.panels, closeFloating, openFloating, openPanel]);
  const closeDrawer = useCallback(() => {
    closeFloating();
    closePanel();
  }, [closePanel, closeFloating]);
  const openTransientPanel = useCallback((id: string, label: ReactNode, content: ReactNode, anchor?: EditBarPanelAnchor) => {
    closePanel();
    openFloating({ id, label, content, anchor });
  }, [closePanel, openFloating]);
  const updateTransientPanel = floatingPanels.update;
  useLayoutEffect(() => {
    for (const panel of controller.panels) updateFloating(panel.id, panel.content);
  }, [controller.panels, updateFloating]);
  const transientPanel = floatingPanels.active && !controller.panels.some(panel => panel.id === floatingPanels.active?.id) ? floatingPanels.active : null;
  const toggleHostPanel = useCallback((id: string) => {
    if (floatingPanels.panels.some(panel => panel.id === id) || (id === PLUGIN_AGENT_DRAWER_ID && controller.isOpen(id))) closeDrawer();
    else openDrawer(id);
  }, [closeDrawer, controller, floatingPanels.panels, openDrawer]);
  const hostController = useMemo<PluginChromePanelController>(() => ({
    panels: controller.panels,
    activePanelId: floatingPanels.active?.id ?? activePanelId,
    activePanel: floatingPanels.active ? controller.panels.find(panel => panel.id === floatingPanels.active?.id) ?? null : activePanel,
    openPanel: openDrawer,
    closePanel: closeDrawer,
    togglePanel: toggleHostPanel,
    isOpen: (id: string) => floatingPanels.panels.some(panel => panel.id === id) || (id === PLUGIN_AGENT_DRAWER_ID && controller.isOpen(id)),
  }), [activePanel, activePanelId, closeDrawer, controller, floatingPanels.active, floatingPanels.panels, openDrawer, toggleHostPanel]);

  const layout = useMemo<AdvancedLayoutState>(() => {
    const panelVisible = Boolean(floatingPanels.active || activePanel?.id === PLUGIN_AGENT_DRAWER_ID);
    return {
      hostPanelVisible: panelVisible,
      editorToolActive: panelVisible,
      activeDrawerId: floatingPanels.active?.id ?? (activePanel?.id === PLUGIN_AGENT_DRAWER_ID ? activePanelId : ""),
      activeTransientPanelId: transientPanel?.id ?? "",
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
    floatingPanels.active,
    closeDrawer,
    openDrawer,
    openTransientPanel,
    transientPanel,
    updateTransientPanel,
  ]);

  return { layout, transientPanel, hostController, floatingPanels };
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
