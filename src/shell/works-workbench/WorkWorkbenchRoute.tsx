"use client";

import { useEffect, useRef, useState } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { forkArtifact, getArtifactWebsitePreview } from "../artifact-client";
import { isDurableLibraryItem, type LibraryItem } from "../library-data";
import { worksApi } from "../../lib/works-api";
import type { Work } from "../works/model";
import { WorkWorkbench } from "./WorkWorkbench";
import { useWebsiteUI } from "../website-platform/website-preview-i18n";

/** Library artifacts join the same workbench as projects and server folders. */
export function WorkWorkbenchRoute({ item, taskId, siteId = "", accent, onClose, onSavedItem }: AdvancedContentWorkbenchProps) {
  const tt = useWebsiteUI();
  const [copy, setCopy] = useState<{ from: string; item: LibraryItem } | null>(null);
  const itemIdentity = item.artifactId || item.key;
  const currentItem = copy?.from === itemIdentity ? copy.item : item;
  const artifactId = currentItem.artifactId || currentItem.artifact?.artifactId || "";
  const revisionId = currentItem.revisionId || currentItem.artifact?.revisionId;
  const identity = `${artifactId}:${revisionId || ""}`;
  const active = useRef(true);
  const currentIdentity = useRef(identity); currentIdentity.current = identity;
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [result, setResult] = useState<{ identity: string; work?: Work; error?: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const [forking, setForking] = useState(false);
  const [forkError, setForkError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const started = Date.now();
    setResult(null);
    const publicPreview = async (work: Work) => {
      // C7 can omit a URL for a view grant. Reuse the existing read-only revision
      // preview resolver, rather than calling any owner runtime/preview action.
      const next = await getArtifactWebsitePreview(currentItem, abort.signal);
      if (abort.signal.aborted) return;
      if (next.ok && next.data?.status === "starting" && Date.now() - started < 90000) {
        timer = setTimeout(() => void publicPreview(work).catch(failed), 1500); return;
      }
      if (!next.ok || next.data?.status !== "ready" || !next.data.url) { failed(); return; }
      setResult({ identity, work: { ...work, play_url: next.data.url } });
      if (next.data.expiresAt) timer = setTimeout(() => void publicPreview(work).catch(failed), Math.max(1000, Date.parse(next.data.expiresAt) - Date.now() - 5000));
    };
    const failed = () => { if (!abort.signal.aborted) setResult({ identity, error: "暂时无法打开作品，请重试。" }); };
    if (!artifactId) setResult({ identity, error: "这个条目没有可打开的作品。" });
    else void worksApi.open(artifactId, revisionId, abort.signal).then(async work => {
      if (abort.signal.aborted) return;
      if (work.access === "view" && !work.play_url && !work.preview?.url) await publicPreview(work);
      else setResult({ identity, work });
    }).catch(failed);
    return () => { abort.abort(); clearTimeout(timer); };
  }, [artifactId, revisionId, identity, retry]);
  const current = result?.identity === identity ? result : null;
  const work = current?.work;
  const canFork = isDurableLibraryItem(currentItem) && currentItem.artifact.access.canFork;
  const createCopy = async () => {
    if (forking || !canFork) return;
    setForking(true); setForkError("");
    try {
      const result = await forkArtifact(currentItem);
      if (!active.current || currentIdentity.current !== identity) return;
      if (!result.ok || !result.data) throw new Error(result.error || tt("副本创建失败，请重试。"));
      setCopy({ from: itemIdentity, item: result.data }); onSavedItem?.(result.data);
    } catch { if (active.current && currentIdentity.current === identity) setForkError(tt("副本创建失败，请重试。")); }
    finally { if (active.current && currentIdentity.current === identity) setForking(false); }
  };
  const stage = <div className="flex h-full min-h-0 flex-col" data-testid="work-workbench-route">
    {current?.error ? <p role="alert" className="p-4">{tt(current.error)} <button type="button" onClick={() => setRetry(value => value + 1)}>{tt("重试")}</button></p>
      : !work ? <p role="status" className="p-4">{tt("加载中…")}</p>
      : <>
        {work.access === "view" && <div className="flex shrink-0 flex-wrap items-center gap-3 border-b p-2 text-xs" data-testid="work-view-access">
          <span>{tt(canFork ? "只能预览；修改请先创建自己的副本。" : "只能预览，不能修改或创建副本。")}</span>
          {canFork && <button type="button" disabled={forking} onClick={() => void createCopy()}>{tt(forking ? "创建中…" : "创建副本")}</button>}
          {forkError && <span role="alert">{tt(forkError)}</span>}
        </div>}
        <div className="min-h-0 flex-1"><WorkWorkbench workId={work.id} initialWork={work} readOnly={work.access === "view"} /></div>
      </>}
  </div>;
  return <AdvancedWorkbenchShell item={currentItem} taskId={taskId} siteId={siteId} accent={accent} onClose={onClose}
    adapter={{ id: "none", label: tt("作品"), pages: { activePageId: "artifact", aux: [] }, stage }} />;
}
