/**
 * 功能数据存完之后交回给工作台的那件东西 —— **不带素材回执**。
 *
 * 素材回执是"这一版已经进库了"的凭据：对象存储上的 project URL、新 revision 的
 * id、上一版 revision 的 id、交付格式。它们只有在真的发了 revision 之后才存在。
 * 功能数据（用户在台账里记的账、在地图上点的标注、在换算器里填的数）**不进库**：
 * 没有 URL、没有 revision、没有交付格式，字节就在手上，由工作台记进本次会话。
 *
 * 给这一档套上回执字段，等于对外宣称库里多了一件可下载的东西。今天的取值全是
 * 空串，消费方按真值判，所以还不发作；但形状一旦立住，下游任何一处改成
 * `"editor_revision_id" in meta` 或 `meta.editor_project_url !== undefined`
 * 就当场变成事故。这是同一个"给功能数据套素材形状"的根因，`GridRoute` 那一处
 * 已经摘掉（`GridRoute.tsx:187-192`），地图与可算文档两处走这里。
 */

import { libraryContentDescriptor, type LibraryItem } from "../library-data";

/**
 * 素材回执字段：只有真的发了 revision 才谈得上的那几格。
 *
 * 判据是"这一格在说库里有一件可下载的东西"，不是"这一格是编辑器写的"：
 * `editor_project_schema` 说的是手上这份字节按哪套 schema 写，功能数据同样成立，
 * 所以它不在表里。
 */
export const MATERIAL_RECEIPT_META_KEYS: readonly string[] = Object.freeze([
  "editor_project_url",
  "editor_revision_id",
  "editor_manifest_url",
  "editor_manifest_schema",
  "editor_working_head_url",
  "editor_working_head_project_url",
  "editor_working_head_schema",
  "previous_revision_id",
  "source_url",
  "source_format",
  "source_media_type",
  "delivery_format",
  "fabric_document_url",
  "fabric_preview_url",
]);

const RECEIPT_KEY_SET = new Set(MATERIAL_RECEIPT_META_KEYS);

/** 把素材回执从一份 `meta` 里摘干净。`undefined` 也算写了，一并摘。 */
export function withoutMaterialReceipts(
  meta: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(meta || {}).filter(([key]) => !RECEIPT_KEY_SET.has(key)),
  );
}

/** 这份 `meta` 里还剩哪些素材回执；空数组才算摘干净（给断言与调用方自查用）。 */
export function materialReceiptKeysIn(
  meta: Record<string, unknown> | undefined,
): string[] {
  return Object.keys(meta || {})
    .filter((key) => RECEIPT_KEY_SET.has(key))
    .sort();
}

/**
 * 造功能数据这一档的交回件。
 *
 * 与素材那一档的 `advancedSavedItem()` 的差别是刻意的：**不换 `id`、不写 `url`、
 * 不写 `parent_asset_id`**。功能实例的身份是 `key` 与 `meta.plugin_id`，它没有
 * root/version 之分，也没有对象存储上的地址；`advancedSavedItem()` 那几格是给
 * "同一 artifact 的新版本"用的。
 */
export function pluginInstanceSavedItem(
  item: LibraryItem,
  input: { content: string; meta?: Record<string, unknown> },
): LibraryItem {
  const meta = withoutMaterialReceipts({ ...item.meta, ...(input.meta || {}) });
  return {
    ...item,
    content: input.content || item.content,
    meta,
    descriptor: libraryContentDescriptor({ kind: item.kind, meta }),
  };
}
