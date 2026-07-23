"use client";

import { BrowserGlyph } from "./cloud-browser-controls";
import type { CloudBrowserLifecycleIssue } from "./cloud-browser-session-data";

export function cloudBrowserOpenHistoryLabel(
  tt: (value: string) => string,
): string {
  const open = tt("打开");
  const history = tt("历史");
  return open === "打开" && history === "历史"
    ? "从历史中打开"
    : `${open} ${history}`.trim();
}

export function CloudBrowserLifecycleErrorView({
  className,
  issue,
  message,
}: {
  className: string;
  issue: CloudBrowserLifecycleIssue | null;
  message: string;
}) {
  const diagnostics = issue
    ? Object.entries(issue.diagnostics)
    : [];
  return (
    <div
      className={className}
      role="alert"
      data-cloud-browser-lifecycle-error
      data-cloud-browser-lifecycle-code={issue?.code || undefined}
      data-cloud-browser-lifecycle-operation={
        issue?.operation || undefined
      }
      data-cloud-browser-lifecycle-retryable={
        issue?.retryable === null || issue?.retryable === undefined
          ? undefined
          : issue.retryable
            ? "true"
            : "false"
      }
      data-cloud-browser-lifecycle-retry-after={
        issue?.retryAfterSeconds ?? undefined
      }
    >
      <p>{message}</p>
      {diagnostics.length > 0 && (
        <dl
          className="mt-1 flex flex-wrap justify-center gap-x-2 gap-y-0.5 font-mono text-[9px] opacity-80"
          data-cloud-browser-lifecycle-diagnostics
        >
          {diagnostics.map(([key, value]) => (
            <div key={key} className="flex gap-0.5">
              <dt>{key}=</dt>
              <dd>{String(value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export function BrowserViewportSpinner({
  label,
  retainedFrame = false,
}: {
  label: string;
  retainedFrame?: boolean;
}) {
  return (
    <div
      className={`absolute inset-0 z-10 grid place-items-center ${
        retainedFrame ? "bg-stone-950/45" : "bg-stone-950"
      }`}
      role="status"
      aria-live="polite"
      aria-label={label}
      data-cloud-browser-spinner
      data-retained-frame={retainedFrame ? "true" : "false"}
    >
      <span
        className="h-8 w-8 animate-spin rounded-full border-2 border-white/25 border-t-white"
        aria-hidden="true"
      />
    </div>
  );
}

export function BrowserPowerPrompt({
  accent,
  busy,
  error,
  historyLabel,
  lifecycleIssue,
  newLabel,
  notice,
  onHistory,
  onNew,
  onResume,
  resumeLabel,
}: {
  accent: string;
  busy: boolean;
  error: string;
  historyLabel: string;
  lifecycleIssue: CloudBrowserLifecycleIssue | null;
  newLabel: string;
  notice: string;
  onHistory: () => void;
  onNew: () => void;
  onResume?: () => void;
  resumeLabel?: string;
}) {
  const canResume = Boolean(resumeLabel && onResume);
  return (
    <div
      className="absolute inset-0 grid place-items-center bg-stone-950 p-8 text-center"
      data-cloud-browser-launch-prompt
      data-cloud-browser-power-prompt
    >
      <div className="w-full max-w-md">
        <BrowserGlyph className="mx-auto h-10 w-10 text-stone-500" />
        {error && (
          <CloudBrowserLifecycleErrorView
            className="mt-3 rounded-lg border border-rose-400/30 bg-rose-950/60 px-3 py-2 text-[11px] leading-5 text-rose-200"
            issue={lifecycleIssue}
            message={error}
          />
        )}
        {notice && !error && (
          <div
            className="mt-3 rounded-lg border border-emerald-400/30 bg-emerald-950/60 px-3 py-2 text-[11px] leading-5 text-emerald-200"
            role="status"
            data-cloud-browser-lifecycle-notice
          >
            {notice}
          </div>
        )}
        {canResume && (
          <button
            type="button"
            onClick={onResume}
            disabled={busy}
            className="mt-5 w-full rounded-xl px-5 py-2.5 text-[12px] font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-wait disabled:opacity-70"
            style={{ background: accent }}
            aria-busy={busy}
            data-cloud-browser-resume
          >
            {resumeLabel}
          </button>
        )}
        <div
          className={`grid gap-2 sm:grid-cols-2 ${
            canResume ? "mt-2" : "mt-5"
          }`}
        >
          <button
            type="button"
            onClick={onNew}
            disabled={busy}
            className={
              canResume
                ? "rounded-xl border border-stone-600 bg-stone-900 px-5 py-2.5 text-[12px] font-semibold text-stone-100 outline-none hover:bg-stone-800 focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-wait disabled:opacity-70"
                : "rounded-xl px-5 py-2.5 text-[12px] font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-wait disabled:opacity-70"
            }
            style={canResume ? undefined : { background: accent }}
            aria-busy={busy}
            data-cloud-browser-new
          >
            {newLabel}
          </button>
          <button
            type="button"
            onClick={onHistory}
            disabled={busy}
            className="rounded-xl border border-stone-600 bg-stone-900 px-5 py-2.5 text-[12px] font-semibold text-stone-100 outline-none hover:bg-stone-800 focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-wait disabled:opacity-70"
            data-cloud-browser-open-history
          >
            {historyLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
