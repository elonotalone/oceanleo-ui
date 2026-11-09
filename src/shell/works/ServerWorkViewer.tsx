"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { webViewerFrameSandbox } from "../editor-sandbox-origin";
import { worksApi, WorksApiError } from "../../lib/works-api";
import type { ServerWork, WorkPreviewResult } from "./model";

const PREVIEW_TIMEOUT_MS = 90_000;
const POLL_MS = 2_000;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function ServerWorkViewer({ item, onRemoved }: { item: ServerWork; onRemoved?: () => void }) {
  const tt = useUI();
  const [state, setState] = useState<"idle" | "starting" | "ready" | "failed">("idle");
  const [stage, setStage] = useState("");
  const [url, setUrl] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [removeArmed, setRemoveArmed] = useState(false);
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  const preview = useCallback(async () => {
    setBusy(true); setState("starting"); setStage(""); setReason(""); setUrl("");
    const started = Date.now();
    try {
      let result: WorkPreviewResult;
      do {
        result = await worksApi.preview(item.id);
        if (!mounted.current) return;
        setStage(result.stage || "");
        if (result.status === "ready" && result.url) {
          setUrl(result.url); setState("ready"); return;
        }
        if (result.status === "failed") {
          setReason(result.reason && /offline|离线/i.test(result.reason) ? tt("电脑离线") : (result.reason || tt("预览启动失败"))); setState("failed"); return;
        }
        setState("starting");
        if (Date.now() - started >= PREVIEW_TIMEOUT_MS) {
          setReason(tt("预览启动超时，请稍后重试。")); setState("failed"); return;
        }
        await wait(POLL_MS);
      } while (mounted.current);
    } catch (error) {
      if (!mounted.current) return;
      const message = error instanceof WorksApiError && error.code === "computer_offline"
        ? tt("电脑离线")
        : error instanceof Error ? error.message : tt("预览启动失败");
      setReason(message); setState("failed");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [item.id, tt]);

  const stop = useCallback(async () => {
    setBusy(true);
    try { await worksApi.stop(item.id); setState("idle"); setUrl(""); setStage(""); }
    catch (error) { setReason(error instanceof Error ? error.message : tt("停止预览失败")); setState("failed"); }
    finally { if (mounted.current) setBusy(false); }
  }, [item.id, tt]);

  const remove = useCallback(async () => {
    if (!removeArmed) { setRemoveArmed(true); return; }
    setBusy(true);
    try {
      await worksApi.remove(item.id);
      window.dispatchEvent(new CustomEvent("oceanleo:artifact-library-change", { detail: { action: "remove-server-work", id: item.id } }));
      onRemoved?.();
    } catch (error) { setReason(error instanceof Error ? error.message : tt("移除失败，请重试。")); setState("failed"); }
    finally { if (mounted.current) setBusy(false); }
  }, [item.id, onRemoved, removeArmed, tt]);

  return (
    <section className="flex h-full min-h-[520px] flex-col bg-white" data-server-work-id={item.id}>
      <header className="border-b border-stone-200 px-5 py-4">
        <h2 className="text-base font-semibold text-stone-800">{item.title}</h2>
        <p className="mt-1 text-xs text-stone-500">{item.home.computer_name} · {item.home.path}</p>
      </header>
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-100 px-5 py-3">
        <button type="button" disabled={busy} onClick={() => void preview()} className="rounded-lg bg-stone-800 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">{tt("打开预览")}</button>
        <button type="button" disabled={busy || state === "idle"} onClick={() => void stop()} className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs text-stone-600 disabled:opacity-50">{tt("停止")}</button>
        <button type="button" disabled={busy} onClick={() => void remove()} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 disabled:opacity-50">{removeArmed ? tt("确认从库中移除") : tt("从库中移除")}</button>
        {removeArmed && <span className="text-xs text-stone-500">{tt("只移除 Library 条目，服务器上的文件不会删除。")}</span>}
      </div>
      <div className="min-h-0 flex-1">
        {state === "starting" && <div role="status" className="grid h-full min-h-[360px] place-items-center p-6 text-sm text-stone-500">{tt("启动中")}{stage ? ` · ${stage}` : "…"}</div>}
        {state === "failed" && <div role="alert" className="grid h-full min-h-[360px] place-items-center p-6 text-center text-sm text-red-600">{reason || tt("预览启动失败")}</div>}
        {state === "ready" && url && <div className="flex h-full min-h-[360px] flex-col"><div className="flex justify-end px-4 py-2"><a href={url} target="_blank" rel="noreferrer" className="text-xs text-stone-500 underline">{tt("在新标签页打开")}</a></div><iframe src={url} title={item.title} className="min-h-0 flex-1 border-0" sandbox={webViewerFrameSandbox(false)} referrerPolicy="no-referrer" /></div>}
        {state === "idle" && <div className="grid h-full min-h-[360px] place-items-center p-6 text-sm text-stone-400">{tt("点击“打开预览”启动服务器预览")}</div>}
      </div>
    </section>
  );
}
