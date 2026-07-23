"use client";

import {
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type {
  CloudBrowserCheckpoint,
  CloudBrowserSession,
} from "../lib/browser";
import { useUI } from "../i18n/ui/useUI";
import { redactedDisplayUrl } from "./cloud-browser-live";
import type { CloudBrowserSessionOpenAction } from "./cloud-browser-session-data";

const CHECKPOINT_STATE_COPY = {
  ready: "快照状态：可用",
  warm: "快照状态：可用",
  hibernated: "快照状态：已休眠",
  restoring: "快照状态：恢复中",
  restored: "快照状态：已恢复",
  failed: "快照状态：失败",
} as const;

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const SESSION_TITLE_MAX_LENGTH = 160;

export type CloudBrowserRestoreResult =
  | { ok: true }
  | { ok: false; error: string };

export type CloudBrowserRenameResult =
  | { ok: true }
  | { ok: false; error: string };

function HistorySpinner({
  label,
  size = "h-5 w-5",
}: {
  label: string;
  size?: string;
}) {
  return (
    <span
      className="inline-grid place-items-center"
      role="status"
      aria-label={label}
      data-cloud-browser-history-spinner
    >
      <span
        className={`${size} animate-spin rounded-full border-2 border-stone-300 border-t-stone-800`}
        aria-hidden="true"
      />
    </span>
  );
}

export function CloudBrowserCheckpointPanel({
  sessions,
  selectedId,
  busy,
  deleteArmed,
  onChooseSession,
  onRenameSession,
  onOpenSession,
  selectedOpenAction,
  onDelete,
  checkpoints,
  loading,
  loadError,
  canCreate,
  onCreate,
  onRestore,
  onClose,
}: {
  sessions: CloudBrowserSession[];
  selectedId: string;
  busy: boolean;
  deleteArmed: boolean;
  onChooseSession: (sessionId: string) => void;
  onRenameSession: (
    sessionId: string,
    title: string,
  ) => Promise<CloudBrowserRenameResult>;
  onOpenSession: () => void;
  selectedOpenAction: CloudBrowserSessionOpenAction;
  onDelete: () => void;
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
  const dialogRef = useRef<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const [armedId, setArmedId] = useState("");
  const [restoringId, setRestoringId] = useState("");
  const [restoreErrors, setRestoreErrors] = useState<
    Record<string, string>
  >({});
  const [createState, setCreateState] = useState<
    "" | "sent" | "failed"
  >("");
  const [titleDraft, setTitleDraft] = useState("");
  const [renamePending, setRenamePending] = useState(false);
  const [renameError, setRenameError] = useState("");

  const selected =
    sessions.find((session) => session.id === selectedId) || null;
  // Standalone “开机” sessions still get a synthetic companion task_id for
  // ledger bookkeeping. Only agent-authored titles (title_source=auto) are
  // agent work; default/user titles remain user-renameable.
  const isAgentNamedWork = (session: CloudBrowserSession | null) =>
    (session?.title_source || "").trim() === "auto";
  const selectedIsAgentWork = isAgentNamedWork(selected);

  const displayTitle = (session: CloudBrowserSession) =>
    session.title?.trim() ||
    session.last_title?.trim() ||
    tt("未命名浏览会话");

  useEffect(() => {
    if (typeof document === "undefined") return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const keepFocusInside = (event: FocusEvent) => {
      const dialog = dialogRef.current;
      if (
        dialog &&
        event.target instanceof Node &&
        !dialog.contains(event.target)
      ) {
        headingRef.current?.focus({ preventScroll: true });
      }
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("focusin", keepFocusInside);
    headingRef.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("focusin", keepFocusInside);
      document.body.style.overflow = previousOverflow;
      if (previous?.isConnected) {
        previous.focus({ preventScroll: true });
      }
    };
  }, []);

  useEffect(() => {
    setTitleDraft(selected?.title || "");
    setRenameError("");
  }, [selected?.id, selected?.title]);

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
        [checkpoint.id]: tt("会话快照恢复失败"),
      }));
      return;
    }
    setArmedId("");
  }

  function createCheckpoint() {
    const sent = onCreate();
    setCreateState(sent ? "sent" : "failed");
  }

  async function saveTitle() {
    if (!selected || selectedIsAgentWork || renamePending) return;
    const title = titleDraft.trim();
    if (
      !title ||
      title.length > SESSION_TITLE_MAX_LENGTH ||
      title === (selected.title || "").trim()
    ) {
      return;
    }
    setRenamePending(true);
    setRenameError("");
    try {
      const result = await onRenameSession(selected.id, title);
      if (!result.ok) {
        setRenameError(tt("浏览会话命名失败"));
      }
    } catch {
      setRenameError(tt("浏览会话命名失败"));
    } finally {
      setRenamePending(false);
    }
  }

  function handleDialogKeyDown(
    event: KeyboardEvent<HTMLElement>,
  ) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter((element) => element.getAttribute("aria-hidden") !== "true");
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (!focusable.includes(active as HTMLElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (typeof document === "undefined") return null;
  const portalRoot =
    document.fullscreenElement instanceof HTMLElement
      ? document.fullscreenElement
      : document.body;

  return createPortal(
    <div
      className="fixed inset-0 z-[2147483600] grid min-h-[100dvh] place-items-center overflow-y-auto bg-black/55 p-2 sm:p-4"
      data-cloud-browser-history-portal
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        id="cloud-browser-checkpoints"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cloud-browser-checkpoint-title"
        tabIndex={-1}
        className="flex max-h-[calc(100dvh-1rem)] w-[min(60rem,calc(100dvw-1rem))] min-h-0 flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white text-stone-700 shadow-2xl outline-none sm:max-h-[calc(100dvh-2rem)] sm:w-[min(60rem,calc(100dvw-2rem))]"
        data-cloud-browser-checkpoints
        onKeyDown={handleDialogKeyDown}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-stone-100 px-4 py-3">
          <div>
            <h2
              ref={headingRef}
              id="cloud-browser-checkpoint-title"
              tabIndex={-1}
              className="text-[14px] font-semibold outline-none"
            >
              {tt("历史")}
            </h2>
            <p className="mt-0.5 text-[10px] text-stone-500">
              {tt(
                "会话快照是可恢复的持久浏览器状态，不是屏幕截图。",
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-stone-500 outline-none hover:bg-stone-100 focus-visible:ring-2 focus-visible:ring-indigo-400"
            aria-label={tt("关闭历史面板")}
            title={tt("关闭历史面板")}
            data-cloud-browser-history-close
          >
            ×
          </button>
        </div>

        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(14rem,0.75fr)_minmax(0,1.5fr)] md:overflow-hidden">
          <aside className="min-h-0 border-b border-stone-100 p-3 md:overflow-y-auto md:border-b-0 md:border-r">
            <h3 className="px-1 text-[10px] font-semibold uppercase tracking-wide text-stone-500">
              {tt("工作与会话")}
            </h3>
            <div
              className="mt-2 grid gap-1.5"
              role="listbox"
              aria-label={tt("工作与会话")}
              data-cloud-browser-session-list
            >
              {!sessions.length && (
                <p
                  className="rounded-xl border border-dashed border-stone-200 px-3 py-6 text-center text-[10px] text-stone-500"
                  data-cloud-browser-session-empty
                >
                  {tt("未选择浏览会话")}
                </p>
              )}
              {sessions.map((session) => {
                const current = session.id === selectedId;
                const agentWork = isAgentNamedWork(session);
                const pageUrl = redactedDisplayUrl(session.last_url || "");
                return (
                  <button
                    key={session.id}
                    type="button"
                    role="option"
                    aria-selected={current}
                    onClick={() => onChooseSession(session.id)}
                    className={`rounded-xl border p-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                      current
                        ? "border-indigo-200 bg-indigo-50/70"
                        : "border-stone-200 bg-white hover:bg-stone-50"
                    }`}
                    data-cloud-browser-session-option={session.id}
                    data-cloud-browser-work-id={
                      agentWork ? session.task_id || undefined : undefined
                    }
                    data-cloud-browser-title-source={
                      session.title_source || "default"
                    }
                    data-cloud-browser-app-session-id={
                      session.app_session_id || undefined
                    }
                  >
                    <span className="block truncate text-[11px] font-semibold text-stone-800">
                      {displayTitle(session)}
                    </span>
                    <span className="mt-1 flex items-center justify-between gap-2 text-[9px] text-stone-500">
                      <span>
                        {agentWork
                          ? tt("Agent 工作")
                          : tt("个人会话")}
                      </span>
                      <time
                        dateTime={
                          session.updated_at || session.created_at
                        }
                      >
                        {new Date(
                          session.updated_at || session.created_at,
                        ).toLocaleString()}
                      </time>
                    </span>
                    {session.last_title &&
                      session.last_title !== displayTitle(session) && (
                        <span className="mt-1 block truncate text-[9px] text-stone-500">
                          {session.last_title}
                        </span>
                      )}
                    {pageUrl && (
                      <span
                        className="block truncate text-[9px] text-stone-400"
                        title={pageUrl}
                      >
                        {pageUrl}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="flex min-h-0 flex-col">
            {selected && (
              <div
                className="shrink-0 border-b border-stone-100 px-3 py-3"
                data-cloud-browser-selected-session
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-semibold text-stone-800">
                      {displayTitle(selected)}
                    </p>
                    <p className="mt-0.5 text-[9px] text-stone-500">
                      {selectedIsAgentWork
                        ? tt("Agent 工作")
                        : tt("个人会话")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={onOpenSession}
                      disabled={
                        busy || selectedOpenAction === "unavailable"
                      }
                      className="h-8 rounded-lg bg-stone-900 px-3 text-[10px] font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-500"
                      aria-label={
                        selectedOpenAction === "resume"
                          ? tt("恢复当前浏览会话")
                          : tt("连接当前浏览会话")
                      }
                      data-cloud-browser-open-session
                      data-cloud-browser-session-action={selectedOpenAction}
                    >
                      {selectedOpenAction === "resume"
                        ? tt("恢复")
                        : tt("连接")}
                    </button>
                    <button
                      type="button"
                      onClick={onDelete}
                      disabled={busy}
                      className={`h-8 rounded-lg border px-2.5 text-[10px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:opacity-45 ${
                        deleteArmed
                          ? "border-rose-300 bg-rose-50 text-rose-700"
                          : "border-stone-200 text-stone-600"
                      }`}
                      aria-label={
                        deleteArmed
                          ? tt("确认永久删除此浏览会话")
                          : tt("删除此浏览会话")
                      }
                      title={
                        deleteArmed
                          ? tt("确认永久删除此浏览会话")
                          : tt("删除此浏览会话")
                      }
                      data-cloud-browser-delete
                    >
                      {deleteArmed
                        ? tt("确认永久删除此浏览会话")
                        : tt("删除此浏览会话")}
                    </button>
                  </div>
                </div>

                {!selectedIsAgentWork && (
                  <form
                    className="mt-3 flex items-end gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void saveTitle();
                    }}
                    data-cloud-browser-rename-session
                  >
                    <label className="min-w-0 flex-1 text-[9px] font-medium text-stone-500">
                      <span className="mb-1 block">
                        {tt("会话名称")}
                      </span>
                      <input
                        value={titleDraft}
                        onChange={(event) =>
                          setTitleDraft(event.target.value)
                        }
                        maxLength={SESSION_TITLE_MAX_LENGTH}
                        disabled={renamePending}
                        className="h-8 w-full rounded-lg border border-stone-200 px-2 text-[10px] text-stone-800 outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-50"
                        aria-label={tt("会话名称")}
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={
                        renamePending ||
                        !titleDraft.trim() ||
                        titleDraft.trim() ===
                          (selected.title || "").trim()
                      }
                      className="grid h-8 min-w-16 place-items-center rounded-lg bg-stone-900 px-2.5 text-[10px] font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-45"
                      aria-busy={renamePending}
                      aria-label={
                        renamePending
                          ? tt("正在保存会话名称")
                          : tt("保存名称")
                      }
                      title={
                        renamePending
                          ? tt("正在保存会话名称")
                          : tt("保存名称")
                      }
                    >
                      {renamePending ? (
                        <HistorySpinner
                          label={tt("正在保存会话名称")}
                          size="h-3.5 w-3.5"
                        />
                      ) : (
                        tt("保存名称")
                      )}
                    </button>
                  </form>
                )}
                {renameError && (
                  <p
                    className="mt-1 text-[10px] text-rose-600"
                    role="alert"
                    data-cloud-browser-rename-error
                  >
                    {renameError}
                  </p>
                )}
              </div>
            )}
            {!selected && (
              <p
                className="shrink-0 border-b border-stone-100 px-4 py-6 text-center text-[11px] text-stone-500"
                data-cloud-browser-no-session-selected
              >
                {tt("未选择浏览会话")}
              </p>
            )}

            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-stone-100 px-3 py-2">
              <h3 className="text-[11px] font-semibold text-stone-700">
                {tt("会话快照与恢复")}
              </h3>
              {canCreate && (
                <button
                  type="button"
                  onClick={createCheckpoint}
                  className="rounded-md bg-stone-900 px-2.5 py-1.5 text-[10px] font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                  aria-label={tt("创建当前会话快照")}
                  title={tt("创建当前会话快照")}
                  data-cloud-browser-create-checkpoint
                >
                  {tt("创建当前会话快照")}
                </button>
              )}
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
                {tt("会话快照加载失败")}
              </p>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {loading && (
                <div className="grid place-items-center py-10">
                  <HistorySpinner
                    label={tt("正在加载历史")}
                    size="h-7 w-7"
                  />
                </div>
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
                  const restoreError = restoreErrors[checkpoint.id];
                  return (
                    <article
                      key={checkpoint.id}
                      className="rounded-xl border border-stone-200 bg-stone-50/60 p-3"
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
                        {new Date(
                          checkpoint.created_at,
                        ).toLocaleString()}
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
                        {tt(
                          "固定版本：会话 v{session} · 运行时 {runtime}",
                          {
                            session: checkpoint.session_version,
                            runtime: checkpoint.runtime_version,
                          },
                        )}
                      </p>
                      {restoreError && (
                        <p
                          className="mt-1 text-[10px] text-rose-600"
                          role="alert"
                          data-cloud-browser-restore-error
                        >
                          {restoreError}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => void restore(checkpoint)}
                        disabled={Boolean(restoringId)}
                        className={`mt-2 grid min-h-8 w-full place-items-center rounded-md px-2 py-1.5 text-[10px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-45 ${
                          armed
                            ? "bg-amber-100 text-amber-900"
                            : "bg-white text-stone-700 ring-1 ring-stone-200"
                        }`}
                        aria-busy={restoring}
                        aria-label={
                          restoring
                            ? tt("正在恢复会话快照")
                            : armed
                              ? tt("确认恢复此会话快照")
                              : tt("恢复此会话快照")
                        }
                        title={
                          restoring
                            ? tt("正在恢复会话快照")
                            : armed
                              ? tt("确认恢复此会话快照")
                              : tt("恢复此会话快照")
                        }
                        data-cloud-browser-restore-checkpoint
                      >
                        {restoring ? (
                          <HistorySpinner
                            label={tt("正在恢复会话快照")}
                            size="h-3.5 w-3.5"
                          />
                        ) : armed ? (
                          tt("确认恢复此会话快照")
                        ) : (
                          tt("恢复此会话快照")
                        )}
                      </button>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>,
    portalRoot,
  );
}
