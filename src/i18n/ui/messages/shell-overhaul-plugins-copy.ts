// 输入框插件浮层 / 模型组浮层（单元 5：composer-plugins）。
// 只有该单元改这张表。写法见 shell-overhaul-copy-shared.ts：
//   const SOURCE = { key: "中文原文" } as const;
//   export const SHELL_OVERHAUL_PLUGINS_MESSAGES = assembleCopy(SOURCE, { en: {...}, de: {...}, ... 16 个语种 });
// 还没有文案时保持 emptyCopy()。

import { emptyCopy } from "./shell-overhaul-copy-shared";
import type { Locale } from "../../config";

export const SHELL_OVERHAUL_PLUGINS_MESSAGES: Record<Locale, Record<string, string>> = emptyCopy();
