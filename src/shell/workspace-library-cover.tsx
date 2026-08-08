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
import type {
  CoverEvidence,
  CoverEvidenceReport,
  WorkspaceCoverFit,
  WorkspaceCoverPlan,
  WorkspaceCoverPlanInput,
  WorkspaceCoverRenderer,
} from "./workspace-cover-contract";

// 六个公开类型移到 `workspace-cover-contract.ts`，此处原样转出：`index.ts` 与三个
// 消费点的既有 import 路径逐字不变。`export type` 在 transpile 时被完整抹除，本模块
// 因此仍是零相对运行时依赖（为什么必须如此，见下方 PDF 白名单那段注释）。
export type * from "./workspace-cover-contract";

/**
 * 按名字自证的合成占位图。放水这一条 = 真占位图直接漏上货架。
 * `library-form-shelf-fill/*` 是 `shelf-fill` 的子串，已被第一项覆盖。
 */
const PLACEHOLDER_RENDERER_MARKERS = ["shelf-fill", "fastfill"] as const;

/** 矢量封面不设字节下限也不要求像素尺寸：它本身就是分辨率无关的完整图形。 */
const VECTOR_COVER_FORMATS = new Set(["svg", "svg+xml"]);

/** 与 imageElementLooksSolidColor 的 <8px 同一条线：声明出来就没法当封面。 */
const COVER_MIN_DECLARED_PIXELS = 8;

const COVER_PURPOSES: readonly ArtifactRenditionPurpose[] = [
  "thumbnail", "preview", "full", "source",
];

const IMAGE_FORMATS = new Set([
  "avif", "bmp", "gif", "heic", "heif", "jpeg", "jpg",
  "png", "svg", "svg+xml", "tif", "tiff", "webp",
]);

const VIDEO_FORMATS = new Set(["m4v", "mkv", "mov", "mp4", "ogv", "webm"]);

const AUDIO_FORMATS = new Set([
  "aac", "flac", "m4a", "mp3", "oga", "ogg", "opus", "wav", "weba",
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

const REAL_COVER_EVIDENCE: CoverEvidenceReport = {
  evidence: "real",
  code: "",
  reason: "",
};

function proven(code: string, reason: string): CoverEvidenceReport {
  return { evidence: "proven-placeholder", code, reason };
}

/**
 * 按证据判封面，不按字节数猜。
 *
 * 字节数**不是**质量代理：2KB 的 SVG 是完整无损的真实图形，50,272 份矢量素材几乎全栽
 * 在旧的 4096 字节下限上；`dimensions` 为 null 也只说明入库时没记尺寸，7,013 份平均
 * 80KB 的 webp 缺的是元数据不是画面。能证实「是占位图」的只有三类：名字自证的货架填充
 * 产物、0 字节载荷、声明出来就承载不了画面的像素尺寸。其余一律不得判死。
 *
 * 名字自证那条只在**证实是别的媒体形态**时豁免：同一批 `library-form-shelf-fill/*`
 * 也盖在真实音频 rendition 上，拿它判死一份 7MB 的 mp3 会把真媒体一起误杀。
 */
export function coverEvidenceReportOf(
  rendition: ArtifactRendition | null | undefined,
  mediaType = "",
  format = "",
): CoverEvidenceReport {
  if (!rendition) return REAL_COVER_EVIDENCE;
  const resolvedMedia = cleanMediaType(mediaType || rendition.mediaType);
  const resolvedFormat = cleanFormat(format || rendition.format);
  // 名字自证那条的作用域比其余判据宽一档：只有**证实是别的媒体形态**才豁免。
  // 「认不出形态」不算豁免理由 —— `workspaceCoverPlan` 会把没报 mediaType/format 的
  // thumbnail 当图片渲染，放过去等于占位图直接上货架。认不出即按图像 fail-closed。
  const provenOtherMedia =
    isVideo(resolvedMedia, resolvedFormat) ||
    isAudio(resolvedMedia, resolvedFormat) ||
    isPdf(resolvedMedia, resolvedFormat) ||
    isHtml(resolvedMedia, resolvedFormat);
  const renderer = String(rendition.rendererVersion || "").toLowerCase();
  if (
    !provenOtherMedia &&
    PLACEHOLDER_RENDERER_MARKERS.some((mark) => renderer.includes(mark))
  ) {
    return proven(
      "synthetic-renderer",
      "这份封面是货架填充生成的占位图，不是素材本身。",
    );
  }
  if (!isImage(resolvedMedia, resolvedFormat)) return REAL_COVER_EVIDENCE;
  if (rendition.byteSize === 0) {
    return proven("empty-payload", "封面文件是空的，没有可显示的画面。");
  }
  const { width, height } = rendition;
  if (
    (typeof width === "number" && width < COVER_MIN_DECLARED_PIXELS) ||
    (typeof height === "number" && height < COVER_MIN_DECLARED_PIXELS)
  ) {
    return proven("degenerate-pixels", "封面只有几个像素，放不出可辨认的画面。");
  }
  if (
    VECTOR_COVER_FORMATS.has(resolvedFormat) ||
    resolvedMedia === "image/svg+xml"
  ) {
    return REAL_COVER_EVIDENCE;
  }
  if (width == null || height == null) {
    return {
      evidence: "unknown-metadata",
      code: "dimensions-missing",
      reason: "封面尺寸信息缺失，已按原图显示。",
    };
  }
  return REAL_COVER_EVIDENCE;
}

/** 合同 §3.2 的三态判据本体。W2 的库搜索投影按这个口径对齐。 */
export function coverEvidenceOf(
  rendition: ArtifactRendition | null | undefined,
  mediaType = "",
  format = "",
): CoverEvidence {
  return coverEvidenceReportOf(rendition, mediaType, format).evidence;
}

/**
 * 四个 purpose 指向同一个 blob 时，thumbnail 只是 source 的别名——生产库 11 万份
 * 素材全是这样，从来没生成过缩略图。别名图仍然能看，所以只降级排序、**不判失败**。
 */
export function isSourceAliasRendition(
  item: LibraryItem | undefined,
  purpose: ArtifactRenditionPurpose,
): boolean {
  if (purpose === "source" || purpose === "full") return false;
  const rendition = item?.artifact?.renditions[purpose];
  const digest = rendition?.digest;
  if (!digest) return false;
  return (["source", "full"] as const).some((other) => {
    const alias = item?.artifact?.renditions[other];
    return Boolean(alias && alias !== rendition && alias.digest === digest);
  });
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
  /**
   * 地图与交互文档的封面是整幅渲出图：地图裁掉边就裁掉了图例与归属声明
   * （`geo-map.md` §2.2 把图例与 28 px 归属条算进 1600×1000 画布，§8.2 要求
   * `attribution.entries` 随产物走），交互文档裁掉边就裁掉了参数控件与结果卡。
   * 两者与下面那批一样 **MUST** 整幅显示，这里显式写出来而不是靠兜底。
   */
  if (artifactType === "geo_map" || artifactType === "interactive_doc") {
    return "contain";
  }
  if (!artifactType && (kind === "geo_map" || kind === "interactive_doc")) {
    return "contain";
  }
  // Pages, slides, vectors, composites, websites, workflows and model posters
  // must remain whole; cropping them turns a real rendition into a false cover.
  return "contain";
}

function supportsVideoCover(
  artifactType: ArtifactType | undefined,
  kind: LibraryKind,
): boolean {
  return (
    artifactType === "video" || artifactType === "workflow" ||
    kind === "video" || kind === "video_canvas"
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
  return artifactType === "pdf" || kind === "document" || kind === "file";
}

/**
 * UC-1 / UC-3 —— 免沙箱 PDF 封面 frame 的第一方主机白名单。
 * 规范来源：docs/architecture/oceanleo-untrusted-content-isolation.md §4.1/§7.5/§8.1/§8.3。
 *
 * 与 `library-viewers.tsx` 同名判定逐字一致：本模块被渲染测试以 data: URL 加载，不能
 * 引入相对运行时依赖，只能复制；一致性由 untrusted-content-pdf-frame-host.test.mjs 锁死。
 *
 * Chromium 内建 PDF 查看器加任何 sandbox 属性都不渲染（crbug 413851），PDF 封面只能免
 * 沙箱。免沙箱 frame 读不到宿主 DOM，但读得到自己 origin 的 cookie，而会话 cookie 非
 * httpOnly，对 cookie 域内任意主机都是「自己的 cookie」。因此域内只放行写死的第一方
 * rendition 网关（响应带 CSP sandbox，落 opaque origin），域外主机与 UGC 域一律挡掉。
 */
// 两个家族的网关都写在这里，判定按「落在哪个 cookie 域里」逐个 host 走，不按页面
// 当前属于哪个家族 —— 这一层是**降权**判定，多覆盖一个家族只会更严：
//   * `.oceanleo.cn` 下的主机以前落在「cookie 域外」，被当成对象存储放行；
//     现在它落在 cn 家族的 cookie 域内，于是只有 cn 网关能放行，其余一律拒。
//   * leoapp.cn 以前完全没被排除，现在与 oceanleo.app 同等挡掉。
// 对 `.com` 主机的结论与本轮改动前逐字相同（`api.oceanleo.com` 放行，其余 cookie
// 域内主机拒，域外对象存储放行）。
const PDF_FRAME_TRUSTED_GATEWAY_HOSTS: readonly string[] = [
  "api.oceanleo.com",
  "api.oceanleo.cn",
];
const PDF_FRAME_UNTRUSTED_REGISTRABLE_DOMAINS: readonly string[] = [
  "oceanleo.app",
  "leoapp.cn",
];
const SSO_COOKIE_REGISTRABLE_DOMAINS: readonly string[] = [
  "oceanleo.com",
  "oceanleo.cn",
];

/** 判定 host 是否落在**任一家族**的共享 cookie 域内。这是降权判定，不是授信判定。 */
function isUnderSsoCookieDomain(host: string): boolean {
  return SSO_COOKIE_REGISTRABLE_DOMAINS.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
}

export function isSandboxExemptPdfFrameUrl(value: string | undefined): boolean {
  let parsed: URL;
  try {
    // 相对地址证明不了自己落在哪个 origin，一律 fail closed。
    parsed = new URL(String(value || ""));
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  if (parsed.username || parsed.password || parsed.port) return false;
  const host = parsed.hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return false;
  if (
    PDF_FRAME_UNTRUSTED_REGISTRABLE_DOMAINS.some(
      (domain) => host === domain || host.endsWith(`.${domain}`),
    )
  ) {
    return false;
  }
  if (isUnderSsoCookieDomain(host)) {
    return PDF_FRAME_TRUSTED_GATEWAY_HOSTS.includes(host);
  }
  return true;
}

function supportsWebsiteCover(
  artifactType: ArtifactType | undefined,
  kind: LibraryKind,
): boolean {
  /**
   * 两个新载体**显式**拒绝 HTML 封面通路。
   *
   * 它们的 `full` rendition 是 JSON 工程信封（`geo-map.md` §1.1、
   * `interactive-doc.md` §1.1 都明令 `source_format` MUST NOT 取 `html`），
   * 一旦上游把某条 rendition 的 media type 误标成 `text/html`，靠「不在下面
   * 白名单里」这种默认行为挡不住 —— `kind` 只要漂成 `website` 就放行了。
   * 所以这里按 artifact type 直接拒。
   */
  if (artifactType === "geo_map" || artifactType === "interactive_doc") {
    return false;
  }
  if (kind === "geo_map" || kind === "interactive_doc") return false;
  return (
    artifactType === "website" || artifactType === "workflow" ||
    kind === "website" || kind === "canvas" || kind === "video_canvas"
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
      coverEvidence: "unknown-metadata",
      evidenceReason: "",
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
  const evidence = coverEvidenceReportOf(rendition, mediaType, format);
  const planOf = (
    renderer: WorkspaceCoverRenderer,
    over: Partial<WorkspaceCoverPlan> = {},
  ): WorkspaceCoverPlan => ({
    renderer,
    url: normalizedUrl,
    mediaType,
    format,
    fit: "contain",
    sourceAspectRatio: ratio,
    failureReason: "",
    coverEvidence: evidence.evidence,
    evidenceReason: evidence.reason,
    ...over,
  });

  if (
    isImage(mediaType, format) ||
    (declaredThumbnail && !mediaType && !format)
  ) {
    if (evidence.evidence === "proven-placeholder") {
      return planOf("unavailable", {
        mediaType: mediaType || "image/*",
        failureReason: evidence.reason,
      });
    }
    // unknown-metadata 只是元数据没写全，图照常显示——弱化交给呈现层。
    return planOf("image", {
      mediaType: mediaType || "image/*",
      fit: imageFit(artifactType, kind, ratio),
    });
  }
  if (isVideo(mediaType, format) && supportsVideoCover(artifactType, kind)) {
    return planOf("video", { mediaType: mediaType || "video/*", fit: "cover" });
  }
  if (isAudio(mediaType, format) && supportsAudioCover(artifactType, kind)) {
    return planOf("audio", { mediaType: mediaType || "audio/*" });
  }
  if (isPdf(mediaType, format) && supportsPdfCover(artifactType, kind)) {
    const pdfPlan = {
      mediaType: mediaType || "application/pdf",
      format: format || "pdf",
    };
    if (!isSandboxExemptPdfFrameUrl(normalizedUrl)) {
      return planOf("unavailable", {
        ...pdfPlan,
        failureReason:
          "PDF 封面地址不在第一方渲染网关白名单内；免沙箱 frame 不得加载它。",
      });
    }
    return planOf("pdf", pdfPlan);
  }
  if (isHtml(mediaType, format) && supportsWebsiteCover(artifactType, kind)) {
    return planOf("website", {
      mediaType: mediaType || "text/html",
      format: format || "html",
    });
  }
  const representation = mediaType || format || "unknown";
  return planOf("unavailable", {
    failureReason: `当前 ${representation} rendition 不能作为真实封面显示。`,
  });
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
  // 真正独立的 thumbnail/preview 排最前；与 source 同 blob 的别名降到它们之后，但
  // **不降到 full/source 之下**——那两个 purpose 的读取权限更严（`can_export_source`），
  // 把封面挪过去会让没有导出权的用户直接看不到图。别名本身仍然可显示，不判失败。
  // sort 稳定，同档保持 COVER_PURPOSES 次序。
  const dedicated = (purpose: ArtifactRenditionPurpose): number =>
    (purpose === "thumbnail" || purpose === "preview") &&
    !isSourceAliasRendition(item, purpose)
      ? 0
      : 1;
  // Empty means truthful unavailable — do not fall back to known-bad posters.
  return purposes.sort((left, right) => dedicated(left) - dedicated(right));
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
    // 手工构造的 plan 绕不过白名单：渲染面自己再判一次（UC-1/UC-3）。
    if (plan.renderer === "pdf" && !isSandboxExemptPdfFrameUrl(plan.url)) {
      return null;
    }
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
        // 封面内容一律按不可信处理：allow-same-origin 永不出现（值与
        // editor-protocol 的 COVER_FRAME_SANDBOX 一致，本模块被渲染测试以
        // data: URL 加载，不能引入相对运行时依赖）。
        // sandbox-exempt: pdf-plugin —— PDF 封面加任何 sandbox 都不渲染。
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
