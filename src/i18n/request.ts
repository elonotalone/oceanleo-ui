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

// 站内 messages 覆盖共享 messages（浅合并：站可整组覆盖共享同名 namespace 顶层键）。
function mergeMessages(
  shared: Record<string, unknown>,
  site: Record<string, unknown>,
): Record<string, unknown> {
  return { ...shared, ...site };
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
    return {
      locale,
      messages: mergeMessages(SHARED_MESSAGES[locale] || {}, siteMessages),
    };
  });
}

// 给「只用共享层基础文案、没有站内 messages」的站的便捷工厂。
export const sharedOnlyI18nRequest = () => createI18nRequest(() => ({}));
