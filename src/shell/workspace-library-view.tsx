"use client";

import type {
  DragEvent as ReactDragEvent,
  ReactNode,
} from "react";
import { CollectionItemCard, CollectionItemRow } from "./collection-items";
import { useUI } from "../i18n/ui/useUI";
import { LibraryItemViewer } from "./library-viewers";
import {
  WORKSPACE_KIND_LABELS,
  type WorkspaceLibraryEntry,
} from "./workspace-library-model";
import { WorkspaceThumbnail } from "./workspace-library-thumbnail";
import {
  libraryEditorLabel,
  libraryCategoryLabel,
  translateLibraryTypeLabel,
} from "./library-editor-category";

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

function entryMetadata(entry: WorkspaceLibraryEntry, tt: ReturnType<typeof useUI>) {
  const kind = entry.kind || entry.libraryItem?.kind || "file";
  return translateLibraryTypeLabel(tt, entry.libraryItem ? libraryEditorLabel(entry.libraryItem) : libraryCategoryLabel(entry.category || WORKSPACE_KIND_LABELS[kind] || "内容"));
}

export function WorkspaceCard({ entry, onOpen, accent, dragProps, actions }: WorkspaceRowProps & { accent: string }) {
  const tt = useUI();
  return <CollectionItemCard title={entry.title} metadata={entryMetadata(entry, tt)} onOpen={onOpen}
    openLabel={tt("预览「{title}」", { title: entry.title })} containerProps={dragProps} actions={actions}
    cover={<WorkspaceThumbnail url={entry.thumbUrl} item={entry.libraryItem} alt={entry.title}
      kind={entry.kind || entry.libraryItem?.kind || "file"} accent={accent}
      imageClassName="h-full w-full object-cover transition duration-[var(--leo-dur-4)] ease-[var(--leo-ease-standard)] group-hover:scale-[1.02]" />} />;
}

export function WorkspaceListRow({ entry, onOpen, dragProps, actions }: WorkspaceRowProps) {
  const tt = useUI();
  return <CollectionItemRow title={entry.title} metadata={entryMetadata(entry, tt)} onOpen={onOpen}
    openLabel={tt("预览「{title}」", { title: entry.title })} containerProps={dragProps} actions={actions}
    cover={<WorkspaceThumbnail url={entry.thumbUrl} item={entry.libraryItem} alt={entry.title}
      kind={entry.kind || entry.libraryItem?.kind || "file"} accent="#78716c" imageClassName="h-full w-full object-cover" compact />} />;
}

export function WorkspaceLibraryEmpty({
  title,
  description,
  cta,
}: {
  title: string;
  description: string;
  /**
   * 空态下方的 CTA 插槽。素材库空着的时候，这里是唯一能把读者指回「这个 app 能做
   * 什么」的位置；在这之前空态只有一个图标 + 两行灰字，无处可去。
   *
   * **必须保持可选**：本组件与 `WorkspaceLibrary` 被 36 个消费站直接 import，加必填
   * 字段会让它们一起 typecheck 变红。不传时这块空态与今天逐字相同，既有文案的默认值
   * 一个字未改。
   */
  cta?: ReactNode;
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
      {cta && <div className="mt-4">{cta}</div>}
    </div>
  );
}
