"use client";

import {
  type SetStateAction,
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  createCloudBrowser,
  createCloudBrowserOperationId,
  deleteCloudBrowser,
  hibernateCloudBrowser,
  renameCloudBrowserSession,
  restoreCloudBrowserCheckpoint,
  resumeCloudBrowser,
  type CloudBrowserCheckpoint,
} from "../lib/browser";
import { useUI } from "../i18n/ui/useUI";
import { CloudBrowserChrome } from "./cloud-browser-chrome";
import type {
  CloudBrowserRenameResult,
  CloudBrowserRestoreResult,
} from "./cloud-browser-history-view";
import { useCloudBrowserInteraction } from "./cloud-browser-interaction";
import { DEFAULT_BROWSER_URL } from "./cloud-browser-live";
import {
  BrowserPowerPrompt,
  BrowserViewportSpinner,
  cloudBrowserOpenHistoryLabel,
  CloudBrowserLifecycleErrorView,
} from "./cloud-browser-power-prompt";
import {
  cloudBrowserLifecycleIssue,
  cloudBrowserSessionCanHibernate,
  cloudBrowserSessionNeedsResume,
  cloudBrowserSessionOpenAction,
  formatCloudBrowserLifecycleError,
  type CloudBrowserLifecycleIssue,
  useCloudBrowserSessionData,
} from "./cloud-browser-session-data";
import { useCloudBrowserTransport } from "./cloud-browser-transport";
import { useOptionalWorkspaceSession } from "./WorkspaceSession";

export { pointInContainedFrame } from "./cloud-browser-live";
export {
  BrowserPowerPrompt,
  cloudBrowserOpenHistoryLabel,
  CloudBrowserLifecycleErrorView,
} from "./cloud-browser-power-prompt";

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
  const [lifecycleIssue, setLifecycleIssue] =
    useState<CloudBrowserLifecycleIssue | null>(null);
  const [notice, setNotice] = useState("");
  const [checkpointsOpen, setCheckpointsOpen] = useState(false);
  const setPlainError = useCallback(
    (value: SetStateAction<string>) => {
      setLifecycleIssue(null);
      setError(value);
    },
    [],
  );

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
    setLifecycleIssue,
  });
  const transport = useCloudBrowserTransport({
    selectedId: session.selectedId,
    liveRequested,
    setLiveRequested,
    scopeKey: effectiveTaskId,
    tt,
    setBusy,
    setError: setPlainError,
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
    setError: setPlainError,
    tt,
  });

  function clearLifecycleIssue() {
    setLifecycleIssue(null);
    setError("");
  }

  function showLifecycleIssue(
    result: Parameters<typeof cloudBrowserLifecycleIssue>[0],
    fallback: string,
    operation: string,
  ) {
    const issue = cloudBrowserLifecycleIssue(
      { operation, ...result },
      fallback,
    );
    setLifecycleIssue(issue);
    setError(issue.message);
    return issue;
  }

  async function startBrowser() {
    if (busy) return;
    setBusy(true);
    clearLifecycleIssue();
    setNotice("");
    // A task-bound create call reuses that task's durable session. The explicit
    // “新建” action must always create a fresh isolation domain.
    const result = await createCloudBrowser(
      DEFAULT_BROWSER_URL,
    );
    setBusy(false);
    const created = result.data?.session;
    if (!result.ok || !created) {
      showLifecycleIssue(
        result,
        tt("云端浏览器启动失败"),
        "session_create",
      );
      return;
    }
    session.upsertSession(created);
    await session.reload(created.id);
    await transport.openLive(created.id);
  }

  async function restorePrevious() {
    if (busy || !session.selectedId) return;
    const selectedId = session.selectedId;
    const operationId = createCloudBrowserOperationId();
    setBusy(true);
    clearLifecycleIssue();
    setNotice("");
    const result = await resumeCloudBrowser(selectedId, {
      operationId,
    });
    setBusy(false);
    if (!result.ok) {
      showLifecycleIssue(
        result,
        tt("恢复上次浏览失败"),
        "session_resume",
      );
      setCheckpointsOpen(false);
      return;
    }
    await session.reload(selectedId);
    setCheckpointsOpen(false);
    await transport.openLive(selectedId);
  }

  async function openSelectedSession() {
    if (busy) return;
    const selected = session.selected;
    if (!selected) {
      setPlainError(tt("未选择浏览会话"));
      return;
    }
    const openAction = cloudBrowserSessionOpenAction(selected);
    if (openAction === "unavailable") {
      showLifecycleIssue(
        {
          error: "INVALID_LIFECYCLE_STATE",
          status: 409,
          operation: "session_open",
          retryable: false,
          diagnostics: {
            component: "browser_lifecycle",
            state: selected.status,
          },
        },
        tt("浏览器操作失败"),
        "session_open",
      );
      return;
    }
    if (cloudBrowserSessionNeedsResume(selected)) {
      await restorePrevious();
      return;
    }
    if (
      selected.protocol_version !== undefined &&
      selected.protocol_version !== null &&
      selected.protocol_version !== 3
    ) {
      setPlainError(
        `${tt(
          "服务端未提供严格平铺 v3 票据，已拒绝降级连接",
        )} (v3 protocol_mismatch)`,
      );
      return;
    }
    clearLifecycleIssue();
    setCheckpointsOpen(false);
    await transport.openLive(selected.id);
  }

  async function hibernateCurrentSession() {
    if (busy) return;
    const selected = session.selected;
    if (
      !selected ||
      !cloudBrowserSessionCanHibernate(
        selected,
        transport.transportState,
      )
    ) {
      showLifecycleIssue(
        {
          error: "INVALID_LIFECYCLE_STATE",
          status: 409,
          operation: "session_hibernate",
          retryable: false,
          diagnostics: {
            component: "browser_lifecycle",
            state: selected?.status || "missing",
          },
        },
        tt("休眠浏览会话失败"),
        "session_hibernate",
      );
      return;
    }
    const selectedId = selected.id;
    const prior = selected;
    const operationId = createCloudBrowserOperationId();
    setBusy(true);
    clearLifecycleIssue();
    // Tear down live before the hibernate CAS so ticket/WS recovery cannot
    // race a hibernating runtime and leave the chrome in a grey dead state.
    transport.stopLive(true);
    const result = await hibernateCloudBrowser(
      selectedId,
      operationId,
    );
    setBusy(false);
    if (!result.ok) {
      showLifecycleIssue(
        result,
        tt("休眠浏览会话失败"),
        "session_hibernate",
      );
      await session.reload(selectedId);
      return;
    }
    const hibernated = result.data;
    session.upsertSession({
      ...prior,
      status: hibernated?.status || "hibernated",
      session_version:
        hibernated?.session_version ?? prior.session_version,
      runtime_id: hibernated?.runtime_id ?? "",
      incarnation: hibernated?.incarnation ?? 0,
      runtime_state: "absent",
    });
    await session.reload(selectedId);
    setNotice(tt("休眠"));
  }

  async function removeRecord() {
    if (!session.selectedId) return;
    if (!session.deleteArmed) {
      session.setDeleteArmed(true);
      return;
    }
    transport.stopLive(true);
    setBusy(true);
    clearLifecycleIssue();
    const result = await deleteCloudBrowser(session.selectedId);
    setBusy(false);
    session.setDeleteArmed(false);
    if (!result.ok) {
      showLifecycleIssue(
        result,
        tt("删除浏览记录失败"),
        "session_delete",
      );
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

  async function renameSession(
    sessionId: string,
    title: string,
  ): Promise<CloudBrowserRenameResult> {
    const result = await renameCloudBrowserSession(sessionId, title);
    const updated = result.data?.session;
    if (!result.ok || !updated) {
      return {
        ok: false,
        error: formatCloudBrowserLifecycleError(
          result,
          tt("浏览会话命名失败"),
        ),
      };
    }
    session.upsertSession(updated);
    return { ok: true };
  }

  function bookmarkCurrentPage() {
    if (!transport.bookmarkCurrentPage()) {
      setPlainError(tt("当前没有有效控制租约，无法收藏当前页面"));
      return;
    }
    setPlainError("");
    setNotice(tt("已发送收藏当前页面请求"));
  }

  function createCheckpoint() {
    const sent = transport.createCheckpoint();
    if (!sent) {
      setPlainError(tt("当前没有有效控制租约，无法创建会话快照"));
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
    clearLifecycleIssue();
    const result = await restoreCloudBrowserCheckpoint(
      selectedId,
      checkpoint,
      operationId,
    );
    setBusy(false);
    if (!result.ok) {
      const issue = showLifecycleIssue(
        result,
        tt("会话快照恢复失败"),
        "checkpoint_restore",
      );
      await session.refreshCheckpoints();
      return { ok: false, error: issue.message };
    }
    await session.reload(selectedId);
    await session.refreshCheckpoints();
    const opened = await transport.openLive(selectedId);
    if (!opened) {
      const message = tt("会话快照已恢复，但实时画面重连失败");
      setPlainError(message);
      return { ok: false, error: message };
    }
    setCheckpointsOpen(false);
    return { ok: true };
  }

  const fallbackImmersive =
    interaction.immersive &&
    interaction.fullscreenMode === "fallback";
  const terminalFailure =
    liveRequested && transport.transportState === "failed";
  const waitingForLive =
    liveRequested &&
    transport.transportState !== "streaming" &&
    transport.transportState !== "failed" &&
    transport.transportState !== "closed";
  const terminalMessage =
    transport.failureKind === "protocol_mismatch"
      ? `${error || tt(
          "服务端未提供严格平铺 v3 票据，已拒绝降级连接",
        )} (v3 protocol_mismatch)`
      : error || tt("原生窗口连接失败");
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
        {!liveRequested && (
          <BrowserPowerPrompt
            accent={accent}
            busy={busy}
            error={error}
            historyLabel={cloudBrowserOpenHistoryLabel(tt)}
            lifecycleIssue={lifecycleIssue}
            newLabel={tt("新建")}
            notice={notice}
            onHistory={() => {
              setCheckpointsOpen(true);
              if (session.selectedId) {
                void session.refreshCheckpoints();
              }
            }}
            onNew={() => void startBrowser()}
            onResume={
              cloudBrowserSessionNeedsResume(session.selected)
                ? () => void openSelectedSession()
                : undefined
            }
            resumeLabel={
              cloudBrowserSessionNeedsResume(session.selected)
                ? tt("恢复")
                : undefined
            }
          />
        )}

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

        {waitingForLive && (
          <BrowserViewportSpinner
            label={tt("浏览器正在连接")}
            retainedFrame={transport.hasCanvasFrame}
          />
        )}
        {terminalFailure && (
          <div
            className="absolute inset-0 z-20 grid place-items-center bg-stone-950/90 p-8 text-center"
            role="alert"
            data-cloud-browser-terminal-failure
            data-cloud-browser-lifecycle-code={
              lifecycleIssue?.code || undefined
            }
            data-cloud-browser-lifecycle-operation={
              lifecycleIssue?.operation || undefined
            }
            data-cloud-browser-lifecycle-retryable={
              lifecycleIssue?.retryable === null ||
              lifecycleIssue?.retryable === undefined
                ? undefined
                : lifecycleIssue.retryable
                  ? "true"
                  : "false"
            }
            data-cloud-browser-lifecycle-retry-after={
              lifecycleIssue?.retryAfterSeconds ?? undefined
            }
          >
            <div className="max-w-md">
              <p
                className="text-[11px] leading-5 text-rose-200"
                data-cloud-browser-terminal-message
              >
                {terminalMessage}
              </p>
              <button
                type="button"
                onClick={() => void openSelectedSession()}
                disabled={busy}
                className="mt-4 rounded-xl px-4 py-2 text-[11px] font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-50"
                style={{ background: accent }}
                data-cloud-browser-retry
              >
                {tt("重试连接")}
              </button>
            </div>
          </div>
        )}
        {error &&
          transport.transportState === "streaming" && (
            <div
              data-cloud-browser-live-error
            >
              <CloudBrowserLifecycleErrorView
                className="absolute left-1/2 top-2 z-20 max-w-[min(560px,90%)] -translate-x-1/2 rounded-lg bg-rose-50/95 px-3 py-2 text-[11px] text-rose-700 shadow"
                issue={lifecycleIssue}
                message={error}
              />
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
        liveRequested={liveRequested}
        driving={transport.driving}
        lease={transport.lease}
        controlPending={transport.controlPending}
        controlIntentSent={transport.controlIntentSent}
        hasCanvasFrame={transport.hasCanvasFrame}
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
          cloudBrowserSessionCanHibernate(
            session.selected,
            transport.transportState,
          )
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
        showPowerButton={liveRequested}
        onChooseSession={chooseSession}
        onRenameSession={renameSession}
        selectedOpenAction={cloudBrowserSessionOpenAction(
          session.selected,
        )}
        onOpenOrResume={() => void openSelectedSession()}
        onStartNew={() => void startBrowser()}
        onHibernate={() => void hibernateCurrentSession()}
        onDelete={() => void removeRecord()}
        onToggleControl={transport.toggleControl}
        onCancelControl={transport.cancelTakeover}
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
