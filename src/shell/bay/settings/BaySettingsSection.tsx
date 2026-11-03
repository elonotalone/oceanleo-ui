"use client";

// 设置窗「LeoBay」栏：只有一页，两块——「付款卡」（买家下单托管扣款用的卡）和「收款账户」（卖家收钱的账户）。
// 所有启用 Bay 的版本共用；隔离的境内开发通道可显式模拟开户和付款设置。原来的四个页签搬走了：
//   卖家资料、资质审核 → 我的 → 我的主页；买家花销 → 我的 → 我买到的；
//   卖家收入流水、对账单、导出 → 我的 → 数据面板；规则与条款、收费说明 → 条款页（/legal/marketplace）。
// 旧的 pane（profile / vetting / money）与 `?bay=settings:<pane>` 老深链都落到这一页，所以 `pane` 只收不用。
// 就绪只看网关的 *_ready；cn_dev 的操作不会打开真实通道或移动资金。
import { useRef, useState, type ReactNode } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { BayApiError, bayPost } from "../../../lib/bay/http";
import { fetchBayPayoutStatus, type BayPayoutStatus } from "../../../lib/bay/money";
import { fetchBayCardMethod, fetchBayPaymentChannel, invalidateBayPaymentConfig } from "../../../lib/bay/payments";
import { bayEnabledHere, requireBayLogin } from "../shell/bay-state";
import { MoneyCard } from "./money-ui";
import type { BaySettingsPaneName } from "./settings-pane-store";
import { useBayLoad } from "./use-bay-load";

interface SettingsBundle {
  guest: boolean;
  buyerReady: boolean;
  simulation: boolean;
  card: { brand: string; last4: string; exp_month: number; exp_year: number } | null;
  payout: BayPayoutStatus | null;
}

async function loadSettings(): Promise<SettingsBundle> {
  const config = await fetchBayPaymentChannel();
  const buyerReady = config.buyer_ready === true;
  const simulation = config.enabled === true && config.edition === "cn" && config.provider === "cn_dev" && config.currency === "CNY";
  try {
    const [payout, card] = await Promise.all([fetchBayPayoutStatus(), fetchBayCardMethod()]);
    return {
      guest: false,
      buyerReady,
      simulation,
      card: card && card.last4 ? { brand: card.brand, last4: card.last4, exp_month: card.exp_month, exp_year: card.exp_year } : null,
      payout,
    };
  } catch (error) {
    if (error instanceof BayApiError && error.status === 401) return { guest: true, buyerReady, simulation, card: null, payout: null };
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
  const [setupSession, setSetupSession] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(false);
  const actionLock = useRef(false);

  async function simulate(action: "setup" | "confirm" | "onboard") {
    if (!data?.simulation || data.guest || actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setActionError(false);
    try {
      if (action === "setup") {
        const result = await bayPost<{ url: string }>("/v1/talent/payment-method/setup-session", { return_path: "/bay?bay=settings:money" });
        // Read the simulator's session, but never navigate to an API-supplied URL.
        const id = new URL(result.url, "https://local.invalid").searchParams.get("session_id");
        if (!id || !/^cn_dev_setup_[a-f0-9]{48}$/.test(id)) throw new Error("invalid simulation session");
        setSetupSession(id);
      } else if (action === "confirm") {
        if (!setupSession) return;
        await bayPost("/v1/talent/payment-method/confirm", { session_id: setupSession });
        setSetupSession(null);
        invalidateBayPaymentConfig();
        reload();
      } else {
        await bayPost("/v1/talent/payout-account/start", { country: "CN", return_path: "/bay?bay=settings:money" });
        await bayPost("/v1/talent/payout-account/refresh");
        invalidateBayPaymentConfig();
        reload();
      }
    } catch {
      // Session expiry and server guards remain authoritative; a new setup can be retried.
      setSetupSession(null);
      setActionError(true);
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }

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

  const { buyerReady, card, payout, simulation } = data;
  const actionClass = "mt-3 rounded-full border border-neutral-900 px-3 py-1.5 text-[13px] hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-600 dark:hover:bg-neutral-800";
  return (
    <div
      className="space-y-4"
      data-bay-settings-section=""
      data-bay-buyer-ready={buyerReady ? "1" : "0"}
      data-bay-seller-ready={payout.sellerReady ? "1" : "0"}
    >
      <MoneyCard id="payment-card" title={tt(simulation ? "模拟付款方式" : "付款卡")} hint={tt(simulation ? "仅用于开发测试，不会实际扣款或打款。" : "下单后，订单款先托管，从这张卡扣。")}>
        {buyerReady && card ? (
          <div>
            <p className="text-[13px] text-neutral-800 dark:text-neutral-200">
              {simulation ? tt("模拟付款方式已就绪") : tt("已绑卡 · {brand} ·••• {last4}", { brand: card.brand || tt("卡"), last4: card.last4 })}
            </p>
            {card.exp_month && card.exp_year ? (
              <p className="mt-1 text-[12px] text-neutral-500">{tt("有效期 {month}/{year}", { month: card.exp_month, year: card.exp_year })}</p>
            ) : null}
          </div>
        ) : (
          <>
            <ClosedNote>{tt(simulation ? "模拟付款方式尚未启用" : buyerReady ? "还没有付款卡" : "付款暂未开放")}</ClosedNote>
            {!simulation ? <p className="mt-2 text-[12px] text-neutral-500">{tt("绑卡暂未开放")}</p> : null}
          </>
        )}
        {simulation && !buyerReady ? (
          <button type="button" disabled={busy} className={actionClass} data-bay-dev-buyer={setupSession ? "confirm" : "setup"}
            onClick={() => void simulate(setupSession ? "confirm" : "setup")}>
            {tt(busy ? "正在处理…" : setupSession ? "确认模拟付款方式" : "设置模拟付款方式")}
          </button>
        ) : null}
      </MoneyCard>

      <MoneyCard id="payout" title={tt(simulation ? "模拟收款账户" : "收款账户")} hint={tt(simulation ? "模拟身份，无真实身份核验或资金流转。" : "卖出东西后，款项转到这个账户。")}>
        {payout.sellerReady ? (
          <p className="text-[13px]">{simulation ? tt("模拟收款账户已就绪") : tt("收款账户状态：{state}", { state: tt(payout.stateLabel) })}</p>
        ) : (
          <ClosedNote>{tt(simulation ? "模拟收款账户尚未启用" : "收款暂未开放")}</ClosedNote>
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
        {simulation ? (
          !payout.sellerReady ? <button type="button" disabled={busy} className={actionClass} data-bay-dev-seller=""
            onClick={() => void simulate("onboard")}>{tt(busy ? "正在处理…" : "启用模拟收款账户")}</button> : null
        ) : <p className="mt-3 text-[12px] text-neutral-500">{tt("开户暂未开放")}</p>}
        <p className="text-[12px] text-neutral-500">{tt("提现暂未开放")}</p>
      </MoneyCard>
      {actionError ? <p role="alert" className="text-[13px] text-rose-600 dark:text-rose-400">{tt("模拟设置失败，请重试。")}</p> : null}
    </div>
  );
}

export function BaySettingsSection(_props: { pane?: BaySettingsPaneName } = {}) {
  if (!bayEnabledHere()) return null;
  return <BaySettingsPage />;
}
