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
} from "./editor-protocol";
import type { LibraryItem } from "./library-data";
import { useAdvancedLayout } from "./advanced-layout-context";

export interface EmbedEditorPaneProps {
  item: LibraryItem;
  editorBase: string;
  mediaType: MediaType;
  siteId?: string;
  accent?: string;
  extraParams?: Record<string, string>;
  onVersionSaved?: () => void;
  onCloseRequest?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSaveResult?: (saved: boolean) => void;
  saveRequestNonce?: number;
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
  onSaveResult,
  saveRequestNonce = 0,
}: EmbedEditorPaneProps) {
  const tt = useUI();
  const layout = useAdvancedLayout();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [phase, setPhase] = useState<"connecting" | "ready" | "error">("connecting");
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
      extra: extraParams,
    });
  }, [editorBase, extraParams, instanceId, item.kind, item.previewUrl, item.title, item.url]);

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
        onDirtyChange?.(false);
        sendOpenAsset();
      } else if (message.type === "dirty") {
        onDirtyChange?.(message.dirty !== false);
        setStatus(
          message.dirty === false
            ? tt("修改已保存")
            : tt("有未保存的修改"),
        );
      } else if (message.type === "error") {
        setStatus(message.message || tt("编辑器发生错误"));
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
          onSaveResult?.(saved);
          sendToEditor({
            type: "save-result",
            ok: saved,
            message: detail,
            url: durableUrl,
            saveId: message.saveId,
          });
          if (saved) {
            onDirtyChange?.(false);
            onVersionSaved?.();
          }
        })();
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [
    editorOrigin,
    instanceId,
    item.id,
    item.kind,
    item.title,
    mediaType,
    onCloseRequest,
    onDirtyChange,
    onSaveResult,
    onVersionSaved,
    sendToEditor,
    sendOpenAsset,
    siteId,
    tt,
  ]);

  useEffect(() => {
    // 子站长时间没 ready：给出诚实的失败态，而不是假装打开了。
    const timer = window.setTimeout(() => {
      setPhase((current) => (current === "connecting" ? "error" : current));
    }, 25000);
    return () => window.clearTimeout(timer);
  }, []);

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
    if (!saveRequestNonce || phase !== "ready") return;
    const frame = iframeRef.current?.contentWindow;
    if (!frame || !editorOrigin) return;
    setStatus(tt("正在请求编辑器保存…"));
    frame.postMessage(
      {
        protocol: EDITOR_PROTOCOL,
        type: "save-request",
        instanceId,
      },
      editorOrigin,
    );
  }, [editorOrigin, instanceId, phase, saveRequestNonce, tt]);

  useEffect(() => {
    if (phase !== "ready") return;
    sendToEditor({
      type: "set-host-layout",
      sidePanelVisible: Boolean(layout?.hostPanelVisible),
    });
  }, [layout?.hostPanelVisible, phase, sendToEditor]);

  return (
    <div className="relative h-full w-full bg-white">
      {phase === "connecting" && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-white/90">
          <div className="text-center">
            <div
              className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-stone-200"
              style={{ borderTopColor: accent }}
            />
            <p className="mt-3 text-[13px] text-stone-500">{tt("正在连接编辑器…")}</p>
          </div>
        </div>
      )}
      {phase === "error" && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-white">
          <div className="max-w-sm text-center">
            <p className="text-[13px] font-medium text-stone-800">{tt("编辑器连接超时")}</p>
            <p className="mt-2 text-[12px] leading-relaxed text-stone-500">
              {tt("专业编辑器没有在预期时间内就绪。你可以直接在新窗口打开它继续编辑。")}
            </p>
            <a
              href={src}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-block rounded-xl px-4 py-2 text-[12px] font-semibold text-white"
              style={{ background: accent }}
            >
              {tt("在新窗口打开编辑器")}
            </a>
          </div>
        </div>
      )}
      {status && phase === "ready" && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-stone-900/80 px-3 py-1 text-[11px] text-white">
          {status}
        </div>
      )}
      {src && (
        <iframe
          ref={iframeRef}
          src={src}
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
