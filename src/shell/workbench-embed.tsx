"use client";

// 高级内容工作台的「协议嵌入」画格：design 画布 / video 节点画布 / website
// 站点编辑器通过 oceanleo.editor.v1 协议嵌入。与 v1 的关键区别：
//   1. 只嵌真正实现了协议接收端的编辑器页（不再嵌子站 /workspace 生成台）；
//   2. 严格握手——收到 `ready` 才发 open-asset、才算「已连接」；
//   3. 子站保存产物（artifact-created）由宿主统一登记进「我的库」。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUI } from "../i18n/ui/useUI";
import {
  EDITOR_PROTOCOL,
  asHostToEditorMessage,
  buildEditorEmbedUrl,
  isTrustedEditorOrigin,
  type EditorDocumentRevision,
} from "./editor-protocol";
import type { SelectionContext } from "./selection-context";
import { SelectionCommandGate } from "./selection-transactions";
import type { LibraryItem } from "./library-data";
import {
  useEmbedEditorMessages,
  type EmbedEditorStatus,
} from "./use-embed-editor-messages";
import type { EmbedEditorPaneProps } from "./workbench-embed-types";
import { editorRouteFor } from "./workbench-routes";
import { buildOpenAssetPayload } from "./website-embed-params";

export type { EmbedEditorPaneProps } from "./workbench-embed-types";

/** 每类嵌入编辑器的地址；只列已实现 editor.v1 接收端的页面。 */
export function embedEditorBase(item: LibraryItem): string {
  const route = editorRouteFor(item);
  return route.type === "embed" ? route.base : "";
}

export function EmbedEditorPane({
  item,
  editorBase,
  mediaType,
  siteId = "",
  accent = "#4f46e5",
  extraParams,
  onVersionSaved,
  onCloseRequest,
  onDirtyChange,
  onHistoryChange,
  onToolsManifest,
  onProjectManifest,
  onProjectResult,
  onProtocolReset,
  onSelectionChange,
  onSelectionResult,
  onViewportChange,
  onSaveResult,
  saveRequestId = "",
  selectionCommand = null,
  viewportCommand = null,
  materialInsertion = null,
  onMaterialResult,
  exportRequestId = "",
  onExportResult,
  projectCommand = null,
  recoveryCaptureRequestId = "",
  onRecoverySnapshot,
  recoveryRestore = null,
  onRecoveryResult,
}: EmbedEditorPaneProps) {
  const tt = useUI();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const readyHandledRef = useRef(false);
  const latestSelectionRef = useRef<SelectionContext | null>(null);
  const selectionGateRef = useRef(new SelectionCommandGate());
  const sentSaveRequestsRef = useRef(new Set<string>());
  const sentExportRequestsRef = useRef(new Set<string>());
  const sentProjectRequestsRef = useRef(new Set<string>());
  const projectRequestsRef = useRef(
    new Map<string, EditorDocumentRevision>(),
  );
  const latestProjectManifestRevisionRef =
    useRef<EditorDocumentRevision | null>(null);
  const sentRecoveryCaptureRequestsRef = useRef(new Set<string>());
  const sentRecoveryRestoreRequestsRef = useRef(new Set<string>());
  const artifactSaveOperationsRef = useRef(
    new Map<
      string,
      Promise<{
        saved: boolean;
        detail: string;
        durableUrl: string;
        savedItem?: LibraryItem;
      }>
    >(),
  );
  const [phase, setPhase] = useState<"connecting" | "ready" | "error">("connecting");
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<EmbedEditorStatus | null>(null);
  const instanceId = useRef(
    `wb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  ).current;
  const disposedRef = useRef(false);
  const disposeId = useMemo(
    () => `dispose-${instanceId}-${attempt}`,
    [attempt, instanceId],
  );

  const src = useMemo(() => {
    if (typeof window === "undefined") return "";
    try {
      return buildEditorEmbedUrl(editorBase, {
        instanceId,
        hostOrigin: window.location.origin,
        assetUrl: item.url || item.previewUrl || undefined,
        assetTitle: item.title,
        assetKind: item.kind,
        extra: {
          ...extraParams,
          __attempt: String(attempt),
        },
      });
    } catch {
      return "";
    }
  }, [
    attempt,
    editorBase,
    extraParams,
    instanceId,
    item.kind,
    item.previewUrl,
    item.title,
    item.url,
  ]);

  const editorOrigin = useMemo(() => {
    try {
      const origin = new URL(editorBase).origin;
      return isTrustedEditorOrigin(origin) ? origin : "";
    } catch {
      return "";
    }
  }, [editorBase]);

  const sendToEditor = useCallback(
    (message: Record<string, unknown>) => {
      const frame = iframeRef.current?.contentWindow;
      if (!frame || !editorOrigin) return false;
      const envelope = { ...message, protocol: EDITOR_PROTOCOL, instanceId };
      if (!asHostToEditorMessage(envelope, instanceId)) return false;
      try {
        frame.postMessage(envelope, editorOrigin);
        return true;
      } catch {
        // Invalid/non-cloneable data never crosses the frame boundary.
        return false;
      }
    },
    [editorOrigin, instanceId],
  );
  const cancelSelectionTransactions = useCallback(() => {
    for (const command of selectionGateRef.current.cancelAll()) {
      sendToEditor({ type: "selection-command", command });
    }
  }, [sendToEditor]);
  useEffect(() => {
    cancelSelectionTransactions();
    latestSelectionRef.current = null;
  }, [
    attempt,
    cancelSelectionTransactions,
    editorOrigin,
    item.key,
  ]);
  useEffect(() => {
    artifactSaveOperationsRef.current.clear();
    sentSaveRequestsRef.current.clear();
    sentExportRequestsRef.current.clear();
    sentProjectRequestsRef.current.clear();
    sentRecoveryCaptureRequestsRef.current.clear();
    sentRecoveryRestoreRequestsRef.current.clear();
    projectRequestsRef.current.clear();
    latestProjectManifestRevisionRef.current = null;
  }, [item.key]);
  useEffect(() => {
    const cancel = () => cancelSelectionTransactions();
    window.addEventListener("blur", cancel);
    return () => window.removeEventListener("blur", cancel);
  }, [cancelSelectionTransactions]);

  const sendOpenAsset = useCallback(() => {
    if (item.meta.draft === true && !item.url && !item.previewUrl) return;
    sendToEditor({
      type: "open-asset",
      asset: buildOpenAssetPayload(item),
    });
  }, [item, sendToEditor]);

  useEmbedEditorMessages({
    iframeRef,
    editorOrigin,
    instanceId,
    item,
    mediaType,
    siteId,
    readyHandledRef,
    latestSelectionRef,
    selectionGateRef,
    projectRequestsRef,
    latestProjectManifestRevisionRef,
    sentRecoveryCaptureRequestsRef,
    sentRecoveryRestoreRequestsRef,
    artifactSaveOperationsRef,
    sendToEditor,
    sendOpenAsset,
    setPhase,
    setStatus,
    tt,
    onCloseRequest,
    onDirtyChange,
    onExportResult,
    onHistoryChange,
    onMaterialResult,
    onProjectManifest,
    onProjectResult,
    onRecoveryResult,
    onRecoverySnapshot,
    onSelectionChange,
    onSelectionResult,
    onToolsManifest,
    onViewportChange,
    onSaveResult,
    onVersionSaved,
  });

  useEffect(() => {
    if (!status || status.severity === "fatal") return;
    const timer = window.setTimeout(
      () => setStatus((current) => (current === status ? null : current)),
      status.retryable ? 8_000 : 5_000,
    );
    return () => window.clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    if (phase !== "connecting" || !frameLoaded) return;
    const init = () => sendToEditor({ type: "init" });
    init();
    const interval = window.setInterval(init, 1_500);
    return () => window.clearInterval(interval);
  }, [frameLoaded, phase, sendToEditor]);

  useEffect(() => {
    if (!frameLoaded || phase !== "connecting") return;
    // Start the handshake budget after iframe navigation completes. Starting
    // it at host mount timed out slow/cold embeds while they were still
    // about:blank and spammed target-origin errors.
    const timer = window.setTimeout(() => {
      setPhase((current) => (current === "connecting" ? "error" : current));
    }, 15000);
    return () => window.clearTimeout(timer);
  }, [attempt, frameLoaded, phase]);

  useEffect(() => {
    disposedRef.current = false;
    const frame = iframeRef.current?.contentWindow;
    return () => {
      latestSelectionRef.current = null;
      if (disposedRef.current) return;
      disposedRef.current = true;
      try {
        for (const command of selectionGateRef.current.cancelAll()) {
          frame?.postMessage(
            {
              protocol: EDITOR_PROTOCOL,
              type: "selection-command",
              instanceId,
              command,
            },
            editorOrigin,
          );
        }
        // dispose 尽力而为——iframe 可能已卸载。
        frame?.postMessage(
          {
            protocol: EDITOR_PROTOCOL,
            type: "dispose",
            instanceId,
            disposeId,
          },
          editorOrigin,
        );
      } catch {
        /* ignore */
      }
      selectionGateRef.current.clear();
    };
  }, [attempt, disposeId, editorOrigin, instanceId]);

  useEffect(() => {
    if (!saveRequestId || phase !== "ready") return;
    if (sentSaveRequestsRef.current.has(saveRequestId)) return;
    if (sendToEditor({ type: "save-request", saveId: saveRequestId })) {
      sentSaveRequestsRef.current.add(saveRequestId);
    }
  }, [phase, saveRequestId, sendToEditor]);

  useEffect(() => {
    if (!exportRequestId || phase !== "ready") return;
    if (sentExportRequestsRef.current.has(exportRequestId)) return;
    if (
      sendToEditor({
        type: "export-request",
        exportId: exportRequestId,
        format: "default",
      })
    ) {
      sentExportRequestsRef.current.add(exportRequestId);
    }
  }, [exportRequestId, phase, sendToEditor]);

  useEffect(() => {
    if (phase !== "ready" || !projectCommand) return;
    if (sentProjectRequestsRef.current.has(projectCommand.requestId)) return;
    const sent = sendToEditor(
      projectCommand.kind === "view"
        ? {
            type: "project-view",
            requestId: projectCommand.requestId,
            viewId: projectCommand.targetId,
            manifestRevision: projectCommand.manifestRevision,
          }
        : {
            type: "project-action",
            requestId: projectCommand.requestId,
            actionId: projectCommand.targetId,
            manifestRevision: projectCommand.manifestRevision,
          },
    );
    if (sent) {
      sentProjectRequestsRef.current.add(projectCommand.requestId);
      projectRequestsRef.current.set(
        projectCommand.requestId,
        projectCommand.manifestRevision,
      );
    }
  }, [phase, projectCommand, sendToEditor]);

  useEffect(() => {
    if (phase !== "ready" || !recoveryCaptureRequestId) return;
    if (
      sentRecoveryCaptureRequestsRef.current.has(recoveryCaptureRequestId)
    ) {
      return;
    }
    if (
      sendToEditor({
        type: "recovery-capture",
        recoveryId: recoveryCaptureRequestId,
      })
    ) {
      sentRecoveryCaptureRequestsRef.current.add(recoveryCaptureRequestId);
    }
  }, [phase, recoveryCaptureRequestId, sendToEditor]);

  useEffect(() => {
    if (phase !== "ready" || !recoveryRestore) return;
    if (
      sentRecoveryRestoreRequestsRef.current.has(recoveryRestore.recoveryId)
    ) {
      return;
    }
    if (
      sendToEditor({
        type: "recovery-restore",
        recoveryId: recoveryRestore.recoveryId,
        snapshot: recoveryRestore.snapshot,
      })
    ) {
      sentRecoveryRestoreRequestsRef.current.add(recoveryRestore.recoveryId);
    }
  }, [phase, recoveryRestore, sendToEditor]);

  useEffect(() => {
    if (phase !== "ready") return;
    sendToEditor({
      type: "set-host-layout",
      // The App's physical left pane exists even when it currently shows the
      // Agent/library rather than a tool drawer. Embedded editors must never
      // add a second internal sidebar inside the right canvas.
      sidePanelVisible: true,
      hostOwnsChrome: true,
      hostOwnsViewport: true,
    });
  }, [phase, sendToEditor]);

  useEffect(() => {
    if (phase !== "ready" || !selectionCommand) return;
    if (
      !selectionGateRef.current.accept(
        selectionCommand,
        latestSelectionRef.current,
      )
    ) {
      setStatus({
        message: tt("选择已变化，请重新选择后再编辑。"),
        severity: "warning",
        retryable: true,
      });
      onSelectionResult?.({
        requestId: selectionCommand.requestId,
        ok: false,
        message: "选择已变化，请重新选择后再编辑。",
      });
      return;
    }
    sendToEditor({ type: "selection-command", command: selectionCommand });
  }, [onSelectionResult, phase, selectionCommand, sendToEditor, tt]);

  useEffect(() => {
    if (phase !== "ready" || !viewportCommand) return;
    sendToEditor({ type: "viewport-command", ...viewportCommand });
  }, [phase, sendToEditor, viewportCommand]);

  useEffect(() => {
    if (phase !== "ready" || !materialInsertion) return;
    const frameRect = iframeRef.current?.getBoundingClientRect();
    const point =
      materialInsertion.point && frameRect
        ? {
            x: materialInsertion.point.x - frameRect.left,
            y: materialInsertion.point.y - frameRect.top,
          }
        : undefined;
    sendToEditor({
      type: "material-insert",
      insertion: {
        ...materialInsertion,
        ...(point ? { point } : { point: undefined }),
      },
    });
  }, [materialInsertion, phase, sendToEditor]);

  return (
    <div className="relative h-full w-full bg-[var(--surface,#f5f5f4)]">
      {phase === "connecting" && src && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-[var(--card,#fff)]/90">
          <div
            aria-hidden="true"
            className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border,#e7e5e4)]"
            style={{ borderTopColor: accent }}
          />
        </div>
      )}
      {(phase === "error" || !src) && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-[var(--card,#fff)]">
          <div className="max-w-sm text-center" role="alert">
            <p className="text-[13px] font-medium text-[var(--fg,#292524)]">
              {tt(src ? "编辑器连接超时" : "编辑器地址不受信任")}
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-[var(--muted,#78716c)]">
              {tt(
                src
                  ? "专业编辑器没有在预期时间内就绪。请在当前画布重试。"
                  : "只允许连接受信任的 OceanLeo 编辑器地址。",
              )}
            </p>
            {src && (
              <button
                type="button"
                onClick={() => {
                  readyHandledRef.current = false;
                  cancelSelectionTransactions();
                  latestSelectionRef.current = null;
                  projectRequestsRef.current.clear();
                  latestProjectManifestRevisionRef.current = null;
                  onProtocolReset?.();
                  setStatus(null);
                  setFrameLoaded(false);
                  setPhase("connecting");
                  setAttempt((value) => value + 1);
                }}
                className="mt-4 inline-block rounded-xl px-4 py-2 text-[12px] font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent,#4f46e5)]/40"
                style={{ background: accent }}
              >
                {tt("重新加载编辑器")}
              </button>
            )}
          </div>
        </div>
      )}
      {status && phase === "ready" && (
        <div
          role={status.severity === "fatal" ? "alert" : "status"}
          aria-live={status.severity === "fatal" ? "assertive" : "polite"}
          aria-atomic="true"
          data-editor-status-severity={status.severity}
          data-editor-status-code={status.code || undefined}
          className={`absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-xl border px-3 py-2 text-[11px] shadow-lg ${
            status.severity === "fatal"
              ? "border-red-800 bg-red-700 text-white"
              : status.severity === "warning"
                ? "border-amber-300 bg-amber-50 text-amber-950"
                : "border-sky-200 bg-sky-50 text-sky-950"
          }`}
        >
          <span>{status.message}</span>
          <button
            type="button"
            onClick={() => setStatus(null)}
            className="rounded px-1 font-bold hover:bg-black/10"
            aria-label={tt("关闭提示")}
          >
            ×
          </button>
        </div>
      )}
      {src && (
        <iframe
          key={`${instanceId}:${attempt}`}
          ref={iframeRef}
          src={src}
          onLoad={() => {
            readyHandledRef.current = false;
            cancelSelectionTransactions();
            latestSelectionRef.current = null;
            projectRequestsRef.current.clear();
            latestProjectManifestRevisionRef.current = null;
            sentSaveRequestsRef.current.clear();
            sentExportRequestsRef.current.clear();
            sentProjectRequestsRef.current.clear();
            sentRecoveryCaptureRequestsRef.current.clear();
            sentRecoveryRestoreRequestsRef.current.clear();
            onProtocolReset?.();
            setPhase("connecting");
            setFrameLoaded(true);
          }}
          onBlur={cancelSelectionTransactions}
          title={item.title}
          className="h-full w-full border-0"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-downloads allow-modals"
          allow="clipboard-read; clipboard-write; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      )}
    </div>
  );
}
