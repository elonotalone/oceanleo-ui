"use client";

import { AutoRecovery } from "../AutoRecovery";
import { useEffect, useRef, useState } from "react";
import { workUsageApi, type WorkMoney, type WorkUsage, type WorkUsageApi, type WorkUsageLimit } from "../../api/work-usage";
import { useWebsiteLanguage, useWebsiteUI } from "./website-preview-i18n";

export const missingWorkFeature = (error: unknown) => [404, 501].includes(Number((error as { status?: number })?.status));
export function workMoneyText(money: WorkMoney, locale: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: money.currency }).format(money.amount_minor / 100);
}
export function monthlyLimitMinor(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(minor) && minor <= 100_000_000_000 ? minor : null;
}

function LoadError({ error, retry }: { error: unknown; retry: () => void; message: string }) {
  return <AutoRecovery identity="src/shell/website-platform/WorkUsagePanel.tsx:0" error={error} recover={retry} />;
}

function MonthlyUsage({ projectId, api }: { projectId: string; api: WorkUsageApi }) {
  const tt = useWebsiteUI(), locale = useWebsiteLanguage();
  const [data, setData] = useState<WorkUsage | null>(null), [error, setError] = useState<unknown>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError(null);
    void api.get(projectId, "month", controller.signal).then(value => { if (!controller.signal.aborted) setData(value); },
      error => { if (!controller.signal.aborted) setError(error); });
    return () => controller.abort();
  }, [projectId, api, revision]);
  return <section data-testid="work-monthly-usage" className="rounded border border-[var(--awb-border)] p-3">
    <h3 className="font-semibold">{tt("本月用量")}</h3>
    {!data && !error && <p role="status">{tt("加载中…")}</p>}
    {error != null && <LoadError error={error} message="暂时无法读取本月用量。" retry={() => setRevision(value => value + 1)} />}
    {data && <>
      <p className="my-2 font-medium">{tt("合计：{amount}", { amount: workMoneyText(data.total, locale) })}</p>
      {!data.lines.length && <p className="text-xs opacity-65">{tt("本月尚无用量记录。")}</p>}
      <ul className="space-y-2 text-xs">{data.lines.map((line, index) => <li key={index} className="break-words" data-usage-basis={line.basis}>
        <span>{tt(line.kind)} · {new Intl.NumberFormat(locale).format(line.quantity)} {tt(line.unit)} · {workMoneyText(line.amount, locale)}</span>
        {line.basis !== "metered" && <span className="ml-2 rounded bg-[var(--awb-hover)] px-1">{tt(line.basis === "lower_bound" ? "按可确认的较低用量计费" : "未计费：无法归属")}</span>}
      </li>)}</ul>
      <button type="button" className="mt-3 text-xs underline" onClick={() => setRevision(value => value + 1)}>{tt("刷新用量")}</button>
    </>}
  </section>;
}

function MonthlyLimit({ projectId, api }: { projectId: string; api: WorkUsageApi }) {
  const tt = useWebsiteUI(), locale = useWebsiteLanguage();
  const [data, setData] = useState<WorkUsageLimit | null>(null), [error, setError] = useState<unknown>(null);
  const [revision, setRevision] = useState(0), [amount, setAmount] = useState("");
  const [limited, setLimited] = useState(false), [onReach, setOnReach] = useState<"stop" | "notify">("stop");
  const [saving, setSaving] = useState(false), [notice, setNotice] = useState("");
  const [unconfirmed, setUnconfirmed] = useState(false);
  const operation = useRef<AbortController | null>(null);
  function accept(value: WorkUsageLimit) {
    setData(value); setLimited(value.monthly_limit !== null);
    setAmount(value.monthly_limit === null ? "" : (value.monthly_limit.amount_minor / 100).toFixed(2)); setOnReach(value.on_reach);
  }
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError(null); setNotice(""); setSaving(false);
    void api.limit(projectId, controller.signal).then(value => {
      if (!controller.signal.aborted) { accept(value); setUnconfirmed(false); }
    }, error => { if (!controller.signal.aborted) setError(error); });
    return () => { controller.abort(); operation.current?.abort(); operation.current = null; };
  }, [projectId, api, revision]);
  async function save() {
    const minor = monthlyLimitMinor(amount);
    if (!data || operation.current || unconfirmed || (limited && minor === null)) return;
    const controller = new AbortController(); operation.current = controller; setSaving(true); setNotice("");
    try {
      const value = await api.setLimit(projectId, { monthly_limit: limited ? { amount_minor: minor!, currency: data.used.currency } : null, on_reach: onReach }, controller.signal);
      if (!controller.signal.aborted) { accept(value); setNotice("月度上限已保存。"); }
    } catch (error) {
      if (!controller.signal.aborted) {
        setUnconfirmed(true); setNotice(missingWorkFeature(error) ? "此功能尚未在当前服务端开通" : "保存结果尚未确认，请重新读取后再保存。");
      }
    } finally { if (operation.current === controller) { operation.current = null; setSaving(false); } }
  }
  return <section data-testid="work-monthly-limit" className="rounded border border-[var(--awb-border)] p-3">
    <h3 className="font-semibold">{tt("月度用量上限")}</h3>
    <p className="my-2 text-xs opacity-65">{tt("达到上限的 80% 时提醒；达到 100% 时按你的选择暂停公开访问或仅提醒，提高或取消上限后可恢复访问。")}</p>
    {!data && !error && <p role="status">{tt("加载中…")}</p>}
    {error != null && <LoadError error={error} message="暂时无法读取月度上限。" retry={() => setRevision(value => value + 1)} />}
    {data && <>
      <p className="mb-2 text-xs">{tt("本月已用：{amount}", { amount: workMoneyText(data.used, locale) })} {data.reached && <strong>{tt("已达上限")}</strong>}</p>
      <form className="space-y-3 text-xs" onSubmit={event => { event.preventDefault(); void save(); }}>
        <label className="flex flex-wrap items-center gap-2">{tt("上限")}
          <select aria-label={tt("上限")} value={limited ? "amount" : "none"} disabled={saving || unconfirmed} className="rounded border bg-[var(--awb-chrome-bg)] p-2" onChange={event => { setLimited(event.target.value === "amount"); setNotice(""); }}>
            <option value="none">{tt("不设上限")}</option><option value="amount">{tt("设置金额")}</option>
          </select>
          {limited && <><span>{data.used.currency}</span><input aria-label={tt("月度上限金额")} inputMode="decimal" type="text" value={amount} disabled={saving || unconfirmed}
            className="min-w-0 rounded border bg-transparent p-2" onChange={event => { setAmount(event.target.value); setNotice(""); }} /></>}
        </label>
        {limited && monthlyLimitMinor(amount) === null && <p role="alert">{tt("请输入非负金额，最多两位小数。")}</p>}
        <label className="flex flex-wrap items-center gap-2">{tt("达到上限时")}
          <select aria-label={tt("达到上限时")} value={onReach} disabled={saving || unconfirmed} className="rounded border bg-[var(--awb-chrome-bg)] p-2" onChange={event => { setOnReach(event.target.value as "stop" | "notify"); setNotice(""); }}>
            <option value="stop">{tt("暂停公开访问")}</option><option value="notify">{tt("仅提醒")}</option>
          </select>
        </label>
        <button type="submit" disabled={saving || unconfirmed || (limited && monthlyLimitMinor(amount) === null)} className="rounded border px-3 py-2 disabled:opacity-50">{tt(saving ? "保存中…" : "保存月度上限")}</button>
      </form>
      {notice && <p className="mt-2 text-xs" role={unconfirmed ? "alert" : "status"}>{tt(notice)}</p>}
      <button type="button" disabled={saving} className="mt-3 text-xs underline" onClick={() => setRevision(value => value + 1)}>{tt("重新读取上限")}</button>
    </>}
  </section>;
}

export function WorkUsagePanel({ projectId, api = workUsageApi }: { projectId: string; api?: WorkUsageApi }) {
  return <div className="my-4 space-y-3" data-testid="work-usage"><MonthlyUsage key={projectId + ":usage"} projectId={projectId} api={api} /><MonthlyLimit key={projectId + ":limit"} projectId={projectId} api={api} /></div>;
}
