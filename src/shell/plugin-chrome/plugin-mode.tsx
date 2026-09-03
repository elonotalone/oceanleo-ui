"use client";

// L0 专业模式开关的按钮（W01 判据 3 / R3）。状态与持久化在 ./plugin-mode-store，
// 分文件的理由见那份文件头（判据只能 import 纯 TS，`.tsx` 里的 JSX 过不了
// `--experimental-strip-types`）。

import { useCallback, useSyncExternalStore } from "react";

import { useUI } from "../../i18n/ui/useUI";
import { Button } from "../../ui/Button";
import { AdvancedEditorIcon } from "../AdvancedEditorIcon";
import type { EditorMode } from "../hosted-editor";
import type { PluginThemeId } from "../plugin-theme";
import {
  DEFAULT_PLUGIN_MODE,
  currentPluginMode,
  setPluginMode,
  subscribePluginMode,
} from "./plugin-mode-store";

export interface PluginModeHandle {
  mode: EditorMode;
  pro: boolean;
  setMode: (mode: EditorMode) => void;
  toggle: () => void;
}

export function usePluginMode(pluginId: PluginThemeId): PluginModeHandle {
  const mode = useSyncExternalStore(
    useCallback(
      (listener: () => void) => subscribePluginMode(pluginId, listener),
      [pluginId],
    ),
    useCallback(() => currentPluginMode(pluginId), [pluginId]),
    // SSR 快照恒为默认档：服务端读不到 localStorage，给 pro 会导致 hydrate 抖动。
    useCallback(() => DEFAULT_PLUGIN_MODE, []),
  );
  return {
    mode,
    pro: mode === "pro",
    setMode: useCallback(
      (next: EditorMode) => setPluginMode(pluginId, next),
      [pluginId],
    ),
    toggle: useCallback(
      () =>
        setPluginMode(
          pluginId,
          currentPluginMode(pluginId) === "pro" ? "normal" : "pro",
        ),
      [pluginId],
    ),
  };
}

export interface PluginModeToggleProps {
  pluginId: PluginThemeId;
  /**
   * 这件编辑器支不支持专业模式。不支持时**开关置灰但不消失**，
   * 并把原因显示为 title —— 与 `PluginChromeView.unavailableReason` 同一条产品
   * 判断：「看不见的能力」和「不存在的能力」对用户是两回事。
   */
  unavailableReason?: string;
  /** 模式变化时通知宿主：Native 件调 adapter 的 setMode，Hosted 件发 `set-mode`。 */
  onModeChange?: (mode: EditorMode) => void;
}

export function PluginModeToggle({
  pluginId,
  unavailableReason,
  onModeChange,
}: PluginModeToggleProps) {
  const tt = useUI();
  const { pro } = usePluginMode(pluginId);
  const disabled = Boolean(unavailableReason);
  const label = disabled
    ? `${tt("专业模式")}：${unavailableReason}`
    : tt(pro ? "退出专业模式" : "专业模式");
  // 走 `Button` 原语而不是裸 `<button>`：默认档就是 44px 命中区，焦点环内建且
  // 关不掉（`ui/Button.tsx` 文件头的两条结构性规矩）。顶栏 `h-14`(56px) 装得下。
  // 旁边的主题键还是 32px，那是登记在 `hit-target-budget` 里的存量欠账——
  // 新按钮没有理由跟着它一起欠。
  return (
    <Button
      variant="ghost"
      selected={pro}
      data-plugin-mode-toggle={pluginId}
      data-plugin-mode={pro ? "pro" : "normal"}
      disabled={disabled}
      aria-pressed={pro}
      aria-label={label}
      title={label}
      onClick={() => {
        if (disabled) return;
        const next: EditorMode = pro ? "normal" : "pro";
        setPluginMode(pluginId, next);
        onModeChange?.(next);
      }}
    >
      <AdvancedEditorIcon name="settings" className="h-4 w-4" />
      <span className="hidden sm:inline">{tt("专业模式")}</span>
    </Button>
  );
}
