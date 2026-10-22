"use client";

/**
 * PDF cover = a first-page raster rendered by our PDFium (EmbedPDF) engine.
 *
 * It replaces an unsandboxed iframe on the PDF URL (the browser's built-in
 * PDF viewer). The bytes come through the media proxy, page 1 is rendered once,
 * and the result is cached per resource key (item + revision). Any failure is
 * reported through `onError("load")`, so the caller's existing poster/thumb
 * fallback applies. No frame is ever created.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { fetchMediaBlob } from "../lib/media-proxy";
import { openPdfEngineDocument } from "./media-editors/pdf-engine-host";

const COVER_WIDTH_PX = 480;
const MAX_COVER_BYTES = 48 * 1024 * 1024;
const MAX_CACHED_COVERS = 48;
const coverCache = new Map<string, string>();

function remember(key: string, dataUrl: string): void {
  coverCache.delete(key);
  coverCache.set(key, dataUrl);
  while (coverCache.size > MAX_CACHED_COVERS) {
    const oldest = coverCache.keys().next().value;
    if (oldest === undefined) break;
    coverCache.delete(oldest);
  }
}

export function clearPdfCoverCacheForTests(): void {
  coverCache.clear();
}

async function renderFirstPage(url: string, signal: AbortSignal): Promise<string> {
  const blob = await fetchMediaBlob(url, { signal, maxBytes: MAX_COVER_BYTES });
  const opened = await openPdfEngineDocument(
    new Uint8Array(await blob.arrayBuffer()),
  );
  try {
    const page = opened.doc.pages[0];
    if (!page) throw new Error("empty pdf");
    const image = await opened.engine
      .renderPageRaw(opened.doc, page, {
        scaleFactor: COVER_WIDTH_PX / Math.max(1, page.size.width),
      })
      .toPromise();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no canvas");
    context.putImageData(
      new ImageData(
        new Uint8ClampedArray(image.data) as Uint8ClampedArray<ArrayBuffer>,
        image.width,
        image.height,
      ),
      0,
      0,
    );
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    await opened.close();
  }
}

export function WorkspacePdfCover({
  url,
  alt,
  className,
  resourceKey,
  style,
  common,
  onReady,
  onError,
}: {
  url: string;
  alt: string;
  className: string;
  resourceKey: string;
  style: CSSProperties;
  common: Record<string, string>;
  onReady: () => void;
  onError: (reason?: "solid-color" | "load") => void;
}) {
  const [src, setSrc] = useState(() => coverCache.get(resourceKey) ?? "");
  useEffect(() => {
    const cached = coverCache.get(resourceKey);
    if (cached) {
      setSrc(cached);
      return;
    }
    setSrc("");
    const abort = new AbortController();
    let disposed = false;
    void renderFirstPage(url, abort.signal)
      .then((dataUrl) => {
        if (disposed) return;
        remember(resourceKey, dataUrl);
        setSrc(dataUrl);
      })
      .catch(() => {
        if (!disposed) onError("load");
      });
    return () => {
      disposed = true;
      abort.abort();
    };
    // onError is the caller's per-render closure; identity must not restart the render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, resourceKey]);
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...common}
      src={src}
      alt={alt}
      decoding="async"
      onLoad={onReady}
      onError={() => onError("load")}
      className={className}
      style={style}
    />
  );
}

export default WorkspacePdfCover;
