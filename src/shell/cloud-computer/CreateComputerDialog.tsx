"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CloudComputerError,
  type CloudComputerClient,
  type ComputerCatalog,
} from "../../lib/cloud-computer-api";
import { currentDomainFamily } from "../../contracts/domain-family";
import { formatMinor, useLedgerCurrency } from "../../lib/money";
import { useUI } from "../../i18n/ui/useUI";
import { Modal } from "../../ui";

const COST_HREF = "/cost";

type CheckoutStep = "catalog" | "checkout" | "result";

export type CreditsSnapshot = {
  balance_minor: number;
  currency: string;
};

export type CreditsLoader = () => Promise<
  { ok: true; data: CreditsSnapshot } | { ok: false; error?: string }
>;

async function defaultLoadCredits(): Promise<
  { ok: true; data: CreditsSnapshot } | { ok: false; error?: string }
> {
  const { getCredits } = await import("../../lib/auth/account");
  const result = await getCredits();
  if (!result.ok || !result.data) {
    return { ok: false, error: "error" in result ? result.error : undefined };
  }
  return {
    ok: true,
    data: {
      balance_minor: result.data.balance_minor,
      currency: result.data.currency,
    },
  };
}

function hourlyMinor(
  catalog: ComputerCatalog,
  tierId: string,
  diskGb: number,
): { amount_minor: number; currency: string } | null {
  const tier = catalog.tiers.find((item) => item.id === tierId);
  if (!tier) return null;
  const disk = diskGb * catalog.disk.hourly_per_gb.amount_minor;
  return {
    amount_minor: tier.hourly.amount_minor + disk,
    currency: tier.hourly.currency,
  };
}

export function CreateComputerDialog({
  client,
  onClose,
  onCreated,
  loadCredits = defaultLoadCredits,
}: {
  client: CloudComputerClient;
  onClose: () => void;
  onCreated: () => void;
  loadCredits?: CreditsLoader;
}) {
  const tt = useUI();
  const cn = currentDomainFamily() === "cn";
  const ledgerCurrency = useLedgerCurrency();
  const [catalog, setCatalog] = useState<ComputerCatalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [regionId, setRegionId] = useState("");
  const [tierId, setTierId] = useState("");
  const [diskGb, setDiskGb] = useState(40);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [step, setStep] = useState<CheckoutStep>("catalog");
  const [credits, setCredits] = useState<CreditsSnapshot | null>(null);
  const [creditsError, setCreditsError] = useState<string | null>(null);
  const [insufficient, setInsufficient] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cn) return;
    let alive = true;
    client
      .getCatalog()
      .then((data) => {
        if (!alive) return;
        setCatalog(data);
        setRegionId(data.regions[0]?.id || "");
        const firstLive = data.tiers.find((tier) => tier.available);
        setTierId((firstLive || data.tiers[0])?.id || "");
        setDiskGb(data.disk.min_gb);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      alive = false;
    };
  }, [client, cn]);

  const tier = catalog?.tiers.find((item) => item.id === tierId) ?? null;
  const price = catalog ? hourlyMinor(catalog, tierId, diskGb) : null;
  const reserveMinor = price ? price.amount_minor * 24 : 0;
  const sameCurrency =
    credits != null && price != null && credits.currency === price.currency;
  const knownShort =
    sameCurrency && credits !== null && credits.balance_minor < reserveMinor;

  const monthlyFromHourly = useMemo(() => {
    if (!tier) return null;
    return formatMinor(tier.monthly_estimate.amount_minor, tier.monthly_estimate.currency);
  }, [tier]);

  async function goCheckout() {
    if (cn || !tier || !tier.available) return;
    const trimmed = (nameRef.current?.value || name).trim();
    if (!trimmed) {
      setSubmitError(tt("请填写电脑名字"));
      return;
    }
    setName(trimmed);
    setBusy(true);
    setSubmitError(null);
    setInsufficient(false);
    setStep("checkout");
    try {
      const wallet = await loadCredits();
      if (wallet.ok) {
        setCredits(wallet.data);
        setCreditsError(null);
        if (
          price &&
          wallet.data.currency === price.currency &&
          wallet.data.balance_minor < price.amount_minor * 24
        ) {
          setInsufficient(true);
        }
      } else {
        setCredits(null);
        setCreditsError(wallet.error || tt("当前余额"));
      }
      setStep("checkout");
    } finally {
      setBusy(false);
    }
  }

  async function payAndCreate() {
    if (cn || !tier || !tier.available || knownShort) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setSubmitError(tt("请填写电脑名字"));
      return;
    }
    setBusy(true);
    setSubmitError(null);
    try {
      await client.createAliyunComputer({
        name: trimmed,
        tier_id: tier.id,
        disk_gb: diskGb,
      });
      onCreated();
      setStep("result");
    } catch (err) {
      if (
        (err instanceof CloudComputerError && err.code === "insufficient_balance") ||
        (typeof err === "object" &&
          err !== null &&
          "code" in err &&
          (err as { code?: string }).code === "insufficient_balance")
      ) {
        setInsufficient(true);
        setStep("checkout");
        setSubmitError(tt("余额不足，请先充值"));
      } else {
        setSubmitError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-lg" labelledBy="oceanleo-cc-create-title">
      <div
        className="p-5"
        data-oceanleo-cc-create-dialog
        data-oceanleo-cc-create-step={step}
      >
        <h2
          id="oceanleo-cc-create-title"
          className="text-[15px] font-semibold text-neutral-900"
        >
          {step === "checkout"
            ? tt("费用确认")
            : step === "result"
              ? tt("购买云电脑")
              : tt("购买云电脑")}
        </h2>
        {cn ? (
          <p className="mt-3 text-[13px] text-neutral-500">{tt("此功能在当前站点不可用")}</p>
        ) : loadError ? (
          <p className="mt-3 text-[13px] text-rose-600">{tt(loadError)}</p>
        ) : !catalog ? (
          <p className="mt-3 text-[13px] text-neutral-500">{tt("正在加载档位…")}</p>
        ) : step === "result" ? (
          <div className="mt-4 space-y-4" data-oceanleo-cc-create-result>
            <p className="text-[13px] leading-relaxed text-neutral-700">
              {tt("正在开通，几分钟后出现在我的设备里")}
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-neutral-900 px-3.5 py-1.5 text-[13px] font-medium text-white"
              >
                {tt("返回")}
              </button>
            </div>
          </div>
        ) : step === "checkout" && price ? (
          <div className="mt-4 space-y-4" data-oceanleo-cc-checkout>
            <p className="text-[13px] text-neutral-700">
              {name.trim()} · {tier?.label} · {diskGb} GB
            </p>
            <dl className="space-y-2 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-[13px]">
              <div className="flex justify-between gap-3">
                <dt className="text-neutral-500">{tt("每小时")}</dt>
                <dd data-oceanleo-cc-hourly>
                  {formatMinor(price.amount_minor, price.currency)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-neutral-500">{tt("每天")}</dt>
                <dd data-oceanleo-cc-daily>
                  {formatMinor(price.amount_minor * 24, price.currency)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-neutral-500">{tt("当前余额")}</dt>
                <dd data-oceanleo-cc-balance>
                  {credits
                    ? formatMinor(credits.balance_minor, credits.currency || ledgerCurrency)
                    : creditsError
                      ? tt("暂无")
                      : tt("暂无")}
                </dd>
              </div>
            </dl>
            <p className="text-[12px] leading-relaxed text-neutral-500">
              {tt("开通时至少需要 24 小时的费用作为预留，之后按小时扣")}
            </p>
            {insufficient || knownShort ? (
              <div
                className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900"
                data-oceanleo-cc-insufficient-balance
              >
                <p>{tt("余额不足，请先充值")}</p>
              </div>
            ) : null}
            {submitError && (
              <p className="text-[12px] text-rose-600">{tt(submitError)}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setStep("catalog");
                  setInsufficient(false);
                  setSubmitError(null);
                }}
                className="rounded-lg border border-neutral-200 px-3.5 py-1.5 text-[13px]"
              >
                {tt("返回")}
              </button>
              {knownShort || insufficient ? (
                <a
                  href={COST_HREF}
                  data-oceanleo-cc-checkout-topup
                  className="rounded-lg bg-neutral-900 px-3.5 py-1.5 text-[13px] font-medium text-white"
                >
                  {tt("去充值")}
                </a>
              ) : (
                <button
                  type="button"
                  data-oceanleo-cc-checkout-pay
                  onClick={() => void payAndCreate()}
                  disabled={busy || !tier?.available}
                  className="rounded-lg bg-neutral-900 px-3.5 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
                >
                  {busy ? tt("创建中…") : tt("确认支付并创建")}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <label className="block text-[12px] text-neutral-600">
              {tt("名字")}
              <input
                ref={nameRef}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-[13px] text-neutral-900 outline-none focus:border-neutral-400 focus-visible:ring-2 focus-visible:ring-[var(--pchrome-accent,var(--awb-accent,var(--accent,#7c3aed)))]/45"
                aria-label={tt("名字")}
              />
            </label>
            <label className="block text-[12px] text-neutral-600">
              {tt("地域")}
              <select
                value={regionId}
                onChange={(event) => setRegionId(event.target.value)}
                className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-[13px] text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-[var(--pchrome-accent,var(--awb-accent,var(--accent,#7c3aed)))]/45"
                aria-label={tt("地域")}
              >
                {catalog.regions.map((region) => (
                  <option key={region.id} value={region.id}>
                    {region.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              {catalog.tiers.map((item) => {
                const selected = item.id === tierId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={!item.available}
                    onClick={() => setTierId(item.id)}
                    data-oceanleo-cc-tier={item.id}
                    data-available={item.available ? "1" : "0"}
                    className={`rounded-2xl border px-3 py-3 text-left text-[12px] transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${
                      !item.available
                        ? "cursor-not-allowed border-neutral-200 bg-neutral-50 text-neutral-400"
                        : selected
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : "border-neutral-200 bg-white text-neutral-800 hover:border-neutral-300"
                    }`}
                  >
                    <div className="font-medium">{item.label}</div>
                    <div className="mt-1 opacity-80">
                      {item.vcpu} vCPU / {item.memory_gb} GB
                    </div>
                    <div className="mt-1">
                      {formatMinor(item.hourly.amount_minor, item.hourly.currency)}
                      {tt("/小时")}
                    </div>
                    <div className="opacity-80">
                      {tt("折合每月")}{" "}
                      {formatMinor(
                        item.monthly_estimate.amount_minor,
                        item.monthly_estimate.currency,
                      )}
                    </div>
                    {!item.available && (
                      <div className="mt-1">{tt("暂无库存")}</div>
                    )}
                  </button>
                );
              })}
            </div>
            <label className="block text-[12px] text-neutral-600">
              {tt("系统盘")} {diskGb} GB
              <input
                type="range"
                min={catalog.disk.min_gb}
                max={catalog.disk.max_gb}
                step={catalog.disk.step_gb}
                value={diskGb}
                onChange={(event) => setDiskGb(Number(event.target.value))}
                className="mt-2 w-full"
                aria-label={tt("系统盘")}
              />
            </label>
            <p className="text-[12px] leading-relaxed text-neutral-500">
              {tt("按阿里云成本价计费，OceanLeo 不加价；按小时从钱包扣")}
              {tier && monthlyFromHourly ? (
                <>
                  {" · "}
                  {formatMinor(tier.hourly.amount_minor, tier.hourly.currency)}
                  {tt("/小时")}
                  {" · "}
                  {monthlyFromHourly}
                  {tt("/月")}
                </>
              ) : null}
            </p>
            {submitError && (
              <p className="text-[12px] text-rose-600">{tt(submitError)}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-neutral-200 px-3.5 py-1.5 text-[13px]"
              >
                {tt("取消")}
              </button>
              <button
                type="button"
                data-oceanleo-cc-next-checkout
                onClick={() => void goCheckout()}
                disabled={busy || !tier?.available}
                className="rounded-lg bg-neutral-900 px-3.5 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
              >
                {busy ? tt("加载中…") : tt("下一步：费用确认")}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
