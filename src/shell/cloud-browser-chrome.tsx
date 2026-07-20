"use client";

import type { RefObject } from "react";
import type {
  CloudBrowserSession,
  CloudBrowserTab,
  CloudBrowserTransportState,
} from "../lib/browser";
import { useUI } from "../i18n/ui/useUI";

type BrowserChromeProps = {
  accent: string;
  sessions: CloudBrowserSession[];
  selected: CloudBrowserSession | null;
  selectedId: string;
  tabs: CloudBrowserTab[];
  activeTabId: string;
  transportState: CloudBrowserTransportState;
  statusText: string;
  liveRequested: boolean;
  driving: boolean;
  controlPending: boolean;
  busy: boolean;
  canCaptureHistory: boolean;
  canHibernate: boolean;
  deleteArmed: boolean;
  omniboxOpen: boolean;
  omniboxValue: string;
  omniboxInputRef: RefObject<HTMLInputElement | null>;
  fullscreen: boolean;
  onChooseSession: (sessionId: string) => void;
  onOpenOrResume: () => void;
  onHibernate: () => void;
  onDelete: () => void;
  onNavigate: (action: "back" | "forward" | "reload") => void;
  onCreateTab: () => void;
  onActivateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onToggleControl: () => void;
  onOpenOmnibox: () => void;
  onCloseOmnibox: () => void;
  onOmniboxValue: (value: string) => void;
  onSubmitOmnibox: () => void;
  onCaptureHistory: () => void;
  onToggleFullscreen: () => void;
};

function controlButtonClass(enabled = true) {
  return `grid h-7 min-w-7 place-items-center rounded-md border border-stone-200 px-2 text-[11px] text-stone-600 transition ${
    enabled ? "hover:bg-stone-50" : "cursor-not-allowed opacity-35"
  }`;
}

export function CloudBrowserChrome(props: BrowserChromeProps) {
  const tt = useUI();
  const {
    accent,
    sessions,
    selected,
    selectedId,
    tabs,
    activeTabId,
    transportState,
    statusText,
    liveRequested,
    driving,
    controlPending,
    busy,
    canCaptureHistory,
    canHibernate,
    deleteArmed,
    omniboxOpen,
    omniboxValue,
    omniboxInputRef,
    fullscreen,
  } = props;
  const canMutate = driving && transportState === "streaming";
  const stateTone =
    transportState === "streaming"
      ? "bg-emerald-500"
      : transportState === "failed"
        ? "bg-rose-500"
        : transportState === "reconnecting"
          ? "bg-amber-400"
          : "bg-stone-300";

  return (
    <header
      className="relative z-20 shrink-0 border-b border-stone-200 bg-white"
      data-cloud-browser-chrome
    >
      <div className="flex min-w-0 items-center gap-2 border-b border-stone-100 px-3 py-2">
        <label className="sr-only" htmlFor="cloud-browser-history">
          {tt("浏览记录")}
        </label>
        <select
          id="cloud-browser-history"
          value={selectedId}
          onChange={(event) => props.onChooseSession(event.target.value)}
          className="min-w-0 flex-1 truncate rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[11px] text-stone-700 outline-none"
          aria-label={tt("浏览记录")}
          data-cloud-browser-history
        >
          {sessions.map((session) => (
            <option key={session.id} value={session.id}>
              {session.last_title || session.last_url || tt("云端浏览器记录")} ·{" "}
              {new Date(session.updated_at || session.created_at).toLocaleString()}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={props.onOpenOrResume}
          disabled={busy || liveRequested}
          className="shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
          style={{ background: accent }}
          data-cloud-browser-power
        >
          {selected?.status === "hibernated"
            ? tt("恢复上次浏览")
            : tt("已开机")}
        </button>
        <button
          type="button"
          onClick={props.onHibernate}
          disabled={busy || !canHibernate}
          className={controlButtonClass(!busy && canHibernate)}
          data-cloud-browser-hibernate
        >
          {tt("保存并关机")}
        </button>
        <button
          type="button"
          onClick={props.onDelete}
          disabled={busy}
          className={`h-7 shrink-0 rounded-md border px-2 text-[11px] ${
            deleteArmed
              ? "border-rose-300 bg-rose-50 text-rose-600"
              : "border-stone-200 text-stone-500"
          }`}
          data-cloud-browser-delete
        >
          {deleteArmed ? tt("确认删除记录") : tt("删除记录")}
        </button>
      </div>

      <div className="flex min-w-0 items-center gap-1.5 px-3 py-2">
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => props.onNavigate("back")}
            disabled={!canMutate}
            className={controlButtonClass(canMutate)}
            aria-label={tt("后退")}
            title={tt("后退")}
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => props.onNavigate("forward")}
            disabled={!canMutate}
            className={controlButtonClass(canMutate)}
            aria-label={tt("前进")}
            title={tt("前进")}
          >
            →
          </button>
          <button
            type="button"
            onClick={() => props.onNavigate("reload")}
            disabled={!canMutate}
            className={controlButtonClass(canMutate)}
            aria-label={tt("重新加载")}
            title={tt("重新加载")}
          >
            ↻
          </button>
        </div>

        <div
          className="flex min-w-[120px] flex-1 items-center gap-1 overflow-x-auto"
          role="tablist"
          aria-label={tt("浏览器标签页")}
          data-cloud-browser-tabs
        >
          {tabs.map((tab) => {
            const active = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                role="tab"
                aria-selected={active}
                data-tab-id={tab.id}
                className={`group flex h-7 min-w-[112px] max-w-[190px] shrink-0 items-center rounded-md border text-[11px] ${
                  active
                    ? "border-stone-300 bg-stone-100 text-stone-800"
                    : "border-transparent bg-stone-50 text-stone-500"
                }`}
              >
                <button
                  type="button"
                  onClick={() => props.onActivateTab(tab.id)}
                  className="min-w-0 flex-1 truncate px-2 text-left"
                  title={tab.title || tab.displayUrl || tt("新标签页")}
                >
                  {tab.status === "loading" ? "◌ " : ""}
                  {tab.title || tt("新标签页")}
                </button>
                <button
                  type="button"
                  onClick={() => props.onCloseTab(tab.id)}
                  disabled={!canMutate}
                  className="mr-1 grid h-5 w-5 shrink-0 place-items-center rounded text-stone-400 hover:bg-stone-200 disabled:opacity-30"
                  aria-label={tt("关闭标签页")}
                >
                  ×
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={props.onCreateTab}
            disabled={!canMutate}
            className={controlButtonClass(canMutate)}
            aria-label={tt("新建标签页")}
            title={tt("新建标签页")}
            data-cloud-browser-new-tab
          >
            ＋
          </button>
        </div>

        <div
          className="hidden max-w-[150px] shrink-0 items-center gap-1.5 text-[10px] text-stone-500 sm:flex"
          role="status"
          aria-live="polite"
          data-cloud-browser-live-state={transportState}
        >
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${stateTone}`} />
          <span className="truncate">{statusText}</span>
        </div>

        <button
          type="button"
          onClick={props.onToggleControl}
          disabled={controlPending || transportState !== "streaming"}
          className={`h-8 shrink-0 rounded-lg px-3 text-[11px] font-semibold disabled:opacity-45 ${
            driving
              ? "bg-amber-100 text-amber-800"
              : "bg-stone-900 text-white"
          }`}
          data-cloud-browser-control
        >
          {controlPending
            ? tt("切换控制中…")
            : driving
              ? tt("交还 Agent")
              : tt("接管")}
        </button>

        <div className="relative shrink-0">
          <button
            type="button"
            onClick={props.onOpenOmnibox}
            disabled={!canMutate}
            className={controlButtonClass(canMutate)}
            aria-expanded={omniboxOpen}
            aria-controls="cloud-browser-omnibox"
            title={`${tt("打开网址或搜索")} · Ctrl/⌘+L`}
            data-cloud-browser-open-omnibox
          >
            ⌕
          </button>
          {omniboxOpen && (
            <form
              id="cloud-browser-omnibox"
              onSubmit={(event) => {
                event.preventDefault();
                props.onSubmitOmnibox();
              }}
              className="absolute right-0 top-9 z-40 flex w-[min(420px,85vw)] gap-2 rounded-xl border border-stone-200 bg-white p-2 shadow-xl"
              data-cloud-browser-omnibox
            >
              <input
                ref={omniboxInputRef}
                value={omniboxValue}
                onChange={(event) => props.onOmniboxValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    props.onCloseOmnibox();
                  }
                }}
                placeholder={tt("输入网址或搜索内容")}
                className="min-w-0 flex-1 rounded-lg border border-stone-200 px-3 py-2 text-[12px] outline-none focus:border-stone-400"
                autoComplete="off"
                aria-label={tt("打开网址或搜索")}
              />
              <button
                type="submit"
                disabled={!omniboxValue.trim()}
                className="rounded-lg px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-40"
                style={{ background: accent }}
              >
                {tt("打开")}
              </button>
            </form>
          )}
        </div>

        <button
          type="button"
          onClick={props.onCaptureHistory}
          disabled={!canCaptureHistory}
          className={controlButtonClass(canCaptureHistory)}
          title={tt("保存关键节点")}
          aria-label={tt("保存关键节点")}
          data-cloud-browser-capture
        >
          ◉
        </button>
        <button
          type="button"
          onClick={props.onToggleFullscreen}
          className={controlButtonClass()}
          title={fullscreen ? tt("退出全屏") : tt("全屏")}
          aria-label={fullscreen ? tt("退出全屏") : tt("全屏")}
          data-cloud-browser-fullscreen
        >
          {fullscreen ? "⤡" : "⤢"}
        </button>
      </div>
    </header>
  );
}
