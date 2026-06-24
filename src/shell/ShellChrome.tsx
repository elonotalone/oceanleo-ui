"use client";

// ============================================================================
// @oceanleo/ui — 外壳「顶栏控制」上下文（单一事实源，操作员 2026-06-24）
// ----------------------------------------------------------------------------
// 问题：子站工作台过去有「两行顶栏」——AppShell header 一行（模型选择），其下
// OperatorConsole 目录态又一行（返回 + 功能名）。操作员要求「最上方只有一行」。
//
// 方案：让**页面主区**（OperatorConsole）把模型选择收进**自己那一行**的右上角，
// 同时告诉外层 AppShell「我已自带模型选择，请把你 header 里的那条藏掉」。React
// context 只能自上而下流，所以 AppShell 在顶层 provide 一个 setter，主区后代
// 调用它即可「向上」通知。AppShell 据此隐藏自己 header 的模型选择条。
//
// 用法：
//   - AppShell：<ShellChromeProvider> 包住整棵树；读 suppressHeaderModel 决定是否
//     渲染 header 里的 ModelPicker。
//   - 主区组件（OperatorConsole）：const { setSuppressHeaderModel } = useShellChrome();
//     useEffect 挂载时 setSuppressHeaderModel(true)、卸载时还原。
// ============================================================================

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/** AppShell 往下透传的模型选择配置（OperatorConsole 等主区零接线即可复用）。 */
export interface ShellModelConfig {
  categories: string[];
  siteId: string;
  apiHref: string;
}

interface ShellChromeValue {
  /** 主区是否已自带模型选择（true → AppShell header 不再渲染它，避免两行）。 */
  suppressHeaderModel: boolean;
  setSuppressHeaderModel: (v: boolean) => void;
  /** AppShell 当前的模型选择配置（供主区组件 fallback 取用，免逐站再传一遍）。 */
  modelConfig: ShellModelConfig | null;
}

const ShellChromeContext = createContext<ShellChromeValue | null>(null);

export function ShellChromeProvider({
  children,
  modelConfig = null,
}: {
  children: ReactNode;
  modelConfig?: ShellModelConfig | null;
}) {
  const [suppressHeaderModel, setSuppressHeaderModel] = useState(false);
  const value = useMemo(
    () => ({ suppressHeaderModel, setSuppressHeaderModel, modelConfig }),
    [suppressHeaderModel, modelConfig],
  );
  return <ShellChromeContext.Provider value={value}>{children}</ShellChromeContext.Provider>;
}

/** 取顶栏控制。没有 Provider（组件被单独使用）时返回一个无操作实现，安全降级。 */
export function useShellChrome(): ShellChromeValue {
  return (
    useContext(ShellChromeContext) ?? {
      suppressHeaderModel: false,
      setSuppressHeaderModel: () => {},
      modelConfig: null,
    }
  );
}
