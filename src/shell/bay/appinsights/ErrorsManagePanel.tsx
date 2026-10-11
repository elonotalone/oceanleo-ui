"use client";

import { useEffect, useState, type ReactElement } from "react";

import { useUI } from "../../../i18n/ui/useUI";
import {
  getBayAppErrorSetup,
  listBayAppErrors,
  setBayAppErrorStatus,
  type BayAppError,
  type BayAppErrorStatus,
} from "../../../lib/bay/app-insights";
import { requireBayLogin } from "../shell/bay-state";
import { PaneLoading } from "../supply/parts";
import { errorText, useBayResource } from "../supply/use-bay-resource";
import {
  errorActionLabel,
  errorActionStatus,
  errorEmptyText,
  errorLocation,
  errorStatusActions,
  formatInsightTime,
  type ErrorAction,
} from "./insights-model";

const FILTERS: BayAppErrorStatus[] = ["open", "resolved", "ignored"];
const FILTER_LABEL: Readonly<Record<BayAppErrorStatus, string>> = {
  open: "未处理",
  resolved: "已解决",
  ignored: "已忽略",
};

const BTN =
  "rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-[12px] text-neutral-700 disabled:opacity-60";

function ErrorBars({ days }: { days: { day: string; events: number }[] }): ReactElement {
  const tt = useUI();
  const max = days.reduce((high, row) => Math.max(high, row.events), 0);
  return (
    <div data-bay-error-chart className="flex h-16 items-end gap-px">
      {days.map((row) => {
        const ratio = max <= 0 ? 0 : row.events / max;
        const height = max <= 0 ? 4 : Math.max(4, Math.round(ratio * 64));
        const label = tt("{day}：{events} 次", { day: row.day, events: row.events });
        return (
          <div
            key={row.day}
            title={label}
            aria-label={label}
            className="min-w-0 flex-1 rounded-t bg-stone-400"
            style={{ height }}
          />
        );
      })}
    </div>
  );
}

function SetupBlock({
  snippet,
  receiving,
  lastEventAt,
}: {
  snippet: string;
  receiving: boolean;
  lastEventAt: string | null;
}): ReactElement {
  const tt = useUI();
  const [open, setOpen] = useState(!receiving);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");

  useEffect(() => {
    setOpen(!receiving);
  }, [receiving]);

  async function copy() {
    setCopyError("");
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
    } catch {
      setCopied(false);
      setCopyError(tt("没能复制，请手动选中复制"));
    }
  }

  const script = (
    <div data-bay-error-setup-script className="space-y-2">
      <p className="text-[13px] leading-relaxed text-neutral-700">
        {tt("把下面这一行放进作品网页的 <head> 里，作品在访客浏览器里出错时会自动报到这里")}
      </p>
      <pre data-bay-error-setup-snippet className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-neutral-50 px-3 py-2 text-[12px] text-neutral-800">
        {snippet}
      </pre>
      <button type="button" data-bay-error-copy onClick={() => void copy()} className={BTN}>
        {copied ? tt("已复制") : tt("复制")}
      </button>
      {copyError ? <p className="text-[12px] text-rose-600">{copyError}</p> : null}
      <p className="text-[12px] leading-5 text-neutral-500">
        {tt("它只上报错误信息、出错的页面路径和浏览器，不读 cookie，不上报地址里的参数")}
      </p>
    </div>
  );

  if (!receiving) return <div data-bay-error-setup="idle">{script}</div>;

  return (
    <div data-bay-error-setup="ready" className="space-y-2">
      <button
        type="button"
        data-bay-error-setup-toggle
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="text-left text-[13px] text-neutral-700"
      >
        {tt("已接好，最近一次上报：{time}", { time: formatInsightTime(lastEventAt) || "—" })}
        <span className="ml-2 text-[12px] text-neutral-500">{open ? tt("收起") : tt("展开")}</span>
      </button>
      {open ? script : null}
    </div>
  );
}

function ErrorCard({
  item,
  busy,
  error,
  onAction,
}: {
  item: BayAppError;
  busy: boolean;
  error: string;
  onAction: (action: ErrorAction) => void;
}): ReactElement {
  const tt = useUI();
  const [stackOpen, setStackOpen] = useState(false);
  const actions = errorStatusActions(item.status);
  return (
    <article data-bay-error-card={item.id} data-bay-error-status={item.status} className="space-y-2 rounded-xl border border-neutral-200 bg-white p-3">
      <code className="block line-clamp-3 break-all text-[12px] text-neutral-900">{item.message}</code>
      <p className="break-all text-[12px] text-neutral-500">{errorLocation(item.source, item.line, item.col)}</p>
      <p className="text-[12px] text-neutral-600">{tt("出现 {count} 次", { count: item.events })}</p>
      {item.page_path ? <p className="break-all text-[12px] text-neutral-500">{item.page_path}</p> : null}
      {item.browser ? <p className="text-[12px] text-neutral-500">{item.browser}</p> : null}
      <p className="text-[12px] text-neutral-500">
        {tt("首次 {time}", { time: formatInsightTime(item.first_seen_at) || "—" })}
        <span className="mx-1">·</span>
        {tt("最近 {time}", { time: formatInsightTime(item.last_seen_at) || "—" })}
      </p>
      {item.stack ? (
        <div>
          <button type="button" data-bay-error-stack-toggle={item.id} onClick={() => setStackOpen((value) => !value)} className="text-[12px] text-neutral-700">
            {stackOpen ? tt("收起") : tt("展开堆栈")}
          </button>
          {stackOpen ? (
            <pre data-bay-error-stack={item.id} className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-neutral-50 px-3 py-2 text-[12px] text-neutral-800">
              {item.stack}
            </pre>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            data-bay-error-action={action}
            disabled={busy}
            onClick={() => onAction(action)}
            className={BTN}
          >
            {busy ? tt("正在处理…") : tt(errorActionLabel(action))}
          </button>
        ))}
      </div>
      {error ? <p data-bay-error-action-error className="text-[12px] text-rose-600">{error}</p> : null}
    </article>
  );
}

export function ErrorsManagePanel({ appId }: { appId: string }): ReactElement {
  const tt = useUI();
  const [status, setStatus] = useState<BayAppErrorStatus>("open");
  const [more, setMore] = useState<BayAppError[]>([]);
  const [moreOffset, setMoreOffset] = useState<number | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [actionError, setActionError] = useState("");
  const setup = useBayResource(appId ? `error-setup:${appId}` : null, () => getBayAppErrorSetup(appId));
  const page = useBayResource(appId ? `errors:${appId}:${status}` : null, () => listBayAppErrors(appId, { status, limit: 20 }));

  useEffect(() => {
    setMore([]);
    setMoreOffset(page.data?.next_offset ?? null);
    setActionError("");
  }, [page.data, status, appId]);

  const items = [...(page.data?.items ?? []), ...more];
  const summary = page.data?.summary;

  async function loadMore() {
    if (moreBusy || moreOffset == null) return;
    setMoreBusy(true);
    try {
      const next = await listBayAppErrors(appId, { status, offset: moreOffset, limit: 20 });
      setMore((prev) => [...prev, ...next.items]);
      setMoreOffset(next.next_offset);
    } catch (error) {
      setActionError(errorText(error) || tt("报错列表没读出来，请稍后点「重试」。"));
    } finally {
      setMoreBusy(false);
    }
  }

  async function runAction(item: BayAppError, action: ErrorAction) {
    if (busyId) return;
    if (!requireBayLogin()) return;
    setBusyId(item.id);
    setActionError("");
    try {
      await setBayAppErrorStatus(item.id, errorActionStatus(action));
      page.reload();
      setup.reload();
    } catch (error) {
      setActionError(errorText(error) || tt("没处理成功，请稍后再试。"));
    } finally {
      setBusyId("");
    }
  }

  if ((setup.loading && !setup.data) || (page.loading && !page.data)) return <PaneLoading />;

  return (
    <div data-bay-errors-panel className="space-y-5">
      {setup.data ? (
        <SetupBlock snippet={setup.data.snippet} receiving={setup.data.receiving} lastEventAt={setup.data.last_event_at} />
      ) : (
        <div>
          <p className="text-[13px] text-rose-600">{setup.error || tt("接入说明没读出来，请稍后点「重试」。")}</p>
          <button type="button" onClick={setup.reload} className={`mt-2 ${BTN}`}>
            {tt("重试")}
          </button>
        </div>
      )}

      {page.data ? (
        <div data-bay-error-summary className="space-y-3">
          <div className="flex flex-wrap gap-3 text-[13px] text-neutral-800">
            <span>{tt("未处理 {count}", { count: summary?.open ?? 0 })}</span>
            <span>{tt("已解决 {count}", { count: summary?.resolved ?? 0 })}</span>
            <span>{tt("已忽略 {count}", { count: summary?.ignored ?? 0 })}</span>
            <span>{tt("最近 7 天 {count} 次", { count: summary?.events_7d ?? 0 })}</span>
          </div>
          <ErrorBars days={page.data.days} />
        </div>
      ) : (
        <div>
          <p className="text-[13px] text-rose-600">{page.error || tt("报错列表没读出来，请稍后点「重试」。")}</p>
          <button type="button" onClick={page.reload} className={`mt-2 ${BTN}`}>
            {tt("重试")}
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-1" role="tablist" aria-label={tt("未处理")}>
        {FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={value === status}
            data-bay-error-filter={value}
            onClick={() => setStatus(value)}
            className={
              value === status
                ? "rounded-lg bg-neutral-900 px-3 py-1.5 text-[12px] text-white"
                : "rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-[12px] text-neutral-700"
            }
          >
            {tt(FILTER_LABEL[value])}
          </button>
        ))}
      </div>

      {page.data && items.length === 0 ? (
        <p data-bay-error-empty className="text-[13px] text-neutral-500">
          {tt(errorEmptyText(status))}
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <ErrorCard
              key={item.id}
              item={item}
              busy={busyId === item.id}
              error={busyId === item.id || !busyId ? actionError : ""}
              onAction={(action) => void runAction(item, action)}
            />
          ))}
        </div>
      )}

      <p className="text-[12px] leading-5 text-neutral-500">{tt("已解决的报错再次出现时会自动回到未处理")}</p>

      {moreOffset != null ? (
        <button type="button" data-bay-error-more disabled={moreBusy} onClick={() => void loadMore()} className={BTN}>
          {moreBusy ? tt("正在加载…") : tt("加载更多")}
        </button>
      ) : null}
    </div>
  );
}
