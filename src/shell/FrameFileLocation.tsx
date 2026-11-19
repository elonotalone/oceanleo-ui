"use client";

import { useState } from "react";
import type { AgentAttachment } from "../lib/agent";
import { accessToken } from "../lib/auth/client";
import { GATEWAY_BASE } from "../lib/auth/config";
import { isTaskContentId } from "../lib/task-content-path";
import { useUI } from "../i18n/ui/useUI";

export type FrameFileLocationValue = { path: string; line?: number; taskId?: string; __oceanleoFrameRow?: number };

export function FrameFileLocation({ location, onOpenAttachment }: {
  location: FrameFileLocationValue;
  onOpenAttachment?: (attachment: AgentAttachment) => void | Promise<boolean>;
}) {
  const tt = useUI();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const label = typeof location.line === "number" ? `${location.path}:${location.line}` : location.path;
  if (!isTaskContentId(location.taskId) || !Number.isSafeInteger(location.__oceanleoFrameRow) || !onOpenAttachment) return <>{label}</>;
  const open = async () => {
    if (busy) return;
    setBusy(true); setError(false);
    try {
      const token = await accessToken();
      if (!token) throw new Error("unauthorized");
      const response = await fetch(`${GATEWAY_BASE}/v1/tasks/${location.taskId}/frames/${location.__oceanleoFrameRow}/file-preview`, {
        method: "POST", credentials: "include", cache: "no-store", redirect: "error",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ path: location.path }),
      });
      if (!response.ok) throw new Error("file preview failed");
      const result = await response.json();
      if (!isTaskContentId(result.artifact_id) || !isTaskContentId(result.revision_id)) throw new Error("invalid Library receipt");
      if (await onOpenAttachment({ url: "", name: result.title, mime: result.media_type,
        artifact_id: result.artifact_id, revision_id: result.revision_id }) === false) throw new Error("preview unavailable");
    } catch { setError(true); }
    finally { setBusy(false); }
  };
  return <><button type="button" className="text-left underline decoration-stone-300 underline-offset-2 hover:text-stone-600 disabled:opacity-50"
    data-agent-file-location="" onClick={() => void open()} disabled={busy} aria-busy={busy}>{label}</button>
    {error && <span role="alert" className="ml-2 text-rose-600">{tt("无法读取文件，请重试。")}</span>}</>;
}
