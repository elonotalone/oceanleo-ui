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
//   - request.ts 只加载当前 locale，I18nProvider 通过轻量 context 下发给 useUI()。
//   - tt(zh) 命中就返回译文；未命中回退【中文原文本身】（绝不显示空/undefined）。
//   - 带插值：tt("让 agent 帮你做「{x}」", { x: name })  —— 用 {name} 占位，运行时替换。
//
// SSR/CSR 一致：locale + 当前词典都由 <I18nProvider> 提供，服务端首帧就用正确
// 语言渲染；不能在 client graph 静态 import 17 份词典，否则 dev 首屏会下载数 MB。
// ============================================================================

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { normalizeLocale, type Locale } from "../config";
import { useUiMessages } from "./messages/context";

export type UITranslate = (zh: string, vars?: Record<string, string | number>) => string;

function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/**
 * “灵感” is the product name for prompt-filling cards; it is not a generic
 * design-file template. Reuse the mature translations for the former template
 * copy, then replace only that translated term so all 17 locales switch
 * together without globally renaming real document/design templates.
 */
function renamePromptTemplateTerm(value: string, locale: Locale): string {
  switch (locale) {
    case "zh":
      return value.replaceAll("模板", "灵感");
    case "zh-TW":
      return value.replaceAll("範本", "靈感").replaceAll("模板", "靈感");
    case "en":
      return value.replace(/templates?/gi, (word) =>
        word.toLowerCase().endsWith("s") ? "Inspirations" : "Inspiration",
      );
    case "de":
      return value.replace(/Vorlagen?/gi, (word) =>
        word.toLowerCase().endsWith("n") ? "Inspirationen" : "Inspiration",
      );
    case "es":
    case "es-419":
      return value.replace(/plantillas?/gi, (word) =>
        word.toLowerCase().endsWith("s") ? "inspiraciones" : "inspiración",
      );
    case "fr":
      return value.replace(/modèles?/gi, (word) =>
        word.toLowerCase().endsWith("s") ? "inspirations" : "inspiration",
      );
    case "it":
      return value
        .replace(/modelli/gi, "ispirazioni")
        .replace(/modello/gi, "ispirazione");
    case "pt-BR":
    case "pt-PT":
      return value
        .replace(/modelos/gi, "inspirações")
        .replace(/modelo/gi, "inspiração");
    case "vi":
      return value.replace(/mẫu/gi, "Cảm hứng");
    case "tr":
      return value
        .replace(/şablonlar/gi, "İlhamlar")
        .replace(/şablon/gi, "İlham");
    case "ja":
      return value.replaceAll("テンプレート", "インスピレーション");
    case "ko":
      return value.replaceAll("템플릿", "영감");
    case "ar":
      return value.replace(/قوالب|قالب/g, "إلهام");
    case "th":
      return value.replaceAll("เทมเพลต", "แรงบันดาลใจ");
    case "hi":
      return value.replaceAll("टेम्पलेट", "प्रेरणा");
  }
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
  const dict = useUiMessages();
  return useMemo(() => {
    return (zh: string, vars?: Record<string, string | number>) => {
      // “文件库”已并入异构“我的库”。不仅收敛单独标签，也收敛提示、toast 等
      // 复合句，避免任何语言短暂露出旧产品概念。
      const canonical = zh
        .replaceAll("文件库", "我的库")
        .replaceAll("檔案庫", "我的库")
        .replaceAll("檔案库", "我的库");
      const isInspirationCopy = /灵感|靈感/.test(canonical);
      const lookupKey = isInspirationCopy
        ? canonical.replaceAll("灵感", "模板").replaceAll("靈感", "模板")
        : canonical;
      const hit = dict[lookupKey];
      const translated =
        hit != null && hit !== "" ? hit : canonical;
      return interpolate(
        isInspirationCopy
          ? renamePromptTemplateTerm(translated, locale)
          : translated,
        vars,
      );
    };
  }, [dict, locale]);
}
