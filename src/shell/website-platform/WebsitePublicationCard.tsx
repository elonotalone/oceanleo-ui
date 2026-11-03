"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WebsitePublicationError, websitePublicationApi, type WebsitePublication, type WebsitePublicationApi } from "../../api/website-publication";
import { useWebsiteUI } from "./website-preview-i18n";

const STATE_LABEL = { live: "在线", stopped: "已停止", not_published: "未发布" } as const;

const FAILURES = {
  changed: "发布状态已变化，已刷新，请确认后重试。", missing: "发布状态已变化，已刷新，请确认后重试。",
  unauthorized: "需要项目所有者权限。", busy: "这个网站的另一项操作还在进行，请稍后重试。",
  unavailable: "暂时无法确认网站状态，请稍后重试。", failed: "操作失败，请稍后重试。",
} as const;
const failureCopy = (caught: unknown) => FAILURES[caught instanceof WebsitePublicationError ? caught.code : "failed"];
const reloads = (caught: unknown) => caught instanceof WebsitePublicationError && (caught.code === "changed" || caught.code === "missing");

/** Owner control for the published site: stop a runtime publication, or take any publication offline. */
export function WebsitePublicationCard({ projectId, api = websitePublicationApi }: { projectId: string; api?: WebsitePublicationApi }) {
  const tt = useWebsiteUI();
  const [publication, setPublication] = useState<WebsitePublication | null>(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState<"stop" | "unpublish" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const generation = useRef(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    const mine = generation.current;
    try {
      const next = await api.get(projectId, signal);
      if (generation.current === mine && !signal?.aborted) { setPublication(next); setHidden(false); }
      return next;
    } catch (caught) {
      if (generation.current !== mine || signal?.aborted) return null;
      // A gateway without the publication route has nothing to control here.
      if (caught instanceof WebsitePublicationError && caught.code === "missing") setHidden(true);
      else setFailure("发布状态暂不可用。");
      return null;
    }
  }, [api, projectId]);

  useEffect(() => {
    generation.current += 1;
    setPublication(null); setHidden(false); setBusy(null); setConfirming(false); setMessage(""); setFailure("");
    const controller = new AbortController();
    void load(controller.signal);
    return () => { controller.abort(); generation.current += 1; };
  }, [load]);

  // Sessions still stopping after an operation: re-read a bounded number of times.
  const stopping = publication?.stoppingSessions ?? 0;
  useEffect(() => {
    if (!stopping || busy) return;
    const controller = new AbortController();
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const next = await load(controller.signal);
      if (controller.signal.aborted) return;
      if (next && !next.stoppingSessions) { setMessage("网站进程已停止。"); return; }
      if (++attempts < 12) timer = setTimeout(poll, 5000);
    };
    timer = setTimeout(poll, 5000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [stopping, busy, load]);

  const run = async (operation: "stop" | "unpublish") => {
    if (busy) return;
    const mine = generation.current;
    setBusy(operation); setConfirming(false); setMessage(""); setFailure("");
    try {
      const result = await (operation === "stop" ? api.stop(projectId) : api.unpublish(projectId));
      if (generation.current !== mine) return;
      setPublication(result);
      setMessage(!result.stopConfirmed ? "网站已下线，运行进程仍在停止中。"
        : operation === "stop" ? "网站已停止，重新发布会在同一地址恢复。" : "已取消发布，网站地址不再可访问。");
    } catch (caught) {
      if (generation.current !== mine) return;
      setFailure(failureCopy(caught));
      if (reloads(caught)) await load();
    } finally {
      if (generation.current === mine) setBusy(null);
    }
  };

  if (hidden || (!publication && !failure)) return null;
  const state = publication?.state;
  const canStop = state === "live" && publication?.kind === "runtime";
  const canUnpublish = state === "live" || state === "stopped";
  return <div className="mb-4 rounded border border-[var(--awb-border)] p-3" data-testid="website-publication">
    <strong>{tt("网站发布")} · {state ? tt(STATE_LABEL[state]) : tt("状态暂不可用")}</strong>
    {publication?.url && <p className="mt-2 break-all text-xs">
      <a href={publication.url} target="_blank" rel="noopener noreferrer" className="underline">{publication.url}</a></p>}
    {state === "stopped" && !message && <p className="mt-2 text-xs opacity-65">{tt("网站已停止，重新发布会在同一地址恢复。")}</p>}
    {message && <p role="status" className="mt-2 text-xs" data-testid="website-publication-status">{tt(message)}</p>}
    {failure && <p role="alert" className="mt-2 text-xs text-red-600">{tt(failure)}</p>}
    {(canStop || canUnpublish) && <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
      {canStop && !confirming && <button type="button" disabled={!!busy} className="underline" data-testid="website-publication-stop"
        onClick={() => void run("stop")}>{busy === "stop" ? tt("正在停止…") : tt("停止已发布网站")}</button>}
      {canUnpublish && !confirming && <button type="button" disabled={!!busy} className="underline" data-testid="website-publication-unpublish"
        onClick={() => setConfirming(true)}>{busy === "unpublish" ? tt("正在取消发布…") : tt("取消发布")}</button>}
      {confirming && <>
        <span>{tt("取消发布后网站地址将无法访问，发布记录会被清除。")}</span>
        <button type="button" className="underline text-red-600" data-testid="website-publication-unpublish-confirm"
          onClick={() => void run("unpublish")}>{tt("确认取消发布")}</button>
        <button type="button" className="underline" onClick={() => setConfirming(false)}>{tt("取消")}</button>
      </>}
    </div>}
  </div>;
}
