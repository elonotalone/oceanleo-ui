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

export const UI_MESSAGES: Record<Locale, Record<string, string>> = {
  zh: { ...zh, ...RECENT_MODEL_AND_TASK_MESSAGES.zh },
  en: { ...en, ...RECENT_MODEL_AND_TASK_MESSAGES.en },
  ja: { ...ja, ...RECENT_MODEL_AND_TASK_MESSAGES.ja },
  ko: { ...ko, ...RECENT_MODEL_AND_TASK_MESSAGES.ko },
  fr: { ...fr, ...RECENT_MODEL_AND_TASK_MESSAGES.fr },
  de: { ...de, ...RECENT_MODEL_AND_TASK_MESSAGES.de },
  it: { ...it, ...RECENT_MODEL_AND_TASK_MESSAGES.it },
  es: { ...es, ...RECENT_MODEL_AND_TASK_MESSAGES.es },
  "es-419": { ...es419, ...RECENT_MODEL_AND_TASK_MESSAGES["es-419"] },
  "pt-BR": { ...ptBR, ...RECENT_MODEL_AND_TASK_MESSAGES["pt-BR"] },
  "pt-PT": { ...ptPT, ...RECENT_MODEL_AND_TASK_MESSAGES["pt-PT"] },
  vi: { ...vi, ...RECENT_MODEL_AND_TASK_MESSAGES.vi },
  tr: { ...tr, ...RECENT_MODEL_AND_TASK_MESSAGES.tr },
  "zh-TW": { ...zhTW, ...RECENT_MODEL_AND_TASK_MESSAGES["zh-TW"] },
  ar: { ...ar, ...RECENT_MODEL_AND_TASK_MESSAGES.ar },
  th: { ...th, ...RECENT_MODEL_AND_TASK_MESSAGES.th },
  hi: { ...hi, ...RECENT_MODEL_AND_TASK_MESSAGES.hi },
};
