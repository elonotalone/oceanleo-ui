"use client";

import { useEffect, useState } from "react";
import {
  createCloudBrowser,
  createCloudBrowserOperationId,
  deleteCloudBrowser,
  hibernateCloudBrowser,
  restoreCloudBrowserCheckpoint,
  resumeCloudBrowser,
  type CloudBrowserCheckpoint,
  type CloudBrowserTransportState,
} from "../lib/browser";
import { useUI } from "../i18n/ui/useUI";
import { CloudBrowserChrome } from "./cloud-browser-chrome";
import { BrowserGlyph } from "./cloud-browser-controls";
import type { CloudBrowserRestoreResult } from "./cloud-browser-history-view";
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
  const [notice, setNotice] = useState("");
  const [checkpointsOpen, setCheckpointsOpen] = useState(false);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

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
    refreshCheckpoints: session.refreshCheckpoints,
  });
  const interaction = useCloudBrowserInteraction({
    liveRequested,
    driving: transport.driving,
    protocol: transport.protocol,
    capabilities: transport.capabilities,
    transportState: transport.transportState,
    canvasRef: transport.canvasRef,
    frameSizeRef: transport.frameSizeRef,
    sendMutation: transport.sendMutation,
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
    await session.reload(created.id);
    await transport.openLive(created.id);
  }

  async function restorePrevious() {
    if (!session.selectedId) return;
    const operationId = createCloudBrowserOperationId();
    setBusy(true);
    setError("");
    const result = await resumeCloudBrowser(session.selectedId, {
      operationId,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || tt("恢复上次浏览失败"));
      return;
    }
    await session.reload(session.selectedId);
    await transport.openLive(session.selectedId);
  }

  async function hibernateCurrentSession() {
    if (
      !session.selectedId ||
      !transport.driving ||
      transport.transportState !== "streaming"
    ) {
      setError(tt("只有当前控制租约持有者可以休眠浏览会话"));
      return;
    }
    const operationId = createCloudBrowserOperationId();
    transport.stopLive(true);
    setBusy(true);
    const result = await hibernateCloudBrowser(
      session.selectedId,
      operationId,
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error || tt("休眠浏览会话失败"));
    }
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
    setCheckpointsOpen(false);
    session.clearSelection();
    await session.reload();
  }

  function chooseSession(sessionId: string) {
    if (sessionId === session.selectedId) return;
    transport.stopLive(true);
    session.chooseSession(sessionId);
  }

  function bookmarkCurrentPage() {
    if (!transport.bookmarkCurrentPage()) {
      setError(tt("当前没有有效控制租约，无法收藏当前页面"));
      return;
    }
    setError("");
    setNotice(tt("已发送收藏当前页面请求"));
  }

  function createCheckpoint() {
    const sent = transport.createCheckpoint();
    if (!sent) {
      setError(tt("当前没有有效控制租约，无法创建会话快照"));
    }
    return sent;
  }

  async function restoreCheckpoint(
    checkpoint: CloudBrowserCheckpoint,
  ): Promise<CloudBrowserRestoreResult> {
    if (!session.selectedId) {
      return { ok: false, error: tt("未选择浏览会话") };
    }
    const selectedId = session.selectedId;
    const operationId = createCloudBrowserOperationId();
    transport.stopLive(true);
    setBusy(true);
    setError("");
    const result = await restoreCloudBrowserCheckpoint(
      selectedId,
      checkpoint,
      operationId,
    );
    setBusy(false);
    if (!result.ok) {
      const message =
        result.error || tt("会话快照恢复失败");
      setError(message);
      await session.refreshCheckpoints();
      return { ok: false, error: message };
    }
    await session.reload(selectedId);
    await session.refreshCheckpoints();
    const opened = await transport.openLive(selectedId);
    if (!opened) {
      const message = tt("会话快照已恢复，但实时画面重连失败");
      setError(message);
      return { ok: false, error: message };
    }
    setCheckpointsOpen(false);
    return { ok: true };
  }

  const statusText: Record<CloudBrowserTransportState, string> = {
    idle: tt("未连接"),
    ticketing: tt("正在获取一次性连接票据…"),
    ws_connecting: tt("正在连接 v3 原生窗口流…"),
    authenticated: tt("v3 连接已验证"),
    awaiting_first_frame: tt("正在启动原生 Chrome…"),
    streaming: tt("原生 Chrome 窗口实时"),
    reconnecting: tt("正在自动重连…"),
    failed: tt("原生窗口连接失败"),
    closed: tt("会话未连接"),
  };
  const failureStatus = {
    protocol_mismatch: tt("画面流校验失败，已断开"),
    ticket_expired: tt("连接票据已过期"),
    stale_stream: tt("画面流已过期，已断开"),
    first_paint: tt("启动超时，未收到画面"),
    connection: tt("实时连接已中断"),
    lease_lost: tt("实时画面可见，但控制租约已丢失"),
  } as const;
  const effectiveStatus =
    transport.failureKind &&
    failureStatus[transport.failureKind]
      ? failureStatus[transport.failureKind]
      : statusText[transport.transportState];
  const overlayCopy: Partial<
    Record<CloudBrowserTransportState, string>
  > = {
    ticketing: tt("正在获取一次性连接票据…"),
    ws_connecting: tt("正在连接 v3 原生窗口流…"),
    authenticated: tt("v3 连接已验证，等待原生 Chrome 首帧…"),
    awaiting_first_frame: tt(
      "正在启动原生 Chrome…冷启动最长可能需要十几秒，画面就绪后自动进入实时。",
    ),
    reconnecting: tt("连接出现波动，正在自动重连…"),
    failed: error || tt("原生窗口连接失败"),
  };
  const overlayText = overlayCopy[transport.transportState];

  if (!session.sessions.length) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div className="w-full max-w-md">
          <BrowserGlyph className="mx-auto h-10 w-10 text-stone-300" />
          <p className="mt-3 text-[13px] text-stone-600">
            {tt(
              "开机后会连接一扇完整的原生 Chrome 窗口；标签栏和地址栏都在画面内。",
            )}
          </p>
          <button
            type="button"
            onClick={() => void startBrowser()}
            disabled={busy}
            className="mt-4 rounded-xl px-5 py-2.5 text-[12px] font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-50"
            style={{ background: accent }}
            data-cloud-browser-power
          >
            {busy ? tt("正在开机…") : tt("开机")}
          </button>
          {error && (
            <p className="mt-2 text-[12px] text-rose-500" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  const fallbackImmersive =
    interaction.immersive &&
    interaction.fullscreenMode === "fallback";

  return (
    <div
      ref={interaction.rootRef}
      className={`flex min-h-0 flex-col overflow-hidden bg-stone-950 ${
        interaction.immersive ? "h-screen w-screen" : "h-full"
      } ${
        fallbackImmersive
          ? "fixed inset-0 z-[2147483647]"
          : "relative"
      }`}
      data-cloud-browser-root
      data-cloud-browser-protocol={
        transport.protocol === 3 ? "v3" : "negotiating"
      }
      data-cloud-browser-failure={transport.failureKind || undefined}
      data-cloud-browser-immersive={
        interaction.immersive ? interaction.fullscreenMode : undefined
      }
      onPointerMoveCapture={interaction.revealImmersiveControls}
    >
      <div
        ref={interaction.viewportRef}
        className="relative min-h-0 flex-1 overflow-hidden bg-stone-950"
        data-cloud-browser-viewport
      >
        {liveRequested && (
          <canvas
            ref={transport.canvasRef}
            role="application"
            tabIndex={transport.driving ? 0 : -1}
            aria-label={tt(
              "原生 Chrome 窗口画面；接管后直接操作画面内的标签栏和地址栏",
            )}
            aria-disabled={!transport.driving}
            onFocus={interaction.handleCanvasFocus}
            onPointerDown={interaction.handlePointerDown}
            onPointerMove={interaction.handlePointerMove}
            onPointerUp={interaction.handlePointerUp}
            onPointerCancel={interaction.handlePointerUp}
            onWheel={interaction.handleWheel}
            onContextMenu={(event) => {
              if (transport.driving) event.preventDefault();
            }}
            className={`absolute inset-0 block h-full w-full touch-none object-contain outline-none transition-opacity motion-reduce:transition-none ${
              transport.hasCanvasFrame ? "opacity-100" : "opacity-0"
            } ${
              transport.driving
                ? "cursor-default focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400"
                : "cursor-not-allowed"
            }`}
            data-cloud-browser-native-window
          />
        )}

        {!liveRequested && (
          <div className="grid h-full place-items-center px-6 text-center text-[12px] text-stone-400">
            <p>
              {tt(
                "浏览会话未连接；点击底栏「连接」或「恢复」继续当前会话。",
              )}
            </p>
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
            aria-label={tt("原生 Chrome 窗口键盘与输入法入口")}
            aria-disabled={!transport.driving}
            onFocus={interaction.handleHiddenFocus}
            onBlur={interaction.handleHiddenBlur}
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
              className={`absolute inset-0 grid place-items-center bg-stone-950/80 px-6 text-center text-[12px] text-stone-100 ${
                transport.transportState === "failed"
                  ? "pointer-events-auto"
                  : "pointer-events-none"
              }`}
              data-cloud-browser-overlay={transport.transportState}
            >
              <div className="max-w-md">
                <p>{overlayText}</p>
                {transport.hasCanvasFrame && (
                  <p className="mt-1 text-[10px] text-stone-400">
                    {tt(
                      "当前仅保留最后一帧作为故障上下文，不代表实时状态，也不会接收输入。",
                    )}
                  </p>
                )}
                {transport.transportState === "failed" && (
                  <button
                    type="button"
                    onClick={() => void transport.openLive()}
                    className="mt-3 rounded-lg bg-white px-3 py-1.5 text-[11px] font-semibold text-stone-900 outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                  >
                    {tt("使用新票据重试连接")}
                  </button>
                )}
              </div>
            </div>
          )}

        {error &&
          transport.transportState === "streaming" && (
            <div
              className="absolute left-1/2 top-2 z-20 max-w-[min(560px,90%)] -translate-x-1/2 rounded-lg bg-rose-50/95 px-3 py-2 text-[11px] text-rose-700 shadow"
              role="alert"
            >
              {error}
            </div>
          )}
        {notice &&
          !error &&
          transport.transportState === "streaming" && (
            <div
              className="absolute left-1/2 top-2 z-20 max-w-[min(560px,90%)] -translate-x-1/2 rounded-lg bg-emerald-50/95 px-3 py-2 text-[11px] text-emerald-700 shadow"
              role="status"
            >
              {notice}
            </div>
          )}
      </div>

      <CloudBrowserChrome
        accent={accent}
        sessions={session.sessions}
        selected={session.selected}
        selectedId={session.selectedId}
        transportState={transport.transportState}
        statusText={effectiveStatus}
        liveRequested={liveRequested}
        driving={transport.driving}
        lease={transport.lease}
        controlPending={transport.controlPending}
        busy={busy}
        canBookmark={
          transport.capabilities.page_bookmark &&
          transport.driving &&
          transport.transportState === "streaming"
        }
        canCreateCheckpoint={
          transport.capabilities.session_checkpoint &&
          transport.driving &&
          transport.transportState === "streaming"
        }
        canHibernate={
          transport.driving &&
          transport.transportState === "streaming"
        }
        deleteArmed={session.deleteArmed}
        immersive={interaction.immersive}
        immersiveControlsVisible={
          interaction.immersiveControlsVisible
        }
        checkpointsOpen={checkpointsOpen}
        checkpoints={session.checkpoints}
        checkpointsLoading={session.checkpointsLoading}
        checkpointsError={session.checkpointsError}
        onChooseSession={chooseSession}
        onOpenOrResume={() =>
          void (session.selected?.status === "hibernated"
            ? restorePrevious()
            : transport.openLive())
        }
        onStartNew={() => void startBrowser()}
        onHibernate={() => void hibernateCurrentSession()}
        onDelete={() => void removeRecord()}
        onToggleControl={transport.toggleControl}
        onBookmarkCurrentPage={bookmarkCurrentPage}
        onToggleCheckpoints={() => {
          setCheckpointsOpen((current) => !current);
          if (!checkpointsOpen) void session.refreshCheckpoints();
        }}
        onCreateCheckpoint={createCheckpoint}
        onRestoreCheckpoint={restoreCheckpoint}
        onToggleFullscreen={interaction.toggleFullscreen}
      />
    </div>
  );
}
