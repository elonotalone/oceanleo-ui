// 2026-10-23 leobay-projects 波 W08 的分表。只由 W08 改；注册在 shell-overhaul-copy.ts（父改）。
// 写法：const SOURCE = { key: "简体中文原文" } as const;
//       export const LBP_W08_MESSAGES = assembleCopy(SOURCE, { en: {...}, ... 16 个语种 });
// 只放新的中文原文；已有词条不要在这里重定义（合并次序会让它覆盖别处的译文）。
import { emptyCopy } from "./shell-overhaul-copy-shared";

export const LBP_W08_MESSAGES = emptyCopy();
