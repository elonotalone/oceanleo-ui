"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { SiteDoc } from "./website-site-doc";
import { SiteImageResolver } from "./website-site-load";
import { SiteEditorContext, SiteFrame, SiteSectionView } from "./website-site-render";
import { safeSiteColor } from "./website-site-doc";
import type { WebsiteSource } from "../website-source-carrier/website-source-schema";
import { useUI } from "../../i18n/ui/useUI";

/** Website materials have two read-only views; changes go through the agent. */
export function WebsiteMaterialViewer({ sourceText, preview, source }: { sourceText: string; preview: ReactNode; source?: ReactNode }) {
  const tt = useUI();
  const [view, setView] = useState<"preview" | "source">("preview");
  return <div className="flex h-full min-h-0 flex-col" data-testid="website-material-viewer">
    <nav role="tablist" aria-label={tt("网站视图")} className="flex gap-2 border-b p-2">
      {(["preview", "source"] as const).map(id => <button type="button" key={id} role="tab" aria-selected={view === id}
        aria-controls={`website-material-${id}`} onClick={() => setView(id)}>{tt(id === "preview" ? "预览" : "源码")}</button>)}
    </nav>
    <div role="tabpanel" id={`website-material-${view}`} className="min-h-0 flex-1 overflow-auto">
      {view === "source" ? source ?? <pre className="whitespace-pre-wrap p-4 text-xs" data-testid="website-source-view"><code>{sourceText}</code></pre> : preview}
    </div>
  </div>;
}

export function SiteDocumentPreview({ doc, images }: { doc: SiteDoc; images: SiteImageResolver }) {
  const tt = useUI();
  const [pageIndex, setPageIndex] = useState(0);
  const page = doc.pages[pageIndex] || doc.pages[0];
  const context = useMemo(() => ({ doc, pageIndex, images, onPick: () => {} }), [doc, pageIndex, images]);
  return <SiteEditorContext.Provider value={context}>
    {doc.pages.length > 1 && <select aria-label={tt("页面")} value={pageIndex} onChange={event => setPageIndex(Number(event.target.value))}>
      {doc.pages.map((entry, index) => <option key={index} value={index}>{String(entry.name || entry.title || index + 1)}</option>)}
    </select>}
    <SiteFrame>{page?.sections.map(section => <SiteSectionView key={section.id} raw={section} props={section.content} />)}</SiteFrame>
  </SiteEditorContext.Provider>;
}

/** Legacy structured sources also render as a page, never as a cover image. */
export function StructuredWebsitePreview({ source }: { source: WebsiteSource }) {
  const tt = useUI();
  const [pageId, setPageId] = useState(source.pages[0]?.id || "");
  const page = source.pages.find(entry => entry.id === pageId) || source.pages[0];
  return <div style={{ background: safeSiteColor(source.theme.background) || "#fff", color: safeSiteColor(source.theme.text) || "#111", minHeight: "100%" }}>
    <header className="flex items-center justify-between border-b p-4"><strong>{source.navigation?.brand || source.title}</strong>
      <select aria-label={tt("页面")} value={page?.id} onChange={event => setPageId(event.target.value)}>
        {source.pages.map(entry => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
      </select>
    </header>
    {page?.sectionIds.map(id => {
      const section = source.sections.find(entry => entry.id === id);
      return section ? <section key={id} className="mx-auto grid max-w-5xl gap-4 px-8 py-12">
        <h2 className="text-3xl font-bold">{section.heading}</h2><h3>{section.subheading}</h3><p>{section.body}</p>
        {section.items?.map((entry, index) => <article key={index}><strong>{entry.title}</strong><p>{entry.text}</p><span>{entry.value}</span></article>)}
        {section.actions?.map((entry, index) => <span key={index}>{entry.label}</span>)}
      </section> : null;
    })}
  </div>;
}
