"use client";

// 设置「钱」：买家看付款方式与花销，卖家看收入、账本、收款账户与收费说明。
// 就绪只看 fetchBayPaymentConfig() 的 *_ready。绑卡、开户、提现任何时候都没有可点按钮（契约 §7）。
import { useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { BayApiError } from "../../../lib/bay/http";
import {
  BAY_LEDGER_EVENT_LABELS,
  BAY_NO_PLATFORM_FEE_NOTE,
  bayLedgerCsv,
  bayMoneyNotice,
  bayPayoutAccountStateLabel,
  bayPayoutBlockerLines,
  bayVisiblePayoutBlockerLines,
  downloadBayLedgerCsv,
  fetchBayLedger,
  fetchBayLedgerSummary,
  fetchBayPaidWorkEligibility,
  fetchBayPayoutAccount,
  fetchBayStatement,
  formatBayFen,
  type BayLedgerEntry,
  type BayStatement,
} from "../../../lib/bay/money";
import { fetchBayCardMethod, fetchBayPaymentChannel, fetchBayPaymentConfig } from "../../../lib/bay/payments";
import { requireBayLogin } from "../shell/bay-state";
import { LedgerList, MoneyCard, MoneyStat, MonthlyBars, StatementPanel, useBayMoneyLocale } from "./money-ui";
import { useBayLoad } from "./use-bay-load";

interface MoneyBundle {
  guest: boolean;
  buyerReady: boolean;
  sellerReady: boolean;
  currency: string;
  feePercent: string;
  feeFixed: string;
  feeNote: string;
  countries: string;
  card: { brand: string; last4: string; exp_month: number; exp_year: number } | null;
  monthOut: number;
  lifetimeOut: number;
  monthIn: number;
  lifetimeIn: number;
  ongoingCount: number;
  ongoingAmount: number;
  spendItems: BayLedgerEntry[];
  incomeItems: BayLedgerEntry[];
  monthly: { month: string; in_fen: number; out_fen: number }[];
  payoutLabel: string;
  blockers: string[];
  notice: string;
}

async function loadMoney(): Promise<MoneyBundle> {
  const [config, channel] = await Promise.all([fetchBayPaymentConfig(), fetchBayPaymentChannel()]);
  const buyerReady = config.buyer_ready === true;
  const sellerReady = config.seller_ready === true;
  const currency = config.currency || channel.currency || "USD";
  const feePercent = (channel.channel_fee.percent_bps / 100).toFixed(1);
  const locale = typeof document === "undefined" ? "zh-CN" : document.documentElement.lang || "zh-CN";
  const base = {
    guest: false,
    buyerReady,
    sellerReady,
    currency,
    feePercent,
    feeFixed: formatBayFen(channel.channel_fee.fixed_minor, currency, locale),
    feeNote: channel.channel_fee.note_zh || "支付通道费（覆盖 Stripe 收单成本，平台不以此盈利）",
    countries: channel.payout_countries.join(", "),
    card: null,
    monthOut: 0,
    lifetimeOut: 0,
    monthIn: 0,
    lifetimeIn: 0,
    ongoingCount: 0,
    ongoingAmount: 0,
    spendItems: [] as BayLedgerEntry[],
    incomeItems: [] as BayLedgerEntry[],
    monthly: [] as MoneyBundle["monthly"],
    payoutLabel: bayPayoutAccountStateLabel("none"),
    blockers: [] as string[],
    notice: bayMoneyNotice(sellerReady),
  };
  try {
    const [spend, income, summary, payout, eligibility, card] = await Promise.all([
      fetchBayLedger({ direction: "out", limit: 20 }),
      fetchBayLedger({ direction: "in", limit: 20 }),
      fetchBayLedgerSummary(),
      fetchBayPayoutAccount(),
      fetchBayPaidWorkEligibility(),
      fetchBayCardMethod(),
    ]);
    return {
      ...base,
      card: card && card.last4 ? { brand: card.brand, last4: card.last4, exp_month: card.exp_month, exp_year: card.exp_year } : null,
      monthOut: spend.total_out_fen,
      lifetimeOut: spend.total_out_fen,
      monthIn: summary.month_in_fen,
      lifetimeIn: summary.lifetime_in_fen,
      ongoingCount: summary.ongoing_contract_count,
      ongoingAmount: summary.ongoing_contract_amount_fen,
      spendItems: spend.items,
      incomeItems: income.items,
      monthly: summary.monthly.length ? summary.monthly : income.monthly,
      payoutLabel: bayPayoutAccountStateLabel(payout?.state),
      blockers: bayPayoutBlockerLines(eligibility, payout),
    };
  } catch (error) {
    if (error instanceof BayApiError && error.status === 401) return { ...base, guest: true };
    throw error;
  }
}

function ClosedNote({ children }: { children: string }) {
  return (
    <p className="rounded-lg bg-neutral-50 px-3 py-2 text-[12px] text-neutral-600 dark:bg-neutral-800/60 dark:text-neutral-300" data-bay-money-closed="">
      {children}
    </p>
  );
}

export function BayMoneySection() {
  const tt = useUI();
  const locale = useBayMoneyLocale();
  const { data, error, loading, reload } = useBayLoad(loadMoney, []);
  const [statement, setStatement] = useState<BayStatement | null>(null);
  const [statementError, setStatementError] = useState<string | null>(null);

  async function openStatement(contractId: string) {
    setStatementError(null);
    const next = await fetchBayStatement(contractId);
    if (!next) {
      setStatementError(tt("加载失败，请稍后再试。"));
      return;
    }
    setStatement(next);
  }

  function exportLedger(items: BayLedgerEntry[], name: string) {
    downloadBayLedgerCsv(
      bayLedgerCsv(items, {
        headers: [tt("时间"), tt("对方"), tt("订单"), tt("事件"), tt("收支"), tt("金额"), tt("已记录"), tt("备注")],
        event: (event) => tt(BAY_LEDGER_EVENT_LABELS[event]),
        direction: (direction) => (direction === "in" ? tt("收入") : tt("支出")),
        recorded: tt("已记录"),
      }),
      name,
    );
  }

  if (loading && !data) {
    return <p className="py-6 text-[13px] text-neutral-500">{tt("正在加载…")}</p>;
  }
  if (!data) {
    return (
      <div className="space-y-2">
        <p role="alert" className="text-[13px] text-rose-600 dark:text-rose-400">
          {tt(error || "加载失败，请稍后再试。")}
        </p>
        <button type="button" onClick={reload} className="text-[13px] font-medium text-stone-800 underline underline-offset-2 hover:text-stone-950 dark:text-neutral-200">
          {tt("重试")}
        </button>
      </div>
    );
  }

  if (data.guest) {
    return (
      <div data-bay-settings-money="guest" className="space-y-3">
        <p className="text-[13px] text-neutral-600 dark:text-neutral-300">{tt("登录后查看付款方式、花销和收入")}</p>
        <button
          type="button"
          onClick={() => requireBayLogin()}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-[13px] hover:bg-neutral-50 dark:border-neutral-600 dark:hover:bg-neutral-800"
        >
          {tt("登录")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-bay-settings-money="" data-bay-buyer-ready={data.buyerReady ? "1" : "0"} data-bay-seller-ready={data.sellerReady ? "1" : "0"}>
      <section className="space-y-3" data-bay-money-buyer="">
        <h3 className="text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">{tt("买家")}</h3>
        <MoneyCard id="pay-method" title={tt("付款方式")}>
          {data.buyerReady && data.card ? (
            <div>
              <p className="text-[13px] text-neutral-800 dark:text-neutral-200">
                {tt("已绑卡 · {brand} ·••• {last4}", { brand: data.card.brand || tt("卡"), last4: data.card.last4 })}
              </p>
              {data.card.exp_month && data.card.exp_year ? (
                <p className="mt-1 text-[12px] text-neutral-500">
                  {tt("有效期 {month}/{year}", { month: data.card.exp_month, year: data.card.exp_year })}
                </p>
              ) : null}
            </div>
          ) : (
            <ClosedNote>{tt("付款暂未开放")}</ClosedNote>
          )}
          {!data.buyerReady ? <p className="mt-2 text-[12px] text-neutral-500">{tt("绑卡暂未开放")}</p> : null}
        </MoneyCard>
        <MoneyCard id="spend" title={tt("你花了多少钱")}>
          <div className="grid gap-2 sm:grid-cols-2">
            <MoneyStat label={tt("本月花了")} value={formatBayFen(data.monthOut, data.currency, locale)} />
            <MoneyStat label={tt("累计花了")} value={formatBayFen(data.lifetimeOut, data.currency, locale)} />
          </div>
          <div className="mt-3">
            <p className="mb-1 text-[12px] text-neutral-500">{tt("近 12 个月支出")}</p>
            <MonthlyBars items={data.monthly} direction="out" currency={data.currency} locale={locale} empty={tt("还没有流水")} />
          </div>
          <div className="mt-3">
            <LedgerList items={data.spendItems} locale={locale} empty={tt("还没有流水")} onStatement={(id) => void openStatement(id)} />
          </div>
          {data.spendItems.length ? (
            <button type="button" onClick={() => exportLedger(data.spendItems, "bay-spend.csv")} className="mt-2 text-[12px] font-medium text-stone-800 underline underline-offset-2 hover:text-stone-950 dark:text-neutral-200">
              {tt("导出账本")}
            </button>
          ) : null}
        </MoneyCard>
      </section>

      <section className="space-y-3" data-bay-money-seller="">
        <h3 className="text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">{tt("卖家")}</h3>
        <MoneyCard id="income" title={tt("收入")}>
          <p className="mb-2 text-[12px] text-neutral-500">{tt(data.notice)}</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <MoneyStat label={tt("本月收入")} value={formatBayFen(data.monthIn, data.currency, locale)} />
            <MoneyStat label={tt("累计收入")} value={formatBayFen(data.lifetimeIn, data.currency, locale)} />
            <MoneyStat
              label={tt("进行中的订单")}
              value={String(data.ongoingCount)}
              hint={data.ongoingCount ? formatBayFen(data.ongoingAmount, data.currency, locale) : undefined}
            />
          </div>
          <div className="mt-3">
            <p className="mb-1 text-[12px] text-neutral-500">{tt("近 12 个月收入")}</p>
            <MonthlyBars items={data.monthly} direction="in" currency={data.currency} locale={locale} empty={tt("还没有流水")} />
          </div>
        </MoneyCard>
        <MoneyCard id="ledger" title={tt("账本")}>
          <LedgerList items={data.incomeItems} locale={locale} empty={tt("还没有流水")} onStatement={(id) => void openStatement(id)} />
          {data.incomeItems.length ? (
            <button type="button" onClick={() => exportLedger(data.incomeItems, "bay-income.csv")} className="mt-2 text-[12px] font-medium text-stone-800 underline underline-offset-2 hover:text-stone-950 dark:text-neutral-200">
              {tt("导出账本")}
            </button>
          ) : null}
        </MoneyCard>
        <MoneyCard id="payout" title={tt("收款账户")}>
          {data.sellerReady ? (
            <p className="text-[13px]">{tt("收款账户状态：{state}", { state: tt(data.payoutLabel) })}</p>
          ) : (
            <ClosedNote>{tt("收款暂未开放")}</ClosedNote>
          )}
          {bayVisiblePayoutBlockerLines(data.blockers, data.sellerReady).map((line) => (
            <p key={line} className="mt-1 text-[12px] text-neutral-500" data-bay-money-blocker="">
              {tt(line)}
            </p>
          ))}
          <p className="mt-2 text-[12px] text-neutral-500">{tt("开户暂未开放")}</p>
          <p className="text-[12px] text-neutral-500">{tt("提现暂未开放")}</p>
        </MoneyCard>
        <MoneyCard id="fees" title={tt("平台怎么收费")}>
          <p className="text-[13px] leading-6 text-neutral-700 dark:text-neutral-300">{tt(BAY_NO_PLATFORM_FEE_NOTE)}</p>
          <p className="mt-2 text-[12px] text-neutral-500">
            {tt("支付通道费约 {percent}% + {fixed}（覆盖 Stripe 收单成本，平台不以此盈利）", {
              percent: data.feePercent,
              fixed: data.feeFixed,
            })}
          </p>
          {data.countries ? <p className="mt-1 text-[12px] text-neutral-500">{tt("可收款国家：{list}", { list: data.countries })}</p> : null}
        </MoneyCard>
      </section>

      {statementError ? (
        <p role="alert" className="text-[12px] text-rose-600">
          {tt(statementError)}
        </p>
      ) : null}
      {statement ? <StatementPanel statement={statement} locale={locale} onClose={() => setStatement(null)} /> : null}
    </div>
  );
}
