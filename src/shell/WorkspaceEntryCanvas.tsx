"use client";

import { useUI } from "../i18n/ui/useUI";
import {
  WorkspaceLibraryEntryViewer,
  type WorkspaceLibraryEntry,
} from "./WorkspaceLibrary";

export function WorkspaceEntryCanvas({
  entry,
  accent = "#4f46e5",
  onClose,
}: {
  entry: WorkspaceLibraryEntry;
  accent?: string;
  onClose: () => void;
}) {
  const tt = useUI();
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--surface,#fafaf9)]">
      <div className="flex min-h-14 shrink-0 items-center gap-2 border-b border-[var(--divider,#e7e5e4)] bg-[var(--card,#fff)] px-3">
        <button
          type="button"
          onClick={onClose}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--muted,#78716c)] transition hover:bg-[var(--surface-hover,#f5f5f4)] hover:text-[var(--fg,#292524)]"
          aria-label={tt("返回库")}
          title={tt("返回库")}
        >
          ←
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-semibold text-[var(--fg,#292524)]">
            {entry.title}
          </p>
          {entry.description && (
            <p className="truncate text-[10px] text-[var(--muted,#78716c)]">
              {entry.description}
            </p>
          )}
        </div>
        {entry.linkUrl && (
          <a
            href={entry.linkUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-[var(--border,#e7e5e4)] px-2.5 py-1.5 text-[11px] font-medium transition hover:bg-[var(--surface-hover,#f5f5f4)]"
            style={{ color: accent }}
          >
            {tt("打开原始页面")}
          </a>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <WorkspaceLibraryEntryViewer entry={entry} accent={accent} />
      </div>
    </div>
  );
}
