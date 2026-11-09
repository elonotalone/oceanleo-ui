"use client";

import { useUI } from "../i18n/ui/useUI";
import type { LibraryItem } from "./library-data";
import type { WorkspaceActionV1 } from "./workspace-actions";

// These are instance-scoped UI callbacks, never persisted as artifact metadata.
// Weak keys release the callback when the corresponding preview is discarded.
const links = new WeakMap<LibraryItem, () => void>();
const galleries = new WeakMap<LibraryItem, TaskAttachmentGallery>();

/** A message's files as one sidebar gallery: the open one is `index` of `count`. */
export interface TaskAttachmentGallery {
  index: number;
  count: number;
  /** Open file `index` of the same message in the same sidebar view. */
  go: (index: number) => void;
}

/**
 * The sidebar item for a sent / composer file plus its header actions:
 * 「在 Library 中查看」 when the file has a Library identity, and ‹ n/m › when the
 * message carries more than one file (U6 2026-11-10: every type, not only images).
 */
export function withTaskAttachmentActions(
  item: LibraryItem,
  {
    action,
    open,
    gallery,
  }: {
    action?: WorkspaceActionV1 | null;
    open?: (action: WorkspaceActionV1) => void;
    gallery?: TaskAttachmentGallery | null;
  },
): LibraryItem {
  const link = action && open ? () => open(action) : null;
  const steps = gallery && gallery.count > 1 ? gallery : null;
  if (!link && !steps) return item;
  const preview = { ...item };
  if (link) links.set(preview, link);
  if (steps) galleries.set(preview, steps);
  return preview;
}

export function withTaskAttachmentLibraryLink(
  item: LibraryItem,
  action: WorkspaceActionV1 | null,
  open: ((action: WorkspaceActionV1) => void) | undefined,
): LibraryItem {
  return withTaskAttachmentActions(item, { action, open });
}

const HEADER_BUTTON =
  "shrink-0 rounded-lg border border-[var(--border,#e7e5e4)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--fg-2,#57534e)] transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-[var(--surface-hover,#fafaf9)] disabled:cursor-default disabled:opacity-40";

/** Optional actions on an attachment's existing shared viewer header. */
export function TaskAttachmentLibraryLink({ item }: { item?: LibraryItem }) {
  const tt = useUI();
  const open = item ? links.get(item) : undefined;
  const gallery = item ? galleries.get(item) : undefined;
  if (!open && !gallery) return null;
  return (
    <>
      {gallery && (
        <span className="flex shrink-0 items-center gap-1" data-task-attachment-gallery={`${gallery.index + 1}/${gallery.count}`}>
          <button
            type="button"
            aria-label={tt("上一个文件")}
            title={tt("上一个文件")}
            disabled={gallery.index <= 0}
            onClick={() => gallery.go(gallery.index - 1)}
            data-task-attachment-prev=""
            className={HEADER_BUTTON}
          >
            ‹
          </button>
          <span className="min-w-[2.5em] text-center text-[11px] tabular-nums text-[var(--fg-3,#78716c)]">
            {gallery.index + 1}/{gallery.count}
          </span>
          <button
            type="button"
            aria-label={tt("下一个文件")}
            title={tt("下一个文件")}
            disabled={gallery.index >= gallery.count - 1}
            onClick={() => gallery.go(gallery.index + 1)}
            data-task-attachment-next=""
            className={HEADER_BUTTON}
          >
            ›
          </button>
        </span>
      )}
      {open && (
        <button type="button" onClick={open} data-task-attachment-library-link="" className={HEADER_BUTTON}>
          {tt("在 Library 中查看")}
        </button>
      )}
    </>
  );
}
