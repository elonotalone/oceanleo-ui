"use client";

import { useEffect, useState } from "react";
import { websiteFileText, websitePlatformApi, type WebsiteProjectFile } from "../../lib/website-platform-api";
import { useUI } from "../../i18n/ui/useUI";

/** Read files from the code website; no source mutation or editor is registered. */
export function WebsiteCodeSourceViewer({ projectId }: { projectId: string }) {
  const tt = useUI();
  const [retry, setRetry] = useState(0);
  const [chosen, setChosen] = useState("");
  const [listing, setListing] = useState<{ projectId: string; files?: WebsiteProjectFile[]; error?: string } | null>(null);
  const [file, setFile] = useState<{ key: string; text?: string; binary?: boolean; error?: string } | null>(null);
  const current = listing?.projectId === projectId ? listing : null;
  const path = current?.files?.some(entry => entry.path === chosen) ? chosen : current?.files?.[0]?.path || "";
  const key = `${projectId}:${path}:${retry}`;
  const loaded = file?.key === key ? file : null;
  useEffect(() => {
    const abort = new AbortController();
    void websitePlatformApi.files(projectId, undefined, abort.signal).then(result => {
      if (!abort.signal.aborted) setListing({ projectId, files: result.files });
    }).catch(error => {
      if (!abort.signal.aborted) setListing({ projectId, error: String(error instanceof Error ? error.message : error) });
    });
    return () => abort.abort();
  }, [projectId, retry]);
  useEffect(() => {
    if (!path) return;
    const abort = new AbortController();
    void websitePlatformApi.file(projectId, path, undefined, abort.signal).then(result => {
      if (!abort.signal.aborted) setFile({ key, ...websiteFileText(result) });
    }).catch(error => {
      if (!abort.signal.aborted) setFile({ key, error: String(error instanceof Error ? error.message : error) });
    });
    return () => abort.abort();
  }, [projectId, path, key]);
  const error = current?.error || loaded?.error;
  return <div className="grid gap-3 p-4" data-testid="website-code-source-view">
    {error ? <div role="alert">{error}<button type="button" onClick={() => setRetry(value => value + 1)}>{tt("重试")}</button></div>
      : !current ? <p role="status">{tt("加载中…")}</p>
      : !current.files?.length ? <p>{tt("暂无文件")}</p>
      : <><select aria-label={tt("源文件")} value={path} onChange={event => setChosen(event.target.value)}>
        {current.files.map(entry => <option key={entry.path} value={entry.path}>{entry.path}</option>)}
      </select>
      {!loaded ? <p role="status">{tt("加载中…")}</p> : loaded.binary ? <p>{tt("二进制文件无法显示为文本。")}</p>
        : <pre className="overflow-auto whitespace-pre-wrap text-xs"><code>{loaded.text}</code></pre>}</>}
  </div>;
}
