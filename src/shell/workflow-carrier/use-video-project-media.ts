"use client";
import { useEffect, useRef } from "react";
import type { VideoProjectDoc } from "./video-project-doc";
import { videoDependencyBlob } from "./video-project-media-io";

/** Object URLs hold verified closure bytes, so an open node never expires with its grant. */
export function useVideoProjectMedia(doc: VideoProjectDoc | null, onMedia: (assetId: string, url: string) => void, onFailure: (assetId: string) => void) {
  const cache = useRef(new Map<string, { digest: string; url: string }>());
  useEffect(() => () => {
    for (const entry of cache.current.values()) URL.revokeObjectURL(entry.url);
    cache.current.clear();
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    for (const [assetId, asset] of Object.entries(doc?.assets || {})) {
      const digest = String(asset.contentDigest || "");
      const known = cache.current.get(assetId);
      if (known && known.digest === digest) { onMedia(assetId, known.url); continue; }
      const reference = asset.sourceDependency;
      if (!reference || typeof reference !== "object") continue;
      void videoDependencyBlob(reference as Record<string, unknown>, abort.signal).then(blob => {
        if (abort.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        if (known) URL.revokeObjectURL(known.url);
        cache.current.set(assetId, { digest, url });
        onMedia(assetId, url);
      }).catch(() => { if (!abort.signal.aborted) onFailure(assetId); });
    }
    // History may restore an asset whose previous render disappeared. Keep its
    // verified bytes until this editor closes, rather than revoking on Undo.
    return () => abort.abort();
  }, [doc?.assets, onMedia, onFailure]);
}
