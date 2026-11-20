"use client";
import { AutoRecovery } from "../AutoRecovery";
import { useEffect, useRef, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { gatewayBase } from "../../lib/auth/config";
import { resolvePublicAssetMedia } from "../../lib/asset-delivery";
import { useConsoleAgentFocus } from "../SplitWorkspace";
import { useInspirationContext } from "./inspiration-context";
import { fetchInspirations, inspirationImage, inspirationLine, type BayInspiration } from "./inspiration-api";
import { fillInspirationWhenReady } from "./inspiration-fill";
import { MEDIA_CARD_PANEL_GRID_STYLE, MediaCard } from "./MediaCard";

/** Cards per request; "Load more" appends the next page. */
export const INSPIRATION_PAGE = 40;

export function InspirationPanel({ siteKey, appId, browse = false }: { siteKey?: string; appId?: string; browse?: boolean }) {
  const context = useInspirationContext();
  const site = siteKey ?? context?.siteKey;
  const app = appId ?? context?.appId;
  return <InspirationPanelContent key={JSON.stringify([site, app, browse])} siteKey={site} appId={app} browse={browse} />;
}

function cardImage(item: BayInspiration): string | null {
  const raw = inspirationImage(item);
  return raw ? resolvePublicAssetMedia(raw, { purpose: "thumb" }) || null : null;
}

function InspirationPanelContent({ siteKey: site, appId: app, browse }: { siteKey?: string; appId?: string; browse: boolean }) {
  const tt = useUI();
  const context = useInspirationContext();
  const focus = useConsoleAgentFocus();
  const panel = useRef<HTMLDivElement | null>(null);
  const pending = useRef<AbortController | null>(null);
  // The parent keys this component by site/app, so pages only ever accumulate for one scope.
  const [offset, setOffset] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ items: BayInspiration[]; total: number }>({ items: [], total: 0 });
  const [settled, setSettled] = useState<{ key: string; error: boolean } | null>(null);
  const [fillMessage, setFillMessage] = useState("");
  const canLoad = browse || Boolean(site && app);
  const requestKey = JSON.stringify([offset, attempt]);
  const done = settled?.key === requestKey ? settled : null;
  const loading = canLoad && !done;
  const error = done?.error ?? false;
  const { items, total } = loaded;
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (!canLoad) return;
    const controller = new AbortController();
    void fetchInspirations(gatewayBase(), { siteKey: site, appId: app, offset, limit: INSPIRATION_PAGE }, controller.signal)
      .then(data => {
        if (controller.signal.aborted) return;
        setLoaded(previous => {
          if (!offset) return { items: data.items, total: data.total };
          const seen = new Set(previous.items.map(item => item.id));
          return { items: [...previous.items, ...data.items.filter(item => !seen.has(item.id))], total: data.total };
        });
        setSettled({ key: requestKey, error: false });
      })
      .catch(() => { if (!controller.signal.aborted) setSettled({ key: requestKey, error: true }); });
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
  const more = !loading && !error && offset + INSPIRATION_PAGE < total && items.length < total;
  return <div ref={panel} data-inspiration-panel className="space-y-3 p-3">
    <p className="text-[11px] text-stone-400">{tt("平台灵感")}</p>
    {!browse && (!site || !app) ? <p className="text-sm text-stone-500">{tt("选择一个应用查看灵感。")}</p> : null}
    {items.length ? <div data-inspiration-grid style={MEDIA_CARD_PANEL_GRID_STYLE}>
      {items.map(item => browse
        ? <MediaCard key={item.id} title={item.title} image={cardImage(item)}
            line={`${item.site_key} / ${item.app_id} · ${inspirationLine(item)}`}
            hooks={{ "data-inspiration-card": item.id }} />
        : <MediaCard key={item.id} title={item.title} image={cardImage(item)} line={inspirationLine(item)}
            onClick={() => void fill(item)}
            hooks={{ "data-inspiration-card": item.id }} buttonHooks={{ "data-inspiration-id": item.id }} />)}
    </div> : null}
    {loading ? <span className="v-spinner" role="status" aria-label={tt("加载中")} />
      : error ? <AutoRecovery identity="src/shell/inspirations/InspirationPanel.tsx:0" recover={() => setAttempt(n => n + 1)} />
      : !items.length && canLoad ? <p className="text-sm text-stone-500">{tt("此应用暂无平台灵感。")}</p> : null}
    <p role="status" className="text-xs text-stone-500">{fillMessage}</p>
    {more ? <button type="button" data-inspiration-more onClick={() => setOffset(n => n + INSPIRATION_PAGE)}
      className="w-full rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-[13px] font-medium text-stone-700 transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-300">
      {tt("加载更多")}
    </button> : null}
  </div>;
}
