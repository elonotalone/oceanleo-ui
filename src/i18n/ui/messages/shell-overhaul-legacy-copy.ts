// 云电脑 / 我的设备 / 历史侧栏里在 2026-09-21 之前就存在、却从未进过词典的中文原文
// （单元 6：legacy-copy-sweep）。清单见 oceandino
// docs/work-logs/2026-09/shell-overhaul/tasks/W6-missing-strings.txt。
// 只有该单元改这张表。写法见 shell-overhaul-copy-shared.ts。

import { emptyCopy } from "./shell-overhaul-copy-shared";
import type { Locale } from "../../config";

export const SHELL_OVERHAUL_LEGACY_MESSAGES: Record<Locale, Record<string, string>> = emptyCopy();
