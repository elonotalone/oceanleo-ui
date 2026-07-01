// OceanLeo i18n 基础配置（单一事实源）。全家桶共用 locales / 默认语言 / cookie 名。
// 决策见 oceandino repo docs/architecture/oceanleo-i18n.md（框架 v1：cookie 无前缀）
// + oceanleo-theme-and-17-locales.md（v2：从 zh/en 扩到 17 语言）。

// 17 种语言（用户 2026-07-01 指定）。code 用 BCP-47：带地区码区分
// es/es-419、pt-BR/pt-PT、zh/zh-TW。
export const LOCALES = [
  "de", // Deutsch
  "en", // English
  "es", // Español（欧洲）
  "es-419", // Español (Latinoamérica)
  "fr", // Français
  "it", // Italiano
  "pt-BR", // Português (Brasil)
  "pt-PT", // Português (Portugal)
  "vi", // Tiếng Việt
  "tr", // Türkçe
  "zh", // 简体中文（默认）
  "zh-TW", // 繁體中文
  "ja", // 日本語
  "ko", // 한국어
  "ar", // العربية（RTL）
  "th", // ไทย
  "hi", // हिन्दी
] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "zh";

// next-intl 习惯名；浏览器与服务端读写同一个 cookie。Accept-Language 仅作首次回退。
export const LOCALE_COOKIE = "NEXT_LOCALE";

// 一年，语言选择长期生效。
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// 从右到左书写的语言（本轮只有阿拉伯语）。
export const RTL_LOCALES: readonly Locale[] = ["ar"] as const;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

// 把任意输入收敛到一个合法 locale（用于读 cookie / Accept-Language header 时的兜底）。
// 规则：① 精确命中直接用；② 带地区码的做「基语言 + 地区」智能回退；③ 都不中回默认。
export function normalizeLocale(value: unknown): Locale {
  if (isLocale(value)) return value;
  if (typeof value !== "string") return DEFAULT_LOCALE;

  const raw = value.trim();
  if (!raw) return DEFAULT_LOCALE;

  // 规整成 "xx" 或 "xx-YY"（语言小写、地区大写）。
  const [langPart, regionPart] = raw.replace("_", "-").split("-");
  const lang = langPart.toLowerCase();
  const region = (regionPart || "").toUpperCase();
  const tag = region ? `${lang}-${region}` : lang;

  // 精确命中（大小写规整后）。
  const exact = (LOCALES as readonly string[]).find((l) => l.toLowerCase() === tag.toLowerCase());
  if (exact) return exact as Locale;

  // 带地区码的智能回退。
  if (lang === "zh") {
    // 繁体地区（TW/HK/MO）→ zh-TW；其余 → zh（简体）。
    if (["TW", "HK", "MO"].includes(region)) return "zh-TW";
    if (raw.toLowerCase().includes("hant")) return "zh-TW";
    return "zh";
  }
  if (lang === "pt") {
    return region === "BR" ? "pt-BR" : "pt-PT";
  }
  if (lang === "es") {
    // 拉美地区代表码 419；常见拉美国家回退到 es-419，其余（含西班牙 ES）→ es。
    const latam = ["419", "MX", "AR", "CO", "CL", "PE", "VE", "EC", "GT", "CU", "BO", "DO", "HN", "PY", "SV", "NI", "CR", "PA", "UY"];
    return latam.includes(region) ? "es-419" : "es";
  }

  // 无地区码或未知地区：命中基语言就用基语言（若基语言本身是合法 locale）。
  if (isLocale(lang)) return lang as Locale;

  return DEFAULT_LOCALE;
}

// 各语言的展示名（语言切换器用）——一律用【该语言母语者的自称】，无论当前界面语言。
export const LOCALE_LABELS: Record<Locale, string> = {
  de: "Deutsch",
  en: "English",
  es: "Español",
  "es-419": "Español (Latinoamérica)",
  fr: "Français",
  it: "Italiano",
  "pt-BR": "Português (Brasil)",
  "pt-PT": "Português (Portugal)",
  vi: "Tiếng Việt",
  tr: "Türkçe",
  zh: "简体中文",
  "zh-TW": "繁體中文",
  ja: "日本語",
  ko: "한국어",
  ar: "العربية",
  th: "ไทย",
  hi: "हिन्दी",
};

// 文字方向：ar = rtl，其余 ltr。
export function localeDir(locale: Locale): "rtl" | "ltr" {
  return (RTL_LOCALES as readonly string[]).includes(locale) ? "rtl" : "ltr";
}

// <html lang="…"> 属性值。zh → zh-CN（简体的规范标签），其余用 locale 本身。
export function htmlLang(locale: Locale): string {
  if (locale === "zh") return "zh-CN";
  return locale;
}
