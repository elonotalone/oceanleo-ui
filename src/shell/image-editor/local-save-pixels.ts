/**
 * Native local save: make every image layer of the captured project carry its own pixels.
 *
 * A Fabric snapshot stores an image layer as `src`, the URL the picture was loaded from. For a library
 * picture that is a short-lived signed URL (or a blob: URL), so a project stored on the device would not
 * open again after a restart. Here the already-loaded pixels (the layer's original element, never a new
 * network read) are encoded and written into the snapshot copy that goes to the host. Layer order, crop,
 * size, transform, filters, text and shapes stay as they are; only `src` changes. The live canvas and the
 * in-memory/recovery snapshots are untouched, so undo and collaboration never pay for the encoding.
 */

import { roleOf } from "./editor-objects";

/** Total size of all embedded pixel data URLs in one save (characters ~ bytes). */
export const LOCAL_SAVE_PIXEL_BUDGET = 4_500_000;
/**
 * Largest picture (width x height) that is even tried. Checked before any canvas is allocated: an
 * original may load up to 80 MiB, and a canvas of that area is gigabytes of RGBA. A PNG that fits the
 * byte budget is far smaller than this, so nothing that could be saved is refused by it.
 */
export const LOCAL_SAVE_MAX_PIXELS = 8_000_000;

export class LocalSavePixelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocalSavePixelError";
  }
}

type PixelElement = CanvasImageSource & {
  naturalWidth?: number;
  naturalHeight?: number;
  width?: number;
  height?: number;
};

/** What a snapshot needs from the live canvas object that produced one of its entries. */
interface LiveNode {
  type?: string;
  excludeFromExport?: boolean;
  getObjects?: () => LiveNode[];
  _originalElement?: PixelElement;
}

export interface PixelSource {
  /** The mutable entry in the captured (copied) snapshot JSON. */
  entry: { src?: unknown };
  element: PixelElement;
}

const MISMATCH = "画布图层与待保存内容对不上，没有保存到本机";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Walks the live objects next to the JSON that `toObject` produced from them. The snapshot drops
 * `crop` helper objects at the top level and Fabric drops `excludeFromExport` ones, so the live list is
 * filtered the same way; any count mismatch fails closed instead of guessing.
 */
export function collectPixelSources(
  live: readonly unknown[],
  entries: readonly unknown[],
  out: PixelSource[] = [],
  topLevel = true,
): PixelSource[] {
  const objects = (live as LiveNode[]).filter(
    (object) =>
      !object.excludeFromExport &&
      !(topLevel && roleOf(object as never) === "crop"),
  );
  if (objects.length !== entries.length) throw new LocalSavePixelError(MISMATCH);
  entries.forEach((entry, index) => {
    if (!isRecord(entry)) throw new LocalSavePixelError(MISMATCH);
    const object = objects[index];
    if (entry.type === "Image") {
      const src = typeof entry.src === "string" ? entry.src : "";
      if (!src.startsWith("data:")) {
        const element = object._originalElement;
        if (!element) throw new LocalSavePixelError("有图片图层没有可保存的像素，没有保存到本机");
        out.push({ entry: entry as { src?: unknown }, element });
      }
    }
    if (Array.isArray(entry.objects)) {
      if (typeof object.getObjects !== "function") throw new LocalSavePixelError(MISMATCH);
      collectPixelSources(object.getObjects(), entry.objects, out, false);
    }
  });
  return out;
}

// The same loaded picture is encoded once per page, not once per save. Only URLs that fit the budget are
// kept: a refused giant must not stay resident after the failed save.
const encoded = new WeakMap<object, string>();

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

function sizeOf(element: PixelElement): { width: number; height: number } {
  return {
    width: element.naturalWidth || element.width || 0,
    height: element.naturalHeight || element.height || 0,
  };
}

async function encodePng(element: PixelElement): Promise<string> {
  const { width, height } = sizeOf(element);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new LocalSavePixelError("无法编码图片像素，没有保存到本机");
  context.drawImage(element, 0, 0);
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    try {
      canvas.toBlob(resolve, "image/png");
    } catch (caught) {
      reject(caught);
    }
  });
  if (!blob) throw new LocalSavePixelError("无法编码图片像素，没有保存到本机");
  return blobToDataUrl(blob);
}

/**
 * Replaces each URL-backed image `src` with its own PNG data URL. Throws LocalSavePixelError when a layer
 * has no pixels, the canvas is tainted, or the total would pass `budget`; the caller then drops the
 * snapshot copy, so a half-embedded project is never sent.
 */
export async function embedPixelSources(
  sources: readonly PixelSource[],
  options: {
    budget?: number;
    maxPixels?: number;
    /** Test seam; the editor always uses the real canvas encoder. */
    encode?: (element: PixelElement) => Promise<string>;
  } = {},
): Promise<void> {
  const budget = options.budget ?? LOCAL_SAVE_PIXEL_BUDGET;
  const maxPixels = options.maxPixels ?? LOCAL_SAVE_MAX_PIXELS;
  const encode = options.encode ?? encodePng;
  const tooLarge = () => new LocalSavePixelError("图片太大，无法完整保存到本机；之前的保存仍然保留");
  let total = 0;
  for (const source of sources) {
    let url = encoded.get(source.element);
    if (url === undefined) {
      const { width, height } = sizeOf(source.element);
      if (!width || !height) throw new LocalSavePixelError("有图片图层尚未载入像素，没有保存到本机");
      if (width * height > maxPixels) throw tooLarge();
      try {
        url = await encode(source.element);
      } catch (caught) {
        if (caught instanceof LocalSavePixelError) throw caught;
        throw new LocalSavePixelError("无法读取图片像素（可能受跨域限制），没有保存到本机");
      }
      if (url.length > budget) throw tooLarge();
      encoded.set(source.element, url);
    }
    total += url.length;
    if (total > budget) throw tooLarge();
    source.entry.src = url;
  }
}
