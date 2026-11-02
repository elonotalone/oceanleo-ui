"use client";

import { useUI } from "../i18n/ui/useUI";
import type { LibraryItem } from "./library-data";
import type { WorkspaceActionV1 } from "./workspace-actions";

// These are instance-scoped UI callbacks, never persisted as artifact metadata.
// Weak keys release the callback when the corresponding preview is discarded.
const links = new WeakMap<LibraryItem, () => void>();

export function withTaskAttachmentLibraryLink(
  item: LibraryItem,
  action: WorkspaceActionV1 | null,
  open: ((action: WorkspaceActionV1) => void) | undefined,
): LibraryItem {
  if (item.kind !== "image" || !action || !open) return item;
  const preview = { ...item };
  links.set(preview, () => open(action));
  return preview;
}

/** Optional action on an attachment image's existing shared viewer header. */
export function TaskAttachmentLibraryLink({ item }: { item?: LibraryItem }) {
  const tt = useUI();
  const open = item ? links.get(item) : undefined;
  if (!open) return null;
  return (
    <button
      type="button"
      onClick={open}
      data-task-attachment-library-link=""
      className="shrink-0 rounded-lg border border-[var(--border,#e7e5e4)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--fg-2,#57534e)] transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-[var(--surface-hover,#fafaf9)]"
    >
      {tt("在 Library 中查看")}
    </button>
  );
}
