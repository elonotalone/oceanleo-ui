import type { Locale } from "../../config";
import {
  assembleAccountSecurityCopy,
  ACCOUNT_SECURITY_COPY_KEYS,
} from "./account-security-copy-base";
import { ACCOUNT_SECURITY_COPY_EASTERN } from "./account-security-copy-eastern";
import { ACCOUNT_SECURITY_COPY_WESTERN } from "./account-security-copy-western";

export { ACCOUNT_SECURITY_COPY_KEYS };

/**
 * 17 语言 × 账号安全文案，形状是 `useUI()` 要的「中文原文 → 译文」平表。
 * `assembleAccountSecurityCopy` 的入参类型是
 * `Record<Exclude<Locale,"zh">, AccountSecurityCopyMessages>`，
 * 所以少一个语种或少一条 key，`tsc` 就编不过——不必靠人记得补齐。
 */
export const ACCOUNT_SECURITY_MESSAGES: Record<Locale, Record<string, string>> =
  assembleAccountSecurityCopy({
    ...ACCOUNT_SECURITY_COPY_WESTERN,
    ...ACCOUNT_SECURITY_COPY_EASTERN,
  });
