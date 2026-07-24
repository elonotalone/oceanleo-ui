import type { CSSProperties } from "react";
import type {
  ArtifactRendition,
  ArtifactRenditionPurpose,
  ArtifactType,
} from "./artifact-contract";
import type { LibraryItem, LibraryKind } from "./library-data";

export type WorkspaceCoverRenderer =
  | "image"
  | "video"
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

const COVER_PURPOSES: readonly ArtifactRenditionPurpose[] = [
  "thumbnail",
  "preview",
  "full",
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
 * Unsupported Office/model/scene source files remain explicit failures until a
 * real thumbnail or preview arrives; they never become a colored success tile.
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
 * source, Office package or scene JSON must not mask a later image/HTML cover.
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
  // Keep the canonical refresh/error path when no displayable cover exists.
  return purposes.length > 0 ? purposes : ["thumbnail", "preview"];
}

function pdfFirstPageUrl(url: string): string {
  return url.includes("#")
    ? url
    : `${url}#page=1&view=FitH&toolbar=0&navpanes=0&scrollbar=0`;
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
  onError: () => void;
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
        onLoad={onReady}
        onError={onError}
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
        onError={onError}
        className={className}
        style={mediaStyle}
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
        onError={onError}
        className={`${className} pointer-events-none border-0 bg-white`}
      />
    );
  }
  return null;
}
