// 共享层封装的 next-intl getRequestConfig 工厂。各站只写 3 行 i18n/request.ts：
//
//   import { createI18nRequest } from "@oceanleo/ui/i18n";
//   export default createI18nRequest(
//     async (locale) => (await import(`../messages/${locale}.json`)).default
//   );
//
// 共享层在这里统一：① 从 NEXT_LOCALE cookie 选语言（无前缀路由，决策见
// docs/architecture/oceanleo-i18n.md）；② 加载共享层自身的基础 messages（账户/
// 通用按钮等全家桶通用键）并 merge 进各站 messages（站内键覆盖共享键）。
import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, normalizeLocale, type Locale } from "./config";
import sharedDe from "./messages/de.json";
import sharedEn from "./messages/en.json";
import sharedEs from "./messages/es.json";
import sharedEs419 from "./messages/es-419.json";
import sharedFr from "./messages/fr.json";
import sharedIt from "./messages/it.json";
import sharedPtBR from "./messages/pt-BR.json";
import sharedPtPT from "./messages/pt-PT.json";
import sharedVi from "./messages/vi.json";
import sharedTr from "./messages/tr.json";
import sharedZh from "./messages/zh.json";
import sharedZhTW from "./messages/zh-TW.json";
import sharedJa from "./messages/ja.json";
import sharedKo from "./messages/ko.json";
import sharedAr from "./messages/ar.json";
import sharedTh from "./messages/th.json";
import sharedHi from "./messages/hi.json";

const SHARED_MESSAGES: Record<Locale, Record<string, unknown>> = {
  de: sharedDe as Record<string, unknown>,
  en: sharedEn as Record<string, unknown>,
  es: sharedEs as Record<string, unknown>,
  "es-419": sharedEs419 as Record<string, unknown>,
  fr: sharedFr as Record<string, unknown>,
  it: sharedIt as Record<string, unknown>,
  "pt-BR": sharedPtBR as Record<string, unknown>,
  "pt-PT": sharedPtPT as Record<string, unknown>,
  vi: sharedVi as Record<string, unknown>,
  tr: sharedTr as Record<string, unknown>,
  zh: sharedZh as Record<string, unknown>,
  "zh-TW": sharedZhTW as Record<string, unknown>,
  ja: sharedJa as Record<string, unknown>,
  ko: sharedKo as Record<string, unknown>,
  ar: sharedAr as Record<string, unknown>,
  th: sharedTh as Record<string, unknown>,
  hi: sharedHi as Record<string, unknown>,
};

export type SiteMessagesLoader = (
  locale: Locale,
) => Promise<Record<string, unknown>> | Record<string, unknown>;

// 解析当前请求应使用的 locale：优先 cookie，其次 Accept-Language，最后默认 zh。
async function resolveLocale(): Promise<Locale> {
  try {
    const cookieStore = await cookies();
    const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
    if (fromCookie) return normalizeLocale(fromCookie);
  } catch {
    /* cookies() 仅在请求作用域可用——非请求环境回退到 header / 默认 */
  }
  try {
    const h = await headers();
    const al = h.get("accept-language");
    if (al) return normalizeLocale(al.split(",")[0]);
  } catch {
    /* ignore */
  }
  return DEFAULT_LOCALE;
}

// 深合并两个 messages 树（后者覆盖前者；对象递归合并，标量/数组直接覆盖）。
// 用于：① 共享层 + 站内（站内键覆盖共享）；② 目标语言以【默认中文】为底兜底
// （目标语言缺的 key 自动回退到中文，绝不显示 raw key 或崩溃）。
function deepMerge(
  base: Record<string, unknown>,
  over: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = out[k];
    if (
      v && typeof v === "object" && !Array.isArray(v) &&
      b && typeof b === "object" && !Array.isArray(b)
    ) {
      out[k] = deepMerge(b as Record<string, unknown>, v as Record<string, unknown>);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

export function createI18nRequest(loadSiteMessages: SiteMessagesLoader) {
  return getRequestConfig(async () => {
    const locale = await resolveLocale();
    let siteMessages: Record<string, unknown> = {};
    try {
      siteMessages = (await loadSiteMessages(locale)) || {};
    } catch {
      siteMessages = {};
    }
    let siteFallback: Record<string, unknown> = {};
    if (locale !== DEFAULT_LOCALE) {
      try {
        siteFallback = (await loadSiteMessages(DEFAULT_LOCALE)) || {};
      } catch {
        siteFallback = {};
      }
    }

    // 兜底底座 = 默认中文（共享 + 站内），保证任何语言缺的 key 都回退成中文，
    // 界面永远有意义的文案、绝不出现 raw key / 崩溃（关键：让「渐进式翻译」安全）。
    const zhBase = deepMerge(SHARED_MESSAGES[DEFAULT_LOCALE] || {}, siteFallback);
    // 目标语言层（共享 + 站内）。
    const localeLayer = deepMerge(SHARED_MESSAGES[locale] || {}, siteMessages);
    // 最终：中文底座 ← 目标语言覆盖。
    const messages = deepMerge(zhBase, localeLayer);

    return {
      locale,
      messages,
      // 缺 key / 格式错误：静默回退到 key 的最后一段可读名，绝不抛错中断渲染。
      onError() {
        /* 吞掉 MISSING_MESSAGE 等——已有中文兜底，无需噪音 */
      },
      getMessageFallback({ key }: { key: string; namespace?: string }) {
        const seg = key.split(".").pop() || key;
        return seg;
      },
    };
  });
}

// 给「只用共享层基础文案、没有站内 messages」的站的便捷工厂。
export const sharedOnlyI18nRequest = () => createI18nRequest(() => ({}));
