// @oceanleo/ui/i18n/server — i18n 的【服务端专用】导出。
// 这里聚集所有 server-only API（next-intl/server + next/headers），与
// client-safe 的 `@oceanleo/ui/i18n` 隔离，防止被 client 组件误引而报错。
//
//   各站 i18n/request.ts：
//     import { createI18nRequest } from "@oceanleo/ui/i18n/server";
//     export default createI18nRequest(
//       async (locale) => (await import(`../messages/${locale}.json`)).default);
//
//   RSC / server action 里取翻译：
//     import { getT } from "@oceanleo/ui/i18n/server";
//     const t = await getT();  t("common.login")

export { createI18nRequest, sharedOnlyI18nRequest } from "./request";
export type { SiteMessagesLoader } from "./request";

// server 端翻译 helper（来自 "next-intl/server"）。
export { getTranslations as getT, getLocale, getMessages } from "next-intl/server";

// ---------------------------------------------------------------------------
// ttServer — useUI() 的【服务端镜像】。RSC / server layout / loading.tsx 里
// 无法调用 client-only 的 useUI() hook，但仍需按当前 locale 本地化「中文原文即
// key」的存量文案。词典已由 request.ts 按当前 locale 注入请求消息，不再把 17
// 份大词典静态引入同一个 server/client module graph。
//
//   import { ttServer } from "@oceanleo/ui/i18n/server";
//   const tt = await ttServer();
//   <div>{tt("加载中...")}</div>
//
// 纯 .ts 模块（无 React、无请求上下文）用 ttFor(locale, dict) 显式传词典。
import {
  uiMessageDictionaryFrom,
  type UIMessageDictionary,
} from "./ui/messages/runtime";
import {
  getLocale as _getLocale,
  getMessages as _getMessages,
} from "next-intl/server";

function _interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/** 显式 locale 版：纯 .ts / 无请求上下文时用。 */
export function ttFor(
  _locale: string,
  dict: UIMessageDictionary = {},
): (zh: string, vars?: Record<string, string | number>) => string {
  return (zh: string, vars?: Record<string, string | number>) => {
    const hit = dict[zh];
    return _interpolate(hit != null && hit !== "" ? hit : zh, vars);
  };
}

/** RSC / server component 版：await ttServer() 后当作 tt 用。 */
export async function ttServer(): Promise<
  (zh: string, vars?: Record<string, string | number>) => string
> {
  const [locale, messages] = await Promise.all([
    _getLocale(),
    _getMessages(),
  ]);
  const dict = uiMessageDictionaryFrom(
    messages as unknown as Record<string, unknown>,
  );
  return ttFor(locale, dict);
}

// 配置常量在两端通用，server 侧也转出一份方便单引。
export {
  LOCALES,
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_LABELS,
  RTL_LOCALES,
  isLocale,
  normalizeLocale,
  localeDir,
  htmlLang,
} from "./config";
export type { Locale } from "./config";
