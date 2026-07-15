import {
  DEFAULT_LOCALE,
  normalizeLocale,
  type Locale,
} from "../../config";
import type {
  UIMessageLoader,
  UIMessageModule,
} from "./runtime";

const BASE_MESSAGE_LOADERS = {
  de: () => import("./de"),
  en: () => import("./en"),
  es: () => import("./es"),
  "es-419": () => import("./es-419"),
  fr: () => import("./fr"),
  it: () => import("./it"),
  "pt-BR": () => import("./pt-BR"),
  "pt-PT": () => import("./pt-PT"),
  vi: () => import("./vi"),
  tr: () => import("./tr"),
  zh: async () => ({ default: {} }),
  "zh-TW": () => import("./zh-TW"),
  ja: () => import("./ja"),
  ko: () => import("./ko"),
  ar: () => import("./ar"),
  th: () => import("./th"),
  hi: () => import("./hi"),
} satisfies Record<Locale, () => Promise<UIMessageModule>>;

/**
 * Load only the dictionary selected for this request. The default Chinese UI
 * needs no payload because every call already supplies the Chinese source text
 * as its fallback key.
 */
export const loadUiMessages: UIMessageLoader = async (rawLocale) => {
  const locale = normalizeLocale(rawLocale);
  if (locale === DEFAULT_LOCALE) return {};

  const [base, recent, progress] = await Promise.all([
    BASE_MESSAGE_LOADERS[locale](),
    import("./recent-model-and-task-copy"),
    import("./agent-progress-copy"),
  ]);
  return {
    ...base.default,
    ...recent.RECENT_MODEL_AND_TASK_MESSAGES[locale],
    ...progress.AGENT_PROGRESS_MESSAGES[locale],
  };
};
