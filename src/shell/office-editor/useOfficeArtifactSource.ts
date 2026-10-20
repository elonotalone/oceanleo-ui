"use client";

import { useEffect, useMemo } from "react";

import {
  useArtifactRendition,
  withResolvedRendition,
} from "../ArtifactRendition";
import {
  isDurableLibraryItem,
  type LibraryItem,
} from "../library-data";
import { isArtifactSourceTreeUrl } from "../artifact-contract";
import { officePackageKindForItem, officeRenditionPurposes } from "../doc-editors/office-file";
import {
  loadOfficeSource,
  peekOfficeSource,
  sourceHintForItem,
} from "./office-source-cache";

/**
 * Resolve an Office editor input without ever falling back to preview/thumb.
 * `resourceFailed` refreshes the same artifact revision after a signed 403.
 */
export function useOfficeArtifactSource(item: LibraryItem) {
  const purposes = officeRenditionPurposes(item);
  const rendition = useArtifactRendition(item, purposes);
  const acceptedPurpose =
    rendition.purpose === "source" || rendition.purpose === "full";
  const hint = sourceHintForItem(item);
  const resolvedUrl =
    acceptedPurpose && rendition.url && !isArtifactSourceTreeUrl(rendition.url)
      ? rendition.url
      : hint.url && !isArtifactSourceTreeUrl(hint.url)
        ? hint.url
        : "";
  const sourceUrl = resolvedUrl;
  const sourceRevision = item.revisionId || hint.revision;
  const cached = sourceUrl
    ? peekOfficeSource(sourceUrl, sourceRevision)
    : null;
  const sourceItem = useMemo<LibraryItem>(() => {
    if (!acceptedPurpose || !rendition.url) {
      // Office packages must not fall back to a preview PNG. Markdown / plain
      // text documents keep their existing url — that IS the editable source.
      return isDurableLibraryItem(item) && officePackageKindForItem(item)
        ? { ...item, url: undefined }
        : item;
    }
    return withResolvedRendition(item, rendition);
  }, [
    acceptedPurpose,
    item,
    rendition.purpose,
    rendition.url,
    rendition.version,
  ]);

  useEffect(() => {
    if (!sourceUrl || !officePackageKindForItem(item)) return;
    void loadOfficeSource(sourceUrl, sourceRevision, item).catch(() => {
      // The editor's own read reports failures and refreshes expired access.
    });
  }, [item, sourceRevision, sourceUrl]);

  return {
    item: sourceItem,
    url: sourceUrl,
    purpose: acceptedPurpose ? rendition.purpose : null,
    loading: rendition.loading,
    error: rendition.error,
    version: rendition.version,
    retry: rendition.retry,
    resourceFailed: rendition.resourceFailed,
    cached: Boolean(cached),
    bytes: cached?.bytes,
  };
}
