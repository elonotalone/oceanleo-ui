import type { Locale } from "../../config";
import { assembleByokCopy, BYOK_COPY_KEYS } from "./byok-copy-base";
import { BYOK_COPY_EASTERN } from "./byok-copy-eastern";
import { BYOK_COPY_WESTERN } from "./byok-copy-western";

export { BYOK_COPY_KEYS };

/**
 * 17 语言 × BYOK 设置页文案，形状是 `useUI()` 要的「中文原文 → 译文」平表。
 * `assembleByokCopy` 的入参类型是 `Record<Exclude<Locale, "zh">, ByokCopyMessages>`，
 * 所以少一个语种或少一条 key，tsc 就编不过。
 */
export const BYOK_COPY_MESSAGES: Record<Locale, Record<string, string>> =
  assembleByokCopy({
    ...BYOK_COPY_WESTERN,
    ...BYOK_COPY_EASTERN,
  });
