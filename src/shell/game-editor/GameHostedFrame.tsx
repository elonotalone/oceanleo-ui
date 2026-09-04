"use client";

/**
 * 专业模式：microStudio iframe。只在 L0 `set-mode: pro` 之后挂上。
 *
 * 沙箱走 W01 的 `embedEditorFrameSandbox`（Hosted 六件不可信档，无 same-origin）。
 * microStudio 是未修改的第三方整站，**绝不许** allow-same-origin。
 * 凭据零进 iframe：源码只走 postMessage init / recovery-snapshot。
 * postMessage 两端都校验 origin，targetOrigin 绝不是 `"*"`。
 */
import { useCallback, useEffect, useRef, type RefObject } from "react";
import {
  EDITOR_PROTOCOL,
  acceptEditorFrameMessage,
  asHostToEditorMessage,
  isValidEditorTargetOrigin,
} from "../editor-protocol";
import { embedEditorFrameSandbox } from "../editor-sandbox-origin";
import {
  GAME_IDE_HOSTED_EMBED_ORIGIN,
  gameIdeHostedEmbedBase,
  readGameIdeExport,
  type GameIdeImportEnvelope,
} from "./game-microstudio-embed";

export function GameHostedFrame({
  instanceId,
  hostOrigin,
  src,
  title,
  iframeRef,
  onReady,
  onExport,
  onError,
}: {
  instanceId: string;
  hostOrigin: string;
  src: string;
  title: string;
  iframeRef?: RefObject<HTMLIFrameElement | null>;
  onReady: () => void;
  onExport: (source: string) => void;
  onError: (message: string) => void;
}) {
  const innerRef = useRef<HTMLIFrameElement>(null);
  const iframe = iframeRef ?? innerRef;
  const embedBase = gameIdeHostedEmbedBase();
  const sandbox = embedEditorFrameSandbox(embedBase);

  const send = useCallback(
    (data: Record<string, unknown>) => {
      const frame = iframe.current?.contentWindow;
      if (!frame) return false;
      if (!isValidEditorTargetOrigin(GAME_IDE_HOSTED_EMBED_ORIGIN)) return false;
      const checked = asHostToEditorMessage(data, instanceId);
      if (!checked) return false;
      frame.postMessage(checked, GAME_IDE_HOSTED_EMBED_ORIGIN);
      return true;
    },
    [iframe, instanceId],
  );

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const accepted = acceptEditorFrameMessage(event, {
        expectedOrigin: GAME_IDE_HOSTED_EMBED_ORIGIN,
        frameWindow: iframe.current?.contentWindow,
        instanceId,
      });
      if (!accepted) return;
      if (accepted.type === "ready") {
        onReady();
        return;
      }
      if (accepted.type === "recovery-snapshot") {
        const read = readGameIdeExport(
          accepted as unknown as Record<string, unknown>,
          instanceId,
        );
        if (read.ok) onExport(read.source);
        else onError(read.reason);
        return;
      }
      if (accepted.type === "error") {
        onError(String(accepted.message || "游戏内核报错"));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [iframe, instanceId, onError, onExport, onReady]);

  void send;
  void hostOrigin;

  return (
    <iframe
      ref={iframe}
      title={title}
      src={src}
      sandbox={sandbox}
      referrerPolicy="no-referrer"
      data-testid="game-hosted-frame"
      className="h-full min-h-[280px] w-full border-0"
    />
  );
}

export function postGameIdeImport(
  frame: Window | null,
  instanceId: string,
  envelope: GameIdeImportEnvelope,
): boolean {
  if (!frame || !isValidEditorTargetOrigin(GAME_IDE_HOSTED_EMBED_ORIGIN)) {
    return false;
  }
  const checked = asHostToEditorMessage(envelope, instanceId);
  if (!checked) return false;
  frame.postMessage(checked, GAME_IDE_HOSTED_EMBED_ORIGIN);
  return true;
}

export function postGameIdeExportRequest(
  frame: Window | null,
  instanceId: string,
  recoveryId: string,
): boolean {
  if (!frame || !isValidEditorTargetOrigin(GAME_IDE_HOSTED_EMBED_ORIGIN)) {
    return false;
  }
  const envelope = {
    protocol: EDITOR_PROTOCOL,
    type: "recovery-capture",
    instanceId,
    recoveryId,
  };
  const checked = asHostToEditorMessage(envelope, instanceId);
  if (!checked) return false;
  frame.postMessage(checked, GAME_IDE_HOSTED_EMBED_ORIGIN);
  return true;
}
