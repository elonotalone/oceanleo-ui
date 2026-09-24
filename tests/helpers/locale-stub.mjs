// AppShell 编译图会走进 GeneralPage / MemoryImport，它们从 i18n/config
// 取 normalizeLocale、LOCALES、cookie 名与展示名。测试里的 locale 桩必须
// 与产品同一套出口和归一化规则，不能只剩 LOCALES 数组。

import { dataModule } from "./module-bench.mjs";

export const LOCALE_STUB_SOURCE = `
export const LOCALES = [
  "de", "en", "es", "es-419", "fr", "it", "pt-BR", "pt-PT", "vi",
  "tr", "zh", "zh-TW", "ja", "ko", "ar", "th", "hi",
];
export const DEFAULT_LOCALE = "zh";
export const LOCALE_COOKIE = "NEXT_LOCALE";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
export const RTL_LOCALES = ["ar"];

export function isLocale(value) {
  return typeof value === "string" && LOCALES.includes(value);
}

export function normalizeLocale(value) {
  if (isLocale(value)) return value;
  if (typeof value !== "string") return DEFAULT_LOCALE;
  const raw = value.trim();
  if (!raw) return DEFAULT_LOCALE;
  const [langPart, regionPart] = raw.replace("_", "-").split("-");
  const lang = langPart.toLowerCase();
  const region = (regionPart || "").toUpperCase();
  const tag = region ? lang + "-" + region : lang;
  const exact = LOCALES.find((item) => item.toLowerCase() === tag.toLowerCase());
  if (exact) return exact;
  if (lang === "zh") {
    if (["TW", "HK", "MO"].includes(region)) return "zh-TW";
    if (raw.toLowerCase().includes("hant")) return "zh-TW";
    return "zh";
  }
  if (lang === "pt") return region === "BR" ? "pt-BR" : "pt-PT";
  if (lang === "es") {
    const latam = [
      "419", "MX", "AR", "CO", "CL", "PE", "VE", "EC", "GT", "CU",
      "BO", "DO", "HN", "PY", "SV", "NI", "CR", "PA", "UY",
    ];
    return latam.includes(region) ? "es-419" : "es";
  }
  if (isLocale(lang)) return lang;
  return DEFAULT_LOCALE;
}

export const LOCALE_LABELS = {
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

export function localeDir(locale) {
  return RTL_LOCALES.includes(locale) ? "rtl" : "ltr";
}

export function htmlLang(locale) {
  return locale === "zh" ? "zh-CN" : locale;
}
`;

export const localeStubUrl = dataModule(LOCALE_STUB_SOURCE);
