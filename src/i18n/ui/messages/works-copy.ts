import type { Locale } from "../../config";

// W8 Library works overview and server works — wave 2026-11-09. Chinese source text is the key; English is the value.
// Other locales fall back to English until a translated row exists.
const EN: Record<string, string> = {
};

export function worksCopy(locale: Locale): Record<string, string> {
  if (locale === "zh") return Object.fromEntries(Object.keys(EN).map((key) => [key, key]));
  return { ...EN };
}
