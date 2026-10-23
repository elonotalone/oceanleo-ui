"use client";
import { useEffect } from "react";
import type { VideoProjectDoc } from "./video-project-doc";
import { videoDependencyBlob } from "./video-project-media-io";

/** Object URLs hold verified closure bytes, so an open node never expires with its grant. */
export function useVideoProjectMedia(doc: VideoProjectDoc | null, onMedia: (assetId: string, url: string) => void) {
  useEffect(() => {
    const abort = new AbortController();
    const urls: string[] = [];
    for (const [assetId, asset] of Object.entries(doc?.assets || {})) {
      const reference = asset.sourceDependency;
      if (!reference || typeof reference !== "object") continue;
      void videoDependencyBlob(reference as Record<string, unknown>, abort.signal).then(blob => {
        if (abort.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        urls.push(url);
        onMedia(assetId, url);
      }).catch(() => undefined);
    }
    return () => { abort.abort(); urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [doc?.assets, onMedia]);
}
