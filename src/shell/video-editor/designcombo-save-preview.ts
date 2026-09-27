import { fetchMediaBlob } from "../../lib/media-proxy";
import type { LibraryItem } from "../library-data";
import type { OpenVideoProject } from "./designcombo/schema";
import type { TimelinePreviewEngine } from "./preview-engine";

type PreviewSize = { width: number; height: number };

function dimension(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function newCanvas(size: PreviewSize): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  return canvas;
}

function png(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob?.size && blob.type === "image/png") resolve(blob);
      else reject(new Error("封面图片未生成"));
    }, "image/png");
  });
}

function fitImage(
  source: CanvasImageSource,
  sourceSize: PreviewSize,
  size: PreviewSize,
): HTMLCanvasElement {
  if (!sourceSize.width || !sourceSize.height) throw new Error("封面图片为空");
  const canvas = newCanvas(size);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法绘制封面图片");
  context.fillStyle = "#0c0a09";
  context.fillRect(0, 0, size.width, size.height);
  const scale = Math.min(size.width / sourceSize.width, size.height / sourceSize.height);
  const width = sourceSize.width * scale;
  const height = sourceSize.height * scale;
  context.drawImage(source, (size.width - width) / 2, (size.height - height) / 2, width, height);
  return canvas;
}

function titleCard(title: string, size: PreviewSize): HTMLCanvasElement {
  const canvas = newCanvas(size);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法绘制封面图片");
  context.fillStyle = "#0c0a09";
  context.fillRect(0, 0, size.width, size.height);
  context.fillStyle = "#ffffff";
  context.font = `${Math.max(1, Math.round(Math.min(size.width, size.height) / 14))}px sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(title.trim() || "视频", size.width / 2, size.height / 2, size.width * 0.85);
  return canvas;
}

/** Freeze the current frame before project upload; later edits must not change its cover. */
export function createVideoDesigncomboPreview(input: {
  project: OpenVideoProject;
  item: Pick<LibraryItem, "previewUrl" | "thumbUrl" | "meta">;
  title: string;
  engine: Pick<TimelinePreviewEngine, "captureRenditionCanvas"> | null;
  frameReady: boolean;
}): () => Promise<Blob> {
  const size = {
    width: dimension(input.item.meta.preview_width, input.project.settings.width),
    height: dimension(input.item.meta.preview_height, input.project.settings.height),
  };
  let frame: HTMLCanvasElement | null = null;
  try {
    if (input.frameReady) frame = input.engine?.captureRenditionCanvas("preview") ?? null;
  } catch {
    // A missing/tainted stage must not prevent saving the editable project.
  }
  const coverUrls = [...new Set([
    input.item.previewUrl,
    input.item.thumbUrl,
    input.item.meta.preview_url,
    input.item.meta.previewUrl,
    input.item.meta.cover_url,
    input.item.meta.thumb_url,
  ].filter((value): value is string => typeof value === "string" && Boolean(value.trim())))];
  const title = input.title;

  return async () => {
    if (frame) {
      try {
        const canvas = frame.width === size.width && frame.height === size.height
          ? frame
          : fitImage(frame, frame, size);
        return await png(canvas);
      } catch {
        // Try existing material covers if capture/encoding cannot read the frame.
      }
    }
    for (const url of coverUrls) {
      try {
        const blob = await fetchMediaBlob(url, {
          maxBytes: 20 * 1024 * 1024,
          signal: AbortSignal.timeout(5_000),
        });
        const bitmap = await createImageBitmap(blob);
        try {
          return await png(fitImage(bitmap, bitmap, size));
        } finally {
          bitmap.close();
        }
      } catch {
        // A preview URL can also point at a video/project, or have expired.
      }
    }
    try {
      // Last resort: a fresh canvas, independent of any tainted media canvas.
      return await png(titleCard(title, size));
    } catch {
      throw new Error("无法生成视频封面，草稿尚未保存。请稍后重试。");
    }
  };
}
