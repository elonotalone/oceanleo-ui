"use client";

/**
 * 专业模式：three.js editor iframe。只在 L0 `set-mode: pro` 之后挂上。
 * 沙箱走 W01 的 `embedEditorFrameSandbox`（Hosted 六件不可信档，无 same-origin）。
 * 凭据零进 iframe：glTF 只走 postMessage init / recovery-snapshot。
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
  MODEL3D_HOSTED_EMBED_ORIGIN,
  buildModel3DEmbedUrl,
  buildModel3DInitEnvelope,
  canBuildModel3DEmbedUrl,
  model3dHostedEmbedBase,
} from "./model3d-hosted-embed";

export function Model3DHostedFrame({
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
  onSnapshot: (payload: {
    gltfBase64?: string;
    revision?: number;
    recoveryId?: string;
    ok?: boolean;
  }) => void;
  onError: (message: string) => void;
}) {
  const innerRef = useRef<HTMLIFrameElement>(null);
  const iframe = iframeRef ?? innerRef;
  const embedBase = model3dHostedEmbedBase();
  const sandbox = embedEditorFrameSandbox(embedBase);

  const send = useCallback(
    (data: Record<string, unknown>) => {
      const frame = iframe.current?.contentWindow;
      if (!frame) return false;
      if (!isValidEditorTargetOrigin(MODEL3D_HOSTED_EMBED_ORIGIN)) return false;
      const checked = asHostToEditorMessage(data, instanceId);
      if (!checked) return false;
      frame.postMessage(checked, MODEL3D_HOSTED_EMBED_ORIGIN);
      return true;
    },
    [instanceId],
  );

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const accepted = acceptEditorFrameMessage(event, {
        expectedOrigin: MODEL3D_HOSTED_EMBED_ORIGIN,
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
          gltfBase64:
            typeof payload?.gltfBase64 === "string" ? payload.gltfBase64 : "",
          revision:
            typeof snapshot?.revision === "number" ? snapshot.revision : 0,
          recoveryId: accepted.recoveryId,
          ok: accepted.ok,
        });
        return;
      }
      if (accepted.type === "error") {
        onError(String(accepted.message || "3D 内核报错"));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [instanceId, onError, onReady, onSnapshot]);

  void send;
  void hostOrigin;

  return (
    <iframe
      ref={iframe}
      title={title}
      src={src}
      sandbox={sandbox}
      referrerPolicy="no-referrer"
      data-testid="model3d-hosted-frame"
      className="h-full min-h-[280px] w-full border-0"
    />
  );
}

export function postModel3DInit(
  frame: Window | null,
  instanceId: string,
  envelope: ReturnType<typeof buildModel3DInitEnvelope>,
): boolean {
  if (!frame || !isValidEditorTargetOrigin(MODEL3D_HOSTED_EMBED_ORIGIN)) {
    return false;
  }
  const checked = asHostToEditorMessage(envelope, instanceId);
  if (!checked) return false;
  frame.postMessage(checked, MODEL3D_HOSTED_EMBED_ORIGIN);
  return true;
}

export function postModel3DSetMode(
  frame: Window | null,
  instanceId: string,
  mode: EditorMode,
): boolean {
  if (!frame || !isValidEditorTargetOrigin(MODEL3D_HOSTED_EMBED_ORIGIN)) {
    return false;
  }
  const message = buildSetModeMessage(instanceId, mode);
  const checked = asHostToEditorMessage(message, instanceId);
  if (!checked) return false;
  frame.postMessage(checked, MODEL3D_HOSTED_EMBED_ORIGIN);
  return true;
}

export function postModel3DRecoveryCapture(
  frame: Window | null,
  instanceId: string,
  recoveryId: string,
): boolean {
  if (!frame || !isValidEditorTargetOrigin(MODEL3D_HOSTED_EMBED_ORIGIN)) {
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
  frame.postMessage(checked, MODEL3D_HOSTED_EMBED_ORIGIN);
  return true;
}

export function postModel3DSaveRequest(
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
  frame.postMessage(checked, MODEL3D_HOSTED_EMBED_ORIGIN);
  return true;
}

export { canBuildModel3DEmbedUrl, buildModel3DEmbedUrl };
