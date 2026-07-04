"use client";

// ============================================================================
// @oceanleo/ui — 功能页「使用指南」跨树上下文（单一事实源）
// ----------------------------------------------------------------------------
// 宗旨 v12.1：把 navigator 指南统一接到全家桶，各站零额外代码。三方通信：
//
//   OperatorConsole（提供者）
//     ├─ 把当前功能的 guide 配置放进 context；
//     └─ 暴露 useExample(ex)：点示例 → 灌进左栏（经 fill-bus 调到 FunctionAgentChat
//        / 站点表单注册的填充器）。
//   ResultCanvas（消费者）：ctx.guide 非空时，自动在右栏标签条最前面加一个「使用指南」
//     标签并默认选中——右版面首屏即导航页。
//   FunctionAgentChat / 站点操作台（填充器）：用 useRegisterOpsFiller 注册一个把
//     文本(+图片)灌进自己输入框的函数；示例点击时被调用。
//
// 之所以用 context + fill-bus 而非 props 直穿：右栏 ResultCanvas 与左栏填充器分属
// OperatorConsole 渲染的**不同子树**（中列 ops / 右列 canvas），无法用普通 props 互通。
// ============================================================================

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { type FunctionGuide, type GuideExample } from "./NavigatorGuide";

/** 左栏填充器：把示例内容灌进当前功能的左栏输入框（+可选图片 / 业务负载）。 */
export type OpsFiller = (
  text: string,
  opts?: { imageUrl?: string; data?: unknown },
) => void;

interface GuideCtxValue {
  guide: FunctionGuide | null;
  /** 点示例 → 灌进左栏（内部经 fill-bus 转发给已注册的填充器）。 */
  useExample: (ex: GuideExample) => void;
  /** 供左栏（FunctionAgentChat / 站点表单）注册自己的填充器。 */
  registerFiller: (fn: OpsFiller | null) => void;
}

const GuideCtx = createContext<GuideCtxValue | null>(null);

/**
 * OperatorConsole 为每个功能包一层：提供 guide + fill-bus。activeKey 变化（切功能）时
 * 自动重置填充器，避免把示例灌进上一个功能的输入框。
 */
export function GuideProvider({
  guide,
  activeKey,
  children,
}: {
  guide: FunctionGuide | null;
  activeKey: string;
  children: ReactNode;
}) {
  const fillerRef = useRef<OpsFiller | null>(null);
  // 切功能时清空已注册填充器（新功能的左栏会重新注册）。
  useEffect(() => {
    fillerRef.current = null;
  }, [activeKey]);

  const value = useMemo<GuideCtxValue>(
    () => ({
      guide,
      useExample: (ex) => {
        fillerRef.current?.(ex.prompt, { imageUrl: ex.imageUrl, data: ex.data });
      },
      registerFiller: (fn) => {
        fillerRef.current = fn;
      },
    }),
    [guide],
  );

  return <GuideCtx.Provider value={value}>{children}</GuideCtx.Provider>;
}

/** 右栏 ResultCanvas 读取：拿 guide + useExample（渲染「使用指南」标签）。 */
export function useFunctionGuide(): GuideCtxValue | null {
  return useContext(GuideCtx);
}

/**
 * 左栏（FunctionAgentChat / 站点操作台表单）注册填充器：示例点击时，把 text(+image)
 * 灌进自己的输入框。组件卸载 / 依赖变化时自动注销。
 */
export function useRegisterOpsFiller(filler: OpsFiller | null): void {
  const ctx = useContext(GuideCtx);
  useEffect(() => {
    if (!ctx) return;
    ctx.registerFiller(filler);
    return () => ctx.registerFiller(null);
  }, [ctx, filler]);
}
