import { LOCALES, type Locale } from "../../config";

/** Task-page source copy used by the timeline composer and delivery affordances. */
export const TASK_PAGE_SOURCE = {
  queued: "已排队",
  injected: "{agent} 下一步会看到",
  removeQueued: "移除排队消息",
  returnToLatest: "回到最新 · {count} 条新消息",
  returnToLatestShort: "回到最新",
  empty: "在下方输入，开始与 agent 对话。",
} as const;

/**
 * The task page currently uses `tt` with these source strings directly. Keep a
 * locale-shaped export so the parent can register this pack in the shared
 * message assembly; untranslated locales deliberately fall back to Chinese.
 */
export const TASK_PAGE_MESSAGES = Object.fromEntries(
  LOCALES.map((locale) => [locale, TASK_PAGE_SOURCE]),
) as Record<Locale, Record<keyof typeof TASK_PAGE_SOURCE, string>>;

export const TASK_PAGE_COPY = TASK_PAGE_SOURCE;
