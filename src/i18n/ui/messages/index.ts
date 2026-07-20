// @oceanleo/ui — UI 文案词典聚合（17 语言）。
// key = 简体中文原文（规范来源见 zh.ts）；每种语言一张平表 { 中文原文: 译文 }。
// useUI() 按当前 locale 选表，未命中回退中文原文（见 ../useUI.ts）。

import type { Locale } from "../../config";
import zh from "./zh";
import en from "./en";
import ja from "./ja";
import ko from "./ko";
import fr from "./fr";
import de from "./de";
import it from "./it";
import es from "./es";
import es419 from "./es-419";
import ptBR from "./pt-BR";
import ptPT from "./pt-PT";
import vi from "./vi";
import tr from "./tr";
import zhTW from "./zh-TW";
import ar from "./ar";
import th from "./th";
import hi from "./hi";
import { RECENT_MODEL_AND_TASK_MESSAGES } from "./recent-model-and-task-copy";
import { AGENT_PROGRESS_MESSAGES } from "./agent-progress-copy";
import { CLOUD_BROWSER_MESSAGES } from "./cloud-browser-copy";

export const UI_MESSAGES: Record<Locale, Record<string, string>> = {
  zh: { ...zh, ...RECENT_MODEL_AND_TASK_MESSAGES.zh, ...AGENT_PROGRESS_MESSAGES.zh, ...CLOUD_BROWSER_MESSAGES.zh },
  en: { ...en, ...RECENT_MODEL_AND_TASK_MESSAGES.en, ...AGENT_PROGRESS_MESSAGES.en, ...CLOUD_BROWSER_MESSAGES.en },
  ja: { ...ja, ...RECENT_MODEL_AND_TASK_MESSAGES.ja, ...AGENT_PROGRESS_MESSAGES.ja, ...CLOUD_BROWSER_MESSAGES.ja },
  ko: { ...ko, ...RECENT_MODEL_AND_TASK_MESSAGES.ko, ...AGENT_PROGRESS_MESSAGES.ko, ...CLOUD_BROWSER_MESSAGES.ko },
  fr: { ...fr, ...RECENT_MODEL_AND_TASK_MESSAGES.fr, ...AGENT_PROGRESS_MESSAGES.fr, ...CLOUD_BROWSER_MESSAGES.fr },
  de: { ...de, ...RECENT_MODEL_AND_TASK_MESSAGES.de, ...AGENT_PROGRESS_MESSAGES.de, ...CLOUD_BROWSER_MESSAGES.de },
  it: { ...it, ...RECENT_MODEL_AND_TASK_MESSAGES.it, ...AGENT_PROGRESS_MESSAGES.it, ...CLOUD_BROWSER_MESSAGES.it },
  es: { ...es, ...RECENT_MODEL_AND_TASK_MESSAGES.es, ...AGENT_PROGRESS_MESSAGES.es, ...CLOUD_BROWSER_MESSAGES.es },
  "es-419": {
    ...es419,
    ...RECENT_MODEL_AND_TASK_MESSAGES["es-419"],
    ...AGENT_PROGRESS_MESSAGES["es-419"],
    ...CLOUD_BROWSER_MESSAGES["es-419"],
  },
  "pt-BR": {
    ...ptBR,
    ...RECENT_MODEL_AND_TASK_MESSAGES["pt-BR"],
    ...AGENT_PROGRESS_MESSAGES["pt-BR"],
    ...CLOUD_BROWSER_MESSAGES["pt-BR"],
  },
  "pt-PT": {
    ...ptPT,
    ...RECENT_MODEL_AND_TASK_MESSAGES["pt-PT"],
    ...AGENT_PROGRESS_MESSAGES["pt-PT"],
    ...CLOUD_BROWSER_MESSAGES["pt-PT"],
  },
  vi: { ...vi, ...RECENT_MODEL_AND_TASK_MESSAGES.vi, ...AGENT_PROGRESS_MESSAGES.vi, ...CLOUD_BROWSER_MESSAGES.vi },
  tr: { ...tr, ...RECENT_MODEL_AND_TASK_MESSAGES.tr, ...AGENT_PROGRESS_MESSAGES.tr, ...CLOUD_BROWSER_MESSAGES.tr },
  "zh-TW": {
    ...zhTW,
    ...RECENT_MODEL_AND_TASK_MESSAGES["zh-TW"],
    ...AGENT_PROGRESS_MESSAGES["zh-TW"],
    ...CLOUD_BROWSER_MESSAGES["zh-TW"],
  },
  ar: { ...ar, ...RECENT_MODEL_AND_TASK_MESSAGES.ar, ...AGENT_PROGRESS_MESSAGES.ar, ...CLOUD_BROWSER_MESSAGES.ar },
  th: { ...th, ...RECENT_MODEL_AND_TASK_MESSAGES.th, ...AGENT_PROGRESS_MESSAGES.th, ...CLOUD_BROWSER_MESSAGES.th },
  hi: { ...hi, ...RECENT_MODEL_AND_TASK_MESSAGES.hi, ...AGENT_PROGRESS_MESSAGES.hi, ...CLOUD_BROWSER_MESSAGES.hi },
};
