"use client";

/**
 * 专业模式：AudioMass iframe。只在 L0 `set-mode: pro` 之后挂上。
 * 沙箱走 W01 的 `embedEditorFrameSandbox`（Hosted 六件不可信档，无 same-origin）。
 * 凭据零进 iframe：音频只走 postMessage init / recovery-snapshot。
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
  buildSetModeMessage,
  type EditorMode,
} from "../hosted-editor/index";
import {
  AUDIO_HOSTED_EMBED_ORIGIN,
  buildAudioEmbedUrl,
  buildAudioInitEnvelope,
  canBuildAudioEmbedUrl,
  audioHostedEmbedBase,
} from "./audio-hosted-embed";

export function AudioHostedFrame({
  instanceId,
  hostOrigin,
  src,
  title,
  iframeRef,
  onReady,
  onSnapshot,
  onError,
}: {
  instanceId: string;
  hostOrigin: string;
  src: string;
  title: string;
  iframeRef?: RefObject<HTMLIFrameElement | null>;
  onReady: () => void;
  onSnapshot: (payload: { audioBase64?: string; mime?: string; revision?: number }) => void;
  onError: (message: string) => void;
}) {
  const innerRef = useRef<HTMLIFrameElement>(null);
  const iframe = iframeRef ?? innerRef;
  const embedBase = audioHostedEmbedBase();
  const sandbox = embedEditorFrameSandbox(embedBase);

  const send = useCallback(
    (data: Record<string, unknown>) => {
      const frame = iframe.current?.contentWindow;
      if (!frame) return false;
      if (!isValidEditorTargetOrigin(AUDIO_HOSTED_EMBED_ORIGIN)) return false;
      const checked = asHostToEditorMessage(data, instanceId);
      if (!checked) return false;
      frame.postMessage(checked, AUDIO_HOSTED_EMBED_ORIGIN);
      return true;
    },
    [iframe, instanceId],
  );

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const accepted = acceptEditorFrameMessage(event, {
        expectedOrigin: AUDIO_HOSTED_EMBED_ORIGIN,
        frameWindow: iframe.current?.contentWindow,
        instanceId,
      });
      if (!accepted) return;
      if (accepted.type === "ready") {
        onReady();
        return;
      }
      if (accepted.type === "recovery-snapshot") {
        const snapshot = accepted.ok ? accepted.snapshot : null;
        const payload =
          snapshot && typeof snapshot.payload === "object" && snapshot.payload
            ? (snapshot.payload as Record<string, unknown>)
            : null;
        onSnapshot({
          audioBase64:
            typeof payload?.audioBase64 === "string" ? payload.audioBase64 : "",
          mime: typeof payload?.mime === "string" ? payload.mime : "audio/wav",
          revision:
            typeof snapshot?.revision === "number" ? snapshot.revision : 0,
        });
        return;
      }
      if (accepted.type === "error") {
        onError(String(accepted.message || "音频内核报错"));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [iframe, instanceId, onError, onReady, onSnapshot]);

  void send;
  void hostOrigin;

  return (
    <iframe
      ref={iframe}
      title={title}
      src={src}
      sandbox={sandbox}
      referrerPolicy="no-referrer"
      data-testid="audio-hosted-frame"
      className="h-full min-h-[280px] w-full border-0"
    />
  );
}

export function postAudioInit(
  frame: Window | null,
  instanceId: string,
  envelope: ReturnType<typeof buildAudioInitEnvelope>,
): boolean {
  if (!frame || !isValidEditorTargetOrigin(AUDIO_HOSTED_EMBED_ORIGIN)) {
    return false;
  }
  const checked = asHostToEditorMessage(envelope, instanceId);
  if (!checked) return false;
  frame.postMessage(checked, AUDIO_HOSTED_EMBED_ORIGIN);
  return true;
}

export function postAudioSetMode(
  frame: Window | null,
  instanceId: string,
  mode: EditorMode,
): boolean {
  if (!frame) return false;
  const message = buildSetModeMessage(instanceId, mode);
  frame.postMessage(message, AUDIO_HOSTED_EMBED_ORIGIN);
  return true;
}

export function postAudioSaveRequest(
  frame: Window | null,
  instanceId: string,
  saveId: string,
): boolean {
  if (!frame) return false;
  const envelope = {
    protocol: EDITOR_PROTOCOL,
    type: "save-request",
    instanceId,
    saveId,
  };
  const checked = asHostToEditorMessage(envelope, instanceId);
  if (!checked) return false;
  frame.postMessage(checked, AUDIO_HOSTED_EMBED_ORIGIN);
  return true;
}

export { canBuildAudioEmbedUrl, buildAudioEmbedUrl };
