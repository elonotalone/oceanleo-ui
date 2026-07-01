// @oceanleo/ui/i18n — 全家桶统一 i18n（中英双语）单一事实源【client-safe barrel】。
// 决策见 oceandino repo docs/architecture/oceanleo-i18n.md：
//   next-intl + cookie(NEXT_LOCALE) 选语言、不加 URL 前缀、默认 zh。
//
// ⚠ 服务端专用 API（getRequestConfig 工厂 + getT/getLocale/getMessages）放在
//   `@oceanleo/ui/i18n/server`，避免被 client 组件误引（next-intl/server +
//   next/headers 是 server-only，混进 client 图会报错）。
//
// 各站接入（3 步，详见文档 §5）：
//   1. i18n/request.ts:  import { createI18nRequest } from "@oceanleo/ui/i18n/server";
//        export default createI18nRequest(
//          async (locale) => (await import(`../messages/${locale}.json`)).default);
//   2. next.config:      const withNextIntl = createNextIntlPlugin('./i18n/request.ts');
//                        export default withNextIntl(nextConfig);
//   3. app/layout.tsx:   <I18nProvider>{children}</I18nProvider> + <LanguageSwitcher/>
//
// 组件里取翻译：
//   client:  const t = useT();                            t("common.login")
//   server:  import { getT } from "@oceanleo/ui/i18n/server";
//            const t = await getT();                       t("common.login")

export {
  LOCALES,
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_LABELS,
  RTL_LOCALES,
  isLocale,
  normalizeLocale,
  localeDir,
  htmlLang,
} from "./config";
export type { Locale } from "./config";

export { I18nProvider } from "./provider";
export type { I18nProviderProps } from "./provider";

export { LanguageSwitcher } from "./LanguageSwitcher";
export type { LanguageSwitcherProps } from "./LanguageSwitcher";

// client hooks（来自 "next-intl"，client-safe）。
export { useT, useLocale, useMessages, useFormatter } from "./useT.client";
