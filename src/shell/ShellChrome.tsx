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
  routeSuppressHeaderModel = false,
}: {
  children: ReactNode;
  modelConfig?: ShellModelConfig | null;
  /**
   * 由 AppShell 在 render 阶段按当前路由同步算出的「本路由是操作台路由，header 的
   * 模型选择该隐藏」信号。它与 OperatorConsole 挂载后 `setSuppressHeaderModel(true)`
   * 的动态信号取**或**——只要其一为真就隐藏 header 模型选择。
   *
   * 为什么需要它（操作员 2026-06-29 反馈的「模型选择从左上闪到右上」）：单页操作台
   * 站（OperatorConsole）的模型选择该落在主区那一行的**右上角**，AppShell header 的
   * 那条应隐藏。过去只靠 OperatorConsole 挂载后的 `useEffect → setSuppressHeaderModel(true)`，
   * effect 在**首帧绘制之后**才跑：SSR/首帧先把 header 的模型选择画在**左上**（且
   * OperatorConsole 因 useSearchParams 走 CSR bailout，主区右上那个此刻还没出现），
   * effect 跑完才摘掉左上、补上右上 → 肉眼可见「左上闪一下跳到右上」。任何 effect 都
   * 修不掉「服务端已经吐出来的那一帧」。本信号在 render 阶段同步生效（SSR 也算），故
   * header 从第一帧起就不渲染模型选择，杜绝左上那一帧。它随路由变化而**响应式**更新
   * （离开操作台路由 → 自动恢复 header 模型选择），不像 useState 初值只在挂载时取一次。
   */
  routeSuppressHeaderModel?: boolean;
}) {
  const [suppressHeaderModel, setSuppressHeaderModel] = useState(false);
  const effectiveSuppress = suppressHeaderModel || routeSuppressHeaderModel;
  const value = useMemo(
    () => ({ suppressHeaderModel: effectiveSuppress, setSuppressHeaderModel, modelConfig }),
    [effectiveSuppress, modelConfig],
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
