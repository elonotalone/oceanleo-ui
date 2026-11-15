"use client";

// 把 useCanvasWorkflow() 的状态翻成统一外壳的槽位。
//
// 改造前视频画布自己搭了一条 absolute 浮动 header：左边身份、中间五个投影
// 切换、右边主题开关 + Add media + Save snapshot + Full screen + Back，
// 全部是 text-[9px]/[10px] 的自定义按钮。它跟其余 12 件插件既不同高、
// 也不同字号、图标还是 ☀/☾ 这类排版字符。现在一律填进契约槽位，
// 版式与图标由 PluginChromeFrame 统一出。

import { useMemo } from "react";
import { useUI } from "../../../i18n";
import type {
  PluginChromeView,
} from "../../plugin-chrome";

/**
 * 五个投影共享同一个 head，只是看法不同，所以是 views 而不是 actions。
 *
 * 这些 label 非嵌入时进 PluginChromeFrame 的视图切换条；嵌入态改由
 * project-manifest.views 报给宿主（graph 带 role:artifact，director 不报）。
 * 从模块级常量改成 hook 就是为了拿到 tt——常量位置调不了 hook。
 * `保存中…` 这类 en.ts 里没有 key 的串保持中文原样并留在预算锁里：
 * 硬包 tt() 只会让闸门以为已办好，15 个非中文档看到的还是中文。
 */
export function useCanvasViews(): readonly PluginChromeView[] {
  const tt = useUI();
  return useMemo(
    () => [
      { id: "graph", label: tt("节点图"), icon: "layers" },
      { id: "storyboard", label: tt("分镜"), icon: "pages" },
      { id: "director", label: tt("导演台"), icon: "note" },
      { id: "timeline", label: tt("时间线"), icon: "timeline" },
      { id: "history", label: tt("历史"), icon: "history" },
    ],
    [tt],
  );
}

