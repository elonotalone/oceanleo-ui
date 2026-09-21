// 2026-09-21 外壳整改词典聚合器：五张分表按语种合并成一张，index.ts / load.ts 只注册这一张。
// 分表各归一个工作单元；本文件与 index.ts / load.ts 只由整合者改。

import { LOCALES, type Locale } from "../../config";
import { SHELL_OVERHAUL_DOCK_MESSAGES } from "./shell-overhaul-dock-copy";
import { SHELL_OVERHAUL_DEVICES_MESSAGES } from "./shell-overhaul-devices-copy";
import { SHELL_OVERHAUL_SETTINGS_MESSAGES } from "./shell-overhaul-settings-copy";
import { SHELL_OVERHAUL_FOOTER_MESSAGES } from "./shell-overhaul-footer-copy";
import { SHELL_OVERHAUL_PLUGINS_MESSAGES } from "./shell-overhaul-plugins-copy";
import { SHELL_OVERHAUL_LEGACY_MESSAGES } from "./shell-overhaul-legacy-copy";

const PARTS = [
  SHELL_OVERHAUL_DOCK_MESSAGES,
  SHELL_OVERHAUL_DEVICES_MESSAGES,
  SHELL_OVERHAUL_SETTINGS_MESSAGES,
  SHELL_OVERHAUL_FOOTER_MESSAGES,
  SHELL_OVERHAUL_PLUGINS_MESSAGES,
  SHELL_OVERHAUL_LEGACY_MESSAGES,
];

export const SHELL_OVERHAUL_MESSAGES: Record<Locale, Record<string, string>> =
  Object.fromEntries(
    LOCALES.map((locale) => [
      locale,
      Object.assign({}, ...PARTS.map((part) => part[locale] ?? {})),
    ]),
  ) as Record<Locale, Record<string, string>>;
