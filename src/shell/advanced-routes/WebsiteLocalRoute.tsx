"use client";

import { useEffect, useMemo, useState } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { EditorSourceFailurePanel } from "../doc-editors/EditorSourceFailurePanel";
import { hydrateWebsiteLocalSource, planWebsiteLocalSource } from "../website-local/website-local-source";
import { fetchMediaBlob } from "../../lib/media-proxy";
import { refreshArtifactRendition } from "../artifact-client";
import { WebsiteMaterialViewer } from "../website-local/WebsiteMaterialViewer";
import { WebsiteMaterialRuntimePreview } from "../website-local/WebsiteMaterialRuntimePreview";
import { websiteCodeProjectFromText } from "../website-platform/website-code-project";
import { WebsiteCodeSourceViewer } from "../website-local/WebsiteCodeSourceViewer";
import { WebsiteArtifactViewer } from "../WebsiteArtifactViewer";
import { useUI } from "../../i18n/ui/useUI";

/** File-based websites show their own preview and source; changes go through the agent. */
export function WebsiteLocalRoute({ item, taskId, siteId = "", accent = "#1F6FEB", onClose }: AdvancedContentWorkbenchProps) {
  const tt = useUI();
  const [retry, setRetry] = useState(0);
  const identity = `${item?.key || item?.id || ""}:${item?.artifactId || ""}:${item?.revisionId || ""}:${retry}`;
  // Stable revision identity prevents locale/host rerenders from reloading the source.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plan = useMemo(() => planWebsiteLocalSource(item || {}), [identity]);
  const [result, setResult] = useState<{ identity: string; text?: string; error?: string } | null>(null);
  const current = result?.identity === identity ? result : null;
  useEffect(() => {
    const abort = new AbortController();
    const artifactId = String(item?.artifactId || "");
    const revisionId = String(item?.revisionId || item?.artifact?.revisionId || "");
    void hydrateWebsiteLocalSource(plan, async url => {
      const blob = await fetchMediaBlob(url, { cache: "no-store", maxBytes: 20_000_000, signal: abort.signal });
      return blob.text();
    }, {
      signal: abort.signal,
      refreshUrl: artifactId && revisionId ? async () => {
        const refreshed = await refreshArtifactRendition({ artifactId, revisionId }, "source", abort.signal);
        return refreshed.ok ? refreshed.data?.url || null : null;
      } : undefined,
    }).then(loaded => {
      if (!abort.signal.aborted) setResult(loaded.ok ? { identity, text: loaded.source } : { identity, error: loaded.error });
    });
    return () => abort.abort();
    // Item identity pins loading; translations happen during render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, plan]);

  if (!item) return <div>{tt("没有打开的网站工程。")}</div>;
  const code = websiteCodeProjectFromText(current?.text || "");
  const stage = current?.error ? <EditorSourceFailurePanel message={tt(current.error)} onReload={() => setRetry(value => value + 1)} variant="surface" />
    : current?.text === undefined ? <div role="status" data-testid="website-remote-loading">{tt("正在读取远程网站工程。")}</div>
    : <WebsiteMaterialViewer key={identity} sourceText={current.text}
      source={code ? <WebsiteCodeSourceViewer projectId={code.projectId} /> : undefined}
      preview={code ? <WebsiteMaterialRuntimePreview key={code.projectId} projectId={code.projectId} /> : <WebsiteArtifactViewer item={item} />} />;
  return <AdvancedWorkbenchShell item={item} taskId={taskId} siteId={siteId} accent={accent} onClose={onClose}
    adapter={{ id: "website", label: tt("网站"), pages: { activePageId: "artifact", aux: [] }, stage }} />;
}
