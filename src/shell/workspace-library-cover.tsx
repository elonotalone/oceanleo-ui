"use client";

import {
  useEffect,
  useRef,
  type CSSProperties,
} from "react";
import type {
  ArtifactRendition,
  ArtifactRenditionPurpose,
  ArtifactType,
} from "./artifact-contract";
import type { LibraryItem, LibraryKind } from "./library-data";

export type WorkspaceCoverRenderer =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "website"
  | "unavailable";

export type WorkspaceCoverFit = "cover" | "contain";

export interface WorkspaceCoverPlan {
  renderer: WorkspaceCoverRenderer;
  url: string;
  mediaType: string;
  format: string;
  fit: WorkspaceCoverFit;
  sourceAspectRatio: number | null;
  failureReason: string;
}

export interface WorkspaceCoverPlanInput {
  item?: LibraryItem;
  kind: LibraryKind;
  url?: string;
  rendition?: ArtifactRendition | null;
  /** A generated/legacy `thumbUrl` is an image declaration, not a source URL. */
  assumeImage?: boolean;
}

/** Matches reviewed-catalog quality floor for PNG/JPEG shelf posters. */
export const COVER_IMAGE_MIN_BYTES = 4096;

const COVER_PURPOSES: readonly ArtifactRenditionPurpose[] = [
  "thumbnail",
  "preview",
  "full",
  "source",
];

const IMAGE_FORMATS = new Set([
  "avif",
  "bmp",
  "gif",
  "heic",
  "heif",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "svg+xml",
  "tif",
  "tiff",
  "webp",
]);

const VIDEO_FORMATS = new Set([
  "m4v",
  "mkv",
  "mov",
  "mp4",
  "ogv",
  "webm",
]);

const AUDIO_FORMATS = new Set([
  "aac",
  "flac",
  "m4a",
  "mp3",
  "oga",
  "ogg",
  "opus",
  "wav",
  "weba",
]);

function cleanMediaType(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .split(";", 1)[0];
}

function cleanFormat(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^\./, "");
}

function extension(value: string): string {
  const match = /\.([a-z0-9+_-]+)(?:$|[?#])/i.exec(value);
  return cleanFormat(match?.[1]);
}

function metaString(
  meta: Record<string, unknown> | undefined,
  ...keys: string[]
): string {
  for (const key of keys) {
    const value = meta?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function renditionForUrl(
  item: LibraryItem | undefined,
  url: string,
): ArtifactRendition | null {
  if (!item?.artifact) return null;
  for (const rendition of Object.values(item.artifact.renditions)) {
    if (rendition?.url === url) return rendition;
  }
  return null;
}

function renditionMediaType(
  item: LibraryItem | undefined,
  rendition: ArtifactRendition | null,
): string {
  if (rendition?.mediaType) return cleanMediaType(rendition.mediaType);
  if (!rendition?.purpose) return "";
  return cleanMediaType(
    metaString(
      item?.meta,
      `${rendition.purpose}_media_type`,
      rendition.purpose === "full" ? "viewer_media_type" : "",
    ),
  );
}

function renditionFormat(
  item: LibraryItem | undefined,
  rendition: ArtifactRendition | null,
  url: string,
): string {
  return (
    cleanFormat(rendition?.format) ||
    extension(url) ||
    (rendition?.purpose === "source"
      ? cleanFormat(metaString(item?.meta, "source_format", "format"))
      : "")
  );
}

function isImage(mediaType: string, format: string): boolean {
  return mediaType.startsWith("image/") || IMAGE_FORMATS.has(format);
}

function isVideo(mediaType: string, format: string): boolean {
  return mediaType.startsWith("video/") || VIDEO_FORMATS.has(format);
}

function isAudio(mediaType: string, format: string): boolean {
  return mediaType.startsWith("audio/") || AUDIO_FORMATS.has(format);
}

function isPdf(mediaType: string, format: string): boolean {
  return mediaType === "application/pdf" || format === "pdf";
}

function isHtml(mediaType: string, format: string): boolean {
  return (
    mediaType === "text/html" ||
    mediaType === "application/xhtml+xml" ||
    format === "html" ||
    format === "htm" ||
    format === "xhtml"
  );
}

function sourceAspectRatio(
  rendition: ArtifactRendition | null,
): number | null {
  const width = rendition?.width || 0;
  const height = rendition?.height || 0;
  return width > 0 && height > 0 ? width / height : null;
}

/**
 * Shelf-fill and other synthetic flat posters are image/* bytes, but they are
 * not meaningful covers. Reject them before the card marks itself ready.
 */
export function isSyntheticFlatImageCover(
  rendition: ArtifactRendition | null | undefined,
  mediaType = "",
  format = "",
): boolean {
  if (!rendition) return false;
  const resolvedMedia = cleanMediaType(mediaType || rendition.mediaType);
  const resolvedFormat = cleanFormat(format || rendition.format);
  if (!isImage(resolvedMedia, resolvedFormat)) return false;
  const renderer = String(rendition.rendererVersion || "").toLowerCase();
  if (
    renderer.includes("shelf-fill") ||
    renderer.includes("library-form-shelf-fill") ||
    renderer.includes("fastfill")
  ) {
    return true;
  }
  const byteSize =
    typeof rendition.byteSize === "number" ? rendition.byteSize : null;
  if (byteSize !== null && byteSize > 0 && byteSize < COVER_IMAGE_MIN_BYTES) {
    return true;
  }
  // Unmeasured tiny posters are almost always solid shelf fills.
  if (
    (rendition.width == null || rendition.height == null) &&
    byteSize !== null &&
    byteSize > 0 &&
    byteSize < COVER_IMAGE_MIN_BYTES * 2
  ) {
    return true;
  }
  return false;
}

/**
 * Sample a loaded HTMLImageElement for solid/near-solid covers. Used after
 * onLoad when wire metadata did not already reject the poster.
 */
export function imageElementLooksSolidColor(
  image: HTMLImageElement,
  maxUniqueColors = 4,
): boolean {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  // Zero size usually means the decode has not finished (jsdom stubs).
  if (width === 0 || height === 0) return false;
  if (width < 8 || height < 8) return true;
  try {
    const canvas = document.createElement("canvas");
    const sampleW = Math.min(64, width);
    const sampleH = Math.min(64, height);
    canvas.width = sampleW;
    canvas.height = sampleH;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;
    ctx.drawImage(image, 0, 0, sampleW, sampleH);
    const data = ctx.getImageData(0, 0, sampleW, sampleH).data;
    const colors = new Set<string>();
    const step = Math.max(1, Math.floor((sampleW * sampleH) / 1024));
    for (let i = 0; i < sampleW * sampleH; i += step) {
      const offset = i * 4;
      // Quantize lightly so JPEG noise does not inflate unique colors.
      const key = `${data[offset] >> 3},${data[offset + 1] >> 3},${data[offset + 2] >> 3}`;
      colors.add(key);
      if (colors.size > maxUniqueColors) return false;
    }
    return colors.size <= maxUniqueColors;
  } catch {
    // Cross-origin without CORS: cannot inspect pixels; trust wire metadata.
    return false;
  }
}

function imageFit(
  artifactType: ArtifactType | undefined,
  kind: LibraryKind,
  ratio: number | null,
): WorkspaceCoverFit {
  if (ratio !== null && (ratio < 0.8 || ratio > 1.9)) return "contain";
  if (
    artifactType === "single_file_image" ||
    artifactType === "video" ||
    artifactType === "audio"
  ) {
    return "cover";
  }
  if (!artifactType && (kind === "image" || kind === "video")) return "cover";
  // Pages, slides, vectors, composites, websites, workflows and model posters
  // must remain whole; cropping them turns a real rendition into a false cover.
  return "contain";
}

function supportsVideoCover(
  artifactType: ArtifactType | undefined,
  kind: LibraryKind,
): boolean {
  return (
    artifactType === "video" ||
    artifactType === "workflow" ||
    kind === "video" ||
    kind === "video_canvas"
  );
}

function supportsAudioCover(
  artifactType: ArtifactType | undefined,
  kind: LibraryKind,
): boolean {
  return artifactType === "audio" || kind === "audio";
}

function supportsPdfCover(
  artifactType: ArtifactType | undefined,
  kind: LibraryKind,
): boolean {
  return (
    artifactType === "pdf" || kind === "document" || kind === "file"
  );
}

function supportsWebsiteCover(
  artifactType: ArtifactType | undefined,
  kind: LibraryKind,
): boolean {
  return (
    artifactType === "website" ||
    artifactType === "workflow" ||
    kind === "website" ||
    kind === "canvas" ||
    kind === "video_canvas"
  );
}

/**
 * Select a browser renderer only from the rendition's declared representation.
 * Unsupported Office/model/scene source files and synthetic flat posters remain
 * explicit failures until a real thumbnail or type-aware media arrives.
 */
export function workspaceCoverPlan({
  item,
  kind,
  url = "",
  rendition: providedRendition,
  assumeImage = false,
}: WorkspaceCoverPlanInput): WorkspaceCoverPlan {
  const normalizedUrl = url.trim();
  if (!normalizedUrl) {
    return {
      renderer: "unavailable",
      url: "",
      mediaType: "",
      format: "",
      fit: "contain",
      sourceAspectRatio: null,
      failureReason: "这个条目没有可显示的真实封面。",
    };
  }
  const rendition =
    providedRendition || renditionForUrl(item, normalizedUrl);
  const mediaType = renditionMediaType(item, rendition);
  const format = renditionFormat(item, rendition, normalizedUrl);
  const ratio = sourceAspectRatio(rendition);
  const artifactType = item?.artifactType;
  const declaredThumbnail =
    rendition?.purpose === "thumbnail" ||
    normalizedUrl === item?.thumbUrl ||
    assumeImage;

  if (
    isImage(mediaType, format) ||
    (declaredThumbnail && !mediaType && !format)
  ) {
    if (isSyntheticFlatImageCover(rendition, mediaType, format)) {
      return {
        renderer: "unavailable",
        url: normalizedUrl,
        mediaType: mediaType || "image/*",
        format,
        fit: "contain",
        sourceAspectRatio: ratio,
        failureReason: "封面是纯色/shelf-fill 占位图，不是真实媒体。",
      };
    }
    return {
      renderer: "image",
      url: normalizedUrl,
      mediaType: mediaType || "image/*",
      format,
      fit: imageFit(artifactType, kind, ratio),
      sourceAspectRatio: ratio,
      failureReason: "",
    };
  }
  if (isVideo(mediaType, format) && supportsVideoCover(artifactType, kind)) {
    return {
      renderer: "video",
      url: normalizedUrl,
      mediaType: mediaType || "video/*",
      format,
      fit: "cover",
      sourceAspectRatio: ratio,
      failureReason: "",
    };
  }
  if (isAudio(mediaType, format) && supportsAudioCover(artifactType, kind)) {
    return {
      renderer: "audio",
      url: normalizedUrl,
      mediaType: mediaType || "audio/*",
      format,
      fit: "contain",
      sourceAspectRatio: ratio,
      failureReason: "",
    };
  }
  if (isPdf(mediaType, format) && supportsPdfCover(artifactType, kind)) {
    return {
      renderer: "pdf",
      url: normalizedUrl,
      mediaType: mediaType || "application/pdf",
      format: format || "pdf",
      fit: "contain",
      sourceAspectRatio: ratio,
      failureReason: "",
    };
  }
  if (isHtml(mediaType, format) && supportsWebsiteCover(artifactType, kind)) {
    return {
      renderer: "website",
      url: normalizedUrl,
      mediaType: mediaType || "text/html",
      format: format || "html",
      fit: "contain",
      sourceAspectRatio: ratio,
      failureReason: "",
    };
  }
  const representation = mediaType || format || "unknown";
  return {
    renderer: "unavailable",
    url: normalizedUrl,
    mediaType,
    format,
    fit: "contain",
    sourceAspectRatio: ratio,
    failureReason: `当前 ${representation} rendition 不能作为真实封面显示。`,
  };
}

/**
 * Skip unusable renditions before the hook refreshes a signed URL. A model
 * source, Office package, scene JSON or synthetic flat poster must not mask a
 * later displayable image/audio/HTML cover.
 */
export function workspaceCoverRenditionPurposes(
  item: LibraryItem,
): ArtifactRenditionPurpose[] {
  if (!item.artifact) return ["thumbnail", "preview"];
  const purposes = COVER_PURPOSES.filter((purpose) => {
    const rendition = item.artifact?.renditions[purpose];
    if (!rendition?.url) return false;
    return (
      workspaceCoverPlan({
        item,
        kind: item.kind,
        url: rendition.url,
        rendition,
      }).renderer !== "unavailable"
    );
  });
  // Empty means truthful unavailable — do not fall back to known-bad posters.
  return purposes;
}

function pdfFirstPageUrl(url: string): string {
  return url.includes("#")
    ? url
    : `${url}#page=1&view=FitH&toolbar=0&navpanes=0&scrollbar=0`;
}

function AudioCoverWaveform({
  url,
  alt,
  className,
  resourceKey,
  mediaType,
  onReady,
  onError,
}: {
  url: string;
  alt: string;
  className: string;
  resourceKey: string;
  mediaType: string;
  onReady: () => void;
  onError: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      onError();
      return;
    }
    const width = 640;
    const height = 360;
    canvas.width = width;
    canvas.height = height;

    void (async () => {
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          credentials: "omit",
          mode: "cors",
        });
        if (!response.ok) throw new Error(`audio cover HTTP ${response.status}`);
        const buffer = await response.arrayBuffer();
        if (!alive) return;
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!AudioCtx) throw new Error("AudioContext unavailable");
        const audioCtx = new AudioCtx();
        try {
          const decoded = await audioCtx.decodeAudioData(buffer.slice(0));
          if (!alive) return;
          const channel = decoded.getChannelData(0);
          const bars = 64;
          const samplesPerBar = Math.max(1, Math.floor(channel.length / bars));
          const peaks: number[] = [];
          for (let i = 0; i < bars; i += 1) {
            let peak = 0;
            const start = i * samplesPerBar;
            const end = Math.min(channel.length, start + samplesPerBar);
            for (let j = start; j < end; j += 1) {
              peak = Math.max(peak, Math.abs(channel[j] || 0));
            }
            peaks.push(peak);
          }
          const maxPeak = Math.max(...peaks, 0.001);
          ctx.fillStyle = "#1c1917";
          ctx.fillRect(0, 0, width, height);
          const barWidth = width / bars;
          for (let i = 0; i < bars; i += 1) {
            const amplitude = peaks[i] / maxPeak;
            const barHeight = Math.max(4, amplitude * (height * 0.72));
            const x = i * barWidth + barWidth * 0.18;
            const y = (height - barHeight) / 2;
            ctx.fillStyle = `hsl(${210 + amplitude * 40} 72% ${42 + amplitude * 28}%)`;
            ctx.fillRect(x, y, barWidth * 0.64, barHeight);
          }
          onReady();
        } finally {
          void audioCtx.close();
        }
      } catch {
        if (alive) onError();
      }
    })();

    return () => {
      alive = false;
      controller.abort();
    };
  }, [mediaType, onError, onReady, resourceKey, url]);

  return (
    <canvas
      ref={canvasRef}
      data-cover-renderer="audio"
      data-cover-fit="contain"
      data-cover-media-type={mediaType}
      role="img"
      aria-label={alt}
      className={className}
    />
  );
}

export function WorkspaceCoverResource({
  plan,
  alt,
  className,
  resourceKey,
  onReady,
  onError,
}: {
  plan: WorkspaceCoverPlan;
  alt: string;
  className: string;
  resourceKey: string;
  onReady: () => void;
  onError: (reason?: "solid-color" | "load") => void;
}) {
  const mediaStyle: CSSProperties = {
    objectFit: plan.fit,
    objectPosition: "center",
  };
  const common = {
    "data-cover-renderer": plan.renderer,
    "data-cover-fit": plan.fit,
    "data-cover-media-type": plan.mediaType,
  };
  if (plan.renderer === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        {...common}
        key={resourceKey}
        src={plan.url}
        alt={alt}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={(event) => {
          const image = event.currentTarget;
          if (imageElementLooksSolidColor(image)) {
            onError("solid-color");
            return;
          }
          onReady();
        }}
        onError={() => onError("load")}
        className={className}
        style={mediaStyle}
      />
    );
  }
  if (plan.renderer === "video") {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video
        {...common}
        key={resourceKey}
        src={plan.url}
        aria-label={alt}
        muted
        playsInline
        preload="metadata"
        onLoadedData={onReady}
        onError={() => onError("load")}
        className={className}
        style={mediaStyle}
      />
    );
  }
  if (plan.renderer === "audio") {
    return (
      <AudioCoverWaveform
        key={resourceKey}
        url={plan.url}
        alt={alt}
        className={className}
        resourceKey={resourceKey}
        mediaType={plan.mediaType}
        onReady={onReady}
        onError={() => onError("load")}
      />
    );
  }
  if (plan.renderer === "pdf" || plan.renderer === "website") {
    return (
      <iframe
        {...common}
        key={resourceKey}
        src={
          plan.renderer === "pdf" ? pdfFirstPageUrl(plan.url) : plan.url
        }
        title={alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        sandbox={plan.renderer === "website" ? "allow-scripts" : undefined}
        tabIndex={-1}
        onLoad={onReady}
        onError={() => onError("load")}
        className={`${className} pointer-events-none border-0 bg-white`}
      />
    );
  }
  return null;
}
