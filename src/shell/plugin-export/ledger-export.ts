/**
 * 台账（`ledger-register`，`grid` 内核的非编辑类功能件）的导出适配。
 *
 * 操作员点名的场景就是这一条：「记账，可以导出记账记录并支持转为小红书或
 * htm 风格」。所以这里只做一件事——把台账的记账记录翻译成通用导出载荷，
 * 同一份记录因此能同时落成 Excel、网页、图文长图三件互相独立的素材。
 *
 * 记录的落盘形态归 `W14`（`plugin-initial-states/`），本文件只认下面这个
 * 最小结构：日期、分类、往来对象、收支方向、金额、备注。W14 落盘后
 * 接一层字段映射即可，不必改这条链。
 */

import {
  exportKindsForPlugin,
  renderableExportKindsForPlugin,
  type PluginExportData,
  type PluginExportFormId,
  type PluginExportRequest,
} from "./plugin-export-contract";

/**
 * 台账在 W10 清册里的 id 是 `ledger`（族 id 才是 `ledger-register`）。
 * 形态清单必须按清册那个 id 去查，抄一份到这里就等于让两处口径各走各的。
 */
export const LEDGER_SOURCE_ID = "ledger";
export const LEDGER_FAMILY_ID = "ledger-register";
export const LEDGER_SOURCE_LABEL = "台账";

/** 清册声明的全部形态：xlsx / csv / pdf / long-image / html。 */
export const LEDGER_EXPORT_FORMS: readonly PluginExportFormId[] =
  exportKindsForPlugin(LEDGER_SOURCE_ID);

/** 其中本波真的渲得出字节的那几种（去掉 pdf）。 */
export const LEDGER_RENDERABLE_EXPORT_FORMS: readonly PluginExportFormId[] =
  renderableExportKindsForPlugin(LEDGER_SOURCE_ID);

export type LedgerDirection = "in" | "out";

export interface LedgerEntry {
  /** ISO 日期（YYYY-MM-DD）。 */
  date: string;
  category: string;
  counterparty?: string;
  direction: LedgerDirection;
  /** 正数金额；方向由 `direction` 表达，不用负号。 */
  amount: number;
  note?: string;
}

export interface LedgerSnapshot {
  title?: string;
  /** 显示用货币符号，缺省人民币。 */
  currency?: string;
  entries: readonly LedgerEntry[];
}

const DIRECTION_LABEL: Record<LedgerDirection, string> = {
  in: "收入",
  out: "支出",
};

function money(value: number, currency: string): string {
  const fixed = Math.round(value * 100) / 100;
  return `${currency}${fixed.toFixed(2)}`;
}

export function ledgerExportData(snapshot: LedgerSnapshot): PluginExportData {
  const currency = snapshot.currency || "¥";
  const entries = snapshot.entries || [];
  let income = 0;
  let expense = 0;
  for (const entry of entries) {
    const amount = Number.isFinite(entry.amount) ? entry.amount : 0;
    if (entry.direction === "in") income += amount;
    else expense += amount;
  }
  return {
    columns: [
      { key: "date", label: "日期", type: "date" },
      { key: "category", label: "分类", type: "text" },
      { key: "counterparty", label: "往来对象", type: "text" },
      { key: "direction", label: "收支", type: "text" },
      { key: "amount", label: `金额（${currency}）`, type: "currency" },
      { key: "note", label: "备注", type: "text" },
    ],
    rows: entries.map((entry) => [
      entry.date,
      entry.category,
      entry.counterparty || "",
      DIRECTION_LABEL[entry.direction],
      // 收支方向在金额符号上再表达一次：导出成表格之后，求和就是结余。
      entry.direction === "in" ? entry.amount : -entry.amount,
      entry.note || "",
    ]),
    totals: [
      { label: "收入合计", value: money(income, currency) },
      { label: "支出合计", value: money(expense, currency) },
      { label: "结余", value: money(income - expense, currency) },
      { label: "记录条数", value: entries.length },
    ],
    notes: [
      "金额列以正负号表达收支方向，直接求和即为结余。",
      `导出自${LEDGER_SOURCE_LABEL}，导出后与原记录各自独立，改一边不影响另一边。`,
    ],
  };
}

export function ledgerExportRequest(
  snapshot: LedgerSnapshot,
  form: PluginExportFormId,
  context: { siteId: string; appId?: string; exportedAt?: string },
): PluginExportRequest {
  return {
    sourceId: LEDGER_SOURCE_ID,
    sourceLabel: LEDGER_SOURCE_LABEL,
    sourceKind: "standalone",
    form,
    title: snapshot.title || `${LEDGER_SOURCE_LABEL}记录`,
    siteId: context.siteId,
    ...(context.appId ? { appId: context.appId } : {}),
    ...(context.exportedAt ? { exportedAt: context.exportedAt } : {}),
    data: ledgerExportData(snapshot),
  };
}
