import type { Locale } from "../../config";
import { assembleShareCopy, SHARE_COPY_KEYS } from "./share-copy-base";
import { SHARE_COPY_EASTERN } from "./share-copy-eastern";
import { SHARE_COPY_WESTERN } from "./share-copy-western";

export { SHARE_COPY_KEYS };

/**
 * 17 语言 × 71 条选段分享 / 长图 / 回放页文案，形状是 `useUI()` 要的「中文原文 → 译文」平表。
 * `assembleShareCopy` 的入参类型是 `Record<Exclude<Locale, "zh">, ShareCopyMessages>`，
 * 所以少一个语种或少一条 key，tsc 就编不过——不必靠人记得补齐。
 */
export const SHARE_COPY_MESSAGES: Record<Locale, Record<string, string>> =
  assembleShareCopy({
    ...SHARE_COPY_WESTERN,
    ...SHARE_COPY_EASTERN,
  });
