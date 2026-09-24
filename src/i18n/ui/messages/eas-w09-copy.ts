// 2026-09-24 editors-and-shell 波 W09 的分表。只由 W09 改；注册在 shell-overhaul-copy.ts（父改）。
// 写法：const SOURCE = { key: "简体中文原文" } as const;
//       export const EAS_W09_MESSAGES = assembleCopy(SOURCE, { en: {...}, ... 16 个语种 });
import { emptyCopy } from "./shell-overhaul-copy-shared";

export const EAS_W09_MESSAGES = emptyCopy();
