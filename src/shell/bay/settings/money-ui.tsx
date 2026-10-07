"use client";

// 设置「钱」里用的几块小界面：卡片、统计格、按月柱状图、流水列表、单笔对账单。
// 全是只读展示；这里没有任何会碰 Stripe 的按钮（契约 §7）。
import type { ReactNode } from "react";
import { htmlLang } from "../../../i18n/config";
import { useUI } from "../../../i18n/ui/useUI";
import {
  BAY_LEDGER_EVENT_LABELS,
  BAY_NO_PLATFORM_FEE_NOTE,
  bayLedgerCounterpartyName,
  formatBayFen,
  formatBayLedgerDate,
  type BayLedgerDirection,
  type BayLedgerEntry,
  type BayMonthlyTotal,
  type BayStatement,
} from "../../../lib/bay/money";
import { bayUiLocale } from "./terms-text";

/** Intl 用的语言标签（读 `<html lang>`）。只在客户端取数之后渲染，不会和服务端首帧错位。 */
export function useBayMoneyLocale(): string {
  return htmlLang(bayUiLocale());
}

export function MoneyCard({ title, children, id }: { title: string; children: ReactNode; id: string }) {
  return (
    <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-700" data-bay-money-card={id}>
      <h4 className="text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">{title}</h4>
      <div className="mt-2">{children}</div>
    </section>
  );
}

export function MoneyStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-700">
      <p className="text-[11px] text-neutral-500 dark:text-neutral-400">{label}</p>
      <p className="mt-1 text-[18px] font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">{value}</p>
      {hint ? <p className="mt-1 text-[11px] leading-4 text-neutral-500 dark:text-neutral-400">{hint}</p> : null}
    </div>
  );
}

function compactAmount(fen: number, currency: string, locale: string): string {
  const amount = (Number.isFinite(fen) ? fen : 0) / 100;
  const code = /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : "USD";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: code, notation: "compact", maximumFractionDigits: 1 }).format(amount);
  } catch {
    return String(Math.round(amount));
  }
}

/** 近 12 个月的柱子。只画账本里的记录；金额写在柱顶，读屏读 aria-label 里的完整金额。 */
export function MonthlyBars({
  items,
  direction,
  currency,
  locale,
  empty,
}: {
  items: BayMonthlyTotal[];
  direction: BayLedgerDirection;
  currency: string;
  locale: string;
  empty: string;
}) {
  const visible = items.slice(-12);
  if (visible.length === 0) {
    return <p className="py-8 text-center text-[12px] text-neutral-500 dark:text-neutral-400">{empty}</p>;
  }
  const values = visible.map((item) => (direction === "in" ? item.in_fen : item.out_fen));
  const max = Math.max(...values, 1);
  return (
    <div
      className="flex h-44 items-end gap-1.5 rounded-xl bg-neutral-50 px-3 pb-2 pt-4 dark:bg-neutral-800/50"
      data-bay-money-bars={direction}
    >
      {visible.map((item, index) => {
        const value = values[index] ?? 0;
        const height = Math.max(6, Math.round((value / max) * 104));
        return (
          <div key={item.month} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="text-[9px] tabular-nums text-neutral-500 dark:text-neutral-400">{compactAmount(value, currency, locale)}</span>
            <div
              className={`w-full max-w-8 rounded-t ${direction === "in" ? "bg-emerald-500" : "bg-sky-500"}`}
              style={{ height }}
              role="img"
              aria-label={`${item.month} ${formatBayFen(value, currency, locale)}`}
            />
            <span className="text-[9px] text-neutral-500 dark:text-neutral-400">{item.month.slice(5)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function LedgerList({
  items,
  locale,
  empty,
  onStatement,
}: {
  items: BayLedgerEntry[];
  locale: string;
  empty: string;
  onStatement?: (contractId: string) => void;
}) {
  const tt = useUI();
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-[12px] text-neutral-500 dark:border-neutral-600 dark:text-neutral-400">
        {empty}
      </p>
    );
  }
  return (
    <ul className="divide-y divide-neutral-100 dark:divide-neutral-800" data-bay-ledger>
      {items.map((item) => {
        const name = bayLedgerCounterpartyName(item);
        const incoming = item.direction === "in";
        return (
          <li key={item.id} className="flex items-start justify-between gap-3 py-3" data-bay-ledger-row={item.id}>
            <div className="min-w-0">
              <p className="break-words text-[13px] font-medium text-neutral-900 dark:text-neutral-100">
                {tt(BAY_LEDGER_EVENT_LABELS[item.event])}
                {name ? ` · ${name}` : ""}
              </p>
              <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                {formatBayLedgerDate(item.created_at, locale)} · {tt("已记录")}
              </p>
              {item.note ? <p className="mt-0.5 break-words text-[11px] text-neutral-500 dark:text-neutral-400">{item.note}</p> : null}
              {item.contract_id && onStatement ? (
                <button
                  type="button"
                  onClick={() => onStatement(item.contract_id as string)}
                  className="mt-1 text-[12px] font-medium text-sky-600 hover:underline dark:text-sky-300"
                >
                  {tt("查看对账单")}
                </button>
              ) : null}
            </div>
            <span
              className={`shrink-0 text-[13px] font-semibold tabular-nums ${
                incoming ? "text-emerald-700 dark:text-emerald-400" : "text-sky-700 dark:text-sky-300"
              }`}
            >
              {incoming ? "+" : "-"}
              {formatBayFen(item.amount_fen, item.currency, locale)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function StatementPanel({
  statement,
  locale,
  onClose,
}: {
  statement: BayStatement;
  locale: string;
  onClose: () => void;
}) {
  const tt = useUI();
  const counterparty =
    statement.counterparty?.display_name || (statement.counterparty?.handle ? `@${statement.counterparty.handle}` : "");
  return (
    <section
      className="rounded-xl border border-sky-200 bg-sky-50/50 p-4 dark:border-sky-900 dark:bg-sky-950/20"
      data-bay-statement={statement.contract_id}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-sky-700 dark:text-sky-300">{tt("订单对账单")}</p>
          <h5 className="mt-0.5 break-words text-[14px] font-semibold text-neutral-900 dark:text-neutral-100">
            {statement.title || tt("订单详情")}
          </h5>
          {counterparty ? (
            <p className="mt-0.5 break-words text-[12px] text-neutral-600 dark:text-neutral-300">{tt("对方：{name}", { name: counterparty })}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg border border-neutral-300 px-2.5 py-1 text-[12px] hover:bg-neutral-50 dark:border-neutral-600 dark:hover:bg-neutral-800"
        >
          {tt("关闭")}
        </button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <MoneyStat label={tt("订单记录金额")} value={formatBayFen(statement.amount_fen, statement.currency, locale)} />
        <MoneyStat label={tt("平台抽佣")} value="0" />
        <MoneyStat label={tt("账目状态")} value={tt("已记录")} />
      </div>
      <p className="mt-2 text-[11px] text-neutral-500 dark:text-neutral-400">{tt(BAY_NO_PLATFORM_FEE_NOTE)}</p>

      {statement.tier || statement.addons.length ? (
        <ul className="mt-3 space-y-1.5 text-[12px]" data-bay-statement-items>
          {statement.tier ? (
            <li className="flex items-start justify-between gap-3 rounded-lg bg-white/70 px-3 py-2 dark:bg-neutral-900/40">
              <span className="min-w-0 break-words">{tt("档位：{title}", { title: statement.tier.title })}</span>
              <strong className="shrink-0 tabular-nums">{formatBayFen(statement.tier.price_fen, statement.currency, locale)}</strong>
            </li>
          ) : null}
          {statement.addons.map((addon, index) => (
            <li key={`${addon.title}-${index}`} className="flex items-start justify-between gap-3 rounded-lg bg-white/70 px-3 py-2 dark:bg-neutral-900/40">
              <span className="min-w-0 break-words">{tt("加购：{title}", { title: addon.title })}</span>
              <strong className="shrink-0 tabular-nums">{formatBayFen(addon.price_fen, statement.currency, locale)}</strong>
            </li>
          ))}
        </ul>
      ) : null}

      <h6 className="mt-4 text-[12px] font-semibold text-neutral-900 dark:text-neutral-100">{tt("账目时间线")}</h6>
      {statement.timeline.length ? (
        <ol className="mt-2 space-y-2 border-l-2 border-sky-200 pl-3 dark:border-sky-900">
          {statement.timeline.map((entry) => (
            <li key={entry.id}>
              <p className="text-[12px] font-medium text-neutral-900 dark:text-neutral-100">
                {tt(BAY_LEDGER_EVENT_LABELS[entry.event])} · {formatBayFen(entry.amount_fen, entry.currency, locale)} · {tt("已记录")}
              </p>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">{formatBayLedgerDate(entry.created_at, locale)}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-[12px] text-neutral-500 dark:text-neutral-400">{tt("这笔订单还没有账目记录。")}</p>
      )}
      {statement.money_notice ? (
        <p className="mt-3 text-[12px] font-medium text-amber-800 dark:text-amber-300">{tt(statement.money_notice)}</p>
      ) : null}
    </section>
  );
}
