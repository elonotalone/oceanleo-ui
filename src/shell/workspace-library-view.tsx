"use client";

import type {
  DragEvent as ReactDragEvent,
  ReactNode,
} from "react";
import { useUI } from "../i18n/ui/useUI";
import { LibraryItemViewer } from "./library-viewers";
import {
  WORKSPACE_KIND_LABELS,
  type WorkspaceLibraryEntry,
} from "./workspace-library-model";
import { WorkspaceThumbnail } from "./workspace-library-thumbnail";

export function WorkspaceLibraryEntryViewer({
  entry,
  accent = "#4f46e5",
  viewerNonce = 0,
}: {
  entry: WorkspaceLibraryEntry;
  accent?: string;
  viewerNonce?: number;
}) {
  const tt = useUI();
  if (entry.libraryItem) {
    return (
      <LibraryItemViewer
        key={`${entry.id}:${viewerNonce}`}
        item={entry.libraryItem}
        accent={accent}
      />
    );
  }
  if (entry.content) {
    return (
      <div key={viewerNonce} className="h-full min-h-[520px]">
        {entry.content}
      </div>
    );
  }
  return (
    <WorkspaceLibraryEmpty
      title={tt("暂时无法预览")}
      description={tt("这个条目还没有可显示的内容。")}
    />
  );
}

interface WorkspaceRowProps {
  entry: WorkspaceLibraryEntry;
  onOpen: () => void;
  actions?: ReactNode;
  dragProps?: {
    draggable?: boolean;
    onDragStart?: (event: ReactDragEvent<HTMLElement>) => void;
    onDragEnd?: () => void;
  };
}

export function WorkspaceCard({
  entry,
  onOpen,
  accent,
  dragProps,
  actions,
}: WorkspaceRowProps & { accent: string }) {
  const tt = useUI();
  const kind = entry.kind || entry.libraryItem?.kind || "file";
  return (
    <div
      {...dragProps}
      className={`group relative overflow-hidden rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] text-left transition hover:-translate-y-0.5 hover:border-[var(--border-strong,#d6d3d1)] hover:shadow-sm ${
        dragProps?.draggable ? "cursor-grab active:cursor-grabbing" : ""
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="block w-full text-left"
        aria-label={tt("预览「{title}」", { title: entry.title })}
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-[var(--surface,#f5f5f4)]">
          <WorkspaceThumbnail
            url={entry.thumbUrl}
            item={entry.libraryItem}
            alt={entry.title}
            kind={kind}
            accent={accent}
            imageClassName="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
          />
          <span className="absolute bottom-2 left-2 rounded-md bg-[var(--card,#fff)]/90 px-1.5 py-0.5 text-[10px] font-medium text-[var(--fg-2,#57534e)] shadow-sm backdrop-blur">
            {tt(WORKSPACE_KIND_LABELS[kind] || entry.category || "内容")}
          </span>
        </div>
        <div className="p-2.5">
          <p className="line-clamp-2 text-[12px] font-semibold leading-snug text-[var(--fg,#292524)]">
            {entry.title}
          </p>
          {entry.description && (
            <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-[var(--muted,#a8a29e)]">
              {tt(entry.description)}
            </p>
          )}
        </div>
      </button>
      {actions && (
        <div className="border-t border-[var(--border,#e7e5e4)] px-2 py-2">
          {actions}
        </div>
      )}
    </div>
  );
}

export function WorkspaceListRow({
  entry,
  onOpen,
  dragProps,
  actions,
}: WorkspaceRowProps) {
  const tt = useUI();
  const kind = entry.kind || entry.libraryItem?.kind || "file";
  return (
    <div
      {...dragProps}
      className={`flex w-full flex-wrap items-center rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] transition hover:border-[var(--border-strong,#d6d3d1)] hover:bg-[var(--surface-hover,#fafaf9)] ${
        dragProps?.draggable ? "cursor-grab active:cursor-grabbing" : ""
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 p-2 text-left"
        aria-label={tt("预览「{title}」", { title: entry.title })}
      >
        <div className="h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-[var(--surface,#f5f5f4)]">
          <WorkspaceThumbnail
            url={entry.thumbUrl}
            item={entry.libraryItem}
            alt={entry.title}
            kind={kind}
            accent="#78716c"
            imageClassName="h-full w-full object-cover"
            compact
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-semibold text-[var(--fg,#292524)]">
            {entry.title}
          </p>
          <p className="mt-0.5 truncate text-[10px] text-[var(--muted,#a8a29e)]">
            {entry.description
              ? tt(entry.description)
              : tt(
                  WORKSPACE_KIND_LABELS[kind] ||
                    entry.category ||
                    "内容",
                )}
          </p>
        </div>
        <svg
          className="h-4 w-4 shrink-0 text-[var(--border-strong,#d6d3d1)]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path
            d="M9 6l6 6-6 6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {actions && <div className="mr-2 py-1">{actions}</div>}
    </div>
  );
}

export function WorkspaceLibraryEmpty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex h-full min-h-[260px] flex-col items-center justify-center px-6 text-center">
      <svg
        className="h-10 w-10 text-[var(--border-strong,#d6d3d1)]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M7 9h10M7 13h7M7 17h5" strokeLinecap="round" />
      </svg>
      <p className="mt-3 text-[13px] font-medium text-[var(--fg-2,#57534e)]">
        {title}
      </p>
      <p className="mt-1 max-w-xs text-[11px] leading-relaxed text-[var(--muted,#a8a29e)]">
        {description}
      </p>
    </div>
  );
}
