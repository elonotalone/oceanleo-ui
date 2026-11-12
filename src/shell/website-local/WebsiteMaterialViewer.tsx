"use client";

import { useState, type ReactNode } from "react";
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
