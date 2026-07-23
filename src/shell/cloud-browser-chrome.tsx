"use client";

import { useEffect, useRef } from "react";
import type {
  CloudBrowserCheckpoint,
  CloudBrowserControlLease,
  CloudBrowserSession,
  CloudBrowserTransportState,
} from "../lib/browser";
import { useUI } from "../i18n/ui/useUI";
import {
  CloudBrowserCheckpointPanel,
  type CloudBrowserRenameResult,
  type CloudBrowserRestoreResult,
} from "./cloud-browser-history-view";
import { CLOUD_BROWSER_TAKEOVER_TIMEOUT_MS } from "./cloud-browser-transport-actions";

type BrowserSessionRowProps = {
  accent: string;
  sessions: CloudBrowserSession[];
  selected: CloudBrowserSession | null;
  selectedId: string;
  transportState: CloudBrowserTransportState;
  liveRequested: boolean;
  driving: boolean;
  lease: CloudBrowserControlLease;
  controlPending: boolean;
  hasCanvasFrame: boolean;
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
  showPowerButton: boolean;
  onChooseSession: (sessionId: string) => void;
  onRenameSession: (
    sessionId: string,
    title: string,
  ) => Promise<CloudBrowserRenameResult>;
  onOpenOrResume: () => void;
  onStartNew: () => void;
  onHibernate: () => void;
  onDelete: () => void;
  onToggleControl: () => void;
  onCancelControl: () => boolean;
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
  const {
    accent,
    sessions,
    selected,
    selectedId,
    transportState,
    liveRequested,
    driving,
    lease,
    controlPending,
    hasCanvasFrame,
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
    showPowerButton,
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
  const controllerText = driving
    ? tt("你正在控制")
    : lease.holderKind === "agent"
      ? tt("Agent 正在控制")
      : lease.holderKind === "human"
        ? tt("另一位用户正在控制")
        : "";
  const controlAvailable = connected || hasCanvasFrame;
  const hiddenInImmersive =
    immersive && !immersiveControlsVisible;
  const takeoverPending = controlPending && !driving;
  const cancelTakeoverRef = useRef(props.onCancelControl);
  cancelTakeoverRef.current = props.onCancelControl;
  useEffect(() => {
    if (!takeoverPending) return;
    const timer = window.setTimeout(
      () => cancelTakeoverRef.current(),
      CLOUD_BROWSER_TAKEOVER_TIMEOUT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [takeoverPending]);
  const powerLabel = liveRequested
    ? tt("新建")
    : selected?.status === "hibernated"
      ? tt("恢复")
      : tt("连接");
  const powerAria = liveRequested
    ? tt("新建浏览会话")
    : selected?.status === "hibernated"
      ? tt("恢复当前浏览会话")
      : tt("连接当前浏览会话");

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
          {connected && (
            <span className="min-w-0 truncate text-[10px] font-medium text-stone-700">
              {tt("实时")}
            </span>
          )}
          {controllerText && (
            <span
              className="hidden min-w-0 truncate text-[10px] text-stone-500 sm:inline"
              data-cloud-browser-lease-status
            >
              {controllerText}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={
            takeoverPending
              ? () => props.onCancelControl()
              : props.onToggleControl
          }
          disabled={
            (!controlAvailable && !takeoverPending) ||
            (controlPending && driving)
          }
          className={`inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-[10px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-45 ${
            driving
              ? "bg-amber-100 text-amber-900"
              : "bg-stone-900 text-white"
          }`}
          aria-busy={controlPending}
          aria-label={
            takeoverPending
              ? tt("交还 Agent")
              : controlPending
                ? tt("控制请求处理中")
              : driving
              ? tt("释放控制并交还 Agent")
              : tt("接管浏览器控制")
          }
          title={
            takeoverPending
              ? tt("交还 Agent")
              : controlPending
                ? tt("控制请求处理中")
              : driving
                ? tt("释放控制并交还 Agent")
                : tt("接管浏览器控制")
          }
          data-cloud-browser-control
          data-cloud-browser-control-cancel={
            takeoverPending ? "true" : undefined
          }
        >
          {takeoverPending
            ? (
                <>
                  <span
                    className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current"
                    aria-hidden="true"
                    data-cloud-browser-control-spinner
                  />
                  {tt("交还 Agent")}
                </>
              )
            : controlPending
              ? (
                  <span
                    className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current"
                    aria-hidden="true"
                    data-cloud-browser-control-spinner
                  />
                )
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
            aria-label={tt("会话快照与恢复")}
            data-cloud-browser-checkpoint-history
          >
            {tt("历史")}
          </button>
          {checkpointsOpen && (
            <CloudBrowserCheckpointPanel
              sessions={sessions}
              selectedId={selectedId}
              busy={busy}
              deleteArmed={deleteArmed}
              onChooseSession={props.onChooseSession}
              onRenameSession={props.onRenameSession}
              onDelete={props.onDelete}
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

        {showPowerButton && (
          <button
            type="button"
            onClick={
              liveRequested
                ? props.onStartNew
                : props.onOpenOrResume
            }
            disabled={busy}
            className="h-8 shrink-0 rounded-lg px-3 text-[10px] font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-45"
            style={{ background: accent }}
            aria-label={powerAria}
            data-cloud-browser-power
          >
            {powerLabel}
          </button>
        )}

        <button
          type="button"
          onClick={props.onHibernate}
          disabled={busy || !canHibernate}
          className={buttonClass(!busy && canHibernate)}
          aria-label={tt("休眠当前浏览会话")}
          data-cloud-browser-hibernate
        >
          {tt("休眠")}
        </button>

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
      </div>
    </header>
  );
}
