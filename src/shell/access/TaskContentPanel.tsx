"use client";

import { useEffect, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { taskContentClient, type TaskContentClient, type TaskInlineArtifact } from "./task-content-client";

export interface TaskContentPanelProps {
  taskId: string;
  /** Changes on identity/role/removal-marker transitions to discard old reads. */
  accessKey?: string;
  client?: TaskContentClient;
}

/** Shared inline output is escaped text; arbitrary artifact URLs are never followed. */
export function TaskContentPanel({ taskId, accessKey = "", client = taskContentClient }: TaskContentPanelProps) {
  const tt = useUI();
  const key = `${taskId}:${accessKey}`;
  const [snapshot, setSnapshot] = useState<{ key: string; items: TaskInlineArtifact[] } | null>(null);
  const [failedKey, setFailedKey] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    setSnapshot(null);
    setFailedKey("");
    const refresh = async () => {
      if (inFlight || controller.signal.aborted) return;
      inFlight = true;
      try {
        const items = await client.artifacts(taskId, controller.signal);
        if (!controller.signal.aborted) { setSnapshot({ key, items }); setFailedKey(""); }
      } catch {
        if (!controller.signal.aborted) { setSnapshot(null); setFailedKey(key); }
      } finally { inFlight = false; }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [taskId, accessKey, key, client, version]);
  if (failedKey === key) return <div role="alert" className="space-y-2 p-3 text-sm text-[var(--fg)]">
    <p>{tt("无法读取文件，请重试。")}</p>
    <button type="button" onClick={() => setVersion(value => value + 1)} className="underline">{tt("重试")}</button>
  </div>;
  if (snapshot?.key !== key || !snapshot.items.length) return null;
  return <section data-task-content-panel className="min-w-0 space-y-2 p-3 text-[var(--fg)]" aria-label={tt("产出")}>
    {snapshot.items.map(item => <details key={item.id} className="rounded-lg border border-neutral-200/80 dark:border-white/10 bg-[var(--card)] p-3">
      <summary className="cursor-pointer break-words text-sm font-medium">{item.title || tt("产出")}</summary>
      <pre className="mt-3 max-h-[60dvh] overflow-auto whitespace-pre-wrap break-words text-sm leading-relaxed">{item.content}</pre>
    </details>)}
  </section>;
}
