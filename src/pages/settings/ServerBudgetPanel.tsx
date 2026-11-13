"use client";
import { useEffect, useRef, useState } from "react";
import type { CloudComputerClient, ServerAllowance } from "../../lib/cloud-computer-api";
import { formatMinor } from "../../lib/money";
import { Switch } from "../../ui";
import { useUI } from "../../i18n/ui/useUI";
import { CARD, CARD_DESC, CARD_TITLE, QUIET } from "./personalization/parts";
import { BudgetServerPurchase } from "./BudgetServerPurchase";

export function ServerBudgetPanel({ client, onPurchased }: {client: CloudComputerClient; onPurchased: () => void}) {
  const tt = useUI();
  const [result, setResult] = useState<{client: CloudComputerClient; value: ServerAllowance} | null>(null);
  const value = result?.client === client ? result.value : null;
  const [cap, setCap] = useState("");
  const [hourly, setHourly] = useState("");
  const [count, setCount] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  // Translate fallback message keys at render so locale changes never reload requests.
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [purchase, setPurchase] = useState(false);
  const generation = useRef(0);
  const saving = useRef(false);
  useEffect(() => {
    const ticket = ++generation.current;
    saving.current = false;
    client.getServerAllowance?.().then((row) => {
      if (ticket !== generation.current) return;
      setResult({client, value: row}); setCap(String(row.monthly_cap_minor / 100)); setEnabled(row.enabled);
      setHourly(row.max_hourly_minor == null ? "" : String(row.max_hourly_minor / 100));
      setCount(row.max_servers == null ? "" : String(row.max_servers));
    }, (err: unknown) => { if (ticket === generation.current) setError(err instanceof Error ? err.message : "预算读取失败"); });
    return () => { generation.current += 1; };
  }, [client]);
  function minor(text: string) { return /^\d+(\.\d{1,2})?$/.test(text) ? Math.round(Number(text) * 100) : NaN; }
  async function save() {
    if (saving.current || !client.saveServerAllowance) return;
    const monthly = minor(cap), perHour = hourly ? minor(hourly) : null, servers = count ? Number(count) : null;
    if (!Number.isSafeInteger(monthly) || monthly < 0 || (enabled && monthly === 0) ||
      (perHour !== null && (!Number.isSafeInteger(perHour) || perHour <= 0)) ||
      (servers !== null && (!Number.isInteger(servers) || servers <= 0))) {
      setError("请填写有效的预算金额和服务器数量"); return;
    }
    const ticket = generation.current;
    saving.current = true; setBusy(true); setError(""); setSaved(false);
    try {
      const row = await client.saveServerAllowance({enabled, monthly_cap_minor: monthly, max_hourly_minor: perHour, max_servers: servers});
      if (ticket === generation.current) { setResult({client, value: row}); setSaved(true); }
    } catch (err) { if (ticket === generation.current) setError(err instanceof Error ? err.message : "预算保存失败"); }
    finally { if (ticket === generation.current) { saving.current = false; setBusy(false); } }
  }
  if (!client.getServerAllowance) return null;
  return <section className={CARD} data-server-budget>
    <h3 className={CARD_TITLE}>{tt("Agent 服务器预算")}</h3>
    <p className={CARD_DESC}>{tt("只有你能授权预算。Agent 可在额度内购买、开停机和续费；释放仍由你确认。")}</p>
    <p className={CARD_DESC}>{tt("按量和抢占式按每月最多 744 小时预留，包含固定 1 Mbps 带宽。停机仍保留磁盘预算；包月按完整期限一次预留。关闭授权后不再允许新的购买和续费，已有费用继续保留。")}</p>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{tt(error)}</p>}
    {!value ? <p role="status">{tt("正在读取预算…")}</p> : <form className="mt-4 space-y-3 text-sm" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <div className="flex items-center justify-between gap-3"><span>{tt("授权 Agent 使用服务器预算")}</span><Switch label={tt("授权 Agent 使用服务器预算")} checked={enabled} disabled={busy} onChange={(next) => { setEnabled(next); setSaved(false); }} /></div>
      <div className="grid gap-3 sm:grid-cols-3">{[["每月上限", cap, setCap], ["单台每小时上限（可选）", hourly, setHourly], ["最多服务器数量（可选）", count, setCount]].map(([label, text, setter], i) => <label key={String(label)} className="block">{tt(String(label))} {i < 2 ? value.currency : ""}<input className="mt-1 block w-full rounded-lg border p-2" aria-label={tt(String(label))} type="number" min={i === 2 ? 1 : 0} step={i === 2 ? 1 : 0.01} value={text as string} disabled={busy} onInput={(e) => { (setter as (v: string) => void)(e.currentTarget.value); setSaved(false); }} /></label>)}</div>
      <p>{tt("已承诺")} {formatMinor(value.committed_minor, value.currency)} · {tt("剩余额度")} {formatMinor(value.remaining_minor, value.currency)}</p>
      <button className={QUIET} type="submit" disabled={busy}>{tt(busy ? "保存中…" : "保存授权")}</button>
      {saved && <p role="status">{tt("预算授权已保存")}</p>}
      {value.enabled && client.getServerOffers && client.buyBudgetServer && <button className={`${QUIET} ml-2`} type="button" onClick={() => setPurchase(!purchase)}>{tt("按预算购买服务器")}</button>}
    </form>}
    {purchase && value?.enabled && <BudgetServerPurchase client={client} allowance={value} onPurchased={() => { setPurchase(false); setSaved(false); onPurchased(); void client.getServerAllowance?.().then((row) => setResult({client, value: row}), () => {}); }} />}
  </section>;
}
