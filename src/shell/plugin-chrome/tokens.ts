"use client";

// --pchrome-* 是统一外壳对外的 token 名，全部别名到既有的 --awb-*。
// 刻意不新增第四套变量：改造前已经有 --awb-*（共享插件）、--wb-*（网站工作台）、
// 站点语义变量三套，再加一套只会让漂移更快。这里只做「一个名字」的收敛。

import type { CSSProperties } from "react";
import { pluginWorkbenchStyle, type PluginThemeMode } from "../plugin-theme";

export function pluginChromeStyle(
  theme: PluginThemeMode,
  accent: string,
): CSSProperties {
  return {
    ...pluginWorkbenchStyle(theme, accent),
    "--pchrome-canvas": "var(--awb-shell-bg)",
    "--pchrome-surface": "var(--awb-chrome-bg)",
    "--pchrome-stage": "var(--awb-stage-bg)",
    "--pchrome-line": "var(--awb-border)",
    "--pchrome-ink": "var(--awb-text)",
    "--pchrome-ink-mid": "var(--awb-muted)",
    "--pchrome-muted": "var(--awb-hover)",
    "--pchrome-accent": "var(--awb-accent)",
    "--pchrome-accent-soft": "var(--awb-accent-soft)",
    "--pchrome-on-accent": "var(--awb-on-accent)",
    "--pchrome-danger": "var(--awb-danger)",
    "--pchrome-danger-soft": "var(--awb-danger-soft)",
    "--pchrome-danger-line":
      "color-mix(in srgb, var(--awb-danger) 35%, transparent)",
    "--pchrome-warn": "var(--awb-warn)",
    "--pchrome-warn-soft":
      "color-mix(in srgb, var(--awb-warn) 12%, transparent)",
    "--pchrome-warn-line":
      "color-mix(in srgb, var(--awb-warn) 35%, transparent)",
    "--pchrome-ok": "var(--awb-ok)",
    "--pchrome-ok-soft": "color-mix(in srgb, var(--awb-ok) 12%, transparent)",
  } as CSSProperties;
}

/** 顶栏与 edit bar 的固定行高，插件不得各自定义，否则跨插件切换会跳。 */
export const PLUGIN_CHROME_HEADER_H = "h-14";
export const PLUGIN_CHROME_EDITBAR_MIN_H = "min-h-12";
export const PLUGIN_CHROME_PANEL_DEFAULT_W = 320;
