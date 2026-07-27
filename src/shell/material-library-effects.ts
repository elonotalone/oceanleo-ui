"use client";

/**
 * Side-effect hooks lifted out of `material-library-view.tsx`: the artifact
 * deep link and the library-change subscription. Both keep their original
 * behaviour; only their home changed.
 */

import { useEffect, type Dispatch, type SetStateAction } from "react";
import {
  artifactIsVisible,
  type ArtifactContextRef,
  type ArtifactType,
} from "./artifact-contract";
import {
  ARTIFACT_LIBRARY_CHANGE_EVENT,
  getArtifactItem,
} from "./artifact-client";
import { isAdvancedEditableShelfItem } from "./advanced-features";
import { isDurableLibraryItem, type LibraryItem } from "./library-data";
import {
  artifactEntry,
  invalidateMaterialLibraryCache,
  libraryItemHasExactPrimaryContext,
  type MaterialLibraryLevel,
} from "./material-library-controller";
import { materialLibraryHref } from "./material-library-presentation";
import type { WorkspaceLibraryEntry } from "./WorkspaceLibrary";

export function useMaterialLibraryChangeEvents(options: {
  setRemote: Dispatch<SetStateAction<WorkspaceLibraryEntry[]>>;
  setDeepLinkedEntry: Dispatch<SetStateAction<WorkspaceLibraryEntry | null>>;
  setRetryNonce: Dispatch<SetStateAction<number>>;
}): void {
  const { setRemote, setDeepLinkedEntry, setRetryNonce } = options;
  useEffect(() => {
    const refresh = (event: Event) => {
      invalidateMaterialLibraryCache();
      const detail = (event as CustomEvent<{
        action?: string;
        artifactId?: string;
        revisionId?: string;
        favorite?: boolean;
      }>).detail;
      if (
        detail?.action === "favorite" &&
        detail.artifactId &&
        detail.revisionId
      ) {
        const update = (entry: WorkspaceLibraryEntry) => {
          const item = entry.libraryItem;
          if (
            !item ||
            !isDurableLibraryItem(item) ||
            item.artifactId !== detail.artifactId ||
            item.revisionId !== detail.revisionId
          ) {
            return entry;
          }
          const updatedItem: LibraryItem = {
            ...item,
            favorite: detail.favorite === true,
            artifact: {
              ...item.artifact,
              favorite: detail.favorite === true,
            },
          };
          return {
            ...entry,
            libraryItem: updatedItem,
          };
        };
        setRemote((current) => current.map(update));
        setDeepLinkedEntry((current) => (current ? update(current) : null));
        return;
      }
      if (detail?.action === "retire" && detail.artifactId) {
        setRemote((current) =>
          current.filter(
            (entry) =>
              !entry.libraryItem ||
              !isDurableLibraryItem(entry.libraryItem) ||
              entry.libraryItem.artifactId !== detail.artifactId,
          ),
        );
        setDeepLinkedEntry((current) =>
          current?.libraryItem &&
          isDurableLibraryItem(current.libraryItem) &&
          current.libraryItem.artifactId === detail.artifactId
            ? null
            : current,
        );
        return;
      }
      setRetryNonce((value) => value + 1);
    };
    window.addEventListener(ARTIFACT_LIBRARY_CHANGE_EVENT, refresh);
    return () =>
      window.removeEventListener(ARTIFACT_LIBRARY_CHANGE_EVENT, refresh);
  }, [setDeepLinkedEntry, setRemote, setRetryNonce]);
}

export function useMaterialLibraryDeepLink(options: {
  nonce: string | undefined;
  itemId: string;
  query: string;
  level: MaterialLibraryLevel;
  context: ArtifactContextRef;
  taxonomy: ArtifactType | "";
  retryNonce: number;
  setDeepLinkedEntry: Dispatch<SetStateAction<WorkspaceLibraryEntry | null>>;
  setDeepLinkError: Dispatch<SetStateAction<string>>;
  setDeepLinkStatus: Dispatch<SetStateAction<number | undefined>>;
}): void {
  const {
    context,
    itemId,
    level,
    query,
    setDeepLinkError,
    setDeepLinkStatus,
    setDeepLinkedEntry,
    taxonomy,
  } = options;
  useEffect(() => {
    const match = /^artifact:([^:]+):([^:]+)$/.exec(itemId);
    setDeepLinkedEntry(null);
    setDeepLinkError("");
    setDeepLinkStatus(undefined);
    if (!itemId) return;
    if (!match) {
      setDeepLinkError("素材深链缺少有效 artifact/revision identity。");
      setDeepLinkStatus(400);
      return;
    }
    const controller = new AbortController();
    void getArtifactItem(match[1], match[2], controller.signal).then(
      (result) => {
        if (controller.signal.aborted) return;
        const item = result.data;
        const artifact = item?.artifact;
        const trustedItem = Boolean(
          item &&
            artifact &&
            isDurableLibraryItem(item) &&
            artifactIsVisible(artifact) &&
            isAdvancedEditableShelfItem(item),
        );
        const inScope = Boolean(
          result.ok &&
            item &&
            artifact &&
            trustedItem &&
            (!taxonomy || item.artifactType === taxonomy) &&
            (level === "primary"
              ? libraryItemHasExactPrimaryContext(item, context)
              : artifact.owner.visibility === "public" &&
                artifact.roles.includes("template")),
        );
        if (!inScope || !item) {
          setDeepLinkError(
            result.error ||
              "深链 artifact/revision 不属于当前授权范围或 taxonomy。",
          );
          setDeepLinkStatus(result.status || 403);
          return;
        }
        setDeepLinkedEntry({
          ...artifactEntry(item),
          linkUrl: materialLibraryHref({
            query,
            taxonomy,
            item,
          }),
        });
      },
    );
    return () => controller.abort();
  }, [options.nonce, context, level, options.retryNonce, taxonomy]); // eslint-disable-line react-hooks/exhaustive-deps
}
