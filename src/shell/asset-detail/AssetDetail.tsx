"use client";

import { forwardRef, type ReactNode, type Ref } from "react";
import { useUI } from "../../i18n/ui/useUI";
import type { LibraryItem } from "../library-data";
import { libraryEditorLabel, translateLibraryTypeLabel } from "../library-editor-category";
import { WORKSPACE_KIND_LABELS, type WorkspaceLibraryEntry } from "../workspace-library-model";
import { WorkspaceLibraryEntryViewer } from "../workspace-library-view";
import type { AssetActionContext } from "./types";
import { AssetInfo } from "./AssetInfo";

export interface AssetDetailProps {
  entry: WorkspaceLibraryEntry;
  /** Omitted only by legacy Library hosts; resolved catalog hosts supply the server context. */
  actionContext?: AssetActionContext;
  actions?: ReactNode;
  onBack: () => void;
  accent?: string;
  plain?: boolean;
  className?: string;
  viewerNonce?: number;
  viewerRef?: Ref<HTMLDivElement>;
  /** Resolved type label, without replacing the entry dispatched to the existing viewer. */
  typeItem?: LibraryItem | null;
  /** Existing Library app attribution stays alongside the shared information. */
  info?: ReactNode;
}

/** In-place detail for Library, Bay and home/task sidebars. Hosts own every action. */
export const AssetDetail = forwardRef<HTMLDivElement, AssetDetailProps>(function AssetDetail({
  entry, actionContext, actions, onBack, accent = "#4f46e5", plain = false,
  className = "", viewerNonce = 0, viewerRef, typeItem, info,
}, ref) {
  const tt = useUI();
  const labelItem = typeItem || entry.libraryItem;
  const kind = labelItem?.kind || entry.kind;
  return (
    <div ref={ref} data-asset-detail data-asset-surface={actionContext?.surface || "library"}
      className={`flex h-full min-h-0 flex-col ${plain ? "bg-transparent" : "bg-[var(--card,#fff)]"} ${className}`}>
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--border,#e7e5e4)] px-3 py-2.5">
        <button type="button" onClick={onBack} aria-label={tt("返回列表")} title={tt("返回列表")}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--border,#e7e5e4)] text-[var(--muted,#78716c)] transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-[var(--surface-hover,#fafaf9)] hover:text-[var(--fg,#292524)]">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 title={entry.title} className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--fg,#1c1917)]">{entry.title}</h3>
            {kind && <span className="shrink-0 rounded-md bg-[var(--surface,#f5f5f4)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--muted,#78716c)]">
              {translateLibraryTypeLabel(tt, labelItem ? libraryEditorLabel(labelItem) : WORKSPACE_KIND_LABELS[kind] || "内容")}
            </span>}
          </div>
          {entry.description && <p className="mt-0.5 truncate text-[11px] text-[var(--muted,#a8a29e)]">{tt(entry.description)}</p>}
          {info}
        </div>
        {actions}
      </header>
      <AssetInfo entry={entry} actionContext={actionContext} />
      <div ref={viewerRef} className="min-h-0 flex-1 overflow-auto bg-[var(--surface,#fafaf9)]">
        <WorkspaceLibraryEntryViewer entry={entry} accent={accent} viewerNonce={viewerNonce} />
      </div>
    </div>
  );
});
