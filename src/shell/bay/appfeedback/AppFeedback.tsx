"use client";

import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import {
  createBayAppThread,
  listBayAppThreads,
  type BayAppFeedbackSettings,
  type BayAppFeedbackSummary,
  type BayAppThread,
  type BayAppThreadInput,
} from "../../../lib/bay/app-feedback";
import { openBay, requireBayLogin } from "../shell/bay-state";
import { ThreadCard } from "./ThreadCard";
import { ThreadComposer } from "./ThreadComposer";
import {
  EMPTY_SUMMARY,
  KIND_FILTERS,
  STATUS_FILTERS,
  actionErrorText,
  canWriteFeedback,
  emptyListMessage,
  isAbort,
  kindFilterCount,
  kindLabel,
  listThreadParams,
  statusFilterCount,
  statusFilterLabel,
  toggleKind,
  type KindFilter,
  type StatusFilter,
} from "./feedback-model";

export interface AppFeedbackProps {
  appId: string;
  isOwner: boolean;
}

const PAGE_SIZE = 20;

export function AppFeedback({ appId, isOwner }: AppFeedbackProps): ReactElement | null {
  const tt = useUI();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [kind, setKind] = useState<KindFilter>("");
  const [items, setItems] = useState<BayAppThread[]>([]);
  const [summary, setSummary] = useState<BayAppFeedbackSummary>(EMPTY_SUMMARY);
  const [settings, setSettings] = useState<BayAppFeedbackSettings>({
    feedback_mode: "open",
    ai_answer: false,
    typical_reply_hours: null,
  });
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const requestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (offset: number, replace: boolean, nextStatus: StatusFilter, nextKind: KindFilter) => {
      if (!appId) return;
      const request = ++requestRef.current;
      if (replace) abortRef.current?.abort();
      const controller = typeof AbortController === "undefined" ? null : new AbortController();
      abortRef.current = controller;
      setLoading(true);
      if (replace) {
        setError("");
        setItems([]);
        setNextOffset(null);
      }
      try {
        const page = await listBayAppThreads(
          appId,
          listThreadParams({ status: nextStatus, kind: nextKind, offset, limit: PAGE_SIZE }),
          controller?.signal,
        );
        if (request !== requestRef.current) return;
        setItems((prev) => (replace ? page.items : [...prev, ...page.items.filter((row) => !prev.some((item) => item.id === row.id))]));
        setSummary(page.summary || EMPTY_SUMMARY);
        setSettings(page.settings);
        setNextOffset(page.next_offset);
        setError("");
      } catch (caught) {
        if (request !== requestRef.current || isAbort(caught) || controller?.signal.aborted) return;
        setError(actionErrorText(caught, tt("留言没读出来，请稍后点「重试」。")));
      } finally {
        if (request === requestRef.current) setLoading(false);
      }
    },
    [appId, tt],
  );

  useEffect(() => {
    void load(0, true, status, kind);
    return () => abortRef.current?.abort();
  }, [load, status, kind]);

  async function publish(input: BayAppThreadInput) {
    if (busy) return;
    setBusy(true);
    setActionError("");
    try {
      const result = await createBayAppThread(appId, input);
      if (result.moderation_hidden) {
        setActionError(result.moderation_message);
        return;
      }
      setItems((prev) => [result.thread, ...prev.filter((item) => item.id !== result.thread.id)]);
      setComposerOpen(false);
    } catch (caught) {
      setActionError(actionErrorText(caught, tt("这次没提交成功，请稍后再试。")));
    } finally {
      setBusy(false);
    }
  }

  if (!appId) return null;
  const filtered = status !== "all" || Boolean(kind);
  const writable = canWriteFeedback(isOwner, settings.feedback_mode);

  return (
    <section data-bay-app-feedback className="mt-5 space-y-3">
      <h3 className="text-[14px] font-semibold text-neutral-900">{tt("留言与反馈")}</h3>
      <div className="space-y-0.5 text-[12px] text-neutral-500">
        {settings.typical_reply_hours != null ? <p>{tt("作者通常 {n} 小时内回复", { n: settings.typical_reply_hours })}</p> : null}
        {settings.ai_answer ? <p>{tt("提问和报错会先由 AI 助手回答")}</p> : null}
      </div>

      {isOwner ? (
        <button
          type="button"
          data-bay-action="manage-feedback"
          onClick={() => openBay({ kind: "app-manage", appId, tab: "feedback" })}
          className="rounded-full border border-neutral-900 px-3 py-1.5 text-[13px] text-neutral-800 hover:bg-neutral-50"
        >
          {tt("去管理留言")}
        </button>
      ) : null}
      {!isOwner && settings.feedback_mode === "off" ? (
        <p data-bay-feedback-closed className="text-[13px] text-neutral-500">
          {tt("作者没有开放留言")}
        </p>
      ) : null}
      {writable ? (
        composerOpen ? (
          <ThreadComposer busy={busy} error={actionError} onSubmit={publish} />
        ) : (
          <button
            type="button"
            data-bay-action="write-thread"
            onClick={() => {
              if (requireBayLogin()) setComposerOpen(true);
            }}
            className="rounded-full border border-neutral-900 px-3 py-1.5 text-[13px] text-neutral-800 hover:bg-neutral-50"
          >
            {tt("写留言")}
          </button>
        )
      ) : null}
      {actionError && !composerOpen ? <p className="text-[12px] text-rose-600">{actionError}</p> : null}

      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            data-bay-feedback-status={value}
            aria-pressed={status === value}
            onClick={() => setStatus(value)}
            className={
              "rounded-lg border px-2.5 py-1 text-[12px] " +
              (status === value
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-200 text-neutral-700 hover:bg-neutral-50")
            }
          >
            {tt(statusFilterLabel(value))} {statusFilterCount(summary, value)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {KIND_FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            data-bay-feedback-kind={value}
            aria-pressed={kind === value}
            onClick={() => setKind((prev) => toggleKind(prev, value))}
            className={
              "rounded-lg border px-2.5 py-1 text-[12px] " +
              (kind === value
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-200 text-neutral-700 hover:bg-neutral-50")
            }
          >
            {tt(kindLabel(value))} {kindFilterCount(summary, value)}
          </button>
        ))}
      </div>

      {loading && items.length === 0 ? <p className="text-[12.5px] text-neutral-500">{tt("正在读取留言…")}</p> : null}
      {error ? (
        <div className="space-y-2">
          <p className="text-[12.5px] text-rose-600">{error}</p>
          <button type="button" onClick={() => void load(0, true, status, kind)} className="text-[12px] text-neutral-600 hover:underline">
            {tt("重试")}
          </button>
        </div>
      ) : null}
      {!loading && !error && items.length === 0 ? (
        <p data-bay-feedback-empty className="text-[13px] text-neutral-500">
          {tt(emptyListMessage(filtered))}
        </p>
      ) : null}
      <div className="space-y-2">
        {items.map((thread) => (
          <ThreadCard key={thread.id} thread={thread} />
        ))}
      </div>
      {nextOffset != null ? (
        <button
          type="button"
          data-bay-action="load-more"
          disabled={loading}
          onClick={() => void load(nextOffset, false, status, kind)}
          className="w-full rounded-lg border border-neutral-200 py-2 text-[13px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
        >
          {loading ? tt("正在读取留言…") : tt("加载更多")}
        </button>
      ) : null}
    </section>
  );
}
