"use client";

// 设置窗「LeoBay」栏：只有一页，两块——「付款卡」（买家下单托管扣款用的卡）和「收款账户」（卖家收钱的账户）。
// 境内不渲染。原来的四个页签搬走了：
//   卖家资料、资质审核 → 我的 → 我的主页；买家花销 → 我的 → 我买到的；
//   卖家收入流水、对账单、导出 → 我的 → 数据面板；规则与条款、收费说明 → 条款页（/legal/marketplace）。
// 旧的 pane（profile / vetting / money）与 `?bay=settings:<pane>` 老深链都落到这一页，所以 `pane` 只收不用。
// 就绪只看 fetchBayPaymentConfig() 的 *_ready。绑卡、开户、提现任何时候都没有可点按钮（契约 §7）。
import type { ReactNode } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { BayApiError } from "../../../lib/bay/http";
import { fetchBayPayoutStatus, type BayPayoutStatus } from "../../../lib/bay/money";
import { fetchBayCardMethod, fetchBayPaymentConfig } from "../../../lib/bay/payments";
import { bayEnabledHere, requireBayLogin } from "../shell/bay-state";
import { MoneyCard } from "./money-ui";
import type { BaySettingsPaneName } from "./settings-pane-store";
import { useBayLoad } from "./use-bay-load";

interface SettingsBundle {
  guest: boolean;
  buyerReady: boolean;
  card: { brand: string; last4: string; exp_month: number; exp_year: number } | null;
  payout: BayPayoutStatus | null;
}

async function loadSettings(): Promise<SettingsBundle> {
  const config = await fetchBayPaymentConfig();
  const buyerReady = config.buyer_ready === true;
  try {
    const [payout, card] = await Promise.all([fetchBayPayoutStatus(), fetchBayCardMethod()]);
    return {
      guest: false,
      buyerReady,
      card: card && card.last4 ? { brand: card.brand, last4: card.last4, exp_month: card.exp_month, exp_year: card.exp_year } : null,
      payout,
    };
  } catch (error) {
    if (error instanceof BayApiError && error.status === 401) return { guest: true, buyerReady, card: null, payout: null };
    throw error;
  }
}

function ClosedNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg bg-neutral-50 px-3 py-2 text-[12px] text-neutral-600 dark:bg-neutral-800/60 dark:text-neutral-300" data-bay-money-closed="">
      {children}
    </p>
  );
}

function BaySettingsPage() {
  const tt = useUI();
  const { data, error, loading, reload } = useBayLoad(loadSettings, []);

  if (loading && !data) {
    return (
      <div data-bay-settings-section="">
        <p className="py-6 text-[13px] text-neutral-500">{tt("正在加载…")}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-2" data-bay-settings-section="">
        <p role="alert" className="text-[13px] text-rose-600 dark:text-rose-400">
          {tt(error || "加载失败，请稍后再试。")}
        </p>
        <button type="button" onClick={reload} className="text-[13px] font-medium text-stone-800 underline underline-offset-2 hover:text-stone-950 dark:text-neutral-200">
          {tt("重试")}
        </button>
      </div>
    );
  }
  if (data.guest || !data.payout) {
    return (
      <div className="space-y-3" data-bay-settings-section="" data-bay-settings-guest="">
        <p className="text-[13px] text-neutral-600 dark:text-neutral-300">{tt("登录后查看付款卡和收款账户")}</p>
        <button
          type="button"
          onClick={() => requireBayLogin()}
          className="rounded-full border border-neutral-900 px-3 py-1.5 text-[13px] hover:bg-neutral-50 dark:border-neutral-600 dark:hover:bg-neutral-800"
        >
          {tt("登录")}
        </button>
      </div>
    );
  }

  const { buyerReady, card, payout } = data;
  return (
    <div
      className="space-y-4"
      data-bay-settings-section=""
      data-bay-buyer-ready={buyerReady ? "1" : "0"}
      data-bay-seller-ready={payout.sellerReady ? "1" : "0"}
    >
      <MoneyCard id="payment-card" title={tt("付款卡")} hint={tt("下单后，订单款先托管，从这张卡扣。")}>
        {buyerReady && card ? (
          <div>
            <p className="text-[13px] text-neutral-800 dark:text-neutral-200">
              {tt("已绑卡 · {brand} ·••• {last4}", { brand: card.brand || tt("卡"), last4: card.last4 })}
            </p>
            {card.exp_month && card.exp_year ? (
              <p className="mt-1 text-[12px] text-neutral-500">{tt("有效期 {month}/{year}", { month: card.exp_month, year: card.exp_year })}</p>
            ) : null}
          </div>
        ) : (
          <>
            <ClosedNote>{buyerReady ? tt("还没有付款卡") : tt("付款暂未开放")}</ClosedNote>
            <p className="mt-2 text-[12px] text-neutral-500">{tt("绑卡暂未开放")}</p>
          </>
        )}
      </MoneyCard>

      <MoneyCard id="payout" title={tt("收款账户")} hint={tt("卖出东西后，款项转到这个账户。")}>
        {payout.sellerReady ? (
          <p className="text-[13px]">{tt("收款账户状态：{state}", { state: tt(payout.stateLabel) })}</p>
        ) : (
          <ClosedNote>{tt("收款暂未开放")}</ClosedNote>
        )}
        {payout.blockers.length ? (
          <div className="mt-3" data-bay-money-why="">
            <p className="text-[12px] font-medium text-neutral-700 dark:text-neutral-300">{tt("为什么还收不了款")}</p>
            {payout.blockers.map((line) => (
              <p key={line} className="mt-1 text-[12px] text-neutral-500" data-bay-money-blocker="">
                {tt(line)}
              </p>
            ))}
          </div>
        ) : null}
        <p className="mt-3 text-[12px] text-neutral-500">{tt("开户暂未开放")}</p>
        <p className="text-[12px] text-neutral-500">{tt("提现暂未开放")}</p>
      </MoneyCard>
    </div>
  );
}

export function BaySettingsSection(_props: { pane?: BaySettingsPaneName } = {}) {
  if (!bayEnabledHere()) return null;
  return <BaySettingsPage />;
}
