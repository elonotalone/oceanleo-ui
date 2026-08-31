import type { Locale } from "../../config";
import {
  assemblePluginChromeCopy,
  PLUGIN_CHROME_COPY_KEYS,
} from "./plugin-chrome-copy-base";
import { PLUGIN_CHROME_COPY_EASTERN } from "./plugin-chrome-copy-eastern";
import { PLUGIN_CHROME_COPY_WESTERN } from "./plugin-chrome-copy-western";

export { PLUGIN_CHROME_COPY_KEYS };

/**
 * 17 语言 × 统一插件外壳与三个 extracted 插件的文案，形状是 `useUI()` 要的
 * 「中文原文 → 译文」平表。`assemblePluginChromeCopy` 的入参类型是
 * `Record<Exclude<Locale, "zh">, PluginChromeCopyMessages>`，所以少一个语种
 * 或少一条 key，tsc 就编不过。
 */
export const PLUGIN_CHROME_MESSAGES: Record<Locale, Record<string, string>> =
  assemblePluginChromeCopy({
    ...PLUGIN_CHROME_COPY_WESTERN,
    ...PLUGIN_CHROME_COPY_EASTERN,
  });
