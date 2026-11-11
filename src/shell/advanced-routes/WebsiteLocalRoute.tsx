"use client";

import { useEffect, useMemo, useState } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { EditorSourceFailurePanel } from "../doc-editors/EditorSourceFailurePanel";
import type { WebsiteSource } from "../website-source-carrier/website-source-schema";
import { hydrateWebsiteLocalSource, planWebsiteLocalSource, websiteLocalSourceFromItem } from "./non-richdoc-source-gate";
import { fetchMediaBlob } from "../../lib/media-proxy";
import { refreshArtifactRendition } from "../artifact-client";
import { siteEnvelopeOf, type SiteEnvelope, type SiteDoc } from "../website-local/website-site-doc";
import { loadSiteDoc, SiteImageResolver } from "../website-local/website-site-load";
import { unwrapStoredEditorProject } from "./stored-editor-project";
import { WebsiteMaterialViewer, SiteDocumentPreview, StructuredWebsitePreview } from "../website-local/WebsiteMaterialViewer";
import { WebsiteMaterialRuntimePreview } from "../website-local/WebsiteMaterialRuntimePreview";
import { websiteCodeProjectFromText, type WebsiteCodeProject } from "../website-platform/website-code-project";
import { WebsiteCodeSourceViewer } from "../website-local/WebsiteCodeSourceViewer";
import { useUI } from "../../i18n/ui/useUI";

export function websiteSiteEnvelopeFromText(text: string): SiteEnvelope | null {
  try {
    const unwrapped = unwrapStoredEditorProject(text);
    return siteEnvelopeOf(typeof unwrapped === "string" ? unwrapped : JSON.stringify(unwrapped));
  } catch { return null; }
}

export { websiteLocalSourceFromItem, planWebsiteLocalSource, hydrateWebsiteLocalSource };

type LoadedWebsite = { text: string; source?: WebsiteSource; doc?: SiteDoc; images?: SiteImageResolver; code?: WebsiteCodeProject };

export function WebsiteLocalRoute({ item, taskId, siteId = "", accent = "#1F6FEB", onClose }: AdvancedContentWorkbenchProps) {
  const tt = useUI();
  const [retry, setRetry] = useState(0);
  const identity = `${item?.key || item?.id || ""}:${item?.artifactId || ""}:${item?.revisionId || ""}:${retry}`;
  // Stable item/revision identity prevents repeated loads as the host rerenders.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plan = useMemo(() => planWebsiteLocalSource(item || { title: "网站" }), [identity]);
  const [result, setResult] = useState<{ identity: string; loaded?: LoadedWebsite; error?: string } | null>(null);
  const current = result?.identity === identity ? result : null;

  useEffect(() => {
    const abort = new AbortController();
    let images: SiteImageResolver | undefined;
    const artifactId = String(item?.artifactId || "");
    const revisionId = String(item?.revisionId || item?.artifact?.revisionId || "");
    const revision = { artifactId, revisionId };
    let text = typeof item?.content === "string" ? item.content : "";
    if (!text && item?.meta?.websiteSource) text = JSON.stringify(item.meta.websiteSource, null, 2);
    const readAlternate = async (): Promise<LoadedWebsite | null> => {
      const code = websiteCodeProjectFromText(text);
      if (code) return { text, code };
      const envelope = websiteSiteEnvelopeFromText(text);
      if (!envelope) return null;
      if (envelope.kind === "bundle" && (!artifactId || !revisionId)) throw new Error(tt("网站源文件尚未关联。"));
      const doc = await loadSiteDoc(revision, envelope, abort.signal);
      images = new SiteImageResolver(artifactId && revisionId ? revision : null);
      return { text: JSON.stringify(doc, null, 2), doc, images };
    };
    const load = async () => {
      // Inline code manifests and site documents do not use the strict source schema.
      const inline = text ? await readAlternate() : null;
      if (inline) return inline;
      const hydrated = await hydrateWebsiteLocalSource(plan, async url => {
        const blob = await fetchMediaBlob(url, { cache: "no-store", maxBytes: 20_000_000, signal: abort.signal });
        text = await blob.text();
        return text;
      }, {
        signal: abort.signal,
        refreshUrl: artifactId && revisionId ? async () => {
          const refreshed = await refreshArtifactRendition(revision, "source", abort.signal);
          return refreshed.ok ? refreshed.data?.url || null : null;
        } : undefined,
      });
      if (hydrated.ok) return { text: text || JSON.stringify(hydrated.source, null, 2), source: hydrated.source };
      const alternate = text ? await readAlternate() : null;
      if (alternate) return alternate;
      throw new Error(hydrated.error);
    };
    void load().then(loaded => {
      if (!abort.signal.aborted) setResult({ identity, loaded });
    }).catch(error => {
      if (!abort.signal.aborted) setResult({ identity, error: error instanceof Error ? error.message : String(error) });
    });
    return () => { abort.abort(); };
    // item is pinned by identity; tt remains the current language's translator.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, plan, tt]);

  if (!item) return <div>{tt("没有打开的网站工程。")}</div>;
  const loaded = current?.loaded;
  const stage = current?.error ? <EditorSourceFailurePanel message={current.error} onReload={() => setRetry(value => value + 1)} variant="surface" />
    : !loaded ? <div role="status" data-testid="website-remote-loading">{tt("正在读取远程网站工程。")}</div>
    : <WebsiteMaterialViewer key={identity} sourceText={loaded.text} source={loaded.code ? <WebsiteCodeSourceViewer projectId={loaded.code.projectId} /> : undefined} preview={
      loaded.code ? <WebsiteMaterialRuntimePreview key={loaded.code.projectId} projectId={loaded.code.projectId} />
      : loaded.doc && loaded.images ? <SiteDocumentPreview doc={loaded.doc} images={loaded.images} />
      : loaded.source ? <StructuredWebsitePreview source={loaded.source} /> : null
    } />;
  return <AdvancedWorkbenchShell item={item} taskId={taskId} siteId={siteId} accent={accent} onClose={onClose}
    adapter={{ id: "website", label: tt("网站"), pages: { activePageId: "artifact", aux: [] }, stage }} />;
}
