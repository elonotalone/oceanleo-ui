"use client";

// ============================================================================
// @oceanleo/ui — 分享长图的画笔（浏览器侧，2D canvas）
// ----------------------------------------------------------------------------
// 不用无头浏览器、不截聊天页：在用户自己的浏览器里，按 `share-layout.ts` 算好的
// 绘制清单，一笔一笔画出**我们设计的卡片**。与 `doc-editors/editor-preview-raster.ts`
// 是同一路数（全家桶既定做法：结构化模型直接上 canvas）。
//
// 三件事按顺序发生，缺一不可：
//   1. 字体先就位（`document.fonts.ready`），否则量出来的宽度是回退字体的；
//   2. 公式先光栅化、外链图片先取成同源字节（否则画布被污染，`toBlob` 直接报错）；
//   3. 才排版、才落笔。
// ============================================================================

import {
  SHARE_CARD_WIDTH,
  SHARE_MAX_PAGE_HEIGHT,
  layoutShareCard,
  shareFontCss,
  type ShareCardLabels,
  type ShareCardMessage,
  type ShareDrawItem,
  type ShareFont,
  type ShareLayoutResult,
  type ShareMeasureContext,
  type SharePage,
} from "./share-layout";
import { collectMathItems, prepareShareMath, type ShareMathAssets } from "./share-math";
import { encodeQrMatrix } from "./share-qr";
import type { ShareBlock } from "./share-blocks";

/** 单张画布的像素上限：iOS Safari 对**面积**有硬限制，超了 toBlob 直接回 null。 */
const MAX_CANVAS_PIXELS = 16_000_000;

export interface RenderShareCardInput {
  messages: readonly ShareCardMessage[];
  labels: ShareCardLabels;
  /** 二维码要回链的地址（一般就是 Copy Link 那个）。空则不画二维码。 */
  qrText?: string;
  width?: number;
  maxPageHeight?: number;
  /** 像素密度上限，默认 2。 */
  maxScale?: number;
}

export interface ShareCardImages {
  blobs: Blob[];
  layout: ShareLayoutResult;
  /** 公式没能光栅化的条数（>0 表示图上是等宽兜底）。 */
  formulaFailures: number;
}

// ---------------------------------------------------------------------------
// 资源准备
// ---------------------------------------------------------------------------

async function loadFonts(): Promise<void> {
  try {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (!fonts) return;
    await fonts.ready;
  } catch {
    // 老浏览器没有 FontFaceSet：直接量，最坏是宽度略有偏差。
  }
}

/**
 * 外链图片先取成同源字节再画。直接 `img.src = 远端 url` 会让画布沾上跨源污点，
 * 之后 `toBlob` 抛 SecurityError —— 长图就一张也出不来。
 */
async function loadImage(src: string): Promise<HTMLImageElement | null> {
  try {
    const response = await fetch(src, { mode: "cors", cache: "force-cache" });
    if (!response.ok) return null;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const image = await new Promise<HTMLImageElement | null>((resolve) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => resolve(null);
      element.src = url;
    });
    URL.revokeObjectURL(url);
    return image;
  } catch {
    return null;
  }
}

function collectImageSources(messages: readonly ShareCardMessage[]): string[] {
  const out = new Set<string>();
  for (const message of messages) {
    for (const block of message.blocks) {
      if (block.type === "image" && block.src) out.add(block.src);
    }
  }
  return [...out];
}

function collectBlocks(messages: readonly ShareCardMessage[]): ShareBlock[] {
  return messages.flatMap((message) => message.blocks);
}

// ---------------------------------------------------------------------------
// 测量
// ---------------------------------------------------------------------------

function createMeasureContext(
  context: CanvasRenderingContext2D,
  math: ShareMathAssets,
  images: Map<string, HTMLImageElement>,
): ShareMeasureContext {
  const cache = new Map<string, number>();
  return {
    measureText(text, font) {
      const css = shareFontCss(font);
      const key = `${css}\u0000${text}`;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      context.font = css;
      const width = context.measureText(text).width;
      cache.set(key, width);
      return width;
    },
    measureMath(tex, display) {
      return math.size(tex, display);
    },
    imageSize(src) {
      const image = images.get(src);
      if (!image) return null;
      return {
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// 落笔
// ---------------------------------------------------------------------------

function roundedPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const limit = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  if (typeof context.roundRect === "function") {
    context.roundRect(x, y, width, height, limit);
    return;
  }
  context.moveTo(x + limit, y);
  context.arcTo(x + width, y, x + width, y + height, limit);
  context.arcTo(x + width, y + height, x, y + height, limit);
  context.arcTo(x, y + height, x, y, limit);
  context.arcTo(x, y, x + width, y, limit);
  context.closePath();
}

function drawText(
  context: CanvasRenderingContext2D,
  item: Extract<ShareDrawItem, { kind: "text" }>,
): void {
  const font: ShareFont = item.font;
  context.font = shareFontCss(font);
  context.fillStyle = item.color;
  context.textBaseline = "top";
  const width = context.measureText(item.text).width;
  const x =
    item.align === "right"
      ? item.x - width
      : item.align === "center"
        ? item.x - width / 2
        : item.x;
  context.fillText(item.text, x, item.y);
  if (item.underline || item.strike) {
    context.strokeStyle = item.color;
    context.lineWidth = Math.max(1, font.size / 14);
    const y = item.strike
      ? item.y + font.size * 0.62
      : item.y + font.size * 1.16;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + width, y);
    context.stroke();
  }
}

function drawQr(
  context: CanvasRenderingContext2D,
  item: Extract<ShareDrawItem, { kind: "qr" }>,
): void {
  const count = item.modules.length;
  if (!count) return;
  const quiet = 2;
  const unit = item.size / (count + quiet * 2);
  context.fillStyle = "#ffffff";
  context.fillRect(item.x, item.y, item.size, item.size);
  context.fillStyle = "#1c1917";
  for (let row = 0; row < count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      if (!item.modules[row][column]) continue;
      context.fillRect(
        item.x + (column + quiet) * unit,
        item.y + (row + quiet) * unit,
        Math.ceil(unit),
        Math.ceil(unit),
      );
    }
  }
}

function paintPage(
  page: SharePage,
  scale: number,
  math: ShareMathAssets,
  images: Map<string, HTMLImageElement>,
): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(page.width * scale);
  canvas.height = Math.round(page.height * scale);
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.scale(scale, scale);
  context.textBaseline = "top";
  for (const item of page.items) {
    switch (item.kind) {
      case "rect": {
        if (item.radius) roundedPath(context, item.x, item.y, item.width, item.height, item.radius);
        if (item.fill) {
          context.fillStyle = item.fill;
          if (item.radius) context.fill();
          else context.fillRect(item.x, item.y, item.width, item.height);
        }
        if (item.stroke) {
          context.strokeStyle = item.stroke;
          context.lineWidth = item.lineWidth ?? 1;
          if (item.radius) context.stroke();
          else
            context.strokeRect(
              item.x + 0.5,
              item.y + 0.5,
              Math.max(0, item.width - 1),
              Math.max(0, item.height - 1),
            );
        }
        break;
      }
      case "line":
        context.strokeStyle = item.color;
        context.lineWidth = item.thickness;
        context.beginPath();
        context.moveTo(item.x, item.y + 0.5);
        context.lineTo(item.x + item.width, item.y + 0.5);
        context.stroke();
        break;
      case "text":
        drawText(context, item);
        break;
      case "image": {
        const image = images.get(item.src);
        if (!image) break;
        context.save();
        if (item.radius) {
          roundedPath(context, item.x, item.y, item.width, item.height, item.radius);
          context.clip();
        }
        context.drawImage(image, item.x, item.y, item.width, item.height);
        context.restore();
        break;
      }
      case "math": {
        const source = math.image(item.tex, item.display);
        if (!source) break;
        context.drawImage(source, item.x, item.y, item.width, item.height);
        break;
      }
      case "qr":
        drawQr(context, item);
        break;
      default:
        break;
    }
  }
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      if (typeof canvas.toBlob !== "function") {
        resolve(null);
        return;
      }
      canvas.toBlob((blob) => resolve(blob), "image/png");
    } catch {
      resolve(null);
    }
  });
}

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------

export async function renderShareCardImages(
  input: RenderShareCardInput,
): Promise<ShareCardImages> {
  if (typeof document === "undefined") {
    throw new Error("长图只能在浏览器里生成。");
  }
  const width = input.width ?? SHARE_CARD_WIDTH;
  const maxPageHeight = input.maxPageHeight ?? SHARE_MAX_PAGE_HEIGHT;

  await loadFonts();
  const blocks = collectBlocks(input.messages);
  const math = await prepareShareMath(collectMathItems(blocks));

  const images = new Map<string, HTMLImageElement>();
  for (const src of collectImageSources(input.messages)) {
    const image = await loadImage(src);
    if (image) images.set(src, image);
  }

  const probe = document.createElement("canvas");
  const probeContext = probe.getContext("2d");
  if (!probeContext) throw new Error("这台设备不支持画布，长图生成不了。");

  const layout = layoutShareCard(
    input.messages,
    input.labels,
    createMeasureContext(probeContext, math, images),
    {
      width,
      maxPageHeight,
      qrModules: input.qrText ? encodeQrMatrix(input.qrText)?.modules ?? null : null,
    },
  );

  const blobs: Blob[] = [];
  for (const page of layout.pages) {
    const scale = Math.max(
      1,
      Math.min(
        input.maxScale ?? 2,
        Math.sqrt(MAX_CANVAS_PIXELS / Math.max(1, page.width * page.height)),
      ),
    );
    const canvas = paintPage(page, scale, math, images);
    if (!canvas) continue;
    const blob = await toBlob(canvas);
    if (blob) blobs.push(blob);
  }
  if (!blobs.length) throw new Error("长图没能画出来，请稍后重试。");
  return { blobs, layout, formulaFailures: math.failures };
}

/** 触发浏览器下载。多张时按 `-1`、`-2` 编号。 */
export function downloadBlobs(blobs: readonly Blob[], baseName: string): void {
  blobs.forEach((blob, index) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download =
      blobs.length > 1 ? `${baseName}-${index + 1}.png` : `${baseName}.png`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}
