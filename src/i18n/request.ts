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
import sharedZh from "./messages/zh.json";
import sharedEn from "./messages/en.json";

const SHARED_MESSAGES: Record<Locale, Record<string, unknown>> = {
  zh: sharedZh as Record<string, unknown>,
  en: sharedEn as Record<string, unknown>,
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
