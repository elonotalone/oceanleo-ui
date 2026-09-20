"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CloudComputerError,
  type CloudComputerClient,
  type ComputerCatalog,
} from "../../lib/cloud-computer-api";
import { currentDomainFamily } from "../../contracts/domain-family";
import { formatMinor } from "../../lib/money";
import { useUI } from "../../i18n/ui/useUI";
import { Modal } from "../../ui";

const BILLING_HREF = "/billing";

export function CreateComputerDialog({
  client,
  onClose,
  onCreated,
}: {
  client: CloudComputerClient;
  onClose: () => void;
  onCreated: () => void;
}) {
  const tt = useUI();
  const cn = currentDomainFamily() === "cn";
  const [catalog, setCatalog] = useState<ComputerCatalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [regionId, setRegionId] = useState("");
  const [tierId, setTierId] = useState("");
  const [diskGb, setDiskGb] = useState(40);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [needBalance, setNeedBalance] = useState<string | null>(null);

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
  const monthlyFromHourly = useMemo(() => {
    if (!tier) return null;
    return formatMinor(tier.monthly_estimate.amount_minor, tier.monthly_estimate.currency);
  }, [tier]);

  async function submit() {
    if (cn || !tier || !tier.available) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setSubmitError(tt("请填写电脑名字"));
      return;
    }
    setBusy(true);
    setSubmitError(null);
    setNeedBalance(null);
    try {
      await client.createAliyunComputer({
        name: trimmed,
        tier_id: tier.id,
        disk_gb: diskGb,
      });
      onCreated();
    } catch (err) {
      if (err instanceof CloudComputerError && err.code === "insufficient_balance") {
        setNeedBalance(err.message);
      } else {
        setSubmitError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-lg" labelledBy="oceanleo-cc-create-title">
      <div className="p-5" data-oceanleo-cc-create-dialog>
        <h2
          id="oceanleo-cc-create-title"
          className="text-[15px] font-semibold text-neutral-900"
        >
          {tt("创建云电脑")}
        </h2>
        {cn ? (
          <p className="mt-3 text-[13px] text-neutral-500">{tt("此功能在当前站点不可用")}</p>
        ) : loadError ? (
          <p className="mt-3 text-[13px] text-rose-600">{tt(loadError)}</p>
        ) : !catalog ? (
          <p className="mt-3 text-[13px] text-neutral-500">{tt("正在加载档位…")}</p>
        ) : (
          <div className="mt-4 space-y-4">
            <label className="block text-[12px] text-neutral-600">
              {tt("名字")}
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-[13px] text-neutral-900 outline-none focus:border-neutral-400"
                aria-label={tt("名字")}
              />
            </label>
            <label className="block text-[12px] text-neutral-600">
              {tt("地域")}
              <select
                value={regionId}
                onChange={(event) => setRegionId(event.target.value)}
                className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-[13px] text-neutral-900 outline-none"
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
                    className={`rounded-2xl border px-3 py-3 text-left text-[12px] transition ${
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
            {needBalance && (
              <div
                className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900"
                data-oceanleo-cc-insufficient-balance
              >
                <p>{tt(needBalance)}</p>
                <a
                  href={BILLING_HREF}
                  className="mt-1 inline-block font-medium underline"
                >
                  {tt("去充值")}
                </a>
              </div>
            )}
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
                onClick={() => void submit()}
                disabled={busy || !tier?.available}
                className="rounded-lg bg-neutral-900 px-3.5 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
              >
                {busy ? tt("创建中…") : tt("创建")}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
