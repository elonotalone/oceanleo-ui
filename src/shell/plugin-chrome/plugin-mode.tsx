"use client";

// L0 专业模式开关的按钮（W01 判据 3 / R3）。状态与持久化在 ./plugin-mode-store，
// 分文件的理由见那份文件头（判据只能 import 纯 TS，`.tsx` 里的 JSX 过不了
// `--experimental-strip-types`）。

import { useCallback, useEffect, useSyncExternalStore } from "react";

import { useUI } from "../../i18n/ui/useUI";
import { Button } from "../../ui/Button";
import type { AdvancedEditorModeAdapter } from "../advanced-editor-adapter";
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
   * 说明性原因，只进 title。13 件高级编辑器的开关必须能点，不再置灰。
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
  const label = unavailableReason
    ? `${tt(pro ? "退出专业模式" : "专业模式")}：${unavailableReason}`
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
      aria-pressed={pro}
      aria-label={label}
      title={label}
      onClick={() => {
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

export interface PluginModeAdapterBridgeProps {
  pluginId: PluginThemeId;
  /** 这件编辑器的 L3 模式面；`undefined` = 它没声明支持，桥什么都不做。 */
  mode?: AdvancedEditorModeAdapter;
}

/**
 * 把 L0 记住的档位交到内核手里。渲染 `null`，只做接线。
 *
 * 为什么必须有这一层：各编辑器的模式状态是自己的 `useState(DEFAULT_EDITOR_MODE)`，
 * 打开时一律从普通模式起步。于是「按用户 × 编辑器记住」在没有这座桥的时候只是
 * localStorage 里的一个值——用户上次选了专业模式，重新打开还是普通模式，
 * 顶栏开关亮着 pro 而内核的 ribbon 不在，两边说的话不一样。
 *
 * 挂载时推一次（这就是「打开编辑器时用记住的档位初始化」），之后 store 每变一次
 * 都推——换标签页里改的档位也经 storage 事件收敛到这里。
 * 编辑器已经在那个档位时不推，所以不会和编辑器自己的 setState 打转。
 */
export function PluginModeAdapterBridge({
  pluginId,
  mode,
}: PluginModeAdapterBridgeProps) {
  const { mode: remembered } = usePluginMode(pluginId);
  const setMode = mode?.setMode;
  const editorMode = mode?.current ?? DEFAULT_PLUGIN_MODE;
  useEffect(() => {
    if (!setMode || editorMode === remembered) return;
    setMode(remembered);
  }, [editorMode, remembered, setMode]);
  return null;
}
