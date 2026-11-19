"use client";

import { AutoRecovery } from "../AutoRecovery";
import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { websiteConnectorsApi, type WebsiteConnectorPreset } from "../../api/website-connectors";
import { useWebsiteLanguage, useWebsiteUI } from "./website-preview-i18n";

import { HOSTING_TIERS, isHostingTier, type HostingTier } from "./hosting-tier";
const SampleWorkbench = lazy(() => import("../works-workbench/WorkWorkbench").then(module => ({ default: module.WorkWorkbench })));
const SAMPLES: Record<HostingTier, [string, string]> = {
  static: ["Static showcase", "静态展示"], request_billed: ["Request-billed sign-up", "按请求计费的报名应用"],
  server: ["Team board", "小组任务板"], heavy: ["Server job queue", "服务器任务队列"], own_accounts: ["Own accounts guide", "自有账号接入指南"],
};

/** Creation has no default; only a user's radio change selects a tier. */
export function HostingTierChoice({ value, onChange, disabled = false }: {
  value: HostingTier | ""; onChange: (value: HostingTier | "") => void; disabled?: boolean;
}) {
  const tt = useWebsiteUI(), locale = useWebsiteLanguage(), group = useId();
  const [samples, setSamples] = useState<Partial<Record<HostingTier, string>>>({});
  const [sample, setSample] = useState<{ project: string; tier: HostingTier } | null>(null);
  const [sampleError, setSampleError] = useState(""), [creating, setCreating] = useState(false), [uncertain, setUncertain] = useState(false);
  const creation = useRef<AbortController | null>(null);
  useEffect(() => () => creation.current?.abort(), []);
  const [tiers, setTiers] = useState<WebsiteConnectorPreset[] | null>(null);
  const [error, setError] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setError(false); setTiers(null);
    void websiteConnectorsApi.tiers!("", controller.signal).then(rows => {
      if (controller.signal.aborted) return;
      const choices = rows.filter(row => isHostingTier(row.id));
      if (choices.length !== HOSTING_TIERS.length) { setError(true); onChange(""); return; }
      setTiers(choices);
      if (value && !choices.some(row => row.id === value && row.available !== false && row.status !== "not_ready")) onChange("");
    }, () => { if (!controller.signal.aborted) { setError(true); onChange(""); } });
    return () => controller.abort();
    // A selection does not reload the catalog or reset the choice.
  }, [retry]);
  async function createSample(id: HostingTier) {
    if (creation.current || disabled || uncertain) return;
    if (samples[id]) { onChange(""); setSample({ project: samples[id]!, tier: id }); return; }
    const controller = new AbortController(); creation.current = controller; setCreating(true); setSampleError(""); onChange("");
    try {
      const result = await websiteConnectorsApi.createSample(id, locale.startsWith("zh") ? "zh" : "en", controller.signal);
      if (!controller.signal.aborted) { setSamples(previous => ({ ...previous, [id]: result.project.project_id })); setSample({ project: result.project.project_id, tier: id }); }
    } catch (error) {
      if (controller.signal.aborted) return;
      const receipt = error && typeof error === "object" && "project_id" in error && typeof error.project_id === "string" ? error.project_id : "";
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(receipt)) { setSamples(previous => ({ ...previous, [id]: receipt })); setSample({ project: receipt, tier: id }); setSampleError("作品已创建，请打开检查服务配置，勿重复创建。"); }
      else if (error && typeof error === "object" && "status" in error && [401, 403, 404, 405, 409, 422, 429].includes(Number(error.status))) setSampleError("无法创建样板作品，请刷新层级状态后重试。");
      else { setUncertain(true); setSampleError("创建结果尚未确认，请先查看作品列表，勿重复创建。"); }
    } finally { if (creation.current === controller) { creation.current = null; setCreating(false); } }
  }
  if (sample) return createPortal(<div role="dialog" aria-modal="true" aria-label={tt("打开样板作品")} className="fixed inset-0 z-[90] flex items-center justify-center bg-black/25 p-4">
    <section className="w-full max-w-3xl space-y-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-xl" data-hosting-tier-sample="" onSubmit={event => event.stopPropagation()}>
    <button type="button" className="text-sm underline" onClick={() => { onChange(sample.tier); setSample(null); }}>‹ {tt("服务层级")}</button>
    {sampleError && <p role="alert" className="text-xs">{tt(sampleError)}</p>}
    <div className="h-[60vh] min-h-0 overflow-hidden rounded-xl border border-stone-200">
      <Suspense fallback={<p role="status" className="p-3 text-sm">{tt("加载中…")}</p>}><SampleWorkbench workId={"cloud:" + sample.project} /></Suspense>
    </div>
  </section></div>, document.body);
  const text = (en?: string, zh?: string) => tt((locale.startsWith("zh") && zh ? zh : en) || "");
  return <fieldset disabled={disabled || creating || uncertain} className="mt-4 space-y-2" data-hosting-tier-choice="">
    <legend className="text-sm font-medium">{tt("服务层级")}</legend>
    <button type="button" className="text-xs underline" onClick={() => { onChange(""); setRetry(n => n + 1); }}>{tt("刷新层级状态")}</button>
    {!tiers && !error && <p role="status" className="text-xs">{tt("加载中…")}</p>}
    {error && <AutoRecovery identity="src/shell/website-platform/HostingTierChoice.tsx:0" error={error} recover={() => setRetry(n => n + 1)} />}
    {sampleError && <p role="alert" className="text-xs">{tt(sampleError)}</p>}
    {tiers?.map(tier => {
      const id = tier.id as HostingTier, unavailable = tier.available === false || tier.status === "not_ready";
      return <label key={id} data-tier-id={id} className={`block rounded-xl border p-3 text-xs ${value === id ? "border-stone-600 bg-stone-100" : "border-stone-200"}`}>
        <span className="flex items-center gap-2 text-sm font-medium">
          <input type="radio" name={group} value={id} checked={value === id} disabled={disabled || unavailable}
            onChange={() => onChange(id)} className="accent-stone-700" />{text(tier.label, tier.label_zh)}
        </span>
        <span className="mt-1 block text-stone-600">{text(tier.audience, tier.audience_zh)}</span>
        <span className="mt-1 block">{tt("样板作品：{name}", { name: text(...SAMPLES[id]) })}</span>
        <details className="mt-2"><summary className="cursor-pointer">{tt("可以运行")} · {tt("如何计费")}</summary>
          <p className="mt-2">{text(tier.can_run, tier.can_run_zh)}</p><p className="mt-2">{text(tier.cannot_run, tier.cannot_run_zh)}</p>
          <p className="mt-2">{text(tier.billing, tier.billing_zh)}</p></details>
        {tier.sample && <button type="button" className="mt-2 rounded-lg border border-stone-200 px-3 py-2 text-xs disabled:opacity-50" disabled={disabled || unavailable || creating || uncertain}
          onClick={() => void createSample(id)}>{tt(creating ? "创建中…" : samples[id] ? "打开样板作品" : "用样板新建一个作品看看")}</button>}
        {unavailable && <span role="status" className="mt-1 block text-stone-500">{text(tier.status_detail, tier.status_detail_zh) || tt("此层级暂不可用。")}</span>}
      </label>;
    })}
  </fieldset>;
}
