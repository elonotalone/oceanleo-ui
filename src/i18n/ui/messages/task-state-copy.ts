import type { Locale } from "../../config";

// W2 task list state (titles, order, working) — wave 2026-11-09. Chinese source text is the key; English is the value.
// Other locales fall back to English until a translated row exists.
const EN: Record<string, string> = {
  "等待你的操作": "Waiting for your input",
  "进行中": "Working",
};

export function taskStateCopy(locale: Locale): Record<string, string> {
  if (locale === "zh") return Object.fromEntries(Object.keys(EN).map((key) => [key, key]));
  return { ...EN };
}
