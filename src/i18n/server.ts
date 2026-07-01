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
