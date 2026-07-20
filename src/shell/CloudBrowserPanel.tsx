"use client";

import { useState } from "react";
import {
  createCloudBrowser,
  deleteCloudBrowser,
  hibernateCloudBrowser,
  resumeCloudBrowser,
  type CloudBrowserTransportState,
} from "../lib/browser";
import { useUI } from "../i18n/ui/useUI";
import { BrowserGlyph } from "./cloud-browser-controls";
import { CloudBrowserChrome } from "./cloud-browser-chrome";
import { CloudBrowserTimeline } from "./cloud-browser-history-view";
import { useCloudBrowserInteraction } from "./cloud-browser-interaction";
import { DEFAULT_BROWSER_URL } from "./cloud-browser-live";
import { useCloudBrowserSessionData } from "./cloud-browser-session-data";
import { useCloudBrowserTransport } from "./cloud-browser-transport";
import { useOptionalWorkspaceSession } from "./WorkspaceSession";

export { pointInContainedFrame } from "./cloud-browser-live";

export function CloudBrowserPanel({
  taskId,
  accent = "#4f46e5",
}: {
  taskId?: string | null;
  accent?: string;
}) {
  const tt = useUI();
  const workspace = useOptionalWorkspaceSession();
  const effectiveTaskId = taskId || workspace?.taskId || "";
  const [liveRequested, setLiveRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const session = useCloudBrowserSessionData({
    effectiveTaskId,
    liveRequested,
    tt,
    setError,
  });
  const transport = useCloudBrowserTransport({
    selectedId: session.selectedId,
    liveRequested,
    setLiveRequested,
    scopeKey: effectiveTaskId,
    tt,
    setBusy,
    setError,
    refreshEvents: session.refreshEvents,
  });
  const interaction = useCloudBrowserInteraction({
    liveRequested,
    driving: transport.driving,
    protocol: transport.protocol,
    transportState: transport.transportState,
    tabs: transport.tabs,
    activeTabId: transport.activeTabId,
    address: transport.address,
    canvasRef: transport.canvasRef,
    frameSizeRef: transport.frameSizeRef,
    sendMutation: transport.sendMutation,
    setAddress: transport.setAddress,
    setError,
    tt,
  });

  async function startBrowser() {
    if (busy) return;
    setBusy(true);
    setError("");
    const result = await createCloudBrowser(
      DEFAULT_BROWSER_URL,
      effectiveTaskId || undefined,
    );
    setBusy(false);
    const created = result.data?.session;
    if (!result.ok || !created) {
      setError(result.error || tt("云端浏览器启动失败"));
      return;
    }
    session.upsertSession(created);
    await transport.openLive(created.id);
    void session.reload(created.id);
  }

  async function restorePrevious() {
    if (!session.selectedId) return;
    setBusy(true);
    const result = await resumeCloudBrowser(session.selectedId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error || tt("恢复上次浏览失败"));
      return;
    }
    await transport.openLive(session.selectedId);
    void session.reload(session.selectedId);
  }

  async function saveAndShutdown() {
    if (!session.selectedId) return;
    if (transport.lease.holderKind === "human") return;
    transport.stopLive(true);
    setBusy(true);
    const result = await hibernateCloudBrowser(session.selectedId);
    setBusy(false);
    if (!result.ok) setError(result.error || tt("保存并关机失败"));
    await session.reload(session.selectedId);
  }

  async function removeRecord() {
    if (!session.selectedId) return;
    if (!session.deleteArmed) {
      session.setDeleteArmed(true);
      return;
    }
    transport.stopLive(true);
    setBusy(true);
    const result = await deleteCloudBrowser(session.selectedId);
    setBusy(false);
    session.setDeleteArmed(false);
    if (!result.ok) {
      setError(result.error || tt("删除浏览记录失败"));
      return;
    }
    session.clearSelection();
    await session.reload();
  }

  function chooseSession(sessionId: string) {
    if (sessionId === session.selectedId) return;
    transport.stopLive(true);
    session.chooseSession(sessionId);
  }

  const statusText: Record<CloudBrowserTransportState, string> = {
    idle: tt("未连接"),
    ticketing: tt("正在准备浏览器…"),
    ws_connecting: tt("正在验证连接…"),
    authenticated: tt("连接已验证"),
    awaiting_first_frame: tt("正在取得首帧…"),
    streaming: tt("实时"),
    reconnecting: tt("正在重新连接…"),
    failed: tt("连接失败"),
    closed: tt("已关机"),
  };
  const overlayCopy: Partial<Record<CloudBrowserTransportState, string>> = {
    ticketing: tt("正在准备浏览器…"),
    ws_connecting: tt("正在验证连接…"),
    authenticated: tt("连接已验证，正在取得首帧…"),
    awaiting_first_frame: tt("正在解码并绘制首帧…"),
    reconnecting: tt("连接中断，正在重新连接…"),
    failed: error || tt("浏览器连接失败"),
  };
  const overlayText = overlayCopy[transport.transportState];

  if (!session.sessions.length) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div className="w-full max-w-md">
          <BrowserGlyph className="mx-auto h-10 w-10 text-stone-300" />
          <p className="mt-3 text-[13px] text-stone-600">
            {tt("开机后默认打开 Google；Agent 与你会共用并保存这段浏览。")}
          </p>
          <button
            type="button"
            onClick={() => void startBrowser()}
            disabled={busy}
            className="mt-4 rounded-xl px-5 py-2.5 text-[12px] font-semibold text-white disabled:opacity-50"
            style={{ background: accent }}
            data-cloud-browser-power
          >
            {busy ? tt("正在开机…") : tt("开机")}
          </button>
          {error && (
            <p className="mt-2 text-[12px] text-rose-500">{error}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={interaction.rootRef}
      className="flex h-full min-h-0 flex-col bg-stone-50/60"
      data-cloud-browser-root
      data-cloud-browser-protocol={transport.protocol || "negotiating"}
    >
      <CloudBrowserChrome
        accent={accent}
        sessions={session.sessions}
        selected={session.selected}
        selectedId={session.selectedId}
        tabs={transport.tabs}
        activeTabId={transport.activeTabId}
        transportState={transport.transportState}
        statusText={statusText[transport.transportState]}
        liveRequested={liveRequested}
        driving={transport.driving}
        controlPending={transport.controlPending}
        busy={busy}
        canCaptureHistory={
          transport.protocol === 2 &&
          transport.transportState === "streaming" &&
          transport.lease.holderKind !== "human"
        }
        canHibernate={transport.lease.holderKind !== "human"}
        deleteArmed={session.deleteArmed}
        omniboxOpen={interaction.omniboxOpen}
        omniboxValue={interaction.omniboxValue}
        omniboxInputRef={interaction.omniboxInputRef}
        fullscreen={interaction.fullscreen}
        onChooseSession={chooseSession}
        onOpenOrResume={() =>
          void (session.selected?.status === "hibernated"
            ? restorePrevious()
            : transport.openLive())
        }
        onHibernate={() => void saveAndShutdown()}
        onDelete={() => void removeRecord()}
        onNavigate={transport.navigate}
        onCreateTab={transport.createTab}
        onActivateTab={transport.activateTab}
        onCloseTab={transport.closeTab}
        onToggleControl={transport.toggleControl}
        onOpenOmnibox={interaction.openOmnibox}
        onCloseOmnibox={interaction.closeOmnibox}
        onOmniboxValue={interaction.setOmniboxValue}
        onSubmitOmnibox={interaction.submitOmnibox}
        onCaptureHistory={transport.captureHistory}
        onToggleFullscreen={interaction.toggleFullscreen}
      />

      <div
        ref={interaction.viewportRef}
        className="relative min-h-0 flex-1 overflow-hidden bg-stone-950"
        data-cloud-browser-viewport
      >
        {session.shotUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={session.shotUrl}
            alt={tt("最后保存的浏览截图")}
            className="absolute inset-0 h-full w-full object-contain"
            data-cloud-browser-last-screenshot
          />
        )}
        {liveRequested && (
          <canvas
            ref={transport.canvasRef}
            aria-label={tt("云端浏览器实时画面")}
            onPointerDown={interaction.handlePointerDown}
            onPointerMove={interaction.handlePointerMove}
            onPointerUp={interaction.handlePointerUp}
            onPointerCancel={interaction.handlePointerUp}
            onWheel={interaction.handleWheel}
            onContextMenu={(event) => {
              if (transport.driving) event.preventDefault();
            }}
            className={`absolute inset-0 block h-full w-full touch-none object-contain outline-none transition-opacity ${
              transport.hasCanvasFrame ? "opacity-100" : "opacity-0"
            } ${transport.driving ? "cursor-crosshair" : ""}`}
          />
        )}
        {!liveRequested && !session.shotUrl && (
          <div className="grid h-full place-items-center text-[12px] text-stone-400">
            {tt("这条浏览记录还没有关键截图。")}
          </div>
        )}

        {liveRequested && (
          <textarea
            ref={interaction.hiddenInputRef}
            tabIndex={transport.driving ? 0 : -1}
            inputMode="text"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            aria-label={tt("浏览器隐藏键盘输入")}
            onKeyDown={interaction.handleHiddenKeyDown}
            onBeforeInput={interaction.handleBeforeInput}
            onInput={interaction.handleInput}
            onCompositionStart={interaction.handleCompositionStart}
            onCompositionUpdate={interaction.handleCompositionUpdate}
            onCompositionEnd={interaction.handleCompositionEnd}
            onPaste={interaction.handlePaste}
            className="pointer-events-none absolute left-0 top-0 h-px w-px resize-none overflow-hidden border-0 p-0 opacity-0 outline-none"
            style={{ fontSize: 16 }}
            data-cloud-browser-hidden-input
          />
        )}

        {liveRequested &&
          transport.transportState !== "streaming" &&
          overlayText && (
            <div
              className={`absolute inset-0 grid place-items-center bg-stone-950/55 px-6 text-center text-[12px] text-stone-100 ${
                transport.transportState === "failed"
                  ? "pointer-events-auto"
                  : "pointer-events-none"
              }`}
              data-cloud-browser-overlay={transport.transportState}
            >
              <div>
                <p>{overlayText}</p>
                {(transport.hasCanvasFrame || session.shotUrl) && (
                  <p className="mt-1 text-[10px] text-stone-400">
                    {transport.hasCanvasFrame
                      ? tt("当前显示最后一帧，不代表实时状态。")
                      : tt("当前显示最后截图，不代表实时状态。")}
                  </p>
                )}
                {transport.transportState === "failed" && (
                  <button
                    type="button"
                    onClick={() => void transport.openLive()}
                    className="mt-3 rounded-lg bg-white px-3 py-1.5 text-[11px] font-semibold text-stone-900"
                  >
                    {tt("重试连接")}
                  </button>
                )}
              </div>
            </div>
          )}
      </div>

      {!liveRequested &&
        session.events.some((event) => event.has_screenshot) && (
          <CloudBrowserTimeline
            events={session.events}
            selectedId={session.eventId}
            onSelect={session.setEventId}
          />
        )}
      {error && transport.transportState !== "failed" && (
        <div
          className="shrink-0 bg-rose-50 px-3 py-2 text-[12px] text-rose-600"
          role="alert"
        >
          {error}
        </div>
      )}
    </div>
  );
}
