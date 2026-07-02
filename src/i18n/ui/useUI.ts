"use client";

// ============================================================================
// @oceanleo/ui — 存量 UI 文案的「中文原文即 key」翻译系统（单一事实源）
// ----------------------------------------------------------------------------
// 背景（操作员 2026-07-01）：29 个 *.oceanleo.com 站共享的 shell/pages 组件里有
// 数百处硬编码中文。要「让不同语言的人完全能用」，必须把它们全部本地化。
//
// 为什么不用 next-intl 的命名空间 key？—— 存量文案没有语义 key，逐个起名字既慢又
// 易漂移。这里改用「中文原文 = key」：组件里 `"深色"` → `{tt("深色")}`，改动最小、
// 语义自解释、中文站天生正确（表里 key===值）。
//
// 机制：
//   - 词典在 ./messages/<locale>.ts，形如 { "深色": "Dark", ... }。
//   - useUI() 用 next-intl 的 useLocale() 取当前语言，选对应词典。
//   - tt(zh) 命中就返回译文；未命中回退【中文原文本身】（绝不显示空/undefined）。
//   - 带插值：tt("让 agent 帮你做「{x}」", { x: name })  —— 用 {name} 占位，运行时替换。
//
// SSR/CSR 一致：useLocale() 在两端都由 <I18nProvider>(NextIntlClientProvider) 提供，
// 服务端首帧就用正确语言渲染，无闪烁。
// ============================================================================

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { UI_MESSAGES } from "./messages";
import { DEFAULT_LOCALE, normalizeLocale } from "../config";

export type UITranslate = (zh: string, vars?: Record<string, string | number>) => string;

function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/**
 * 取当前语言的 UI 翻译函数。用法：
 *   const tt = useUI();
 *   <button>{tt("深色")}</button>
 *   <p>{tt("让 agent 帮你做「{title}」", { title })}</p>
 * ⚠ 必须在 <I18nProvider> 内（client 组件）调用。
 *
 * ⚠ 返回值必须按 locale memo 固定（2026-07-02 修）：此前每次渲染都返回新函数，
 * 任何把 tt 放进 useCallback/useEffect 依赖的调用方（如 useHistory 的 reload）
 * 都会「渲染→effect→fetch→setState→渲染」无限循环——历史记录左栏反复闪
 * 「加载…」抽动的根因就在这。
 */
export function useUI(): UITranslate {
  const locale = normalizeLocale(useLocale());
  return useMemo(() => {
    const dict = UI_MESSAGES[locale] || UI_MESSAGES[DEFAULT_LOCALE] || {};
    return (zh: string, vars?: Record<string, string | number>) => {
      const hit = dict[zh];
      return interpolate(hit != null && hit !== "" ? hit : zh, vars);
    };
  }, [locale]);
}
