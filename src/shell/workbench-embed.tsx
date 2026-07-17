"use client";

// 高级内容工作台的「协议嵌入」画格：design 画布 / video 节点画布 / website
// 站点编辑器通过 oceanleo.editor.v1 协议嵌入。与 v1 的关键区别：
//   1. 只嵌真正实现了协议接收端的编辑器页（不再嵌子站 /workspace 生成台）；
//   2. 严格握手——收到 `ready` 才发 open-asset、才算「已连接」；
//   3. 子站保存产物（artifact-created）由宿主统一登记进「我的库」。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUI } from "../i18n/ui/useUI";
import { saveWorks, type MediaType } from "../lib/database";
import { importMediaUrl, isFirstPartyMediaUrl } from "../lib/media-proxy";
import {
  EDITOR_PROTOCOL,
  asEditorToHostMessage,
  buildEditorEmbedUrl,
  isTrustedEditorOrigin,
  type EditorMaterialInsertion,
} from "./editor-protocol";
import type { SelectionCommand, SelectionContext } from "./selection-context";
import type { LibraryItem } from "./library-data";
import { advancedSavedItem } from "./advanced-session";

export interface EmbedEditorPaneProps {
  item: LibraryItem;
  editorBase: string;
  mediaType: MediaType;
  siteId?: string;
  accent?: string;
  extraParams?: Record<string, string>;
  onVersionSaved?: (item: LibraryItem) => void;
  onCloseRequest?: () => void;
  onDirtyChange?: (dirty: boolean, revision?: number) => void;
  onSelectionChange?: (selection: SelectionContext | null) => void;
  onSaveResult?: (result: {
    ok: boolean;
    saveId?: string;
    item?: LibraryItem;
  }) => void;
  saveRequestId?: string;
  selectionCommand?: SelectionCommand | null;
  materialInsertion?: EditorMaterialInsertion | null;
  onMaterialResult?: (result: {
    commandId: string;
    ok: boolean;
    message?: string;
  }) => void;
}

function isDurableArtifactUrl(url: string, mediaType: MediaType): boolean {
  if (isFirstPartyMediaUrl(url)) return true;
  if (mediaType !== "website") return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      (parsed.hostname === "oceanleo.com" ||
        parsed.hostname.endsWith(".oceanleo.com"))
    );
  } catch {
    return false;
  }
}

/** 每类嵌入编辑器的地址；只列已实现 editor.v1 接收端的页面。 */
export function embedEditorBase(item: LibraryItem): string {
  switch (item.kind) {
    case "canvas":
      return item.siteId === "video"
        ? "https://video.oceanleo.com/canvas-board"
        : "https://design.oceanleo.com/embed/editor";
    case "video_canvas":
      return "https://video.oceanleo.com/canvas-board";
    case "website":
      return "https://website.oceanleo.com/embed/site-editor";
    default:
      return "";
  }
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
  onSelectionChange,
  onSaveResult,
  saveRequestId = "",
  selectionCommand = null,
  materialInsertion = null,
  onMaterialResult,
}: EmbedEditorPaneProps) {
  const tt = useUI();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const readyHandledRef = useRef(false);
  const [phase, setPhase] = useState<"connecting" | "ready" | "error">("connecting");
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState("");
  const instanceId = useRef(
    `wb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  ).current;

  const src = useMemo(() => {
    if (typeof window === "undefined") return "";
    return buildEditorEmbedUrl(editorBase, {
      instanceId,
      hostOrigin: window.location.origin,
      assetUrl: item.url || item.previewUrl || "",
      assetTitle: item.title,
      assetKind: item.kind,
      extra: {
        ...extraParams,
        __attempt: String(attempt),
      },
    });
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
      return new URL(editorBase).origin;
    } catch {
      return "";
    }
  }, [editorBase]);

  const sendToEditor = useCallback(
    (message: Record<string, unknown>) => {
      const frame = iframeRef.current?.contentWindow;
      if (!frame || !editorOrigin) return;
      frame.postMessage(
        { protocol: EDITOR_PROTOCOL, instanceId, ...message },
        editorOrigin,
      );
    },
    [editorOrigin, instanceId],
  );

  const sendOpenAsset = useCallback(() => {
    if (item.meta.draft === true && !item.url && !item.previewUrl) return;
    sendToEditor({
      type: "open-asset",
      asset: {
        id: item.id,
        kind: item.kind,
        title: item.title,
        url: item.url,
        previewUrl: item.previewUrl,
        meta: item.meta,
        writable: !(
          item.siteId === "asset" ||
          item.key.startsWith("asset:") ||
          item.meta.asset_id ||
          item.meta.platform_asset_id
        ),
      },
    });
  }, [item, sendToEditor]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.origin !== editorOrigin || !isTrustedEditorOrigin(event.origin)) return;
      const message = asEditorToHostMessage(event.data, instanceId);
      if (!message) return;
      if (message.type === "ready") {
        setPhase("ready");
        setStatus(tt("编辑器已连接"));
        if (!readyHandledRef.current) {
          readyHandledRef.current = true;
          onDirtyChange?.(false);
          sendOpenAsset();
        }
      } else if (message.type === "dirty") {
        onDirtyChange?.(message.dirty !== false, message.revision);
        setStatus(
          message.dirty === false
            ? tt("修改已保存")
            : tt("有未保存的修改"),
        );
      } else if (message.type === "error") {
        setStatus(message.message || tt("编辑器发生错误"));
      } else if (message.type === "selection-changed") {
        const frameRect = iframeRef.current?.getBoundingClientRect();
        const anchor = message.selection?.anchor;
        onSelectionChange?.(
          message.selection && anchor && frameRect
            ? {
                ...message.selection,
                anchor: {
                  x: frameRect.left + anchor.x,
                  y: frameRect.top + anchor.y,
                  width: anchor.width,
                  height: anchor.height,
                },
              }
            : message.selection,
        );
      } else if (message.type === "material-result") {
        onMaterialResult?.({
          commandId: message.commandId,
          ok: message.ok,
          message: message.message,
        });
      } else if (message.type === "close-request") {
        onCloseRequest?.();
      } else if (message.type === "artifact-created" || message.type === "artifact-updated") {
        setStatus(tt("保存中…"));
        void (async () => {
          let saved = false;
          let detail = tt("保存失败");
          let durableUrl = message.url;
          try {
            if (!isDurableArtifactUrl(durableUrl, mediaType)) {
              const importKind =
                mediaType === "image"
                  ? "image"
                  : mediaType === "video"
                    ? "video"
                    : mediaType === "audio"
                      ? "audio"
                      : mediaType === "model3d"
                        ? "model3d"
                        : "file";
              durableUrl = await importMediaUrl(durableUrl, {
                kind: importKind,
                siteId: siteId || "oceanleo",
                title: message.title || `${item.title}-编辑版`,
                registerAsset: false,
              });
            }
            const result = await saveWorks(siteId || "oceanleo", [
              {
                url: durableUrl,
                thumb_url:
                  message.previewUrl &&
                  isDurableArtifactUrl(message.previewUrl, mediaType)
                    ? message.previewUrl
                    : durableUrl,
                media_type: mediaType,
                title: message.title || `${item.title}-编辑版`,
                kind: item.kind,
                meta: {
                  ...(message.meta || {}),
                  parent_asset_id: item.id,
                  editor_instance: instanceId,
                },
              },
            ]);
            saved = result.ok && Number(result.data?.saved || 0) === 1;
            detail = saved
              ? tt("新版本已保存到我的库")
              : result.error || tt("保存失败");
          } catch (caught) {
            detail =
              caught instanceof Error && caught.message
                ? caught.message
                : tt("保存失败");
          }
          setStatus(detail);
          const savedItem = saved
            ? advancedSavedItem(item, {
                url: durableUrl,
                previewUrl: message.previewUrl,
                title: message.title,
                meta: message.meta,
              })
            : undefined;
          onSaveResult?.({
            ok: saved,
            saveId: message.saveId,
            item: savedItem,
          });
          sendToEditor({
            type: "save-result",
            ok: saved,
            message: detail,
            url: durableUrl,
            saveId: message.saveId,
          });
          if (saved) {
            onDirtyChange?.(false);
            if (savedItem) onVersionSaved?.(savedItem);
          }
        })();
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [
    editorOrigin,
    instanceId,
    item,
    mediaType,
    onCloseRequest,
    onDirtyChange,
    onMaterialResult,
    onSelectionChange,
    onSaveResult,
    onVersionSaved,
    sendToEditor,
    sendOpenAsset,
    siteId,
    tt,
  ]);

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
    const frame = iframeRef.current?.contentWindow;
    return () => {
      // dispose 尽力而为——iframe 可能已卸载。
      try {
        frame?.postMessage(
          { protocol: EDITOR_PROTOCOL, type: "dispose", instanceId },
          editorOrigin,
        );
      } catch {
        /* ignore */
      }
    };
  }, [editorOrigin, instanceId]);

  useEffect(() => {
    if (!saveRequestId || phase !== "ready") return;
    const frame = iframeRef.current?.contentWindow;
    if (!frame || !editorOrigin) return;
    setStatus(tt("正在请求编辑器保存…"));
    frame.postMessage(
      {
        protocol: EDITOR_PROTOCOL,
        type: "save-request",
        instanceId,
        saveId: saveRequestId,
      },
      editorOrigin,
    );
  }, [editorOrigin, instanceId, phase, saveRequestId, tt]);

  useEffect(() => {
    if (phase !== "ready") return;
    sendToEditor({
      type: "set-host-layout",
      // The App's physical left pane exists even when it currently shows the
      // Agent/library rather than a tool drawer. Embedded editors must never
      // add a second internal sidebar inside the right canvas.
      sidePanelVisible: true,
      hostOwnsChrome: true,
    });
  }, [phase, sendToEditor]);

  useEffect(() => {
    if (phase !== "ready" || !selectionCommand) return;
    sendToEditor({ type: "selection-command", command: selectionCommand });
  }, [phase, selectionCommand, sendToEditor]);

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
      {phase === "connecting" && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-[var(--card,#fff)]/90">
          <div className="text-center">
            <div
              className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[var(--border,#e7e5e4)]"
              style={{ borderTopColor: accent }}
            />
            <p className="mt-3 text-[13px] text-[var(--muted,#78716c)]">{tt("正在连接编辑器…")}</p>
          </div>
        </div>
      )}
      {phase === "error" && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-[var(--card,#fff)]">
          <div className="max-w-sm text-center">
            <p className="text-[13px] font-medium text-[var(--fg,#292524)]">{tt("编辑器连接超时")}</p>
            <p className="mt-2 text-[12px] leading-relaxed text-[var(--muted,#78716c)]">
              {tt("专业编辑器没有在预期时间内就绪。请在当前画布重试。")}
            </p>
            <button
              type="button"
              onClick={() => {
                readyHandledRef.current = false;
                setStatus("");
                setFrameLoaded(false);
                setPhase("connecting");
                setAttempt((value) => value + 1);
              }}
              className="mt-4 inline-block rounded-xl px-4 py-2 text-[12px] font-semibold text-white"
              style={{ background: accent }}
            >
              {tt("重新加载编辑器")}
            </button>
          </div>
        </div>
      )}
      {status && phase === "ready" && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-[var(--fg,#292524)]/80 px-3 py-1 text-[11px] text-[var(--card,#fff)]">
          {status}
        </div>
      )}
      {src && (
        <iframe
          key={`${instanceId}:${attempt}`}
          ref={iframeRef}
          src={src}
          onLoad={() => setFrameLoaded(true)}
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
