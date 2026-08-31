"use client";

// ============================================================================
// 上传前的客户端图片压缩（canvas + toBlob，零依赖）
// ----------------------------------------------------------------------------
// 判据（W08 P3）：
//   · **只压图片**，视频音频文档一个字节都不碰；
//   · 长边超阈值（默认 4096）才压；没超就原样放过，不做无谓的重编码；
//   · **保留原始文件供用户选择**，默认压缩、可一键改回原图——不许静默降质；
//   · 压缩前后字节数要交出去（这是用户信任这个功能的唯一方式）。
//
// 为什么不引压缩库（红线 6）：这件事 canvas 就够了。
// `createImageBitmap` + `OffscreenCanvas` 在支持的浏览器上把解码与重编码都挪出
// 主线程，不支持的回落到 `<img>` + `<canvas>`。两条路的输出口径相同。
//
// 【不碰的三类，各有理由，不是偷懒】
//   · GIF：canvas 只拿得到第一帧，压完动图就死了。宁可原样传。
//   · SVG：矢量，栅格化等于毁掉它；而且网关对 SVG 另有消毒路径
//     （`database_router.py` 的 `sanitize_svg`），别在这儿抢它的活。
//   · 已经很小的：见 `MIN_COMPRESS_BYTES`。为一张 80KB 的图重编码一遍，
//     省不下多少还可能变大。
//
// 【压完更大就丢弃压缩结果】
// 有损重编码不保证变小：一张已经压到极限的 JPEG 重编码常常变大。
// 那种情况下返回原图并把 `compressed` 标成 false——「压缩」这个词只在真的变小了
// 的时候才配说出口。
// ============================================================================

/** 长边超过这个像素数才压。4096 是 P3 的建议值。 */
export const DEFAULT_MAX_EDGE = 4096;

/** 小于这个字节数不压。 */
export const MIN_COMPRESS_BYTES = 512 * 1024;

/** 有损编码质量。0.82 是肉眼几乎看不出差别、体积却掉一大截的常用拐点。 */
export const DEFAULT_QUALITY = 0.82;

/** canvas 能可靠重编码的输入类型。 */
const COMPRESSIBLE_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/bmp",
]);

/** 一次压缩尝试的结果。**永远同时带着原图。** */
export interface CompressionOutcome {
  /** 用户选的那个文件（原图）。 */
  original: File;
  /** 建议上传的文件。没压 / 压不动时**就是 `original` 本身**（同一个对象）。 */
  upload: File;
  /** 真的压小了才是 true。 */
  compressed: boolean;
  originalBytes: number;
  uploadBytes: number;
  /**
   * 没压的原因，压了则为 `null`。给 UI 用来解释「为什么这张没压」，
   * 也给测试用来钉住「哪些类型不许被碰」。
   */
  skippedReason: CompressionSkipReason | null;
}

export type CompressionSkipReason =
  | "not-an-image"
  | "animated-or-vector"
  | "unsupported-image-type"
  | "already-small"
  | "within-max-edge"
  | "canvas-unavailable"
  | "encode-failed"
  | "not-smaller";

export interface CompressOptions {
  maxEdge?: number;
  quality?: number;
  minBytes?: number;
}

function skip(file: File, reason: CompressionSkipReason): CompressionOutcome {
  return {
    original: file,
    upload: file,
    compressed: false,
    originalBytes: file.size,
    uploadBytes: file.size,
    skippedReason: reason,
  };
}

/** 是不是图片。用 MIME 判，MIME 缺失时退回扩展名。 */
export function isImageFile(file: File): boolean {
  if (file.type) return file.type.toLowerCase().startsWith("image/");
  return /\.(jpe?g|png|webp|bmp|gif|svg)$/i.test(file.name || "");
}

function normalizedType(file: File): string {
  const declared = (file.type || "").toLowerCase();
  if (declared) return declared;
  const extension = (file.name.split(".").pop() || "").toLowerCase();
  const byExtension: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    bmp: "image/bmp",
    gif: "image/gif",
    svg: "image/svg+xml",
  };
  return byExtension[extension] || "";
}

/**
 * 压缩后该用哪个输出类型。
 *
 * PNG 一律转 JPEG：PNG 是无损的，`toBlob("image/png")` 重编码基本不会变小，
 * 而超过 4096 长边的 PNG 通常是照片或截图，转 JPEG 才有意义。
 * 代价是**丢掉透明通道**——所以这里只在「确实要压」的分支上转，
 * 而 `MIN_COMPRESS_BYTES` 与长边阈值已经把小图标、UI 素材那类挡在外面。
 * WebP 保持 WebP（它自己就有有损档，且支持透明）。
 */
function outputType(sourceType: string): "image/jpeg" | "image/webp" {
  return sourceType === "image/webp" ? "image/webp" : "image/jpeg";
}

function outputName(name: string, type: string): string {
  const extension = type === "image/webp" ? "webp" : "jpg";
  const stem = name.replace(/\.[^.]+$/, "") || "image";
  return `${stem}.${extension}`;
}

/** 按长边上限等比缩放。已经在限内则原尺寸返回。 */
export function scaleToMaxEdge(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number; scaled: boolean } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height, scaled: false };
  const ratio = maxEdge / longest;
  return {
    // 至少 1px：极端长条图（1×20000）缩到 0 会让 canvas 抛异常。
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
    scaled: true,
  };
}

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

async function decode(file: File): Promise<Decoded | null> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      /* 回落到 <img> */
    }
  }
  if (typeof document === "undefined" || typeof URL?.createObjectURL !== "function") {
    return null;
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement | null>((resolve) => {
      const element = document.createElement("img");
      element.onload = () => resolve(element);
      element.onerror = () => resolve(null);
      element.src = url;
    });
    if (!image) {
      URL.revokeObjectURL(url);
      return null;
    }
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

async function encode(
  decoded: Decoded,
  width: number,
  height: number,
  type: string,
  quality: number,
): Promise<Blob | null> {
  if (typeof OffscreenCanvas === "function") {
    try {
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d");
      if (!context) return null;
      context.drawImage(decoded.source, 0, 0, width, height);
      return await canvas.convertToBlob({ type, quality });
    } catch {
      /* 回落到 <canvas> */
    }
  }
  if (typeof document === "undefined") return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(decoded.source, 0, 0, width, height);
    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), type, quality);
    });
  } catch {
    return null;
  }
}

/**
 * 一张图 → 「原图 + 建议上传的那份」。
 *
 * **不抛异常。** 任何一步失败都落成「没压 + 原因」，因为压缩失败绝不该让上传失败。
 */
export async function compressImageFile(
  file: File,
  options: CompressOptions = {},
): Promise<CompressionOutcome> {
  const maxEdge = options.maxEdge ?? DEFAULT_MAX_EDGE;
  const quality = options.quality ?? DEFAULT_QUALITY;
  const minBytes = options.minBytes ?? MIN_COMPRESS_BYTES;

  if (!isImageFile(file)) return skip(file, "not-an-image");
  const sourceType = normalizedType(file);
  if (sourceType === "image/gif" || sourceType === "image/svg+xml") {
    return skip(file, "animated-or-vector");
  }
  if (!COMPRESSIBLE_MIME.has(sourceType)) {
    return skip(file, "unsupported-image-type");
  }
  if (file.size < minBytes) return skip(file, "already-small");

  const decoded = await decode(file);
  if (!decoded) return skip(file, "canvas-unavailable");

  try {
    const target = scaleToMaxEdge(decoded.width, decoded.height, maxEdge);
    // 长边在限内：P3 说「长边超过阈值才压」，那就不压。
    if (!target.scaled) return skip(file, "within-max-edge");

    const type = outputType(sourceType);
    const blob = await encode(decoded, target.width, target.height, type, quality);
    if (!blob || blob.size === 0) return skip(file, "encode-failed");
    if (blob.size >= file.size) return skip(file, "not-smaller");

    const compressed = new File([blob], outputName(file.name, type), {
      type,
      lastModified: file.lastModified,
    });
    return {
      original: file,
      upload: compressed,
      compressed: true,
      originalBytes: file.size,
      uploadBytes: compressed.size,
      skippedReason: null,
    };
  } catch {
    return skip(file, "encode-failed");
  } finally {
    decoded.release();
  }
}

/**
 * 一批文件走同一条压缩决策。
 * 非图片原样穿过——调用方因此可以把用户选的整批文件无差别丢进来。
 */
export async function compressImageFiles(
  files: readonly File[],
  options: CompressOptions = {},
): Promise<CompressionOutcome[]> {
  const outcomes: CompressionOutcome[] = [];
  // 刻意串行：并行解码几张 8000×6000 的图会把内存顶上去，
  // 而这条路本来就在等用户下一步操作，快 200ms 没有价值。
  for (const file of files) {
    outcomes.push(await compressImageFile(file, options));
  }
  return outcomes;
}

/** 这批里真被压过的合计省了多少字节。 */
export function savedBytes(outcomes: readonly CompressionOutcome[]): number {
  return outcomes.reduce(
    (total, outcome) =>
      total + (outcome.compressed ? outcome.originalBytes - outcome.uploadBytes : 0),
    0,
  );
}
