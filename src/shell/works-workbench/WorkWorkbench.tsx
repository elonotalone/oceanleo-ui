"use client";

import { AutoRecovery } from "../AutoRecovery";
import { useEffect, useState } from "react";
import { worksApi, type WorksApi } from "../../lib/works-api";
import type { Work } from "../works/model";
import { DEFAULT_KIND_DEFINITION, kindDefinition, type WorkKindDefinition } from "../works/kinds";
import { WebsitePreviewWorkbench } from "../website-platform/WebsitePreviewWorkbench";
import { useWebsiteLanguage, useWebsiteUI } from "../website-platform/website-preview-i18n";

/** One stage for every work; kind differences come entirely from the catalog. */
export function WorkWorkbench({ workId, initialWork, readOnly = false, api = worksApi }: {
  workId: string; initialWork?: Work; readOnly?: boolean; api?: WorksApi;
}) {
  const tt = useWebsiteUI();
  const locale = useWebsiteLanguage();
  const [retry, setRetry] = useState(0);
  const [loaded, setLoaded] = useState<{ id: string; work?: Work; error?: unknown } | null>(null);
  const [kinds, setKinds] = useState<WorkKindDefinition[]>([DEFAULT_KIND_DEFINITION]);
  useEffect(() => {
    const abort = new AbortController();
    if (readOnly && initialWork?.id === workId) setLoaded({ id: workId, work: initialWork });
    else {
      setLoaded(null);
      void api.get(workId, abort.signal).then(work => {
        if (!abort.signal.aborted) setLoaded({ id: workId, work: { ...work, ...(work.orientation || !initialWork?.orientation ? {} : { orientation: initialWork.orientation }) } });
      }).catch(error => { if (!abort.signal.aborted) setLoaded({ id: workId, error }); });
    }
    void api.kinds().then(next => { if (!abort.signal.aborted) setKinds(next); })
      .catch(() => { if (!abort.signal.aborted) setKinds([DEFAULT_KIND_DEFINITION]); });
    return () => abort.abort();
    // Locale changes do not restart an in-flight work request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workId, api, retry, readOnly, initialWork]);
  const current = loaded?.id === workId ? loaded : null;
  if (current?.error) return <AutoRecovery identity="src/shell/works-workbench/WorkWorkbench.tsx:0" error={current.error} recover={() => setRetry(value => value + 1)} />;
  if (!current?.work) return <p role="status" className="p-4">{tt("加载中…")}</p>;
  const work = current.work;
  const projectId = work.home.type === "cloud" ? work.home.project_id || (work.id.startsWith("cloud:") ? work.id.slice(6) : "") : "";
  const definition = kindDefinition(kinds, work.kind);
  return <div className="flex h-full min-h-0 flex-col" data-work-id={work.id}>
    <header className="flex shrink-0 items-center gap-2 border-b px-3 py-2 text-xs"><strong>{work.title}</strong><span className="opacity-65">{locale.startsWith("zh") ? definition.label_zh : definition.label}</span></header>
    <div className="min-h-0 flex-1"><WebsitePreviewWorkbench key={work.id} projectId={projectId} work={work} worksApi={api}
    kind={definition} readOnly={readOnly || work.access === "view"} /></div>
  </div>;
}
