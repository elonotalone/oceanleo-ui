"use client";
import { useEffect, useRef, useState } from "react";
import type { CloudComputerClient, ComputerCatalog, ServerAllowance, ServerBillingMode, ServerOffers } from "../../lib/cloud-computer-api";
import { formatMinor } from "../../lib/money";
import { useUI } from "../../i18n/ui/useUI";
import { QUIET } from "./personalization/parts";

export const SERVER_MODE_COPY: Record<ServerBillingMode, string> = { pay_as_you_go: "按量付费", monthly: "包月", preemptible: "抢占式" };
export function BudgetServerPurchase({client, allowance, onPurchased}: {client: CloudComputerClient; allowance: ServerAllowance; onPurchased: () => void}) {
  const tt = useUI();
  const [catalogResult, setCatalogResult] = useState<{region: string; data: ComputerCatalog} | null>(null);
  const [region, setRegion] = useState("");
  const [tier, setTier] = useState("");
  const [disk, setDisk] = useState(20);
  const [months, setMonths] = useState(1);
  const [mode, setMode] = useState<ServerBillingMode>("pay_as_you_go");
  const [name, setName] = useState("");
  const [offerResult, setOfferResult] = useState<{key: string; data: ServerOffers} | null>(null);
  const [busy, setBusy] = useState(false);
  // Translate fallback message keys at render so locale changes never reload requests.
  const [error, setError] = useState("");
  const [confirmationKey, setConfirmationKey] = useState("");
  const submitting = useRef(false);
  const requestId = useRef<{key: string; id: string} | null>(null);
  const catalog = catalogResult?.region === region ? catalogResult.data : null;
  const offerKey = JSON.stringify([region, tier, disk, months]);
  const offers = offerResult?.key === offerKey ? offerResult.data : null;
  const confirmKey = JSON.stringify([offerKey, mode, name]);
  const confirmed = confirmationKey === confirmKey;
  useEffect(() => {
    let alive = true;
    client.getCatalog(region || undefined).then((row) => {
      if (!alive) return;
      setCatalogResult({region, data: row});
      if (!region) setRegion(row.recommended_region_id || row.regions[0]?.id || "");
      setTier((current) => row.tiers.some((t) => t.id === current) ? current : row.tiers.find((t) => t.available)?.id || "");
      setDisk((current) => Math.max(row.disk.min_gb, Math.min(row.disk.max_gb, current)));
    }, (err: unknown) => { if (alive) setError(err instanceof Error ? err.message : "报价读取失败"); });
    return () => { alive = false; };
  }, [client, region]);
  useEffect(() => {
    let alive = true;
    if (catalog && region && tier) client.getServerOffers?.({region_id: region, tier_id: tier, disk_gb: disk, period_months: months}).then(
      (row) => { if (alive) { setOfferResult({key: offerKey, data: row}); setError(""); } },
      (err: unknown) => { if (alive) setError(err instanceof Error ? err.message : "报价读取失败"); });
    return () => { alive = false; };
  }, [client, catalog, region, tier, disk, months, offerKey]);
  const offer = offers?.offers.find((item) => item.billing_mode === mode);
  const enough = offer?.available && offer.commitment_minor !== undefined && offer.commitment_minor <= allowance.remaining_minor;
  async function buy() {
    if (submitting.current || !client.buyBudgetServer || !enough || !confirmed || !name.trim()) return;
    submitting.current = true; setBusy(true); setError("");
    // Preserve this id after a network failure. The gateway retains uncertain orders.
    const payload = {name: name.trim(), region_id: region, tier_id: tier, disk_gb: disk, billing_mode: mode, period_months: months};
    const key = JSON.stringify(payload);
    if (requestId.current?.key !== key) requestId.current = {key, id: crypto.randomUUID()};
    try {
      const result = await client.buyBudgetServer({request_id: requestId.current.id, ...payload});
      if (result.status === "error") { setError("购买结果需要核对，预算保留，请勿重复购买"); return; }
      onPurchased();
    } catch (err) { setError(err instanceof Error ? err.message : "购买失败"); }
    finally { submitting.current = false; setBusy(false); }
  }
  const input = "mt-1 block w-full rounded-lg border p-2";
  return <div className="mt-5 space-y-3 border-t pt-4 text-sm" data-server-budget-purchase>
    <p>{tt("按预算购买服务器")}</p>
    {error && <p role="alert" className="text-red-700">{tt(error)}</p>}
    <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
      <label>{tt("名字")}<input className={input} value={name} maxLength={80} onInput={(e) => { setName(e.currentTarget.value); }} /></label>
      <label>{tt("地域")}<select className={input} value={region} onChange={(e) => setRegion(e.target.value)}>{catalog?.regions.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
      <label>{tt("规格")}<select className={input} value={tier} onChange={(e) => setTier(e.target.value)}>{catalog?.tiers.filter((t) => t.available).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
      <label>{tt("磁盘容量")} GB<input className={input} type="number" min={catalog?.disk.min_gb ?? 20} max={catalog?.disk.max_gb ?? 500} step={catalog?.disk.step_gb ?? 10} value={disk} onChange={(e) => setDisk(Number(e.target.value))} /></label>
      <label>{tt("计费方式")}<select className={input} value={mode} onChange={(e) => { setMode(e.target.value as ServerBillingMode); }}>{Object.entries(SERVER_MODE_COPY).map(([key, text]) => <option key={key} value={key}>{tt(text)}</option>)}</select></label>
      {mode === "monthly" && <label>{tt("包月时长")}<input className={input} type="number" min={1} max={9} value={months} onChange={(e) => setMonths(Number(e.target.value))} /></label>}
    </fieldset>
    {!offers ? <p role="status">{tt("正在读取报价…")}</p> : !offer?.available ? <p>{tt("此计费方式暂无可用报价")}</p> : <>
      <p>{tt(mode === "monthly" ? "本次费用" : "每小时")} {formatMinor(offer.price?.amount_minor, offer.price?.currency)} · {tt("预算预留")} {formatMinor(offer.commitment_minor, allowance.currency)}</p>
      <p>{tt("固定 1 Mbps 带宽，磁盘和带宽已计入报价。")}</p>
      {mode === "preemptible" && <p>{tt("抢占式服务器可能被阿里云回收，请及时保存工作。")}</p>}
      {!enough && <p role="alert">{tt("剩余额度不足，请先调整预算。")}</p>}
      <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(e) => setConfirmationKey(e.target.checked ? confirmKey : "")} />{tt("我确认这次操作会真实扣费并购买服务器")}</label>
      <button type="button" className={QUIET} disabled={busy || !enough || !confirmed || !name.trim()} onClick={() => void buy()}>{tt(busy ? "正在购买…" : "确认支付并创建")}</button>
    </>}
  </div>;
}
