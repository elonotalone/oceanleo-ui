"use client";

// 左侧面板控制器：契约是「edit bar / 顶栏按钮展开后才显示到左侧操控台」，
// 而不是像改造前的设计画布那样钉死一条 360px 常驻栏。

import { useCallback, useMemo, useState } from "react";
import type { PluginChromePanel } from "./types";

export interface PluginChromePanelController {
  panels: readonly PluginChromePanel[];
  activePanelId: string;
  activePanel: PluginChromePanel | null;
  openPanel: (panelId: string) => void;
  closePanel: () => void;
  togglePanel: (panelId: string) => void;
  isOpen: (panelId: string) => boolean;
}

/**
 * pinned 面板决定首帧展开哪个。多个 pinned 时取第一个——契约只允许一个默认
 * 展开项，多开等于又回到常驻栏。
 */
function initialPanelId(panels: readonly PluginChromePanel[]): string {
  return panels.find((panel) => panel.pinned)?.id || "";
}

export function usePluginChromePanels(
  panels: readonly PluginChromePanel[],
): PluginChromePanelController {
  const [activePanelId, setActivePanelId] = useState(() =>
    initialPanelId(panels),
  );

  const openPanel = useCallback((panelId: string) => {
    setActivePanelId(panelId);
  }, []);

  const closePanel = useCallback(() => setActivePanelId(""), []);

  const togglePanel = useCallback((panelId: string) => {
    setActivePanelId((current) => (current === panelId ? "" : panelId));
  }, []);

  const isOpen = useCallback(
    (panelId: string) => activePanelId === panelId,
    [activePanelId],
  );

  // 面板列表变化后旧 id 可能已不存在（例如切换选中对象），此时回落到 pinned，
  // 不能让左侧卡在一个空壳上。
  const resolvedId = useMemo(() => {
    if (activePanelId && panels.some((panel) => panel.id === activePanelId)) {
      return activePanelId;
    }
    return initialPanelId(panels);
  }, [activePanelId, panels]);

  const activePanel = useMemo(
    () => panels.find((panel) => panel.id === resolvedId) || null,
    [panels, resolvedId],
  );

  return {
    panels,
    activePanelId: resolvedId,
    activePanel,
    openPanel,
    closePanel,
    togglePanel,
    isOpen,
  };
}
