// 2026-09-23 cloud-computer-polish 波 W10 的分表。只由 W10 改；注册在 shell-overhaul-copy.ts（父改）。
// 写法：const SOURCE = { key: "简体中文原文" } as const;
//       export const CCP_W10_MESSAGES = assembleCopy(SOURCE, { en: {...}, ... 16 个语种 });
import { emptyCopy } from "./shell-overhaul-copy-shared";

export const CCP_W10_MESSAGES = emptyCopy();
