"use client";

import { useRef } from "react";
import type {
  CloudBrowserCheckpoint,
  CloudBrowserControlLease,
  CloudBrowserSession,
  CloudBrowserTransportState,
} from "../lib/browser";
import { useUI } from "../i18n/ui/useUI";
import {
  CloudBrowserCheckpointPanel,
  type CloudBrowserRestoreResult,
} from "./cloud-browser-history-view";

type BrowserSessionRowProps = {
  accent: string;
  sessions: CloudBrowserSession[];
  selected: CloudBrowserSession | null;
  selectedId: string;
  transportState: CloudBrowserTransportState;
  statusText: string;
  liveRequested: boolean;
  driving: boolean;
  lease: CloudBrowserControlLease;
  controlPending: boolean;
  busy: boolean;
  canBookmark: boolean;
  canCreateCheckpoint: boolean;
  canHibernate: boolean;
  deleteArmed: boolean;
  immersive: boolean;
  immersiveControlsVisible: boolean;
  checkpointsOpen: boolean;
  checkpoints: CloudBrowserCheckpoint[];
  checkpointsLoading: boolean;
  checkpointsError: string;
  onChooseSession: (sessionId: string) => void;
  onOpenOrResume: () => void;
  onHibernate: () => void;
  onDelete: () => void;
  onToggleControl: () => void;
  onBookmarkCurrentPage: () => void;
  onToggleCheckpoints: () => void;
  onCreateCheckpoint: () => boolean;
  onRestoreCheckpoint: (
    checkpoint: CloudBrowserCheckpoint,
  ) => Promise<CloudBrowserRestoreResult>;
  onToggleFullscreen: () => void;
};

function buttonClass(enabled = true) {
  return `h-8 shrink-0 rounded-lg border px-2.5 text-[10px] font-semibold outline-none transition motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
    enabled
      ? "border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
      : "cursor-not-allowed border-stone-200 bg-stone-50 text-stone-400"
  }`;
}

export function CloudBrowserChrome(props: BrowserSessionRowProps) {
  const tt = useUI();
  const moreRef = useRef<HTMLDetailsElement | null>(null);
  const {
    accent,
    sessions,
    selected,
    selectedId,
    transportState,
    statusText,
    liveRequested,
    driving,
    lease,
    controlPending,
    busy,
    canBookmark,
    canCreateCheckpoint,
    canHibernate,
    deleteArmed,
    immersive,
    immersiveControlsVisible,
    checkpointsOpen,
    checkpoints,
    checkpointsLoading,
    checkpointsError,
  } = props;
  const connected = transportState === "streaming";
  const stateTone =
    connected
      ? "bg-emerald-500"
      : transportState === "failed"
        ? "bg-rose-500"
        : transportState === "reconnecting"
          ? "bg-amber-400"
          : "bg-stone-300";
  const leaseText = driving
    ? tt("你正在控制 · 租约代 {epoch}", { epoch: lease.epoch })
    : lease.holderKind === "agent"
      ? tt("Agent 正在控制 · 租约代 {epoch}", {
          epoch: lease.epoch,
        })
      : lease.holderKind === "human"
        ? tt("另一位用户正在控制 · 租约代 {epoch}", {
            epoch: lease.epoch,
          })
        : tt("当前没有控制者 · 租约代 {epoch}", {
            epoch: lease.epoch,
          });
  const hiddenInImmersive =
    immersive && !immersiveControlsVisible;

  function closeMore() {
    if (moreRef.current) moreRef.current.open = false;
  }

  return (
    <header
      className={`z-30 shrink-0 border-t border-stone-200/90 bg-white/95 px-2 py-1.5 shadow-[0_-4px_18px_rgba(0,0,0,.08)] backdrop-blur transition duration-200 motion-reduce:transition-none ${
        immersive
          ? "absolute inset-x-0 bottom-0"
          : "relative"
      } ${
        hiddenInImmersive
          ? "translate-y-[calc(100%-4px)] opacity-20 hover:translate-y-0 hover:opacity-100 focus-within:translate-y-0 focus-within:opacity-100"
          : "translate-y-0 opacity-100"
      }`}
      data-cloud-browser-session-row
      data-cloud-browser-auto-hidden={
        hiddenInImmersive ? "true" : "false"
      }
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <div
          className="flex min-w-0 flex-1 items-center gap-2"
          role="status"
          aria-live="polite"
          data-cloud-browser-live-state={transportState}
          data-cloud-browser-lease-holder={lease.holderKind}
        >
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${stateTone}`}
            aria-hidden="true"
          />
          <span className="min-w-0 truncate text-[10px] font-medium text-stone-700">
            {statusText}
          </span>
          <span
            className="hidden min-w-0 truncate text-[10px] text-stone-500 sm:inline"
            data-cloud-browser-lease-status
          >
            {leaseText}
          </span>
        </div>

        <button
          type="button"
          onClick={props.onToggleControl}
          disabled={controlPending || !connected}
          className={`h-8 shrink-0 rounded-lg px-3 text-[10px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-45 ${
            driving
              ? "bg-amber-100 text-amber-900"
              : "bg-stone-900 text-white"
          }`}
          aria-label={
            driving
              ? tt("释放控制并交还 Agent")
              : tt("接管浏览器控制")
          }
          data-cloud-browser-control
        >
          {controlPending
            ? tt("切换控制中…")
            : driving
              ? tt("释放给 Agent")
              : tt("接管控制")}
        </button>

        {canBookmark && (
          <button
            type="button"
            onClick={props.onBookmarkCurrentPage}
            className={buttonClass()}
            data-cloud-browser-bookmark-page
          >
            {tt("收藏当前页面")}
          </button>
        )}

        <div className="relative shrink-0">
          <button
            type="button"
            onClick={props.onToggleCheckpoints}
            className={buttonClass()}
            aria-expanded={checkpointsOpen}
            aria-controls="cloud-browser-checkpoints"
            data-cloud-browser-checkpoint-history
          >
            {tt("会话快照与恢复")}
          </button>
          {checkpointsOpen && (
            <CloudBrowserCheckpointPanel
              checkpoints={checkpoints}
              loading={checkpointsLoading}
              loadError={checkpointsError}
              canCreate={canCreateCheckpoint}
              onCreate={props.onCreateCheckpoint}
              onRestore={props.onRestoreCheckpoint}
              onClose={props.onToggleCheckpoints}
            />
          )}
        </div>

        <button
          type="button"
          onClick={props.onToggleFullscreen}
          className={buttonClass()}
          title={
            immersive ? tt("退出沉浸全屏") : tt("沉浸全屏")
          }
          aria-label={
            immersive ? tt("退出沉浸全屏") : tt("沉浸全屏")
          }
          data-cloud-browser-fullscreen
        >
          {immersive ? "⤡" : "⤢"}
        </button>

        <details
          ref={moreRef}
          className="relative shrink-0"
          data-cloud-browser-more
        >
          <summary
            className={`${buttonClass()} flex cursor-pointer list-none items-center [&::-webkit-details-marker]:hidden`}
            aria-label={tt("更多会话操作")}
          >
            {tt("更多")}
          </summary>
          <div className="absolute bottom-10 right-0 z-50 max-h-[min(60vh,360px)] w-[min(320px,calc(100vw-1rem))] overflow-y-auto rounded-xl border border-stone-200 bg-white p-2 shadow-2xl">
            <label
              htmlFor="cloud-browser-session-select"
              className="mb-1 block text-[9px] font-medium text-stone-500"
            >
              {tt("浏览会话")}
            </label>
            <select
              id="cloud-browser-session-select"
              value={selectedId}
              onChange={(event) => {
                props.onChooseSession(event.target.value);
                closeMore();
              }}
              className="w-full truncate rounded-lg border border-stone-200 bg-white px-2 py-2 text-[10px] outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              aria-label={tt("浏览会话")}
              data-cloud-browser-session-select
            >
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.last_title ||
                    session.last_url ||
                    tt("云端浏览器会话")}{" "}
                  ·{" "}
                  {new Date(
                    session.updated_at || session.created_at,
                  ).toLocaleString()}
                </option>
              ))}
            </select>

            {!liveRequested && (
              <button
                type="button"
                onClick={() => {
                  props.onOpenOrResume();
                  closeMore();
                }}
                disabled={busy}
                className="mt-2 w-full rounded-lg px-3 py-2 text-left text-[10px] font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-45"
                style={{ background: accent }}
                data-cloud-browser-power
              >
                {selected?.status === "hibernated"
                  ? tt("恢复当前浏览会话")
                  : tt("连接当前浏览会话")}
              </button>
            )}
            {liveRequested && (
              <button
                type="button"
                onClick={() => {
                  props.onHibernate();
                  closeMore();
                }}
                disabled={busy || !canHibernate}
                className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2 text-left text-[10px] font-medium text-stone-700 outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-45"
                data-cloud-browser-hibernate
              >
                {tt("休眠当前浏览会话")}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                props.onDelete();
                if (deleteArmed) closeMore();
              }}
              disabled={busy}
              className={`mt-1.5 w-full rounded-lg border px-3 py-2 text-left text-[10px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:opacity-45 ${
                deleteArmed
                  ? "border-rose-300 bg-rose-50 text-rose-700"
                  : "border-stone-200 text-stone-600"
              }`}
              data-cloud-browser-delete
            >
              {deleteArmed
                ? tt("确认永久删除此浏览会话")
                : tt("删除此浏览会话")}
            </button>
          </div>
        </details>
      </div>
    </header>
  );
}
