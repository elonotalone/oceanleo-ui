import { initializeCanvas, readPsd } from "ag-psd";

/** 浏览器认 PSD 的三种常见 MIME。 */
export const PSD_MIMES = [
  "image/vnd.adobe.photoshop",
  "image/x-photoshop",
  "application/x-photoshop",
] as const;

export const PSD_NO_COMPOSITE_ZH =
  "这个 PSD 里没有可显示的合成图，请在 Photoshop 里勾选「最大兼容」后重新上传。";

const PSD_MIME_SET = new Set<string>(PSD_MIMES);

export class PsdCompositeError extends Error {
  constructor(message = PSD_NO_COMPOSITE_ZH) {
    super(message);
    this.name = "PsdCompositeError";
  }
}

function extensionOf(value: string): string {
  const path = String(value || "").split(/[?#]/)[0];
  const base = path.split("/").pop() || "";
  if (!base.includes(".")) return "";
  return (base.split(".").pop() || "").trim().toLowerCase();
}

export function isPsdSource(
  input: {
    url?: string;
    format?: string;
    mime?: string;
    name?: string;
  } = {},
): boolean {
  if (String(input.format || "").trim().toLowerCase() === "psd") return true;
  if (PSD_MIME_SET.has(String(input.mime || "").trim().toLowerCase())) {
    return true;
  }
  return (
    extensionOf(input.url || "") === "psd" ||
    extensionOf(input.name || "") === "psd"
  );
}

export function assertFabricImageOpenUrl(url: string): string {
  if (isPsdSource({ url })) {
    throw new PsdCompositeError();
  }
  return url;
}

let nodeCanvasReady = false;

function ensurePsdCanvas() {
  if (typeof document !== "undefined" || nodeCanvasReady) return;
  initializeCanvas(
    (width, height) => {
      const pixels = new Uint8ClampedArray(
        Math.max(1, width) * Math.max(1, height) * 4,
      );
      const ctx = {
        createImageData(w: number, h: number) {
          return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
        },
        getImageData() {
          return { width, height, data: pixels };
        },
        putImageData(image: { data: ArrayLike<number> }) {
          const src = image.data;
          for (let i = 0; i < pixels.length && i < src.length; i += 1) {
            pixels[i] = Number(src[i]) || 0;
          }
        },
        drawImage() {},
        scale() {},
        toDataURL() {
          return "";
        },
      };
      return {
        width,
        height,
        getContext: () => ctx,
        toDataURL: () =>
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      } as unknown as HTMLCanvasElement;
    },
    (width, height) =>
      ({
        width,
        height,
        data: new Uint8ClampedArray(width * height * 4),
      }) as ImageData,
  );
  nodeCanvasReady = true;
}

function canvasHasPixels(canvas: HTMLCanvasElement | undefined): boolean {
  if (!canvas) return false;
  const width = Math.max(0, Number(canvas.width) || 0);
  const height = Math.max(0, Number(canvas.height) || 0);
  if (width < 1 || height < 1) return false;
  const image = canvas.getContext("2d")?.getImageData(0, 0, width, height);
  const data = image?.data;
  if (!data || data.length < 4) return true;
  for (let i = 3; i < data.length; i += 4) {
    if (Number(data[i]) > 0) return true;
  }
  return false;
}

export async function decodePsdCompositeToPng(
  bytes: ArrayBuffer | Uint8Array,
): Promise<string> {
  ensurePsdCanvas();
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const psd = readPsd(buffer, {
    skipLayerImageData: true,
    skipThumbnail: true,
  });
  const canvas = psd.canvas;
  if (!canvas || !canvasHasPixels(canvas)) {
    throw new PsdCompositeError();
  }
  if (typeof canvas.toDataURL === "function") {
    const url = canvas.toDataURL("image/png");
    if (url && url.startsWith("data:image/png")) return url;
  }
  if (typeof canvas.toBlob === "function") {
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((value) => resolve(value), "image/png");
    });
    if (blob) return URL.createObjectURL(blob);
  }
  throw new PsdCompositeError();
}

export type ResolvePsdCanvasSourceInput = {
  url: string;
  format?: string;
  mime?: string;
  name?: string;
  previewUrl?: string;
  thumbUrl?: string;
  bytes?: ArrayBuffer | Uint8Array;
  fetchBytes?: (url: string) => Promise<ArrayBuffer>;
};

export type ResolvePsdCanvasSourceResult =
  | { ok: true; canvasUrl: string }
  | { ok: false; error: string };

function firstNonPsdUrl(...urls: Array<string | undefined>): string {
  for (const url of urls) {
    const trimmed = String(url || "").trim();
    if (trimmed && !isPsdSource({ url: trimmed })) return trimmed;
  }
  return "";
}

export async function resolvePsdCanvasSource(
  input: ResolvePsdCanvasSourceInput,
): Promise<ResolvePsdCanvasSourceResult> {
  try {
    const bytes =
      input.bytes ||
      (input.fetchBytes ? await input.fetchBytes(input.url) : undefined);
    if (!bytes) throw new PsdCompositeError();
    const png = await decodePsdCompositeToPng(bytes);
    return { ok: true, canvasUrl: assertFabricImageOpenUrl(png) };
  } catch {
    const fallback = firstNonPsdUrl(input.previewUrl, input.thumbUrl);
    if (fallback) return { ok: true, canvasUrl: fallback };
    return { ok: false, error: PSD_NO_COMPOSITE_ZH };
  }
}
