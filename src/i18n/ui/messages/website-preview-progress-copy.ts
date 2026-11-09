import type { Locale } from "../../config";

// W3 Library website preview progress — wave 2026-11-09. Chinese source text is the key; English is the value.
// Other locales fall back to English until a translated row exists.
const EN: Record<string, string> = {
  "正在准备网站源码…": "Preparing website source…",
  "正在安装网站依赖…": "Installing website dependencies…",
  "正在启动网站预览…": "Starting the website preview…",
  "网站预览启动失败，请重试。": "The website preview could not start. Try again.",
};

export function websitePreviewProgressCopy(locale: Locale): Record<string, string> {
  if (locale === "zh") return Object.fromEntries(Object.keys(EN).map((key) => [key, key]));
  return { ...EN };
}
