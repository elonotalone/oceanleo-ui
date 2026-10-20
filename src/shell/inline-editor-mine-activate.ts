"use client";

import { rememberOpenedLibraryItem } from "./library-current-identity";
import type { LibraryItem } from "./library-data";
import { dispatchWorkspaceAction } from "./workspace-actions";

export function libraryItemIdentityKey(
  item: Pick<LibraryItem, "id" | "artifactId"> | null | undefined,
): string {
  return String(item?.artifactId || item?.id || "").trim();
}

/**
 * Typed open path already consumed by MyLibrary / ResultCanvas:
 * `intent: "edit"` + durable item id. Remember identity so the URL and the
 * still-mounted library hook agree on which artifact is current.
 */
export function requestOpenLibraryItemInEditor(item: LibraryItem): void {
  const itemId = libraryItemIdentityKey(item);
  if (!itemId) return;
  rememberOpenedLibraryItem(item);
  dispatchWorkspaceAction({
    nonce: `inline-mine-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    action: {
      version: 1,
      tab: "mine",
      itemId,
      intent: "edit",
    },
  });
}
