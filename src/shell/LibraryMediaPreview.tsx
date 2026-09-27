"use client";

import { useCallback, useEffect, useRef } from "react";

/** Keep the library panel mounted while releasing its inactive media stream. */
export function LibraryMediaPreview({
  kind,
  src,
  className,
  onError,
}: {
  kind: "video" | "audio";
  src: string;
  className: string;
  onError: () => void;
}) {
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const resumeTime = useRef<number | null>(null);
  const setMediaRef = useCallback((node: HTMLMediaElement | null) => {
    mediaRef.current = node;
  }, []);

  useEffect(() => {
    const media = mediaRef.current;
    const view = media?.ownerDocument.defaultView;
    if (!media || !view) return;
    const panel = media.closest("[data-workspace-slot-panel]");
    const release = () => {
      if (!media.hasAttribute("src")) return;
      // A second release during a reload must not replace the saved position
      // with the zero imposed by load().
      if (media.readyState >= 1 && Number.isFinite(media.currentTime)) {
        resumeTime.current = media.currentTime;
      }
      media.pause();
      media.removeAttribute("src");
      media.load();
    };
    const restoreTime = () => {
      const saved = resumeTime.current;
      if (saved == null || !media.hasAttribute("src")) return;
      media.currentTime = Math.min(
        saved,
        Number.isFinite(media.duration) ? media.duration : saved,
      );
      resumeTime.current = null;
    };
    const sync = () => {
      if (panel && panel.getAttribute("data-workspace-slot-active") !== "true") {
        release();
        return;
      }
      if (media.getAttribute("src") !== src) {
        media.src = src;
        media.load();
      }
    };
    media.addEventListener("loadedmetadata", restoreTime);
    const observer = new view.MutationObserver(sync);
    if (panel) {
      observer.observe(panel, {
        attributes: true,
        attributeFilter: ["data-workspace-slot-active"],
      });
    }
    sync();
    return () => {
      observer.disconnect();
      media.removeEventListener("loadedmetadata", restoreTime);
      release();
    };
  }, [kind, src]);

  const handleError = () => {
    const media = mediaRef.current;
    if (media?.hasAttribute("src") && media.error) onError();
  };
  const props = { ref: setMediaRef, controls: true, className, onError: handleError };
  return kind === "video" ? (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video {...props} />
  ) : (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <audio {...props} />
  );
}
