"use client";

import { useMemo } from "react";

import {
  useArtifactRendition,
  withResolvedRendition,
} from "../ArtifactRendition";
import {
  isDurableLibraryItem,
  type LibraryItem,
} from "../library-data";
import { officeRenditionPurposes } from "../doc-editors/office-file";

/**
 * Resolve an Office editor input without ever falling back to preview/thumb.
 * `resourceFailed` refreshes the same artifact revision after a signed 403.
 */
export function useOfficeArtifactSource(item: LibraryItem) {
  const purposes = officeRenditionPurposes(item);
  const rendition = useArtifactRendition(item, purposes);
  const acceptedPurpose =
    rendition.purpose === "source" || rendition.purpose === "full";
  const sourceItem = useMemo<LibraryItem>(() => {
    if (!acceptedPurpose || !rendition.url) {
      return isDurableLibraryItem(item)
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

  return {
    item: sourceItem,
    url: acceptedPurpose ? rendition.url : "",
    purpose: acceptedPurpose ? rendition.purpose : null,
    loading: rendition.loading,
    error: rendition.error,
    version: rendition.version,
    retry: rendition.retry,
    resourceFailed: rendition.resourceFailed,
  };
}
