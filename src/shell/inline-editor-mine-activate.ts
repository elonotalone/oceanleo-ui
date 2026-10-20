"use client";

import { useEffect, useRef, useState } from "react";
import { rememberOpenedLibraryItem } from "./library-current-identity";
import type { LibraryItem } from "./library-data";
import {
  dispatchWorkspaceAction,
  normalizeWorkspaceAction,
  WORKSPACE_ACTION_EVENT,
  type WorkspaceActionEnvelope,
} from "./workspace-actions";

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

/**
 * Standalone /library receiver. ResultCanvas already feeds `action` into
 * MyLibrary; this hook is the other mount (ArtifactLibrary) so the same
 * typed envelope reaches the still-mounted editor host. Only `tab: "mine"`
 * + `intent: "edit"` with a nonce and itemId are accepted.
 */
export function useStandaloneMineEditReceipt(options?: {
  enabled?: boolean;
}): WorkspaceActionEnvelope | null {
  const enabled = options?.enabled !== false;
  const [envelope, setEnvelope] = useState<WorkspaceActionEnvelope | null>(
    null,
  );
  const seenNonceRef = useRef("");
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return undefined;
    const onEvent = (event: Event) => {
      const detail = (event as CustomEvent<WorkspaceActionEnvelope>).detail;
      const action = normalizeWorkspaceAction(detail?.action);
      if (!action || action.tab !== "mine" || action.intent !== "edit") return;
      const itemId = String(action.itemId || "").trim();
      const nonce = String(detail?.nonce || "").trim();
      if (!itemId || !nonce) return;
      if (seenNonceRef.current === nonce) return;
      seenNonceRef.current = nonce;
      setEnvelope({ nonce, action });
    };
    window.addEventListener(WORKSPACE_ACTION_EVENT, onEvent);
    return () => {
      window.removeEventListener(WORKSPACE_ACTION_EVENT, onEvent);
    };
  }, [enabled]);
  return enabled ? envelope : null;
}
