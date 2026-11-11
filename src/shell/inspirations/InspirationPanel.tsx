"use client";
import { useEffect, useRef, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { gatewayBase } from "../../lib/auth/config";
import { useConsoleAgentFocus } from "../SplitWorkspace";
import { useInspirationContext } from "./inspiration-context";
import { fetchInspirations, type BayInspiration } from "./inspiration-api";
import { fillInspirationWhenReady } from "./inspiration-fill";

export function InspirationPanel({ siteKey, appId, browse = false }: { siteKey?: string; appId?: string; browse?: boolean }) {
  const context = useInspirationContext();
  const site = siteKey ?? context?.siteKey;
  const app = appId ?? context?.appId;
  return <InspirationPanelContent key={JSON.stringify([site, app, browse])} siteKey={site} appId={app} browse={browse} />;
}

function InspirationPanelContent({ siteKey: site, appId: app, browse }: { siteKey?: string; appId?: string; browse: boolean }) {
  const tt = useUI();
  const context = useInspirationContext();
  const focus = useConsoleAgentFocus();
  const panel = useRef<HTMLDivElement | null>(null);
  const pending = useRef<AbortController | null>(null);
  const [offset, setOffset] = useState(0);
  const [resource, setResource] = useState<{ key: string; items: BayInspiration[]; total: number; error: boolean } | null>(null);
  const [fillMessage, setFillMessage] = useState("");
  const [reload, setReload] = useState(0);
  const canLoad = browse || Boolean(site && app);
  const requestKey = JSON.stringify([site, app, offset, reload]);
  const current = resource?.key === requestKey ? resource : null;
  const items = current?.items ?? [];
  const total = current?.total ?? 0;
  const loading = canLoad && !current;
  const error = current?.error ?? false;
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (!canLoad) return;
    const controller = new AbortController();
    void fetchInspirations(gatewayBase(), { siteKey: site, appId: app, offset }, controller.signal)
      .then(data => { if (!controller.signal.aborted) setResource({ key: requestKey, items: data.items, total: data.total, error: false }); })
      .catch(() => { if (!controller.signal.aborted) setResource({ key: requestKey, items: [], total: 0, error: true }); });
    return () => controller.abort();
  }, [site, app, offset, requestKey, canLoad]);
  async function fill(item: BayInspiration) {
    pending.current?.abort(); const controller = new AbortController(); pending.current = controller;
    setFillMessage("");
    const root = () => context?.root?.() || panel.current?.closest("[data-workspace-split]") || null;
    const result = await fillInspirationWhenReady(item.prompt, {
      root, signal: controller.signal,
      conversationHidden: focus?.agentVisible === false,
      openConversation: () => context?.openConversation?.() ?? focus?.focusAgent() ?? false,
    });
    if (controller.signal.aborted) return;
    setFillMessage(tt(result === "inserted" ? "已填入对话输入框" : "请打开此应用的对话后重试。"));
  }
  return <div ref={panel} data-inspiration-panel className="space-y-3 p-3">
    <p className="text-xs text-stone-500">{tt("平台灵感")}</p>
    {!browse && (!site || !app) ? <p>{tt("选择一个应用查看灵感。")}</p> : null}
    {loading ? <span className="v-spinner" role="status" aria-label={tt("加载中")} /> : error ? <div role="alert">{tt("灵感暂时无法加载，请重试。")} <button type="button" onClick={() => setReload(n => n + 1)}>{tt("重试")}</button></div> : !items.length && (browse || (site && app)) ? <p className="text-sm text-stone-500">{tt("此应用暂无平台灵感。")}</p> : null}
    {items.map(item => browse ? <article key={item.id} className="rounded-xl border border-stone-200 p-3">
      <p className="text-xs text-stone-500">{item.site_key} / {item.app_id} · {item.section}</p>
      <h3 className="mt-1 text-sm font-medium">{item.title}</h3>
      <p className="mt-2 whitespace-pre-wrap text-sm">{item.prompt}</p>
    </article> : <button key={item.id} type="button" data-inspiration-id={item.id} onClick={() => void fill(item)}
      className="block w-full rounded-xl border border-stone-200 p-3 text-left hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-stone-300">
      <span className="block text-xs text-stone-500">{item.section}</span>
      <strong className="mt-1 block text-sm font-medium">{item.title}</strong>
      <span className="mt-1 line-clamp-3 text-xs text-stone-500">{item.params.hint || item.prompt}</span>
      <span className="mt-2 block text-sm underline">{tt("使用灵感")}</span>
    </button>)}
    <p role="status" className="text-xs text-stone-500">{fillMessage}</p>
    {total > 200 ? <div className="flex items-center gap-3 text-sm">
      <button type="button" disabled={!offset || loading} onClick={() => setOffset(n => Math.max(0, n - 200))}>{tt("上一页")}</button>
      <span>{offset + 1}–{Math.min(offset + 200, total)} / {total}</span>
      <button type="button" disabled={offset + 200 >= total || loading} onClick={() => setOffset(n => n + 200)}>{tt("下一页")}</button>
    </div> : null}
  </div>;
}
