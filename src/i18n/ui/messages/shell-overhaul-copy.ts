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
import { TPP_W1_MESSAGES } from "./tpp-w1-copy";
import { TPP_W3_MESSAGES } from "./tpp-w3-copy";
import { TPP_W4_MESSAGES } from "./tpp-w4-copy";
import { TPP_W5_MESSAGES } from "./tpp-w5-copy";
import { EAS_W03_MESSAGES } from "./eas-w03-copy";
import { EAS_W04_MESSAGES } from "./eas-w04-copy";
import { EAS_W05_MESSAGES } from "./eas-w05-copy";
import { EAS_W06_MESSAGES } from "./eas-w06-copy";
import { EAS_W07_MESSAGES } from "./eas-w07-copy";
import { EAS_W08_MESSAGES } from "./eas-w08-copy";
import { EAS_W09_MESSAGES } from "./eas-w09-copy";
import { EAS_W11_MESSAGES } from "./eas-w11-copy";
import { EAS_W12_MESSAGES } from "./eas-w12-copy";
import { EAS_W13_MESSAGES } from "./eas-w13-copy";
import { EAS_W14_MESSAGES } from "./eas-w14-copy";
import { EAS_W15_MESSAGES } from "./eas-w15-copy";
import { EAS_W16_MESSAGES } from "./eas-w16-copy";
import { EAS_W17_MESSAGES } from "./eas-w17-copy";
import { EAS_W18_MESSAGES } from "./eas-w18-copy";
import { EAS_W19_MESSAGES } from "./eas-w19-copy";
import { EAS_W20_MESSAGES } from "./eas-w20-copy";
import { EAS_W21_MESSAGES } from "./eas-w21-copy";
import { EAS_W22_MESSAGES } from "./eas-w22-copy";
import { EAS_W23_MESSAGES } from "./eas-w23-copy";
import { REGRESSION_0924_MESSAGES } from "./regression-0924-copy";

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
  TPP_W1_MESSAGES,
  TPP_W3_MESSAGES,
  TPP_W4_MESSAGES,
  TPP_W5_MESSAGES,
  EAS_W03_MESSAGES,
  EAS_W04_MESSAGES,
  EAS_W05_MESSAGES,
  EAS_W06_MESSAGES,
  EAS_W07_MESSAGES,
  EAS_W08_MESSAGES,
  EAS_W09_MESSAGES,
  EAS_W11_MESSAGES,
  EAS_W12_MESSAGES,
  EAS_W13_MESSAGES,
  EAS_W14_MESSAGES,
  EAS_W15_MESSAGES,
  EAS_W16_MESSAGES,
  EAS_W17_MESSAGES,
  EAS_W18_MESSAGES,
  EAS_W19_MESSAGES,
  EAS_W20_MESSAGES,
  EAS_W21_MESSAGES,
  EAS_W22_MESSAGES,
  EAS_W23_MESSAGES,
  REGRESSION_0924_MESSAGES,
];

export const SHELL_OVERHAUL_MESSAGES: Record<Locale, Record<string, string>> =
  Object.fromEntries(
    LOCALES.map((locale) => [
      locale,
      Object.assign({}, ...PARTS.map((part) => part[locale] ?? {})),
    ]),
  ) as Record<Locale, Record<string, string>>;
