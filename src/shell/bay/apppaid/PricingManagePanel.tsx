"use client";

import { useEffect, useState, type ReactElement } from "react";

import { useUI } from "../../../i18n/ui/useUI";
import { getBayApp } from "../../../lib/bay/apps";
import { saveBayAppPricing, type BayAppPriceModel } from "../../../lib/bay/app-paid";
import { BayRevealForm } from "../form";
import { openBaySettings } from "../settings/settings-open";
import { PaneLoading, PaneMessage } from "../supply/parts";
import { errorStatus, errorText, useBayResource } from "../supply/use-bay-resource";
import { fenToPriceInput, offersMoneySettings, parsePriceInput, parseTrialDays, pricingPayload } from "./paid-model";

const PRIMARY = "rounded-full bg-neutral-900 px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-60";
const SECONDARY = "rounded-full border border-neutral-900 bg-white px-3 py-1.5 text-[12px] text-neutral-700 disabled:opacity-60";
const FIELD = "mt-1 w-full max-w-xs rounded-full border border-neutral-900 bg-white px-2 py-1.5 text-[13px]";

const MODELS: { id: BayAppPriceModel; label: string }[] = [
  { id: "free", label: "免费" },
  { id: "one_time", label: "一次买断" },
  { id: "subscription", label: "按月订阅" },
];

export function PricingManagePanel({ appId }: { appId: string }): ReactElement | null {
  const tt = useUI();
  const resource = useBayResource(appId ? `app-pricing:${appId}` : null, () => getBayApp(appId));
  const app = resource.data?.app;
  const [model, setModel] = useState<BayAppPriceModel>("free");
  const [price, setPrice] = useState("");
  const [trial, setTrial] = useState("0");
  const [priceError, setPriceError] = useState("");
  const [trialError, setTrialError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [needPayout, setNeedPayout] = useState(false);

  useEffect(() => {
    if (!app) return;
    setModel(app.price_model);
    setPrice(fenToPriceInput(app.price_fen));
    setTrial(String(app.trial_days || 0));
    setPriceError("");
    setTrialError("");
    setError("");
    setSaved(false);
    setNeedPayout(false);
  }, [app]);

  if (resource.loading) return <PaneLoading />;
  if (!app) {
    return <PaneMessage text={resource.error ? tt(resource.error) : tt("找不到这件东西，可能已下架。")} onRetry={resource.reload} />;
  }

  async function save() {
    if (busy) return;
    const payload = pricingPayload(model, price, trial);
    if (!payload.ok) {
      setPriceError(payload.priceError ? tt(payload.priceError) : "");
      setTrialError(payload.trialError ? tt(payload.trialError) : "");
      return;
    }
    setPriceError("");
    setTrialError("");
    setBusy(true);
    setError("");
    setSaved(false);
    setNeedPayout(false);
    try {
      const body = await saveBayAppPricing(appId, payload.input);
      setModel(body.app.price_model);
      setPrice(fenToPriceInput(body.app.price_fen));
      setTrial(String(body.app.trial_days || 0));
      setSaved(true);
    } catch (err) {
      const message = errorText(err) || tt("没保存成功，请稍后再试。");
      setError(message);
      setNeedPayout(errorStatus(err) === 409 || offersMoneySettings(message));
    } finally {
      setBusy(false);
    }
  }

  const priceParsed = parsePriceInput(price);
  const trialParsed = parseTrialDays(trial);

  return (
    <section data-bay-pricing className="space-y-4">
      <div role="radiogroup" aria-label={tt("收费方式")} className="flex flex-wrap gap-2">
        {MODELS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={model === item.id}
            data-bay-price-model={item.id}
            onClick={() => {
              setModel(item.id);
              setSaved(false);
              if (item.id === "free") {
                setPrice("");
                setTrial("0");
                setPriceError("");
                setTrialError("");
              }
            }}
            className={
              model === item.id
                ? "rounded-full bg-neutral-900 px-3 py-1.5 text-[13px] font-medium text-white"
                : "rounded-full border border-neutral-900 bg-white px-3 py-1.5 text-[13px] text-neutral-700"
            }
          >
            {tt(item.label)}
          </button>
        ))}
      </div>

      {model !== "free" ? (
        <BayRevealForm
          items={[
            {
              id: "price",
              label: tt("价格"),
              done: priceParsed.ok,
              summary: priceParsed.ok ? price.trim() : undefined,
              children: (
                <input
                  type="text"
                  inputMode="decimal"
                  value={price}
                  data-bay-price-input
                  onChange={(event) => {
                    setPrice(event.target.value);
                    setPriceError("");
                    setSaved(false);
                  }}
                  className={FIELD}
                />
              ),
            },
            {
              id: "trial",
              label: tt("免费试用天数"),
              done: trialParsed.ok,
              summary: trial.trim() || undefined,
              children: (
                <input
                  type="text"
                  inputMode="numeric"
                  value={trial}
                  data-bay-trial-input
                  onChange={(event) => {
                    setTrial(event.target.value);
                    setTrialError("");
                    setSaved(false);
                  }}
                  className={FIELD}
                />
              ),
            },
          ]}
        />
      ) : null}

      {priceError ? <p className="text-[12px] text-rose-600">{priceError}</p> : null}
      {trialError ? <p className="text-[12px] text-rose-600">{trialError}</p> : null}

      {error ? <p className="text-[12px] text-rose-600">{tt(error)}</p> : null}
      {needPayout ? (
        <button type="button" data-bay-action="setup-payout" className={SECONDARY} onClick={() => openBaySettings()}>
          {tt("去开通收款")}
        </button>
      ) : null}
      {saved ? <p data-bay-pricing-saved className="text-[12px] text-emerald-700">{tt("已保存")}</p> : null}

      <button type="button" data-bay-action="save-pricing" disabled={busy} className={PRIMARY} onClick={() => void save()}>
        {busy ? tt("正在处理…") : tt("保存")}
      </button>
    </section>
  );
}
