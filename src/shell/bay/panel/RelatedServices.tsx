"use client";

// 右侧栏里的「与我的问题相关的服务」。agent 的找真人请求来了就画这一块。
import { useEffect, useState, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { fetchBayRelated, type BayRelatedPage } from "../../../lib/bay/related";
import { ConsultCard, ServiceCard } from "../supply";
import { startPostNeed } from "../shell/BayList";
import { baySiteName } from "../shell/bay-links";
import { openBay } from "../shell/bay-state";
import type { BayPanelRequest } from "./BayPanel";

export interface RelatedServicesProps {
  siteKey: string;
  request: BayPanelRequest;
  active: boolean;
  onBrowseAll: () => void;
}

const BTN =
  "inline-flex shrink-0 items-center justify-center rounded-lg px-3 py-1.5 text-[13px] font-medium transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)]";
const BTN_PRIMARY = `${BTN} bg-stone-900 text-white hover:bg-stone-800`;
const BTN_SECONDARY = `${BTN} border border-stone-200 bg-white text-stone-700 hover:bg-stone-50`;
const BTN_QUIET = `${BTN} text-stone-600 hover:bg-stone-100 hover:text-stone-900`;

function isAbort(error: unknown, signal: AbortSignal): boolean {
  if (signal.aborted) return true;
  return Boolean(error && typeof error === "object" && (error as { name?: string }).name === "AbortError");
}

export function RelatedServices({ siteKey, request, active, onBrowseAll }: RelatedServicesProps): ReactElement {
  const tt = useUI();
  const [retryTick, setRetryTick] = useState(0);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [page, setPage] = useState<BayRelatedPage | null>(null);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setStatus("loading");
    setPage(null);
    void fetchBayRelated({ q: request.query, site: request.category || siteKey, limit: 12 }, { signal: controller.signal })
      .then((next) => {
        if (controller.signal.aborted) return;
        setPage(next);
        setStatus("ok");
      })
      .catch((error: unknown) => {
        if (isAbort(error, controller.signal)) return;
        setStatus("error");
      });
    return () => {
      controller.abort();
    };
  }, [active, request.nonce, siteKey, retryTick, request.query, request.category]);

  return (
    <section data-bay-panel="related" className="flex h-full min-h-0 flex-col overflow-y-auto p-3">
      <h2 data-bay-related-title className="text-[14px] font-semibold text-stone-900">
        {tt("与我的问题相关的服务")}
      </h2>
      {page?.q ? (
        <p data-bay-related-query className="mt-1 text-[12px] text-stone-500">
          {tt("关键词：{q}", { q: page.q })}
        </p>
      ) : null}
      {page?.match === "site" ? (
        <p data-bay-related-note className="mt-1 text-[12px] text-stone-500">
          {tt("没有直接匹配的服务，下面是 {site} 这个类目里的服务。", { site: baySiteName(page.site) ?? "" })}
        </p>
      ) : null}
      {status === "loading" ? (
        <div role="status" aria-busy="true" aria-label={tt("正在加载…")} data-bay-related-loading className="mt-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} aria-hidden="true" className="border-b border-black/5 px-3 py-3 dark:border-white/10">
              <div className="h-3.5 w-2/3 animate-pulse rounded bg-black/5 dark:bg-white/10" />
              <div className="mt-2 h-3 w-full animate-pulse rounded bg-black/5 dark:bg-white/10" />
              <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-black/5 dark:bg-white/10" />
            </div>
          ))}
        </div>
      ) : null}
      {status === "error" ? (
        <div role="status" data-bay-related-error className="mt-6 flex flex-col items-center px-4 py-8 text-center">
          <p className="text-[13px] text-stone-600">{tt("相关服务没读出来，请稍后再试。")}</p>
          <button type="button" data-bay-related-retry onClick={() => setRetryTick((n) => n + 1)} className={`mt-4 ${BTN_SECONDARY}`}>
            {tt("重试")}
          </button>
        </div>
      ) : null}
      {status === "ok" && page && page.items.length === 0 ? (
        <div data-bay-related-empty className="flex flex-col items-center px-4 py-10 text-center">
          <p className="text-[13px] text-stone-600">{tt("还没有相关的服务。")}</p>
          <p className="mt-1 text-[12px] text-stone-500">{tt("你可以发一条需求，让会做的人来找你。")}</p>
          <button
            type="button"
            data-bay-related-post-need
            onClick={() => startPostNeed(request.category || undefined)}
            className={`mt-4 ${BTN_PRIMARY}`}
          >
            {tt("发需求")}
          </button>
          <button type="button" data-bay-related-browse onClick={onBrowseAll} className={`mt-2 ${BTN_QUIET}`}>
            {tt("逛全部 LeoBay")}
          </button>
        </div>
      ) : null}
      {status === "ok" && page && page.items.length > 0 ? (
        <>
          <div data-bay-related-list className="mt-3">
            {page.items.map((item) => (
              <div key={`${item.kind}:${item.id}`} data-bay-related-item={item.kind}>
                {item.kind === "service" ? (
                  <ServiceCard item={item} variant="row" onOpen={() => openBay({ kind: "service", id: item.id })} />
                ) : item.kind === "consult" ? (
                  <ConsultCard item={item} variant="row" onOpen={() => openBay({ kind: "consult", id: item.id })} />
                ) : null}
              </div>
            ))}
          </div>
          <button type="button" data-bay-related-browse onClick={onBrowseAll} className={`mt-3 self-start ${BTN_QUIET}`}>
            {tt("逛全部 LeoBay")}
          </button>
        </>
      ) : null}
    </section>
  );
}
