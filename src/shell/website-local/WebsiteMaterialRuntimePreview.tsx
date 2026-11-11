"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { websiteRuntimeApi, type WebsiteRuntime } from "../../api/website-runtime";
import { WebsitePreviewPicker } from "../website-platform/WebsitePreviewPicker";
import { previewReferenceUrl } from "../website-platform/website-preview-reference";
import { useUI } from "../../i18n/ui/useUI";

function PreviewDocument({ initialUrl, frame, title }: { initialUrl: string; frame: RefObject<HTMLIFrameElement | null>; title: string }) {
  const [url] = useState(initialUrl);
  // UC-1/UC-3: docs/architecture/oceanleo-untrusted-content-isolation.md.
  return <iframe ref={frame} src={url} title={title} className="h-full w-full border-0" referrerPolicy="no-referrer"
    sandbox="allow-forms allow-modals allow-popups allow-presentation allow-scripts" />;
}

/** User code is only painted in its isolated runtime, never in the host document. */
export function WebsiteMaterialRuntimePreview({ projectId }: { projectId: string }) {
  const tt = useUI();
  const frame = useRef<HTMLIFrameElement>(null);
  const [snapshot, setSnapshot] = useState<{ projectId: string; runtime?: WebsiteRuntime; error?: string } | null>(null);
  const [picking, setPicking] = useState(false);
  const [retry, setRetry] = useState(0);
  const current = snapshot?.projectId === projectId ? snapshot : null;
  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const runtime = await websiteRuntimeApi.get(projectId, abort.signal);
        if (!abort.signal.aborted) setSnapshot({ projectId, runtime });
      } catch (error) {
        if (!abort.signal.aborted) setSnapshot({ projectId, error: error instanceof Error ? error.message : String(error) });
      } finally {
        if (!abort.signal.aborted) timer = setTimeout(poll, 3000);
      }
    };
    void poll();
    return () => { abort.abort(); clearTimeout(timer); };
  }, [projectId, retry]);
  const runtime = current?.runtime;
  const url = isolatedWebsitePreviewUrl(runtime?.preview_url);
  if (current?.error) return <div role="alert" className="p-4">{current.error}<button type="button" onClick={() => setRetry(value => value + 1)}>{tt("重试")}</button></div>;
  if (runtime?.state !== "running" || !url) return <div role="status" className="p-4">
    {tt(!runtime ? "加载中…" : "预览暂不可用，请让 agent 启动或修复网站。")}
  </div>;
  return <div className="flex h-full min-h-0 flex-col" data-testid="website-material-runtime-preview">
    <div className="border-b p-2"><button type="button" aria-pressed={picking} onClick={() => setPicking(value => !value)}>{tt(picking ? "取消点选" : "点选元素")}</button></div>
    <div className="relative min-h-0 flex-1">
      {/* UC-1/UC-3: docs/architecture/oceanleo-untrusted-content-isolation.md.
          User code stays on oceanleo.app without scripted same-origin access. */}
      <PreviewDocument key={JSON.stringify([projectId, previewReferenceUrl(url), runtime.node_id, runtime.started_at])}
        initialUrl={url} frame={frame} title={tt("网站预览")} />
      {picking && <WebsitePreviewPicker projectId={projectId} url={previewReferenceUrl(url)} frame={frame} onClose={() => setPicking(false)} />}
    </div>
  </div>;
}

export function isolatedWebsitePreviewUrl(raw: string | null | undefined): string {
  try {
    const url = new URL(raw || "");
    return url.protocol === "https:" && url.hostname.endsWith(".oceanleo.app") && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}
