// @oceanleo/ui — 2026-10-23 编辑器整改波的新文案聚合（17 语）。
//
// 为什么一人一册：这一波 16 位 owner 同时加文案。共用一张表的话，谁 `git commit`
// 都会把别人写了一半的词条一起带走；所以每位 owner 只改自己的
// `editor-overhaul-copy-<id>.ts`，本文件只负责合并，归父 agent 所有。
// index.ts 与 load.ts 两边都登记了这一册（load.ts 头注释里那条「两边同时加」的规矩）。

import { LOCALES, type Locale } from "../../config";
import type { EditorOverhaulCopy } from "./editor-overhaul-copy-types";
import { EDITOR_OVERHAUL_W01_COPY } from "./editor-overhaul-copy-w01";
import { EDITOR_OVERHAUL_W02_COPY } from "./editor-overhaul-copy-w02";
import { EDITOR_OVERHAUL_W03_COPY } from "./editor-overhaul-copy-w03";
import { EDITOR_OVERHAUL_W04_COPY } from "./editor-overhaul-copy-w04";
import { EDITOR_OVERHAUL_W05_COPY } from "./editor-overhaul-copy-w05";
import { EDITOR_OVERHAUL_W06_COPY } from "./editor-overhaul-copy-w06";
import { EDITOR_OVERHAUL_W07_COPY } from "./editor-overhaul-copy-w07";
import { EDITOR_OVERHAUL_W08_COPY } from "./editor-overhaul-copy-w08";
import { EDITOR_OVERHAUL_W09_COPY } from "./editor-overhaul-copy-w09";
import { EDITOR_OVERHAUL_W10_COPY } from "./editor-overhaul-copy-w10";
import { EDITOR_OVERHAUL_W11_COPY } from "./editor-overhaul-copy-w11";
import { EDITOR_OVERHAUL_W12_COPY } from "./editor-overhaul-copy-w12";
import { EDITOR_OVERHAUL_W13_COPY } from "./editor-overhaul-copy-w13";
import { EDITOR_OVERHAUL_W14_COPY } from "./editor-overhaul-copy-w14";
import { EDITOR_OVERHAUL_W15_COPY } from "./editor-overhaul-copy-w15";
import { EDITOR_OVERHAUL_W16_COPY } from "./editor-overhaul-copy-w16";

const PARTS: readonly EditorOverhaulCopy[] = [
  EDITOR_OVERHAUL_W01_COPY,
  EDITOR_OVERHAUL_W02_COPY,
  EDITOR_OVERHAUL_W03_COPY,
  EDITOR_OVERHAUL_W04_COPY,
  EDITOR_OVERHAUL_W05_COPY,
  EDITOR_OVERHAUL_W06_COPY,
  EDITOR_OVERHAUL_W07_COPY,
  EDITOR_OVERHAUL_W08_COPY,
  EDITOR_OVERHAUL_W09_COPY,
  EDITOR_OVERHAUL_W10_COPY,
  EDITOR_OVERHAUL_W11_COPY,
  EDITOR_OVERHAUL_W12_COPY,
  EDITOR_OVERHAUL_W13_COPY,
  EDITOR_OVERHAUL_W14_COPY,
  EDITOR_OVERHAUL_W15_COPY,
  EDITOR_OVERHAUL_W16_COPY,
];

function merged(locale: Exclude<Locale, "zh">): Record<string, string> {
  return Object.assign({}, ...PARTS.map((part) => part[locale]));
}

/** 中文站：key 就是值；从英文表的 key 推，避免手抄一遍后与原文漂移。 */
function identity(): Record<string, string> {
  const keys = new Set<string>();
  for (const part of PARTS) for (const key of Object.keys(part.en)) keys.add(key);
  return Object.fromEntries([...keys].map((key) => [key, key]));
}

export const EDITOR_OVERHAUL_MESSAGES: Record<Locale, Record<string, string>> =
  Object.fromEntries(
    LOCALES.map((locale) => [
      locale,
      locale === "zh" ? identity() : merged(locale),
    ]),
  ) as Record<Locale, Record<string, string>>;
