"use client";
import {useEffect, useRef, useState} from "react";
import {useUI} from "../i18n/ui/useUI";
import {localAgentCanControl, localAgentStateText, type LocalAgentControl, type LocalAgentRun, type LocalTaskArtifact} from "../lib/local-agent-task";

export function LocalAgentTaskStatus({run, artifacts, busy, readOnly, onControl}: {
  run: LocalAgentRun | null; artifacts: LocalTaskArtifact[]; busy: boolean; readOnly: boolean; onControl: (action: LocalAgentControl) => void;
}) {
  const tt = useUI();
  return <section data-local-agent-state={run?.state || "unknown"} className="shrink-0 border-b border-stone-200 bg-stone-50 px-4 py-3 text-sm">
    <p role="status">{tt(localAgentStateText(run))}</p>
    <p className="mt-1 text-xs text-stone-500">{tt("由所选电脑的本地 AI 执行。关闭此页面不会停止任务；权限确认仍在电脑端完成。")}</p>
    {!readOnly && <div className="mt-2 flex flex-wrap gap-2">
      {(["pause", "resume", "stop"] as const).filter(action => localAgentCanControl(run, action)).map(action =>
        <button key={action} type="button" disabled={busy} onClick={() => onControl(action)}
          className="rounded border border-stone-300 bg-white px-3 py-1 disabled:opacity-50">
          {tt(action === "pause" ? "暂停电脑任务" : action === "resume" ? "让 AI 重新观察并继续" : "停止电脑任务")}
        </button>)}
    </div>}
    {artifacts.length > 0 && <ul className="mt-2 space-y-1">{artifacts.map(artifact =>
      <LocalTaskArtifactDownload key={`${artifact.artifactId}:${artifact.revisionId}`} artifact={artifact} />)}</ul>}
  </section>;
}

function LocalTaskArtifactDownload({artifact}: {artifact: LocalTaskArtifact}) {
  const tt = useUI();
  const abort = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => () => abort.current?.abort(), []);
  const download = async () => {
    if (abort.current) return;
    const request = new AbortController();
    abort.current = request;
    setBusy(true); setError("");
    try {
      const {getArtifactItem, getArtifactDownload} = await import("./artifact-client");
      const item = await getArtifactItem(artifact.artifactId, artifact.revisionId, request.signal);
      if (!item.ok || !item.data || request.signal.aborted) throw new Error("unavailable");
      const result = await getArtifactDownload(item.data, request.signal);
      if (!result.ok || !result.data || result.data.artifactId !== artifact.artifactId ||
          result.data.revisionId !== artifact.revisionId || request.signal.aborted) throw new Error("unavailable");
      // Use the canonical private, expiring download grant, never a model URL.
      const link = document.createElement("a");
      link.href = result.data.url;
      link.download = result.data.filename;
      link.type = result.data.mediaType;
      link.rel = "noopener noreferrer";
      link.referrerPolicy = "no-referrer";
      document.body.append(link); link.click(); link.remove();
    } catch {
      if (!request.signal.aborted) setError(tt("无法下载此任务文件，请到我的库核对权限后重试。"));
    } finally {
      if (!request.signal.aborted) { setBusy(false); abort.current = null; }
    }
  };
  return <li data-local-task-artifact={artifact.artifactId} className="flex flex-wrap items-center gap-2">
    <span className="min-w-0 break-all">{artifact.title || tt("任务文件")}</span>
    <button type="button" onClick={() => void download()} disabled={busy} className="rounded border px-2 py-1 disabled:opacity-50">{tt(busy ? "处理中…" : "下载")}</button>
    {error && <span role="alert" className="text-rose-600">{error}</span>}
  </li>;
}
