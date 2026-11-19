"use client";

import { AutoRecovery } from "../AutoRecovery";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { WebsiteTierSampleError, WebsiteConnectorPreset, WebsiteConnectorsApi } from "../../api/website-connectors";
import { useWebsiteLanguage, useWebsiteUI } from "./website-preview-i18n";
import { missingWorkFeature } from "./WorkUsagePanel";

const isTier = (preset: WebsiteConnectorPreset) => typeof preset.audience === "string" && typeof preset.can_run === "string";

export function WebsiteTierPresets({ projectId, api, presets, blocked, available, legacy, onApply, onOpen }: {
  projectId: string; api: WebsiteConnectorsApi; presets: WebsiteConnectorPreset[];
  blocked: boolean; available: boolean; legacy: ReactNode;
  onApply: (presetId: string) => void; onOpen: (projectId: string) => void;
}) {
  const tt = useWebsiteUI(), locale = useWebsiteLanguage();
  const text = (en?: string, zh?: string) => tt((locale.startsWith("zh") && zh ? zh : en) || "");
  const [tiers, setTiers] = useState<WebsiteConnectorPreset[] | null>(null), [error, setError] = useState<unknown>(null);
  const [revision, setRevision] = useState(0), [creating, setCreating] = useState("");
  const [sampleError, setSampleError] = useState(""), [sampleProject, setSampleProject] = useState("");
  const [unconfirmed, setUnconfirmed] = useState(false);
  const creation = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController(); setTiers(null); setError(null);
    if (api.tiers) void api.tiers(projectId, controller.signal).then(value => {
      if (!controller.signal.aborted) setTiers(value);
    }, error => { if (!controller.signal.aborted) setError(error); });
    else setTiers(presets);
    return () => controller.abort();
  }, [projectId, api, revision]);
  useEffect(() => () => { creation.current?.abort(); }, []);
  async function create(tier: WebsiteConnectorPreset) {
    if (!api.createSample || creation.current || blocked || !available || unconfirmed || tier.available === false || tier.status === "not_ready") return;
    const controller = new AbortController(); creation.current = controller; setCreating(tier.id); setSampleError("");
    try {
      const value = await api.createSample(tier.id, locale.startsWith("zh") ? "zh" : "en", controller.signal);
      if (!controller.signal.aborted) { setSampleProject(value.project.project_id); onOpen(value.project.project_id); }
    } catch (error) {
      if (!controller.signal.aborted) {
        const failure = error instanceof Error && error.name === "WebsiteTierSampleError" ? error as WebsiteTierSampleError : null;
        if (failure?.project_id) { setSampleProject(failure.project_id); setUnconfirmed(true); setSampleError("作品已创建，请打开检查服务配置，勿重复创建。"); }
        else if (missingWorkFeature(error)) setSampleError("此功能尚未在当前服务端开通");
        else if (failure && [401, 403, 409, 422, 429].includes(failure.status)) setSampleError("无法创建样板作品，请刷新层级状态后重试。");
        else { setUnconfirmed(true); setSampleError("创建结果尚未确认，请先查看作品列表，勿重复创建。"); }
      }
    } finally { if (creation.current === controller) { creation.current = null; setCreating(""); } }
  }
  const visibleTiers = api.tiers ? tiers : presets;
  const oldGateway = error && missingWorkFeature(error) && !presets.some(isTier);
  if (!api.tiers && !presets.some(isTier)) return <>{legacy}</>;
  return <section className="my-4 space-y-3 rounded border border-[var(--awb-border)] p-3" data-testid="website-service-tiers">
    <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{tt("服务层级")}</h3>
      <button type="button" className="text-xs underline" onClick={() => setRevision(value => value + 1)}>{tt("刷新层级状态")}</button></div>
    {!visibleTiers && !error && <p role="status">{tt("加载中…")}</p>}
    {error != null && <AutoRecovery identity="src/shell/website-platform/WebsiteTierPresets.tsx:0" error={error} recover={() => setRevision(value => value + 1)} />}
    {oldGateway || (visibleTiers && !visibleTiers.some(isTier)) ? legacy : visibleTiers?.map(tier => {
      const unavailable = tier.available === false || tier.status === "not_ready";
      return <article className="space-y-2 rounded border border-[var(--awb-border)] p-3 text-xs" key={tier.id} data-tier-id={tier.id}>
        <h4 className="text-sm font-semibold">{text(tier.label, tier.label_zh)} {unavailable && <span className="font-normal">{tt("暂不可用")}</span>}</h4>
        <p>{text(tier.audience, tier.audience_zh)}</p>
        <dl className="space-y-2">{([
          ["可以运行", tier.can_run, tier.can_run_zh], ["不能运行", tier.cannot_run, tier.cannot_run_zh],
          ["如何计费", tier.billing, tier.billing_zh], ["迁往下一层级", tier.upgrade, tier.upgrade_zh],
        ] as const).map(([label, en, zh]) => en || zh ? <div key={label}><dt className="opacity-65">{tt(label)}</dt><dd className="whitespace-pre-wrap break-words">{text(en, zh)}</dd></div> : null)}</dl>
        {unavailable && <p role="status" className="break-words">{text(tier.status_detail, tier.status_detail_zh) || tt("此层级暂不可用。")}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded border px-3 py-2 disabled:opacity-50" disabled={blocked || !available || unavailable} onClick={() => onApply(tier.id)}>{tt("使用此层级")}</button>
          {tier.sample && <button type="button" className="rounded border px-3 py-2 disabled:opacity-50" disabled={!api.createSample || blocked || !available || !!creating || unconfirmed || !!sampleProject || unavailable}
            onClick={() => void create(tier)}>{tt(creating === tier.id ? "创建中…" : "用样板新建一个作品看看")}</button>}
        </div>
      </article>;
    })}
    {sampleError && <p role="alert" className="text-xs">{tt(sampleError)} <button type="button" className="underline" onClick={() => setRevision(value => value + 1)}>{tt("刷新层级状态")}</button></p>}
    {sampleProject && <button type="button" className="text-xs underline" onClick={() => onOpen(sampleProject)}>{tt("打开样板作品")}</button>}
  </section>;
}
