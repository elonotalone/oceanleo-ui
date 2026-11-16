"use client";

import { useMemo } from "react";
import { useUI } from "../../../i18n";
import type {
  PluginChromeView,
} from "../../plugin-chrome";

/** Four views of the same saved project (the camera plan lives inside Storyboard cards since ED-B5c). */
export function useCanvasViews(): readonly PluginChromeView[] {
  const tt = useUI();
  return useMemo(
    () => [
      { id: "graph", label: tt("节点图"), icon: "layers" },
      { id: "storyboard", label: tt("分镜"), icon: "pages" },
      { id: "timeline", label: tt("时间线"), icon: "timeline" },
      { id: "history", label: tt("历史"), icon: "history" },
    ],
    [tt],
  );
}

