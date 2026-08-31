// ============================================================================
// @oceanleo/ui — 插件统一外壳契约（13 件插件的单一事实源）
// ----------------------------------------------------------------------------
// 背景：改造前有三套互不知情的 chrome——
//   1. 10 件共享插件走 InlineAdvancedWorkbenchShell；
//   2. 设计画布 / 网站编辑 / 视频画布三个 extracted 包各自手搓 header；
//   3. 陈列馆再套一层 gallery-stage，什么都不给。
// 逐个对齐视觉只能治标，下次加插件还会再歪，所以把版式、槽位、token、图标、
// 保存语义、降级提示收敛到这一个契约上，插件只负责“填槽”。
//
// 版式契约（自上而下，顺序不可换）：
//   [identity | views | actions | status | theme | window]   ← 顶栏，恒有
//   [edit bar]                                               ← 恒有一行，空时给提示
//   [left panel | stage]                                     ← 左侧面板按需展开
// ============================================================================

import type { ReactNode } from "react";
import type { WorkbenchIconName } from "../AdvancedEditorIcon";

/**
 * 保存状态。改造前三套并存（共享插件自动存 / 网站手动 Save + dirty /
 * extracted 只写文档通道），用户切插件时对“存没存”没有一致心智。
 * 统一成这一个联合类型，由 PluginChromeStatus 渲染成同一个徽标。
 */
export type PluginChromeSaveState =
  | { kind: "clean"; revisionLabel?: string }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error"; message: string }
  /** 宿主没接持久化后端，只能存在本地。诚实告知，不伪装成已保存。 */
  | { kind: "local-only"; reason: string };

/** 顶栏视图切换项（网站编辑的 Preview/Code/Dashboard… 走这个）。 */
export interface PluginChromeView {
  id: string;
  /** 中文原文即 key，渲染时过 useUI()。 */
  label: string;
  icon: WorkbenchIconName;
  shortcut?: string;
  available?: boolean;
  unavailableReason?: string;
}

/** 顶栏动作按钮。 */
export interface PluginChromeAction {
  id: string;
  label: string;
  icon?: WorkbenchIconName;
  variant?: "default" | "primary" | "danger" | "icon";
  group?: "download" | "history";
  disabled?: boolean;
  busy?: boolean;
  busyLabel?: string;
  /** 指向 panels 里的某一项：点它就在左侧展开对应面板。 */
  panelId?: string;
  onTrigger?: () => void | Promise<void>;
}

/**
 * 左侧面板。契约要求：默认收起，由 edit bar / 顶栏按钮展开。
 * pinned 的面板首帧就展开——设计画布的“插入元素”属于主入口，
 * 全藏起来新用户找不到东西，所以允许一个常驻默认项。
 */
export interface PluginChromePanel {
  id: string;
  label: string;
  icon?: WorkbenchIconName;
  content: ReactNode;
  pinned?: boolean;
  /** 像素宽，默认 320。 */
  width?: number;
}

/** 降级提示。四种手搓 banner 收敛成这一种。 */
export interface PluginChromeNotice {
  id: string;
  tone: "info" | "warn" | "error";
  message: string;
  /** 为什么降级 / 缺哪个宿主能力，写清楚，不含糊。 */
  detail?: string;
}

export interface PluginChromeWindowActions {
  onClose?: () => void;
  onToggleFullscreen?: () => void;
  fullscreen?: boolean;
}
