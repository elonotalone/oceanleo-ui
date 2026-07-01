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

export const UI_MESSAGES: Record<Locale, Record<string, string>> = {
  zh,
  en,
  ja,
  ko,
  fr,
  de,
  it,
  es,
  "es-419": es419,
  "pt-BR": ptBR,
  "pt-PT": ptPT,
  vi,
  tr,
  "zh-TW": zhTW,
  ar,
  th,
  hi,
};
