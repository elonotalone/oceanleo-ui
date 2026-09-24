// 2026-09-21 外壳整改词典聚合器：五张分表按语种合并成一张，index.ts / load.ts 只注册这一张。
// 分表各归一个工作单元；本文件与 index.ts / load.ts 只由整合者改。

import { LOCALES, type Locale } from "../../config";
import { SHELL_OVERHAUL_DOCK_MESSAGES } from "./shell-overhaul-dock-copy";
import { SHELL_OVERHAUL_DEVICES_MESSAGES } from "./shell-overhaul-devices-copy";
import { SHELL_OVERHAUL_SETTINGS_MESSAGES } from "./shell-overhaul-settings-copy";
import { SHELL_OVERHAUL_FOOTER_MESSAGES } from "./shell-overhaul-footer-copy";
import { SHELL_OVERHAUL_PLUGINS_MESSAGES } from "./shell-overhaul-plugins-copy";
import { SHELL_OVERHAUL_LEGACY_MESSAGES } from "./shell-overhaul-legacy-copy";
import { SHELL_OCEANLEO_PANE_MESSAGES } from "./shell-oceanleo-pane-copy";
import { SHELL_ENDED_MESSAGES } from "./shell-ended-copy";
import { SERVER_PAGE_MESSAGES } from "./server-page-copy";
import { TERMINAL_CARD_MESSAGES } from "./terminal-card-copy";
import { ACP_CARD_MESSAGES } from "./acp-card-copy";
import { CCP_W1_MESSAGES } from "./ccp-w1-copy";
import { CCP_W2_MESSAGES } from "./ccp-w2-copy";
import { CCP_W3_MESSAGES } from "./ccp-w3-copy";
import { CCP_W5_MESSAGES } from "./ccp-w5-copy";
import { CCP_W8_MESSAGES } from "./ccp-w8-copy";
import { CCP_W9_MESSAGES } from "./ccp-w9-copy";
import { CCP_W10_MESSAGES } from "./ccp-w10-copy";
import { CCP_W11_MESSAGES } from "./ccp-w11-copy";
import { CCP_W12_MESSAGES } from "./ccp-w12-copy";
import { CCP_S1_MESSAGES } from "./ccp-s1-copy";

const PARTS = [
  SHELL_OVERHAUL_DOCK_MESSAGES,
  SHELL_OVERHAUL_DEVICES_MESSAGES,
  SHELL_OVERHAUL_SETTINGS_MESSAGES,
  SHELL_OVERHAUL_FOOTER_MESSAGES,
  SHELL_OVERHAUL_PLUGINS_MESSAGES,
  SHELL_OVERHAUL_LEGACY_MESSAGES,
  SHELL_OCEANLEO_PANE_MESSAGES,
  SHELL_ENDED_MESSAGES,
  SERVER_PAGE_MESSAGES,
  TERMINAL_CARD_MESSAGES,
  ACP_CARD_MESSAGES,
  CCP_W1_MESSAGES,
  CCP_W2_MESSAGES,
  CCP_W3_MESSAGES,
  CCP_W5_MESSAGES,
  CCP_W8_MESSAGES,
  CCP_W9_MESSAGES,
  CCP_W10_MESSAGES,
  CCP_W11_MESSAGES,
  CCP_W12_MESSAGES,
  CCP_S1_MESSAGES,
];

export const SHELL_OVERHAUL_MESSAGES: Record<Locale, Record<string, string>> =
  Object.fromEntries(
    LOCALES.map((locale) => [
      locale,
      Object.assign({}, ...PARTS.map((part) => part[locale] ?? {})),
    ]),
  ) as Record<Locale, Record<string, string>>;
