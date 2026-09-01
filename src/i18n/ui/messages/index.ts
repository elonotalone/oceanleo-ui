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
import { SHARE_COPY_MESSAGES } from "./share-copy";
import { ACCOUNT_SECURITY_MESSAGES } from "./account-security-copy";
import { AUTH_OAUTH_MESSAGES } from "./auth-oauth-copy";
import { PLUGIN_CHROME_MESSAGES } from "./plugin-chrome-copy";
import { WORKBENCH_OFFICE_MESSAGES } from "./workbench-office-copy";
import { EDITOR_PANELS_MESSAGES } from "./editor-panels-copy";

export const UI_MESSAGES: Record<Locale, Record<string, string>> = {
  zh: {
    ...zh,
    ...RECENT_MODEL_AND_TASK_MESSAGES.zh,
    ...AGENT_PROGRESS_MESSAGES.zh,
    ...CLOUD_BROWSER_MESSAGES.zh,
    ...SHARE_COPY_MESSAGES.zh,
    ...ACCOUNT_SECURITY_MESSAGES.zh,
    ...AUTH_OAUTH_MESSAGES.zh,
    ...PLUGIN_CHROME_MESSAGES.zh,
    ...WORKBENCH_OFFICE_MESSAGES.zh,
    ...EDITOR_PANELS_MESSAGES.zh,
  },
  en: {
    ...en,
    ...RECENT_MODEL_AND_TASK_MESSAGES.en,
    ...AGENT_PROGRESS_MESSAGES.en,
    ...CLOUD_BROWSER_MESSAGES.en,
    ...SHARE_COPY_MESSAGES.en,
    ...ACCOUNT_SECURITY_MESSAGES.en,
    ...AUTH_OAUTH_MESSAGES.en,
    ...PLUGIN_CHROME_MESSAGES.en,
    ...WORKBENCH_OFFICE_MESSAGES.en,
    ...EDITOR_PANELS_MESSAGES.en,
  },
  ja: {
    ...ja,
    ...RECENT_MODEL_AND_TASK_MESSAGES.ja,
    ...AGENT_PROGRESS_MESSAGES.ja,
    ...CLOUD_BROWSER_MESSAGES.ja,
    ...SHARE_COPY_MESSAGES.ja,
    ...ACCOUNT_SECURITY_MESSAGES.ja,
    ...AUTH_OAUTH_MESSAGES.ja,
    ...PLUGIN_CHROME_MESSAGES.ja,
    ...WORKBENCH_OFFICE_MESSAGES.ja,
    ...EDITOR_PANELS_MESSAGES.ja,
  },
  ko: {
    ...ko,
    ...RECENT_MODEL_AND_TASK_MESSAGES.ko,
    ...AGENT_PROGRESS_MESSAGES.ko,
    ...CLOUD_BROWSER_MESSAGES.ko,
    ...SHARE_COPY_MESSAGES.ko,
    ...ACCOUNT_SECURITY_MESSAGES.ko,
    ...AUTH_OAUTH_MESSAGES.ko,
    ...PLUGIN_CHROME_MESSAGES.ko,
    ...WORKBENCH_OFFICE_MESSAGES.ko,
    ...EDITOR_PANELS_MESSAGES.ko,
  },
  fr: {
    ...fr,
    ...RECENT_MODEL_AND_TASK_MESSAGES.fr,
    ...AGENT_PROGRESS_MESSAGES.fr,
    ...CLOUD_BROWSER_MESSAGES.fr,
    ...SHARE_COPY_MESSAGES.fr,
    ...ACCOUNT_SECURITY_MESSAGES.fr,
    ...AUTH_OAUTH_MESSAGES.fr,
    ...PLUGIN_CHROME_MESSAGES.fr,
    ...WORKBENCH_OFFICE_MESSAGES.fr,
    ...EDITOR_PANELS_MESSAGES.fr,
  },
  de: {
    ...de,
    ...RECENT_MODEL_AND_TASK_MESSAGES.de,
    ...AGENT_PROGRESS_MESSAGES.de,
    ...CLOUD_BROWSER_MESSAGES.de,
    ...SHARE_COPY_MESSAGES.de,
    ...ACCOUNT_SECURITY_MESSAGES.de,
    ...AUTH_OAUTH_MESSAGES.de,
    ...PLUGIN_CHROME_MESSAGES.de,
    ...WORKBENCH_OFFICE_MESSAGES.de,
    ...EDITOR_PANELS_MESSAGES.de,
  },
  it: {
    ...it,
    ...RECENT_MODEL_AND_TASK_MESSAGES.it,
    ...AGENT_PROGRESS_MESSAGES.it,
    ...CLOUD_BROWSER_MESSAGES.it,
    ...SHARE_COPY_MESSAGES.it,
    ...ACCOUNT_SECURITY_MESSAGES.it,
    ...AUTH_OAUTH_MESSAGES.it,
    ...PLUGIN_CHROME_MESSAGES.it,
    ...WORKBENCH_OFFICE_MESSAGES.it,
    ...EDITOR_PANELS_MESSAGES.it,
  },
  es: {
    ...es,
    ...RECENT_MODEL_AND_TASK_MESSAGES.es,
    ...AGENT_PROGRESS_MESSAGES.es,
    ...CLOUD_BROWSER_MESSAGES.es,
    ...SHARE_COPY_MESSAGES.es,
    ...ACCOUNT_SECURITY_MESSAGES.es,
    ...AUTH_OAUTH_MESSAGES.es,
    ...PLUGIN_CHROME_MESSAGES.es,
    ...WORKBENCH_OFFICE_MESSAGES.es,
    ...EDITOR_PANELS_MESSAGES.es,
  },
  "es-419": {
    ...es419,
    ...RECENT_MODEL_AND_TASK_MESSAGES["es-419"],
    ...AGENT_PROGRESS_MESSAGES["es-419"],
    ...CLOUD_BROWSER_MESSAGES["es-419"],
    ...SHARE_COPY_MESSAGES["es-419"],
    ...ACCOUNT_SECURITY_MESSAGES["es-419"],
    ...AUTH_OAUTH_MESSAGES["es-419"],
    ...PLUGIN_CHROME_MESSAGES["es-419"],
    ...WORKBENCH_OFFICE_MESSAGES["es-419"],
    ...EDITOR_PANELS_MESSAGES["es-419"],
  },
  "pt-BR": {
    ...ptBR,
    ...RECENT_MODEL_AND_TASK_MESSAGES["pt-BR"],
    ...AGENT_PROGRESS_MESSAGES["pt-BR"],
    ...CLOUD_BROWSER_MESSAGES["pt-BR"],
    ...SHARE_COPY_MESSAGES["pt-BR"],
    ...ACCOUNT_SECURITY_MESSAGES["pt-BR"],
    ...AUTH_OAUTH_MESSAGES["pt-BR"],
    ...PLUGIN_CHROME_MESSAGES["pt-BR"],
    ...WORKBENCH_OFFICE_MESSAGES["pt-BR"],
    ...EDITOR_PANELS_MESSAGES["pt-BR"],
  },
  "pt-PT": {
    ...ptPT,
    ...RECENT_MODEL_AND_TASK_MESSAGES["pt-PT"],
    ...AGENT_PROGRESS_MESSAGES["pt-PT"],
    ...CLOUD_BROWSER_MESSAGES["pt-PT"],
    ...SHARE_COPY_MESSAGES["pt-PT"],
    ...ACCOUNT_SECURITY_MESSAGES["pt-PT"],
    ...AUTH_OAUTH_MESSAGES["pt-PT"],
    ...PLUGIN_CHROME_MESSAGES["pt-PT"],
    ...WORKBENCH_OFFICE_MESSAGES["pt-PT"],
    ...EDITOR_PANELS_MESSAGES["pt-PT"],
  },
  vi: {
    ...vi,
    ...RECENT_MODEL_AND_TASK_MESSAGES.vi,
    ...AGENT_PROGRESS_MESSAGES.vi,
    ...CLOUD_BROWSER_MESSAGES.vi,
    ...SHARE_COPY_MESSAGES.vi,
    ...ACCOUNT_SECURITY_MESSAGES.vi,
    ...AUTH_OAUTH_MESSAGES.vi,
    ...PLUGIN_CHROME_MESSAGES.vi,
    ...WORKBENCH_OFFICE_MESSAGES.vi,
    ...EDITOR_PANELS_MESSAGES.vi,
  },
  tr: {
    ...tr,
    ...RECENT_MODEL_AND_TASK_MESSAGES.tr,
    ...AGENT_PROGRESS_MESSAGES.tr,
    ...CLOUD_BROWSER_MESSAGES.tr,
    ...SHARE_COPY_MESSAGES.tr,
    ...ACCOUNT_SECURITY_MESSAGES.tr,
    ...AUTH_OAUTH_MESSAGES.tr,
    ...PLUGIN_CHROME_MESSAGES.tr,
    ...WORKBENCH_OFFICE_MESSAGES.tr,
    ...EDITOR_PANELS_MESSAGES.tr,
  },
  "zh-TW": {
    ...zhTW,
    ...RECENT_MODEL_AND_TASK_MESSAGES["zh-TW"],
    ...AGENT_PROGRESS_MESSAGES["zh-TW"],
    ...CLOUD_BROWSER_MESSAGES["zh-TW"],
    ...SHARE_COPY_MESSAGES["zh-TW"],
    ...ACCOUNT_SECURITY_MESSAGES["zh-TW"],
    ...AUTH_OAUTH_MESSAGES["zh-TW"],
    ...PLUGIN_CHROME_MESSAGES["zh-TW"],
    ...WORKBENCH_OFFICE_MESSAGES["zh-TW"],
    ...EDITOR_PANELS_MESSAGES["zh-TW"],
  },
  ar: {
    ...ar,
    ...RECENT_MODEL_AND_TASK_MESSAGES.ar,
    ...AGENT_PROGRESS_MESSAGES.ar,
    ...CLOUD_BROWSER_MESSAGES.ar,
    ...SHARE_COPY_MESSAGES.ar,
    ...ACCOUNT_SECURITY_MESSAGES.ar,
    ...AUTH_OAUTH_MESSAGES.ar,
    ...PLUGIN_CHROME_MESSAGES.ar,
    ...WORKBENCH_OFFICE_MESSAGES.ar,
    ...EDITOR_PANELS_MESSAGES.ar,
  },
  th: {
    ...th,
    ...RECENT_MODEL_AND_TASK_MESSAGES.th,
    ...AGENT_PROGRESS_MESSAGES.th,
    ...CLOUD_BROWSER_MESSAGES.th,
    ...SHARE_COPY_MESSAGES.th,
    ...ACCOUNT_SECURITY_MESSAGES.th,
    ...AUTH_OAUTH_MESSAGES.th,
    ...PLUGIN_CHROME_MESSAGES.th,
    ...WORKBENCH_OFFICE_MESSAGES.th,
    ...EDITOR_PANELS_MESSAGES.th,
  },
  hi: {
    ...hi,
    ...RECENT_MODEL_AND_TASK_MESSAGES.hi,
    ...AGENT_PROGRESS_MESSAGES.hi,
    ...CLOUD_BROWSER_MESSAGES.hi,
    ...SHARE_COPY_MESSAGES.hi,
    ...ACCOUNT_SECURITY_MESSAGES.hi,
    ...AUTH_OAUTH_MESSAGES.hi,
    ...PLUGIN_CHROME_MESSAGES.hi,
    ...WORKBENCH_OFFICE_MESSAGES.hi,
    ...EDITOR_PANELS_MESSAGES.hi,
  },
};
