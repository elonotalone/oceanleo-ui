"use client";

// 条款弹窗：第一次发需求、下单、报价、发布服务时由 ensureBayTerms 弹出。
// 买家、卖家签的是同一份条款（网关只有一份），scope 只决定说明那一行。
import { useEffect, useId, useRef, useState } from "react";
import type { Locale } from "../../../i18n/config";
import { useUI } from "../../../i18n/ui/useUI";
import {
  acceptBayTerms,
  bayTermsUpToDate,
  fetchBayTermsCurrent,
  fetchBayTermsStatus,
  type BayTermsStatus,
} from "../../../lib/bay/terms";
import { IconButton } from "../../../ui/Button";
import { BayTermsSections, formatBayTermsTime } from "./terms-text";

export type BayTermsScope = "buyer" | "seller";

const LOAD_FAILED = "条款加载失败，请稍后重试";

export interface BayTermsDialogProps {
  scope: BayTermsScope;
  initialStatus: BayTermsStatus;
  locale: Locale;
  onCancel: () => void;
  onAccepted: () => void;
}

export function BayTermsDialog({ scope, initialStatus, locale, onCancel, onAccepted }: BayTermsDialogProps) {
  const tt = useUI();
  const titleId = useId();
  const panelRef = useRef<HTMLElement | null>(null);
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState<"accept" | "reload" | null>(null);
  const [error, setError] = useState<string | null>(initialStatus.current ? null : initialStatus.error || LOAD_FAILED);
  const current = status.current;
  const previous = status.acceptance && current && status.acceptance.version !== current.version ? status.acceptance : null;

  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // 设置窗、消息浮窗也听 Esc；这里先接住，只关条款窗。
      event.stopPropagation();
      onCancel();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      before?.focus?.();
    };
  }, [onCancel]);

  async function accept() {
    if (!current || busy) return;
    setBusy("accept");
    setError(null);
    const result = await acceptBayTerms(current.version);
    setBusy(null);
    if (result.accepted) {
      onAccepted();
      return;
    }
    if (result.current) setStatus(result);
    setError(result.error || "没能记下你的同意，请稍后重试");
  }

  async function reload() {
    if (busy) return;
    setBusy("reload");
    setError(null);
    let next = await fetchBayTermsStatus();
    if (bayTermsUpToDate(next)) {
      setBusy(null);
      onAccepted();
      return;
    }
    if (!next.current) {
      const fetched = await fetchBayTermsCurrent();
      next = { ...next, current: fetched.current, error: fetched.current ? null : fetched.error || next.error };
    }
    setBusy(null);
    setStatus(next);
    if (!next.current) setError(next.error || LOAD_FAILED);
  }

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      role="presentation"
      data-bay-terms-dialog={scope}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex max-h-[min(720px,calc(100vh-2rem))] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white text-neutral-900 shadow-2xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--pchrome-accent,var(--awb-accent,var(--accent,#7c3aed)))]/45 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
      >
        <header className="flex items-start gap-3 border-b border-neutral-200 px-5 py-4 dark:border-neutral-700">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-sky-600 dark:text-sky-300">
              LeoBay · {tt("使用条款")}
              {current ? ` · ${tt("版本 {version}", { version: current.version })}` : ""}
            </p>
            <h2 id={titleId} className="mt-1 text-base font-semibold">
              {tt("继续之前，请先同意使用条款")}
            </h2>
            <p className="mt-1 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
              {scope === "seller"
                ? tt("报价、发布服务、接单都以这份条款为准，同意一次即可。")
                : tt("发需求、下单、接受报价都以这份条款为准，同意一次即可。")}
            </p>
          </div>
          <IconButton
            onClick={onCancel}
            label={tt("关闭")}
            icon={<span className="text-lg leading-none">×</span>}
          />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {current ? (
            <>
              {current.effective_at ? (
                <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
                  {tt("生效时间：{time}", { time: formatBayTermsTime(current.effective_at, locale) })}
                </p>
              ) : null}
              <BayTermsSections document={current} />
            </>
          ) : (
            <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
              {tt(error || LOAD_FAILED)}
            </p>
          )}
        </div>

        <footer className="border-t border-neutral-200 px-5 py-4 dark:border-neutral-700">
          {previous ? (
            <p className="mb-3 text-xs text-amber-700 dark:text-amber-300">
              {tt("你同意过版本 {version}（{time}）。条款已更新，需要重新同意。", {
                version: previous.version,
                time: formatBayTermsTime(previous.accepted_at, locale),
              })}
            </p>
          ) : null}
          {current && error ? (
            <p role="alert" className="mb-3 text-xs text-rose-600 dark:text-rose-400">
              {tt(error)}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onCancel}
              data-bay-terms-cancel=""
              className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-600 dark:hover:bg-neutral-800"
            >
              {tt("暂不同意")}
            </button>
            {current ? (
              <button
                type="button"
                onClick={() => void accept()}
                disabled={busy !== null}
                data-bay-terms-accept=""
                className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:cursor-wait disabled:opacity-60"
              >
                {busy === "accept" ? tt("正在记录…") : tt("同意并继续")}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void reload()}
                disabled={busy !== null}
                data-bay-terms-reload=""
                className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:cursor-wait disabled:opacity-60 dark:bg-white dark:text-neutral-900"
              >
                {tt("重试")}
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
}
