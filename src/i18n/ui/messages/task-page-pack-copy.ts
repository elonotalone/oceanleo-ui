// @oceanleo/ui — 2026-11-06 task-page-pack 波的新文案聚合（17 语）。
//
// 每位 owner 一册（T8 Memo、T9 连接器、T10 网站管理；任务页与右侧栏卡片归父），本文件只负责合并，归父 agent 所有。
// index.ts 与 load.ts 两边都登记了这一册（load.ts 头注释里那条「两边同时加」的规矩）。

import { LOCALES, type Locale } from "../../config";
import type { TaskPagePackCopy } from "./task-page-pack-copy-types";
import { TASK_PAGE_PACK_PARENT_COPY } from "./task-page-pack-copy-parent";
import { LIBRARY_MEMO_COPY } from "./library-memo-copy";
import { CONNECTORS_COPY } from "./connectors-copy";
import { WEBSITE_MANAGEMENT_COPY } from "./website-management-copy";
import { THIN_GATEWAY_PAGE_COPY } from "./thin-gateway-page-copy";
import { UX_TS_COPY } from "./ux-ts-copy";

const PARTS: readonly TaskPagePackCopy[] = [
  TASK_PAGE_PACK_PARENT_COPY,
  LIBRARY_MEMO_COPY,
  CONNECTORS_COPY,
  WEBSITE_MANAGEMENT_COPY,
  THIN_GATEWAY_PAGE_COPY,
  UX_TS_COPY,
];

/** 本波全部中文原文（中文站 key 等于值）；i18n 判据按它逐条查 16 语。 */
export const TASK_PAGE_PACK_SOURCE: readonly string[] = [
  ...new Set(PARTS.flatMap((part) => Object.keys(part.en))),
];

export const TASK_PAGE_PACK_MESSAGES: Record<Locale, Record<string, string>> =
  Object.fromEntries(
    LOCALES.map((locale) => [
      locale,
      locale === "zh"
        ? Object.fromEntries(TASK_PAGE_PACK_SOURCE.map((key) => [key, key]))
        : Object.assign({}, ...PARTS.map((part) => part[locale])),
    ]),
  ) as Record<Locale, Record<string, string>>;
