// OceanLeo i18n 基础配置（单一事实源）。全家桶共用 locales / 默认语言 / cookie 名。
// 决策见 oceandino repo docs/architecture/oceanleo-i18n.md：cookie(NEXT_LOCALE)
// 选语言、不加 /[locale]/ URL 前缀、默认 zh。

export const LOCALES = ["zh", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "zh";

// next-intl 习惯名；浏览器与服务端读写同一个 cookie。Accept-Language 仅作首次回退。
export const LOCALE_COOKIE = "NEXT_LOCALE";

// 一年，语言选择长期生效。
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

// 把任意输入收敛到一个合法 locale（用于读 cookie / header 时的兜底）。
export function normalizeLocale(value: unknown): Locale {
  if (isLocale(value)) return value;
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower.startsWith("zh")) return "zh";
    if (lower.startsWith("en")) return "en";
  }
  return DEFAULT_LOCALE;
}

// 各语言的展示名（语言切换器用）。
export const LOCALE_LABELS: Record<Locale, string> = {
  zh: "中文",
  en: "EN",
};
