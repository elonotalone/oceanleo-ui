"use client";

/**
 * 专业模式：Langflow iframe。只在 L0 `set-mode: pro` 之后由舞台挂上。
 * 沙箱走 W01 的 `embedEditorFrameSandbox`（Hosted 六件不可信档，无 same-origin）。
 * 凭据零进 iframe：流程只走 postMessage init / recovery-snapshot。
 */
import { useCallback, useEffect, useRef, type RefObject } from "react";
import {
  EDITOR_PROTOCOL,
  acceptEditorFrameMessage,
  asHostToEditorMessage,
  isValidEditorTargetOrigin,
} from "../editor-protocol";
import {
  buildSetModeMessage,
  type EditorMode,
} from "../hosted-editor/index";
import {
  WORKFLOW_LANGFLOW_EMBED_ORIGIN,
  workflowLangflowEmbedBase,
  workflowLangflowFrameSandbox,
} from "./langflow-embed";
import type { LangflowFlow } from "./langflow-flow-json";

export function LangflowHostedFrame({
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
    flow?: LangflowFlow | null;
    revision?: number;
    recoveryId?: string;
    ok?: boolean;
  }) => void;
  onError: (message: string) => void;
}) {
  const innerRef = useRef<HTMLIFrameElement>(null);
  const iframe = iframeRef ?? innerRef;
  const embedBase = workflowLangflowEmbedBase();
  const sandbox = workflowLangflowFrameSandbox(embedBase);

  const send = useCallback(
    (data: Record<string, unknown>) => {
      const frame = iframe.current?.contentWindow;
      if (!frame) return false;
      if (!isValidEditorTargetOrigin(WORKFLOW_LANGFLOW_EMBED_ORIGIN)) return false;
      const checked = asHostToEditorMessage(data, instanceId);
      if (!checked) return false;
      frame.postMessage(checked, WORKFLOW_LANGFLOW_EMBED_ORIGIN);
      return true;
    },
    [iframe, instanceId],
  );

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const accepted = acceptEditorFrameMessage(event, {
        expectedOrigin: WORKFLOW_LANGFLOW_EMBED_ORIGIN,
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
        const flow =
          payload?.flow && typeof payload.flow === "object"
            ? (payload.flow as LangflowFlow)
            : null;
        onSnapshot({
          flow,
          revision:
            typeof snapshot?.revision === "number" ? snapshot.revision : 0,
          recoveryId: accepted.recoveryId,
          ok: accepted.ok,
        });
        return;
      }
      if (accepted.type === "error") {
        onError(String(accepted.message || "工作流内核报错"));
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
      data-testid="workflow-langflow-frame"
      className="h-full min-h-[280px] w-full border-0"
    />
  );
}

export function postWorkflowInit(
  frame: Window | null,
  instanceId: string,
  envelope: Record<string, unknown>,
): boolean {
  if (!frame || !isValidEditorTargetOrigin(WORKFLOW_LANGFLOW_EMBED_ORIGIN)) {
    return false;
  }
  const checked = asHostToEditorMessage(envelope, instanceId);
  if (!checked) return false;
  frame.postMessage(checked, WORKFLOW_LANGFLOW_EMBED_ORIGIN);
  return true;
}

export function postWorkflowSetMode(
  frame: Window | null,
  instanceId: string,
  mode: EditorMode,
): boolean {
  if (!frame || !isValidEditorTargetOrigin(WORKFLOW_LANGFLOW_EMBED_ORIGIN)) {
    return false;
  }
  const message = buildSetModeMessage(instanceId, mode);
  const checked = asHostToEditorMessage(message, instanceId);
  if (!checked) return false;
  frame.postMessage(checked, WORKFLOW_LANGFLOW_EMBED_ORIGIN);
  return true;
}

export function postWorkflowSaveRequest(
  frame: Window | null,
  instanceId: string,
  saveId: string,
): boolean {
  if (!frame || !isValidEditorTargetOrigin(WORKFLOW_LANGFLOW_EMBED_ORIGIN)) {
    return false;
  }
  const envelope = {
    protocol: EDITOR_PROTOCOL,
    type: "save-request",
    instanceId,
    saveId,
  };
  const checked = asHostToEditorMessage(envelope, instanceId);
  if (!checked) return false;
  frame.postMessage(checked, WORKFLOW_LANGFLOW_EMBED_ORIGIN);
  return true;
}
