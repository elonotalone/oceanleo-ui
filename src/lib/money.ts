// ============================================================================
// @oceanleo/ui — 钱包 / AI 费用的唯一格式化入口（账本货币契约，2026-09-07）
// ----------------------------------------------------------------------------
// oceanleo.cn 的账本是人民币，oceanleo.com 的账本是美元。**前端不决定货币、不做
// 换算**：货币码从网关的 `/v1/credits`（及计费回执、账单事件）里读出来，这里只负责
// 把「多少钱 + 哪种货币」变成用户看到的 `$0.70` / `¥5.00`。
//
// 网关还没带 `currency` 字段的旧部署一律按 CNY 处理（今天的行为）——绝不猜成美元。
//
// 这里只管钱包 / AI 成本。打印店实体商品价（商品费、运费、¥399 / 件）不走这里。
// ============================================================================

import { useSyncExternalStore } from "react";

/** 账本货币码。网关目前只会给 "CNY" / "USD"；其它 ISO 码原样透传。 */
export type LedgerCurrency = "CNY" | "USD" | (string & {});

/** 网关没说货币时的回落 —— 今天所有已部署的账本都是人民币。 */
export const DEFAULT_LEDGER_CURRENCY: LedgerCurrency = "CNY";

/** 两种账本货币都是 100 最小单位 = 1 主单位（分 / 美分）。 */
export const MINOR_PER_MAJOR = 100;

const SYMBOLS: Record<string, string> = {
  CNY: "¥",
  RMB: "¥",
  USD: "$",
};

/** 把网关给的任意值收敛成一个大写货币码；空 / 非字串 / 未知都回落 CNY。 */
export function normalizeCurrency(value: unknown): LedgerCurrency {
  if (typeof value !== "string") return DEFAULT_LEDGER_CURRENCY;
  const code = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return DEFAULT_LEDGER_CURRENCY;
  return code === "RMB" ? "CNY" : code;
}

/** 货币符号：`"¥"` / `"$"`。不认识的 ISO 码返回码本身（`"EUR"`），不瞎编符号。 */
export function currencySymbol(currency?: string | null): string {
  const code = normalizeCurrency(currency);
  return SYMBOLS[code] ?? code;
}

function safeNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 主单位金额 → 用户文案：`formatMoney(0.7, "USD")` → `"$0.70"`，
 * `formatMoney(5, "CNY")` → `"¥5.00"`，`formatMoney(-3.25, "USD")` → `"-$3.25"`。
 * 未知货币码用「码 + 空格」：`"EUR 1.00"`。脏值（NaN / 字串 / undefined）按 0。
 */
export function formatMoney(
  amountMajor: unknown,
  currency?: string | null,
  digits = 2,
): string {
  const amount = safeNumber(amountMajor);
  const code = normalizeCurrency(currency);
  const symbol = SYMBOLS[code];
  const places = Number.isInteger(digits) && digits >= 0 ? digits : 2;
  const magnitude = Math.abs(amount).toFixed(places);
  const sign = amount < 0 && Number(magnitude) !== 0 ? "-" : "";
  return symbol ? `${sign}${symbol}${magnitude}` : `${sign}${code} ${magnitude}`;
}

/** 最小单位（分 / 美分）→ 主单位。 */
export function minorToMajor(minor: unknown): number {
  return safeNumber(minor) / MINOR_PER_MAJOR;
}

/** 主单位 → 最小单位整数（四舍五入到整分）。 */
export function majorToMinor(major: unknown): number {
  return Math.round(safeNumber(major) * MINOR_PER_MAJOR);
}

/** 最小单位金额直接出文案：`formatMinor(70, "USD")` → `"$0.70"`。 */
export function formatMinor(
  minor: unknown,
  currency?: string | null,
  digits = 2,
): string {
  return formatMoney(minorToMajor(minor), currency, digits);
}

// ----------------------------------------------------------------------------
// 「网关最近一次告诉我们的账本货币」
// ----------------------------------------------------------------------------
// AppShell 的余额胶囊、历史列表的任务花费、人才预算这类地方拿到的只是一个数字，
// 手里没有钱包响应。各站已经在自己那边调 getCredits()；account.ts 在归一化钱包
// 响应时把货币记到这里，这些组件就用同一个货币码格式化，不必 36 个站各改一遍。
// 没有人记过之前一律 CNY。

let rememberedCurrency: LedgerCurrency = DEFAULT_LEDGER_CURRENCY;
const listeners = new Set<() => void>();

/** account.ts 在拿到网关的 `currency` 后调用；只在真的变了时通知订阅者。 */
export function rememberLedgerCurrency(currency: unknown): LedgerCurrency {
  const next = normalizeCurrency(currency);
  if (next !== rememberedCurrency) {
    rememberedCurrency = next;
    for (const listener of listeners) listener();
  }
  return next;
}

/** 当前记住的账本货币（未记过 = CNY）。 */
export function ledgerCurrency(): LedgerCurrency {
  return rememberedCurrency;
}

export function subscribeLedgerCurrency(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** React 侧：跟着 rememberLedgerCurrency 的变化重渲染。 */
export function useLedgerCurrency(): LedgerCurrency {
  return useSyncExternalStore(subscribeLedgerCurrency, ledgerCurrency, ledgerCurrency);
}

/** 仅测试用：把记忆清回 CNY。 */
export function resetLedgerCurrencyForTests(): void {
  rememberLedgerCurrency(DEFAULT_LEDGER_CURRENCY);
}
