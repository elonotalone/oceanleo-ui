// 2026-09-21 外壳整改（云电脑坞 / 我的设备 / 设置中心 / 侧栏页脚 / 输入框插件）共用的
// 词典骨架。每个工作单元只改自己那一张分表（*-dock / *-devices / *-settings /
// *-footer / *-plugins），聚合与注册（index.ts / load.ts）只在 shell-overhaul-copy.ts 做一次。
//
// 分表约定：
//   SOURCE = { name: "简体中文原文" } as const
//   每个语种给全 17 张同名表；缺一条 key 或少一个语种，assembleCopy 的入参类型会让 tsc 编不过。

import { LOCALES, type Locale } from "../../config";

export type CopyMessagesOf<S extends Record<string, string>> = Record<keyof S, string>;

export function copyDictionaryFrom<S extends Record<string, string>>(
  source: S,
  messages: CopyMessagesOf<S>,
): Record<string, string> {
  return Object.fromEntries(
    (Object.keys(source) as (keyof S)[]).map((name) => [source[name], messages[name]]),
  );
}

export function assembleCopy<S extends Record<string, string>>(
  source: S,
  translations: Record<Exclude<Locale, "zh">, CopyMessagesOf<S>>,
): Record<Locale, Record<string, string>> {
  return Object.fromEntries(
    LOCALES.map((locale) => [
      locale,
      copyDictionaryFrom(
        source,
        locale === "zh" ? (source as CopyMessagesOf<S>) : translations[locale],
      ),
    ]),
  ) as Record<Locale, Record<string, string>>;
}

/** 空分表：还没有文案的单元先占位，聚合器与 tsc 都能过。 */
export function emptyCopy(): Record<Locale, Record<string, string>> {
  return Object.fromEntries(LOCALES.map((locale) => [locale, {}])) as Record<
    Locale,
    Record<string, string>
  >;
}
