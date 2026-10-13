"use client";

import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import {
  getBayAppDigest,
  listBayAppFeedbackInbox,
  listBayAppThreads,
  refreshBayAppDigest,
  updateBayAppFeedbackSettings,
  type BayAppDigest,
  type BayAppFeedbackSettings,
  type BayAppThread,
} from "../../../lib/bay/app-feedback";
import { Section } from "../supply/parts";
import { ThreadCard } from "./ThreadCard";
import {
  STATUS_FILTERS,
  actionErrorText,
  formatDigestWeek,
  inboxParams,
  isAbort,
  kindLabel,
  statusFilterLabel,
  type StatusFilter,
} from "./feedback-model";

function Switch({
  checked,
  disabled,
  name,
  label,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  name: string;
  label: string;
  onChange: (next: boolean) => void;
}): ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-bay-switch={name}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex h-8 w-12 items-center justify-center rounded-full disabled:opacity-50"
    >
      <span className={"relative inline-flex h-5 w-9 items-center rounded-full " + (checked ? "bg-neutral-900" : "bg-neutral-300")}>
        <span
          className={
            "inline-block h-3.5 w-3.5 rounded-full bg-white shadow " + (checked ? "translate-x-[18px]" : "translate-x-[3px]")
          }
        />
      </span>
    </button>
  );
}

const PAGE_SIZE = 20;

export function FeedbackManagePanel({ appId }: { appId: string }): ReactElement | null {
  const tt = useUI();
  const [settings, setSettings] = useState<BayAppFeedbackSettings | null>(null);
  const [digest, setDigest] = useState<BayAppDigest | null>(null);
  const [status, setStatus] = useState<StatusFilter>("open");
  const [items, setItems] = useState<BayAppThread[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [digestError, setDigestError] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const requestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!appId) return;
    let live = true;
    void listBayAppThreads(appId, { limit: 1 }).then(
      (page) => {
        if (live) setSettings(page.settings);
      },
      (caught: unknown) => {
        if (live) setSettingsError(actionErrorText(caught, tt("这次没提交成功，请稍后再试。")));
      },
    );
    void getBayAppDigest(appId).then(
      (body) => {
        if (live) setDigest(body.digest);
      },
      (caught: unknown) => {
        if (live) setDigestError(actionErrorText(caught, tt("这次没提交成功，请稍后再试。")));
      },
    );
    return () => {
      live = false;
    };
  }, [appId, tt]);

  const loadInbox = useCallback(
    async (offset: number, replace: boolean, nextStatus: StatusFilter) => {
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
        const page = await listBayAppFeedbackInbox(
          inboxParams({ appId, status: nextStatus, offset, limit: PAGE_SIZE }),
        );
        if (request !== requestRef.current) return;
        setItems((prev) => (replace ? page.items : [...prev, ...page.items.filter((row) => !prev.some((item) => item.id === row.id))]));
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
    void loadInbox(0, true, status);
    return () => abortRef.current?.abort();
  }, [loadInbox, status]);

  async function saveSettings(patch: { feedback_mode?: "open" | "off"; ai_answer?: boolean }) {
    if (!settings || saving) return;
    const previous = settings;
    setSettings({
      ...settings,
      feedback_mode: patch.feedback_mode ?? settings.feedback_mode,
      ai_answer: patch.ai_answer ?? settings.ai_answer,
    });
    setSaving(true);
    setSettingsError("");
    try {
      const result = await updateBayAppFeedbackSettings(appId, patch);
      setSettings(result.settings);
    } catch (caught) {
      setSettings(previous);
      setSettingsError(actionErrorText(caught, tt("这次没提交成功，请稍后再试。")));
    } finally {
      setSaving(false);
    }
  }

  async function rewriteDigest() {
    if (refreshing) return;
    setRefreshing(true);
    setDigestError("");
    try {
      const result = await refreshBayAppDigest(appId);
      setDigest(result.digest);
    } catch (caught) {
      setDigestError(actionErrorText(caught, tt("这次没提交成功，请稍后再试。")));
    } finally {
      setRefreshing(false);
    }
  }

  if (!appId) return null;
  const week = digest ? formatDigestWeek(digest.week_start) : "";

  return (
    <div data-bay-manage-feedback className="space-y-6">
      <Section title={tt("设置")}>
        <div data-bay-feedback-settings className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[13px] font-medium text-neutral-900">{tt("接受留言")}</p>
            </div>
            <Switch
              checked={settings?.feedback_mode === "open"}
              disabled={saving || !settings}
              name="feedback-mode"
              label={tt("接受留言")}
              onChange={(next) => void saveSettings({ feedback_mode: next ? "open" : "off" })}
            />
          </div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[13px] font-medium text-neutral-900">{tt("AI 代答")}</p>
              <p className="mt-0.5 text-[12px] leading-5 text-neutral-500">
                {tt("打开后新的提问和报错先由 AI 根据作品介绍、更新日志和已解决的留言回一条，每天最多 30 条，费用由平台承担")}
              </p>
            </div>
            <Switch
              checked={Boolean(settings?.ai_answer)}
              disabled={saving || !settings}
              name="ai-answer"
              label={tt("AI 代答")}
              onChange={(next) => void saveSettings({ ai_answer: next })}
            />
          </div>
          {saving ? <p className="text-[12px] text-neutral-500">{tt("保存中…")}</p> : null}
          {settingsError ? <p className="text-[12px] text-rose-600">{settingsError}</p> : null}
        </div>
      </Section>

      <Section title={tt("本周摘要")}>
        <div data-bay-feedback-digest className="space-y-2">
          {digest ? (
            <>
              {week ? <p className="text-[12px] text-neutral-500">{tt("所属周：{week}", { week })}</p> : null}
              <p className="whitespace-pre-wrap break-words text-[13px] text-neutral-800">{digest.summary}</p>
              <p className="text-[12px] text-neutral-500">
                {tt("共 {n} 条", { n: digest.counts.total })}
                {" · "}
                {tt(kindLabel("bug"))} {digest.counts.bug}
                {" · "}
                {tt(kindLabel("idea"))} {digest.counts.idea}
                {" · "}
                {tt(kindLabel("question"))} {digest.counts.question}
                {" · "}
                {tt("待回复")} {digest.counts.open}
              </p>
            </>
          ) : (
            <p className="text-[13px] text-neutral-500">{tt("还没有摘要。每周一会自动写上一周的")}</p>
          )}
          <button
            type="button"
            data-bay-action="refresh-digest"
            disabled={refreshing}
            onClick={() => void rewriteDigest()}
            className="rounded-full border border-neutral-900 px-3 py-1.5 text-[13px] text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
          >
            {refreshing ? tt("重写中…") : tt("现在重写")}
          </button>
          {digestError ? <p className="text-[12px] text-rose-600">{digestError}</p> : null}
        </div>
      </Section>

      <Section title={tt("收到的留言")}>
        <div data-bay-feedback-inbox className="space-y-3">
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
                {tt(statusFilterLabel(value))}
              </button>
            ))}
          </div>
          {loading && items.length === 0 ? <p className="text-[12.5px] text-neutral-500">{tt("正在读取留言…")}</p> : null}
          {error ? (
            <div className="space-y-2">
              <p className="text-[12.5px] text-rose-600">{error}</p>
              <button type="button" onClick={() => void loadInbox(0, true, status)} className="text-[12px] text-neutral-600 hover:underline">
                {tt("重试")}
              </button>
            </div>
          ) : null}
          {!loading && !error && items.length === 0 ? (
            <p className="text-[13px] text-neutral-500">{tt("还没有收到留言")}</p>
          ) : null}
          <div className="space-y-2">
            {items.map((thread) => (
              <ThreadCard key={thread.id} thread={thread} showAppTitle />
            ))}
          </div>
          {nextOffset != null ? (
            <button
              type="button"
              data-bay-action="load-more"
              disabled={loading}
              onClick={() => void loadInbox(nextOffset, false, status)}
              className="w-full rounded-lg border border-neutral-200 py-2 text-[13px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
            >
              {tt("加载更多")}
            </button>
          ) : null}
        </div>
      </Section>
    </div>
  );
}
