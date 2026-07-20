"use client";

import { useEffect, useRef, useState } from "react";
import type { CloudBrowserCheckpoint } from "../lib/browser";
import { useUI } from "../i18n/ui/useUI";
import { redactedDisplayUrl } from "./cloud-browser-live";

const CHECKPOINT_STATE_COPY = {
  warm: "快照状态：可用",
  hibernated: "快照状态：已休眠",
  restoring: "快照状态：恢复中",
  restored: "快照状态：已恢复",
  failed: "快照状态：失败",
} as const;

export type CloudBrowserRestoreResult =
  | { ok: true }
  | { ok: false; error: string };

export function CloudBrowserCheckpointPanel({
  checkpoints,
  loading,
  loadError,
  canCreate,
  onCreate,
  onRestore,
  onClose,
}: {
  checkpoints: CloudBrowserCheckpoint[];
  loading: boolean;
  loadError: string;
  canCreate: boolean;
  onCreate: () => boolean;
  onRestore: (
    checkpoint: CloudBrowserCheckpoint,
  ) => Promise<CloudBrowserRestoreResult>;
  onClose: () => void;
}) {
  const tt = useUI();
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const [armedId, setArmedId] = useState("");
  const [restoringId, setRestoringId] = useState("");
  const [restoreErrors, setRestoreErrors] = useState<
    Record<string, string>
  >({});
  const [createState, setCreateState] = useState<
    "" | "sent" | "failed"
  >("");

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  async function restore(checkpoint: CloudBrowserCheckpoint) {
    if (armedId !== checkpoint.id) {
      setArmedId(checkpoint.id);
      setRestoreErrors((current) => ({
        ...current,
        [checkpoint.id]: "",
      }));
      return;
    }
    setRestoringId(checkpoint.id);
    const result = await onRestore(checkpoint);
    setRestoringId("");
    if (!result.ok) {
      setRestoreErrors((current) => ({
        ...current,
        [checkpoint.id]: result.error,
      }));
      return;
    }
    setArmedId("");
  }

  function createCheckpoint() {
    const sent = onCreate();
    setCreateState(sent ? "sent" : "failed");
  }

  return (
    <section
      id="cloud-browser-checkpoints"
      className="absolute bottom-full right-0 z-40 mb-2 flex max-h-[min(70vh,520px)] w-[min(680px,calc(100vw-1rem))] flex-col overflow-hidden rounded-xl border border-stone-200 bg-white text-stone-700 shadow-2xl"
      aria-labelledby="cloud-browser-checkpoint-title"
      data-cloud-browser-checkpoints
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-stone-100 px-3 py-2.5">
        <div>
          <h2
            ref={headingRef}
            id="cloud-browser-checkpoint-title"
            tabIndex={-1}
            className="text-[12px] font-semibold outline-none"
          >
            {tt("会话快照与恢复")}
          </h2>
          <p className="mt-0.5 text-[10px] text-stone-500">
            {tt(
              "会话快照是可恢复的持久浏览器状态，不是屏幕截图。",
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {canCreate && (
            <button
              type="button"
              onClick={createCheckpoint}
              className="rounded-md bg-stone-900 px-2.5 py-1.5 text-[10px] font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              data-cloud-browser-create-checkpoint
            >
              {tt("创建当前会话快照")}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-md text-stone-500 outline-none hover:bg-stone-100 focus-visible:ring-2 focus-visible:ring-indigo-400"
            aria-label={tt("关闭会话快照面板")}
          >
            ×
          </button>
        </div>
      </div>

      {createState === "sent" && (
        <p
          className="shrink-0 bg-emerald-50 px-3 py-1.5 text-[10px] text-emerald-700"
          role="status"
        >
          {tt("会话快照创建请求已发送，保存完成后会显示新一代。")}
        </p>
      )}
      {createState === "failed" && (
        <p
          className="shrink-0 bg-rose-50 px-3 py-1.5 text-[10px] text-rose-700"
          role="alert"
        >
          {tt("当前没有有效控制租约，无法创建会话快照。")}
        </p>
      )}
      {loadError && (
        <p
          className="shrink-0 bg-rose-50 px-3 py-2 text-[11px] text-rose-700"
          role="alert"
        >
          {loadError}
        </p>
      )}

      <div className="min-h-0 overflow-y-auto p-2">
        {loading && (
          <p className="px-2 py-6 text-center text-[11px] text-stone-500">
            {tt("正在加载会话快照…")}
          </p>
        )}
        {!loading && !checkpoints.length && !loadError && (
          <p className="px-2 py-6 text-center text-[11px] text-stone-500">
            {tt("还没有可恢复的会话快照。")}
          </p>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {checkpoints.map((checkpoint) => {
            const displayUrl = redactedDisplayUrl(
              checkpoint.page_url,
            );
            const restoring = restoringId === checkpoint.id;
            const armed = armedId === checkpoint.id;
            const error = restoreErrors[checkpoint.id];
            return (
              <article
                key={checkpoint.id}
                className="rounded-lg border border-stone-200 bg-stone-50/60 p-2.5"
                data-cloud-browser-checkpoint-id={checkpoint.id}
                data-checkpoint-generation={checkpoint.generation}
                data-checkpoint-state={checkpoint.state}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-stone-800">
                    {tt("会话快照第 {generation} 代", {
                      generation: checkpoint.generation,
                    })}
                  </span>
                  <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[9px] font-medium">
                    {tt(CHECKPOINT_STATE_COPY[checkpoint.state])}
                  </span>
                </div>
                <time
                  className="mt-1 block text-[9px] text-stone-500"
                  dateTime={checkpoint.created_at}
                >
                  {new Date(checkpoint.created_at).toLocaleString()}
                </time>
                <p className="mt-2 truncate text-[11px] font-medium">
                  {checkpoint.page_title || tt("未命名页面")}
                </p>
                <p
                  className="truncate text-[10px] text-stone-500"
                  title={displayUrl}
                >
                  {displayUrl || tt("网址已隐藏")}
                </p>
                <p className="mt-2 text-[9px] text-stone-500">
                  {tt("固定版本：会话 v{session} · 运行时 {runtime}", {
                    session: checkpoint.session_version,
                    runtime: checkpoint.runtime_version,
                  })}
                </p>
                {checkpoint.failure_reason && (
                  <p
                    className="mt-1 text-[10px] text-rose-600"
                    role="alert"
                  >
                    {checkpoint.failure_reason}
                  </p>
                )}
                {error && (
                  <p
                    className="mt-1 text-[10px] text-rose-600"
                    role="alert"
                    data-cloud-browser-restore-error
                  >
                    {error}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => void restore(checkpoint)}
                  disabled={Boolean(restoringId)}
                  className={`mt-2 w-full rounded-md px-2 py-1.5 text-[10px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-45 ${
                    armed
                      ? "bg-amber-100 text-amber-900"
                      : "bg-white text-stone-700 ring-1 ring-stone-200"
                  }`}
                  data-cloud-browser-restore-checkpoint
                >
                  {restoring
                    ? tt("正在恢复此会话快照…")
                    : armed
                      ? tt("确认恢复此会话快照")
                      : tt("恢复此会话快照")}
                </button>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
